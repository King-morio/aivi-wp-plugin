const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const sqsClient = new SQSClient({});
const secretsClient = new SecretsManagerClient({});

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

// Helper function to generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Get Anthropic API key from Secrets Manager
const getAnthropicKey = async () => {
  try {
    const command = new GetSecretValueCommand({
      SecretId: getEnv('SECRET_NAME')
    });
    const response = await secretsClient.send(command);
    return JSON.parse(response.SecretString).ANTHROPIC_API_KEY;
  } catch (error) {
    log('ERROR', 'Failed to retrieve Anthropic API key', { error: error.message });
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
    // Parse request body
    const body = JSON.parse(event.body);
    const { title, content_html, post_id, content_type, site_id, enable_web_lookups } = body;
    
    // Validate required fields
    if (!content_html || !site_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields: content_html, site_id'
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
      createRun(runId, input)
    ]);
    
    log('INFO', 'Analysis started', { runId, site_id, post_id });
    
    // TODO: In Milestone 2, we'll implement the actual analysis
    // For now, return a placeholder response
    const processingTime = Date.now() - startTime;
    
    // Update run status to completed (placeholder)
    const updateCommand = new UpdateCommand({
      TableName: getEnv('RUNS_TABLE'),
      Key: { run_id: runId },
      UpdateExpression: 'SET #status = :status, #updated = :updated, #completed = :completed',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updated': 'updated_at',
        '#completed': 'completed_at'
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':updated': Date.now(),
        ':completed': Date.now()
      }
    });
    await ddbDoc.send(updateCommand);
    
    // Store result in S3
    const resultKey = `runs/${runId}/result.json`;
    const result = {
      run_id: runId,
      ok: false,
      error: 'NOT_IMPLEMENTED',
      message: 'Analysis not yet implemented - coming in Milestone 2',
      processing_time_ms: processingTime
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: getEnv('ARTIFACTS_BUCKET'),
      Key: resultKey,
      Body: JSON.stringify(result, null, 2),
      ContentType: 'application/json'
    }));
    
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'NOT_IMPLEMENTED',
        message: 'Analysis endpoint not yet implemented. Coming in Milestone 2.',
        run_id: runId
      })
    };
    
  } catch (error) {
    log('ERROR', 'Analysis failed', { error: error.message, stack: error.stack });
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        message: 'An error occurred during analysis'
      })
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
    const route = event.routeKey || `${event.httpMethod} ${event.path}`;
    
    let response;
    
    switch (route) {
      case 'GET /ping':
        response = await pingHandler();
        break;
        
      case 'POST /analyze':
        response = await analyzeHandler(event);
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
