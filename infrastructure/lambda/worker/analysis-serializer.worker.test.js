const fs = require('fs');
const path = require('path');

const {
    buildHighlightedHtml: buildWorkerOverlay,
    prepareSidebarPayload: prepareWorkerSidebarPayload,
    extractCheckDetails: extractWorkerCheckDetails
} = require('./analysis-serializer');
const {
    buildHighlightedHtml: buildOrchestratorOverlay,
    prepareSidebarPayload: prepareOrchestratorSidebarPayload,
    extractCheckDetails: extractOrchestratorCheckDetails
} = require('../orchestrator/analysis-serializer');

const loadJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));

const fixtureRoot = path.resolve(__dirname, '../../../fixtures/overlay');
const manifestFixture = loadJson(path.join(fixtureRoot, 'live-run-0831.manifest.json'));
const aggregatorFixture = loadJson(path.join(fixtureRoot, 'live-run-0831.aggregator.json'));
const march16AnswerExtractabilityFixture = loadJson(path.join(fixtureRoot, 'live-run-0316-answer-extractability.json'));
const march16AnswerExtractabilityFollowupFixture = loadJson(path.join(fixtureRoot, 'live-run-0316-answer-extractability-followup.json'));

const INTERNAL_GUARDRAIL_PATTERNS = [
    /strict question anchor/i,
    /cannot be evaluated/i,
    /remains unproven/i
];

const countWords = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

describe('worker overlay serializer regressions', () => {
    test('live fixture recommendations scrub internal guardrail diagnostics', () => {
        const overlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const recommendations = Array.isArray(overlay.recommendations) ? overlay.recommendations : [];

        expect(recommendations.length).toBeGreaterThan(0);
        recommendations.forEach((issue) => {
            const values = [
                issue.message,
                issue.rationale,
                issue.explanation_pack?.what_failed,
                issue.issue_explanation
            ].filter(Boolean);
            values.forEach((value) => {
                INTERNAL_GUARDRAIL_PATTERNS.forEach((pattern) => {
                    expect(String(value)).not.toMatch(pattern);
                });
            });
        });
    });

    test('paragraph-length recommendation uses singular instance wording from the offending paragraph', () => {
        const overlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const paragraphIssue = overlay.recommendations.find((issue) => issue.check_id === 'appropriate_paragraph_length');

        expect(paragraphIssue).toBeDefined();
        expect(paragraphIssue.explanation_pack.what_failed).toContain('This paragraph');
        expect(paragraphIssue.explanation_pack.what_failed).not.toContain('At least one paragraph');
    });

    test('recommendations are the canonical issue list and retain jump-to-block metadata', () => {
        const overlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);

        expect(Array.isArray(overlay.recommendations)).toBe(true);
        expect(Array.isArray(overlay.unhighlightable_issues)).toBe(true);
        expect(overlay.recommendations.length).toBeGreaterThan(overlay.unhighlightable_issues.length);

        const anchoredRecommendation = overlay.recommendations.find((issue) =>
            issue.jump_node_ref && issue.anchor_status !== 'unhighlightable'
        );

        expect(anchoredRecommendation).toBeDefined();
        expect(anchoredRecommendation).toHaveProperty('analysis_ref');
        expect(anchoredRecommendation).toHaveProperty('fix_assist_triage');
        expect(typeof anchoredRecommendation.fix_assist_triage?.state).toBe('string');
        expect(anchoredRecommendation).toHaveProperty('start');
        expect(anchoredRecommendation).toHaveProperty('end');
    });

    test('live fixture issue explanations stay concise and avoid vague quoted-passage scaffolding', () => {
        const overlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const recommendations = Array.isArray(overlay.recommendations) ? overlay.recommendations : [];

        expect(recommendations.length).toBeGreaterThan(0);
        recommendations.forEach((issue) => {
            const explanation = String(issue.issue_explanation || '');
            expect(explanation).not.toMatch(/quoted passage/i);
            expect(explanation).not.toMatch(/re-run analysis/i);
            expect(countWords(explanation)).toBeLessThanOrEqual(60);
        });
    });

    test('worker and orchestrator serializers stay aligned on sanitized guardrail summaries', () => {
        const workerOverlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const orchestratorOverlay = buildOrchestratorOverlay(manifestFixture, aggregatorFixture);

        const workerIssue = workerOverlay.recommendations.find((issue) => issue.check_id === 'immediate_answer_placement');
        const orchestratorIssue = orchestratorOverlay.recommendations.find((issue) => issue.check_id === 'immediate_answer_placement');

        expect(workerIssue).toBeDefined();
        expect(orchestratorIssue).toBeDefined();
        expect(workerIssue.explanation_pack.what_failed).toBe(orchestratorIssue.explanation_pack.what_failed);
        INTERNAL_GUARDRAIL_PATTERNS.forEach((pattern) => {
            expect(workerIssue.issue_explanation).not.toMatch(pattern);
            expect(orchestratorIssue.issue_explanation).not.toMatch(pattern);
        });
    });

    test('live semantic recommendations avoid malformed definition templating and duplicated rationale', () => {
        const workerOverlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const semanticIssue = workerOverlay.recommendations.find((issue) => issue.check_id === 'clear_answer_formatting');

        expect(semanticIssue).toBeDefined();
        expect(String(semanticIssue.rationale || '')).toBe('');
        expect(String(semanticIssue.issue_explanation || '')).not.toMatch(/checks Checks whether/i);
        expect(String(semanticIssue.issue_explanation || '')).not.toMatch(/this finding affects how models interpret/i);
        expect(String(semanticIssue.issue_explanation || '')).not.toMatch(/answer engines rely on .* because it reflects/i);
    });

    test('live semantic recommendations do not carry example-pattern filler in the released explanation pack', () => {
        const workerOverlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const semanticIssue = workerOverlay.recommendations.find((issue) => issue.check_id === 'claim_provenance_and_evidence');

        expect(semanticIssue).toBeDefined();
        expect(semanticIssue.explanation_pack?.example_pattern).toBeUndefined();
    });

    test('live semantic recommendations stay clean across multiple check families', () => {
        const workerOverlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const targetIds = [
            'clear_answer_formatting',
            'faq_structure_opportunity',
            'external_authoritative_sources',
            'claim_provenance_and_evidence',
            'citation_format_and_context'
        ];
        const issues = workerOverlay.recommendations.filter((issue) => targetIds.includes(issue.check_id));

        expect(issues.length).toBe(targetIds.length);
        issues.forEach((issue) => {
            expect(String(issue.rationale || '')).toBe('');
            expect(countWords(issue.issue_explanation || '')).toBeLessThanOrEqual(60);
            expect(String(issue.issue_explanation || '')).not.toMatch(/checks Checks whether/i);
            expect(String(issue.issue_explanation || '')).not.toMatch(/This finding impacts how models interpret/i);
            expect(String(issue.issue_explanation || '')).not.toMatch(/Answer engines rely on .* because it reflects/i);
            expect(String(issue.issue_explanation || '')).not.toMatch(/For example,/i);
            expect(issue.explanation_pack?.example_pattern).toBeUndefined();
        });
    });

    test('selected live semantic recommendations usually stay in the 40-60 word band', () => {
        const workerOverlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const orchestratorOverlay = buildOrchestratorOverlay(manifestFixture, aggregatorFixture);
        const targetIds = [
            'immediate_answer_placement',
            'clear_answer_formatting',
            'faq_jsonld_generation_suggestion',
            'external_authoritative_sources',
            'claim_provenance_and_evidence'
        ];

        [workerOverlay, orchestratorOverlay].forEach((overlay) => {
            targetIds.forEach((checkId) => {
                const issue = overlay.recommendations.find((item) => item.check_id === checkId);

                expect(issue).toBeDefined();
                expect(countWords(issue.issue_explanation || '')).toBeGreaterThanOrEqual(40);
                expect(countWords(issue.issue_explanation || '')).toBeLessThanOrEqual(60);
            });
        });
    });

    test('selected deterministic and document-scope recommendations usually stay in the 40-60 word band', () => {
        const workerOverlay = buildWorkerOverlay(manifestFixture, aggregatorFixture);
        const orchestratorOverlay = buildOrchestratorOverlay(manifestFixture, aggregatorFixture);
        const targetIds = [
            'single_h1',
            'metadata_checks',
            'author_identified',
            'author_bio_present',
            'semantic_html_usage',
            'intro_schema_suggestion'
        ];

        [workerOverlay, orchestratorOverlay].forEach((overlay) => {
            targetIds.forEach((checkId) => {
                const issue = overlay.recommendations.find((item) => item.check_id === checkId);

                expect(issue).toBeDefined();
                expect(countWords(issue.issue_explanation || '')).toBeGreaterThanOrEqual(40);
                expect(countWords(issue.issue_explanation || '')).toBeLessThanOrEqual(60);
            });
        });
    });

    test('faq schema guidance stays rewrite-first when dense inline Q&A is not yet FAQ-ready', () => {
        const manifest = {
            title: 'Sample',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'What is crawl budget? Crawl budget is the rate and depth at which bots fetch URLs. Why does it matter? It affects discovery efficiency and crawl coverage.'
                }
            ],
            metadata: { has_jsonld: false },
            jsonld: []
        };
        const analysisResult = {
            scores: { AEO: 20, GEO: 18, GLOBAL: 38 },
            checks: {
                faq_structure_opportunity: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    explanation: 'The section answers repeated user questions, but the answers remain densely inline.',
                    candidate_highlights: [
                        {
                            scope: 'block',
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            snippet: 'What is crawl budget? Crawl budget is the rate and depth at which bots fetch URLs. Why does it matter? It affects discovery efficiency and crawl coverage.',
                            message: 'The section answers repeated user questions, but the answers remain densely inline.'
                        }
                    ]
                },
                faq_jsonld_generation_suggestion: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    explanation: 'FAQ schema support is only partial because the visible Q&A is not reusable yet.',
                    provenance: 'semantic',
                    highlights: [],
                    candidate_highlights: [],
                    non_inline: true,
                    non_inline_reason: 'faq_jsonld_generation_non_inline'
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const workerIssue = workerOverlay.recommendations.find((issue) => issue.check_id === 'faq_jsonld_generation_suggestion');
        const orchestratorIssue = orchestratorOverlay.recommendations.find((issue) => issue.check_id === 'faq_jsonld_generation_suggestion');

        [workerIssue, orchestratorIssue].forEach((issue) => {
            expect(issue).toBeDefined();
            expect(issue.failure_reason).toBe('faq_jsonld_generation_non_inline');
            expect(issue.explanation_pack?.how_to_fix_steps?.[0] || '').toMatch(/rewrite .* q&a pairs before adding faq (schema|json-ld)/i);
            expect(issue.issue_explanation || '').toMatch(/(visible|reusable) q&a pairs|before adding faq (schema|json-ld)/i);
            expect(issue.issue_explanation || '').not.toMatch(/generate and add faq json-ld/i);
            expect(issue.explanation_pack?.how_to_fix_steps?.join(' ') || '').not.toMatch(/generate faq schema from the detected faq-ready pairs/i);
        });
    });

    test('worker and orchestrator suppress internal HowTo bridge diagnostics while keeping the bridge issue', () => {
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
        const manifest = {
            blocks_html: '<p>Step 1: mark the trench line.</p><p>Step 2: begin digging in short passes.</p>',
            block_map: [
                { node_ref: 'block-1', signature: 'sig-1', block_type: 'core/paragraph', text: 'Step 1: mark the trench line.' },
                { node_ref: 'block-2', signature: 'sig-2', block_type: 'core/paragraph', text: 'Step 2: begin digging in short passes.' }
            ]
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);

        [workerOverlay, orchestratorOverlay].forEach((overlay) => {
            const surfacedIds = overlay.recommendations.concat(overlay.unhighlightable_issues).map((issue) => issue.check_id);
            expect(surfacedIds).not.toContain('howto_jsonld_presence_and_completeness');
            expect(surfacedIds).toContain('howto_schema_presence_and_completeness');
        });
    });

test('worker and orchestrator keep post-body image blocks visible in highlighted_html preview output', () => {
    const manifest = {
        block_map: [
            {
                node_ref: 'block-img-1',
                signature: 'sig-img-1',
                block_type: 'core/image',
                text: 'Image: hero performance',
                snippet: 'Image: hero performance',
                meta: {
                    media_kind: 'image',
                    image_src: 'https://cdn.example.com/hero-performance.jpg',
                    image_alt: '',
                    image_caption: 'Stage wash test'
                }
            }
        ]
    };
    const analysisResult = {
        run_id: 'image-preview-fidelity',
        checks: {}
    };

    const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);

    [workerOverlay, orchestratorOverlay].forEach((overlay) => {
        expect(String(overlay.highlighted_html || '')).toContain('<img src="https://cdn.example.com/hero-performance.jpg" alt="" />');
        expect(String(overlay.highlighted_html || '')).toContain('Stage wash test');
        expect(String(overlay.highlighted_html || '')).toContain('aivi-overlay-media-block');
    });
});

test('worker and orchestrator add a context jump target for non-inline HowTo schema issues', () => {
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

    const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
    const workerIssue = workerOverlay.unhighlightable_issues.find((entry) => entry.check_id === 'howto_schema_presence_and_completeness');
    const orchestratorIssue = orchestratorOverlay.unhighlightable_issues.find((entry) => entry.check_id === 'howto_schema_presence_and_completeness');

    expect(workerIssue).toBeTruthy();
    expect(orchestratorIssue).toBeTruthy();
    expect(workerIssue.node_ref).toBe('');
    expect(orchestratorIssue.node_ref).toBe('');
    expect(workerIssue.jump_node_ref).toBe('block-1');
    expect(orchestratorIssue.jump_node_ref).toBe('block-1');
});

test('worker and orchestrator add a context jump target for non-inline FAQ schema issues', () => {
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

    const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
    const workerIssue = workerOverlay.unhighlightable_issues.find((entry) => entry.check_id === 'faq_jsonld_generation_suggestion');
    const orchestratorIssue = orchestratorOverlay.unhighlightable_issues.find((entry) => entry.check_id === 'faq_jsonld_generation_suggestion');

    expect(workerIssue).toBeTruthy();
    expect(orchestratorIssue).toBeTruthy();
    expect(workerIssue.node_ref).toBe('');
    expect(orchestratorIssue.node_ref).toBe('');
    expect(workerIssue.jump_node_ref).toBe('block-faq-1');
    expect(orchestratorIssue.jump_node_ref).toBe('block-faq-1');
});

test('worker and orchestrator emit insertable schema assist payloads for ItemList and Article schema checks', () => {
    const manifest = {
        blocks_html: '<h2>Top AI SEO tools</h2><ol><li>Ahrefs</li><li>Semrush</li><li>Similarweb</li></ol><p>GEO helps content earn citations.</p>',
        block_map: [
            {
                node_ref: 'list-1',
                signature: 'sig-list-1',
                block_type: 'core/list',
                text: '1. Ahrefs\n2. Semrush\n3. Similarweb'
            },
            {
                node_ref: 'p-1',
                signature: 'sig-p-1',
                block_type: 'core/paragraph',
                text: 'GEO helps content earn citations.'
            }
        ]
    };
    const analysisResult = {
        run_id: 'worker-itemlist-article',
        checks: {
            itemlist_jsonld_presence_and_completeness: {
                verdict: 'fail',
                ui_verdict: 'fail',
                explanation: 'Strong visible list candidate detected, but matching ItemList schema is missing.',
                provenance: 'deterministic',
                highlights: [],
                details: {
                    context_node_ref: 'list-1',
                    detected_candidates: [
                        {
                            heading: 'Top AI SEO tools',
                            ordered: true,
                            items: [
                                { text: 'Ahrefs', position: 1 },
                                { text: 'Semrush', position: 2 },
                                { text: 'Similarweb', position: 3 }
                            ]
                        }
                    ]
                },
                non_inline: true,
                non_inline_reason: 'itemlist_schema_non_inline'
            },
            article_jsonld_presence_and_completeness: {
                verdict: 'fail',
                ui_verdict: 'fail',
                explanation: 'Article-like page has no primary article schema.',
                provenance: 'deterministic',
                highlights: [],
                details: {
                    context_node_ref: 'p-1',
                    preferred_article_type: 'Article'
                },
                non_inline: true,
                non_inline_reason: 'article_schema_non_inline'
            }
        }
    };

    const metadata = {
        content_type: 'article',
        title: 'What Is GEO?',
        author_name: 'AiVI Team',
        date_published: '2026-03-23',
        canonical_url: 'https://example.com/geo-guide'
    };
    analysisResult.run_metadata = metadata;
    const workerOverlay = buildWorkerOverlay(manifest, analysisResult, metadata);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult, metadata);

    [workerOverlay, orchestratorOverlay].forEach((overlay) => {
        const itemListIssue = overlay.recommendations.find((issue) => issue.check_id === 'itemlist_jsonld_presence_and_completeness');
        const articleIssue = overlay.recommendations.find((issue) => issue.check_id === 'article_jsonld_presence_and_completeness');

        expect(itemListIssue?.schema_assist?.schema_kind).toBe('itemlist_jsonld');
        expect(itemListIssue?.schema_assist?.can_insert).toBe(true);
        expect(itemListIssue?.schema_assist?.primary_schema_type).toBe('ItemList');
        expect(itemListIssue?.schema_assist?.target_url).toBe('https://example.com/geo-guide');
        expect(itemListIssue?.schema_assist?.comparison_signature?.itemlist_item_names).toEqual([
            'Ahrefs',
            'Semrush',
            'Similarweb'
        ]);
        expect(itemListIssue?.schema_assist?.insert_capability).toBe('conflict_aware_insert');
        expect(articleIssue?.schema_assist?.schema_kind).toBe('article_jsonld');
        expect(articleIssue?.schema_assist?.can_insert).toBe(true);
        expect(articleIssue?.schema_assist?.primary_schema_type).toBe('Article');
        expect(articleIssue?.schema_assist?.target_url).toBe('https://example.com/geo-guide');
        expect(articleIssue?.schema_assist?.schema_assist_insert_mode).toBe('jsonld_conflict_aware_insert');
    });
});

test('worker and orchestrator suppress score-neutral schema alignment diagnostics from sidebar and overlay release', () => {
    const analysisResult = {
        run_id: 'schema-neutral-release-suppression',
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

    const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
    const workerSidebar = prepareWorkerSidebarPayload(analysisResult, {
        runId: 'schema-neutral-release-suppression',
        scores: { AEO: 20, GEO: 18, GLOBAL: 38 }
    });
    const orchestratorSidebar = prepareOrchestratorSidebarPayload(analysisResult, {
        runId: 'schema-neutral-release-suppression',
        scores: { AEO: 20, GEO: 18, GLOBAL: 38 }
    });

    [workerOverlay, orchestratorOverlay].forEach((overlay) => {
        const surfacedIds = overlay.recommendations.concat(overlay.unhighlightable_issues).map((issue) => issue.check_id);
        expect(surfacedIds).not.toContain('schema_matches_content');
    });

    [workerSidebar, orchestratorSidebar].forEach((payload) => {
        const issues = payload.analysis_summary.categories.flatMap((category) => category.issues || []);
        expect(issues.map((issue) => issue.check_id)).not.toContain('schema_matches_content');
    });
});

test('worker and orchestrator suppress verification-unavailable internal-link diagnostics from sidebar and overlay release', () => {
    const analysisResult = {
        run_id: 'internal-links-unavailable-release-suppression',
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

    const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
    const workerSidebar = prepareWorkerSidebarPayload(analysisResult, {
        runId: 'internal-links-unavailable-release-suppression',
        scores: { AEO: 22, GEO: 21, GLOBAL: 43 }
    });
    const orchestratorSidebar = prepareOrchestratorSidebarPayload(analysisResult, {
        runId: 'internal-links-unavailable-release-suppression',
        scores: { AEO: 22, GEO: 21, GLOBAL: 43 }
    });

    [workerOverlay, orchestratorOverlay].forEach((overlay) => {
        const surfacedIds = overlay.recommendations.concat(overlay.unhighlightable_issues).map((issue) => issue.check_id);
        expect(surfacedIds).not.toContain('no_broken_internal_links');
    });

    [workerSidebar, orchestratorSidebar].forEach((payload) => {
        const issues = payload.analysis_summary.categories.flatMap((category) => category.issues || []);
        expect(issues.map((issue) => issue.check_id)).not.toContain('no_broken_internal_links');
    });
});

test('worker and orchestrator keep real broken internal-link failures visible in sidebar and overlay release', () => {
    const analysisResult = {
        run_id: 'broken-internal-link-release-surface',
        checks: {
            no_broken_internal_links: {
                verdict: 'fail',
                ui_verdict: 'fail',
                explanation: '1 broken internal link was found in the article.',
                provenance: 'deterministic',
                highlights: [
                    {
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        start: 9,
                        end: 21,
                        snippet: 'pricing page',
                        message: 'This internal link appears to be broken.',
                        type: 'issue'
                    }
                ],
                details: {
                    internal_link_count: 2,
                    broken_links: [
                        {
                            url: '/pricing',
                            status: 404,
                            anchor_text: 'pricing page'
                        }
                    ]
                }
            }
        }
    };
    const manifest = {
        block_map: [
            {
                node_ref: 'block-1',
                signature: 'sig-1',
                block_type: 'core/paragraph',
                text: 'See our pricing page and support page before choosing a plan.'
            }
        ]
    };

    const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
    const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
    const workerSidebar = prepareWorkerSidebarPayload(analysisResult, {
        runId: 'broken-internal-link-release-surface',
        scores: { AEO: 22, GEO: 21, GLOBAL: 43 }
    });
    const orchestratorSidebar = prepareOrchestratorSidebarPayload(analysisResult, {
        runId: 'broken-internal-link-release-surface',
        scores: { AEO: 22, GEO: 21, GLOBAL: 43 }
    });

    [workerOverlay, orchestratorOverlay].forEach((overlay) => {
        const surfacedIds = []
            .concat(overlay.recommendations || [])
            .concat(overlay.unhighlightable_issues || [])
            .concat(overlay.v2_findings || [])
            .map((issue) => issue.check_id);
        expect(surfacedIds).toContain('no_broken_internal_links');
    });

    [workerSidebar, orchestratorSidebar].forEach((payload) => {
        const issues = payload.analysis_summary.categories.flatMap((category) => category.issues || []);
        expect(issues.map((issue) => issue.check_id)).toContain('no_broken_internal_links');
    });
});

    test('minimal semantic findings still render usable user-facing text without model-supplied guidance fields', () => {
        const manifest = {
            title: 'Sample',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'Website performance affects rankings and conversions before the article explains why.'
                }
            ]
        };
        const analysisResult = {
            scores: { AEO: 20, GEO: 18, GLOBAL: 38 },
            checks: {
                immediate_answer_placement: {
                    verdict: 'partial',
                    confidence: 0.42,
                    explanation: 'The opening is informative but not explicitly answer-led.',
                    highlights: [
                        {
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            start: 0,
                            end: 55,
                            snippet: 'Website performance affects rankings and conversions',
                            message: 'The opening is informative but not explicitly answer-led.',
                            type: 'issue'
                        }
                    ],
                    suggestions: []
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const workerIssue = workerOverlay.recommendations[0];

        expect(workerIssue.issue_explanation).toBeTruthy();
        expect(countWords(workerIssue.issue_explanation)).toBeLessThanOrEqual(60);
        expect(workerIssue.issue_explanation).not.toMatch(/strict question anchor/i);
        expect(String(orchestratorOverlay.html || '')).not.toMatch(/strict question anchor/i);
    });

    test('March 16 answer-extractability specimen preserves cleaned analyzer-led summaries without stock enrichment', () => {
        const { manifest, analysisResult } = march16AnswerExtractabilityFixture;
        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const expectations = {
            immediate_answer_placement: {
                raw: 'Answer appears at 121-150 words after the question anchor.',
                normalized: 'The opening does not reach a clear direct answer early enough to fulfill the headline or section promise.'
            },
            answer_sentence_concise: {
                raw: 'Answer sentence has 32 words, which is below the 40-60 word threshold.',
                normalized: 'The opening answer does not yet read as a clean reusable snippet. Tighten it so it stands alone cleanly without extra setup or filler.'
            },
            clear_answer_formatting: {
                raw: 'Answer is not separated into clear steps or bullet points for better readability.'
            }
        };

        Object.entries(expectations).forEach(([checkId, matcher]) => {
            const issue = workerOverlay.recommendations.find((item) => item.check_id === checkId);

            expect(issue).toBeDefined();
            expect(issue.message).toBe(matcher.raw);
            if (matcher.normalized) {
                expect(issue.explanation_pack.what_failed).toBe(matcher.normalized);
                expect(issue.issue_explanation).toBe(matcher.normalized);
                expect(issue.issue_explanation).not.toContain(matcher.raw);
            } else {
                expect(issue.explanation_pack.what_failed).toBe(matcher.raw);
                expect(issue.issue_explanation).toBe(matcher.raw);
            }
            expect(issue.issue_explanation).not.toContain('Answer engines are more reliable when the direct answer appears immediately');
            expect(issue.issue_explanation).not.toContain('Place one direct answer sentence');
            expect(issue.issue_explanation).not.toMatch(/strict question anchor/i);
        });
    });

    test('follow-up answer-extractability specimen normalizes brittle direct-answer counts and concise-answer evidence drift', () => {
        const { manifest, analysisResult } = march16AnswerExtractabilityFollowupFixture;
        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const directAnswerIssue = workerOverlay.recommendations.find((item) => item.check_id === 'immediate_answer_placement');
        const conciseIssue = workerOverlay.recommendations.find((item) => item.check_id === 'answer_sentence_concise');

        expect(directAnswerIssue.message).toBe('The direct answer starts at 125 words, missing the 120-word threshold.');
        expect(directAnswerIssue.explanation_pack.what_failed).toMatch(/headline or section promise/i);
        expect(directAnswerIssue.issue_explanation).toBe('The opening does not reach a clear direct answer early enough to fulfill the headline or section promise.');
        expect(directAnswerIssue.issue_explanation).not.toMatch(/125 words/i);

        expect(conciseIssue.message).toBe('The answer is 35 words, which is concise but lacks direct evidence for the claim.');
        expect(conciseIssue.explanation_pack.what_failed).toBe('The opening answer is close, but it still needs a tighter standalone shape to read as a clean reusable snippet.');
        expect(conciseIssue.issue_explanation).toBe('The opening answer is close, but it still needs a tighter standalone shape to read as a clean reusable snippet.');
        expect(conciseIssue.issue_explanation).not.toMatch(/lacks direct evidence for the claim/i);
        expect(conciseIssue.issue_explanation).not.toContain('Two or three short sentences are fine if they deliver one complete answer.');
    });

    test('worker and orchestrator drop implausible concise-answer threshold math when it contradicts the anchored snippet', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'To create a concert experience that stands out, use simple techniques that repeat across songs so lights feel tied to the music and not random.'
                }
            ]
        };
        const analysisResult = {
            run_id: 'worker-answer-extractability-implausible-threshold-math',
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

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const workerIssue = workerOverlay.recommendations.find((item) => item.check_id === 'answer_sentence_concise');
        const orchestratorIssue = orchestratorOverlay.recommendations.find((item) => item.check_id === 'answer_sentence_concise');

        [workerIssue, orchestratorIssue].forEach((issue) => {
            expect(issue).toBeDefined();
            expect(issue.explanation_pack.what_failed).toBe('The opening answer does not yet read as a clean reusable snippet. Tighten it so it stands alone cleanly without extra setup or filler.');
            expect(issue.issue_explanation).toContain('The opening answer does not yet read as a clean reusable snippet.');
            expect(issue.issue_explanation).not.toMatch(/22 words over the ideal 60-word threshold/i);
        });
    });

    test('March 16 answer-extractability specimen exposes editorial review summaries separate from raw threshold text', () => {
        const { manifest, analysisResult } = march16AnswerExtractabilityFixture;
        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const expectations = {
            immediate_answer_placement: /reaches the answer only after setup instead of leading with it/i,
            answer_sentence_concise: /does not stand alone as a clean reusable snippet/i,
            clear_answer_formatting: /main point stays buried in dense prose/i
        };

        Object.entries(expectations).forEach(([checkId, matcher]) => {
            const issue = workerOverlay.recommendations.find((item) => item.check_id === checkId);

            expect(issue).toBeDefined();
            expect(issue.review_summary || '').toMatch(matcher);
            expect(issue.review_summary || '').not.toBe(issue.message);
            expect(issue.review_summary || '').not.toMatch(/121-150 words after the question anchor|40-60 word threshold|clear steps or bullet points/i);
        });
    });

    test('answer-extractability detail views preserve richer raw AI explanation when available', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'The answer arrives only after several setup sentences.'
                }
            ]
        };
        const analysisResult = {
            run_id: 'worker-answer-extractability-raw-detail',
            checks: {
                immediate_answer_placement: {
                    verdict: 'fail',
                    explanation: 'The section opens with setup and only arrives at the actual answer after too much framing, which weakens extractable answer confidence for AI systems.',
                    highlights: [{
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        start: 0,
                        end: 50,
                        text: 'The answer arrives only after several setup sentences.',
                        message: 'Answer appears at 121-150 words after the question anchor.'
                    }]
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const issue = workerOverlay.recommendations.find((item) => item.check_id === 'immediate_answer_placement');

        expect(issue).toBeDefined();
        expect(issue.review_summary || '').toMatch(/reaches the answer only after setup/i);
        expect(issue.explanation_pack.what_failed).toBe('The opening does not reach a clear direct answer early enough to fulfill the headline or section promise.');
        expect(issue.issue_explanation).toContain('only arrives at the actual answer after too much framing');
        expect(issue.issue_explanation).toContain('extractable answer confidence');
        expect(issue.issue_explanation).not.toBe(issue.explanation_pack.what_failed);
    });

    test('answer-extractability overlay preserves usable AI explanation packs for section-intent cases', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'Digital tools can make exam revision more manageable, efficient, and less stressful.'
                }
            ]
        };
        const analysisResult = {
            run_id: 'worker-headline-intent-pack-preservation',
            checks: {
                immediate_answer_placement: {
                    verdict: 'partial',
                    explanation: 'The opening is informative, but it does not fulfill the headline or section promise quickly enough for direct extraction.',
                    ai_explanation_pack: {
                        what_failed: 'The H2 promises five concrete ways, but the section spends its opening lines on setup before the first actual way appears.',
                        why_it_matters: 'A list-style heading works best when the first concrete item shows up quickly and confirms the promised structure.',
                        how_to_fix_steps: [
                            'Keep one short lead-in line, then surface the first numbered way immediately under the heading.'
                        ],
                        issue_explanation: 'This section already has the right list intent, but the opening paragraph delays the first concrete item. Bringing the first numbered way closer to the heading would make the structure easier to extract and reuse.'
                    },
                    highlights: [{
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        start: 0,
                        end: 84,
                        text: 'Digital tools can make exam revision more manageable, efficient, and less stressful.',
                        message: 'The opening is informative, but it does not fulfill the headline or section promise quickly enough for direct extraction.'
                    }]
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const issue = workerOverlay.recommendations.find((item) => item.check_id === 'immediate_answer_placement');

        expect(issue).toBeDefined();
        expect(issue.explanation_pack.what_failed).toBe('The H2 promises five concrete ways, but the section spends its opening lines on setup before the first actual way appears.');
        expect(issue.explanation_pack.why_it_matters).toBe('A list-style heading works best when the first concrete item shows up quickly and confirms the promised structure.');
        expect(issue.issue_explanation).toContain('opening paragraph delays the first concrete item');
        expect(issue.issue_explanation).not.toContain('Answer engines are more reliable when the direct answer appears immediately');
        expect(issue.issue_explanation).not.toContain('question heading');
    });

    test('answer-extractability overlay preserves highlight-level analyzer reasoning when no explicit issue_explanation exists', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'Digital tools can make exam revision more manageable, efficient, and less stressful.'
                }
            ]
        };
        const analysisResult = {
            run_id: 'worker-headline-intent-message-preservation',
            checks: {
                immediate_answer_placement: {
                    verdict: 'partial',
                    explanation: 'The opening is informative, but it does not fulfill the headline or section promise quickly enough for direct extraction.',
                    highlights: [{
                        node_ref: 'block-1',
                        signature: 'sig-1',
                        start: 0,
                        end: 84,
                        text: 'Digital tools can make exam revision more manageable, efficient, and less stressful.',
                        message: 'The H2 promises five concrete ways, but this opening paragraph stays in setup mode instead of surfacing the first actual way.'
                    }]
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const issue = workerOverlay.recommendations.find((item) => item.check_id === 'immediate_answer_placement');

        expect(issue).toBeDefined();
        expect(issue.explanation_pack.what_failed).toBe('The H2 promises five concrete ways, but this opening paragraph stays in setup mode instead of surfacing the first actual way.');
        expect([
            'The H2 promises five concrete ways, but this opening paragraph stays in setup mode instead of surfacing the first actual way.',
            'The opening is informative, but it does not fulfill the headline or section promise quickly enough for direct extraction.'
        ]).toContain(issue.issue_explanation);
        expect(issue.issue_explanation).not.toContain('Answer engines are more reliable when the direct answer appears immediately');
        expect(issue.issue_explanation).not.toContain('Place one direct answer sentence');
    });

    test('synthetic incomplete semantic checks are excluded from recommendations but deterministic issues remain', () => {
        const manifest = {
            title: 'Sample',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'A paragraph that needs better support.'
                }
            ]
        };
        const analysisResult = {
            scores: { AEO: 20, GEO: 18, GLOBAL: 38 },
            checks: {
                immediate_answer_placement: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    synthetic_generated: true,
                    synthetic_reason: 'chunk_parse_failure',
                    explanation: 'Analyzer did not complete this check in this run.'
                },
                appropriate_paragraph_length: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    explanation: 'This paragraph exceeds the recommended length threshold.',
                    highlights: [
                        {
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            start: 0,
                            end: 40,
                            snippet: 'A paragraph that needs better support.',
                            message: 'This paragraph exceeds the recommended length threshold.',
                            type: 'issue'
                        }
                    ]
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);

        expect(workerOverlay.recommendations.find((issue) => issue.check_id === 'immediate_answer_placement')).toBeUndefined();
        expect(orchestratorOverlay.recommendations.find((issue) => issue.check_id === 'immediate_answer_placement')).toBeUndefined();

        expect(workerOverlay.recommendations.find((issue) => issue.check_id === 'appropriate_paragraph_length')).toBeDefined();
        expect(orchestratorOverlay.recommendations.find((issue) => issue.check_id === 'appropriate_paragraph_length')).toBeDefined();
    });

    test('synthetic partial-run semantic families stay suppressed without crowding real recommendations', () => {
        const manifest = {
            title: 'Sample',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'This paragraph is too long and still needs a real content fix.'
                }
            ]
        };
        const analysisResult = {
            scores: { AEO: 20, GEO: 18, GLOBAL: 38 },
            checks: {
                readability_adaptivity: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    synthetic_generated: true,
                    synthetic_reason: 'chunk_parse_failure',
                    explanation: 'Analyzer did not complete this check in this run.'
                },
                temporal_claim_check: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    synthetic_generated: true,
                    synthetic_reason: 'time_budget_exceeded',
                    explanation: 'Analyzer did not complete this check in this run.'
                },
                named_entities_detected: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    synthetic_generated: true,
                    synthetic_reason: 'chunk_parse_failure',
                    explanation: 'Analyzer did not complete this check in this run.'
                },
                appropriate_paragraph_length: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    explanation: 'This paragraph exceeds the recommended length threshold.',
                    highlights: [
                        {
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            start: 0,
                            end: 44,
                            snippet: 'This paragraph is too long and still needs',
                            message: 'This paragraph exceeds the recommended length threshold.',
                            type: 'issue'
                        }
                    ]
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const suppressedIds = ['readability_adaptivity', 'temporal_claim_check', 'named_entities_detected'];

        suppressedIds.forEach((checkId) => {
            expect(workerOverlay.recommendations.find((issue) => issue.check_id === checkId)).toBeUndefined();
            expect(orchestratorOverlay.recommendations.find((issue) => issue.check_id === checkId)).toBeUndefined();
        });

        expect(workerOverlay.recommendations.find((issue) => issue.check_id === 'appropriate_paragraph_length')).toBeDefined();
        expect(String(orchestratorOverlay.html || orchestratorOverlay.highlighted_html || '')).toContain('data-check-id="appropriate_paragraph_length"');
    });

    test('partial-run semantic recommendation families keep check-specific narratives when they fall back to recommendations', () => {
        const manifest = {
            title: 'Sample',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'Current pricing shifts quickly in enterprise AI workflows while teams mention OpenAI, Anthropic, and Google only in passing.'
                }
            ]
        };
        const analysisResult = {
            scores: { AEO: 20, GEO: 18, GLOBAL: 38 },
            checks: {
                readability_adaptivity: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    explanation: 'Long, clause-heavy sentences reduce scanability for general readers.'
                },
                temporal_claim_check: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    explanation: 'The wording uses current and quickly without visible timing context.'
                },
                named_entities_detected: {
                    verdict: 'partial',
                    ui_verdict: 'partial',
                    explanation: 'Important entities are implied rather than named explicitly.'
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const expectations = {
            readability_adaptivity: {
                why: /scan|readab|long sentence|clause/i,
                fix: /shorten|clause|jargon|scan/i
            },
            temporal_claim_check: {
                why: /timing|valid|recen|date/i,
                fix: /date|time window|updated|recen|change over time/i
            },
            named_entities_detected: {
                why: /specific names|ambigu|people|companies|products|places/i,
                fix: /name the relevant|person|company|product|place/i
            }
        };

        [workerOverlay, orchestratorOverlay].forEach((overlay) => {
            Object.entries(expectations).forEach(([checkId, matcher]) => {
                const issue = overlay.recommendations.find((item) => item.check_id === checkId);

                expect(issue).toBeDefined();
                expect(String(issue.explanation_pack?.why_it_matters || '')).toMatch(matcher.why);
                expect(String(issue.explanation_pack?.how_to_fix_steps?.join(' ') || '')).toMatch(matcher.fix);
                expect(String(issue.explanation_pack?.why_it_matters || '')).not.toMatch(/weakens trust, extraction quality, or citation reliability/i);
                expect(String(issue.explanation_pack?.how_to_fix_steps?.join(' ') || '')).not.toMatch(/explicit claim.*concrete support detail/i);
                expect(countWords(issue.issue_explanation || '')).toBeGreaterThanOrEqual(40);
                expect(countWords(issue.issue_explanation || '')).toBeLessThanOrEqual(60);
            });
        });
    });

    test('lists_tables_presence is coerced to one block-level issue per failing section', () => {
        const manifest = {
            title: 'Sample',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'The biggest mistakes are competition, refunds, shipping delays, supplier quality, ad fatigue, return policies, compliance, taxes, brand building, customer trust, and product-market fit.'
                }
            ]
        };
        const analysisResult = {
            scores: { AEO: 20, GEO: 18, GLOBAL: 38 },
            checks: {
                lists_tables_presence: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    explanation: 'Listable content lacks structured formatting.',
                    candidate_highlights: [
                        {
                            scope: 'span',
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            snippet: 'competition, refunds, shipping delays, supplier quality',
                            message: 'Listable content lacks structured formatting.'
                        },
                        {
                            scope: 'span',
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            snippet: 'ad fatigue, return policies, compliance, taxes',
                            message: 'Listable content lacks structured formatting.'
                        }
                    ]
                }
            }
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);

        const workerIssues = workerOverlay.recommendations.filter((issue) => issue.check_id === 'lists_tables_presence');
        const orchestratorIssues = orchestratorOverlay.recommendations.filter((issue) => issue.check_id === 'lists_tables_presence');

        expect(workerIssues).toHaveLength(1);
        expect(orchestratorIssues).toHaveLength(1);
        expect(workerIssues[0].snippet).toContain('The biggest mistakes are');
        expect(orchestratorIssues[0].snippet).toContain('The biggest mistakes are');

        expect(workerIssues[0].anchor_status).toBe('unhighlightable');
        expect(workerIssues[0].jump_node_ref).toBe('block-1');
        expect(orchestratorIssues[0].anchor_status).toBe('unhighlightable');
        expect(orchestratorIssues[0].jump_node_ref).toBe('block-1');
    });

    test('cross-block semantic opportunity highlights collapse into one canonical issue across sidebar, details, and overlay surfaces', () => {
        const manifest = {
            title: 'Concert Lighting',
            block_map: [
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/heading',
                    text: 'What are Lighting Tips and Techniques for Concerts?'
                },
                {
                    node_ref: 'block-2',
                    signature: 'sig-2',
                    block_type: 'core/paragraph',
                    text: 'Concert lighting works best when color, beam focus, motion, and fixture placement are coordinated around the music and venue scale.'
                },
                {
                    node_ref: 'block-3',
                    signature: 'sig-3',
                    block_type: 'core/paragraph',
                    text: 'Use color, beam angles, and movement patterns deliberately so each idea is easy to scan and reuse.'
                }
            ]
        };
        const message = 'The answer is understandable, but the main point stays buried in dense prose instead of standing out clearly.';
        const highlightSeed = {
            scope: 'sentence',
            anchor_recovery_strategy: 'selector_cross_block',
            text_quote_selector: { exact: 'lighting tips and techniques' },
            boundary: {
                first_words: 'What are Lighting',
                last_words: 'for Concerts'
            },
            message
        };
        const analysisResult = {
            run_id: 'run-collapse-1',
            scores: { AEO: 18, GEO: 14, GLOBAL: 32 },
            checks: {
                clear_answer_formatting: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    provenance: 'semantic',
                    explanation: message,
                    highlights: [
                        {
                            ...highlightSeed,
                            node_ref: 'block-1',
                            signature: 'sig-1',
                            snippet: 'What are Lighting Tips and Techniques for Concerts?'
                        },
                        {
                            ...highlightSeed,
                            node_ref: 'block-2',
                            signature: 'sig-2',
                            snippet: 'Concert lighting works best when color, beam focus, motion, and fixture placement are coordinated around the music and venue scale.'
                        },
                        {
                            ...highlightSeed,
                            node_ref: 'block-3',
                            signature: 'sig-3',
                            snippet: 'Use color, beam angles, and movement patterns deliberately so each idea is easy to scan and reuse.'
                        }
                    ]
                }
            }
        };
        const analysisEnvelope = {
            checks: analysisResult.checks,
            scores: analysisResult.scores
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const workerSidebar = prepareWorkerSidebarPayload(analysisEnvelope, { runId: 'run-collapse-1', includeHighlights: true });
        const orchestratorSidebar = prepareOrchestratorSidebarPayload(analysisEnvelope, { runId: 'run-collapse-1', includeHighlights: true });
        const workerDetails = extractWorkerCheckDetails(analysisEnvelope, 'clear_answer_formatting', 0, manifest);
        const orchestratorDetails = extractOrchestratorCheckDetails(analysisEnvelope, 'clear_answer_formatting', 0, manifest);

        const workerIssues = workerOverlay.recommendations.filter((issue) => issue.check_id === 'clear_answer_formatting');
        const orchestratorIssues = orchestratorOverlay.unhighlightable_issues.filter((issue) => issue.check_id === 'clear_answer_formatting');
        const workerSummaryIssue = workerSidebar.analysis_summary.categories.flatMap((category) => category.issues)
            .find((issue) => issue.check_id === 'clear_answer_formatting');
        const orchestratorSummaryIssue = orchestratorSidebar.analysis_summary.categories.flatMap((category) => category.issues)
            .find((issue) => issue.check_id === 'clear_answer_formatting');

        expect(workerIssues).toHaveLength(1);
        expect(orchestratorIssues).toHaveLength(1);
        expect(workerSummaryIssue.instances).toBe(1);
        expect(orchestratorSummaryIssue.instances).toBe(1);
        expect(workerSummaryIssue.highlights).toHaveLength(1);
        expect(orchestratorSummaryIssue.highlights).toHaveLength(1);
        expect(workerDetails.highlights).toHaveLength(1);
        expect(orchestratorDetails.highlights).toHaveLength(1);
        expect(workerDetails.focused_highlight.node_ref).toBe('block-2');
        expect(orchestratorDetails.focused_highlight.node_ref).toBe('block-2');
    });

    test('worker and orchestrator release pseudo-heading ItemList and heading-markup issues cleanly', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-heading-1',
                    signature: 'sig-heading-1',
                    block_type: 'core/paragraph',
                    text: 'What are the Top Home Office Lighting Ideas?'
                },
                {
                    node_ref: 'block-list-1',
                    signature: 'sig-list-1',
                    block_type: 'core/list',
                    text: 'Use layered lighting\nChoose fixtures by function'
                },
                {
                    node_ref: 'block-copy-1',
                    signature: 'sig-copy-1',
                    block_type: 'core/paragraph',
                    text: 'These ideas help make the workspace easier to scan and more comfortable to use.'
                }
            ]
        };
        const analysisResult = {
            run_id: 'worker-pseudo-heading-release',
            scores: { AEO: 16, GEO: 12, GLOBAL: 28 },
            checks: {
                itemlist_jsonld_presence_and_completeness: {
                    verdict: 'fail',
                    ui_verdict: 'fail',
                    explanation: 'Strong visible list sections are present, but ItemList schema is missing.',
                    provenance: 'deterministic',
                    highlights: [],
                    details: {
                        candidate_count: 1,
                        context_node_ref: 'block-list-1',
                        detected_candidates: [
                            {
                                heading: 'What are the Top Home Office Lighting Ideas?',
                                ordered: false,
                                items: [
                                    { text: 'Use layered lighting', position: 1 },
                                    { text: 'Choose fixtures by function', position: 2 }
                                ]
                            }
                        ]
                    },
                    non_inline: true,
                    non_inline_reason: 'itemlist_schema_non_inline'
                },
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
                            end: 42,
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
        const analysisEnvelope = {
            checks: analysisResult.checks,
            scores: analysisResult.scores
        };

        const workerOverlay = buildWorkerOverlay(manifest, analysisResult);
        const orchestratorOverlay = buildOrchestratorOverlay(manifest, analysisResult);
        const workerSidebar = prepareWorkerSidebarPayload(analysisEnvelope, { runId: 'worker-pseudo-heading-release', includeHighlights: true });
        const orchestratorSidebar = prepareOrchestratorSidebarPayload(analysisEnvelope, { runId: 'worker-pseudo-heading-release', includeHighlights: true });

        [workerOverlay, orchestratorOverlay].forEach((overlay) => {
            const surfaced = overlay.recommendations.concat(overlay.unhighlightable_issues);
            const itemListIssue = surfaced.find((issue) => issue.check_id === 'itemlist_jsonld_presence_and_completeness');
            const headingIssue = surfaced.find((issue) => issue.check_id === 'heading_like_text_uses_heading_markup');

            expect(itemListIssue).toBeDefined();
            expect(itemListIssue.jump_node_ref).toBe('block-list-1');
            expect(itemListIssue.schema_assist?.schema_kind).toBe('itemlist_jsonld');
            expect(headingIssue).toBeDefined();
            expect(headingIssue.node_ref).toBe('block-heading-1');
            expect(headingIssue.jump_node_ref).toBe('block-heading-1');
            expect(headingIssue.issue_explanation).toMatch(/real heading|heading markup/i);
        });

        [workerSidebar, orchestratorSidebar].forEach((payload) => {
            const issues = payload.analysis_summary.categories.flatMap((category) => category.issues);
            const itemListIssue = issues.find((issue) => issue.check_id === 'itemlist_jsonld_presence_and_completeness');
            const headingIssue = issues.find((issue) => issue.check_id === 'heading_like_text_uses_heading_markup');

            expect(itemListIssue).toBeDefined();
            expect(itemListIssue.ui_verdict).toBe('fail');
            expect(headingIssue).toBeDefined();
            expect(headingIssue.instances).toBe(1);
            expect(headingIssue.first_instance_node_ref).toBe('block-heading-1');
        });
    });
});
