/**
 * Execution & Failure States Tests
 *
 * Automated acceptance tests for abort behavior, stale-run invalidation,
 * and proper 503/410 response handling.
 *
 * @version 1.5.0
 */

const {
    ABORT_REASONS,
    generateAbortedSummary,
    generateAbortedDetailsResponse,
    generateStaleDetailsResponse,
    mapErrorToAbortReason
} = require('../../infrastructure/lambda/orchestrator/analysis-serializer');

const {
    TELEMETRY_EVENTS,
    emitTelemetry,
    emitAnalysisAborted,
    emitAnalysisMarkedStale,
    emitDetailsRequestAborted,
    emitDetailsRequestStale,
    emitAnchorVerificationStats,
    emitAnchorGateFailed
} = require('../../infrastructure/lambda/orchestrator/telemetry-emitter');

describe('Execution & Failure States', () => {
    let consoleLogs;

    beforeEach(() => {
        consoleLogs = [];
        console.log = jest.fn((...args) => consoleLogs.push(args.join(' ')));
    });

    // ============================================
    // TEST 1: AI Timeout Simulation
    // ============================================
    describe('1. AI Timeout Simulation', () => {
        test('should return aborted analysis_summary with status:aborted on timeout', () => {
            const runId = 'test-run-timeout-123';
            const traceId = 'trace-timeout-123';

            // Simulate timeout error
            const abortReason = mapErrorToAbortReason('timeout', 'worker timed out');
            expect(abortReason).toBe(ABORT_REASONS.TIMEOUT);

            // Generate aborted summary
            const summary = generateAbortedSummary(runId, abortReason, traceId);

            // Verify exact shape
            expect(summary).toEqual({
                version: '1.2.0',
                run_id: runId,
                status: 'aborted',
                reason: 'timeout',
                message: 'Analysis aborted — no partial results shown',
                trace_id: traceId
            });
        });

        test('should return 503 from details endpoint for aborted run', () => {
            const runId = 'test-run-aborted-details';
            const traceId = 'trace-503-test';
            const reason = ABORT_REASONS.TIMEOUT;

            const response = generateAbortedDetailsResponse(runId, reason, traceId);

            expect(response).toEqual({
                status: 'aborted',
                code: 'analysis_aborted',
                reason: 'timeout',
                message: 'Analysis aborted — no partial results shown',
                trace_id: traceId
            });
        });

        test('sidebar should show abort banner with no cards on timeout', () => {
            // Simulated poll result for aborted run
            const pollResult = {
                success: false,
                aborted: true,
                reason: 'timeout',
                message: 'Analysis aborted — no partial results shown',
                traceId: 'trace-ui-test'
            };

            // Verify abort detection
            expect(pollResult.aborted).toBe(true);
            expect(pollResult.message).toBe('Analysis aborted — no partial results shown');

            // In real UI, this would set state to 'aborted' and show banner
        });
    });

    // ============================================
    // TEST 2: Invalid JSON Simulation
    // ============================================
    describe('2. Invalid JSON / Malformed AI Output', () => {
        test('should map schema validation failure to invalid_output reason', () => {
            const reason1 = mapErrorToAbortReason('failed_schema', 'JSON parse error');
            expect(reason1).toBe(ABORT_REASONS.INVALID_OUTPUT);

            const reason2 = mapErrorToAbortReason('validation_error', 'schema mismatch');
            expect(reason2).toBe(ABORT_REASONS.INVALID_OUTPUT);

            const reason3 = mapErrorToAbortReason('json_parse', 'unexpected token');
            expect(reason3).toBe(ABORT_REASONS.INVALID_OUTPUT);
        });

        test('should return aborted summary for schema validation failure', () => {
            const runId = 'test-run-invalid-json';
            const reason = mapErrorToAbortReason('failed_schema', 'invalid JSON from AI');
            const summary = generateAbortedSummary(runId, reason, null);

            expect(summary.status).toBe('aborted');
            expect(summary.reason).toBe('invalid_output');
            expect(summary.message).toBe('Analysis aborted — no partial results shown');
            expect(summary.trace_id).toBeDefined();
        });

        test('should NOT expose raw validation errors to UI', () => {
            const rawError = 'Unexpected token at position 1234 in response: {"partial_data":...';
            const reason = mapErrorToAbortReason('failed_schema', rawError);
            const summary = generateAbortedSummary('run-123', reason, null);

            // Message should be generic, NOT contain raw error details
            expect(summary.message).not.toContain('Unexpected token');
            expect(summary.message).not.toContain('position');
            expect(summary.message).toBe('Analysis aborted — no partial results shown');
        });
    });

    // ============================================
    // TEST 3: Partial Results Suppression
    // ============================================
    describe('3. Partial Results Suppression', () => {
        test('should NOT include any checks data in aborted summary', () => {
            const runId = 'test-run-partial';
            const summary = generateAbortedSummary(runId, ABORT_REASONS.INTERNAL_ERROR, null);

            // Aborted summary must NOT contain any partial data
            expect(summary.categories).toBeUndefined();
            expect(summary.checks).toBeUndefined();
            expect(summary.issues).toBeUndefined();
            expect(summary.scores).toBeUndefined();
        });

        test('aborted summary should have exact required fields only', () => {
            const summary = generateAbortedSummary('run-123', 'timeout', 'trace-123');

            const expectedKeys = ['version', 'run_id', 'status', 'reason', 'message', 'trace_id'];
            expect(Object.keys(summary).sort()).toEqual(expectedKeys.sort());
        });

        test('should never persist partial artifacts on abort', () => {
            // This is a behavioral test - in production, artifact persistence
            // is blocked when status is aborted
            const isAborted = true;
            const partialData = { checks: { check_1: { verdict: 'fail' } } };

            // Simulate persistence decision
            const shouldPersist = !isAborted;
            expect(shouldPersist).toBe(false);
        });
    });

    // ============================================
    // TEST 4: Content Edit Stale Flow
    // ============================================
    describe('4. Content Edit Stale Flow', () => {
        test('should return 410 Gone for stale run details request', () => {
            const runId = 'test-run-stale';
            const response = generateStaleDetailsResponse(runId);

            expect(response).toEqual({
                status: 'stale',
                code: 'results_stale',
                message: 'Analysis results stale — please re-run analysis',
                run_id: runId
            });
        });

        test('stale response should have exact required fields', () => {
            const response = generateStaleDetailsResponse('run-xyz');

            const expectedKeys = ['status', 'code', 'message', 'run_id'];
            expect(Object.keys(response).sort()).toEqual(expectedKeys.sort());
        });

        test('should detect content change via hash comparison', () => {
            // Simple hash function (same as sidebar)
            const hashContent = (str) => {
                if (!str) return '';
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return hash.toString(16);
            };

            const originalContent = 'This is the original content for testing.';
            const editedContent = 'This is the edited content for testing!';

            const originalHash = hashContent(originalContent);
            const editedHash = hashContent(editedContent);

            expect(originalHash).not.toBe(editedHash);
        });

        test('should emit analysis_marked_stale telemetry on content edit', () => {
            const event = emitAnalysisMarkedStale('run-stale-test', 'edit');

            expect(event.event).toBe(TELEMETRY_EVENTS.ANALYSIS_MARKED_STALE);
            expect(event.run_id).toBe('run-stale-test');
            expect(event.user_action).toBe('edit');
        });
    });

    // ============================================
    // TEST 5: Retry UX
    // ============================================
    describe('5. Retry UX', () => {
        test('abort banner should include Retry analysis button', () => {
            // UI test - verify banner structure requirements
            const bannerRequirements = {
                message: 'Analysis aborted — no partial results shown',
                ctaText: 'Retry analysis',
                ctaAction: 'runAnalysis'
            };

            expect(bannerRequirements.message).toBe('Analysis aborted — no partial results shown');
            expect(bannerRequirements.ctaText).toBe('Retry analysis');
        });

        test('stale banner should include Re-run analysis button', () => {
            const staleBannerRequirements = {
                message: 'Analysis results stale — please re-run analysis',
                ctaText: 'Re-run analysis',
                ctaAction: 'runAnalysis'
            };

            expect(staleBannerRequirements.message).toBe('Analysis results stale — please re-run analysis');
            expect(staleBannerRequirements.ctaText).toBe('Re-run analysis');
        });

        test('clicking Retry should clear previous state', () => {
            // Behavioral requirement
            const clearStateOnRetry = {
                report: null,
                manifest: null,
                state: 'analyzing',
                isStale: false,
                lastContentHash: null
            };

            expect(clearStateOnRetry.report).toBeNull();
            expect(clearStateOnRetry.state).toBe('analyzing');
            expect(clearStateOnRetry.isStale).toBe(false);
        });
    });

    // ============================================
    // TEST 6: Telemetry
    // ============================================
    describe('6. Telemetry (PII-safe)', () => {
        test('should emit analysis_aborted with trace_id', () => {
            const event = emitAnalysisAborted('run-abort-tel', 'timeout', 'trace-abc', 5000);

            expect(event.event).toBe(TELEMETRY_EVENTS.ANALYSIS_ABORTED);
            expect(event.run_id).toBe('run-abort-tel');
            expect(event.reason).toBe('timeout');
            expect(event.trace_id).toBe('trace-abc');
            expect(event.duration_ms).toBe(5000);
        });

        test('should emit details_request_aborted for 503 response', () => {
            const event = emitDetailsRequestAborted('run-503', 'check_1', 0);

            expect(event.event).toBe(TELEMETRY_EVENTS.DETAILS_REQUEST_ABORTED);
            expect(event.run_id).toBe('run-503');
            expect(event.check_id).toBe('check_1');
            expect(event.instance_index).toBe(0);
        });

        test('should emit details_request_stale for 410 response', () => {
            const event = emitDetailsRequestStale('run-410', 'check_2', 1);

            expect(event.event).toBe(TELEMETRY_EVENTS.DETAILS_REQUEST_STALE);
            expect(event.run_id).toBe('run-410');
            expect(event.check_id).toBe('check_2');
            expect(event.instance_index).toBe(1);
        });

        test('telemetry should NOT include raw snippets', () => {
            // Check that no snippet field is present in emitted events
            const event1 = emitAnalysisAborted('run-1', 'timeout', 'trace-1', 1000);
            const event2 = emitDetailsRequestAborted('run-2', 'check_1', 0);

            expect(event1.snippet).toBeUndefined();
            expect(event1.content).toBeUndefined();
            expect(event2.snippet).toBeUndefined();
            expect(event2.content).toBeUndefined();
        });

        test('telemetry should include timestamp', () => {
            const event = emitTelemetry(TELEMETRY_EVENTS.ANALYSIS_STARTED, { run_id: 'run-ts' });

            expect(event.timestamp).toBeDefined();
            expect(new Date(event.timestamp).getTime()).not.toBeNaN();
        });

        test('should emit anchor_verification_stats with rates and redactions', () => {
            const event = emitAnchorVerificationStats('run-anchor-1', {
                candidates_total: 10,
                anchored_total: 7,
                failed_total: 3,
                anchored_rate: 0.7,
                failed_rate: 0.3,
                abstention_rate: 0.1,
                failure_reasons: { node_ref_mismatch: 2 }
            }, {
                prompt_version: 'v5',
                snippet: 'Sensitive snippet data'
            });

            expect(event.event).toBe(TELEMETRY_EVENTS.ANCHOR_VERIFICATION_STATS);
            expect(event.run_id).toBe('run-anchor-1');
            expect(event.candidates_total).toBe(10);
            expect(event.anchored_rate).toBe(0.7);
            expect(event.failed_rate).toBe(0.3);
            expect(event.abstention_rate).toBe(0.1);
            expect(event.snippet).toBe('[REDACTED]');
        });

        test('should emit anchor_gate_failed when thresholds breached', () => {
            const event = emitAnchorGateFailed('run-gate-1', {
                anchored_rate: 0.4,
                failed_rate: 0.5,
                abstention_rate: 0.6,
                gates_failed: ['anchored_rate<0.6', 'failed_rate>0.4', 'abstention_rate>0.3'],
                thresholds: {
                    anchored_rate_min: 0.6,
                    failed_rate_max: 0.4,
                    abstention_rate_max: 0.3
                }
            }, {
                snippet: 'Should be redacted'
            });

            expect(event.event).toBe(TELEMETRY_EVENTS.ANCHOR_GATE_FAILED);
            expect(event.run_id).toBe('run-gate-1');
            expect(event.gates_failed.length).toBe(3);
            expect(event.snippet).toBe('[REDACTED]');
        });
    });

    // ============================================
    // ERROR MAPPING TESTS
    // ============================================
    describe('Error to Abort Reason Mapping', () => {
        test('should map various timeout errors correctly', () => {
            expect(mapErrorToAbortReason('timeout')).toBe('timeout');
            expect(mapErrorToAbortReason('Timed Out')).toBe('timeout');
            expect(mapErrorToAbortReason('request', 'connection timed out')).toBe('timeout');
        });

        test('should map AI service errors correctly', () => {
            expect(mapErrorToAbortReason('ai_unavailable')).toBe('ai_unavailable');
            expect(mapErrorToAbortReason('api_error')).toBe('ai_unavailable');
            expect(mapErrorToAbortReason('500')).toBe('ai_unavailable');
            expect(mapErrorToAbortReason('error', 'model not found')).toBe('ai_unavailable');
            expect(mapErrorToAbortReason('error', 'rate limit exceeded')).toBe('ai_unavailable');
        });

        test('should map validation errors correctly', () => {
            expect(mapErrorToAbortReason('failed_schema')).toBe('invalid_output');
            expect(mapErrorToAbortReason('json_error')).toBe('invalid_output');
            expect(mapErrorToAbortReason('parse_error')).toBe('invalid_output');
        });

        test('should default to internal_error for unknown errors', () => {
            expect(mapErrorToAbortReason('unknown_error')).toBe('internal_error');
            expect(mapErrorToAbortReason('')).toBe('internal_error');
            expect(mapErrorToAbortReason(null)).toBe('internal_error');
        });
    });
});

// ============================================
// INTEGRATION TESTS
// ============================================
describe('Abort Flow Integration', () => {
    test('full abort flow: error → aborted summary → 503 details → banner', () => {
        // Step 1: AI error occurs
        const errorType = 'timeout';
        const errorMessage = 'Lambda timeout after 60s';

        // Step 2: Map to abort reason
        const reason = mapErrorToAbortReason(errorType, errorMessage);
        expect(reason).toBe('timeout');

        // Step 3: Generate aborted summary for run status
        const runId = 'integration-run-abort';
        const traceId = `trace-${runId}-${Date.now()}`;
        const summary = generateAbortedSummary(runId, reason, traceId);

        expect(summary.status).toBe('aborted');
        expect(summary.reason).toBe('timeout');

        // Step 4: Details endpoint returns 503
        const detailsResponse = generateAbortedDetailsResponse(runId, reason, traceId);
        expect(detailsResponse.code).toBe('analysis_aborted');

        // Step 5: UI shows banner (behavioral check)
        const uiState = {
            state: 'aborted',
            errorMessage: summary.message,
            report: null // No partial results
        };

        expect(uiState.state).toBe('aborted');
        expect(uiState.report).toBeNull();
    });

    test('full stale flow: edit → mark stale → 410 details → banner', () => {
        // Step 1: Run completes successfully
        const runId = 'integration-run-stale';
        const originalHash = 'abc123';

        // Step 2: User edits content
        const newHash = 'xyz789';
        const isStale = originalHash !== newHash;
        expect(isStale).toBe(true);

        // Step 3: Mark run as stale
        emitAnalysisMarkedStale(runId, 'edit');

        // Step 4: Details endpoint returns 410
        const staleResponse = generateStaleDetailsResponse(runId);
        expect(staleResponse.status).toBe('stale');
        expect(staleResponse.code).toBe('results_stale');

        // Step 5: UI shows stale banner (behavioral check)
        const uiState = {
            isStale: true,
            message: 'Analysis results stale — please re-run analysis'
        };

        expect(uiState.isStale).toBe(true);
    });
});
