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
            'intro_wordcount',
            'intro_readability',
            'intro_schema_suggestion'
        ];

        requiredIntroChecks.forEach((checkId) => {
            expect(checks[checkId]).toBeDefined();
            expect(checks[checkId].provenance).toBe('deterministic');
            expect(['pass', 'partial', 'fail']).toContain(checks[checkId].verdict);
        });

        expect(checks.intro_factual_entities).toBeUndefined();
        expect(checks['intro_focus_and_factuality.v1']).toBeUndefined();
        expect(checks.intro_first_sentence_topic).toBeUndefined();
        expect(checks.intro_wordcount.explanation).toMatch(/opening gives the topic enough room|opening is a little thin|starting to overstay|opening runs too long|too thin to establish the topic/i);
        expect(checks.intro_schema_suggestion.explanation).toMatch(/Article|visible opening content exactly/i);
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
            'intro_wordcount',
            'intro_readability',
            'intro_schema_suggestion'
        ];

        introIds.forEach((checkId) => {
            expect(checksA[checkId].verdict).toBe(checksB[checkId].verdict);
            expect(checksA[checkId].provenance).toBe('deterministic');
            expect(checksB[checkId].provenance).toBe('deterministic');
        });
        expect(checksA.intro_factual_entities).toBeUndefined();
        expect(checksB.intro_factual_entities).toBeUndefined();
        expect(checksA['intro_focus_and_factuality.v1']).toBeUndefined();
        expect(checksB['intro_focus_and_factuality.v1']).toBeUndefined();
        expect(manifestA.preflight_intro.unsupported_factual_count).toBe(manifestB.preflight_intro.unsupported_factual_count);
        expect(manifestA.preflight_intro.supported_factual_count).toBe(manifestB.preflight_intro.supported_factual_count);
        expect(checksA.intro_first_sentence_topic).toBeUndefined();
        expect(checksB.intro_first_sentence_topic).toBeUndefined();
    });

    test('stops intro extraction at the first in-body H2 boundary', async () => {
        const manifest = {
            metadata: { h1_count: 1, has_jsonld: false },
            jsonld: [],
            title: 'What Is AEO and GEO?',
            content_html: [
                '<p>This opening frames the topic clearly and stays inside the intro.</p>',
                '<h2>How to Optimize Content for GEO</h2>',
                '<p>In 2025, 62% of publishers changed their workflow after answer-engine updates.</p>'
            ].join(''),
            block_map: [
                {
                    node_ref: 'block-1',
                    block_type: 'core/paragraph',
                    text: 'This opening frames the topic clearly and stays inside the intro.'
                },
                {
                    node_ref: 'block-2',
                    block_type: 'core/heading',
                    text: 'How to Optimize Content for GEO',
                    meta: { heading_level: 2 }
                },
                {
                    node_ref: 'block-3',
                    block_type: 'core/paragraph',
                    text: 'In 2025, 62% of publishers changed their workflow after answer-engine updates.'
                }
            ],
            plain_text: 'This opening frames the topic clearly and stays inside the intro. How to Optimize Content for GEO In 2025, 62% of publishers changed their workflow after answer-engine updates.'
        };

        await performDeterministicChecks(manifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifest.content_html
        });

        expect(manifest.preflight_intro.intro_text).toBe('This opening frames the topic clearly and stays inside the intro.');
        expect(manifest.preflight_intro.word_count).toBe(11);
        expect(manifest.preflight_intro.intro_bounds.boundary_found).toBe(true);
        expect(manifest.preflight_intro.intro_bounds.boundary_heading_level).toBe(2);
        expect(manifest.preflight_intro.unsupported_factual_count).toBe(0);
    });

    test('stops intro extraction at the first in-body H3 boundary and ignores deeper factual spans', async () => {
        const manifest = {
            metadata: { h1_count: 1, has_jsonld: false },
            jsonld: [],
            title: 'What Is AEO and GEO?',
            content_html: [
                '<p>This opening frames the topic clearly before any subsection begins.</p>',
                '<h3>Early Signals</h3>',
                '<p>In 2025, 62% of publishers changed their workflow after answer-engine updates.</p>'
            ].join(''),
            block_map: [
                {
                    node_ref: 'block-1',
                    block_type: 'core/paragraph',
                    text: 'This opening frames the topic clearly before any subsection begins.'
                },
                {
                    node_ref: 'block-2',
                    block_type: 'core/heading',
                    text: 'Early Signals',
                    meta: { heading_level: 3 }
                },
                {
                    node_ref: 'block-3',
                    block_type: 'core/paragraph',
                    text: 'In 2025, 62% of publishers changed their workflow after answer-engine updates.'
                }
            ],
            plain_text: 'This opening frames the topic clearly before any subsection begins. Early Signals In 2025, 62% of publishers changed their workflow after answer-engine updates.'
        };

        const checks = await performDeterministicChecks(manifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifest.content_html
        });

        expect(manifest.preflight_intro.intro_text).toBe('This opening frames the topic clearly before any subsection begins.');
        expect(manifest.preflight_intro.intro_bounds.boundary_found).toBe(true);
        expect(manifest.preflight_intro.intro_bounds.boundary_heading_level).toBe(3);
        expect(manifest.preflight_intro.factual_spans).toHaveLength(0);
        expect(checks.intro_factual_entities).toBeUndefined();
        expect(manifest.preflight_intro.factual_spans).toHaveLength(0);
        expect(manifest.preflight_intro.unsupported_factual_count).toBe(0);
    });

    test('keeps intro checks active when content starts with an immediate H2', async () => {
        const manifest = {
            metadata: { h1_count: 1, has_jsonld: false },
            jsonld: [],
            title: 'What Is AEO and GEO?',
            content_html: '<h2>How to Optimize Content for GEO</h2><p>This section starts immediately.</p>',
            block_map: [
                {
                    node_ref: 'block-1',
                    block_type: 'core/heading',
                    text: 'How to Optimize Content for GEO',
                    meta: { heading_level: 2 }
                },
                {
                    node_ref: 'block-2',
                    block_type: 'core/paragraph',
                    text: 'This section starts immediately.'
                }
            ],
            plain_text: 'How to Optimize Content for GEO This section starts immediately.'
        };

        const checks = await performDeterministicChecks(manifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifest.content_html
        });

        expect(manifest.preflight_intro).toBeDefined();
        expect(manifest.preflight_intro.word_count).toBe(0);
        expect(manifest.preflight_intro.intro_bounds.boundary_found).toBe(true);
        expect(manifest.preflight_intro.intro_bounds.boundary_heading_level).toBe(2);
        expect(checks.intro_wordcount.verdict).toBe('fail');
        expect(checks['intro_focus_and_factuality.v1']).toBeUndefined();
        expect(checks.intro_factual_entities).toBeUndefined();
    });

    test('uses the recalibrated intro wordcount thresholds', async () => {
        const buildManifest = (count) => {
            const intro = Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
            return {
                metadata: { h1_count: 1, has_jsonld: false },
                jsonld: [],
                title: `Intro ${count}`,
                content_html: `<p>${intro}</p><h2>Section</h2><p>Body copy.</p>`,
                block_map: [
                    { node_ref: `block-${count}-1`, block_type: 'core/paragraph', text: intro },
                    { node_ref: `block-${count}-2`, block_type: 'core/heading', text: 'Section', meta: { heading_level: 2 } },
                    { node_ref: `block-${count}-3`, block_type: 'core/paragraph', text: 'Body copy.' }
                ],
                plain_text: `${intro}\n\nSection\n\nBody copy.`
            };
        };

        const passManifest = buildManifest(140);
        const partialManifest = buildManifest(180);
        const failManifest = buildManifest(210);

        const passChecks = await performDeterministicChecks(passManifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: passManifest.content_html
        });
        const partialChecks = await performDeterministicChecks(partialManifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: partialManifest.content_html
        });
        const failChecks = await performDeterministicChecks(failManifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: failManifest.content_html
        });

        expect(passChecks.intro_wordcount.verdict).toBe('pass');
        expect(passChecks.intro_wordcount.bucket).toBe('snippet_optimal');
        expect(partialChecks.intro_wordcount.verdict).toBe('partial');
        expect(partialChecks.intro_wordcount.bucket).toBe('acceptable');
        expect(failChecks.intro_wordcount.verdict).toBe('fail');
        expect(failChecks.intro_wordcount.bucket).toBe('too_long');
    });

    test('only counts intro factual support when it is local to the factual paragraph', async () => {
        const manifest = {
            metadata: { h1_count: 1, has_jsonld: false },
            jsonld: [],
            title: 'Evidence in the Intro',
            content_html: [
                '<p>In 2025, 62% of teams changed their workflow after answer-engine updates.</p>',
                '<p><a href="https://example.com/report">Industry report</a> found that 48% of editors now publish with AI visibility checks.</p>',
                '<h2>Section</h2><p>Body copy.</p>'
            ].join(''),
            block_map: [
                { node_ref: 'block-1', block_type: 'core/paragraph', text: 'In 2025, 62% of teams changed their workflow after answer-engine updates.' },
                { node_ref: 'block-2', block_type: 'core/paragraph', text: 'Industry report found that 48% of editors now publish with AI visibility checks.' },
                { node_ref: 'block-3', block_type: 'core/heading', text: 'Section', meta: { heading_level: 2 } },
                { node_ref: 'block-4', block_type: 'core/paragraph', text: 'Body copy.' }
            ],
            plain_text: 'In 2025, 62% of teams changed their workflow after answer-engine updates. Industry report found that 48% of editors now publish with AI visibility checks. Section Body copy.'
        };

        const checks = await performDeterministicChecks(manifest, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifest.content_html
        });

        expect(checks.intro_factual_entities).toBeUndefined();
        expect(manifest.preflight_intro.unsupported_factual_count).toBeGreaterThan(0);
        expect(manifest.preflight_intro.supported_factual_count).toBeGreaterThan(0);
        expect(manifest.preflight_intro.support_strategy).toBe('paragraph_link_locality');
        expect(manifest.preflight_intro.factual_spans.some((span) => span.has_supporting_link === true)).toBe(true);
        expect(manifest.preflight_intro.factual_spans.some((span) => span.has_supporting_link === false)).toBe(true);
    });

    test('keeps intro preflight support data stable when schema suggestion changes but core intro signals do not', async () => {
        const intro = [
            'AI visibility optimization helps editorial teams publish clearer, answer-ready openings.',
            'The linked industry report shows that 62% of publishers now prioritize direct extractable introductions.',
            'That shift improves reader comprehension and answer reuse across modern search workflows.',
            'It also reduces ambiguity before the first body section begins.'
        ].join(' ');
        const manifestWithoutSchema = {
            metadata: { h1_count: 1, has_jsonld: false },
            jsonld: [],
            title: 'Strong Intro Without Schema',
            content_html: `<p>${intro.replace('linked industry report', '<a href="https://example.com/report">linked industry report</a>')}</p><h2>Section</h2><p>Body copy.</p>`,
            block_map: [
                { node_ref: 'block-1', block_type: 'core/paragraph', text: intro },
                { node_ref: 'block-2', block_type: 'core/heading', text: 'Section', meta: { heading_level: 2 } },
                { node_ref: 'block-3', block_type: 'core/paragraph', text: 'Body copy.' }
            ],
            plain_text: `${intro} Section Body copy.`
        };
        const manifestWithSchema = JSON.parse(JSON.stringify(manifestWithoutSchema));
        manifestWithSchema.metadata.has_jsonld = true;
        manifestWithSchema.jsonld = [{ '@context': 'https://schema.org', '@type': 'Article', headline: 'Strong Intro Without Schema' }];

        const checksWithoutSchema = await performDeterministicChecks(manifestWithoutSchema, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifestWithoutSchema.content_html
        });
        const checksWithSchema = await performDeterministicChecks(manifestWithSchema, {}, {
            enableIntroFocusFactuality: true,
            contentHtml: manifestWithSchema.content_html
        });

        expect(checksWithoutSchema.intro_schema_suggestion.verdict).toBe('partial');
        expect(checksWithSchema.intro_schema_suggestion.verdict).toBe('pass');
        expect(checksWithoutSchema.intro_factual_entities).toBeUndefined();
        expect(checksWithSchema.intro_factual_entities).toBeUndefined();
        expect(checksWithoutSchema['intro_focus_and_factuality.v1']).toBeUndefined();
        expect(checksWithSchema['intro_focus_and_factuality.v1']).toBeUndefined();
        expect(manifestWithoutSchema.preflight_intro.unsupported_factual_count).toBe(manifestWithSchema.preflight_intro.unsupported_factual_count);
        expect(manifestWithoutSchema.preflight_intro.supported_factual_count).toBe(manifestWithSchema.preflight_intro.supported_factual_count);
    });

    test('treats visible title as the single H1 surface when body H1 is absent', async () => {
        const manifest = {
            metadata: { h1_count: 0 },
            jsonld: [],
            title: 'Painting and Visual Thinking'
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(checks.single_h1.verdict).toBe('pass');
        expect(checks.single_h1.details.title_surface_used).toBe(true);
        expect(checks.single_h1.explanation).toContain('Visible article title');
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
        expect(checks.faq_jsonld_presence_and_completeness.score_neutral).toBe(true);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBe(0);
        expect(checks.faq_jsonld_generation_suggestion).toBeDefined();
        expect(checks.faq_jsonld_generation_suggestion.verdict).toBe('pass');
        expect(checks.faq_jsonld_generation_suggestion.provenance).toBe('deterministic');
        expect(checks.faq_jsonld_generation_suggestion.score_neutral).toBe(true);
        expect(checks.faq_jsonld_generation_suggestion.details.scope_triggered).toBe(false);
        expect(checks.faq_jsonld_generation_suggestion.explanation).toContain('not needed');
    });

    test('anchors missing-alt issue directly to preserved image blocks in post-body content', async () => {
        const manifest = {
            metadata: { h1_count: 1, has_jsonld: false },
            jsonld: [],
            nodes: [
                { tag: 'img', attributes: { src: 'https://cdn.example.com/hero-performance.jpg' } }
            ],
            block_map: [
                {
                    node_ref: 'block-img-1',
                    block_type: 'core/image',
                    text: 'Image: hero performance',
                    snippet: 'Image: hero performance',
                    meta: {
                        media_kind: 'image',
                        image_src: 'https://cdn.example.com/hero-performance.jpg',
                        image_label: 'Image: hero performance'
                    }
                }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(checks.accessibility_basics.verdict).toBe('fail');
        expect(checks.accessibility_basics.highlights).toHaveLength(1);
        expect(checks.accessibility_basics.highlights[0].node_ref).toBe('block-img-1');
        expect(checks.accessibility_basics.highlights[0].message).toMatch(/missing alt text/i);
    });

    test('faq detection stays off for two compact question sections without FAQ intent signals', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'How Fast Can a Mini Excavator Dig?',
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'What affects digging speed?' },
                { node_ref: 'b1', block_type: 'core/paragraph', text: 'Digging speed depends on soil density, operator skill, trench depth, bucket width, and whether the machine has to reposition frequently between passes.' },
                { node_ref: 'b2', block_type: 'core/heading', text: 'Why does bucket size matter?' },
                { node_ref: 'b3', block_type: 'core/paragraph', text: 'A wider bucket can move more soil per pass, but it can also slow precise trenching when the ground is tight or the trench profile needs more control.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.faq_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.score_neutral).toBe(true);
        expect(checks.faq_jsonld_presence_and_completeness.details.question_sections_detected).toBeGreaterThanOrEqual(2);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBeGreaterThanOrEqual(2);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_title_signal).toBe(false);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_section_signal).toBe(false);
        expect(checks.faq_jsonld_generation_suggestion).toBeDefined();
        expect(checks.faq_jsonld_generation_suggestion.verdict).toBe('pass');
        expect(checks.faq_jsonld_generation_suggestion.provenance).toBe('deterministic');
        expect(checks.faq_jsonld_generation_suggestion.score_neutral).toBe(true);
        expect(checks.faq_jsonld_generation_suggestion.details.scope_triggered).toBe(false);
        expect(checks.faq_jsonld_generation_suggestion.explanation).toContain('not needed');
    });

    test('keeps a single question-led explainer out of FAQ pairs while recording structural hints', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Concert Lighting Ideas',
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'What are Lighting Tips & Techniques for Concerts?' },
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'To create a concert experience that stands out, use simple techniques that repeat across songs so lights feel tied to the music and not random.' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'Here are three other practical ideas to consider: Create a mood with lighting: Fade between colors so the change feels natural. Highlight performers: Choose tight spot for solos so the eye lands on the right person. Position light fixtures: Use front lights for clear faces and side lights for shape.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(checks.faq_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.details.question_sections_detected).toBe(1);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBe(0);
        expect(Array.isArray(manifest.preflight_structure.question_sections)).toBe(true);
        expect(manifest.preflight_structure.question_sections).toHaveLength(1);
        expect(Array.isArray(manifest.preflight_structure.pseudo_list_sections)).toBe(true);
        expect(manifest.preflight_structure.pseudo_list_sections).toHaveLength(1);
        expect(manifest.preflight_structure.semantic_candidate_hints.faq_structure_opportunity.question_section_node_refs).toContain('h0');
        expect(manifest.preflight_structure.semantic_candidate_hints.lists_tables_presence.pseudo_list_section_node_refs).toContain('p1');
    });

    test('uses pseudo FAQ labels to trigger FAQ structural grouping', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Frequently Asked Questions' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'What is citation depth?' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'Citation depth measures how many source-backed details sit close to the primary answer a crawler can quote.' },
                { node_ref: 'p3', block_type: 'core/paragraph', text: 'How do headings help answer engines?' },
                { node_ref: 'p4', block_type: 'core/paragraph', text: 'Headings clarify topic boundaries so answer systems can isolate the most relevant section more reliably.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(checks.faq_jsonld_presence_and_completeness.verdict).not.toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_section_signal).toBe(true);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBeGreaterThanOrEqual(2);
        expect(manifest.preflight_structure.question_sections).toHaveLength(2);
        expect(manifest.preflight_structure.heading_like_sections.map((section) => section.node_ref))
            .toEqual(expect.arrayContaining(['p1', 'p3']));
    });

    test('faq detection triggers for compact question sections under an explicit FAQ heading', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'Common Questions' },
                { node_ref: 'b1', block_type: 'core/heading', text: 'What is crawl budget?' },
                { node_ref: 'b2', block_type: 'core/paragraph', text: 'Crawl budget is the number of pages a crawler is likely to fetch and index during each recrawl window.' },
                { node_ref: 'b3', block_type: 'core/heading', text: 'Why does page speed matter?' },
                { node_ref: 'b4', block_type: 'core/paragraph', text: 'Page speed affects usability, retention, and crawl efficiency while improving user trust and conversion paths.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.faq_jsonld_presence_and_completeness.verdict).not.toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBeGreaterThanOrEqual(2);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_section_signal).toBe(true);
        expect(Array.isArray(checks.faq_jsonld_presence_and_completeness.details.detected_pairs)).toBe(true);
        expect(checks.faq_jsonld_presence_and_completeness.details.detected_pairs.length).toBeGreaterThanOrEqual(2);
        expect(checks.faq_jsonld_generation_suggestion).toBeDefined();
        expect(['partial', 'fail']).toContain(checks.faq_jsonld_generation_suggestion.verdict);
        expect(checks.faq_jsonld_generation_suggestion.provenance).toBe('deterministic');
        expect(checks.faq_jsonld_generation_suggestion.details.scope_triggered).toBe(true);
        expect(checks.faq_jsonld_generation_suggestion.explanation).not.toContain('not needed');
    });

    test('faq detection still triggers for three compact question sections without explicit FAQ labeling', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Crawl Signals Explained',
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'What is crawl budget?' },
                { node_ref: 'b1', block_type: 'core/paragraph', text: 'Crawl budget is the number of pages a crawler is likely to fetch and index during each recrawl window.' },
                { node_ref: 'b2', block_type: 'core/heading', text: 'Why does page speed matter?' },
                { node_ref: 'b3', block_type: 'core/paragraph', text: 'Page speed affects usability, retention, and crawl efficiency while improving user trust and conversion paths.' },
                { node_ref: 'b4', block_type: 'core/heading', text: 'When should canonicals be used?' },
                { node_ref: 'b5', block_type: 'core/paragraph', text: 'Canonicals should be used when multiple URLs carry substantially similar content and one preferred version needs to be consolidated.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.faq_jsonld_presence_and_completeness.verdict).not.toBe('pass');
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_pairs_detected).toBeGreaterThanOrEqual(3);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_title_signal).toBe(false);
        expect(checks.faq_jsonld_presence_and_completeness.details.faq_section_signal).toBe(false);
        expect(checks.faq_jsonld_generation_suggestion).toBeDefined();
        expect(['partial', 'fail']).toContain(checks.faq_jsonld_generation_suggestion.verdict);
        expect(checks.faq_jsonld_generation_suggestion.details.scope_triggered).toBe(true);
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

    test('marks absent schema, freshness, and internal-link checks as score-neutral', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            nodes: [],
            links: [],
            content_html: '<h1>Example</h1><p>Body only.</p>'
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'article' }, {});

        expect(checks.valid_jsonld_schema.score_neutral).toBe(true);
        expect(checks.supported_schema_types_validation.score_neutral).toBe(true);
        expect(checks.schema_matches_content.score_neutral).toBe(true);
        expect(checks.content_updated_12_months.score_neutral).toBe(true);
        expect(checks.no_broken_internal_links.score_neutral).toBe(true);
    });

    test('treats companion-only schema as neutral partial instead of mismatch failure', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [
                { content: { '@type': 'FAQPage', mainEntity: [] } }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'article' }, {});

        expect(checks.schema_matches_content.verdict).toBe('partial');
        expect(checks.schema_matches_content.score_neutral).toBe(true);
        expect(checks.schema_matches_content.score_neutral_reason).toBe('schema_companion_only');
    });

    test('evaluates canonical clarity and crawler accessibility from page directives', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            content_html: '<html><head><title>Example</title><link rel="canonical" href="https://example.com/article" /><meta name="robots" content="index,follow" /></head><body><h1>Example</h1></body></html>'
        };

        const checks = await performDeterministicChecks(manifest, { site_url: 'https://example.com/article' }, {});

        expect(checks.canonical_clarity.verdict).toBe('pass');
        expect(checks.ai_crawler_accessibility.verdict).toBe('pass');
    });

    test('fails crawler accessibility when snippet extraction is blocked', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            content_html: '<html><head><meta name="robots" content="noindex,nosnippet" /></head><body><h1>Example</h1></body></html>'
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(checks.ai_crawler_accessibility.verdict).toBe('fail');
        expect(checks.ai_crawler_accessibility.details.restrictive_directives).toContain('noindex');
        expect(checks.ai_crawler_accessibility.details.restrictive_directives).toContain('nosnippet');
    });

    test('keeps freshness neutral for evergreen content and partial for undated freshness-sensitive content', async () => {
        const evergreenManifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { block_type: 'core/paragraph', text: 'Painting develops observation, patience, and creative control over time.' }
            ],
            content_html: '<h1>Painting Basics</h1><p>Painting develops observation, patience, and creative control over time.</p>'
        };
        const evergreenChecks = await performDeterministicChecks(evergreenManifest, { content_type: 'article' }, {});
        expect(evergreenChecks.content_updated_12_months.verdict).toBe('pass');
        expect(evergreenChecks.content_updated_12_months.score_neutral).toBe(true);
        expect(evergreenChecks.content_updated_12_months.score_neutral_reason).toBe('freshness_not_material');

        const evergreenPricingManifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'How SaaS Pricing Works',
            block_map: [
                { block_type: 'core/paragraph', text: 'Pricing strategy explains how software companies structure monthly, annual, and usage-based plans for different customer segments.' }
            ],
            content_html: '<h1>How SaaS Pricing Works</h1><p>Pricing strategy explains how software companies structure monthly, annual, and usage-based plans for different customer segments.</p>'
        };
        const evergreenPricingChecks = await performDeterministicChecks(evergreenPricingManifest, { content_type: 'article' }, {});
        expect(evergreenPricingChecks.content_updated_12_months.verdict).toBe('pass');
        expect(evergreenPricingChecks.content_updated_12_months.score_neutral).toBe(true);
        expect(evergreenPricingChecks.content_updated_12_months.score_neutral_reason).toBe('freshness_not_material');

        const evergreenStatisticsManifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'What Is Statistical Significance?',
            block_map: [
                { block_type: 'core/paragraph', text: 'Statistical significance describes whether an observed result is unlikely to be due to random variation under a defined threshold.' }
            ],
            content_html: '<h1>What Is Statistical Significance?</h1><p>Statistical significance describes whether an observed result is unlikely to be due to random variation under a defined threshold.</p>'
        };
        const evergreenStatisticsChecks = await performDeterministicChecks(evergreenStatisticsManifest, { content_type: 'article' }, {});
        expect(evergreenStatisticsChecks.content_updated_12_months.verdict).toBe('pass');
        expect(evergreenStatisticsChecks.content_updated_12_months.score_neutral).toBe(true);
        expect(evergreenStatisticsChecks.content_updated_12_months.score_neutral_reason).toBe('freshness_not_material');

        const sensitiveManifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { block_type: 'core/paragraph', text: 'Latest pricing trends are changing quickly across the market this year.' }
            ],
            content_html: '<h1>Latest Pricing Trends</h1><p>Latest pricing trends are changing quickly across the market this year.</p>'
        };
        const sensitiveChecks = await performDeterministicChecks(sensitiveManifest, { content_type: 'article' }, {});
        expect(sensitiveChecks.content_updated_12_months.verdict).toBe('partial');
        expect(sensitiveChecks.content_updated_12_months.score_neutral).not.toBe(true);
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
        expect(checks.howto_schema_presence_and_completeness).toBeDefined();
        expect(['partial', 'fail']).toContain(checks.howto_schema_presence_and_completeness.verdict);
        expect(checks.howto_schema_presence_and_completeness.provenance).toBe('deterministic');
        expect(checks.intro_schema_suggestion.details).toHaveProperty('recommended_schema_type');
        expect(checks.intro_schema_suggestion.details).toHaveProperty('recommendation_basis');
    });

    test('does not trigger HowTo schema checks for unordered tips in a non-procedural explainer', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'How Fast Can a Mini Excavator Dig?' },
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Mini excavator digging speed depends on the soil, bucket size, operator skill, machine weight, and hydraulic power available on the job.' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'The tips below explain the factors that influence digging speed so contractors can estimate realistic production without treating the article like a step-by-step procedure.' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Engine and hydraulics affect breakout force and bucket response in compact soil\nMachine movement changes cycle efficiency when the operator has to reposition often\nOperator technique influences how cleanly each bucket pass is completed' }
            ],
            content_html: '<h2>How Fast Can a Mini Excavator Dig?</h2><p>Mini excavator digging speed depends on the soil, bucket size, operator skill, machine weight, and hydraulic power available on the job.</p><p>The tips below explain the factors that influence digging speed so contractors can estimate realistic production without treating the article like a step-by-step procedure.</p><ul><li><strong>Engine and hydraulics:</strong> affect breakout force and bucket response in compact soil.</li><li><strong>Machine movement:</strong> changes cycle efficiency when the operator has to reposition often.</li><li><strong>Operator technique:</strong> influences how cleanly each bucket pass is completed.</li></ul>',
            title: 'How Fast Can a Mini Excavator Dig?'
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(checks.howto_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.howto_jsonld_presence_and_completeness.score_neutral).toBe(true);
        expect(checks.howto_jsonld_presence_and_completeness.details.score_neutral_reason).toBe('howto_intent_not_detected');
        expect(checks.howto_jsonld_presence_and_completeness.details.list_item_count).toBe(0);
        expect(checks.howto_jsonld_presence_and_completeness.details.detected_steps).toHaveLength(0);
        expect(checks.howto_schema_presence_and_completeness.verdict).toBe('pass');
        expect(checks.howto_schema_presence_and_completeness.details.detected_steps).toHaveLength(0);
        expect(checks.howto_schema_presence_and_completeness.details.scope_triggered).toBe(false);
        expect(checks.howto_schema_presence_and_completeness.explanation).toContain('not needed');
    });

    test('captures list-backed context for real HowTo schema candidates', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Use this simple excavation sequence to keep the trench line clean and controlled.' },
                { node_ref: 'l0', block_type: 'core/list', text: '1. Mark the trench line\n2. Cut a shallow pilot pass\n3. Move spoil clear of the trench edge' }
            ],
            content_html: '<p>Use this simple excavation sequence to keep the trench line clean and controlled.</p><ol><li>Mark the trench line</li><li>Cut a shallow pilot pass</li><li>Move spoil clear of the trench edge</li></ol>',
            title: 'How to Dig with a Mini Excavator'
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        const sourceDetails = checks.howto_jsonld_presence_and_completeness.details;
        const bridgeDetails = checks.howto_schema_presence_and_completeness.details;

        expect(sourceDetails.context_node_ref).toBe('l0');
        expect(sourceDetails.detected_steps.length).toBeGreaterThanOrEqual(3);
        sourceDetails.detected_steps.forEach((step) => {
            expect(step.node_ref).toBe('l0');
        });
        expect(bridgeDetails.context_node_ref).toBe('l0');
        expect(bridgeDetails.scope_triggered).toBe(true);
        expect(checks.howto_schema_presence_and_completeness.explanation).not.toContain('not needed');
    });

    test('captures pseudo step-heading paragraphs in procedural sections', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Floor Prep Basics',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Step 1: Clean the Surface' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'Remove dust, wax, and loose debris so the primer bonds evenly across the floor.' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'Step 2: Apply the Primer' },
                { node_ref: 'p3', block_type: 'core/paragraph', text: 'Roll primer in steady passes and let it dry before you start the finish coat.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});

        expect(Array.isArray(manifest.preflight_structure.heading_like_sections)).toBe(true);
        expect(manifest.preflight_structure.heading_like_sections).toHaveLength(2);
        expect(manifest.preflight_structure.heading_like_sections[0].step_like).toBe(true);
        expect(manifest.preflight_structure.procedural_sections).toHaveLength(2);
        expect(checks.howto_jsonld_presence_and_completeness.details.step_heading_count).toBeGreaterThanOrEqual(2);
        expect(checks.howto_schema_presence_and_completeness.details.scope_triggered).toBe(true);
    });

    test('marks a single heading-like paragraph as a partial heading-markup issue', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Concert Lighting Ideas',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Concert lighting works best when sections are easy to scan on first read.' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'What are Lighting Tips & Techniques for Concerts?' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'Use repeatable lighting cues so transitions feel tied to the music instead of random.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.heading_like_text_uses_heading_markup.verdict).toBe('partial');
        expect(checks.heading_like_text_uses_heading_markup.details.heading_like_count).toBe(1);
        expect(checks.heading_like_text_uses_heading_markup.details.context_node_ref).toBe('p1');
        expect(checks.heading_like_text_uses_heading_markup.highlights[0].node_ref).toBe('p1');
    });

    test('fails heading-markup check when multiple pseudo headings shape the article structure', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Concert Lighting Ideas',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Great lighting makes a live show easier to follow and remember.' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'Top Fixture Ideas' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'Pick versatile fixtures first so each cue has room to evolve.' },
                { node_ref: 'p3', block_type: 'core/paragraph', text: 'What are Lighting Tips & Techniques for Concerts?' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Use backlight to separate performers from the backdrop\nMatch color changes to the emotional shift in each song' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.heading_like_text_uses_heading_markup.verdict).toBe('fail');
        expect(checks.heading_like_text_uses_heading_markup.details.heading_like_count).toBe(2);
        expect(checks.heading_like_text_uses_heading_markup.details.structurally_impactful_count).toBeGreaterThanOrEqual(1);
        expect(checks.heading_like_text_uses_heading_markup.highlights.map((highlight) => highlight.node_ref))
            .toEqual(expect.arrayContaining(['p1', 'p3']));
    });

    test('ignores meta title and meta description labels in heading-markup detection', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Lighting Metadata Example',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Meta Title: Concert Lighting Ideas for Live Events' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'Meta Description: Learn how to shape mood, highlight performers, and build better stage scenes.' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'This article explains how stage lighting can improve mood and visual clarity during live performances.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.heading_like_text_uses_heading_markup.verdict).toBe('pass');
        expect(checks.heading_like_text_uses_heading_markup.details.heading_like_count).toBe(0);
    });

    test('keeps ItemList schema neutral when no strong visible list candidate exists', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'AI Visibility Notes',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'This article explains how answer engines interpret content structure and schema.' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Short note\nAnother short note' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.itemlist_jsonld_presence_and_completeness.score_neutral).toBe(true);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.score_neutral_reason).toBe('itemlist_intent_not_detected');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.scope_triggered).toBe(false);
    });

    test('fails ItemList schema check for a two-item real list under a question heading', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Biology Basics',
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'What are the two sexes assigned at birth?' },
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'These include:' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Male: biological traits typically grouped under male sex classification\nFemale: biological traits typically grouped under female sex classification' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('fail');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.candidate_count).toBe(1);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.context_node_ref).toBe('l0');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.detected_candidates[0].source_kind).toBe('list_block');
        expect(manifest.preflight_structure.visible_itemlist_sections[0].item_count).toBe(2);
    });

    test('uses question-style pseudo headings as ItemList section boundaries', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Concert Lighting Ideas',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Concert lighting works best when each section feels deliberate and easy to scan.' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: 'What are Lighting Tips & Techniques for Concerts?' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'Use these quick ideas to make the stage easier to read from the crowd.' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Use backlight to separate performers from the backdrop\nMatch color changes to the emotional shift in each song' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('fail');
        expect(manifest.preflight_structure.heading_like_sections).toHaveLength(1);
        expect(manifest.preflight_structure.heading_like_sections[0].node_ref).toBe('p1');
        expect(manifest.preflight_structure.heading_like_sections[0].question_like).toBe(true);
        expect(manifest.preflight_structure.visible_itemlist_sections[0].heading_node_ref).toBe('p1');
        expect(manifest.preflight_structure.visible_itemlist_sections[0].item_count).toBe(2);
    });

    test('fails ItemList schema check when a strong visible list has no ItemList JSON-LD', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Top AI Visibility Tools',
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'Top AI Visibility Tools' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Perplexity tracking dashboards\nCitation monitoring workflows\nEntity coverage audits' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('fail');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.candidate_count).toBe(1);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.itemlist_schema_found).toBe(0);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.context_node_ref).toBe('l0');
    });

    test('detects bullet-glyph paragraph sequences as visible ItemList candidates', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'Concert Lighting Ideas',
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'What are the Top Concert Lighting Ideas?' },
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Top concert lighting designs create depth, mood, and dramatic moments. Here are a few ideas to inspire your next concert lighting project or event:' },
                { node_ref: 'p1', block_type: 'core/paragraph', text: '\u00B7 Use Intensity, Color & Motion to Shape Mood' },
                { node_ref: 'p2', block_type: 'core/paragraph', text: 'Use intensity for emotion by dimming lights for quiet parts and raising them for big moments.' },
                { node_ref: 'p3', block_type: 'core/paragraph', text: '\u00B7 Choose Fixtures by Function' },
                { node_ref: 'p4', block_type: 'core/paragraph', text: 'Choose moving heads for focus, LED pars for washes, and strobes for impact.' },
                { node_ref: 'p5', block_type: 'core/paragraph', text: '\u00B7 Layered Lighting & Scene-Based Design' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('fail');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.candidate_count).toBe(1);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.context_node_ref).toBe('p1');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.detected_candidates[0].source_kind).toBe('bullet_block_sequence');
        expect(manifest.preflight_structure.visible_itemlist_sections[0].source_kind).toBe('bullet_block_sequence');
        expect(manifest.preflight_structure.semantic_candidate_hints.lists_tables_presence.visible_list_section_node_refs).toContain('p1');
    });

    test('marks ItemList schema partial when visible entries and schema drift apart', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            title: 'Top AI Visibility Tools',
            jsonld: [
                {
                    content: {
                        '@context': 'https://schema.org',
                        '@type': 'ItemList',
                        itemListElement: [
                            { '@type': 'ListItem', position: 1, name: 'Perplexity tracking dashboards' }
                        ]
                    }
                }
            ],
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'Top AI Visibility Tools' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Perplexity tracking dashboards\nCitation monitoring workflows\nEntity coverage audits' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('partial');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.itemlist_schema_found).toBe(1);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.itemlist_schema_complete).toBe(0);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.context_node_ref).toBe('l0');
    });

    test('passes ItemList schema check when strong visible lists align with ItemList JSON-LD', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            title: 'Top AI Visibility Tools',
            jsonld: [
                {
                    content: {
                        '@context': 'https://schema.org',
                        '@type': 'ItemList',
                        itemListElement: [
                            { '@type': 'ListItem', position: 1, name: 'Perplexity tracking dashboards' },
                            { '@type': 'ListItem', position: 2, name: 'Citation monitoring workflows' },
                            { '@type': 'ListItem', position: 3, name: 'Entity coverage audits' }
                        ]
                    }
                }
            ],
            block_map: [
                { node_ref: 'h0', block_type: 'core/heading', text: 'Top AI Visibility Tools' },
                { node_ref: 'l0', block_type: 'core/list', text: 'Perplexity tracking dashboards\nCitation monitoring workflows\nEntity coverage audits' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.itemlist_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.itemlist_jsonld_presence_and_completeness.details.itemlist_schema_complete).toBe(1);
        expect(checks.itemlist_jsonld_presence_and_completeness.details.itemlist_schema_aligned).toBe(1);
    });

    test('keeps Article schema neutral for non-article content types', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'How to Improve AI Visibility',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'Follow the steps below to improve AI retrieval and citation performance.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'howto' }, {});

        expect(checks.article_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.article_jsonld_presence_and_completeness.score_neutral).toBe(true);
        expect(checks.article_jsonld_presence_and_completeness.details.score_neutral_reason).toBe('article_schema_not_applicable');
        expect(checks.article_jsonld_presence_and_completeness.details.scope_triggered).toBe(false);
    });

    test('fails Article schema check when article-like content has no primary article schema', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            jsonld: [],
            title: 'AI Visibility Benchmarks',
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'This article compares AI visibility benchmarks across retrieval, citations, and entity coverage.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.article_jsonld_presence_and_completeness.verdict).toBe('fail');
        expect(checks.article_jsonld_presence_and_completeness.details.article_schema_found).toBe(0);
        expect(checks.article_jsonld_presence_and_completeness.details.context_node_ref).toBe('p0');
    });

    test('marks Article schema partial when only companion schemas are present', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            title: 'AI Visibility Benchmarks',
            jsonld: [
                {
                    content: {
                        '@context': 'https://schema.org',
                        '@type': 'FAQPage',
                        mainEntity: []
                    }
                }
            ],
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'This article compares AI visibility benchmarks across retrieval, citations, and entity coverage.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, { content_type: 'post' }, {});

        expect(checks.article_jsonld_presence_and_completeness.verdict).toBe('partial');
        expect(checks.article_jsonld_presence_and_completeness.details.article_schema_found).toBe(0);
        expect(checks.article_jsonld_presence_and_completeness.details.companion_only).toBe(true);
    });

    test('passes Article schema check when article-like content has a complete primary article schema', async () => {
        const manifest = {
            metadata: { h1_count: 1 },
            title: 'AI Visibility Benchmarks',
            jsonld: [
                {
                    content: {
                        '@context': 'https://schema.org',
                        '@type': 'BlogPosting',
                        headline: 'AI Visibility Benchmarks',
                        author: { '@type': 'Person', name: 'Jane Doe' },
                        datePublished: '2026-03-20T00:00:00.000Z',
                        mainEntityOfPage: 'https://example.com/ai-visibility-benchmarks'
                    }
                }
            ],
            block_map: [
                { node_ref: 'p0', block_type: 'core/paragraph', text: 'This article compares AI visibility benchmarks across retrieval, citations, and entity coverage.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {
            content_type: 'post',
            canonical_url: 'https://example.com/ai-visibility-benchmarks'
        }, {});

        expect(checks.article_jsonld_presence_and_completeness.verdict).toBe('pass');
        expect(checks.article_jsonld_presence_and_completeness.details.article_schema_found).toBe(1);
        expect(checks.article_jsonld_presence_and_completeness.details.article_schema_complete).toBe(1);
        expect(checks.article_jsonld_presence_and_completeness.details.preferred_article_type).toBe('BlogPosting');
    });

    test('deterministic checks do not emit heading_topic_fulfillment (AI-owned)', async () => {
        const manifest = {
            metadata: { h1_count: 1, h2_count: 1 },
            jsonld: [],
            block_map: [
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'Caching Strategies' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'Too short support.' }
            ]
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.heading_topic_fulfillment).toBeUndefined();
    });

    test('heading fragmentation emits per-heading instance messages for over-split H2 sections that hand off immediately', async () => {
        const blockMap = [];
        for (let i = 1; i <= 7; i += 1) {
            blockMap.push({ node_ref: `h2-${i}`, signature: `sig-h2-${i}`, block_type: 'core/h2', text: `Section ${i}` });
            blockMap.push({
                node_ref: `h3-${i}`,
                signature: `sig-h3-${i}`,
                block_type: 'core/h3',
                text: `Detail ${i}`
            });
            blockMap.push({
                node_ref: `p-${i}-1`,
                signature: `sig-p-${i}-1`,
                block_type: 'core/paragraph',
                text: 'This subsection handles the detail immediately after the H2 without a grounding paragraph for the parent section.'
            });
        }
        const manifest = {
            metadata: { h1_count: 1, h2_count: 7, h3_count: 7 },
            jsonld: [],
            block_map: blockMap
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.heading_fragmentation.verdict).toBe('fail');
        expect(checks.heading_fragmentation.highlights.length).toBeGreaterThan(0);
        expect(checks.heading_fragmentation.details.top_level_split_section_count).toBe(7);
        checks.heading_fragmentation.highlights.forEach((highlight) => {
            expect(highlight.message).toContain('hands off to another heading');
            expect(highlight.message).not.toMatch(/contains \d+|heading\(s\)|other sections/i);
        });
    });

    test('heading fragmentation stays pass when nested H3 sections are introduced with framing content', async () => {
        const blockMap = [];
        for (let i = 1; i <= 7; i += 1) {
            blockMap.push({ node_ref: `h2-${i}`, signature: `sig-h2-${i}`, block_type: 'core/h2', text: `Section ${i}` });
            blockMap.push({
                node_ref: `p-${i}-intro`,
                signature: `sig-p-${i}-intro`,
                block_type: 'core/paragraph',
                text: 'This framing paragraph introduces the section clearly before any nested subheading appears, so the H2 lands as a real top-level section.'
            });
            blockMap.push({ node_ref: `h3-${i}-a`, signature: `sig-h3-${i}-a`, block_type: 'core/h3', text: `Detail ${i}.1` });
            blockMap.push({
                node_ref: `p-${i}-a`,
                signature: `sig-p-${i}-a`,
                block_type: 'core/paragraph',
                text: 'This subsection expands the main idea with practical context, concrete examples, supporting evidence, audience-specific nuance, and enough descriptive support to satisfy the parent section even when the section outline uses nested headings.'
            });
            blockMap.push({ node_ref: `h3-${i}-b`, signature: `sig-h3-${i}-b`, block_type: 'core/h3', text: `Detail ${i}.2` });
            blockMap.push({
                node_ref: `p-${i}-b`,
                signature: `sig-p-${i}-b`,
                block_type: 'core/paragraph',
                text: 'A second subsection adds clarifying guidance, implementation notes, and concrete follow-up detail so the parent H2 remains well supported instead of looking artificially thin in a hierarchy-aware heading audit.'
            });
        }

        const manifest = {
            metadata: { h1_count: 1, h2_count: 7, h3_count: 14 },
            jsonld: [],
            block_map: blockMap
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.heading_fragmentation.verdict).toBe('pass');
        expect(checks.heading_fragmentation.details.hierarchy_aware).toBe(true);
        expect(checks.heading_fragmentation.details.top_level_split_section_count).toBe(0);
        expect(checks.heading_fragmentation.highlights).toHaveLength(0);
    });

    test('heading fragmentation stays pass when preserved list blocks provide section support', async () => {
        const blockMap = [];
        for (let i = 1; i <= 9; i += 1) {
            blockMap.push({ node_ref: `h2-${i}`, signature: `sig-h2-${i}`, block_type: 'core/h2', text: `Section ${i}` });
            blockMap.push({
                node_ref: `p-${i}`,
                signature: `sig-p-${i}`,
                block_type: 'core/paragraph',
                text: i <= 3
                    ? 'This introduction is intentionally brief.'
                    : 'This section begins with a clear framing paragraph before the supporting list expands the topic with concrete detail and practical takeaways.'
            });
            blockMap.push({
                node_ref: `l-${i}`,
                signature: `sig-l-${i}`,
                block_type: 'core/list',
                text: i <= 3
                    ? 'Practical example with supporting detail that expands the section meaningfully for readers\nSpecific implementation note for this section with context and a useful qualifier\nMeasured outcome or trusted takeaway that reinforces the heading with evidence'
                    : 'Concrete implementation detail for the topic with enough specificity to support the section fully\nSupporting evidence or cited takeaway for the reader that clarifies why the recommendation matters\nSpecific action teams can apply immediately without losing the larger strategic context\nClarifying note that improves extractability, trust, and downstream answer usability'
            });
        }

        const manifest = {
            metadata: { h1_count: 1, h2_count: 9 },
            jsonld: [],
            block_map: blockMap
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.heading_fragmentation.verdict).toBe('pass');
        expect(checks.heading_fragmentation.details.top_level_split_section_count).toBe(0);
        expect(checks.heading_fragmentation.highlights).toHaveLength(0);
    });

    test('heading fragmentation stays pass for brief but framed H2 sections', async () => {
        const blockMap = [];
        for (let i = 1; i <= 8; i += 1) {
            blockMap.push({ node_ref: `h2-${i}`, signature: `sig-h2-${i}`, block_type: 'core/h2', text: `Section ${i}` });
            blockMap.push({
                node_ref: `p-${i}`,
                signature: `sig-p-${i}`,
                block_type: 'core/paragraph',
                text: 'Quick framing note.'
            });
        }

        const manifest = {
            metadata: { h1_count: 1, h2_count: 8 },
            jsonld: [],
            block_map: blockMap
        };

        const checks = await performDeterministicChecks(manifest, {}, {});
        expect(checks.heading_fragmentation.verdict).toBe('pass');
        expect(checks.heading_fragmentation.details.top_level_split_section_count).toBe(0);
        expect(checks.heading_fragmentation.highlights).toHaveLength(0);
    });
});
