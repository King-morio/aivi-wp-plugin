/**
 * Analysis Details Handler - GET /analysis/{run_id}/details
 *
 * Returns full per-check object (including highlights and suggestions) on demand.
 * Requires signed token scoped to current editor session or site.
 *
 * Version: 1.0.0
 * Last Updated: 2026-01-29
 */

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');
const {
    extractCheckDetails,
    generateAbortedDetailsResponse,
    generateStaleDetailsResponse,
    mapErrorToAbortReason
} = require('./analysis-serializer');
const { resolveRewriteTarget } = require('./rewrite-target-resolver');
const { emitDetailsRequestAborted, emitDetailsRequestStale } = require('./telemetry-emitter');

const ddbClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const secretsClient = new SecretsManagerClient({});

const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;
let sessionSecretPromise = null;

/**
 * Log helper
 */
const log = (level, message, data = {}) => {
    console.log(JSON.stringify({
        level,
        message,
        service: 'aivi-analysis-details',
        ...data,
        timestamp: new Date().toISOString()
    }));
};

const parseDetailRef = (detailRef) => {
    if (!detailRef || typeof detailRef !== 'string') return null;
    const normalized = detailRef.trim();
    if (!normalized) return null;
    if (normalized.startsWith('check:')) {
        return normalized.slice('check:'.length) || null;
    }
    return normalized;
};

const extractSecretMaterial = (secretValue) => {
    if (!secretValue || typeof secretValue !== 'string') {
        return '';
    }

    const trimmed = secretValue.trim();
    if (!trimmed) {
        return '';
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
            const preferredKeys = ['SESSION_SECRET', 'session_secret', 'sessionSecret', 'MISTRAL_API_KEY'];
            for (const key of preferredKeys) {
                if (typeof parsed[key] === 'string' && parsed[key].trim()) {
                    return parsed[key].trim();
                }
            }

            const firstString = Object.values(parsed).find((value) => typeof value === 'string' && value.trim());
            if (typeof firstString === 'string') {
                return firstString.trim();
            }
        }
    } catch (error) {
        // Plain-string secret values are valid; JSON parsing is optional.
    }

    return trimmed;
};

const getSessionSecret = async () => {
    const inlineSecret = getEnv('SESSION_SECRET', '').trim();
    if (inlineSecret) {
        return inlineSecret;
    }

    const secretName = getEnv('SESSION_SECRET_NAME', getEnv('SECRET_NAME', '')).trim();
    if (!secretName) {
        return '';
    }

    if (!sessionSecretPromise) {
        sessionSecretPromise = secretsClient.send(new GetSecretValueCommand({ SecretId: secretName }))
            .then((response) => {
                const secretString = typeof response.SecretString === 'string'
                    ? response.SecretString
                    : Buffer.from(response.SecretBinary || '', 'base64').toString('utf8');
                return extractSecretMaterial(secretString);
            })
            .catch((error) => {
                log('ERROR', 'Failed to load session secret material', {
                    error: error.message,
                    secret_name: secretName
                });
                return '';
            });
    }

    return sessionSecretPromise;
};

/**
 * Validate session token
 * Token format: base64(runId:siteId:timestamp:signature)
 * Signature: HMAC-SHA256(runId:siteId:timestamp, SECRET_KEY)
 */
const validateSessionToken = async (token, runId, siteId) => {
    if (!token) {
        return { valid: false, error: 'missing_token' };
    }

    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const parts = decoded.split(':');

        if (parts.length !== 4) {
            return { valid: false, error: 'invalid_token_format' };
        }

        const [tokenRunId, tokenSiteId, timestamp, signature] = parts;

        // Verify run_id matches
        if (tokenRunId !== runId) {
            return { valid: false, error: 'run_id_mismatch' };
        }

        // Verify site_id matches (if provided)
        if (siteId && tokenSiteId !== siteId) {
            return { valid: false, error: 'site_id_mismatch' };
        }

        // Verify timestamp is not expired (1 hour validity)
        const tokenTime = parseInt(timestamp, 10);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour

        if (now - tokenTime > maxAge) {
            return { valid: false, error: 'token_expired' };
        }

        // Verify signature
        const secretKey = await getSessionSecret();
        if (!secretKey) {
            log('ERROR', 'Session token validation unavailable: missing session secret material');
            return { valid: false, error: 'server_misconfigured' };
        }
        const payload = `${tokenRunId}:${tokenSiteId}:${timestamp}`;
        const expectedSignature = crypto
            .createHmac('sha256', secretKey)
            .update(payload)
            .digest('hex');

        if (signature !== expectedSignature) {
            return { valid: false, error: 'invalid_signature' };
        }

        return { valid: true };

    } catch (error) {
        log('WARN', 'Token validation error', { error: error.message });
        return { valid: false, error: 'token_parse_error' };
    }
};

/**
 * Generate session token for a run
 * Used by run-status-handler when returning success
 */
const generateSessionToken = async (runId, siteId) => {
    const timestamp = Date.now().toString();
    const secretKey = await getSessionSecret();
    if (!secretKey) {
        log('ERROR', 'Session token generation unavailable: missing session secret material', {
            run_id: runId
        });
        return null;
    }
    const payload = `${runId}:${siteId}:${timestamp}`;

    const signature = crypto
        .createHmac('sha256', secretKey)
        .update(payload)
        .digest('hex');

    const token = Buffer.from(`${runId}:${siteId}:${timestamp}:${signature}`).toString('base64');

    return token;
};

/**
 * Get run record from DynamoDB
 */
const getRunRecord = async (runId) => {
    const command = new GetItemCommand({
        TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
        Key: { run_id: { S: runId } }
    });

    const response = await ddbClient.send(command);

    if (!response.Item) {
        return null;
    }

    return unmarshall(response.Item);
};

/**
 * Download full analysis from S3
 */
const downloadFullAnalysis = async (s3Uri) => {
    if (!s3Uri) return null;

    let bucket, key;

    if (s3Uri.startsWith('s3://')) {
        const parts = s3Uri.replace('s3://', '').split('/');
        bucket = parts[0];
        key = parts.slice(1).join('/');
    } else {
        bucket = getEnv('ARTIFACTS_BUCKET', 'aivi-artifacts-aivi-dev');
        key = s3Uri;
    }

    try {
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await response.Body.transformToString();
        return JSON.parse(body);
    } catch (error) {
        log('ERROR', 'Failed to download analysis from S3', {
            error: error.message,
            bucket,
            key
        });
        return null;
    }
};

const loadDetailsSource = async (run) => {
    if (run && run.details_s3) {
        const detailsArtifact = await downloadFullAnalysis(run.details_s3);
        if (detailsArtifact && detailsArtifact.checks) {
            return {
                source: 'details_s3',
                data: { checks: detailsArtifact.checks }
            };
        }
    }

    const fullAnalysis = await downloadFullAnalysis(run.result_s3);
    if (fullAnalysis) {
        return {
            source: 'result_s3',
            data: fullAnalysis
        };
    }

    return null;
};

const loadRunManifest = async (run) => {
    if (!run || !run.manifest_s3_key) return null;
    return downloadFullAnalysis(run.manifest_s3_key);
};

/**
 * Check if content has changed since analysis was run
 * Compare content_hash from run record with current content hash from request
 *
 * @param {Object} run - Run record from DynamoDB
 * @param {string} currentContentHash - Hash of current content from request header
 * @returns {boolean} - True if content is stale
 */
const isContentStale = (run, currentContentHash) => {
    if (!currentContentHash) {
        // No hash provided - cannot determine staleness, allow access
        return false;
    }

    if (!run.content_hash) {
        // No hash stored in run - cannot determine staleness, allow access
        return false;
    }

    return run.content_hash !== currentContentHash;
};

/**
 * Main handler for GET /analysis/{run_id}/details
 *
 * Query params:
 * - check_id: Required. The check ID to retrieve details for.
 * - instance_index: Optional. The instance index for highlights (0-based). ZERO-BASED.
 * - token: Required. Session token for authentication.
 *
 * Headers:
 * - x-aivi-content-hash: Optional. Hash of current content for staleness check.
 *
 * Returns 410 Gone if content has changed since analysis was run.
 */
const analysisDetailsHandler = async (event) => {
    try {
        // Extract run_id from path
        const runId = event.pathParameters?.run_id || event.pathParameters?.runId;

        if (!runId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'missing_run_id',
                    message: 'run_id is required'
                })
            };
        }

        // Extract query parameters
        const queryParams = event.queryStringParameters || {};
        const checkId = queryParams.check_id;
        const detailRef = queryParams.detail_ref;
        const resolvedCheckId = checkId || parseDetailRef(detailRef);
        const instanceIndex = queryParams.instance_index !== undefined
            ? parseInt(queryParams.instance_index, 10)
            : null;
        const token = queryParams.token || event.headers?.['x-aivi-token'];

        if (!resolvedCheckId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'missing_check_id',
                    message: 'check_id or detail_ref query parameter is required'
                })
            };
        }

        log('INFO', 'Details request received', {
            run_id: runId,
            check_id: resolvedCheckId,
            detail_ref: detailRef || null
        });

        // Get run record to verify it exists and get site_id
        const run = await getRunRecord(runId);

        if (!run) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'not_found',
                    message: `Run ${runId} not found`
                })
            };
        }

        // Validate session token
        const tokenValidation = await validateSessionToken(token, runId, run.site_id);

        if (!tokenValidation.valid) {
            log('WARN', 'Token validation failed', {
                run_id: runId,
                error: tokenValidation.error
            });

            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'unauthorized',
                    message: `Invalid or expired session token: ${tokenValidation.error}`
                })
            };
        }

        // Check for aborted runs - return 503 Service Unavailable
        const abortedStatuses = ['failed', 'failed_schema', 'failed_too_long', 'aborted'];
        if (abortedStatuses.includes(run.status)) {
            const abortReason = mapErrorToAbortReason(run.error || run.status, run.error_message || '');
            const traceId = run.trace_id || `trace-${runId}-${Date.now()}`;

            // Emit telemetry for aborted details request
            emitDetailsRequestAborted(runId, resolvedCheckId, instanceIndex);

            log('WARN', 'Details requested for aborted run', {
                run_id: runId,
                check_id: resolvedCheckId,
                reason: abortReason,
                trace_id: traceId
            });

            return {
                statusCode: 503,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateAbortedDetailsResponse(runId, abortReason, traceId))
            };
        }

        // Verify run is complete
        if (run.status !== 'success' && run.status !== 'success_partial') {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'run_not_complete',
                    message: `Run status is ${run.status}, details only available for completed runs`
                })
            };
        }

        // Check for stale content (content changed since analysis)
        const currentContentHash = event.headers?.['x-aivi-content-hash'] ||
            event.headers?.['X-Aivi-Content-Hash'] ||
            queryParams.content_hash;

        if (isContentStale(run, currentContentHash)) {
            // Emit telemetry for stale details request
            emitDetailsRequestStale(runId, resolvedCheckId, instanceIndex);

            log('WARN', 'Content stale - returning 410 Gone', {
                run_id: runId,
                stored_hash: run.content_hash?.substring(0, 8) + '...',
                current_hash: currentContentHash?.substring(0, 8) + '...'
            });

            // Return exact 410 response shape as specified
            return {
                statusCode: 410,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateStaleDetailsResponse(runId))
            };
        }

        // Download details source (deferred details artifact first, full result fallback)
        const detailsSource = await loadDetailsSource(run);

        if (!detailsSource || !detailsSource.data) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'analysis_not_found',
                    message: 'Analysis details data not found in storage'
                })
            };
        }

        // Extract check details
        const checkDetails = extractCheckDetails(detailsSource.data, resolvedCheckId, instanceIndex);

        if (!checkDetails) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'check_not_found',
                    message: `Check ${resolvedCheckId} not found in analysis results`
                })
            };
        }

        const manifest = await loadRunManifest(run);
        let rewriteResolution = null;
        try {
            rewriteResolution = resolveRewriteTarget({
                checkId: resolvedCheckId,
                checkDetails,
                manifest,
                instanceIndex
            });
        } catch (resolverError) {
            log('WARN', 'Rewrite target resolver failed', {
                run_id: runId,
                check_id: resolvedCheckId,
                error: resolverError.message
            });
        }

        log('INFO', 'Returning check details', {
            run_id: runId,
            check_id: resolvedCheckId,
            instance_index: instanceIndex,
            has_focused_highlight: !!checkDetails.focused_highlight,
            has_highlights: !!(checkDetails.highlights?.length),
            has_suggestions: !!(checkDetails.suggestions?.length),
            rewrite_target_actionable: rewriteResolution?.rewrite_target?.actionable === true,
            details_source: detailsSource.source
        });

        // Build response in flat format as per spec
        const response = {
            ok: true,
            run_id: runId,
            check_id: resolvedCheckId,
            detail_ref: detailRef || `check:${resolvedCheckId}`,
            instance_index: instanceIndex
        };

        // Include focused highlight fields at top level if available
        if (checkDetails.focused_highlight) {
            const fh = checkDetails.focused_highlight;
            response.node_ref = fh.node_ref || null;
            response.signature = fh.signature || null;
            response.start = typeof fh.start === 'number' ? fh.start : null;
            response.end = typeof fh.end === 'number' ? fh.end : null;
            response.snippet = fh.snippet || null;
            response.message = fh.message || null;
            response.anchor_status = fh.anchor_status || null;
            response.anchor_strategy = fh.anchor_strategy || null;
            response.content_hash = fh.content_hash || null;
            // Also include the full object for client compatibility
            response.focused_highlight = fh;
        }

        if (checkDetails.cannot_anchor) {
            response.cannot_anchor = true;
        }
        if (checkDetails.focused_failed_candidate?.failure_reason) {
            response.failure_reason = checkDetails.focused_failed_candidate.failure_reason;
        }
        if (checkDetails.focused_failed_candidate) {
            response.focused_failed_candidate = checkDetails.focused_failed_candidate;
        }

        if (rewriteResolution && rewriteResolution.rewrite_target) {
            response.rewrite_target = rewriteResolution.rewrite_target;
            checkDetails.rewrite_target = rewriteResolution.rewrite_target;
        }
        if (rewriteResolution && rewriteResolution.repair_intent) {
            response.repair_intent = rewriteResolution.repair_intent;
            checkDetails.repair_intent = rewriteResolution.repair_intent;
        }

        // Also include full check details
        response.check = checkDetails;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
        };

    } catch (error) {
        log('ERROR', 'Details handler error', {
            error: error.message,
            stack: error.stack
        });

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ok: false,
                error: 'internal_error',
                message: 'Failed to retrieve check details'
            })
        };
    }
};

module.exports = {
    analysisDetailsHandler,
    generateSessionToken,
    validateSessionToken
};
