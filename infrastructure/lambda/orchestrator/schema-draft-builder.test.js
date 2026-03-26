const { buildSchemaAssistDraft } = require('./schema-draft-builder');

describe('schema-draft-builder scoped expansions', () => {
    test('builds copy-only semantic markup plan for semantic_html_usage', () => {
        const assist = buildSchemaAssistDraft({
            checkId: 'semantic_html_usage',
            checkData: {
                verdict: 'fail',
                details: {
                    tags_found: []
                }
            },
            manifest: {
                block_map: [
                    { block_type: 'core/paragraph', text: 'First, optimize images. Second, minify CSS/JS.' },
                    { block_type: 'core/heading', text: 'Speed Optimization' },
                    { block_type: 'core/paragraph', text: 'Use caching and CDN support.' }
                ]
            },
            runMetadata: {}
        });

        expect(assist).toBeDefined();
        expect(assist.schema_kind).toBe('semantic_markup_plan');
        expect(assist.can_copy).toBe(true);
        expect(assist.can_insert).toBe(false);
        expect(assist.draft_jsonld).toHaveProperty('plan_type', 'semantic_markup_upgrade');
    });

    test('builds insertable alignment draft for schema_matches_content', () => {
        const assist = buildSchemaAssistDraft({
            checkId: 'schema_matches_content',
            checkData: {
                verdict: 'fail',
                details: {
                    content_type: 'howto',
                    expected_types: ['HowTo'],
                    detected_types: ['Article']
                }
            },
            manifest: {
                title: 'How to Improve Website Speed',
                jsonld: [
                    {
                        parsed: {
                            '@context': 'https://schema.org',
                            '@type': 'Article',
                            headline: 'How to Improve Website Speed'
                        }
                    }
                ]
            },
            runMetadata: { content_type: 'howto' }
        });

        expect(assist).toBeDefined();
        expect(assist.schema_kind).toBe('schema_alignment_jsonld');
        expect(assist.can_copy).toBe(true);
        expect(assist.can_insert).toBe(true);
        expect(assist.draft_jsonld).toHaveProperty('@type', 'HowTo');
    });

    test('builds insertable ItemList draft for strong visible lists', () => {
        const assist = buildSchemaAssistDraft({
            checkId: 'itemlist_jsonld_presence_and_completeness',
            checkData: {
                verdict: 'fail',
                details: {
                    detected_candidates: [
                        {
                            heading: 'Top AI Visibility Tools',
                            ordered: true,
                            items: [
                                { text: 'Perplexity tracking dashboards', position: 1 },
                                { text: 'Citation monitoring workflows', position: 2 },
                                { text: 'Entity coverage audits', position: 3 }
                            ]
                        }
                    ]
                }
            },
            manifest: {
                title: 'Top AI Visibility Tools'
            },
            runMetadata: { content_type: 'post', canonical_url: 'https://example.com/top-ai-visibility-tools' }
        });

        expect(assist).toBeDefined();
        expect(assist.schema_kind).toBe('itemlist_jsonld');
        expect(assist.can_copy).toBe(true);
        expect(assist.can_insert).toBe(true);
        expect(assist.draft_jsonld).toHaveProperty('@type', 'ItemList');
        expect(Array.isArray(assist.draft_jsonld.itemListElement)).toBe(true);
        expect(assist.draft_jsonld.itemListElement).toHaveLength(3);
    });

    test('builds insertable Article draft for article schema completeness issues', () => {
        const assist = buildSchemaAssistDraft({
            checkId: 'article_jsonld_presence_and_completeness',
            checkData: {
                verdict: 'fail',
                details: {
                    preferred_article_type: 'BlogPosting'
                }
            },
            manifest: {
                title: 'AI Visibility Benchmarks',
                meta_description: 'Benchmarks for retrieval, citation, and entity coverage.'
            },
            runMetadata: {
                content_type: 'post',
                canonical_url: 'https://example.com/ai-visibility-benchmarks',
                author_name: 'Jane Doe',
                post_date: '2026-03-20'
            }
        });

        expect(assist).toBeDefined();
        expect(assist.schema_kind).toBe('article_jsonld');
        expect(assist.can_copy).toBe(true);
        expect(assist.can_insert).toBe(true);
        expect(assist.draft_jsonld).toHaveProperty('@type', 'BlogPosting');
        expect(assist.draft_jsonld).toHaveProperty('headline', 'AI Visibility Benchmarks');
        expect(assist.draft_jsonld).toHaveProperty('mainEntityOfPage', 'https://example.com/ai-visibility-benchmarks');
    });

    test('bridges semantic HowTo schema check to deterministic draft signals', () => {
        const assist = buildSchemaAssistDraft({
            checkId: 'howto_schema_presence_and_completeness',
            checkData: {
                verdict: 'fail',
                details: {}
            },
            allChecks: {
                howto_jsonld_presence_and_completeness: {
                    verdict: 'fail',
                    details: {
                        detected_steps: [
                            'Optimize images',
                            'Minify CSS and JavaScript',
                            'Enable browser caching'
                        ]
                    }
                }
            },
            manifest: {
                title: 'How to Improve Website Speed',
                block_map: [
                    { block_type: 'core/heading', text: 'Step 1: Optimize Images' },
                    { block_type: 'core/paragraph', text: 'Compress and resize images before upload.' },
                    { block_type: 'core/heading', text: 'Step 2: Minify Assets' },
                    { block_type: 'core/paragraph', text: 'Minify and defer non-critical CSS and JavaScript.' }
                ]
            },
            runMetadata: { content_type: 'howto' }
        });

        expect(assist).toBeDefined();
        expect(assist.schema_kind).toBe('howto_jsonld');
        expect(assist.can_copy).toBe(true);
        expect(assist.draft_jsonld).toHaveProperty('@type', 'HowTo');
        expect(Array.isArray(assist.draft_jsonld.step)).toBe(true);
        expect(assist.draft_jsonld.step.length).toBeGreaterThan(1);
    });

    test('extracts HowTo steps from preserved list blocks', () => {
        const assist = buildSchemaAssistDraft({
            checkId: 'howto_jsonld_presence_and_completeness',
            checkData: {
                verdict: 'fail',
                details: {}
            },
            manifest: {
                title: 'How to Improve Citation Readiness',
                block_map: [
                    {
                        block_type: 'core/list',
                        text: 'Define the query clearly\nAnswer the question immediately\nSupport the answer with verifiable evidence'
                    }
                ]
            },
            runMetadata: { content_type: 'howto' }
        });

        expect(assist).toBeDefined();
        expect(assist.schema_kind).toBe('howto_jsonld');
        expect(assist.can_copy).toBe(true);
        expect(assist.can_insert).toBe(true);
        expect(Array.isArray(assist.draft_jsonld.step)).toBe(true);
        expect(assist.draft_jsonld.step).toHaveLength(3);
        expect(assist.draft_jsonld.step[0].text).toContain('Define the query clearly');
    });
});
