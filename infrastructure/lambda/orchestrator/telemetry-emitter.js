/**
 * Telemetry Emitter - PII-safe event logging
 *
 * Emits structured telemetry events for analysis lifecycle.
 * CRITICAL: Never log raw snippets, user content, or PII.
 *
 * Version: 1.0.0
 * Last Updated: 2026-01-29
 */

/**
 * Telemetry event types
 */
const TELEMETRY_EVENTS = {
    ANALYSIS_STARTED: 'analysis_started',
    ANALYSIS_COMPLETED: 'analysis_completed',
    ANALYSIS_ABORTED: 'analysis_aborted',
    ANALYSIS_TERMINAL_STATUS: 'analysis_terminal_status',
    ANALYSIS_MARKED_STALE: 'analysis_marked_stale',
    DETAILS_REQUEST_ABORTED: 'details_request_aborted',
    DETAILS_REQUEST_STALE: 'details_request_stale',
    HIGHLIGHT_SHOWN: 'highlight_shown',
    HIGHLIGHT_CLEARED: 'highlight_cleared',
    ANCHOR_RESOLUTION_FAILED: 'anchor_resolution_failed',
    ANCHOR_VERIFICATION_STATS: 'anchor_verification_stats',
    ANCHOR_GATE_FAILED: 'anchor_gate_failed',
    REWRITE_REQUESTED: 'rewrite_requested',
    REWRITE_COMPLETED: 'rewrite_completed',
    REWRITE_FAILED: 'rewrite_failed',
    COPILOT_VARIANTS_GENERATED: 'copilot_variants_generated',
    COPILOT_GENERATION_FAILED: 'copilot_generation_failed',
    COPILOT_GENERATION_SETTLED: 'copilot_generation_settled',
    APPLY_SUGGESTION_COMPLETED: 'apply_suggestion_completed',
    APPLY_SUGGESTION_FAILED: 'apply_suggestion_failed'
};

/**
 * Anonymize user ID for telemetry
 * Uses a one-way hash to prevent PII exposure
 *
 * @param {string} userId - Original user ID
 * @returns {string} - Anonymized user ID
 */
const anonymizeUserId = (userId) => {
    if (!userId) return 'anonymous';

    // Simple hash - in production, use crypto.createHash('sha256')
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        const char = userId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `user_${Math.abs(hash).toString(16)}`;
};

/**
 * Emit a telemetry event
 *
 * @param {string} event - Event name from TELEMETRY_EVENTS
 * @param {Object} data - Event data (must be PII-safe)
 */
const emitTelemetry = (event, data = {}) => {
    // Validate event type
    if (!Object.values(TELEMETRY_EVENTS).includes(event)) {
        console.warn(`[Telemetry] Unknown event type: ${event}`);
    }

    // Build telemetry payload
    const payload = {
        event,
        timestamp: new Date().toISOString(),
        service: 'aivi-orchestrator',
        environment: process.env.ENVIRONMENT || 'unknown',
        ...sanitizeData(data)
    };

    // Log as structured JSON for CloudWatch ingestion
    console.log(JSON.stringify({
        level: 'TELEMETRY',
        ...payload
    }));

    return payload;
};

/**
 * Sanitize data to remove any potential PII
 *
 * @param {Object} data - Raw event data
 * @returns {Object} - Sanitized data
 */
const sanitizeData = (data) => {
    const sanitized = { ...data };

    // Remove or redact known PII fields
    const piiFields = ['snippet', 'content', 'email', 'name', 'ip', 'user_agent'];

    piiFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    });

    // Anonymize user_id if present
    if (sanitized.user_id) {
        sanitized.user_id_anonymized = anonymizeUserId(sanitized.user_id);
        delete sanitized.user_id;
    }

    // Truncate long strings
    Object.keys(sanitized).forEach(key => {
        if (typeof sanitized[key] === 'string' && sanitized[key].length > 200) {
            sanitized[key] = sanitized[key].substring(0, 200) + '...[truncated]';
        }
    });

    return sanitized;
};

/**
 * Emit analysis_started event
 */
const emitAnalysisStarted = (runId, userId, metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.ANALYSIS_STARTED, {
        run_id: runId,
        user_id: userId,
        ...metadata
    });
};

/**
 * Emit analysis_completed event
 */
const emitAnalysisCompleted = (runId, durationMs, issuesCount, metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.ANALYSIS_COMPLETED, {
        run_id: runId,
        duration_ms: durationMs,
        issues_count: issuesCount,
        ...metadata
    });
};

/**
 * Emit analysis_aborted event
 *
 * @param {string} runId - Run ID
 * @param {string} reason - Abort reason (from ABORT_REASONS)
 * @param {string} traceId - Trace ID for debugging
 * @param {number} durationMs - Duration before abort
 */
const emitAnalysisAborted = (runId, reason, traceId, durationMs = 0) => {
    return emitTelemetry(TELEMETRY_EVENTS.ANALYSIS_ABORTED, {
        run_id: runId,
        reason: reason,
        trace_id: traceId,
        duration_ms: durationMs
    });
};

/**
 * Emit analysis_marked_stale event
 *
 * @param {string} runId - Run ID
 * @param {string} userAction - Action that triggered stale (e.g., "edit")
 */
const emitAnalysisMarkedStale = (runId, userAction = 'edit') => {
    return emitTelemetry(TELEMETRY_EVENTS.ANALYSIS_MARKED_STALE, {
        run_id: runId,
        user_action: userAction
    });
};

/**
 * Emit details_request_aborted event
 */
const emitDetailsRequestAborted = (runId, checkId = null, instanceIndex = null) => {
    return emitTelemetry(TELEMETRY_EVENTS.DETAILS_REQUEST_ABORTED, {
        run_id: runId,
        check_id: checkId,
        instance_index: instanceIndex
    });
};

/**
 * Emit details_request_stale event
 */
const emitDetailsRequestStale = (runId, checkId = null, instanceIndex = null) => {
    return emitTelemetry(TELEMETRY_EVENTS.DETAILS_REQUEST_STALE, {
        run_id: runId,
        check_id: checkId,
        instance_index: instanceIndex
    });
};

const emitAnchorVerificationStats = (runId, stats = {}, metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.ANCHOR_VERIFICATION_STATS, {
        run_id: runId,
        ...stats,
        ...metadata
    });
};

const emitAnchorGateFailed = (runId, stats = {}, metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.ANCHOR_GATE_FAILED, {
        run_id: runId,
        ...stats,
        ...metadata
    });
};

const emitRewriteRequested = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.REWRITE_REQUESTED, metadata);
};

const emitRewriteCompleted = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.REWRITE_COMPLETED, metadata);
};

const emitRewriteFailed = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.REWRITE_FAILED, metadata);
};

const emitCopilotVariantsGenerated = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.COPILOT_VARIANTS_GENERATED, metadata);
};

const emitCopilotGenerationFailed = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.COPILOT_GENERATION_FAILED, metadata);
};

const emitCopilotGenerationSettled = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.COPILOT_GENERATION_SETTLED, metadata);
};

const emitApplySuggestionCompleted = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.APPLY_SUGGESTION_COMPLETED, metadata);
};

const emitApplySuggestionFailed = (metadata = {}) => {
    return emitTelemetry(TELEMETRY_EVENTS.APPLY_SUGGESTION_FAILED, metadata);
};

module.exports = {
    TELEMETRY_EVENTS,
    emitTelemetry,
    anonymizeUserId,
    sanitizeData,
    emitAnalysisStarted,
    emitAnalysisCompleted,
    emitAnalysisAborted,
    emitAnalysisMarkedStale,
    emitDetailsRequestAborted,
    emitDetailsRequestStale,
    emitAnchorVerificationStats,
    emitAnchorGateFailed,
    emitRewriteRequested,
    emitRewriteCompleted,
    emitRewriteFailed,
    emitCopilotVariantsGenerated,
    emitCopilotGenerationFailed,
    emitCopilotGenerationSettled,
    emitApplySuggestionCompleted,
    emitApplySuggestionFailed
};
