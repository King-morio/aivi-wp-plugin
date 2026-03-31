/**
 * Acceptance Tests - Sidebar-Payload Hard Separation
 *
 * Tests:
 * 1. Stripper layer removes all forbidden fields
 * 2. Sidebar payload contains only allowed fields
 * 3. Details endpoint requires valid token
 * 4. Details endpoint returns 410 Gone on stale content
 * 5. PII is redacted from persisted artifacts
 */

const {
    stripSidebarPayload,
    stripAnalysisSummary,
    stripIssue,
    validateSidebarPayload,
    scanForForbiddenContent,
    FORBIDDEN_FIELDS,
    ALLOWED_ISSUE_FIELDS,
    ALLOWED_HIGHLIGHT_FIELDS
} = require('./sidebar-payload-stripper');

const { scrubString, scrubAnalysisResult } = require('./pii-scrubber');

// Mock payload with forbidden fields
const mockPayloadWithForbidden = {
    ok: true,
    run_id: 'test-run-123',
    status: 'success',
    scores: { AEO: 75, GEO: 68, GLOBAL: 71 },
    completed_at: '2026-01-29T18:00:00.000Z',
    details_token: 'abc123token',
    // FORBIDDEN - should be stripped
    result_url: 'https://s3.amazonaws.com/bucket/key',
    result_s3: 's3://bucket/key',
    checks: {
        single_h1: {
            verdict: 'fail',
            explanation: 'Found 3 H1 tags',
            highlights: [{ node_ref: 'block-1', start: 0, end: 20 }],
            suggestions: [{ text: 'Remove extra H1 tags' }]
        }
    },
    metadata: { model: 'mistral-large' },
    audit: { tokens_used: 5000 },
    analysis_summary: {
        version: '1.3.0',
        run_id: 'test-run-123',
        categories: [
            {
                id: 'structure_readability',
                name: 'Structure & Readability',
                issue_count: 1,
                issues: [
                    {
                        check_id: 'single_h1',
                        name: 'Single H1 Tag',
                        ui_verdict: 'fail',
                        instances: 1,
                        first_instance_node_ref: 'block-1',
                        review_summary: 'The page uses more than one H1, so the primary heading is not singular.',
                        highlights: [{ node_ref: 'block-1', snippet: 'Example', message: 'Missing single H1', review_summary: 'The page uses more than one H1, so the primary heading is not singular.', type: 'issue' }],
                        // FORBIDDEN - should be stripped
                        explanation: 'Found 3 H1 tags instead of 1',
                        suggestions: [{ text: 'Remove extra H1' }],
                        confidence: 0.95
                    }
                ]
            }
        ]
    }
};

// Mock analysis result with PII
const mockAnalysisWithPII = {
    checks: {
        author_identified: {
            verdict: 'pass',
            explanation: 'Author email found: john.doe@example.com',
            highlights: [
                { snippet: 'Contact: john.doe@example.com or call 555-123-4567' }
            ],
            suggestions: [
                { text: 'Author SSN 123-45-6789 should not be in content' }
            ]
        }
    }
};

describe('Sidebar-Payload Hard Separation', () => {

    // ============================================
    // 1. STRIPPER LAYER TESTS
    // ============================================
    describe('1. Stripper Layer', () => {

        test('removes all forbidden root fields', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');

            FORBIDDEN_FIELDS.forEach(field => {
                expect(stripped).not.toHaveProperty(field);
            });
        });

        test('preserves only allowed root fields', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');

            expect(stripped).toHaveProperty('ok', true);
            expect(stripped).toHaveProperty('run_id', 'test-run-123');
            expect(stripped).toHaveProperty('status', 'success');
            expect(stripped).toHaveProperty('scores');
            expect(stripped).toHaveProperty('analysis_summary');
            expect(stripped).toHaveProperty('details_token');
        });

        test('preserves sanitized billing summary without exposing ledger internals', () => {
            const stripped = stripSidebarPayload({
                ok: true,
                run_id: 'test-run-billing',
                status: 'success',
                billing_summary: {
                    billing_status: 'settled',
                    credits_used: 1184,
                    reserved_credits: 1400,
                    refunded_credits: 216,
                    previous_balance: 60000,
                    current_balance: 58816,
                    raw_cost_usd: 0.039467,
                    pricing_version: 'mistral-public-2026-03-06',
                    event_id: 'ledger_123',
                    account_id: 'acct_1'
                }
            }, 'test-run-billing');

            expect(stripped.billing_summary).toEqual({
                billing_status: 'settled',
                credits_used: 1184,
                reserved_credits: 1400,
                refunded_credits: 216,
                previous_balance: 60000,
                current_balance: 58816
            });
            expect(stripped.billing_summary).not.toHaveProperty('raw_cost_usd');
            expect(stripped.billing_summary).not.toHaveProperty('pricing_version');
            expect(stripped.billing_summary).not.toHaveProperty('event_id');
            expect(stripped.billing_summary).not.toHaveProperty('account_id');
        });

        test('preserves partial contract fields only', () => {
            const payload = {
                ok: true,
                run_id: 'test-partial-run',
                status: 'success_partial',
                partial: {
                    mode: 'mixed',
                    reason: 'missing_ai_checks',
                    expected_ai_checks: 34,
                    returned_ai_checks: 31,
                    missing_ai_checks: 3,
                    filtered_invalid_checks: 1,
                    completed_checks: 49,
                    raw_error: 'should_not_pass'
                },
                analysis_summary: {
                    version: '1.2.0',
                    run_id: 'test-partial-run',
                    status: 'success_partial',
                    partial: {
                        mode: 'mixed',
                        reason: 'missing_ai_checks',
                        expected_ai_checks: 34,
                        returned_ai_checks: 31,
                        raw_error: 'strip_me'
                    },
                    categories: []
                }
            };

            const stripped = stripSidebarPayload(payload, 'test-partial-run');
            expect(stripped.partial).toEqual({
                mode: 'mixed',
                reason: 'missing_ai_checks',
                expected_ai_checks: 34,
                returned_ai_checks: 31,
                missing_ai_checks: 3,
                filtered_invalid_checks: 1,
                completed_checks: 49
            });
            expect(stripped.analysis_summary.status).toBe('success_partial');
            expect(stripped.analysis_summary.partial).toEqual({
                mode: 'mixed',
                reason: 'missing_ai_checks',
                expected_ai_checks: 34,
                returned_ai_checks: 31
            });
        });

        test('strips forbidden fields from issues', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');

            const issue = stripped.analysis_summary.categories[0].issues[0];

            // Should NOT have forbidden fields
            expect(issue).not.toHaveProperty('explanation');
            expect(issue).not.toHaveProperty('suggestions');
            expect(issue).not.toHaveProperty('confidence');

            // Should have only allowed fields
            expect(issue).toHaveProperty('check_id');
            expect(issue).toHaveProperty('check_name');
            expect(issue).toHaveProperty('name');
            expect(issue).toHaveProperty('ui_verdict');
            expect(issue).toHaveProperty('instances');
            expect(issue).toHaveProperty('first_instance_node_ref');
            expect(issue).toHaveProperty('review_summary');
            expect(issue).toHaveProperty('highlights');
            issue.highlights.forEach(highlight => {
                expect(highlight).toHaveProperty('snippet');
                expect(highlight).toHaveProperty('message');
                expect(highlight).toHaveProperty('review_summary');
            });
        });

        test('preserves sanitized review_summary on issues and highlights', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const issue = stripped.analysis_summary.categories[0].issues[0];

            expect(issue.review_summary).toBe('The page uses more than one H1, so the primary heading is not singular.');
            expect(issue.highlights[0].review_summary).toBe('The page uses more than one H1, so the primary heading is not singular.');
        });

        test('issue has exactly allowed fields only', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const issue = stripped.analysis_summary.categories[0].issues[0];
            const issueKeys = Object.keys(issue);

            // Every key in issue should be in allowed list
            issueKeys.forEach(key => {
                expect(ALLOWED_ISSUE_FIELDS).toContain(key);
            });

            // Issue should have all allowed fields
            ALLOWED_ISSUE_FIELDS.forEach(field => {
                expect(issue).toHaveProperty(field);
            });
        });

        test('deep scan finds nested forbidden content', () => {
            const badPayload = {
                analysis_summary: {
                    categories: [{
                        issues: [{
                            check_id: 'test',
                            explanation: 'should not be here'
                        }]
                    }]
                }
            };

            const forbidden = scanForForbiddenContent(badPayload);
            expect(forbidden.length).toBeGreaterThan(0);
            expect(forbidden).toContain('analysis_summary.categories[0].issues[0].explanation');
        });
    });

    // ============================================
    // 2. VALIDATION TESTS
    // ============================================
    describe('2. Payload Validation', () => {

        test('validates clean payload as valid', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const validation = validateSidebarPayload(stripped);

            expect(validation.valid).toBe(true);
            expect(validation.violations).toHaveLength(0);
        });

        test('detects forbidden root fields', () => {
            const badPayload = {
                ok: true,
                run_id: 'test',
                explanation: 'forbidden'
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations).toContain('forbidden_root_field:explanation');
        });

        test('detects forbidden nested fields in issues', () => {
            const badPayload = {
                ok: true,
                analysis_summary: {
                    categories: [{
                        id: 'test',
                        name: 'Test',
                        issue_count: 1,
                        issues: [{
                            check_id: 'test',
                            name: 'Test',
                            ui_verdict: 'fail',
                            instances: 1,
                            first_instance_node_ref: null,
                            confidence: 0.95 // FORBIDDEN
                        }]
                    }]
                }
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations.some(v => v.includes('confidence'))).toBe(true);
        });
    });

    // ============================================
    // 3. INSTANCE NAVIGATION CONTRACT
    // ============================================
    describe('3. Instance Navigation Contract', () => {

        test('instances is a count, not an array', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const issue = stripped.analysis_summary.categories[0].issues[0];

            expect(typeof issue.instances).toBe('number');
            expect(Array.isArray(issue.instances)).toBe(false);
        });

        test('first_instance_node_ref is string or null', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const issue = stripped.analysis_summary.categories[0].issues[0];

            expect(
                typeof issue.first_instance_node_ref === 'string' ||
                issue.first_instance_node_ref === null
            ).toBe(true);
        });

        test('no offsets at issue root level', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const issue = stripped.analysis_summary.categories[0].issues[0];

            expect(issue).not.toHaveProperty('start');
            expect(issue).not.toHaveProperty('end');
            expect(issue).not.toHaveProperty('offset');
        });
    });

    // ============================================
    // 4. PII SCRUBBING TESTS
    // ============================================
    describe('4. PII Scrubbing', () => {

        test('redacts email addresses', () => {
            const { scrubbed } = scrubString('Contact john@example.com for info');

            expect(scrubbed).not.toContain('john@example.com');
            expect(scrubbed).toContain('[EMAIL_REDACTED]');
        });

        test('redacts SSN patterns', () => {
            const { scrubbed } = scrubString('SSN: 123-45-6789');

            expect(scrubbed).not.toContain('123-45-6789');
            expect(scrubbed).toContain('[SSN_REDACTED]');
        });

        test('redacts phone numbers', () => {
            const { scrubbed } = scrubString('Call 555-123-4567');

            expect(scrubbed).not.toContain('555-123-4567');
            expect(scrubbed).toContain('[PHONE_REDACTED]');
        });

        test('redacts credit card patterns', () => {
            const { scrubbed } = scrubString('Card: 4111-1111-1111-1111');

            expect(scrubbed).not.toContain('4111-1111-1111-1111');
            expect(scrubbed).toContain('[CC_REDACTED]');
        });

        test('scrubs PII from analysis result', () => {
            const { scrubbed, piiDetected, detections } = scrubAnalysisResult(mockAnalysisWithPII, 'test-run');

            expect(piiDetected).toBe(true);
            expect(detections.length).toBeGreaterThan(0);

            // Check explanation is scrubbed
            expect(scrubbed.checks.author_identified.explanation).not.toContain('john.doe@example.com');
            expect(scrubbed.checks.author_identified.explanation).toContain('[EMAIL_REDACTED]');

            // Check highlights are scrubbed
            expect(scrubbed.checks.author_identified.highlights[0].snippet).not.toContain('john.doe@example.com');
            expect(scrubbed.checks.author_identified.highlights[0].snippet).not.toContain('555-123-4567');

            // Check suggestions are scrubbed
            expect(scrubbed.checks.author_identified.suggestions[0].text).not.toContain('123-45-6789');
        });

        test('adds _pii_scrubbed metadata when PII detected', () => {
            const { scrubbed, piiDetected } = scrubAnalysisResult(mockAnalysisWithPII, 'test-run');

            expect(piiDetected).toBe(true);
            expect(scrubbed).toHaveProperty('_pii_scrubbed');
            expect(scrubbed._pii_scrubbed).toHaveProperty('scrubbed_at');
            expect(scrubbed._pii_scrubbed).toHaveProperty('detection_count');
            expect(scrubbed._pii_scrubbed).toHaveProperty('types');
        });

        test('does not add _pii_scrubbed when no PII', () => {
            const cleanAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'pass',
                        explanation: 'No PII in this text'
                    }
                }
            };

            const { scrubbed, piiDetected } = scrubAnalysisResult(cleanAnalysis, 'test-run');

            expect(piiDetected).toBe(false);
            expect(scrubbed).not.toHaveProperty('_pii_scrubbed');
        });
    });

    // ============================================
    // 5. SECURITY ENFORCEMENT
    // ============================================
    describe('5. Security Enforcement', () => {

        test('sidebar payload never contains explanation', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const json = JSON.stringify(stripped);

            expect(json).not.toContain('"explanation"');
        });

        test('sidebar payload highlights are compact', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const issue = stripped.analysis_summary.categories[0].issues[0];

            expect(Array.isArray(issue.highlights)).toBe(true);
            issue.highlights.forEach(highlight => {
                Object.keys(highlight).forEach(key => {
                    expect(ALLOWED_HIGHLIGHT_FIELDS).toContain(key);
                });
            });
        });

        test('sidebar payload never contains suggestions', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const json = JSON.stringify(stripped);

            expect(json).not.toContain('"suggestions"');
        });

        test('sidebar payload never contains snippets', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const json = JSON.stringify(stripped);

            expect(json).not.toContain('"snippets"');
        });

        test('sidebar payload never contains confidence', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');
            const json = JSON.stringify(stripped);

            expect(json).not.toContain('"confidence"');
        });

        test('sidebar payload never contains result_url', () => {
            const stripped = stripSidebarPayload(mockPayloadWithForbidden, 'test-run');

            expect(stripped).not.toHaveProperty('result_url');
            expect(stripped).not.toHaveProperty('result_s3');
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    console.log('Run with: npx jest sidebar-hard-separation.test.js');
}
