/**
 * Sidebar Noise Elimination Tests
 *
 * 6 Automated Validation Tests:
 * 1. Payload shape test - analysis_summary validates vs schema
 * 2. Visibility test - only fail/partial in issues[]
 * 3. No-prose test - no forbidden keys (explanation, suggestions, etc.)
 * 4. Ordering test - fail first, then partial, alphabetical within groups
 * 5. Instance contract test - first_instance_node_ref present if instances > 0
 * 6. CI guard - fail on forbidden fields with exact list
 */

const { serializeForSidebar, buildCategoryLookup } = require('./analysis-serializer');
const { validateSidebarPayload, FORBIDDEN_FIELDS, ALLOWED_ISSUE_FIELDS } = require('./sidebar-payload-stripper');

// Forbidden prose/metadata keys
const FORBIDDEN_PROSE_KEYS = [
    'explanation', 'suggestions', 'confidence', 'score'
];

// Expected schema fields
const EXPECTED_SUMMARY_FIELDS = ['version', 'run_id', 'categories'];
const EXPECTED_CATEGORY_FIELDS = ['id', 'name', 'issue_count', 'issues'];
const EXPECTED_ISSUE_FIELDS = [
    'check_id',
    'detail_ref',
    'name',
    'ui_verdict',
    'instances',
    'first_instance_node_ref',
    'first_instance_snippet',
    'first_instance_signature',
    'first_instance_start',
    'first_instance_end',
    'analysis_ref',
    'rewrite_target',
    'repair_intent',
    'explanation_pack',
    'issue_explanation',
    'review_summary',
    'fix_assist_triage',
    'highlights'
];

describe('Sidebar Noise Elimination', () => {

    // ============================================
    // TEST 1: PAYLOAD SHAPE TEST
    // ============================================
    describe('1. Payload Shape Test', () => {

        test('analysis_summary has correct top-level fields', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // Must have exactly these fields
            expect(Object.keys(analysis_summary).sort()).toEqual(EXPECTED_SUMMARY_FIELDS.sort());
        });

        test('analysis_summary.version is 1.2.0', () => {
            const mockAnalysis = { checks: {} };
            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            expect(analysis_summary.version).toBe('1.2.0');
        });

        test('categories have correct fields', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            analysis_summary.categories.forEach(cat => {
                expect(Object.keys(cat).sort()).toEqual(EXPECTED_CATEGORY_FIELDS.sort());
            });
        });

        test('issues have exactly the allowed fields', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [{ node_ref: 'block-1' }] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    expect(Object.keys(issue).sort()).toEqual(EXPECTED_ISSUE_FIELDS.sort());
                });
            });
        });

        test('analysis_summary issues expose review_summary when present', () => {
            const mockAnalysis = {
                checks: {
                    immediate_answer_placement: {
                        verdict: 'partial',
                        explanation: 'Answer appears at 121-150 words after the question anchor.',
                        ai_explanation_pack: {
                            what_failed: 'Answer appears at 121-150 words after the question anchor.',
                            why_it_matters: 'The answer arrives after setup, so extraction is weaker.',
                            how_to_fix_steps: ['Lead with the direct answer before supporting context.']
                        },
                        highlights: [{ node_ref: 'block-1', snippet: 'Example answer block' }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');
            const issue = analysis_summary.categories[0].issues[0];

            expect(issue.review_summary).toBeTruthy();
            expect(issue.review_summary).not.toMatch(/121-150 words after the question anchor/i);
        });
    });

    // ============================================
    // TEST 2: VISIBILITY TEST
    // ============================================
    describe('2. Visibility Test', () => {

        test('only fail/partial issues appear in analysis_summary', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] },
                    logical_heading_hierarchy: { verdict: 'pass', highlights: [] },
                    heading_topic_fulfillment: { verdict: 'partial', highlights: [] },
                    heading_fragmentation: { verdict: 'pass', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const allVerdicts = [];
            analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    allVerdicts.push(issue.ui_verdict);
                });
            });

            // Only fail and partial should be present
            allVerdicts.forEach(verdict => {
                expect(['fail', 'partial']).toContain(verdict);
            });

            // pass verdicts must NOT be present
            expect(allVerdicts).not.toContain('pass');
        });

        test('pass checks are excluded from issues list', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'pass', highlights: [] },
                    logical_heading_hierarchy: { verdict: 'pass', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // No categories should have issues (all pass)
            expect(analysis_summary.categories.length).toBe(0);
        });

        test('validateSidebarPayload rejects pass in issues', () => {
            const badPayload = {
                ok: true,
                analysis_summary: {
                    version: '1.2.0',
                    run_id: 'test',
                    categories: [{
                        id: 'structure_readability',
                        name: 'Structure & Readability',
                        issue_count: 1,
                        issues: [{
                            check_id: 'single_h1',
                            name: 'Single H1 Tag',
                            ui_verdict: 'pass', // FORBIDDEN
                            instances: 1,
                            first_instance_node_ref: null
                        }]
                    }]
                }
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations.some(v => v.includes('forbidden_verdict_in_issues'))).toBe(true);
        });
    });

    // ============================================
    // TEST 3: NO-PROSE TEST
    // ============================================
    describe('3. No-Prose Test', () => {

        test('analysis_summary contains no forbidden prose keys', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        highlights: [{ node_ref: 'block-1', start: 0, end: 10 }],
                        explanation: 'This is a detailed explanation',
                        suggestions: [{ text: 'Fix this' }],
                        confidence: 0.95
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // Deep check for forbidden keys
            const checkForForbiddenKeys = (obj, path = '') => {
                const found = [];
                if (!obj || typeof obj !== 'object') return found;

                Object.entries(obj).forEach(([key, value]) => {
                    const currentPath = path ? `${path}.${key}` : key;
                    if (FORBIDDEN_PROSE_KEYS.includes(key)) {
                        found.push(currentPath);
                    }
                    if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value)) {
                            value.forEach((item, idx) => {
                                found.push(...checkForForbiddenKeys(item, `${currentPath}[${idx}]`));
                            });
                        } else {
                            found.push(...checkForForbiddenKeys(value, currentPath));
                        }
                    }
                });
                return found;
            };

            const forbidden = checkForForbiddenKeys(analysis_summary);
            expect(forbidden).toHaveLength(0);
        });

        test('validateSidebarPayload catches forbidden prose', () => {
            const badPayload = {
                ok: true,
                analysis_summary: {
                    version: '1.2.0',
                    run_id: 'test',
                    categories: [{
                        id: 'structure_readability',
                        name: 'Structure & Readability',
                        issue_count: 1,
                        issues: [{
                            check_id: 'single_h1',
                            name: 'Single H1 Tag',
                            ui_verdict: 'fail',
                            instances: 1,
                            first_instance_node_ref: null,
                            explanation: 'FORBIDDEN PROSE' // Should not be here
                        }]
                    }]
                }
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations.some(v => v.includes('forbidden_issue_field'))).toBe(true);
        });
    });

    // ============================================
    // TEST 4: ORDERING TEST
    // ============================================
    describe('4. Ordering Test', () => {

        test('fail issues come before partial issues within category', () => {
            const mockAnalysis = {
                checks: {
                    // Multiple checks in same category with different verdicts
                    single_h1: { verdict: 'fail', highlights: [] },
                    logical_heading_hierarchy: { verdict: 'partial', highlights: [] },
                    heading_topic_fulfillment: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // Find structure_readability category
            const cat = analysis_summary.categories.find(c => c.id === 'structure_readability');
            expect(cat).toBeDefined();

            // All fails should come before any partial
            let seenPartial = false;
            cat.issues.forEach(issue => {
                if (issue.ui_verdict === 'fail') {
                    expect(seenPartial).toBe(false);
                }
                if (issue.ui_verdict === 'partial') {
                    seenPartial = true;
                }
            });
        });

        test('issues are alphabetically sorted within verdict groups', () => {
            const mockAnalysis = {
                checks: {
                    heading_topic_fulfillment: { verdict: 'fail', highlights: [] },
                    single_h1: { verdict: 'fail', highlights: [] },
                    appropriate_paragraph_length: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const cat = analysis_summary.categories.find(c => c.id === 'structure_readability');
            expect(cat).toBeDefined();

            // Check alphabetical order within fails
            const failNames = cat.issues.filter(i => i.ui_verdict === 'fail').map(i => i.name);
            const sortedNames = [...failNames].sort((a, b) => a.localeCompare(b));
            expect(failNames).toEqual(sortedNames);
        });

        test('validateSidebarPayload detects ordering violations', () => {
            const badPayload = {
                ok: true,
                analysis_summary: {
                    version: '1.2.0',
                    run_id: 'test',
                    categories: [{
                        id: 'structure_readability',
                        name: 'Structure & Readability',
                        issue_count: 2,
                        issues: [
                            { check_id: 'a', name: 'A', ui_verdict: 'partial', instances: 1, first_instance_node_ref: null },
                            { check_id: 'b', name: 'B', ui_verdict: 'fail', instances: 1, first_instance_node_ref: null } // WRONG ORDER
                        ]
                    }]
                }
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations.some(v => v.includes('ordering_violation'))).toBe(true);
        });
    });

    // ============================================
    // TEST 5: INSTANCE CONTRACT TEST
    // ============================================
    describe('5. Instance Contract Test', () => {

        test('first_instance_node_ref is present when highlights exist', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        highlights: [{ node_ref: 'block-123', start: 0, end: 10 }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const issue = analysis_summary.categories[0].issues[0];
            expect(issue.first_instance_node_ref).toBe('block-123');
            expect(issue.instances).toBe(1);
        });

        test('first_instance_node_ref is null when no highlights', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const issue = analysis_summary.categories[0].issues[0];
            expect(issue.first_instance_node_ref).toBeNull();
            expect(issue.instances).toBe(1);
        });

        test('instances count matches highlights length', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        highlights: [
                            { node_ref: 'block-1' },
                            { node_ref: 'block-2' },
                            { node_ref: 'block-3' }
                        ]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const issue = analysis_summary.categories[0].issues[0];
            expect(issue.instances).toBe(3);
            expect(issue.first_instance_node_ref).toBe('block-1');
        });

        test('first_instance_node_ref never contains raw HTML or text', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        highlights: [{ node_ref: 'block-safe-123', start: 0, end: 10 }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const issue = analysis_summary.categories[0].issues[0];

            // Should be a safe block ID, not HTML/text
            expect(issue.first_instance_node_ref).not.toMatch(/<[^>]*>/); // No HTML tags
            expect(issue.first_instance_node_ref).not.toMatch(/\s{3,}/); // No long whitespace (text)
        });
    });

    // ============================================
    // TEST 6: CI GUARD TEST
    // ============================================
    describe('6. CI Guard Test', () => {

        test('validateSidebarPayload returns exact list of violations', () => {
            const badPayload = {
                ok: true,
                explanation: 'FORBIDDEN AT ROOT', // Forbidden root field
                analysis_summary: {
                    version: '1.2.0',
                    run_id: 'test',
                    categories: [{
                        id: 'structure_readability',
                        name: 'Structure & Readability',
                        issue_count: 1,
                        issues: [{
                            check_id: 'single_h1',
                            name: 'Single H1 Tag',
                            ui_verdict: 'fail',
                            instances: 1,
                            first_instance_node_ref: null,
                            confidence: 0.95, // FORBIDDEN
                            score: 0.5 // FORBIDDEN
                        }]
                    }]
                }
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations.length).toBeGreaterThan(0);

            // Should identify specific forbidden fields
            expect(validation.violations.some(v => v.includes('explanation'))).toBe(true);
            expect(validation.violations.some(v => v.includes('confidence'))).toBe(true);
        });

        test('CI fails if serializer outputs forbidden fields', () => {
            // This test simulates what CI should check
            const mockAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        highlights: [],
                        explanation: 'Some explanation',
                        suggestions: [{ text: 'Fix it' }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // Build full payload
            const payload = {
                ok: true,
                run_id: 'test-run',
                status: 'success',
                analysis_summary
            };

            const validation = validateSidebarPayload(payload);

            // Serializer should produce clean output
            expect(validation.valid).toBe(true);
            expect(validation.violations).toHaveLength(0);
        });

        test('complete payload passes all validation', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [{ node_ref: 'block-1' }] },
                    logical_heading_hierarchy: { verdict: 'partial', highlights: [] },
                    heading_topic_fulfillment: { verdict: 'pass', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const payload = {
                ok: true,
                run_id: 'test-run',
                status: 'success',
                scores: { AEO: 0.75, GEO: 0.70, GLOBAL: 0.72 },
                analysis_summary,
                completed_at: new Date().toISOString(),
                details_token: 'abc123'
            };

            const validation = validateSidebarPayload(payload);

            expect(validation.valid).toBe(true);
            expect(validation.violations).toHaveLength(0);
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    console.log('Run with: npx jest sidebar-noise-elimination.test.js');
}
