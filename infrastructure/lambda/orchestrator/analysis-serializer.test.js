/**
 * Acceptance Tests for Result Contract Lock
 *
 * Tests:
 * 1. checks_definitions header updated to 38
 * 2. Sample run returns analysis_summary containing only fail/partial checks
 * 3. No explanation, highlights, suggestions in analysis_summary
 * 4. Full analyzer JSON saved to artifact store
 * 5. Details endpoint returns full check object with highlights and suggestions
 * 6. UI-visible issues count equals number of ui_verdict values in fail|partial
 */

const fs = require('fs');
const path = require('path');
const {
    mapVerdictToUiVerdict,
    serializeForSidebar,
    enrichWithUiVerdict,
    prepareSidebarPayload,
    extractCheckDetails,
    buildCategoryLookup,
    buildHighlightedHtml
} = require('./analysis-serializer');

// Mock full analysis result for testing
const mockFullAnalysis = {
    scores: { AEO: 45, GEO: 38, GLOBAL: 83 },
    checks: {
        direct_answer_first_120: {
            verdict: 'pass',
            confidence: 0.95,
            explanation: 'Direct answer found in first 50 words.',
            highlights: [],
            suggestions: []
        },
        single_h1: {
            verdict: 'fail',
            confidence: 0.99,
            explanation: 'Found 3 H1 tags instead of 1.',
            highlights: [
                { node_ref: 'block-123', signature: 'sig-123', start: 0, end: 20, snippet: 'Example H1 one', message: 'Multiple H1 tags detected.', type: 'issue' },
                { node_ref: 'block-456', signature: 'sig-456', start: 0, end: 15, snippet: 'Example H1 two', message: 'Multiple H1 tags detected.', type: 'issue' }
            ],
            suggestions: [
                { text: 'Remove extra H1 tags and keep only the main title.' }
            ]
        },
        logical_heading_hierarchy: {
            verdict: 'partial',
            confidence: 0.85,
            explanation: 'Skipped from H2 to H4 in one section.',
            highlights: [
                { node_ref: 'block-789', signature: 'sig-789', start: 10, end: 50, snippet: 'Heading jump', message: 'Heading level skips from H2 to H4.', type: 'issue' }
            ],
            suggestions: [
                { text: 'Add H3 headings between H2 and H4.' }
            ]
        },
        author_identified: {
            verdict: 'pass',
            confidence: 0.90,
            explanation: 'Author metadata check passed for this content type.',
            highlights: [],
            suggestions: []
        }
    },
    completed_at: '2026-01-29T17:00:00.000Z'
};

describe('Result Contract Lock - Acceptance Tests', () => {
    const originalSectionFirstFlag = process.env.REWRITE_SECTION_FIRST_V1;
    const originalStabilityReleaseMode = process.env.STABILITY_RELEASE_MODE_V1;

    afterEach(() => {
        if (typeof originalSectionFirstFlag === 'undefined') {
            delete process.env.REWRITE_SECTION_FIRST_V1;
        } else {
            process.env.REWRITE_SECTION_FIRST_V1 = originalSectionFirstFlag;
        }
        if (typeof originalStabilityReleaseMode === 'undefined') {
            delete process.env.STABILITY_RELEASE_MODE_V1;
        } else {
            process.env.STABILITY_RELEASE_MODE_V1 = originalStabilityReleaseMode;
        }
    });

    // Test 1: checks_definitions header updated to 45
    describe('1. Canonical checks count', () => {
        test('checks-definitions-v1.json states 51 checks', () => {
            const defPath = path.join(__dirname, '..', 'shared', 'schemas', 'checks-definitions-v1.json');
            const definitions = JSON.parse(fs.readFileSync(defPath, 'utf8'));

            expect(definitions.version).toBe('1.4.3');
            expect(definitions.total_checks).toBe(51);
            expect(definitions.description).toContain('51');
            expect(definitions.description).toContain('deterministic');
        });
    });

    // Test 2: ui_verdict mapping
    describe('2. ui_verdict mapping', () => {
        test('maps pass correctly', () => {
            expect(mapVerdictToUiVerdict('pass')).toBe('pass');
            expect(mapVerdictToUiVerdict('passed')).toBe('pass');
            expect(mapVerdictToUiVerdict('PASS')).toBe('pass');
        });

        test('maps fail correctly', () => {
            expect(mapVerdictToUiVerdict('fail')).toBe('fail');
            expect(mapVerdictToUiVerdict('failed')).toBe('fail');
            expect(mapVerdictToUiVerdict('FAIL')).toBe('fail');
        });

        test('maps partial correctly', () => {
            expect(mapVerdictToUiVerdict('partial')).toBe('partial');
            expect(mapVerdictToUiVerdict('PARTIAL')).toBe('partial');
        });

        test('rejects removed legacy verdict variants', () => {
            expect(mapVerdictToUiVerdict('not_applicable')).toBe('fail');
            expect(mapVerdictToUiVerdict('n/a')).toBe('fail');
            expect(mapVerdictToUiVerdict('na')).toBe('fail');
            expect(mapVerdictToUiVerdict('skipped')).toBe('fail');
        });

        test('unknown verdicts default to fail', () => {
            expect(mapVerdictToUiVerdict('unknown')).toBe('fail');
            expect(mapVerdictToUiVerdict('invalid')).toBe('fail');
            expect(mapVerdictToUiVerdict('')).toBe('fail');
            expect(mapVerdictToUiVerdict(null)).toBe('fail');
            expect(mapVerdictToUiVerdict(undefined)).toBe('fail');
        });

    test('warning verdict maps to fail', () => {
        expect(mapVerdictToUiVerdict('warning')).toBe('fail');
        expect(mapVerdictToUiVerdict('Warning')).toBe('fail');
    });
    });

    // Test 3: analysis_summary structure
    describe('3. analysis_summary structure', () => {
        test('returns analysis_summary with correct structure', () => {
            const { analysis_summary } = serializeForSidebar(mockFullAnalysis, 'test-run-123');

            expect(analysis_summary).toHaveProperty('version');
            expect(analysis_summary).toHaveProperty('run_id', 'test-run-123');
            expect(analysis_summary).toHaveProperty('categories');
            expect(Array.isArray(analysis_summary.categories)).toBe(true);
        });

        test('analysis_summary only contains fail/partial checks', () => {
            const { analysis_summary } = serializeForSidebar(mockFullAnalysis, 'test-run-123');

            // Count total issues across all categories
            let totalIssues = 0;
            analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    totalIssues++;
                    // Verify each issue has ui_verdict of fail or partial
                    expect(['fail', 'partial']).toContain(issue.ui_verdict);
                });
            });

            // Should have 2 issues: single_h1 (fail) and logical_heading_hierarchy (partial)
            expect(totalIssues).toBe(2);
        });

        test('suppresses synthetic diagnostic checks from analysis_summary', () => {
            const analysisWithSynthetic = JSON.parse(JSON.stringify(mockFullAnalysis));
            analysisWithSynthetic.checks.intro_factual_entities = {
                verdict: 'partial',
                confidence: 0.01,
                explanation: 'Synthetic fallback output',
                highlights: [],
                suggestions: [],
                provenance: 'synthetic',
                synthetic_generated: true,
                diagnostic_only: true
            };

            const { analysis_summary } = serializeForSidebar(analysisWithSynthetic, 'test-run-123');
            const totalIssues = analysis_summary.categories.reduce((sum, cat) => sum + cat.issue_count, 0);

            expect(totalIssues).toBe(2);
            const syntheticFound = analysis_summary.categories.some((cat) =>
                (cat.issues || []).some((issue) => issue.check_id === 'intro_factual_entities')
            );
            expect(syntheticFound).toBe(false);
        });

        test('analysis_summary does NOT contain explanation or suggestions', () => {
            const { analysis_summary } = serializeForSidebar(mockFullAnalysis, 'test-run-123');

            analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    expect(issue).not.toHaveProperty('explanation');
                    expect(issue).not.toHaveProperty('suggestions');
                    expect(issue).not.toHaveProperty('snippets');
                    expect(issue).not.toHaveProperty('offsets');
                });
            });
        });

        test('analysis_summary issues include compact highlights', () => {
            const { analysis_summary } = serializeForSidebar(mockFullAnalysis, 'test-run-123');

            const requiredFields = ['check_id', 'detail_ref', 'name', 'ui_verdict', 'instances', 'first_instance_node_ref', 'highlights'];

            analysis_summary.categories.forEach(cat => {
                expect(cat).toHaveProperty('id');
                expect(cat).toHaveProperty('name');
                expect(cat).toHaveProperty('issue_count');
                expect(cat).toHaveProperty('issues');

                cat.issues.forEach(issue => {
                    requiredFields.forEach(field => {
                        expect(issue).toHaveProperty(field);
                    });
                    if (Array.isArray(issue.highlights)) {
                        issue.highlights.forEach(highlight => {
                            expect(highlight).toHaveProperty('message');
                            expect(highlight).toHaveProperty('snippet');
                        });
                    }
                });
            });
        });

        test('analysis_summary fail/partial issues include rewrite context metadata', () => {
            const { analysis_summary } = serializeForSidebar(mockFullAnalysis, 'test-run-123');
            const allIssues = analysis_summary.categories.flatMap((category) => category.issues || []);
            expect(allIssues.length).toBeGreaterThan(0);

            allIssues.forEach((issue) => {
                expect(issue).toHaveProperty('analysis_ref');
                expect(issue).toHaveProperty('rewrite_target');
                expect(issue).toHaveProperty('repair_intent');
                expect(issue).toHaveProperty('explanation_pack');
                expect(issue.explanation_pack).toHaveProperty('what_failed');
                expect(issue.explanation_pack).toHaveProperty('why_it_matters');
                expect(issue.explanation_pack).toHaveProperty('how_to_fix_steps');
                expect(issue.explanation_pack).toHaveProperty('example_pattern');
                if (Array.isArray(issue.highlights)) {
                    issue.highlights.forEach((highlight) => {
                        expect(highlight).toHaveProperty('analysis_ref');
                        expect(highlight).toHaveProperty('rewrite_target');
                        expect(highlight).toHaveProperty('repair_intent');
                        expect(highlight).toHaveProperty('explanation_pack');
                        expect(highlight.explanation_pack).toHaveProperty('what_failed');
                        expect(highlight.explanation_pack).toHaveProperty('why_it_matters');
                        expect(highlight.explanation_pack).toHaveProperty('how_to_fix_steps');
                        expect(highlight.explanation_pack).toHaveProperty('example_pattern');
                    });
                }
            });
        });

        test('routes snippet-only inline summary projections to section when section-first flag is enabled', () => {
            process.env.REWRITE_SECTION_FIRST_V1 = 'true';

            const weakAnchorAnalysis = {
                checks: {
                    howto_semantic_validity: {
                        verdict: 'fail',
                        explanation: 'No logical steps found.',
                        highlights: [],
                        candidate_highlights: [
                            {
                                snippet: 'Some people say you should optimize images because images can be large and slow things down.'
                            }
                        ],
                        suggestions: []
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(weakAnchorAnalysis, 'test-run-weak-inline');
            const allIssues = analysis_summary.categories.flatMap((category) => category.issues || []);
            const issue = allIssues.find((entry) => entry.check_id === 'howto_semantic_validity');

            expect(issue).toBeDefined();
            expect(issue.rewrite_target).toBeDefined();
            expect(issue.rewrite_target.actionable).toBe(true);
            expect(issue.rewrite_target.mode).toBe('section');
            expect(issue.rewrite_target.operation).toBe('replace_block');
            expect(issue.rewrite_target.resolver_reason).toBe('summary_weak_inline_routed_to_section');
            expect(issue.rewrite_target.start).toBeNull();
            expect(issue.rewrite_target.end).toBeNull();
        });

        test('keeps snippet-only inline summary projection in legacy mode when section-first flag is disabled', () => {
            process.env.REWRITE_SECTION_FIRST_V1 = 'false';

            const weakAnchorAnalysis = {
                checks: {
                    howto_semantic_validity: {
                        verdict: 'fail',
                        explanation: 'No logical steps found.',
                        highlights: [],
                        candidate_highlights: [
                            {
                                snippet: 'Some people say you should optimize images because images can be large and slow things down.'
                            }
                        ],
                        suggestions: []
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(weakAnchorAnalysis, 'test-run-weak-inline-legacy');
            const allIssues = analysis_summary.categories.flatMap((category) => category.issues || []);
            const issue = allIssues.find((entry) => entry.check_id === 'howto_semantic_validity');

            expect(issue).toBeDefined();
            expect(issue.rewrite_target).toBeDefined();
            expect(issue.rewrite_target.actionable).toBe(true);
            expect(issue.rewrite_target.mode).toBe('inline_span');
            expect(issue.rewrite_target.operation).toBe('replace_span');
            expect(issue.rewrite_target.resolver_reason).toBe('summary_contract_projection');
        });

        test('deterministic inline highlights do not inherit aggregate count explanations', () => {
            const deterministicAnalysis = {
                checks: {
                    orphan_headings: {
                        verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: '4 heading(s) have fewer than 20 words of supporting content',
                        highlights: [
                            {
                                node_ref: 'block-100',
                                signature: 'sig-100',
                                start: 0,
                                end: 17,
                                snippet: 'Caching Strategies',
                                scope: 'span'
                            }
                        ]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(deterministicAnalysis, 'test-run-deterministic-inline');
            const issues = analysis_summary.categories.reduce((acc, cat) => acc.concat(cat.issues || []), []);
            const orphanIssue = issues.find((issue) => issue.check_id === 'orphan_headings');

            expect(orphanIssue).toBeDefined();
            expect(Array.isArray(orphanIssue.highlights)).toBe(true);
            expect(orphanIssue.highlights.length).toBeGreaterThan(0);
            expect(orphanIssue.highlights[0].message).not.toMatch(/heading\(s\)|contains \d+|other sections/i);
            expect(orphanIssue.highlights[0].message).toMatch(/clarify|precision|trust|cite/i);
        });

        test('supports compact summary mode for deferred details', () => {
            const payload = prepareSidebarPayload(mockFullAnalysis, {
                runId: 'test-run-compact',
                scores: { AEO: 45, GEO: 38, GLOBAL: 83 },
                includeHighlights: false
            });

            payload.analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    expect(issue).toHaveProperty('detail_ref');
                    expect(issue).toHaveProperty('first_instance_snippet');
                    expect(issue).toHaveProperty('first_instance_signature');
                    expect(issue).toHaveProperty('first_instance_start');
                    expect(issue).toHaveProperty('first_instance_end');
                    expect(Array.isArray(issue.highlights)).toBe(true);
                    expect(issue.highlights.length).toBe(0);
                });
            });
        });
    });

    // Test 4: enrichWithUiVerdict
    describe('4. enrichWithUiVerdict', () => {
        test('adds ui_verdict to every check', () => {
            const enriched = enrichWithUiVerdict(JSON.parse(JSON.stringify(mockFullAnalysis)));

            Object.values(enriched.checks).forEach(check => {
                expect(check).toHaveProperty('ui_verdict');
                expect(['pass', 'partial', 'fail']).toContain(check.ui_verdict);
            });
        });
    });

    // Test 5: prepareSidebarPayload
    describe('5. prepareSidebarPayload', () => {
        test('returns minimal sidebar payload without full check details', () => {
            const payload = prepareSidebarPayload(mockFullAnalysis, {
                runId: 'test-run-123',
                scores: { AEO: 45, GEO: 38, GLOBAL: 83 }
            });

            expect(payload).toHaveProperty('ok', true);
            expect(payload).toHaveProperty('run_id', 'test-run-123');
            expect(payload).toHaveProperty('scores');
            expect(payload).toHaveProperty('analysis_summary');
            expect(payload).toHaveProperty('completed_at');

            // Should NOT have result_url or full checks
            expect(payload).not.toHaveProperty('result_url');
            expect(payload).not.toHaveProperty('checks');
        });
    });

    // Test 6: extractCheckDetails
    describe('6. extractCheckDetails (details endpoint)', () => {
        test('returns full check object with highlights and suggestions', () => {
            const details = extractCheckDetails(mockFullAnalysis, 'single_h1');

            expect(details).not.toBeNull();
            expect(details).toHaveProperty('check_id', 'single_h1');
            expect(details).toHaveProperty('verdict', 'fail');
            expect(details).toHaveProperty('ui_verdict', 'fail');
            expect(details).toHaveProperty('explanation');
            expect(details).toHaveProperty('highlights');
            expect(details).toHaveProperty('suggestions');
            expect(details.highlights.length).toBe(2);
            expect(details.suggestions.length).toBe(1);
        });

        test('returns focused_highlight when instance_index provided', () => {
            const details = extractCheckDetails(mockFullAnalysis, 'single_h1', 0);

            expect(details).toHaveProperty('focused_highlight');
            expect(details.focused_highlight.node_ref).toBe('block-123');
            expect(details.focused_highlight.message).toBe('Multiple H1 tags detected.');
            expect(details.focused_highlight.snippet).toBe('Example H1 one');
        });

        test('marks cannot_anchor when only candidate_highlights exist', () => {
            const analysisWithCandidates = {
                checks: {
                    candidate_only_check: {
                        verdict: 'fail',
                        explanation: 'Candidate highlight could not be anchored.',
                        candidate_highlights: [
                            { node_ref: 'block-9', snippet: 'Example', message: 'Missing evidence', type: 'issue' }
                        ]
                    }
                }
            };

            const details = extractCheckDetails(analysisWithCandidates, 'candidate_only_check', 0);

            expect(details).toHaveProperty('cannot_anchor', true);
            expect(details).toHaveProperty('focused_failed_candidate');
            expect(details.focused_failed_candidate).toHaveProperty('snippet', 'Example');
            expect(details.focused_failed_candidate).toHaveProperty('quote');
            expect(details.focused_failed_candidate.quote).toHaveProperty('exact', 'Example');
            expect(details.focused_failed_candidate).toHaveProperty('text_quote_selector');
        });

        test('returns null for non-existent check', () => {
            const details = extractCheckDetails(mockFullAnalysis, 'non_existent_check');
            expect(details).toBeNull();
        });
    });

    describe('7. buildHighlightedHtml (overlay spans)', () => {
        test('includes required span dataset fields', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Alpha beta gamma delta'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        highlights: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 6,
                            end: 10,
                            snippet: 'beta',
                            message: 'Issue found.'
                        }]
                    }
                }
            };
            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';
            expect(html).toContain('data-check-id="sample_check"');
            expect(html).toContain('data-issue-key="sample_check:0"');
            expect(html).toContain('data-instance-index="0"');
            expect(html).toContain('data-node-ref="block-0"');
            expect(html).toContain('data-start="6"');
            expect(html).toContain('data-end="10"');
            expect(html).toContain('data-severity="fail"');
            expect(html).toContain('data-anchor-status="anchored"');
        });

        test('creates one span per highlight', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'One two three four five six'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        highlights: [
                            { node_ref: 'block-0', signature: 'sig-1', start: 0, end: 3, snippet: 'One', message: 'Issue 1' },
                            { node_ref: 'block-0', signature: 'sig-1', start: 4, end: 7, snippet: 'two', message: 'Issue 2' }
                        ]
                    }
                }
            };
            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';
            const matches = html.match(/class="aivi-overlay-highlight\b/g) || [];
            expect(matches.length).toBe(2);
        });

        test('includes unhighlightable issues list', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        highlights: [],
                        failed_candidates: [{
                            snippet: 'Sample',
                            message: 'Issue could not anchor',
                            failure_reason: 'signature_mismatch'
                        }]
                    }
                }
            };
            const overlay = buildHighlightedHtml(manifest, analysisResult);
            expect(Array.isArray(overlay.unhighlightable_issues)).toBe(true);
            expect(overlay.unhighlightable_issues.length).toBe(1);
            expect(overlay.unhighlightable_issues[0].failure_reason).toBe('signature_mismatch');
            expect(Array.isArray(overlay.recommendations)).toBe(true);
            expect(overlay.recommendations[0]).toHaveProperty('check_name');
            expect(overlay.recommendations[0]).toHaveProperty('action_suggestion');
            expect(overlay.recommendations[0]).toHaveProperty('explanation_pack');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('what_failed');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('why_it_matters');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('how_to_fix_steps');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('example_pattern');
        });

        test('emits recommendation when fail or partial check has no highlightable instances', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Analyzer output was incomplete for this check.',
                        highlights: [],
                        failed_candidates: [],
                        candidate_highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);

            expect(Array.isArray(overlay.recommendations)).toBe(true);
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('sample_check');
            expect(overlay.recommendations[0].failure_reason).toBe('no_highlight_candidates');
            expect(overlay.recommendations[0].anchor_status).toBe('unhighlightable');
        });

        test('uses deterministic recommendation-only reason for document-scope checks', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    metadata_checks: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: 'Missing metadata: title, canonical, lang',
                        highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);

            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('metadata_checks');
            expect(overlay.recommendations[0].failure_reason).toBe('metadata_document_scope');
        });

        test('uses deterministic fallback reason instead of no_highlight_candidates for inline-capable checks', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    no_broken_internal_links: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: '1 broken internal link detected',
                        highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);

            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('no_broken_internal_links');
            expect(overlay.recommendations[0].failure_reason).toBe('broken_link_anchor_unavailable');
        });

        test('routes document-scope semantic checks to recommendations instead of inline spans', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text with factual claims'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    external_authoritative_sources: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'No outbound links to authoritative sources.',
                        highlights: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 0,
                            end: 15,
                            snippet: 'Sample text',
                            message: 'Missing authoritative citation'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="external_authoritative_sources"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('external_authoritative_sources');
            expect(overlay.recommendations[0].failure_reason).toBe('external_sources_document_scope');
            expect(overlay.recommendations[0]).toHaveProperty('analysis_ref');
            expect(overlay.recommendations[0].analysis_ref).toHaveProperty('check_id', 'external_authoritative_sources');
            expect(overlay.recommendations[0]).not.toHaveProperty('rewrite_target');
            expect(overlay.recommendations[0]).toHaveProperty('repair_intent');
        });

        test('routes section-scope semantic checks to recommendations instead of inline spans', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Claim sentence that lacks direct evidence.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    claim_provenance_and_evidence: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Evidence is weak for this claim.',
                        highlights: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 0,
                            end: 20,
                            snippet: 'Claim sentence',
                            message: 'Weak claim evidence'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="claim_provenance_and_evidence"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('claim_provenance_and_evidence');
            expect(overlay.recommendations[0].failure_reason).toBe('claim_evidence_section_scope');
        });

        test('routes absence-sensitive checks with no explicit span to recommendations', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Intro paragraph without factual entities or citations.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    intro_factual_entities: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        provenance: 'deterministic',
                        explanation: 'No factual entities detected in intro.',
                        highlights: [],
                        failed_candidates: [],
                        candidate_highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="intro_factual_entities"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('intro_factual_entities');
            expect(overlay.recommendations[0].failure_reason).toBe('absence_non_inline');
        });

        test('downgrades block-only failed candidates to recommendations when span is too broad', () => {
            const longText = 'This paragraph has many words that should not be wrapped as a single inline highlight. '.repeat(12).trim();
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: longText
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Candidate only fallback',
                        failed_candidates: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            snippet: 'This paragraph has many words',
                            message: 'Fallback candidate'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="sample_check"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].failure_reason).toBe('block_wide');
        });

        test('downgrades anchored highlights to recommendations when range is too wide', () => {
            const longText = 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega. '.repeat(8).trim();
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: longText
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        highlights: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 0,
                            end: Math.max(0, longText.length - 10),
                            snippet: 'Alpha beta gamma delta epsilon',
                            message: 'Overly broad span'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="sample_check"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].failure_reason).toBe('too_wide');
        });

        test('downgrades highlights to recommendations when snippet precision is low', () => {
            const blockText = 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau.';
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: blockText
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        highlights: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 6,
                            end: 44,
                            snippet: 'completely unrelated snippet phrase with mismatched wording',
                            message: 'Low precision anchor'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="sample_check"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].failure_reason).toBe('low_precision');
        });

        test('emits synthetic diagnostic checks in overlay recommendations with synthetic reason', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    synthetic_check: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Synthetic fallback output',
                        highlights: [],
                        candidate_highlights: [],
                        provenance: 'synthetic',
                        synthetic_generated: true,
                        diagnostic_only: true,
                        synthetic_reason: 'chunk_parse_failure'
                    },
                    normal_check: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Normal missing highlight',
                        highlights: [],
                        candidate_highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);

            expect(Array.isArray(overlay.recommendations)).toBe(true);
            expect(overlay.recommendations.length).toBe(2);
            const syntheticRecommendation = overlay.recommendations.find((item) => item.check_id === 'synthetic_check');
            const normalRecommendation = overlay.recommendations.find((item) => item.check_id === 'normal_check');
            expect(syntheticRecommendation).toBeDefined();
            expect(syntheticRecommendation.failure_reason).toBe('chunk_parse_failure');
            expect(normalRecommendation).toBeDefined();
            expect(normalRecommendation.failure_reason).toBe('no_highlight_candidates');
        });

        test('maps time_budget_exceeded synthetic reason to user-safe recommendation action', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    budget_check: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Budget short-circuit output',
                        highlights: [],
                        candidate_highlights: [],
                        provenance: 'synthetic',
                        synthetic_generated: true,
                        diagnostic_only: true,
                        synthetic_reason: 'time_budget_exceeded'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendation = overlay.recommendations.find((item) => item.check_id === 'budget_check');

            expect(recommendation).toBeDefined();
            expect(recommendation.failure_reason).toBe('time_budget_exceeded');
            expect(recommendation.action_suggestion).toContain('time budget');
        });

        test('emits stability release telemetry counters for overlay payload', () => {
            process.env.STABILITY_RELEASE_MODE_V1 = 'true';
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample text'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    sample_check: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Issue could not be anchored',
                        highlights: [],
                        failed_candidates: [{
                            snippet: 'Sample',
                            message: 'Issue could not anchor',
                            failure_reason: 'signature_mismatch'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            expect(overlay).toHaveProperty('telemetry');
            expect(overlay.telemetry).toHaveProperty('explanation_pack_attached');
            expect(overlay.telemetry).toHaveProperty('fix_with_ai_eligible_targets');
            expect(overlay.telemetry).toHaveProperty('fix_with_ai_suppressed_by_stability_mode');
            expect(overlay.telemetry).toHaveProperty('schema_assist_emitted_total');
            expect(overlay.telemetry).toHaveProperty('schema_assist_insertable_total');
            expect(overlay.telemetry).toHaveProperty('schema_assist_by_check');
            expect(typeof overlay.telemetry.explanation_pack_attached).toBe('number');
            expect(typeof overlay.telemetry.fix_with_ai_eligible_targets).toBe('number');
            expect(typeof overlay.telemetry.fix_with_ai_suppressed_by_stability_mode).toBe('number');
            expect(typeof overlay.telemetry.schema_assist_emitted_total).toBe('number');
            expect(typeof overlay.telemetry.schema_assist_insertable_total).toBe('number');
            expect(overlay.telemetry.explanation_pack_attached).toBeGreaterThan(0);
            expect(overlay.telemetry.fix_with_ai_suppressed_by_stability_mode)
                .toBe(overlay.telemetry.fix_with_ai_eligible_targets);
        });

        test('emits schema assist counters for scoped schema recommendations', () => {
            const manifest = {
                title: 'Schema Test',
                block_map: [
                    {
                        node_ref: 'block-0',
                        signature: 'sig-faq-0',
                        block_type: 'core/heading',
                        text: 'What is AI visibility?'
                    },
                    {
                        node_ref: 'block-1',
                        signature: 'sig-faq-1',
                        block_type: 'core/paragraph',
                        text: 'AI visibility is how often AI systems can retrieve and cite your content.'
                    },
                    {
                        node_ref: 'block-2',
                        signature: 'sig-faq-2',
                        block_type: 'core/heading',
                        text: 'Why does structure matter?'
                    },
                    {
                        node_ref: 'block-3',
                        signature: 'sig-faq-3',
                        block_type: 'core/paragraph',
                        text: 'Structured sections improve extraction reliability and answer quality.'
                    }
                ],
                metadata: { has_jsonld: false },
                jsonld: []
            };
            const analysisResult = {
                run_id: 'test-run-schema',
                checks: {
                    faq_jsonld_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'FAQ schema missing',
                        highlights: [],
                        details: {
                            faq_pairs_detected: 2,
                            detected_pairs: [
                                {
                                    question: 'What is AI visibility?',
                                    answer: 'AI visibility is how often AI systems can retrieve and cite your content.'
                                },
                                {
                                    question: 'Why does structure matter?',
                                    answer: 'Structured sections improve extraction reliability and answer quality.'
                                }
                            ]
                        }
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            expect(overlay).toHaveProperty('telemetry');
            expect(overlay.telemetry.schema_assist_emitted_total).toBeGreaterThan(0);
            expect(overlay.telemetry.schema_assist_insertable_total).toBeGreaterThan(0);
            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('faq_jsonld_presence_and_completeness');
            expect(overlay.telemetry.schema_assist_by_check.faq_jsonld_presence_and_completeness.emitted).toBeGreaterThan(0);
            expect(overlay.telemetry.schema_assist_by_check.faq_jsonld_presence_and_completeness.insertable).toBeGreaterThan(0);
        });

        test('emits scoped schema assist payloads for semantic_html, schema match, and semantic howto bridge', () => {
            const manifest = {
                title: 'How to Improve Website Performance',
                block_map: [
                    {
                        node_ref: 'block-0',
                        signature: 'sig-0',
                        block_type: 'core/paragraph',
                        text: 'First, optimize images. Second, minify CSS and JavaScript. Third, enable caching.'
                    }
                ],
                jsonld: [
                    {
                        parsed: {
                            '@context': 'https://schema.org',
                            '@type': 'Article',
                            headline: 'How to Improve Website Performance'
                        }
                    }
                ]
            };
            const analysisResult = {
                run_id: 'test-run-schema-scoped',
                checks: {
                    semantic_html_usage: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'No semantic HTML tags detected',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            tags_found: []
                        },
                        non_inline: true,
                        non_inline_reason: 'semantic_structure_non_inline'
                    },
                    schema_matches_content: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Schema type does not match content type',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            content_type: 'howto',
                            expected_types: ['HowTo'],
                            detected_types: ['Article']
                        },
                        non_inline: true,
                        non_inline_reason: 'schema_content_alignment_non_inline'
                    },
                    howto_jsonld_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'HowTo schema incomplete',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            detected_steps: [
                                'Optimize images',
                                'Minify CSS and JavaScript',
                                'Enable browser caching'
                            ]
                        },
                        non_inline: true,
                        non_inline_reason: 'howto_schema_non_inline'
                    },
                    howto_schema_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'HowTo schema is missing required structure',
                        provenance: 'semantic',
                        highlights: [],
                        candidate_highlights: [],
                        non_inline: true,
                        non_inline_reason: 'howto_schema_non_inline'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendations = Array.isArray(overlay.recommendations) ? overlay.recommendations : [];
            const semanticHtmlIssue = recommendations.find((issue) => issue.check_id === 'semantic_html_usage');
            const schemaMatchIssue = recommendations.find((issue) => issue.check_id === 'schema_matches_content');
            const semanticHowtoIssue = recommendations.find((issue) => issue.check_id === 'howto_schema_presence_and_completeness');

            expect(semanticHtmlIssue?.schema_assist?.schema_kind).toBe('semantic_markup_plan');
            expect(semanticHtmlIssue?.schema_assist?.can_insert).toBe(false);

            expect(schemaMatchIssue?.schema_assist?.schema_kind).toBe('schema_alignment_jsonld');
            expect(schemaMatchIssue?.schema_assist?.can_insert).toBe(true);

            expect(semanticHowtoIssue?.schema_assist?.schema_kind).toBe('howto_jsonld');
            expect(semanticHowtoIssue?.schema_assist?.can_copy).toBe(true);

            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('semantic_html_usage');
            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('schema_matches_content');
            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('howto_schema_presence_and_completeness');
        });

        test('preserves rich AI recommendation packs without forcing scaffold steps', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'This section needs stronger evidence for one key claim.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-rich-pack',
                checks: {
                    entity_relationships_clear: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Entity relation lacks explicit support.',
                        failed_candidates: [{
                            snippet: 'key claim',
                            message: 'Entity relation lacks explicit support.',
                            failure_reason: 'low_precision',
                            explanation_pack: {
                                what_failed: 'The relationship is implied but not explicit enough.',
                                why_it_matters: 'Implicit relations reduce citation confidence for retrieval engines.',
                                how_to_fix_steps: [
                                    'State the relationship in one direct sentence.',
                                    'Add one concrete fact or qualifier that proves the relationship.'
                                ],
                                example_pattern: 'Entity A affects Entity B because [fact].',
                                issue_explanation: 'The relation is implied but unclear. Use one direct claim sentence plus one concrete supporting fact.'
                            }
                        }],
                        highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendation = overlay.recommendations[0];
            expect(recommendation).toBeDefined();
            expect(recommendation.explanation_pack).toBeDefined();
            expect(recommendation.explanation_pack.how_to_fix_steps).toEqual(
                expect.arrayContaining([
                    'State the relationship in one direct sentence.',
                    'Add one concrete fact or qualifier that proves the relationship.'
                ])
            );
            expect(recommendation.explanation_pack.how_to_fix_steps.join(' ')).not.toContain('Start from the quoted passage');
            expect(recommendation.issue_explanation).toContain('State the relationship in one direct sentence');
        });

        test('uses reason-specific deterministic variant for missing_required_h1', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Sample content'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-single-h1-variant',
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: 'No H1 tag found.',
                        highlights: [],
                        failed_candidates: [{
                            snippet: '',
                            message: 'No H1 tag found.',
                            failure_reason: 'missing_required_h1'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendation = overlay.recommendations[0];
            expect(recommendation.explanation_pack.what_failed).toContain('No primary H1 was found for this article');
            expect(recommendation.explanation_pack.how_to_fix_steps[0]).toContain('Add one H1');
        });

        test('uses reason-specific deterministic variant for intro factual absence', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Intro without concrete factual entities.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-intro-fact-variant',
                checks: {
                    intro_factual_entities: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: 'No factual entities detected in intro.',
                        highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendation = overlay.recommendations[0];
            expect(recommendation.failure_reason).toBe('absence_non_inline');
            expect(recommendation.explanation_pack.what_failed).toContain('does not include concrete factual entities');
            expect(recommendation.explanation_pack.how_to_fix_steps[0]).toContain('Add one specific fact in the intro');
        });
    });

    describe('8. UI-visible issues count', () => {
        test('issue_count equals number of fail|partial verdicts', () => {
            const { analysis_summary } = serializeForSidebar(mockFullAnalysis, 'test-run-123');

            // Count fail/partial in original checks
            const failPartialCount = Object.values(mockFullAnalysis.checks).filter(
                c => c.verdict === 'fail' || c.verdict === 'partial'
            ).length;

            // Count issues in analysis_summary
            const summaryIssueCount = analysis_summary.categories.reduce(
                (sum, cat) => sum + cat.issue_count, 0
            );

            expect(summaryIssueCount).toBe(failPartialCount);
        });
    });

    describe('9. Transformation logging', () => {
        test('returns transformation log with check_id, original verdict, ui_verdict', () => {
            const { transformationLog } = serializeForSidebar(mockFullAnalysis, 'test-run-123');

            expect(Array.isArray(transformationLog)).toBe(true);
            expect(transformationLog.length).toBe(Object.keys(mockFullAnalysis.checks).length);

            transformationLog.forEach(entry => {
                expect(entry).toHaveProperty('check_id');
                expect(entry).toHaveProperty('original_verdict');
                expect(entry).toHaveProperty('ui_verdict');
            });
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    console.log('Run with: npx jest analysis-serializer.test.js');
}
