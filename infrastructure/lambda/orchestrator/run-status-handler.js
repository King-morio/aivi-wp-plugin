/**
 * Run Status Handler - GET /aivi/v1/analyze/run/{run_id}
 *
 * Returns the current status of an analysis run.
 * Clients poll this endpoint until status is 'success' or 'failed'.
 */

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand: UpdateCommandDoc } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const {
    prepareSidebarPayload,
    generateAbortedSummary,
    mapErrorToAbortReason
} = require('./analysis-serializer');
const { generateSessionToken } = require('./analysis-details-handler');
const { stripSidebarPayload, validateSidebarPayload } = require('./sidebar-payload-stripper');
const { emitTelemetry } = require('./telemetry-emitter');

const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;
const TERMINAL_STATUSES = new Set(['success', 'success_partial', 'failed', 'failed_schema', 'failed_too_long', 'aborted']);

/**
 * Log helper
 */
const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const parseTimestamp = (value, fallbackMs) => {
    if (!value) return fallbackMs;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : fallbackMs;
};

const normalizeBoundedScore = (value, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric <= 1) return Math.round(Math.max(0, Math.min(max, numeric * max)));
    if (numeric > max && numeric <= 100) return Math.round((numeric / 100) * max);
    return Math.round(Math.max(0, Math.min(max, numeric)));
};

const normalizeScoresForSidebar = (scores) => {
    const src = scores && typeof scores === 'object' ? scores : {};
    const aeoCandidate = src.AEO ?? src.aeo ?? src?.global?.AEO?.score ?? src?.categories?.AEO?.score;
    const geoCandidate = src.GEO ?? src.geo ?? src?.global?.GEO?.score ?? src?.categories?.GEO?.score;
    const globalCandidate = src.GLOBAL ?? src.global_score ?? src?.global?.score;

    const AEO = normalizeBoundedScore(aeoCandidate, 55);
    const GEO = normalizeBoundedScore(geoCandidate, 45);
    const GLOBAL = globalCandidate === undefined || globalCandidate === null
        ? Math.round(Math.max(0, Math.min(100, AEO + GEO)))
        : normalizeBoundedScore(globalCandidate, 100);

    return { AEO, GEO, GLOBAL };
};

const isLikelyTruncationError = (message = '') => {
    if (typeof message !== 'string' || !message) return false;
    return /(finish_reason\s*[:=]\s*length|truncat|response too long|max[_\s-]?tokens?|incomplete json)/i.test(message);
};

const markTerminalTelemetryEmitted = async (runId) => {
    const now = new Date().toISOString();
    try {
        await ddbDoc.send(new UpdateCommandDoc({
            TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
            Key: { run_id: runId },
            UpdateExpression: 'SET terminal_telemetry_emitted_at = :now',
            ConditionExpression: 'attribute_not_exists(terminal_telemetry_emitted_at)',
            ExpressionAttributeValues: {
                ':now': now
            }
        }));
        return true;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            return false;
        }
        throw error;
    }
};

const emitTerminalStatusTelemetry = async ({
    runId,
    finalStatus,
    run,
    categoriesCount = 0,
    abortReason = null,
    traceId = null
}) => {
    if (!TERMINAL_STATUSES.has(finalStatus)) {
        return;
    }

    let shouldEmit;
    try {
        shouldEmit = await markTerminalTelemetryEmitted(runId);
    } catch (error) {
        log('WARN', 'Failed to persist terminal telemetry marker', {
            run_id: runId,
            error: error.message
        });
        return;
    }

    if (!shouldEmit) {
        return;
    }

    const nowMs = Date.now();
    const createdMs = parseTimestamp(run.created_at, nowMs);
    const completedMs = parseTimestamp(run.completed_at, nowMs);
    const durationMs = Math.max(0, completedMs - createdMs);
    const errorCode = run.error || finalStatus || null;
    const errorMessage = run.error_message || '';
    const anchorVerification = run.audit?.anchor_verification || null;
    const candidatesTotal = Number(anchorVerification?.candidates_total || 0);
    const anchoredTotal = Number(anchorVerification?.anchored_total || 0);
    const unhighlightableTotal = Number(anchorVerification?.failed_total || 0);
    const anchorSuccessRate = candidatesTotal > 0 ? anchoredTotal / candidatesTotal : null;
    const unhighlightableRate = candidatesTotal > 0 ? unhighlightableTotal / candidatesTotal : null;
    const timeoutDetected = finalStatus === 'failed_too_long' || /(timeout|timed out)/i.test(`${errorCode} ${errorMessage}`);
    const schemaFailure = finalStatus === 'failed_schema' || /failed_schema/.test(`${errorCode}`.toLowerCase());
    const truncationDetected = isLikelyTruncationError(errorMessage);
    const aiPartial = run.partial && typeof run.partial === 'object' ? run.partial : {};
    const aiChunking = run.audit?.ai_chunking && typeof run.audit.ai_chunking === 'object'
        ? run.audit.ai_chunking
        : {};
    const aiFailedChunkCount = Number(aiPartial.failed_chunk_count ?? aiChunking.failed_chunk_count ?? 0);
    const aiChunkRetryCount = Number(aiPartial.chunk_retry_count ?? aiChunking.chunk_retry_count ?? 0);
    const aiApiRetryCount = Number(aiPartial.api_retry_count ?? aiChunking.api_retry_count ?? 0);
    const aiModelSwitchCount = Number(aiPartial.model_switch_count ?? aiChunking.model_switch_count ?? 0);
    const aiParseErrorTotal = Number(aiPartial.parse_error_total ?? aiChunking.parse_error_total ?? 0);
    const aiParseErrorCounts = aiPartial.parse_error_counts || aiChunking.parse_error_counts || {};
    const aiReturnedCheckRate = Number(aiPartial.returned_check_rate ?? aiChunking.returned_check_rate ?? 0);
    const aiSyntheticCheckRate = Number(aiPartial.synthetic_check_rate ?? aiChunking.synthetic_check_rate ?? 0);
    const aiCoverageGuardrailTriggered = Boolean(
        aiPartial.coverage_guardrail_triggered ?? aiChunking.coverage_guardrail_triggered
    );
    const aiCoverageGuardrailMode = aiPartial.coverage_guardrail_mode || aiChunking.coverage_guardrail_mode || null;

    emitTelemetry('analysis_terminal_status', {
        run_id: runId,
        status: finalStatus,
        error: errorCode,
        duration_ms: durationMs,
        categories_count: categoriesCount,
        feature_flags: run.feature_flags || null,
        is_timeout: timeoutDetected,
        is_failed_schema: schemaFailure,
        is_truncation: truncationDetected,
        candidates_total: candidatesTotal,
        anchored_total: anchoredTotal,
        unhighlightable_total: unhighlightableTotal,
        anchor_success_rate: anchorSuccessRate,
        unhighlightable_rate: unhighlightableRate,
        ai_failed_chunk_count: aiFailedChunkCount,
        ai_chunk_retry_count: aiChunkRetryCount,
        ai_api_retry_count: aiApiRetryCount,
        ai_model_switch_count: aiModelSwitchCount,
        ai_parse_error_total: aiParseErrorTotal,
        ai_parse_error_counts: aiParseErrorCounts,
        ai_returned_check_rate: aiReturnedCheckRate,
        ai_synthetic_check_rate: aiSyntheticCheckRate,
        ai_coverage_guardrail_triggered: aiCoverageGuardrailTriggered,
        ai_coverage_guardrail_mode: aiCoverageGuardrailMode,
        abort_reason: abortReason,
        trace_id: traceId
    });

    if (finalStatus === 'success' || finalStatus === 'success_partial') {
        emitTelemetry('analysis_completed', {
            run_id: runId,
            status: finalStatus,
            duration_ms: durationMs,
            categories_count: categoriesCount,
            feature_flags: run.feature_flags || null,
            is_partial: finalStatus === 'success_partial',
            partial: run.partial || null
        });
        return;
    }

    emitTelemetry('analysis_aborted', {
        run_id: runId,
        reason: abortReason || mapErrorToAbortReason(run.error || finalStatus, run.error_message || ''),
        trace_id: traceId || run.trace_id || null,
        duration_ms: durationMs,
        status: finalStatus,
        original_error: run.error || 'unknown',
        ai_failed_chunk_count: aiFailedChunkCount,
        ai_chunk_retry_count: aiChunkRetryCount,
        ai_api_retry_count: aiApiRetryCount,
        ai_model_switch_count: aiModelSwitchCount,
        ai_parse_error_total: aiParseErrorTotal,
        ai_parse_error_counts: aiParseErrorCounts,
        ai_returned_check_rate: aiReturnedCheckRate,
        ai_synthetic_check_rate: aiSyntheticCheckRate,
        ai_coverage_guardrail_triggered: aiCoverageGuardrailTriggered,
        ai_coverage_guardrail_mode: aiCoverageGuardrailMode,
        feature_flags: run.feature_flags || null
    });
};

/**
 * Generate presigned URL from S3 URI
 */
const getPresignedUrl = async (s3Uri) => {
    if (!s3Uri || !s3Uri.startsWith('s3://')) {
        return null;
    }

    const parts = s3Uri.replace('s3://', '').split('/');
    const bucket = parts[0];
    const key = parts.slice(1).join('/');

    try {
        const url = await getSignedUrl(s3Client, new GetObjectCommand({
            Bucket: bucket,
            Key: key
        }), { expiresIn: 3600 }); // 1 hour expiry

        return url;
    } catch (error) {
        log('WARN', 'Failed to generate presigned URL', { error: error.message, s3Uri });
        return null;
    }
};

/**
 * Download full analysis from S3 for serialization
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
        log('ERROR', 'Failed to download analysis from S3', { error: error.message, bucket, key });
        return null;
    }
};

/**
 * Mark a run as failed due to timeout
 */
const markRunAsFailed = async (runId, reason, errorDetails = {}) => {
    const now = new Date().toISOString();

    const command = new UpdateCommandDoc({
        TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
        Key: { run_id: runId },
        UpdateExpression: 'SET #status = :status, #updated = :updated, #error = :error, #message = :message, #timed_out_at = :timed_out_at',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#updated': 'updated_at',
            '#error': 'error',
            '#message': 'error_message',
            '#timed_out_at': 'timed_out_at'
        },
        ExpressionAttributeValues: {
            ':status': 'failed',
            ':updated': now,
            ':error': reason,
            ':message': errorDetails.message || `Analysis ${reason}`,
            ':timed_out_at': now,
            ':queued': 'queued',
            ':running': 'running'
        },
        ConditionExpression: '#status IN (:queued, :running)' // Only update if still queued or running
    });

    try {
        await ddbDoc.send(command);
        log('INFO', 'Marked run as failed due to timeout', {
            run_id: runId,
            reason,
            timed_out_at: now
        });
        return true;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            // Run was already updated by worker, ignore
            log('DEBUG', 'Run already completed, skipping timeout update', { run_id: runId });
            return false;
        }
        log('ERROR', 'Failed to mark run as failed', {
            run_id: runId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get run status from DynamoDB
 */
const getRunStatus = async (runId) => {
    const command = new GetItemCommand({
        TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
        Key: {
            run_id: { S: runId }
        }
    });

    const response = await ddbClient.send(command);

    if (!response.Item) {
        return null;
    }

    return unmarshall(response.Item);
};

/**
 * Main handler for GET /aivi/v1/analyze/run/{run_id}
 */
const runStatusHandler = async (event) => {
    try {
        // Extract run_id from path parameters
        const runId = event.pathParameters?.run_id || event.pathParameters?.runId;

        if (!runId) {
            log('WARN', 'Missing run_id in request');
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

        log('INFO', 'Fetching run status', { run_id: runId });

        const run = await getRunStatus(runId);

        if (!run) {
            log('WARN', 'Run not found', { run_id: runId });
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

        // Check for stuck runs (timeout handling)
        const status = run.status || 'unknown';
        const now = Date.now();
        const createdAt = new Date(run.created_at || now).getTime();
        const ageMinutes = (now - createdAt) / (1000 * 60);

        // Mark as failed if stuck in queued for too long (> 4 minutes)
        if (status === 'queued') {
            log('DEBUG', 'Checking queued run age', { run_id: runId, age_minutes: Math.round(ageMinutes * 10) / 10 });
        }

        if (status === 'queued' && ageMinutes > 4) {
            const wasUpdated = await markRunAsFailed(runId, 'timeout', {
                message: 'Analysis timed out - worker did not start processing'
            });

            if (wasUpdated) {
                // Update local status to reflect the change
                run.status = 'failed';
                run.error = 'timeout';
                run.error_message = 'Analysis timed out - worker did not start processing';
            }
        }

        // Mark as failed if stuck in running for too long (> 10 minutes)
        if (status === 'running') {
            const startedAt = new Date(run.started_at || run.created_at).getTime();
            const runningMinutes = (now - startedAt) / (1000 * 60);

            if (runningMinutes > 10) {
                const wasUpdated = await markRunAsFailed(runId, 'timeout', {
                    message: 'Analysis timed out - worker crashed during processing'
                });

                if (wasUpdated) {
                    // Update local status to reflect the change
                    run.status = 'failed';
                    run.error = 'timeout';
                    run.error_message = 'Analysis timed out - worker crashed during processing';
                }
            }
        }

        // Build response based on final status.
        // If a run has persisted partial payload + artifacts, do not remap it into aborted messaging.
        const rawStatus = run.status || 'unknown';
        const hasRecoverablePartial = !!(run.partial && run.result_s3);
        let finalStatus = rawStatus;
        if (
            hasRecoverablePartial &&
            ['failed', 'failed_schema', 'failed_too_long', 'aborted'].includes(rawStatus)
        ) {
            finalStatus = 'success_partial';
            log('WARN', 'Promoting failed run with partial payload to success_partial', {
                run_id: runId,
                raw_status: rawStatus,
                error: run.error || null
            });
        }

        const response = {
            ok: finalStatus === 'success' || finalStatus === 'success_partial' || finalStatus === 'queued' || finalStatus === 'running',
            run_id: runId,
            status: finalStatus,
            prompt_provenance: run.prompt_provenance || run.audit?.prompt_provenance || null
        };
        const telemetryContext = {
            categoriesCount: 0,
            abortReason: null,
            traceId: null
        };

        // Add additional fields based on status
        switch (finalStatus) {
            case 'success':
            case 'success_partial':
                // Result Contract Lock: Return analysis_summary instead of full result
                // Full analysis stays in S3 for on-demand retrieval via /details endpoint

                // Download full analysis to build analysis_summary
                const fullAnalysis = await downloadFullAnalysis(run.result_s3);

                if (fullAnalysis) {
                    const deferDetailsEnabled = !!(run.feature_flags && run.feature_flags.defer_details_enabled);
                    const normalizedScores = normalizeScoresForSidebar(run.scores || fullAnalysis.scores || {});
                    // Use serializer to build sidebar payload with analysis_summary
                    const sidebarPayload = prepareSidebarPayload(fullAnalysis, {
                        runId: runId,
                        scores: normalizedScores,
                        includeHighlights: !deferDetailsEnabled,
                        status: finalStatus,
                        partial: run.partial || null
                    });

                    // Merge sidebar payload into response
                    response.scores = normalizeScoresForSidebar(sidebarPayload.scores || normalizedScores);
                    response.analysis_summary = sidebarPayload.analysis_summary;
                    response.completed_at = sidebarPayload.completed_at;
                    if (sidebarPayload.overlay_content) {
                        response.overlay_content = sidebarPayload.overlay_content;
                    }
                    if (run.partial && finalStatus === 'success_partial') {
                        response.partial = run.partial;
                    }

                    // Generate session token for details endpoint access
                    const detailsToken = await generateSessionToken(runId, run.site_id || '');
                    if (detailsToken) {
                        response.details_token = detailsToken;
                    }

                    log('INFO', 'Returning analysis_summary (Result Contract Lock)', {
                        run_id: runId,
                        categories_count: response.analysis_summary?.categories?.length || 0
                    });
                    telemetryContext.categoriesCount = response.analysis_summary?.categories?.length || 0;
                } else {
                    // Fallback: return scores only if analysis not available
                    response.scores = normalizeScoresForSidebar(run.scores || {});
                    response.completed_at = run.completed_at || null;
                    if (run.partial && finalStatus === 'success_partial') {
                        response.partial = run.partial;
                    }
                    if (run.site_id) {
                        const detailsToken = await generateSessionToken(runId, run.site_id);
                        if (detailsToken) {
                            response.details_token = detailsToken;
                        }
                    }
                    log('WARN', 'Full analysis not available, returning scores only', { run_id: runId });
                    telemetryContext.categoriesCount = 0;
                }
                break;

            case 'failed':
            case 'failed_schema':
            case 'failed_too_long':
            case 'aborted':
                // ABORT BEHAVIOR: Return exact analysis_summary shape for aborted runs
                // CRITICAL: Do NOT expose any partial results
                response.ok = false;

                // Map error to abort reason
                const abortReason = mapErrorToAbortReason(
                    run.error || finalStatus,
                    run.error_message || ''
                );

                // Generate trace ID for debugging
                const traceId = run.trace_id || `trace-${runId}-${Date.now()}`;

                // Generate aborted analysis_summary with exact required shape
                response.analysis_summary = generateAbortedSummary(runId, abortReason, traceId);

                // Also set top-level fields for backward compatibility
                response.error = abortReason;
                response.message = 'Analysis aborted — no partial results shown';
                response.trace_id = traceId;

                telemetryContext.categoriesCount = response.analysis_summary?.categories?.length || 0;
                telemetryContext.abortReason = abortReason;
                telemetryContext.traceId = traceId;

                log('WARN', 'Returning aborted analysis_summary', {
                    run_id: runId,
                    reason: abortReason,
                    trace_id: traceId
                });
                break;

            case 'queued':
            case 'running':
                response.created_at = run.created_at || null;
                response.started_at = run.started_at || null;
                break;
        }

        await emitTerminalStatusTelemetry({
            runId,
            finalStatus,
            run,
            categoriesCount: telemetryContext.categoriesCount,
            abortReason: telemetryContext.abortReason,
            traceId: telemetryContext.traceId
        });

        log('INFO', 'Returning run status', { run_id: runId, status: finalStatus });

        // SECURITY: Apply stripper layer before sending to sidebar
        const strippedResponse = stripSidebarPayload(response, runId);

        // Validate the stripped payload
        const validation = validateSidebarPayload(strippedResponse);
        if (!validation.valid) {
            log('ERROR', 'Stripped payload still contains forbidden content', {
                run_id: runId,
                violations: validation.violations
            });
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(strippedResponse)
        };

    } catch (error) {
        log('ERROR', 'Failed to get run status', { error: error.message, stack: error.stack });

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ok: false,
                error: 'internal_error',
                message: 'Failed to retrieve run status'
            })
        };
    }
};

module.exports = { runStatusHandler };
