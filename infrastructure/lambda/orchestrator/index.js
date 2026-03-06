const { Buffer } = require('buffer');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SQSClient, SendMessageCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const { LambdaClient, ListEventSourceMappingsCommand } = require("@aws-sdk/client-lambda");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// Import Milestone 2 components
const { estimateTokens, truncateToTokenLimit, formatTokenUsage } = require('./token-counter');
const { getPrompt } = require('./prompt-manager');
const { validateRequest, sanitizeAnalysisResponse } = require('./schema-validator');

// Import Milestone 3.1 components
const { preflightHandler } = require('./preflight-handler');

// Import Milestone 3.2 components
const { analyzeRunHandler } = require('./analyze-run-handler');
const { rewriteHandler } = require('./rewrite-handler');
const { applySuggestionHandler, getSuggestionHistoryHandler } = require('./apply-suggestion-handler');

// Import Phase 5 Async components
const { analyzeRunAsyncHandler } = require('./analyze-run-async-handler');
const { runStatusHandler } = require('./run-status-handler');

// Import Result Contract Lock components
const { analysisDetailsHandler, validateSessionToken } = require('./analysis-details-handler');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const sqsClient = new SQSClient({});
const secretsClient = new SecretsManagerClient({});
const lambdaClient = new LambdaClient({});

// Environment variables (accessed directly to avoid caching issues)
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;

// Helper function for structured logging
const log = (level, message, context = {}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "aivi-orchestrator",
    environment: getEnv('ENVIRONMENT'),
    message,
    ...context
  }));
};

const parseEventBody = (event) => {
  let rawBody = event?.body;
  if (typeof rawBody === 'string' && event?.isBase64Encoded) {
    try {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
    } catch (error) {
      throw new Error(`base64_decode_failed:${error.message}`);
    }
  }
  if (typeof rawBody === 'string') {
    let cleaned = rawBody.replace(/^\uFEFF/, '').replace(/^\xEF\xBB\xBF/, '');
    if (cleaned.includes('\x00')) {
      cleaned = cleaned.replace(/\x00/g, '');
    }
    if (cleaned.includes('\\"')) {
      cleaned = cleaned.replace(/\\"/g, '"');
    }
    return JSON.parse(cleaned);
  }
  if (typeof rawBody === 'object' && rawBody !== null) {
    return rawBody;
  }
  return null;
};

// Helper function to generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Get Mistral API key from Secrets Manager
const getMistralKey = async () => {
  try {
    const command = new GetSecretValueCommand({
      SecretId: getEnv('SECRET_NAME', 'AVI_MISTRAL_API_KEY')
    });
    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);
    const apiKey = secret.MISTRAL_API_KEY || secret.api_key || secret.apiKey;
    if (!apiKey) {
      log('ERROR', 'Mistral API key not found in secret', { available_keys: Object.keys(secret) });
      throw new Error('MISTRAL_API_KEY not found in secret');
    }
    return apiKey;
  } catch (error) {
    log('ERROR', 'Failed to retrieve Mistral API key', { error: error.message });
    throw error;
  }
};

// Store analysis input in S3
const storeInput = async (runId, input) => {
  const key = `runs/${runId}/input.json`;
  const command = new PutObjectCommand({
    Bucket: getEnv('ARTIFACTS_BUCKET'),
    Key: key,
    Body: JSON.stringify(input, null, 2),
    ContentType: 'application/json'
  });
  await s3Client.send(command);
  return key;
};

// Create run record in DynamoDB
const createRun = async (runId, input) => {
  const now = Date.now();
  const ttl = now + (30 * 24 * 60 * 60 * 1000); // 30 days TTL

  const command = new PutCommand({
    TableName: getEnv('RUNS_TABLE'),
    Item: {
      run_id: runId,
      site_id: input.site_id,
      post_id: input.post_id || null,
      status: 'running',
      created_at: now,
      updated_at: now,
      metadata: {
        content_type: input.content_type || 'post',
        word_count: input.content_html ? input.content_html.split(/\s+/).length : 0,
        enable_web_lookups: input.enable_web_lookups || false
      },
      ttl: Math.floor(ttl / 1000)
    }
  });

  await ddbDoc.send(command);
  return runId;
};

// Diagnostic endpoint for testing JSON parsing
const jsonValidateDiagnostic = async (event) => {
  const diagnostics = {
    ok: false,
    bodyType: typeof event.body,
    bodyLength: 0,
    isBase64Encoded: event.isBase64Encoded || false,
    contentType: event.headers?.['content-type'] || event.headers?.['Content-Type'] || 'unknown',
    parseAttempts: []
  };

  try {
    let rawBody = event.body;

    // Handle base64
    if (event.isBase64Encoded === true && typeof rawBody === 'string') {
      try {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
        diagnostics.parseAttempts.push({ step: 'base64_decode', success: true });
      } catch (e) {
        diagnostics.parseAttempts.push({ step: 'base64_decode', success: false, error: e.message });
      }
    }

    if (typeof rawBody === 'string') {
      diagnostics.bodyLength = rawBody.length;
      diagnostics.firstChars = rawBody.substring(0, 200).replace(/[\x00-\x1f]/g, '?');
      diagnostics.lastChars = rawBody.substring(Math.max(0, rawBody.length - 200)).replace(/[\x00-\x1f]/g, '?');
      diagnostics.firstCharCode = rawBody.charCodeAt(0);
      diagnostics.hasBOM = rawBody.charCodeAt(0) === 0xFEFF;
      diagnostics.hasNullBytes = rawBody.includes('\x00');
      diagnostics.hasDoubleEscape = rawBody.includes('\\"');

      try {
        const parsed = JSON.parse(rawBody);
        diagnostics.ok = true;
        diagnostics.parseAttempts.push({ step: 'direct_parse', success: true });
        diagnostics.parsedKeys = Object.keys(parsed);
        diagnostics.hasManifest = 'manifest' in parsed;
        diagnostics.hasRunMetadata = 'run_metadata' in parsed;
      } catch (parseError) {
        diagnostics.parseAttempts.push({
          step: 'direct_parse',
          success: false,
          error: parseError.message,
          position: parseError.message.match(/position (\d+)/)?.[1]
        });
      }
    } else if (typeof rawBody === 'object' && rawBody !== null) {
      diagnostics.ok = true;
      diagnostics.bodyType = 'object (pre-parsed)';
      diagnostics.parsedKeys = Object.keys(rawBody);
    }

    return {
      statusCode: diagnostics.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagnostics, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message,
        diagnostics
      })
    };
  }
};

const rawAnalysisHandler = async (event) => {
  const runId = event.pathParameters?.run_id || event.pathParameters?.runId;
  if (!runId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'missing_run_id' })
    };
  }
  const token = event.queryStringParameters?.token || event.headers?.['x-aivi-token'];
  try {
    const getRun = new GetCommand({
      TableName: getEnv('RUNS_TABLE'),
      Key: { run_id: runId }
    });
    const runResponse = await ddbDoc.send(getRun);
    const run = runResponse.Item || null;
    if (!run) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'not_found' })
      };
    }
    const tokenValidation = await validateSessionToken(token, runId, run.site_id);
    if (!tokenValidation.valid) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'unauthorized' })
      };
    }
    const aborted = ['failed', 'failed_schema', 'failed_too_long', 'aborted'].includes(run.status);
    if (aborted) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'aborted' })
      };
    }
    if (run.status !== 'success' && run.status !== 'success_partial') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'run_not_complete' })
      };
    }
    const currentContentHash = event.headers?.['x-aivi-content-hash'] || event.headers?.['X-Aivi-Content-Hash'] || event.queryStringParameters?.content_hash;
    if (run.content_hash && currentContentHash && run.content_hash !== currentContentHash) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'results_stale' })
      };
    }
    let bucket, key;
    const s3Uri = run.result_s3;
    if (!s3Uri) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'analysis_not_found' })
      };
    }
    if (typeof s3Uri === 'string' && s3Uri.startsWith('s3://')) {
      const parts = s3Uri.replace('s3://', '').split('/');
      bucket = parts[0];
      key = parts.slice(1).join('/');
    } else {
      bucket = getEnv('ARTIFACTS_BUCKET');
      key = s3Uri;
    }
    const obj = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await obj.Body.transformToString();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      parsed = null;
    }
    if (!parsed) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'invalid_analysis_data' })
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, run_id: runId, result: parsed })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'internal_error' })
    };
  }
};

const workerHealthHandler = async () => {
  const queueUrl = getEnv('TASKS_QUEUE_URL', 'https://sqs.eu-north-1.amazonaws.com/173471018175/aivi-tasks-queue-dev');
  const workerFunctionName = getEnv('WORKER_FUNCTION_NAME', 'aivi-analyzer-worker-dev');
  const checkedAt = new Date().toISOString();
  let queueAttributes = null;
  let mappingInfo = null;
  let ok = true;
  let error = null;

  try {
    const queueResponse = await sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateAgeOfOldestMessage',
        'QueueArn'
      ]
    }));
    queueAttributes = queueResponse.Attributes || {};
  } catch (err) {
    ok = false;
    error = err.message;
  }

  try {
    if (queueAttributes && queueAttributes.QueueArn) {
      const mappingResponse = await lambdaClient.send(new ListEventSourceMappingsCommand({
        EventSourceArn: queueAttributes.QueueArn,
        FunctionName: workerFunctionName
      }));
      const mapping = (mappingResponse.EventSourceMappings || [])[0] || null;
      mappingInfo = mapping ? {
        uuid: mapping.UUID,
        state: mapping.State,
        stateTransitionReason: mapping.StateTransitionReason || null,
        lastModified: mapping.LastModified || null
      } : {
        uuid: null,
        state: 'Missing',
        stateTransitionReason: null,
        lastModified: null
      };
      ok = ok && mappingInfo.state === 'Enabled';
    }
  } catch (err) {
    ok = false;
    error = error || err.message;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok,
      checked_at: checkedAt,
      worker_function: workerFunctionName,
      queue: {
        url: queueUrl,
        attributes: queueAttributes
      },
      mapping: mappingInfo,
      error
    })
  };
};

// Ping endpoint - health check
const pingHandler = async () => {
  log('INFO', 'Ping received');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ok: true,
      service: 'aivi-orchestrator',
      version: '1.0.0',
      environment: getEnv('ENVIRONMENT'),
      timestamp: new Date().toISOString(),
      features: {
        analysis: getEnv('ENABLE_ANALYSIS') === 'true'
      }
    })
  };
};

// Analyze endpoint - main analysis handler
const analyzeHandler = async (event) => {
  const startTime = Date.now();
  try {
    // Parse request body - handle both string and object formats
    let body;
    try {
      body = parseEventBody(event);
    } catch (parseError) {
      log('ERROR', 'Failed to parse request body', {
        bodyType: typeof event.body,
        bodyPreview: event.body?.substring?.(0, 100),
        error: parseError.message
      });
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'invalid_json',
          message: 'Request body must be valid JSON'
        })
      };
    }
    if (!body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'missing_body',
          message: 'Request body is required'
        })
      };
    }

    const { title, content_html, post_id, content_type, site_id, enable_web_lookups } = body;

    // Validate request
    const validation = validateRequest(body, ['content_html', 'site_id']);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Validation failed',
          details: validation.errors
        })
      };
    }

    // Check if analysis is enabled
    if (getEnv('ENABLE_ANALYSIS') !== 'true') {
      log('WARN', 'Analysis attempted but disabled', { site_id, post_id });
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Analysis temporarily disabled',
          message: 'The analysis service is currently disabled. Please try again later.'
        })
      };
    }

    // Generate run ID
    const runId = generateUUID();

    // Prepare input
    const input = {
      title: title || '',
      content_html,
      post_id: post_id || null,
      content_type: content_type || 'post',
      site_id,
      enable_web_lookups: enable_web_lookups || false,
      timestamp: new Date().toISOString()
    };

    // Store input and create run record
    await Promise.all([
      storeInput(runId, input),
      createRun(runId, { ...input, status: 'processing' })
    ]);

    log('INFO', 'Analysis started', { runId, site_id, post_id });

    // Check token limits
    const tokenCheck = estimateTokens(content_html);
    if (tokenCheck > 190000) { // Leave room for system message and response
      content_html = truncateToTokenLimit(content_html, 190000, 8192);
      log('WARN', 'Content truncated', {
        runId,
        originalTokens: tokenCheck,
        truncatedTokens: estimateTokens(content_html)
      });
    }

    // Get prompt template
    const promptInfo = await getPrompt('analysis', {
      title: title || 'Untitled',
      content: content_html,
      site_id,
      current_date: new Date().toISOString().split('T')[0]
    }, runId);

    const apiKey = await getMistralKey();
    const model = getEnv('MISTRAL_MODEL', 'mistral-large-latest');
    log('INFO', 'Using Mistral model', { model, runId });

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: promptInfo.content },
          { role: 'user', content: 'Please analyze the provided content and return a JSON response following the analyzer aggregator schema.' }
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mistral API error ${response.status}: ${errorText}`);
    }

    const responseJson = await response.json();

    // Parse the response
    let analysisResult;
    try {
      analysisResult = JSON.parse(responseJson.choices[0].message.content);
    } catch (parseError) {
      log('ERROR', 'Failed to parse Mistral response', {
        runId,
        error: parseError.message,
        rawResponse: responseJson.choices?.[0]?.message?.content?.substring(0, 500)
      });

      // Return error but don't fail completely
      analysisResult = {
        error: 'PARSE_ERROR',
        message: 'Failed to parse AI response',
        rawContent: responseJson.choices?.[0]?.message?.content
      };
    }

    const usage = responseJson.usage || {};
    const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;

    // Sanitize and validate the response
    const sanitizedResult = sanitizeAnalysisResponse({
      ...analysisResult,
      runId,
      timestamp: new Date().toISOString(),
      metadata: {
        model: model, // Use actual model variable, not hardcoded value
        tokens: formatTokenUsage(inputTokens, outputTokens),
        promptVersion: promptInfo.version,
        promptVariant: promptInfo.variant,
        processingTime: Date.now() - startTime
      }
    });

    // Update run status
    const updateCommand = new UpdateCommand({
      TableName: getEnv('RUNS_TABLE'),
      Key: { run_id: runId },
      UpdateExpression: 'SET #status = :status, #updated = :updated, #completed = :completed, #tokens = :tokens',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updated': 'updated_at',
        '#completed': 'completed_at',
        '#tokens': 'tokens_used'
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':updated': Date.now(),
        ':completed': Date.now(),
        ':tokens': inputTokens + outputTokens
      }
    });
    await ddbDoc.send(updateCommand);

    // Store result in S3
    const resultKey = `runs/${runId}/result.json`;
    const putCommand = new PutObjectCommand({
      Bucket: getEnv('ARTIFACTS_BUCKET'),
      Key: resultKey,
      Body: JSON.stringify(sanitizedResult),
      ContentType: 'application/json'
    });
    await s3Client.send(putCommand);

    const processingTime = Date.now() - startTime;
    log('INFO', 'Analysis completed', {
      runId,
      processingTime,
      inputTokens,
      outputTokens
    });

    // Return success response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        run_id: runId,
        processing_time_ms: processingTime,
        result: sanitizedResult
      })
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;

    log('ERROR', 'Analysis failed', {
      error: error.message,
      stack: error.stack,
      processingTime
    });

    // Return appropriate error response
    let statusCode = 500;
    let errorResponse = {
      ok: false,
      error: 'Internal server error',
      message: 'An error occurred during analysis'
    };

    if (error.message.includes('Rate limit')) {
      statusCode = 429;
      errorResponse = {
        ok: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retry_after: 60
      };
    } else if (error.message.includes('Unable to access Mistral API key') || error.message.includes('MISTRAL_API_KEY not found in secret')) {
      statusCode = 503;
      errorResponse = {
        ok: false,
        error: 'Service unavailable',
        message: 'Analysis service is temporarily unavailable'
      };
    }

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...(statusCode === 429 && { 'Retry-After': '60' })
      },
      body: JSON.stringify(errorResponse)
    };
  }
};

// Main handler
exports.handler = async (event, context) => {
  const startTime = Date.now();

  // Add request ID to logs
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    log('INFO', 'Request received', {
      requestId: context.awsRequestId,
      httpMethod: event.httpMethod || event.requestContext?.http?.method,
      path: event.path || event.requestContext?.http?.path
    });

    // Route based on HTTP method and path
    // For REST API Proxy, use event.resource to match patterns like /path/{param}
    const pathPattern = event.resource || event.path || event.requestContext?.http?.path;
    const route = event.routeKey || `${event.httpMethod || event.requestContext?.http?.method} ${pathPattern}`;

    let response;

    switch (route) {
      case 'GET /ping':
        response = await pingHandler();
        break;

      case 'POST /analyze':
        // Phase 5: Backward compatibility - /analyze now returns 202 (async)
        log('INFO', 'Legacy /analyze route called - using async handler');
        response = await analyzeRunAsyncHandler(event);
        break;

      case 'POST /aivi/v1/analyze/preflight':
        response = await preflightHandler(event);
        break;

      case 'POST /aivi/v1/analyze/run':
        // Phase 5: Use async handler (returns 202, enqueues to SQS)
        response = await analyzeRunAsyncHandler(event);
        break;

      case 'GET /aivi/v1/analyze/run/{run_id}':
        // Phase 5: Polling endpoint for run status
        response = await runStatusHandler(event);
        break;

      case 'GET /aivi/v1/analysis/{run_id}/details':
        // Result Contract Lock: On-demand check details endpoint
        response = await analysisDetailsHandler(event);
        break;
      case 'GET /aivi/v1/analysis/{run_id}/raw':
        response = await rawAnalysisHandler(event);
        break;

      case 'POST /aivi/v1/rewrite':
        response = await rewriteHandler(event);
        break;

      case 'POST /aivi/v1/apply_suggestion':
        response = await applySuggestionHandler(event);
        break;

      case 'GET /aivi/v1/suggestion/{suggestion_id}/history':
        response = await getSuggestionHistoryHandler(event);
        break;

      case 'POST /aivi/v1/diagnostic/json-validate':
        // Temporary diagnostic endpoint for testing JSON parsing
        response = await jsonValidateDiagnostic(event);
        break;

      case 'GET /aivi/v1/worker/health':
        response = await workerHealthHandler();
        break;

      default:
        response = {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Not found',
            message: `Route ${route} not found`
          })
        };
    }

    // Add response headers
    response.headers = {
      ...response.headers,
      'X-Request-ID': context.awsRequestId,
      'X-Response-Time': `${Date.now() - startTime}ms`
    };

    log('INFO', 'Request completed', {
      requestId: context.awsRequestId,
      statusCode: response.statusCode,
      responseTime: Date.now() - startTime
    });

    return response;

  } catch (error) {
    log('ERROR', 'Handler error', {
      requestId: context.awsRequestId,
      error: error.message,
      stack: error.stack
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': context.awsRequestId,
        'X-Response-Time': `${Date.now() - startTime}ms`
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      })
    };
  }
};
