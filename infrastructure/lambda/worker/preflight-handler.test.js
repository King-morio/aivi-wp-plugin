const { performDeterministicChecks } = require('./preflight-handler');

const buildIntroManifest = () => ({
    metadata: {
        h1_count: 1,
        has_jsonld: false
    },
    jsonld: [],
    content_html: `
      <h1>What Is AI Search Optimization?</h1>
      <p>AI Search Optimization is the process of structuring content so LLM systems can extract and cite it.</p>
      <p>In 2025, 62% of discovery flows involved answer-style retrieval according to multiple reports.</p>
      <p>Teams should keep intros concise and factual to improve trust and retrieval quality.</p>
    `,
    block_map: [
        {
            node_ref: 'block-0',
            signature: 'sig-0',
            block_type: 'core/paragraph',
            text: 'AI Search Optimization is the process of structuring content so LLM systems can extract and cite it.'
        },
        {
            node_ref: 'block-1',
            signature: 'sig-1',
            block_type: 'core/paragraph',
            text: 'In 2025, 62% of discovery flows involved answer-style retrieval according to multiple reports.'
        },
        {
            node_ref: 'block-2',
            signature: 'sig-2',
            block_type: 'core/paragraph',
            text: 'Teams should keep intros concise and factual to improve trust and retrieval quality.'
        }
    ],
    plain_text: [
        'AI Search Optimization is the process of structuring content so LLM systems can extract and cite it.',
        'In 2025, 62% of discovery flows involved answer-style retrieval according to multiple reports.',
        'Teams should keep intros concise and factual to improve trust and retrieval quality.'
    ].join('\n\n'),
    title: 'What Is AI Search Optimization?'
});

describe('Worker preflight intro deterministic checks', () => {
    test('emits deterministic intro ownership checks when intro feature is enabled', async () => {
        const manifest = buildIntroManifest();
        const checks = await performDeterministicChecks(manifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifest.content_html
        });

        const requiredIntroChecks = [
            'intro_first_sentence_topic',
            'intro_wordcount',
            'intro_readability',
            'intro_factual_entities',
            'intro_schema_suggestion',
            'intro_focus_and_factuality.v1'
        ];

        requiredIntroChecks.forEach((checkId) => {
            expect(checks[checkId]).toBeDefined();
            expect(checks[checkId].provenance).toBe('deterministic');
            expect(['pass', 'partial', 'fail']).toContain(checks[checkId].verdict);
        });

        expect(checks['intro_focus_and_factuality.v1'].components).toBeDefined();
        expect(checks['intro_focus_and_factuality.v1'].components).toHaveProperty('intro_wordcount');
        expect(checks['intro_focus_and_factuality.v1'].components).toHaveProperty('intro_readability');
        expect(checks['intro_focus_and_factuality.v1'].components).toHaveProperty('intro_first_sentence_topic');
        expect(checks['intro_focus_and_factuality.v1'].components).toHaveProperty('intro_factual_entities');
        expect(checks['intro_focus_and_factuality.v1'].components).toHaveProperty('intro_schema_suggestion');
    });

    test('intro deterministic outputs are stable across identical replays', async () => {
        const manifestA = buildIntroManifest();
        const manifestB = buildIntroManifest();

        const checksA = await performDeterministicChecks(manifestA, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifestA.content_html
        });
        const checksB = await performDeterministicChecks(manifestB, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifestB.content_html
        });

        const introIds = [
            'intro_first_sentence_topic',
            'intro_wordcount',
            'intro_readability',
            'intro_factual_entities',
            'intro_schema_suggestion',
            'intro_focus_and_factuality.v1'
        ];

        introIds.forEach((checkId) => {
            expect(checksA[checkId].verdict).toBe(checksB[checkId].verdict);
            expect(checksA[checkId].provenance).toBe('deterministic');
            expect(checksB[checkId].provenance).toBe('deterministic');
        });
    });

    test('faq detection ignores topical headings that are not strict questions', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'Speed Optimization' },
                { node_ref: 'b1', block_type: 'core/paragraph', text: 'Website speed optimization includes caching, compression, and media tuning for improved load performance across many devices.' },
                { node_ref: 'b2', block_type: 'core/heading', text: 'How to Improve Caching' },
                { node_ref: 'b3', block_type: 'core/paragraph', text: 'Caching can improve repeat-visit performance when browser and CDN policies are tuned with stable cache keys.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.faq_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBe(0);
    });

    test('faq detection triggers only for explicit strict question headings', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'What is crawl budget?' },
                { node_ref: 'b1', block_type: 'core/paragraph', text: 'Crawl budget is the number of pages a crawler is likely to fetch and index during each recrawl window.' },
                { node_ref: 'b2', block_type: 'core/heading', text: 'Why does page speed matter?' },
                { node_ref: 'b3', block_type: 'core/paragraph', text: 'Page speed affects usability, retention, and crawl efficiency while improving user trust and conversion paths.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.faq_jsonld_presence_and_completeness.verdict).not.toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBeGreaterThanOrEqual(2);
        expect(Array.isArray(checks.faq_jsonld_presence_and_completeness.details.detected_pairs)).toBe(true);
        expect(checks.faq_jsonld_presence_and_completeness.details.detected_pairs.length).toBeGreaterThanOrEqual(2);
    });

    test('exposes invalid JSON-LD detail errors for repair flow', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [
                { type: 'Invalid', valid: false, error: 'Unexpected token', start_offset: 10, end_offset: 50 }
            ],
            nodes: [
                { id: 'n0', start_offset: 0, end_offset: 100 }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.valid_jsonld_schema.verdict).toBe('fail');
        expect(Array.isArray(checks.valid_jsonld_schema.details.invalid_jsonld_errors)).toBe(true);
        expect(checks.valid_jsonld_schema.details.invalid_jsonld_errors.length).toBeGreaterThan(0);
    });

    test('exposes deterministic detected_steps and intro schema recommendation fields', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'How to Improve Website Performance' },
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Follow these simple steps to speed up your website loading time.' },
                { node_ref: 'l0', block_type: 'core/list', text: '1. Compress images\n2. Enable caching\n3. Minify CSS and JavaScript' }
            ],
            content_html: '<h2>How to Improve Website Performance</h2><p>Follow these simple steps to speed up your website loading time.</p><ol><li>Compress images</li><li>Enable caching</li><li>Minify CSS and JavaScript</li></ol>',
            title: 'How to Improve Website Performance'
        };

        const checks = await performDeterministicChecks(manifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifest.content_html
        });

        expect(Array.isArray(checks.howto_jsonld_presence_and_completeness.details.detected_steps)).toBe(true);
        expect(checks.howto_jsonld_presence_and_completeness.details.detected_steps.length).toBeGreaterThanOrEqual(2);
        expect(checks.intro_schema_suggestion.details).toHaveProperty('recommended_schema_type');
        expect(checks.intro_schema_suggestion.details).toHaveProperty('recommendation_basis');
    });

    test('deterministic checks do not emit orphan_headings (AI-owned)', async () => {
        const manifest = {
            metadata: { h1_count: 1, h2_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'Caching Strategies' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'Too short support.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.orphan_headings).toBeUndefined();
    });

    test('heading fragmentation emits per-heading instance messages instead of aggregate count text', async () => {
        const blockMap = [];
        for (let i = 1; i <= 7; i += 1) {
            blockMap.push({ node_ref: `h2-${i}`, signature: `sig-h2-${i}`, block_type: 'core/heading', text: `Section ${i}` });
            blockMap.push({
                node_ref: `p-${i}`,
                signature: `sig-p-${i}`,
                block_type: 'core/paragraph',
                text: 'Short support text for this section only.'
            });
        }
        const manifest = {
            metadata: { h1_count: 1, h2_count: 7 },
            jsonld: [],
            block_map: blockMap
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.heading_fragmentation.verdict).toBe('fail');
        expect(checks.heading_fragmentation.highlights.length).toBeGreaterThan(0);
        checks.heading_fragmentation.highlights.forEach((highlight) => {
            expect(highlight.message).toContain('fragmented section');
            expect(highlight.message).not.toMatch(/contains \d+|heading\(s\)|other sections/i);
        });
    });
});
