const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Initialize AJV
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * Load and cache schemas
 */
const schemas = new Map();

/**
 * Load schema from file or use built-in
 */
function loadSchema(schemaName) {
  // Try to get from cache first
  if (schemas.has(schemaName)) {
    return schemas.get(schemaName);
  }

  let schema;

  switch (schemaName) {
    case 'analyzer_aggregator':
      schema = require('./schemas/analyzer_aggregator_schema.json');
      break;
    default:
      throw new Error(`Unknown schema: ${schemaName}`);
  }

  // Compile and cache
  const validate = ajv.compile(schema);
  schemas.set(schemaName, validate);

  return validate;
}

/**
 * Validate data against schema
 */
function validateSchema(data, schemaName) {
  const validate = loadSchema(schemaName);
  const isValid = validate(data);

  if (!isValid) {
    const errors = validate.errors.map(err => ({
      field: err.instancePath || err.schemaPath,
      message: err.message,
      value: err.data
    }));

    return {
      valid: false,
      errors
    };
  }

  return {
    valid: true,
    errors: []
  };
}

/**
 * Middleware to validate API responses
 */
function createResponseValidator(schemaName) {
  return (response) => {
    const validation = validateSchema(response, schemaName);

    if (!validation.valid) {
      console.error('Response validation failed:', validation.errors);

      // Don't fail the request, but log the error
      // Could add to CloudWatch metrics for monitoring
      return {
        ...response,
        _schemaValidation: {
          valid: false,
          errors: validation.errors
        }
      };
    }

    return {
      ...response,
      _schemaValidation: {
        valid: true
      }
    };
  };
}

/**
 * Validate request payload
 */
function validateRequest(payload, requiredFields = []) {
  const errors = [];

  // Check required fields
  for (const field of requiredFields) {
    if (!(field in payload)) {
      errors.push({
        field,
        message: 'Required field is missing'
      });
    }
  }

  // Validate field types
  if (payload.title && typeof payload.title !== 'string') {
    errors.push({
      field: 'title',
      message: 'Must be a string'
    });
  }

  if (payload.content_html && typeof payload.content_html !== 'string') {
    errors.push({
      field: 'content_html',
      message: 'Must be a string'
    });
  }

  if (payload.site_id && typeof payload.site_id !== 'string') {
    errors.push({
      field: 'site_id',
      message: 'Must be a string'
    });
  }

  // Check content length
  if (payload.content_html && payload.content_html.length > 1000000) {
    errors.push({
      field: 'content_html',
      message: 'Content too long (max 1MB)'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize and prepare analysis response
 */
function sanitizeAnalysisResponse(response) {
  // Ensure required fields exist
  const sanitized = {
    runId: response.runId || '',
    timestamp: response.timestamp || new Date().toISOString(),
    scores: response.scores || {},
    checks: {
      aeo: response.checks?.aeo || {},
      geo: response.checks?.geo || {}
    },
    highlights: response.highlights || [],
    suggestions: response.suggestions || [],
    metadata: {
      model: response.metadata?.model || 'claude-3-5-sonnet-20241022',
      tokens: response.metadata?.tokens || {},
      promptVersion: response.metadata?.promptVersion || '1.0.0'
    }
  };

  // Validate against schema
  const validation = validateSchema(sanitized, 'analyzer_aggregator');

  if (!validation.valid) {
    console.warn('Sanitized response has validation errors:', validation.errors);
  }

  return sanitized;
}

/**
 * Validate analyzer response against schema
 */
function validateAnalyzerResponse(response) {
  const validation = validateSchema(response, 'analyzer_aggregator');

  if (!validation.valid) {
    console.error('Analyzer response validation failed:', validation.errors);
    throw new Error(`Invalid analyzer response: ${validation.errors.map(e => e.message).join(', ')}`);
  }

  return response;
}

module.exports = {
  validateSchema,
  validateRequest,
  createResponseValidator,
  sanitizeAnalysisResponse,
  validateAnalyzerResponse,
  loadSchema
};
