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

const readJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));
const fixtureRoot = path.resolve(__dirname, '../../../fixtures/overlay');
const march16AnswerExtractabilityFixture = readJson(path.join(fixtureRoot, 'live-run-0316-answer-extractability.json'));
const march16AnswerExtractabilityFollowupFixture = readJson(path.join(fixtureRoot, 'live-run-0316-answer-extractability-followup.json'));
const countWords = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

// Mock full analysis result for testing
const mockFullAnalysis = {
    scores: { AEO: 45, GEO: 38, GLOBAL: 83 },
    checks: {
        immediate_answer_placement: {
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
        test('checks-definitions-v1.json states 54 checks', () => {
            const defPath = path.join(__dirname, '..', 'shared', 'schemas', 'checks-definitions-v1.json');
            const definitions = JSON.parse(fs.readFileSync(defPath, 'utf8'));

            expect(definitions.version).toBe('1.5.0');
            expect(definitions.total_checks).toBe(54);
            expect(definitions.description).toContain('54');
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
                if (Array.isArray(issue.highlights)) {
                    issue.highlights.forEach((highlight) => {
                        expect(highlight).toHaveProperty('analysis_ref');
                        expect(highlight).toHaveProperty('rewrite_target');
                        expect(highlight).toHaveProperty('repair_intent');
                        expect(highlight).toHaveProperty('explanation_pack');
                        expect(highlight.explanation_pack).toHaveProperty('what_failed');
                        expect(highlight.explanation_pack).toHaveProperty('why_it_matters');
                        expect(highlight.explanation_pack).toHaveProperty('how_to_fix_steps');
                    });
                }
            });
        });

        test('March 16 answer-extractability specimen keeps richer serializer narrative beside raw summary text', () => {
            const { analysisResult } = march16AnswerExtractabilityFixture;
            const { analysis_summary } = serializeForSidebar(analysisResult, analysisResult.run_id);
            const issues = analysis_summary.categories.flatMap((category) => category.issues || []);
            const expectations = {
                immediate_answer_placement: {
                    raw: 'Answer appears at 121-150 words after the question anchor.',
                    normalized: /did not confirm a direct answer within the first 120 words/i,
                    richer: /Answer engines are more reliable when the direct answer appears immediately/i
                },
                answer_sentence_concise: {
                    raw: 'Answer sentence has 32 words, which is below the 40-60 word threshold.',
                    richer: /easier to scan, quote, and reuse/i
                },
                clear_answer_formatting: {
                    raw: 'Answer is not separated into clear steps or bullet points for better readability.',
                    richer: /Dense answer formatting makes the main point harder to scan and extract quickly/i
                }
            };

            Object.entries(expectations).forEach(([checkId, matcher]) => {
                const issue = issues.find((item) => item.check_id === checkId);

                expect(issue).toBeDefined();
                if (matcher.normalized) {
                    expect(issue.explanation_pack.what_failed).toMatch(matcher.normalized);
                    expect(issue.issue_explanation).toMatch(matcher.normalized);
                    expect(issue.issue_explanation).not.toContain(matcher.raw);
                } else {
                    expect(issue.explanation_pack.what_failed).toBe(matcher.raw);
                    expect(issue.issue_explanation).toContain(matcher.raw);
                }
                expect(issue.highlights?.[0]?.message).toBe(matcher.raw);
                expect(issue.issue_explanation).toMatch(matcher.richer);
                expect(countWords(issue.issue_explanation)).toBeGreaterThan(countWords(issue.explanation_pack.what_failed));
            });
        });

        test('follow-up answer-extractability specimen rewrites brittle direct-answer and concise-answer detail text for sidebar output', () => {
            const { analysisResult } = march16AnswerExtractabilityFollowupFixture;
            const { analysis_summary } = serializeForSidebar(analysisResult, analysisResult.run_id);
            const issues = analysis_summary.categories.flatMap((category) => category.issues || []);
            const directAnswerIssue = issues.find((item) => item.check_id === 'immediate_answer_placement');
            const conciseIssue = issues.find((item) => item.check_id === 'answer_sentence_concise');

            expect(directAnswerIssue.highlights?.[0]?.message).toBe('The direct answer starts at 125 words, missing the 120-word threshold.');
            expect(directAnswerIssue.explanation_pack.what_failed).toMatch(/did not confirm a direct answer within the first 120 words/i);
            expect(directAnswerIssue.issue_explanation).not.toMatch(/125 words/i);

            expect(conciseIssue.highlights?.[0]?.message).toBe('The answer is 35 words, which is concise but lacks direct evidence for the claim.');
            expect(conciseIssue.explanation_pack.what_failed).toBe('The opening answer is 35 words, which is near the target range but still below the ideal reusable answer band.');
            expect(conciseIssue.issue_explanation).not.toMatch(/lacks direct evidence for the claim/i);
            expect(conciseIssue.issue_explanation).toMatch(/Two or three short sentences are fine if they deliver one complete answer/i);
        });

        test('answer_sentence_concise drops implausible threshold math when it contradicts the anchored snippet', () => {
            const analysisResult = {
                run_id: 'answer-extractability-implausible-threshold-math',
                checks: {
                    answer_sentence_concise: {
                        verdict: 'fail',
                        explanation: 'The first sentence is 22 words over the ideal 60-word threshold for a concise snippet.',
                        highlights: [
                            {
                                node_ref: 'block-1',
                                signature: 'sig-1',
                                start: 0,
                                end: 128,
                                snippet: 'To create a concert experience that stands out, use simple techniques that repeat across songs so lights feel tied to the music and not random.',
                                message: 'The first sentence is 22 words over the ideal 60-word threshold for a concise snippet.'
                            }
                        ]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(analysisResult, analysisResult.run_id);
            const issue = analysis_summary.categories.flatMap((category) => category.issues || []).find((item) => item.check_id === 'answer_sentence_concise');

            expect(issue).toBeDefined();
            expect(issue.highlights?.[0]?.message).toBe('The first sentence is 22 words over the ideal 60-word threshold for a concise snippet.');
            expect(issue.explanation_pack.what_failed).toBe('The opening answer does not yet read as a clean reusable snippet. Keep the first answer near 40-60 words and make sure it stands alone without extra setup or filler.');
            expect(issue.issue_explanation).toContain('The opening answer does not yet read as a clean reusable snippet.');
            expect(issue.issue_explanation).not.toMatch(/22 words over the ideal 60-word threshold/i);
        });

        test('March 16 answer-extractability specimen carries editorial review summaries in analysis_summary', () => {
            const { analysisResult } = march16AnswerExtractabilityFixture;
            const { analysis_summary } = serializeForSidebar(analysisResult, analysisResult.run_id);
            const issues = analysis_summary.categories.flatMap((category) => category.issues || []);
            const expectations = {
                immediate_answer_placement: /reaches the answer only after setup instead of leading with it/i,
                answer_sentence_concise: /does not stand alone as a clean reusable snippet/i,
                clear_answer_formatting: /main point stays buried in dense prose/i
            };

            Object.entries(expectations).forEach(([checkId, matcher]) => {
                const issue = issues.find((item) => item.check_id === checkId);

                expect(issue).toBeDefined();
                expect(issue.review_summary || '').toMatch(matcher);
                expect(issue.review_summary || '').not.toBe(issue.explanation_pack.what_failed);
                expect(issue.review_summary || '').not.toMatch(/121-150 words after the question anchor|40-60 word threshold|clear steps or bullet points/i);
            });
        });

        test('answer-extractability details preserve richer raw AI explanation when available', () => {
            const analysisResult = {
                run_id: 'answer-extractability-raw-detail',
                checks: {
                    immediate_answer_placement: {
                        verdict: 'fail',
                        explanation: 'The section opens with setup and only arrives at the actual answer after too much framing, which weakens extractable answer confidence for AI systems.',
                        highlights: [{
                            node_ref: 'block-1',
                            start: 0,
                            end: 96,
                            text: 'The answer arrives only after several setup sentences.',
                            message: 'Answer appears at 121-150 words after the question anchor.'
                        }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(analysisResult, analysisResult.run_id);
            const issue = analysis_summary.categories.flatMap((category) => category.issues || []).find((item) => item.check_id === 'immediate_answer_placement');

            expect(issue).toBeDefined();
            expect(issue.review_summary || '').toMatch(/reaches the answer only after setup/i);
            expect(issue.explanation_pack.what_failed).toBe('The check did not confirm a direct answer within the first 120 words after the selected question anchor.');
            expect(issue.issue_explanation).toContain('only arrives at the actual answer after too much framing');
            expect(issue.issue_explanation).toContain('extractable answer confidence');
            expect(issue.issue_explanation).not.toBe(issue.explanation_pack.what_failed);
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
                    heading_topic_fulfillment: {
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
            const orphanIssue = issues.find((issue) => issue.check_id === 'heading_topic_fulfillment');

            expect(orphanIssue).toBeDefined();
            expect(Array.isArray(orphanIssue.highlights)).toBe(true);
            expect(orphanIssue.highlights.length).toBeGreaterThan(0);
            expect(orphanIssue.highlights[0].message).not.toMatch(/heading\(s\)|contains \d+|other sections/i);
            expect(orphanIssue.highlights[0].message).toMatch(/structure|readers|retrieval/i);
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

        test('preserves the flat score contract without nested fallback structure', () => {
            const payload = prepareSidebarPayload(mockFullAnalysis, {
                runId: 'test-run-flat-scores',
                scores: { AEO: 12, GEO: 8, GLOBAL: 20 }
            });

            expect(payload.scores).toEqual({ AEO: 12, GEO: 8, GLOBAL: 20 });
            expect(payload.scores.global).toBeUndefined();
            expect(payload.scores.categories).toBeUndefined();
        });

        test('counts repeated non-inline instances in analysis_summary', () => {
            const multiInstanceAnalysis = {
                checks: {
                    claim_pattern_detection: {
                        verdict: 'fail',
                        explanation: 'Repeated unsupported claims detected.',
                        failed_candidates: [
                            { snippet: 'Claim one', message: 'Unsupported claim one', scope: 'span' },
                            { snippet: 'Claim two', message: 'Unsupported claim two', scope: 'span' }
                        ]
                    }
                }
            };

            const payload = prepareSidebarPayload(multiInstanceAnalysis, {
                runId: 'test-run-multi-instance',
                scores: { AEO: 10, GEO: 5, GLOBAL: 15 }
            });
            const issues = payload.analysis_summary.categories.flatMap((category) => category.issues || []);
            const issue = issues.find((entry) => entry.check_id === 'claim_pattern_detection');

            expect(issue).toBeDefined();
            expect(issue.instances).toBe(2);
            expect(issue.first_instance_snippet).toBe('Claim one');
        });

        test('suppresses score-neutral deterministic schema alignment diagnostics from the sidebar summary', () => {
            const payload = prepareSidebarPayload({
                checks: {
                    schema_matches_content: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Schema companion types are present, but content alignment is not required here.',
                        provenance: 'deterministic',
                        score_neutral: true,
                        score_neutral_reason: 'schema_companion_only',
                        details: {
                            score_neutral: true,
                            score_neutral_reason: 'schema_companion_only'
                        },
                        non_inline: true,
                        non_inline_reason: 'schema_content_alignment_non_inline'
                    }
                }
            }, {
                runId: 'test-run-schema-neutral',
                scores: { AEO: 20, GEO: 18, GLOBAL: 38 }
            });

            const issues = payload.analysis_summary.categories.flatMap((category) => category.issues || []);

            expect(issues.map((issue) => issue.check_id)).not.toContain('schema_matches_content');
        });

        test('suppresses verification-unavailable internal-link diagnostics from the sidebar summary', () => {
            const payload = prepareSidebarPayload({
                checks: {
                    no_broken_internal_links: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Internal link status not available for deterministic verification',
                        provenance: 'deterministic',
                        highlights: [],
                        non_inline: true,
                        non_inline_reason: 'link_status_unavailable',
                        details: {
                            internal_link_count: 4,
                            broken_links: []
                        }
                    }
                }
            }, {
                runId: 'test-run-links-unavailable',
                scores: { AEO: 22, GEO: 21, GLOBAL: 43 }
            });

            const issues = payload.analysis_summary.categories.flatMap((category) => category.issues || []);

            expect(issues.map((issue) => issue.check_id)).not.toContain('no_broken_internal_links');
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

        test('resolves instance indexes across anchored and failed semantic instances', () => {
            const analysisWithMixedInstances = {
                checks: {
                    mixed_instance_check: {
                        verdict: 'fail',
                        explanation: 'Mixed instances exist.',
                        highlights: [
                            {
                                node_ref: 'block-1',
                                snippet: 'Anchored instance',
                                message: 'Anchored issue',
                                scope: 'span'
                            }
                        ],
                        failed_candidates: [
                            {
                                node_ref: 'block-2',
                                snippet: 'Unanchored instance',
                                message: 'Fallback issue',
                                scope: 'span'
                            }
                        ]
                    }
                }
            };

            const details = extractCheckDetails(analysisWithMixedInstances, 'mixed_instance_check', 1);

            expect(details.focused_highlight).toBeUndefined();
            expect(details.cannot_anchor).toBe(true);
            expect(details.focused_failed_candidate).toBeDefined();
            expect(details.focused_failed_candidate.snippet).toBe('Unanchored instance');
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
                    clear_answer_formatting: {
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
            expect(html).toContain('data-check-id="clear_answer_formatting"');
            expect(html).toContain('data-issue-key="clear_answer_formatting:0"');
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
                    clear_answer_formatting: {
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
                    clear_answer_formatting: {
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
            expect(Array.isArray(overlay.recommendations)).toBe(true);
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0]).toHaveProperty('check_name');
            expect(overlay.recommendations[0]).toHaveProperty('action_suggestion');
            expect(overlay.recommendations[0]).toHaveProperty('explanation_pack');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('what_failed');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('why_it_matters');
            expect(overlay.recommendations[0].explanation_pack).toHaveProperty('how_to_fix_steps');
            expect(overlay.recommendations[0].failure_reason).toBe('signature_mismatch');
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
                    clear_answer_formatting: {
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
            expect(overlay.recommendations[0].check_id).toBe('clear_answer_formatting');
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
            expect(overlay.recommendations[0].message).toBe('Metadata needs cleanup');
            expect(overlay.recommendations[0].issue_explanation).toContain('Critical metadata fields are missing or incomplete');
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

        test('keeps deterministic instance wording in explanation packs for repeated paragraph failures', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'A very long paragraph that keeps running with too many words to remain readable.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-deterministic-instance-wording',
                checks: {
                    appropriate_paragraph_length: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: '2 paragraph(s) exceed 150 words',
                        highlights: [{
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 0,
                            end: 76,
                            snippet: 'A very long paragraph that keeps running with too many words to remain readable.',
                            message: 'This paragraph has 181 words (recommended 150 or fewer).',
                            scope: 'block'
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            expect(overlay.recommendations.length).toBe(1);
            const issue = overlay.recommendations.find((entry) => entry.check_id === 'appropriate_paragraph_length');
            expect(issue).toBeDefined();
            expect(issue.explanation_pack.what_failed).toBe('This paragraph has 181 words (recommended 150 or fewer).');
            expect(issue.issue_explanation).toContain('This paragraph has 181 words');
            expect(issue.issue_explanation).not.toContain('At least one paragraph');
        });

        test('emits one recommendation per deterministic document-scope instance when multiple instances exist', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Schema block one. Schema block two.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-deterministic-docscope-multi',
                checks: {
                    valid_jsonld_schema: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: 'Some JSON-LD schemas have syntax errors',
                        highlights: [
                            {
                                node_ref: 'block-0',
                                signature: 'sig-1',
                                snippet: 'Schema block one',
                                message: 'Invalid JSON-LD block near schema one.',
                                scope: 'block'
                            },
                            {
                                node_ref: 'block-0',
                                signature: 'sig-1',
                                snippet: 'Schema block two',
                                message: 'Invalid JSON-LD block near schema two.',
                                scope: 'block'
                            }
                        ]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendations = overlay.recommendations.filter((entry) => entry.check_id === 'valid_jsonld_schema');

            expect(recommendations).toHaveLength(2);
            expect(recommendations[0].message).toBe('This JSON-LD is invalid');
            expect(recommendations[1].message).toBe('This JSON-LD is invalid');
            expect(recommendations[0].explanation_pack.what_failed).toContain('schema one');
            expect(recommendations[1].explanation_pack.what_failed).toContain('schema two');
            expect(recommendations[0].instance_index).toBe(0);
            expect(recommendations[1].instance_index).toBe(1);
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

        test('routes deterministic attribution checks with no explicit span to recommendations', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Article content without a visible author byline.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run',
                checks: {
                    author_identified: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: 'No author identification detected.',
                        highlights: [],
                        failed_candidates: [],
                        candidate_highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const html = overlay.highlighted_html || '';

            expect(html).not.toContain('data-check-id="author_identified"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].check_id).toBe('author_identified');
            expect(overlay.recommendations[0].failure_reason).toBe('missing_author_byline');
            expect(overlay.recommendations[0].message).toBe('Identify the author clearly');
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
                    clear_answer_formatting: {
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

            expect(html).not.toContain('data-check-id="clear_answer_formatting"');
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
                    clear_answer_formatting: {
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

            expect(html).not.toContain('data-check-id="clear_answer_formatting"');
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
                    clear_answer_formatting: {
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

            expect(html).not.toContain('data-check-id="clear_answer_formatting"');
            expect(overlay.recommendations.length).toBe(1);
            expect(overlay.recommendations[0].failure_reason).toBe('low_precision');
        });

        test('suppresses synthetic diagnostic checks from overlay recommendations', () => {
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
            expect(overlay.recommendations.length).toBe(0);
        });

        test('suppresses time_budget_exceeded synthetic checks from overlay recommendations', () => {
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
            expect(recommendation).toBeUndefined();
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
            expect(semanticHtmlIssue?.schema_assist?.insert_capability).toBe('copy_only');
            expect(semanticHtmlIssue?.schema_assist?.insert_policy_hints?.target_scope).toBe('markup_plan');

            expect(schemaMatchIssue?.schema_assist?.schema_kind).toBe('schema_alignment_jsonld');
            expect(schemaMatchIssue?.schema_assist?.can_insert).toBe(true);
            expect(schemaMatchIssue?.schema_assist?.schema_assist_insert_mode).toBe('jsonld_conflict_aware_insert');
            expect(schemaMatchIssue?.schema_assist?.insert_capability).toBe('conflict_aware_insert');
            expect(schemaMatchIssue?.schema_assist?.insert_policy_hints?.identity_basis).toBe('url_or_primary_schema');

            expect(semanticHowtoIssue?.schema_assist?.schema_kind).toBe('howto_jsonld');
            expect(semanticHowtoIssue?.schema_assist?.can_copy).toBe(true);
            expect(semanticHowtoIssue?.schema_assist?.schema_assist_source_check_id).toBe('howto_jsonld_presence_and_completeness');
            expect(semanticHowtoIssue?.schema_assist?.insert_policy_hints?.identity_basis).toBe('howto_step_names');

            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('semantic_html_usage');
            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('schema_matches_content');
            expect(overlay.telemetry.schema_assist_by_check).toHaveProperty('howto_schema_presence_and_completeness');
        });

        test('emits insertable schema assist payloads for ItemList and Article schema checks', () => {
            const manifest = {
                title: 'Top AI Visibility Tools',
                meta_description: 'Benchmarks for retrieval, citation, and entity coverage.',
                block_map: [
                    {
                        node_ref: 'block-0',
                        signature: 'sig-list-0',
                        block_type: 'core/heading',
                        text: 'Top AI Visibility Tools'
                    },
                    {
                        node_ref: 'block-1',
                        signature: 'sig-list-1',
                        block_type: 'core/list',
                        text: 'Perplexity tracking dashboards\nCitation monitoring workflows\nEntity coverage audits'
                    }
                ],
                jsonld: []
            };
            const analysisResult = {
                run_id: 'test-run-itemlist-article',
                checks: {
                    itemlist_jsonld_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Strong visible list sections are present, but ItemList schema is missing',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            candidate_count: 1,
                            detected_candidates: [
                                {
                                    heading: 'Top AI Visibility Tools',
                                    ordered: false,
                                    items: [
                                        { text: 'Perplexity tracking dashboards', position: 1 },
                                        { text: 'Citation monitoring workflows', position: 2 },
                                        { text: 'Entity coverage audits', position: 3 }
                                    ]
                                }
                            ],
                            context_node_ref: 'block-1',
                            scope_triggered: true
                        },
                        non_inline: true,
                        non_inline_reason: 'itemlist_schema_non_inline'
                    },
                    article_jsonld_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Article-like content detected but no primary article schema was found',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            content_type: 'post',
                            preferred_article_type: 'BlogPosting',
                            context_node_ref: 'block-0',
                            scope_triggered: true
                        },
                        non_inline: true,
                        non_inline_reason: 'article_schema_non_inline'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const surfacedIssues = overlay.recommendations.concat(overlay.unhighlightable_issues);
            const itemListIssue = surfacedIssues.find((issue) => issue.check_id === 'itemlist_jsonld_presence_and_completeness');
            const articleIssue = surfacedIssues.find((issue) => issue.check_id === 'article_jsonld_presence_and_completeness');

            expect(itemListIssue?.schema_assist?.schema_kind).toBe('itemlist_jsonld');
            expect(itemListIssue?.schema_assist?.can_insert).toBe(true);
            expect(itemListIssue?.schema_assist?.primary_schema_type).toBe('ItemList');
            expect(itemListIssue?.schema_assist?.comparison_signature?.itemlist_item_names).toEqual([
                'Perplexity tracking dashboards',
                'Citation monitoring workflows',
                'Entity coverage audits'
            ]);
            expect(itemListIssue?.schema_assist?.insert_capability).toBe('conflict_aware_insert');
            expect(articleIssue?.schema_assist?.schema_kind).toBe('article_jsonld');
            expect(articleIssue?.schema_assist?.can_insert).toBe(true);
            expect(articleIssue?.schema_assist?.primary_schema_type).toBe('BlogPosting');
            expect(articleIssue?.schema_assist?.schema_assist_insert_mode).toBe('jsonld_conflict_aware_insert');
            expect(overlay.telemetry.schema_assist_by_check.itemlist_jsonld_presence_and_completeness.insertable).toBeGreaterThan(0);
            expect(overlay.telemetry.schema_assist_by_check.article_jsonld_presence_and_completeness.insertable).toBeGreaterThan(0);
        });

        test('suppresses internal HowTo bridge diagnostics while keeping the user-facing bridge issue', () => {
            const manifest = {
                blocks_html: '<p>Step 1: mark the trench line.</p><p>Step 2: begin digging in short passes.</p>',
                block_map: [
                    { node_ref: 'block-1', signature: 'sig-1', block_type: 'core/paragraph', text: 'Step 1: mark the trench line.' },
                    { node_ref: 'block-2', signature: 'sig-2', block_type: 'core/paragraph', text: 'Step 2: begin digging in short passes.' }
                ]
            };
            const analysisResult = {
                run_id: 'howto-bridge-internal-suppression',
                checks: {
                    howto_jsonld_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'HowTo-style content detected but no HowTo schema found',
                        provenance: 'deterministic',
                        diagnostic_only: true,
                        score_neutral: true,
                        score_neutral_reason: 'schema_bridge_internal',
                        highlights: [],
                        details: {
                            detected_steps: [
                                { text: 'Mark the trench line', source: 'step_heading' },
                                { text: 'Begin digging in short passes', source: 'step_heading' }
                            ],
                            score_neutral: true,
                            score_neutral_reason: 'schema_bridge_internal'
                        },
                        non_inline: true,
                        non_inline_reason: 'howto_schema_non_inline'
                    },
                    howto_schema_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Visible step-by-step content is present, but HowTo schema is missing.',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            detected_steps: [
                                { text: 'Mark the trench line', source: 'step_heading' },
                                { text: 'Begin digging in short passes', source: 'step_heading' }
                            ],
                            bridge_source_check_id: 'howto_jsonld_presence_and_completeness'
                        },
                        non_inline: true,
                        non_inline_reason: 'howto_schema_non_inline'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const surfacedIds = overlay.recommendations.concat(overlay.unhighlightable_issues).map((issue) => issue.check_id);

            expect(surfacedIds).not.toContain('howto_jsonld_presence_and_completeness');
            expect(surfacedIds).toContain('howto_schema_presence_and_completeness');
        });

        test('adds a context jump target for non-inline HowTo schema issues', () => {
            const manifest = {
                block_map: [
                    {
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        block_type: 'core/list',
                        text: '1. Mark the trench line\n2. Cut a shallow pilot pass\n3. Move spoil clear of the trench edge'
                    }
                ]
            };
            const analysisResult = {
                run_id: 'howto-context-jump',
                checks: {
                    howto_schema_presence_and_completeness: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'Visible step-by-step content is present, but HowTo schema is missing.',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            context_node_ref: 'block-1',
                            detected_steps: [
                                { text: 'Mark the trench line', source: 'ordered_list', node_ref: 'block-1' },
                                { text: 'Cut a shallow pilot pass', source: 'ordered_list', node_ref: 'block-1' }
                            ]
                        },
                        non_inline: true,
                        non_inline_reason: 'howto_schema_non_inline'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const issue = overlay.unhighlightable_issues.find((entry) => entry.check_id === 'howto_schema_presence_and_completeness');

            expect(issue).toBeTruthy();
            expect(issue.anchor_status).toBe('unhighlightable');
            expect(issue.node_ref).toBe('');
            expect(issue.jump_node_ref).toBe('block-1');
        });

        test('adds a context jump target for non-inline FAQ schema issues', () => {
            const manifest = {
                block_map: [
                    {
                        node_ref: 'block-faq-1',
                        signature: 'sig-faq-1',
                        block_type: 'core/heading',
                        text: 'What is crawl budget?'
                    },
                    {
                        node_ref: 'block-faq-2',
                        signature: 'sig-faq-2',
                        block_type: 'core/paragraph',
                        text: 'Crawl budget is the number of pages a crawler is likely to fetch during a recrawl window.'
                    }
                ]
            };
            const analysisResult = {
                run_id: 'faq-context-jump',
                checks: {
                    faq_jsonld_generation_suggestion: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'FAQ-ready question-answer pairs are present, but FAQ schema is missing.',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            detected_pairs: [
                                {
                                    question: 'What is crawl budget?',
                                    answer: 'Crawl budget is the number of pages a crawler is likely to fetch during a recrawl window.',
                                    heading_node_ref: 'block-faq-1'
                                }
                            ]
                        },
                        non_inline: true,
                        non_inline_reason: 'faq_jsonld_generation_non_inline'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const issue = overlay.unhighlightable_issues.find((entry) => entry.check_id === 'faq_jsonld_generation_suggestion');

            expect(issue).toBeTruthy();
            expect(issue.anchor_status).toBe('unhighlightable');
            expect(issue.node_ref).toBe('');
            expect(issue.jump_node_ref).toBe('block-faq-1');
        });

        test('suppresses score-neutral deterministic schema alignment diagnostics from overlay release', () => {
            const manifest = {
                block_map: [
                    {
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        block_type: 'core/paragraph',
                        text: 'Schema companion types can exist without making the article mismatched.'
                    }
                ]
            };
            const analysisResult = {
                run_id: 'schema-neutral-overlay-suppression',
                checks: {
                    schema_matches_content: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Schema companion types are present, but content alignment is not required here.',
                        provenance: 'deterministic',
                        score_neutral: true,
                        score_neutral_reason: 'schema_companion_only',
                        highlights: [],
                        details: {
                            score_neutral: true,
                            score_neutral_reason: 'schema_companion_only'
                        },
                        non_inline: true,
                        non_inline_reason: 'schema_content_alignment_non_inline'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const surfacedIds = overlay.recommendations.concat(overlay.unhighlightable_issues).map((issue) => issue.check_id);

            expect(surfacedIds).not.toContain('schema_matches_content');
        });

        test('suppresses verification-unavailable internal-link diagnostics from overlay release', () => {
            const manifest = {
                block_map: [
                    {
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        block_type: 'core/paragraph',
                        text: 'Read our pricing page and support page for related details.'
                    }
                ]
            };
            const analysisResult = {
                run_id: 'internal-links-unavailable-overlay-suppression',
                checks: {
                    no_broken_internal_links: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        explanation: 'Internal link status not available for deterministic verification',
                        provenance: 'deterministic',
                        highlights: [],
                        details: {
                            internal_link_count: 2,
                            broken_links: []
                        },
                        non_inline: true,
                        non_inline_reason: 'link_status_unavailable'
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const surfacedIds = overlay.recommendations.concat(overlay.unhighlightable_issues).map((issue) => issue.check_id);

            expect(surfacedIds).not.toContain('no_broken_internal_links');
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
                    'State the relationship in one direct sentence.'
                ])
            );
            expect(recommendation.explanation_pack.how_to_fix_steps.join(' ')).not.toContain('Start from the quoted passage');
            expect(recommendation.issue_explanation).toMatch(/rewrite|clearer wording|tighter terminology/i);
            expect(countWords(recommendation.issue_explanation)).toBeLessThanOrEqual(60);
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

        test('uses approved deterministic review-lead messaging for canonical cleanup recommendations', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Article content with duplicate URL versions.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-canonical-review-lead',
                checks: {
                    canonical_clarity: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        provenance: 'deterministic',
                        explanation: 'No canonical URL was detected for this page.',
                        highlights: []
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendation = overlay.recommendations[0];
            expect(recommendation.failure_reason).toBe('canonical_document_scope');
            expect(recommendation.message).toBe('Canonical signals need cleanup');
            expect(recommendation.issue_explanation).toContain('preferred canonical URL');
        });

        test('scrubs internal question-anchor diagnostics from user-facing recommendation explanations', () => {
            const manifest = {
                block_map: [{
                    node_ref: 'block-0',
                    signature: 'sig-1',
                    text: 'Website performance affects rankings, conversions, and user satisfaction.'
                }]
            };
            const analysisResult = {
                run_id: 'test-run-guardrail-scrub',
                checks: {
                    immediate_answer_placement: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        guardrail_adjusted: true,
                        guardrail_reason: 'no_strict_question_anchor',
                        explanation: 'No strict question anchor was detected for this check in the analyzed content, so answer-extractability remains only partial.',
                        highlights: [],
                        failed_candidates: [{
                            snippet: 'Website performance affects rankings, conversions, and user satisfaction.',
                            message: 'No strict question anchor was detected for this check in the analyzed content, so answer-extractability remains only partial.',
                            failure_reason: '',
                            explanation_pack: {
                                what_failed: 'No strict question anchor was detected for this check in the analyzed content, so answer-extractability remains only partial.',
                                issue_explanation: 'No strict question anchor detected; answer extractability remains unproven for direct queries.'
                            }
                        }]
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const recommendation = overlay.recommendations[0];
            expect(recommendation).toBeDefined();
            expect(recommendation.explanation_pack.what_failed).toContain('question-led setup');
            expect(recommendation.explanation_pack.what_failed).not.toMatch(/strict question anchor/i);
            expect(recommendation.issue_explanation).toMatch(/query-to-answer structure|direct answer/i);
            expect(recommendation.issue_explanation).not.toMatch(/strict question anchor/i);
            expect(recommendation.issue_explanation).not.toMatch(/cannot be evaluated/i);
            expect(recommendation.issue_explanation).not.toMatch(/remains unproven/i);
            expect(recommendation.issue_explanation).not.toMatch(/quoted passage/i);
            expect(countWords(recommendation.issue_explanation)).toBeLessThanOrEqual(60);
        });

        test('scrubs internal question-anchor diagnostics from issue summary fallback paths', () => {
            const analysisResult = {
                run_id: 'test-run-guardrail-summary',
                checks: {
                    immediate_answer_placement: {
                        verdict: 'partial',
                        ui_verdict: 'partial',
                        guardrail_adjusted: true,
                        guardrail_reason: 'no_strict_question_anchor',
                        explanation: 'No strict question anchor was detected for this check in the analyzed content, so answer-extractability remains only partial.',
                        highlights: [],
                        candidate_highlights: [{
                            snippet: 'Website performance affects rankings, conversions, and user satisfaction.',
                            node_ref: 'block-0',
                            signature: 'sig-1',
                            start: 0,
                            end: 68,
                            instance_index: 0,
                            message: 'Broad opening context without a direct answer.'
                        }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(analysisResult, 'test-run-guardrail-summary');
            const issue = analysis_summary.categories.flatMap((category) => category.issues)[0];

            expect(issue).toBeDefined();
            expect(issue.explanation_pack.what_failed).toContain('question-led setup');
            expect(issue.explanation_pack.what_failed).not.toMatch(/strict question anchor/i);
            expect(issue.issue_explanation).toContain('question-led setup');
            expect(issue.issue_explanation).not.toMatch(/strict question anchor/i);
            expect(issue.issue_explanation).not.toMatch(/cannot be evaluated/i);
            expect(issue.issue_explanation).not.toMatch(/remains unproven/i);
        });

        test('surfaces deterministic heading-markup issues with anchored guidance', () => {
            const manifest = {
                block_map: [
                    {
                        node_ref: 'block-heading-1',
                        signature: 'sig-heading-1',
                        block_type: 'core/paragraph',
                        text: 'What are the Top Home Office Lighting Ideas?'
                    },
                    {
                        node_ref: 'block-copy-1',
                        signature: 'sig-copy-1',
                        block_type: 'core/paragraph',
                        text: 'Layered lighting improves focus, comfort, and screen readability across long work sessions.'
                    }
                ]
            };
            const analysisResult = {
                run_id: 'test-run-heading-like-release',
                checks: {
                    heading_like_text_uses_heading_markup: {
                        verdict: 'fail',
                        ui_verdict: 'fail',
                        explanation: 'One section label behaves like a heading but is still paragraph text.',
                        provenance: 'deterministic',
                        highlights: [
                            {
                                node_ref: 'block-heading-1',
                                signature: 'sig-heading-1',
                                start: 0,
                                end: 41,
                                snippet: 'What are the Top Home Office Lighting Ideas?',
                                message: 'This section label looks like a heading but is still paragraph text.',
                                type: 'issue'
                            }
                        ],
                        details: {
                            pseudo_heading_count: 1,
                            structurally_impactful_count: 1
                        }
                    }
                }
            };

            const overlay = buildHighlightedHtml(manifest, analysisResult);
            const issue = overlay.recommendations.find((entry) => entry.check_id === 'heading_like_text_uses_heading_markup');

            expect(issue).toBeDefined();
            expect(issue.node_ref).toBe('block-heading-1');
            expect(issue.jump_node_ref).toBe('block-heading-1');
            expect(issue.message).toMatch(/heading/i);
            expect(issue.issue_explanation).toMatch(/real heading|heading markup/i);
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
