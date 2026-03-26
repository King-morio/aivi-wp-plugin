const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require('uuid');
const { jsonrepair } = require('jsonrepair');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const path = require('path');
const fs = require('fs');

// Import existing components
const { getPrompt, buildCheckPromptRegistry } = require('./prompt-manager');
const { validateAnalyzerResponse, sanitizeAnalysisResponse } = require('./schema-validator');
const { scoreAnalysisResults } = require('./scoring-engine');
const { performDeterministicChecks } = require('./preflight-handler');
const { emitAnchorVerificationStats, emitAnchorGateFailed } = require('./telemetry-emitter');
const { serializeForSidebar, buildHighlightedHtml } = require('./analysis-serializer');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const secretsClient = new SecretsManagerClient({});

// Environment variables
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;
const getEnvFloat = (key) => {
  const value = Number.parseFloat(getEnv(key));
  return Number.isFinite(value) ? value : null;
};

const INTRO_DETERMINISTIC_CHECK_IDS = new Set([
  'intro_wordcount',
  'intro_readability',
  'intro_schema_suggestion'
]);
const AI_CHECK_TYPE_FALLBACK = new Set(['semantic']);
let cachedRuntimeContract = null;

const resolveDefinitionsPath = () => {
  const candidates = [
    path.join(__dirname, 'shared', 'schemas', 'checks-definitions-v1.json'),
    path.join(__dirname, 'schemas', 'checks-definitions-v1.json'),
    path.join(__dirname, '..', 'shared', 'schemas', 'checks-definitions-v1.json')
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || candidates[0];
};

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(String(raw).replace(/^\uFEFF/, ''));
};

const resolveRuntimeContractPath = () => {
  const candidates = [
    path.join(__dirname, 'shared', 'schemas', 'check-runtime-contract-v1.json'),
    path.join(__dirname, 'schemas', 'check-runtime-contract-v1.json'),
    path.join(__dirname, '..', 'shared', 'schemas', 'check-runtime-contract-v1.json')
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || null;
};

const loadRuntimeContract = () => {
  if (cachedRuntimeContract) return cachedRuntimeContract;
  const contractPath = resolveRuntimeContractPath();
  if (!contractPath) {
    cachedRuntimeContract = { checks: {} };
    return cachedRuntimeContract;
  }
  try {
    cachedRuntimeContract = readJsonFile(contractPath);
  } catch (error) {
    console.error('Failed to load runtime contract:', error.message);
    cachedRuntimeContract = { checks: {} };
  }
  return cachedRuntimeContract;
};

const normalizeCheckType = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const getRuntimeContractEntry = (checkId, runtimeContract = loadRuntimeContract()) => {
  if (!runtimeContract || typeof runtimeContract !== 'object') return null;
  const checks = runtimeContract.checks;
  if (!checks || typeof checks !== 'object') return null;
  const key = typeof checkId === 'string' ? checkId.trim() : '';
  if (!key || !Object.prototype.hasOwnProperty.call(checks, key)) {
    return null;
  }
  const entry = checks[key];
  return entry && typeof entry === 'object' ? entry : null;
};

const getAnalysisEngineForCheck = (checkId, checkDef, runtimeContract = loadRuntimeContract()) => {
  const contractEntry = getRuntimeContractEntry(checkId, runtimeContract);
  if (contractEntry && typeof contractEntry.analysis_engine === 'string') {
    return contractEntry.analysis_engine.toLowerCase().trim();
  }
  const fallbackType = checkDef && typeof checkDef.type === 'string'
    ? normalizeCheckType(checkDef.type)
    : '';
  return AI_CHECK_TYPE_FALLBACK.has(fallbackType) ? 'ai' : 'deterministic';
};

const getAiEligibleCheckIds = (definitions, runtimeContract = loadRuntimeContract()) => {
  const ids = new Set();
  if (!definitions || typeof definitions !== 'object' || !definitions.categories) {
    return ids;
  }
  Object.values(definitions.categories).forEach((category) => {
    if (!category || !category.checks) return;
    Object.entries(category.checks).forEach(([checkId, checkDef]) => {
      if (getAnalysisEngineForCheck(checkId, checkDef, runtimeContract) === 'ai') {
        ids.add(checkId);
      }
    });
  });
  return ids;
};

const getCheckDefinitionById = (definitions, targetCheckId) => {
  if (!definitions || !definitions.categories || !targetCheckId) return null;
  const normalizedTarget = String(targetCheckId).trim();
  if (!normalizedTarget) return null;
  const categories = definitions.categories;
  for (const category of Object.values(categories)) {
    if (!category || !category.checks) continue;
    if (Object.prototype.hasOwnProperty.call(category.checks, normalizedTarget)) {
      return category.checks[normalizedTarget] || null;
    }
  }
  return null;
};

const buildMissingAiCoverageCheck = (checkId, definitions) => {
  const checkDef = getCheckDefinitionById(definitions, checkId) || {};
  const checkName = typeof checkDef.name === 'string' && checkDef.name.trim()
    ? checkDef.name.trim()
    : checkId;

  return {
    verdict: 'fail',
    confidence: 0.01,
    explanation: `AI coverage gap: analyzer did not complete "${checkName}" in this run.`,
    highlights: [],
    suggestions: [],
    provenance: 'synthetic',
    synthetic_generated: true,
    synthetic_reason: 'missing_ai_checks',
    non_inline: true,
    non_inline_reason: 'missing_ai_checks',
    id: checkDef.id || checkId,
    name: checkName,
    type: checkDef.type || 'semantic'
  };
};

const injectMissingAiCoverageChecks = (analysisResult, definitions, options = {}) => {
  const result = analysisResult && typeof analysisResult === 'object'
    ? analysisResult
    : {};
  const checks = result.checks && typeof result.checks === 'object'
    ? { ...result.checks }
    : {};
  const runtimeContract = options.runtimeContract || loadRuntimeContract();
  const excludedCheckIds = options.excludedCheckIds instanceof Set
    ? options.excludedCheckIds
    : new Set();
  const aiEligibleCheckIds = Array.from(getAiEligibleCheckIds(definitions, runtimeContract))
    .filter((checkId) => !excludedCheckIds.has(checkId));
  const missingCheckIds = aiEligibleCheckIds.filter(
    (checkId) => !Object.prototype.hasOwnProperty.call(checks, checkId)
  );

  missingCheckIds.forEach((checkId) => {
    checks[checkId] = buildMissingAiCoverageCheck(checkId, definitions);
  });

  const partialContext = {
    ...(result.partial_context && typeof result.partial_context === 'object' ? result.partial_context : {}),
    expected_ai_checks: aiEligibleCheckIds.length,
    returned_ai_checks: aiEligibleCheckIds.length - missingCheckIds.length,
    missing_ai_checks: missingCheckIds.length,
    missing_ai_check_ids: missingCheckIds
  };

  return {
    ...result,
    checks,
    partial_context: partialContext,
    audit: {
      ...(result.audit || {}),
      partial_context: partialContext
    }
  };
};

const parseEventBody = (event) => {
  let rawBody = event?.body;
  if (typeof rawBody === 'string' && event?.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
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

const getMistralKey = async () => {
  const command = new GetSecretValueCommand({
    SecretId: getEnv('SECRET_NAME', 'AVI_MISTRAL_API_KEY')
  });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  const apiKey = secret.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not found in secret');
  }
  return apiKey;
};

/**
 * Handles the analysis run endpoint - performs AI analysis on manifest
 */
async function analyzeRunHandler(event) {
  const startTime = Date.now();
  const runId = uuidv4();
  let isTestMode = false;

  try {
    // Parse request body
    let body;
    try {
      body = parseEventBody(event);
    } catch (parseError) {
      console.log('Failed to parse request body:', parseError.message);
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

    const {
      run_metadata,
      manifest,
      checks_list,
      prompt_version,
      site_url
    } = body;
    const introFocusEnabled = String(getEnv('INTRO_FOCUS_FACTUALITY_ENABLED', 'true')).toLowerCase() === 'true';

    if (!manifest || !run_metadata) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing required fields',
          message: 'manifest and run_metadata are required'
        })
      };
    }

    console.log('Manifest keys:', Object.keys(manifest));
    if (manifest.block_map) {
        console.log('Block map length:', manifest.block_map.length);
        if (manifest.block_map.length > 0) {
            console.log('Block 0:', JSON.stringify(manifest.block_map[0]));
        }
    } else {
        console.log('Block map MISSING');
    }

    // Check for test mode
    isTestMode = body.test_mode === true || getEnv('TEST_MODE') === 'true';

    if (isTestMode) {
      console.log('Test mode enabled - returning mock response');

      const mockResponse = {
        run_id: runId,
        classification: {
          primary_type: "other",
          confidence: 0.95
        },
        checks: {
          single_h1: {
            verdict: "pass",
            confidence: 1.0,
            explanation: "Test mode: Content has exactly one H1 tag.",
            provenance: "deterministic",
            highlights: [],
            suggestions: []
          },
          metadata_checks: {
            verdict: "partial",
            confidence: 1.0,
            explanation: "Test mode: Some metadata elements present but missing description and canonical.",
            provenance: "deterministic",
            highlights: [],
            suggestions: [
              {
                id: "add_meta_description",
                text: "Add a meta description (150-160 characters) summarizing the content.",
                confidence: 0.95
              }
            ]
          },
          accessibility_basics: {
            verdict: "pass",
            confidence: 1.0,
            explanation: "Test mode: No images present, alt text requirements satisfied.",
            provenance: "deterministic",
            highlights: [],
            suggestions: []
          }
        },
        highlights: [],
        schema_suggestions: {},
        audit: {
          prompt_version: prompt_version || "v1",
          model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
          tokens_used: 0,
          test_mode: true
        }
      };

      // Get deterministic checks for test mode
      const deterministicChecks = await performDeterministicChecks(manifest, run_metadata, {
        enableWebLookups: body.enable_web_lookups,
        enableIntroFocusFactuality: introFocusEnabled,
        contentHtml: manifest?.content_html || ''
      });

      // Merge deterministic checks with mock response
      const mockResponseWithChecks = {
        ...mockResponse,
        checks: {
          ...mockResponse.checks,
          ...deterministicChecks
        }
      };

      // Normalize highlights for test mode
      const normalizedMockResponse = normalizeHighlightsWithManifest(mockResponseWithChecks, manifest);

      // Apply scoring to mock response
      const scoredMockResponse = scoreAnalysisResults(normalizedMockResponse, run_metadata.content_type || 'article');

      // Update run with mock results
      if (!isTestMode) {
        await updateRunWithResults(runId, scoredMockResponse, { input_tokens: 0, output_tokens: 0 });
      }

      const { analysis_summary } = serializeForSidebar(scoredMockResponse, runId);
      const overlayContent = buildHighlightedHtml(manifest, scoredMockResponse);

      const processingTime = Date.now() - startTime;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          run_id: runId,
          result: scoredMockResponse,
          analysis_summary: analysis_summary,
          overlay_content: overlayContent,
          processing_time_ms: processingTime,
          metadata: {
            model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
            tokens_used: 0,
            prompt_version: prompt_version || 'v1',
            test_mode: true
          }
        })
      };
    }

    // Initialize run record
    if (!isTestMode) {
      await initializeRun(runId, run_metadata, manifest);
    }

    // Store manifest to S3
    if (!isTestMode) {
      await storeManifest(runId, manifest);
    }

    const checkDefinitions = require(resolveDefinitionsPath());
    const runtimeContract = loadRuntimeContract();
    const deterministicCheckIds = getDeterministicCheckIds(checkDefinitions, runtimeContract);

    const deterministicChecks = await performDeterministicChecks(manifest, run_metadata, {
      enableWebLookups: body.enable_web_lookups,
      enableIntroFocusFactuality: introFocusEnabled,
      contentHtml: manifest?.content_html || ''
    });

    // Perform AI analysis
    const analysisResult = await performAnalysis(
      manifest,
      checks_list,
      prompt_version,
      site_url,
      runId,
      checkDefinitions,
      runtimeContract
    );
    const normalizedResult = normalizeHighlightsWithManifest(analysisResult, manifest);
    const filteredResult = stripChecksById(normalizedResult, deterministicCheckIds);
    const aiCoverageResult = injectMissingAiCoverageChecks(filteredResult, checkDefinitions, {
      runtimeContract,
      excludedCheckIds: new Set([...deterministicCheckIds, ...INTRO_DETERMINISTIC_CHECK_IDS])
    });
    if (normalizedResult.anchor_verification) {
      emitAnchorVerificationStats(runId, normalizedResult.anchor_verification, {
        prompt_version: analysisResult.audit?.prompt_version || prompt_version || 'latest',
        prompt_variant: analysisResult.audit?.prompt_variant ?? null,
        prompt_source: analysisResult.audit?.prompt_source || null
      });
      const minAnchoredRate = getEnvFloat('ANCHOR_MIN_ANCHORED_RATE');
      const maxFailedRate = getEnvFloat('ANCHOR_MAX_FAILED_RATE');
      const maxAbstentionRate = getEnvFloat('ANCHOR_MAX_ABSTENTION_RATE');
      const gatesFailed = [];
      if (minAnchoredRate !== null && normalizedResult.anchor_verification.anchored_rate < minAnchoredRate) {
        gatesFailed.push(`anchored_rate<${minAnchoredRate}`);
      }
      if (maxFailedRate !== null && normalizedResult.anchor_verification.failed_rate > maxFailedRate) {
        gatesFailed.push(`failed_rate>${maxFailedRate}`);
      }
      if (maxAbstentionRate !== null && normalizedResult.anchor_verification.abstention_rate > maxAbstentionRate) {
        gatesFailed.push(`abstention_rate>${maxAbstentionRate}`);
      }
      if (gatesFailed.length > 0) {
        emitAnchorGateFailed(runId, {
          anchored_rate: normalizedResult.anchor_verification.anchored_rate,
          failed_rate: normalizedResult.anchor_verification.failed_rate,
          abstention_rate: normalizedResult.anchor_verification.abstention_rate,
          gates_failed: gatesFailed,
          thresholds: {
            anchored_rate_min: minAnchoredRate,
            failed_rate_max: maxFailedRate,
            abstention_rate_max: maxAbstentionRate
          }
        }, {
          prompt_version: analysisResult.audit?.prompt_version || prompt_version || 'latest',
          prompt_variant: analysisResult.audit?.prompt_variant ?? null,
          prompt_source: analysisResult.audit?.prompt_source || null
        });
      }
    }

    // Get deterministic checks from preflight
    // Merge deterministic checks with AI analysis results
    let mergedResults = mergeDeterministicExplanations(
      aiCoverageResult,
      normalizedResult,
      deterministicChecks,
      deterministicCheckIds
    );
    mergedResults = mergeIntroFocusChecks(mergedResults, normalizedResult, deterministicChecks, manifest, introFocusEnabled);

    // Return the merged result
    const validatedResult = mergedResults;

    // Apply scoring to the merged result
    const scoredResult = scoreAnalysisResults(validatedResult, run_metadata.content_type || 'article');

    // Update run with results
    if (!isTestMode) {
      await updateRunWithResults(runId, scoredResult, analysisResult.usage);
    }

    // Build sidebar payload using serializer (re-using logic to ensure consistency)
    const { analysis_summary } = serializeForSidebar(scoredResult, runId);

    // Build overlay content with pre-highlighted HTML
    const overlayContent = buildHighlightedHtml(manifest, scoredResult);

    const processingTime = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        run_id: runId,
        result: scoredResult,
        analysis_summary: analysis_summary, // Include for sidebar convenience
        overlay_content: overlayContent,    // NEW: Include for overlay editor
        processing_time_ms: processingTime,
        metadata: {
          model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
          tokens_used: analysisResult.usage?.input_tokens + analysisResult.usage?.output_tokens || 0,
          prompt_version: prompt_version || 'latest'
        }
      })
    };

  } catch (error) {
    console.error('Analysis run error:', error);

    // Update run with error
    try {
      if (!isTestMode) {
        await updateRunWithError(runId, error);
      }
    } catch (updateError) {
      console.error('Failed to update run with error:', updateError);
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'analysis_failed',
        message: error.message,
        run_id: runId
      })
    };
  }
}

/**
 * Initializes a run record in DynamoDB
 */
async function initializeRun(runId, metadata, manifest) {
  const command = new PutCommand({
    TableName: getEnv('RUNS_TABLE'),
    Item: {
      run_id: runId,
      site_id: metadata.site_id,
      post_id: metadata.post_id || 0,
      user_id: metadata.user_id || 'anonymous',
      status: 'running',
      created_at: Date.now(),
      updated_at: Date.now(),
      manifest_hash: hashManifest(manifest),
      metadata: metadata
    }
  });

  await ddbDoc.send(command);
}

/**
 * Stores manifest to S3
 */
async function storeManifest(runId, manifest) {
  const key = `runs/${runId}/manifest.json`;

  const command = new PutObjectCommand({
    Bucket: getEnv('ARTIFACTS_BUCKET'),
    Key: key,
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256'
  });

  await s3Client.send(command);
  console.log(`Manifest stored to S3: ${key}`);
}

/**
 * Performs AI analysis
 */
async function performAnalysis(
  manifest,
  checksList,
  promptVersion,
  siteUrl,
  runId,
  definitionsOverride = null,
  runtimeContractOverride = null
) {
  // Get the analysis prompt
  const promptOptions = promptVersion ? { versionOverride: promptVersion } : {};
  const promptInfo = await getPrompt('analyzer', {}, runId || null, promptOptions);

  // Get check definitions
  const checkDefinitions = definitionsOverride || require(resolveDefinitionsPath());
  const runtimeContract = runtimeContractOverride || loadRuntimeContract();

  // Build the analysis request
  const analysisPrompt = await buildAnalysisPrompt(
    manifest,
    checksList,
    siteUrl,
    checkDefinitions,
    runtimeContract
  );

  const apiKey = await getMistralKey();
  const model = getEnv('MISTRAL_MODEL', 'mistral-large-latest');

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
        { role: 'user', content: analysisPrompt }
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
  const rawContent = responseJson?.choices?.[0]?.message?.content ?? responseJson?.choices?.[0]?.text ?? '';
  let responseText = rawContent;
  if (responseText && typeof responseText !== 'string') {
    responseText = JSON.stringify(responseText);
  }

  // Parse response
  let analysisResult;
  try {
    if (!responseText && responseJson && typeof responseJson === 'object' && !Array.isArray(responseJson) && responseJson.checks) {
      analysisResult = responseJson;
    } else {
      // Log raw response for debugging
      console.log('Raw AI response length:', responseText.length);
      console.log('Raw AI response preview:', responseText.substring(0, 500));

      // Handle markdown code blocks - more robust extraction
      // Use greedy match to get the last closing ```
      const jsonMatch = responseText.match(/```json\s*([\s\S]*)```\s*$/);
      if (jsonMatch) {
        responseText = jsonMatch[1];
        console.log('Extracted JSON from markdown block, length:', responseText.length);
      } else if (responseText.includes('```')) {
        // Fallback: strip all code fences
        responseText = responseText.replace(/```\w*\s*/g, '').replace(/```\s*/g, '');
      }

      // Trim whitespace
      responseText = responseText.trim();

      // Try to fix common JSON issues
      responseText = responseText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

      console.log('Cleaned JSON preview:', responseText.substring(0, 200));

      // Try parsing, with jsonrepair as fallback
      try {
        analysisResult = JSON.parse(responseText);
      } catch (initialParseError) {
        console.log('Initial JSON.parse failed, attempting repair:', initialParseError.message);
        const repairedJson = jsonrepair(responseText);
        analysisResult = JSON.parse(repairedJson);
        console.log('Successfully parsed after JSON repair');
      }
    }
  } catch (parseError) {
    console.error('Failed to parse analysis response:', parseError);
    console.error('Response text (first 1000 chars):', responseText.substring(0, 1000));
    throw new Error('Invalid JSON response from AI analysis');
  }

  if (!analysisResult || typeof analysisResult !== 'object' || Array.isArray(analysisResult)) {
    throw new Error('Invalid JSON response from AI analysis');
  }

  // Add usage info
  analysisResult.usage = {
    input_tokens: responseJson?.usage?.prompt_tokens || 0,
    output_tokens: responseJson?.usage?.completion_tokens || 0
  };
  analysisResult.audit = {
    ...(analysisResult.audit || {}),
    prompt_version: promptInfo.version,
    prompt_variant: promptInfo.variant,
    prompt_source: promptInfo.source,
    prompt_key: promptInfo.key,
    prompt_length: promptInfo.length
  };

  return analysisResult;
}

function normalizeHighlightsWithManifest(result, manifest) {
  if (!result || !manifest || !Array.isArray(manifest.block_map)) {
    return result;
  }

  const normalizeText = (value) => {
    if (typeof value !== 'string') return '';
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const hasEllipsis = (value) => {
    if (typeof value !== 'string') return false;
    return /(\.\s*\.\s*\.)|…/.test(value);
  };

  const matchWithEllipsis = (blockText, snippet, preferredIndex) => {
    if (!snippet || !blockText) return null;

    // 1. First try exact match (handles true ellipsis in content)
    const exactIdx = findBestMatch(blockText, snippet, preferredIndex);
    if (exactIdx !== null) {
      return { start: exactIdx, end: exactIdx + snippet.length, type: 'exact' };
    }

    // 2. Split on ellipsis patterns and match segments
    const segments = snippet.split(/\s*(?:\.{2,}|…)\s*/).filter(s => s.trim().length >= 5);

    if (segments.length === 0) {
      return null;
    }

    // Single segment fallback (e.g. "Start of text..." or "...end of text")
    if (segments.length === 1) {
      const segment = segments[0].trim();
      // Require longer match for single segment to avoid false positives
      if (segment.length < 10) return null;

      const idx = findBestMatch(blockText, segment, preferredIndex);
      if (idx !== null) {
        return {
          start: idx,
          end: idx + segment.length,
          type: 'segment_match_single',
          segments_matched: 1
        };
      }
      return null;
    }

    // 3. Find first and last segment positions
    const firstSegment = segments[0].trim();
    const lastSegment = segments[segments.length - 1].trim();
    const firstIdx = findBestMatch(blockText, firstSegment, preferredIndex);

    if (firstIdx === null) {
      return null;
    }

    // Search for last segment after the first segment
    const searchStartPos = firstIdx + firstSegment.length;
    const lastIdx = findBestMatch(blockText.slice(searchStartPos), lastSegment, 0);

    if (lastIdx === null) {
      return null;
    }

    const absoluteLastIdx = searchStartPos + lastIdx;

    // 4. Return span from start of first to end of last
    return {
      start: firstIdx,
      end: absoluteLastIdx + lastSegment.length,
      type: 'segment_match',
      segments_matched: segments.length
    };
  };

  const findBestMatch = (text, needle, preferredIndex) => {
    if (!needle) return null;
    let idx = text.indexOf(needle);
    if (idx === -1) return null;
    if (Number.isFinite(preferredIndex)) {
      const clampedPreferred = Math.max(0, Math.min(preferredIndex, text.length - needle.length));
      if (text.slice(clampedPreferred, clampedPreferred + needle.length) === needle) {
        return clampedPreferred;
      }
    }
    let bestIndex = null;
    let bestDistance = null;
    while (idx !== -1) {
      if (bestIndex === null) {
        bestIndex = idx;
        bestDistance = Number.isFinite(preferredIndex) ? Math.abs(idx - preferredIndex) : 0;
      } else if (Number.isFinite(preferredIndex)) {
        const distance = Math.abs(idx - preferredIndex);
        if (distance < bestDistance) {
          bestIndex = idx;
          bestDistance = distance;
        }
      }
      idx = text.indexOf(needle, idx + 1);
    }
    return bestIndex;
  };

  const getQuoteSelector = (highlight) => {
    if (!highlight || typeof highlight !== 'object') return null;
    const direct = {
      exact: typeof highlight.exact === 'string' ? highlight.exact : null,
      prefix: typeof highlight.prefix === 'string' ? highlight.prefix : null,
      suffix: typeof highlight.suffix === 'string' ? highlight.suffix : null
    };
    if (direct.exact || direct.prefix || direct.suffix) return direct;
    const selector = highlight.text_quote_selector || highlight.text_quote || highlight.quote || highlight.selector || highlight.textQuoteSelector;
    if (selector && typeof selector === 'object') {
      return {
        exact: typeof selector.exact === 'string' ? selector.exact : null,
        prefix: typeof selector.prefix === 'string' ? selector.prefix : null,
        suffix: typeof selector.suffix === 'string' ? selector.suffix : null
      };
    }
    return null;
  };

  const matchWithQuote = (blockText, exact, prefix, suffix, preferredIndex) => {
    if (!blockText || !exact) return null;
    let idx = blockText.indexOf(exact);
    if (idx === -1) return null;
    const matches = [];
    while (idx !== -1) {
      let ok = true;
      if (prefix) {
        const prefixStart = Math.max(0, idx - prefix.length);
        const prefixSlice = blockText.slice(prefixStart, idx);
        if (!prefixSlice.endsWith(prefix)) {
          ok = false;
        }
      }
      if (ok && suffix) {
        const suffixEnd = Math.min(blockText.length, idx + exact.length + suffix.length);
        const suffixSlice = blockText.slice(idx + exact.length, suffixEnd);
        if (!suffixSlice.startsWith(suffix)) {
          ok = false;
        }
      }
      if (ok) {
        matches.push(idx);
      }
      idx = blockText.indexOf(exact, idx + 1);
    }
    if (!matches.length) return null;
    let chosen = matches[0];
    if (Number.isFinite(preferredIndex)) {
      let bestDistance = Math.abs(matches[0] - preferredIndex);
      for (let i = 1; i < matches.length; i += 1) {
        const distance = Math.abs(matches[i] - preferredIndex);
        if (distance < bestDistance) {
          bestDistance = distance;
          chosen = matches[i];
        }
      }
    }
    return { start: chosen, end: chosen + exact.length };
  };

  const resolveOffsets = (blockText, highlight) => {
    const normalizedBlockText = normalizeText(blockText);
    if (!normalizedBlockText) return null;
    const preferredIndex = Number.isFinite(highlight?.start) ? highlight.start : null;
    const highlightText = normalizeText(highlight?.text);
    if (highlightText) {
      const idx = findBestMatch(normalizedBlockText, highlightText, preferredIndex);
      if (idx !== null) {
        return { start: idx, end: idx + highlightText.length };
      }
    }
    const snippetText = normalizeText(highlight?.snippet);
    if (snippetText) {
      const idx = findBestMatch(normalizedBlockText, snippetText, preferredIndex);
      if (idx !== null) {
        return { start: idx, end: idx + snippetText.length };
      }
    }
    const quoteSelector = getQuoteSelector(highlight);
    if (quoteSelector) {
      const exact = normalizeText(quoteSelector.exact);
      const prefix = normalizeText(quoteSelector.prefix);
      const suffix = normalizeText(quoteSelector.suffix);
      if (exact) {
        const quoteMatch = matchWithQuote(normalizedBlockText, exact, prefix || null, suffix || null, preferredIndex);
        if (quoteMatch) {
          return quoteMatch;
        }
      }
    }
    if (Number.isFinite(highlight?.start) && Number.isFinite(highlight?.end)) {
      const start = highlight.start;
      const end = highlight.end;
      if (start >= 0 && end > start && end <= normalizedBlockText.length) {
        const slice = normalizedBlockText.slice(start, end);
        if (highlightText && slice === highlightText) {
          return { start, end };
        }
        if (snippetText && slice === snippetText) {
          return { start, end };
        }
      }
    }
    // ELLIPSIS FIX: Try segment matching for ellipsis snippets as last resort
    const textToMatch = highlightText || snippetText;
    if (textToMatch && hasEllipsis(textToMatch)) {
      const ellipsisMatch = matchWithEllipsis(normalizedBlockText, textToMatch, preferredIndex);
      if (ellipsisMatch) {
        return { start: ellipsisMatch.start, end: ellipsisMatch.end };
      }
    }
    return null;
  };

  const signatureMap = new Map();
  const nodeRefMap = new Map();
  for (const block of manifest.block_map) {
    if (!block) {
      continue;
    }
    if (block.signature) {
      signatureMap.set(block.signature, block);
    }
    if (block.node_ref) {
      nodeRefMap.set(block.node_ref, block);
    }
  }

  const normalizeHighlight = (highlight) => {
    if (!highlight) {
      return { status: 'failed', failure_reason: 'missing_candidate', candidate: highlight };
    }
    const signature = typeof highlight.signature === 'string' ? highlight.signature : null;
    const nodeRef = typeof highlight.node_ref === 'string' ? highlight.node_ref : null;
    const rawSnippet = typeof highlight.snippet === 'string'
      ? highlight.snippet
      : (typeof highlight.text === 'string' ? highlight.text : '');
    // ELLIPSIS FIX: Don't reject ellipsis snippets outright - try to match them
    // The matchWithEllipsis function will handle segment matching if exact match fails
    let block = null;
    if (nodeRef) {
      // Logic for nodeRef if needed, but simplified
    }

    if (signature) {
      block = signatureMap.get(signature) || null;
      if (!block) {
        return { status: 'failed', failure_reason: 'signature_mismatch', candidate: highlight };
      }
    } else if (nodeRef && nodeRefMap.has(nodeRef)) {
      block = nodeRefMap.get(nodeRef);
    } else if (!signature && !nodeRef) {
      return { status: 'failed', failure_reason: 'missing_anchor', candidate: highlight };
    } else if (nodeRef && !nodeRefMap.has(nodeRef)) {
      return { status: 'failed', failure_reason: 'node_ref_mismatch', candidate: highlight };
    }
    if (!block) {
      return { status: 'failed', failure_reason: 'block_not_found', candidate: highlight };
    }
    const blockText = block.text || block.text_content || '';
    const baseHighlight = rawSnippet
      ? highlight
      : { ...highlight, snippet: blockText, text: blockText };
    if (!rawSnippet && !blockText) {
      return { status: 'failed', failure_reason: 'missing_snippet', candidate: highlight };
    }

    const offsets = resolveOffsets(blockText, baseHighlight);
    if (!offsets && rawSnippet) {
      return { status: 'failed', failure_reason: 'offset_resolution_failed', candidate: highlight };
    }
    const normalizedBlockText = normalizeText(blockText);
    if (!normalizedBlockText) {
      return { status: 'failed', failure_reason: 'offset_resolution_failed', candidate: highlight };
    }
    const resolvedOffsets = offsets || { start: 0, end: normalizedBlockText.length };
    const exactSlice = normalizedBlockText.slice(resolvedOffsets.start, resolvedOffsets.end);
    const contextWindow = 40;
    const contextStart = Math.max(0, resolvedOffsets.start - contextWindow);
    const contextEnd = Math.min(normalizedBlockText.length, resolvedOffsets.end + contextWindow);
    const context = normalizedBlockText.slice(contextStart, contextEnd);
    const normalizedHighlight = {
      ...highlight,
      node_ref: block.node_ref || highlight.node_ref,
      signature: block.signature || signature || highlight.signature || null,
      start: resolvedOffsets.start,
      end: resolvedOffsets.end,
      text: exactSlice || rawSnippet,
      snippet: exactSlice || rawSnippet,
      context
    };
    const recalculated = normalizedHighlight.start !== highlight.start ||
      normalizedHighlight.end !== highlight.end ||
      normalizedHighlight.node_ref !== highlight.node_ref ||
      normalizedHighlight.signature !== highlight.signature;
    return {
      status: 'success',
      highlight: {
        ...normalizedHighlight,
        server_recalculated: recalculated,
        anchor_fallback: offsets ? null : 'block'
      }
    };
  };

  const checks = result.checks || {};
  const normalizedChecks = {};
  const anchorStats = {
    candidates_total: 0,
    anchored_total: 0,
    failed_total: 0,
    failure_reasons: {},
    checks_with_candidates: 0,
    checks_with_anchored: 0,
    checks_with_failed: 0,
    checks_abstained: 0,
    anchored_rate: 0,
    failed_rate: 0,
    abstention_rate: 0
  };
  Object.entries(checks).forEach(([checkId, checkData]) => {
    if (!checkData) {
      normalizedChecks[checkId] = checkData;
      return;
    }
    const isDeterministic = checkData.provenance === 'deterministic';
    const sourceHighlights = Array.isArray(checkData.candidate_highlights)
      ? checkData.candidate_highlights
      : checkData.highlights;
    if (!Array.isArray(sourceHighlights)) {
      if (!isDeterministic) {
        const explanation = typeof checkData.explanation === 'string' ? checkData.explanation.trim() : '';
        normalizedChecks[checkId] = {
          ...checkData,
          highlights: [],
          failed_candidates: [],
          cannot_anchor: true,
          non_inline: true,
          non_inline_reason: 'missing_candidates',
          explanation: explanation
            ? `${explanation} (Highlight evidence could not be anchored to specific text.)`
            : 'Evidence could not be anchored.'
        };
        return;
      }
      normalizedChecks[checkId] = checkData;
      return;
    }
    if (!isDeterministic && sourceHighlights.length === 0) {
      const explanation = typeof checkData.explanation === 'string' ? checkData.explanation.trim() : '';
      normalizedChecks[checkId] = {
        ...checkData,
        highlights: [],
        failed_candidates: [],
        cannot_anchor: true,
        non_inline: true,
        non_inline_reason: 'no_candidates',
        explanation: explanation
          ? `${explanation} (Highlight evidence could not be anchored to specific text.)`
          : 'Evidence could not be anchored.'
      };
      return;
    }
    if (sourceHighlights.length > 0) {
      anchorStats.checks_with_candidates += 1;
    }
    anchorStats.candidates_total += sourceHighlights.length;
    const anchoredHighlights = [];
    const failedCandidates = [];
    sourceHighlights.forEach((candidate) => {
      const normalized = normalizeHighlight(candidate);
      if (normalized.status === 'success') {
        anchoredHighlights.push(normalized.highlight);
      } else {
        const failureReason = normalized.failure_reason || 'anchor_not_verified';
        failedCandidates.push({
          ...candidate,
          failure_reason: failureReason
        });
        anchorStats.failure_reasons[failureReason] = (anchorStats.failure_reasons[failureReason] || 0) + 1;
      }
    });
    anchorStats.anchored_total += anchoredHighlights.length;
    anchorStats.failed_total += failedCandidates.length;
    const normalizedCheck = {
      ...checkData,
      highlights: anchoredHighlights
    };
    const cannotAnchor = failedCandidates.length > 0 && anchoredHighlights.length === 0;
    if (anchoredHighlights.length > 0) {
      anchorStats.checks_with_anchored += 1;
    }
    if (failedCandidates.length > 0) {
      anchorStats.checks_with_failed += 1;
    }
    if (failedCandidates.length) {
      normalizedCheck.failed_candidates = failedCandidates;
      normalizedCheck.cannot_anchor = cannotAnchor;
      if (!isDeterministic && cannotAnchor) {
        const reasons = Array.from(new Set(failedCandidates.map(item => item.failure_reason).filter(Boolean)));
        normalizedCheck.non_inline = true;
        normalizedCheck.non_inline_reason = reasons.length ? reasons.join(',') : 'anchor_failed';
      }
    }
    if (cannotAnchor) {
      anchorStats.checks_abstained += 1;
      // C2 FIX: Do NOT override verdict to not_applicable when anchoring fails.
      // The check still has a valid verdict from AI analysis - it just can't be highlighted.
      // Mark as non_inline so the UI knows there's no overlay highlight, but keep the verdict.
      // This ensures issues appear in sidebar even without highlights in overlay editor.
      if (!isDeterministic) {
        normalizedCheck.non_inline = true;
        normalizedCheck.non_inline_reason = normalizedCheck.non_inline_reason || 'anchor_failed';
        // Append anchoring note to explanation without changing verdict/confidence
        const explanation = typeof checkData.explanation === 'string' ? checkData.explanation.trim() : '';
        if (explanation && !explanation.includes('could not be anchored')) {
          normalizedCheck.explanation = `${explanation} (Highlight could not be anchored to specific text.)`;
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(checkData, 'candidate_highlights')) {
      delete normalizedCheck.candidate_highlights;
    }
    normalizedChecks[checkId] = normalizedCheck;
  });

  if (anchorStats.candidates_total > 0) {
    anchorStats.anchored_rate = Number((anchorStats.anchored_total / anchorStats.candidates_total).toFixed(4));
    anchorStats.failed_rate = Number((anchorStats.failed_total / anchorStats.candidates_total).toFixed(4));
  }
  if (anchorStats.checks_with_candidates > 0) {
    anchorStats.abstention_rate = Number((anchorStats.checks_abstained / anchorStats.checks_with_candidates).toFixed(4));
  }

  return { ...result, checks: normalizedChecks, anchor_verification: anchorStats };
}

async function buildAnalysisPrompt(manifest, checksList, siteUrl, checkDefinitions, runtimeContract = loadRuntimeContract()) {
  const deterministicCheckIds = getDeterministicCheckIds(checkDefinitions, runtimeContract);
  const promptDefinitions = sanitizeCheckDefinitionsForPrompt(
    filterCheckDefinitionsForPrompt(checkDefinitions, runtimeContract)
  );
  const checkPromptRegistry = await buildCheckPromptRegistry(promptDefinitions, checksList, {
    deterministicIds: deterministicCheckIds
  });
  const checkQueryBlocks = JSON.stringify(checkPromptRegistry.registry, null, 2);
  const wordEstimate = Number.isFinite(manifest.wordEstimate) ? manifest.wordEstimate :
    (Number.isFinite(manifest.word_count) ? manifest.word_count :
      (typeof manifest.plain_text === 'string'
        ? manifest.plain_text.trim().split(/\s+/).filter(Boolean).length
        : 0));
  const prompt = `Please analyze the provided HTML content and return a comprehensive analysis.

CONTENT TO ANALYZE:
- Title: ${manifest.title || 'Untitled'}
- Word Count: ${wordEstimate}
- Site: ${siteUrl || 'Unknown'}
- Content Type: ${detectContentType(manifest)}

MANIFEST (Sanitized HTML Structure):
${JSON.stringify(manifest, null, 2)}

CHECK DEFINITIONS:
${JSON.stringify(promptDefinitions, null, 2)}

CHECK QUERY BLOCKS:
${checkQueryBlocks}

ANALYSIS INSTRUCTIONS:
1. Use the check query blocks to evaluate each check included in CHECK DEFINITIONS
    - verdict ("issue" or "ok")
    - confidence (0.0-1.0)
    - explanation (1-3 sentences, mention LLM extractability where relevant)
    - scope ("sentence" | "span" | "block")
    - text_quote_selector (required): exact, prefix, suffix
      - Use visible text only (no HTML tags, no paraphrasing, no truncation, no ellipses)
      - For sentence scope, exact MUST be the full sentence
      - For non-sentence scope, prefix and suffix must each be at least 32 characters long
      - exact, prefix, and suffix must appear in order within the same block text
    - text_position_selector is optional

2. Return findings ONLY for checks included in CHECK DEFINITIONS and CHECK QUERY BLOCKS. Do not invent extra checks or placeholder responses for checks that are not shown here.

3. Return ONLY valid JSON following this exact structure. Do NOT wrap the JSON in markdown code blocks or any other formatting. Output raw JSON only:
{
  "findings": [
    {
      "check_id": "check_id",
      "verdict": "issue|ok",
      "confidence": 0.9,
      "scope": "sentence|span|block",
      "text_quote_selector": {
        "exact": "full sentence or exact snippet",
        "prefix": "prefix text",
        "suffix": "suffix text"
      },
      "text_position_selector": {
        "start": 123,
        "end": 456
      },
      "explanation": "Why this is an issue or ok"
    }
  ]
}

Begin analysis now:`;

  return prompt;
}

function getDeterministicCheckIds(checkDefinitions, runtimeContract = loadRuntimeContract()) {
  const deterministic = new Set();
  const categories = checkDefinitions?.categories || {};
  Object.values(categories).forEach((category) => {
    const checks = category?.checks || {};
    Object.entries(checks).forEach(([checkId, checkDef]) => {
      if (getAnalysisEngineForCheck(checkId, checkDef, runtimeContract) !== 'ai') {
        deterministic.add(checkId);
      }
    });
  });
  return deterministic;
}

function filterCheckDefinitionsForPrompt(checkDefinitions, runtimeContract = loadRuntimeContract()) {
  const categories = checkDefinitions?.categories || {};
  const filteredCategories = {};
  let totalChecks = 0;
  Object.entries(categories).forEach(([categoryId, categoryDef]) => {
    const checks = categoryDef?.checks || {};
    const filteredChecks = {};
    Object.entries(checks).forEach(([checkId, checkDef]) => {
      if (getAnalysisEngineForCheck(checkId, checkDef, runtimeContract) === 'ai') {
        filteredChecks[checkId] = checkDef;
      }
    });
    const filteredCount = Object.keys(filteredChecks).length;
    if (filteredCount > 0) {
      filteredCategories[categoryId] = {
        ...categoryDef,
        checks: filteredChecks
      };
      totalChecks += filteredCount;
    }
  });
  return {
    ...checkDefinitions,
    total_checks: totalChecks,
    categories: filteredCategories
  };
}

function sanitizeCheckDefinitionsForPrompt(checkDefinitions) {
  if (!checkDefinitions || typeof checkDefinitions !== 'object') {
    return checkDefinitions;
  }
  const clone = JSON.parse(JSON.stringify(checkDefinitions));
  const categories = clone.categories || {};
  Object.values(categories).forEach((category) => {
    const checks = category?.checks || {};
    Object.values(checks).forEach((checkDef) => {
      if (!checkDef || typeof checkDef !== 'object') {
        return;
      }
      const output = checkDef.output;
      if (!output || typeof output !== 'object') {
        return;
      }
      if (Array.isArray(output.highlights)) {
        output.highlights = output.highlights.map((item) => {
          if (!item || typeof item !== 'object') {
            return item;
          }
          const { start, end, start_offset, end_offset, ...rest } = item;
          return rest;
        });
      }
      if (output.highlight && typeof output.highlight === 'object') {
        const { start, end, start_offset, end_offset, ...rest } = output.highlight;
        output.highlight = rest;
      }
    });
  });
  return clone;
}

function stripChecksById(result, idsToRemove) {
  if (!result || !result.checks || !idsToRemove || idsToRemove.size === 0) {
    return result;
  }
  const filteredChecks = {};
  Object.entries(result.checks).forEach(([checkId, checkData]) => {
    if (!idsToRemove.has(checkId)) {
      filteredChecks[checkId] = checkData;
    }
  });
  return {
    ...result,
    checks: filteredChecks
  };
}

function mergeDeterministicExplanations(semanticResult, aiResult, deterministicChecks, deterministicIds) {
  const mergedChecks = { ...(semanticResult?.checks || {}) };
  deterministicIds.forEach((checkId) => {
    const deterministicCheck = deterministicChecks?.[checkId];
    if (!deterministicCheck) {
      return;
    }
    mergedChecks[checkId] = deterministicCheck;
  });
  return {
    ...semanticResult,
    checks: mergedChecks
  };
}

function mergeIntroFocusChecks(mergedResult, aiResult, deterministicChecks, manifest, isEnabled) {
  if (!isEnabled) {
    return mergedResult;
  }
  const checks = { ...(mergedResult?.checks || {}) };
  const deterministicIntroIds = Array.from(INTRO_DETERMINISTIC_CHECK_IDS);
  deterministicIntroIds.forEach((checkId) => {
    const deterministicCheck = deterministicChecks?.[checkId];
    if (!deterministicCheck) {
      return;
    }
    checks[checkId] = deterministicCheck;
  });

  return {
    ...mergedResult,
    checks
  };
}

/**
 * Detects content type from manifest structure
 */
function detectContentType(manifest) {
  const contentSource = typeof manifest.plain_text === 'string'
    ? manifest.plain_text
    : (typeof manifest.content_html === 'string'
      ? manifest.content_html.replace(/<[^>]+>/g, ' ')
      : '');
  const content = contentSource.toLowerCase();
  const title = (manifest.title || '').toLowerCase();
  const h2Count = manifest.metadata && Number.isFinite(manifest.metadata.h2_count) ? manifest.metadata.h2_count : 0;

  // How-to detection
  if (content.includes('step') || content.includes('how to') ||
    title.includes('how to') || h2Count > 5) {
    return 'howto';
  }

  // News detection
  if (content.includes('reported') || content.includes('according to') ||
    title.includes('news') || hasRecentDates(manifest)) {
    return 'news';
  }

  // Product detection
  if (content.includes('price') || content.includes('buy') ||
    content.includes('features') || title.includes('review')) {
    return 'product';
  }

  // Opinion detection
  if (content.includes('i think') || content.includes('in my opinion') ||
    title.includes('opinion') || title.includes('editorial')) {
    return 'opinion';
  }

  // Default to guide
  return 'guide';
}

/**
 * Check if content has recent dates (news indicator)
 */
function hasRecentDates(manifest) {
  const currentYear = new Date().getFullYear();
  const text = typeof manifest.plain_text === 'string' ? manifest.plain_text : '';

  // Look for current year or recent dates
  return text.includes(currentYear.toString()) ||
    text.includes('recently') ||
    text.includes('last week') ||
    text.includes('yesterday');
}

/**
 * Updates run record with results
 */
async function updateRunWithResults(runId, result, usage) {
  const command = new UpdateCommand({
    TableName: getEnv('RUNS_TABLE'),
    Key: { run_id: runId },
    UpdateExpression: 'SET #status = :status, #updated = :updated, #completed = :completed, #tokens = :tokens, #result = :result',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#updated': 'updated_at',
      '#completed': 'completed_at',
      '#tokens': 'tokens_used',
      '#result': 'result'
    },
    ExpressionAttributeValues: {
      ':status': 'completed',
      ':updated': Date.now(),
      ':completed': Date.now(),
      ':tokens': usage?.input_tokens + usage?.output_tokens || 0,
      ':result': result
    }
  });

  await ddbDoc.send(command);
}

/**
 * Updates run record with error
 */
async function updateRunWithError(runId, error) {
  const command = new UpdateCommand({
    TableName: getEnv('RUNS_TABLE'),
    Key: { run_id: runId },
    UpdateExpression: 'SET #status = :status, #updated = :updated, #error = :error',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#updated': 'updated_at',
      '#error': 'error'
    },
    ExpressionAttributeValues: {
      ':status': 'failed',
      ':updated': Date.now(),
      ':error': {
        message: error.message,
        stack: error.stack
      }
    }
  });

  await ddbDoc.send(command);
}

/**
 * Creates a hash of the manifest for deduplication
 */
function hashManifest(manifest) {
  // Simple hash for now - can be improved with crypto
  return require('crypto')
    .createHash('md5')
    .update(JSON.stringify(manifest))
    .digest('hex');
}

module.exports = {
  analyzeRunHandler,
  performAnalysis,
  buildAnalysisPrompt,
  detectContentType,
  injectMissingAiCoverageChecks,
  getAiEligibleCheckIds
};
