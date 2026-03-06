const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require('uuid');
const {
  emitApplySuggestionCompleted,
  emitApplySuggestionFailed
} = require('./telemetry-emitter');

// Environment variables
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);

/**
 * Apply a suggestion variant and track the change
 */
async function applySuggestion(suggestionId, originalText, appliedText, explanation, confidence, postId, siteId, userId = 'anonymous') {
  // Fetch the suggestion to verify it exists
  const suggestion = await fetchSuggestion(suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  // Create application record
  const application = {
    application_id: uuidv4(),
    original_text: originalText,
    applied_text: appliedText,
    explanation: explanation || 'Applied manually',
    confidence: confidence || 1.0,
    applied_at: new Date().toISOString(),
    applied_by: userId,
    post_id: postId,
    site_id: siteId
  };

  // Update suggestion with application record
  await updateSuggestionWithApplication(suggestionId, application);

  return {
    ok: true,
    application_id: application.application_id,
    original_text: application.original_text,
    applied_text: application.applied_text,
    applied_at: application.applied_at
  };
}

/**
 * Fetch suggestion from DynamoDB
 */
async function fetchSuggestion(suggestionId) {
  try {
    const command = new GetCommand({
      TableName: getEnv('SUGGESTIONS_TABLE', 'aivi-suggestions-dev'),
      Key: { suggestion_id: suggestionId }
    });

    const response = await ddbDoc.send(command);
    return response.Item;
  } catch (error) {
    console.error('Failed to fetch suggestion:', error);
    return null;
  }
}

/**
 * Update suggestion with application record
 */
async function updateSuggestionWithApplication(suggestionId, application) {
  try {
    const command = new UpdateCommand({
      TableName: getEnv('SUGGESTIONS_TABLE', 'aivi-suggestions-dev'),
      Key: { suggestion_id: suggestionId },
      UpdateExpression: 'SET applied_versions = list_append(if_not_exists(applied_versions, :empty_list), :application), last_applied = :application',
      ExpressionAttributeValues: {
        ':application': [application],
        ':empty_list': []
      },
      ReturnValues: 'UPDATED_NEW'
    });

    await ddbDoc.send(command);
  } catch (error) {
    console.error('Failed to update suggestion:', error);
    throw error;
  }
}

/**
 * Get version history for a suggestion
 */
async function getSuggestionHistory(suggestionId) {
  const suggestion = await fetchSuggestion(suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  return {
    suggestion_id: suggestionId,
    original_text: suggestion.text,
    applied_versions: suggestion.applied_versions || [],
    total_applications: (suggestion.applied_versions || []).length
  };
}

/**
 * Main handler for apply_suggestion endpoint
 */
async function applySuggestionHandler(event) {
  const startTime = Date.now();
  let telemetryContext = {
    suggestion_id: null,
    post_id: null,
    site_id: null
  };

  try {
    // Parse request body
    let body;
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else {
      body = event.body;
    }

    const { suggestion_id, original_text, applied_text, explanation, confidence, post_id, site_id, user_id } = body;
    telemetryContext = {
      suggestion_id: suggestion_id || null,
      post_id: Number.isFinite(Number(post_id)) ? Number(post_id) : null,
      site_id: site_id || null
    };

    // Validate required fields
    if (!suggestion_id || !original_text || !applied_text || !post_id || !site_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing required fields',
          message: 'suggestion_id, original_text, applied_text, post_id, and site_id are required'
        })
      };
    }

    // Apply the suggestion
    const result = await applySuggestion(
      suggestion_id,
      original_text,
      applied_text,
      explanation,
      confidence,
      post_id,
      site_id,
      user_id || 'anonymous'
    );

    const processingTime = Date.now() - startTime;
    emitApplySuggestionCompleted({
      ...telemetryContext,
      duration_ms: processingTime,
      confidence: typeof confidence === 'number' ? confidence : null,
      original_text_length: typeof original_text === 'string' ? original_text.length : 0,
      applied_text_length: typeof applied_text === 'string' ? applied_text.length : 0
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...result,
        processing_time_ms: processingTime,
        metadata: {
          applied_at: new Date().toISOString(),
          handler_version: '1.0.0'
        }
      })
    };

  } catch (error) {
    console.error('Apply suggestion handler error:', error);
    emitApplySuggestionFailed({
      ...telemetryContext,
      duration_ms: Date.now() - startTime,
      error: error && error.message ? String(error.message) : 'unknown_error'
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'application_failed',
        message: error.message
      })
    };
  }
}

/**
 * Handler for getting suggestion history
 */
async function getSuggestionHistoryHandler(event) {
  try {
    // Parse suggestion_id from path parameters
    const suggestionId = event.pathParameters?.suggestion_id;

    if (!suggestionId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing suggestion_id',
          message: 'suggestion_id is required in path'
        })
      };
    }

    const history = await getSuggestionHistory(suggestionId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        ...history
      })
    };

  } catch (error) {
    console.error('Get history handler error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'fetch_failed',
        message: error.message
      })
    };
  }
}

module.exports = {
  applySuggestionHandler,
  getSuggestionHistoryHandler,
  applySuggestion,
  getSuggestionHistory
};
