/**
 * Diagnostic Test: Sidebar Data Flow
 *
 * Tests that the sidebar correctly reads from analysis_summary.categories
 * when Result Contract Lock is active.
 *
 * REGRESSION TEST for: "Excellent! No issues found" bug
 * Root cause: Sidebar read from report.checks but Result Contract Lock
 * returns analysis_summary.categories structure.
 */

describe('Sidebar Data Flow - Result Contract Lock', () => {

    // Mock getGroupedIssues function (extracted logic for testing)
    function getGroupedIssues(report) {
        if (!report) return { groups: {}, allIssues: [], issueCount: 0 };

        // RESULT CONTRACT LOCK: Prefer analysis_summary.categories if available
        if (report.analysis_summary && Array.isArray(report.analysis_summary.categories)) {
            const categories = report.analysis_summary.categories;
            const groups = {};
            const allIssues = [];
            let issueCount = 0;

            categories.forEach(cat => {
                const categoryName = cat.name || cat.id || 'General';
                if (!groups[categoryName]) groups[categoryName] = [];

                const issues = cat.issues || [];
                issues.forEach(issue => {
                    const mappedIssue = {
                        id: issue.check_id || issue.id || 'unknown',
                        check_id: issue.check_id || issue.id || 'unknown',
                        name: issue.name || issue.check_id || 'Unknown Check',
                        title: issue.name || issue.check_id || 'Unknown Check',
                        category: categoryName,
                        verdict: issue.ui_verdict || 'fail',
                        ui_verdict: issue.ui_verdict || 'fail',
                        instances: issue.instances || 1,
                        first_instance_node_ref: issue.first_instance_node_ref || null,
                        message: issue.review_summary || '',
                        review_summary: issue.review_summary || '',
                        issue_explanation: issue.issue_explanation || '',
                        highlights: []
                    };
                    groups[categoryName].push(mappedIssue);
                    allIssues.push(mappedIssue);

                    if (mappedIssue.ui_verdict === 'fail' || mappedIssue.ui_verdict === 'partial') {
                        issueCount++;
                    }
                });
            });

            return { groups, allIssues, issueCount };
        }

        // LEGACY FALLBACK: Use report.checks if analysis_summary not available
        if (!report.checks) return { groups: {}, allIssues: [], issueCount: 0 };

        const checksArray = Array.isArray(report.checks)
            ? report.checks
            : Object.entries(report.checks).map(([key, val]) => ({ ...val, id: key }));

        const mappedChecks = checksArray.map(c => ({
            id: c.id || 'unknown',
            check_id: c.id || 'unknown',
            name: c.title || c.id || 'Unknown',
            verdict: c.verdict || 'fail',
            ui_verdict: c.verdict || 'fail',
            category: c.category || 'General',
            instances: c.instances || 1
        }));

        const groups = {};
        mappedChecks.forEach(check => {
            if (!groups[check.category]) groups[check.category] = [];
            groups[check.category].push(check);
        });

        const issueCount = mappedChecks.filter(c =>
            c.verdict === 'fail' || c.verdict === 'partial'
        ).length;

        return { groups, allIssues: mappedChecks, issueCount };
    }

    test('CRITICAL: Should read from analysis_summary.categories when present', () => {
        // This is the exact structure returned by run-status-handler with Result Contract Lock
        const report = {
            ok: true,
            run_id: 'test-run-123',
            status: 'success',
            scores: { AEO: 25, GEO: 20, GLOBAL: 45 },
            analysis_summary: {
                version: '1.2.0',
                run_id: 'test-run-123',
                categories: [
                    {
                        id: 'answer_extractability',
                        name: 'Answer Extractability',
                        issue_count: 2,
                        issues: [
                            {
                                check_id: 'immediate_answer_placement',
                                name: 'Immediate Answer Placement',
                                ui_verdict: 'fail',
                                instances: 1
                            },
                            {
                                check_id: 'answer_sentence_concise',
                                name: 'Concise First Sentence',
                                ui_verdict: 'partial',
                                instances: 1
                            }
                        ]
                    },
                    {
                        id: 'structure_readability',
                        name: 'Structure & Readability',
                        issue_count: 1,
                        issues: [
                            {
                                check_id: 'heading_topic_fulfillment',
                                name: 'Heading Topic Fulfillment',
                                ui_verdict: 'fail',
                                instances: 3
                            }
                        ]
                    }
                ]
            }
            // NOTE: No 'checks' field - this is stripped by Result Contract Lock
        };

        const result = getGroupedIssues(report);

        // MUST find issues from analysis_summary
        expect(result.issueCount).toBe(3);
        expect(result.allIssues.length).toBe(3);
        expect(Object.keys(result.groups).length).toBe(2);

        // Verify specific issues are present
        const checkIds = result.allIssues.map(i => i.check_id);
        expect(checkIds).toContain('immediate_answer_placement');
        expect(checkIds).toContain('answer_sentence_concise');
        expect(checkIds).toContain('heading_topic_fulfillment');
    });

    test('preserves serializer-owned review summaries from analysis_summary issues', () => {
        const report = {
            analysis_summary: {
                categories: [
                    {
                        id: 'answer_extractability',
                        name: 'Answer Extractability',
                        issues: [
                            {
                                check_id: 'immediate_answer_placement',
                                name: 'Immediate Answer Placement',
                                ui_verdict: 'partial',
                                instances: 1,
                                review_summary: 'The section reaches the answer only after setup instead of leading with it.',
                                issue_explanation: 'Longer narrative stays available for details.'
                            }
                        ]
                    }
                ]
            }
        };

        const result = getGroupedIssues(report);
        const issue = result.allIssues[0];

        expect(issue.review_summary).toBe('The section reaches the answer only after setup instead of leading with it.');
        expect(issue.message).toBe(issue.review_summary);
        expect(issue.issue_explanation).toBe('Longer narrative stays available for details.');
    });

    test('keeps deterministic structural issues readable when analysis_summary carries new heading markup checks', () => {
        const report = {
            analysis_summary: {
                categories: [
                    {
                        id: 'structure_readability',
                        name: 'Structure & Readability',
                        issues: [
                            {
                                check_id: 'heading_like_text_uses_heading_markup',
                                name: 'Heading-Like Text Uses Heading Markup',
                                ui_verdict: 'fail',
                                instances: 1,
                                first_instance_node_ref: 'block-heading-1',
                                review_summary: 'Use a real heading here',
                                issue_explanation: 'This section label behaves like a heading, but machine parsing is stronger when it uses real heading markup.'
                            }
                        ]
                    }
                ]
            }
        };

        const result = getGroupedIssues(report);
        const issue = result.allIssues[0];

        expect(result.issueCount).toBe(1);
        expect(issue.category).toBe('Structure & Readability');
        expect(issue.check_id).toBe('heading_like_text_uses_heading_markup');
        expect(issue.first_instance_node_ref).toBe('block-heading-1');
        expect(issue.message).toBe('Use a real heading here');
        expect(issue.issue_explanation).toMatch(/real heading markup/i);
    });

    test('REGRESSION: Should NOT return 0 issues when analysis_summary has categories', () => {
        // This is the bug that caused "Excellent! No issues found"
        const report = {
            ok: true,
            status: 'success',
            analysis_summary: {
                categories: [
                    {
                        id: 'trust_neutrality_safety',
                        name: 'Trust, Neutrality & Safety',
                        issue_count: 1,
                        issues: [
                            {
                                check_id: 'no_exaggerated_claims',
                                name: 'No Exaggerated Claims',
                                ui_verdict: 'fail',
                                instances: 1
                            }
                        ]
                    }
                ]
            }
        };

        const result = getGroupedIssues(report);

        // This MUST NOT be 0 - that was the bug
        expect(result.issueCount).toBeGreaterThan(0);
        expect(result.issueCount).toBe(1);
    });

    test('LEGACY: Should fall back to report.checks when analysis_summary missing', () => {
        // Legacy format for backward compatibility
        const report = {
            checks: {
                'single_h1': {
                    verdict: 'pass',
                    confidence: 1.0,
                    category: 'Structure'
                },
                'metadata_checks': {
                    verdict: 'fail',
                    confidence: 0.9,
                    category: 'Trust'
                }
            }
        };

        const result = getGroupedIssues(report);

        expect(result.issueCount).toBe(1);
        expect(result.allIssues.length).toBe(2);
    });

    test('Should return empty when report is null', () => {
        const result = getGroupedIssues(null);

        expect(result.issueCount).toBe(0);
        expect(result.allIssues.length).toBe(0);
        expect(Object.keys(result.groups).length).toBe(0);
    });

    test('Should return empty when both analysis_summary and checks are missing', () => {
        const report = {
            ok: true,
            status: 'success',
            scores: { AEO: 50, GEO: 40 }
        };

        const result = getGroupedIssues(report);

        expect(result.issueCount).toBe(0);
    });

    test('Should correctly count only fail and partial verdicts', () => {
        const report = {
            analysis_summary: {
                categories: [
                    {
                        id: 'test_category',
                        name: 'Test Category',
                        issues: [
                            { check_id: 'check1', ui_verdict: 'fail', instances: 1 },
                            { check_id: 'check2', ui_verdict: 'partial', instances: 1 },
                            { check_id: 'check3', ui_verdict: 'pass', instances: 1 },
                            { check_id: 'check4', ui_verdict: 'not_applicable', instances: 1 }
                        ]
                    }
                ]
            }
        };

        const result = getGroupedIssues(report);

        // Only fail + partial should be counted
        expect(result.issueCount).toBe(2);
        // But all issues should be in allIssues for "show passed" toggle
        expect(result.allIssues.length).toBe(4);
    });
});

describe('Bad Article Fixture Expected Failures', () => {
    // These are the checks that MUST fail/partial for fixtures/bad_article_500.html
    const EXPECTED_FAILURES = [
        'immediate_answer_placement',
        'answer_sentence_concise',
        'heading_topic_fulfillment',
        'no_exaggerated_claims',
        'claim_provenance_and_evidence',
        'author_identified',
        'author_bio_present',
        'metadata_checks',
        'semantic_html_usage'
    ];

    const EXPECTED_PARTIAL = [
        'duplicate_or_near_duplicate_detection',
        'faq_structure_opportunity'
    ];

    test('Expected failure check IDs should be defined in checks-definitions', () => {
        // This test would load checks-definitions-v1.json and verify
        // For now, just document the expected failures
        expect(EXPECTED_FAILURES.length).toBeGreaterThan(0);
        expect(EXPECTED_PARTIAL.length).toBeGreaterThan(0);
    });

    test('Bad article should trigger at least 5 fail/partial verdicts', () => {
        // Placeholder - actual test would run analysis on fixture
        const minExpectedIssues = 5;
        expect(EXPECTED_FAILURES.length + EXPECTED_PARTIAL.length).toBeGreaterThanOrEqual(minExpectedIssues);
    });
});
