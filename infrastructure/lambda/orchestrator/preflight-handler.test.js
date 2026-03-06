const { createManifest, estimateTokens, performDeterministicChecks } = require('./preflight-handler');

describe('Preflight Handler', () => {
  describe('createManifest', () => {
    test('should parse basic HTML correctly', async () => {
      const html = `
        <h1>Test Title</h1>
        <p>Test paragraph</p>
        <h2>Subtitle</h2>
        <p>More content</p>
      `;

      const manifest = await createManifest(html, 'Test Title');

      expect(manifest.title).toBe('Test Title');
      expect(manifest.metadata.h1_count).toBe(1);
      expect(manifest.metadata.h2_count).toBe(1);
      expect(manifest.nodes).toHaveLength(4); // h1, p, h2, p (text nodes not counted)
      expect(manifest.plain_text).toContain('Test Title');
      expect(manifest.plain_text).toContain('Test paragraph');
      expect(manifest.wordEstimate).toBeGreaterThan(0);
    });

    test('should handle multiple H1 tags', async () => {
      const html = `
        <h1>First Title</h1>
        <p>Content</p>
        <h1>Second Title</h1>
        <p>More content</p>
      `;

      const manifest = await createManifest(html);

      expect(manifest.metadata.h1_count).toBe(2);
    });

    test('should parse JSON-LD correctly', async () => {
      const html = `
        <h1>Article</h1>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "Test Article"
        }
        </script>
      `;

      const manifest = await createManifest(html);

      expect(manifest.jsonld).toHaveLength(1);
      expect(manifest.jsonld[0].type).toBe('Article');
      expect(manifest.jsonld[0].valid).toBe(true);
      expect(manifest.metadata.has_jsonld).toBe(true);
    });

    test('should handle invalid JSON-LD', async () => {
      const html = `
        <h1>Article</h1>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Article"
          "missing": "comma"
        }
        </script>
      `;

      const manifest = await createManifest(html);

      expect(manifest.jsonld).toHaveLength(1);
      expect(manifest.jsonld[0].valid).toBe(false);
      expect(manifest.jsonld[0].error).toBeDefined();
    });

    test('should extract links correctly', async () => {
      const html = `
        <h1>Test</h1>
        <p>Link to <a href="/internal">internal page</a></p>
        <p>And <a href="https://external.com">external site</a></p>
      `;

      const manifest = await createManifest(html, 'Test', 'https://example.com');

      expect(manifest.links).toHaveLength(2);
      expect(manifest.links[0].internal).toBe(true);
      expect(manifest.links[0].url).toBe('/internal');
      expect(manifest.links[1].internal).toBe(false);
      expect(manifest.links[1].url).toBe('https://external.com');
    });
  });

  describe('estimateTokens', () => {
    test('should estimate tokens for plain text', () => {
      const manifest = {
        plain_text: 'This is a test sentence for token estimation.'
      };

      const tokens = estimateTokens(manifest);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100); // Should be reasonable for short text
    });

    test('should handle empty content', () => {
      const manifest = {
        plain_text: ''
      };

      const tokens = estimateTokens(manifest);

      expect(tokens).toBe(0);
    });
  });

  describe('performDeterministicChecks', () => {
    test('should pass single H1 check', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: []
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.single_h1.verdict).toBe('pass');
      expect(checks.single_h1.confidence).toBe(1.0);
    });

    test('should fail multiple H1 check', async () => {
      const manifest = {
        metadata: { h1_count: 2 },
        jsonld: [],
        content_html: '<h1>Primary Title</h1><h1>Secondary Title</h1>',
        block_map: [
          { node_ref: 'block-0', block_type: 'core/heading', text: 'Primary Title' },
          { node_ref: 'block-1', block_type: 'core/heading', text: 'Secondary Title' }
        ]
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.single_h1.verdict).toBe('partial');
      expect(checks.single_h1.explanation).toContain('2 H1 tags');
      expect(checks.single_h1.highlights.length).toBeGreaterThan(0);
    });

    test('should fail no H1 check', async () => {
      const manifest = {
        metadata: { h1_count: 0 },
        jsonld: []
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.single_h1.verdict).toBe('fail');
      expect(checks.single_h1.explanation).toContain('No H1 tag');
    });

    test('should validate JSON-LD schema', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [
          { type: 'Article', valid: true, start_offset: 10, end_offset: 50 }
        ],
        nodes: [
          { id: 'n0', start_offset: 0, end_offset: 100 }
        ]
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.valid_jsonld_schema.verdict).toBe('pass');
    });

    test('should fail invalid JSON-LD', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [
          { type: 'Invalid', valid: false, error: 'Unexpected token', start_offset: 10, end_offset: 50 }
        ],
        nodes: [
          { id: 'n0', start_offset: 0, end_offset: 100 }
        ]
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.valid_jsonld_schema.verdict).toBe('fail');
      expect(checks.valid_jsonld_schema.highlights).toHaveLength(1);
      expect(Array.isArray(checks.valid_jsonld_schema.details.invalid_jsonld_errors)).toBe(true);
      expect(checks.valid_jsonld_schema.details.invalid_jsonld_errors.length).toBeGreaterThan(0);
    });

    test('should not emit orphan_headings in deterministic output', async () => {
      const manifest = {
        metadata: { h1_count: 1, h2_count: 1 },
        jsonld: [],
        block_map: [
          {
            node_ref: 'block-0',
            block_type: 'core/heading',
            signature: 'sig-h2',
            text: 'Short Section'
          },
          {
            node_ref: 'block-1',
            block_type: 'core/paragraph',
            signature: 'sig-p',
            text: 'Too short.'
          }
        ]
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.orphan_headings).toBeUndefined();
    });

    test('should evaluate metadata and accessibility checks', async () => {
      const manifest = {
        metadata: { h1_count: 1, img_count: 2 },
        jsonld: [],
        content_html: '<html lang="en"><head><title>Test</title><meta name="description" content="Desc"><link rel="canonical" href="https://example.com"/></head><body></body></html>',
        nodes: [
          { tag: 'img', attributes: { src: '/a.jpg', alt: 'A' } },
          { tag: 'img', attributes: { src: '/b.jpg' } }
        ]
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.metadata_checks.verdict).toBe('pass');
      expect(checks.accessibility_basics.verdict).toBe('partial');
      expect(checks.accessibility_basics.details.missing).toBe(1);
    });

    test('should anchor missing-alt issue when image source terms appear in text blocks', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        nodes: [
          { tag: 'img', attributes: { src: 'https://cdn.example.com/hero-performance.jpg' } }
        ],
        block_map: [
          {
            node_ref: 'block-1',
            block_type: 'core/paragraph',
            text: 'The hero performance image appears above the fold and needs better accessibility.'
          }
        ]
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.accessibility_basics.verdict).toBe('fail');
      expect(checks.accessibility_basics.highlights.length).toBeGreaterThan(0);
    });

    test('should validate schema types and match content type', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [
          { content: { '@type': 'Article', headline: 'Title', author: { name: 'Jane' }, datePublished: '2025-01-01' } }
        ]
      };

      const checks = await performDeterministicChecks(manifest, { content_type: 'article' });

      expect(checks.supported_schema_types_validation.verdict).toBe('pass');
      expect(checks.schema_matches_content.verdict).toBe('pass');
    });

    test('should compute intro preflight metrics when enabled', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        content_html: '<p>This is the first sentence about AI visibility. This is the second sentence in the intro with 2025 data at 62%.</p>',
        block_map: [
          {
            block_type: 'core/paragraph',
            text: 'This is the first sentence about AI visibility. This is the second sentence in the intro with 2025 data at 62%.',
            node_ref: 'block-1',
            signature: 'sig-1'
          }
        ],
        title: 'AI Visibility Intro Guide'
      };

      const checks = await performDeterministicChecks(manifest, {}, {
        enableIntroFocusFactuality: true,
        contentHtml: manifest.content_html
      });

      expect(checks.intro_first_sentence_topic).toBeDefined();
      expect(checks.intro_wordcount).toBeDefined();
      expect(checks.intro_readability).toBeDefined();
      expect(checks.intro_factual_entities).toBeDefined();
      expect(checks.intro_schema_suggestion).toBeDefined();
      expect(checks['intro_focus_and_factuality.v1']).toBeDefined();
      expect(checks['intro_focus_and_factuality.v1'].components).toBeDefined();
      expect(checks['intro_focus_and_factuality.v1'].provenance).toBe('deterministic');
      expect(manifest.preflight_intro).toBeDefined();
      expect(manifest.preflight_intro.word_count).toBeGreaterThan(0);
      expect(manifest.preflight_intro.readability).toBeDefined();
    });

    test('should keep intro deterministic verdicts stable across identical inputs', async () => {
      const baseManifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        content_html: '<p>AI visibility optimization helps systems retrieve the best answer quickly. In 2025, 62% of retrieval flows were answer-first.</p>',
        block_map: [
          {
            block_type: 'core/paragraph',
            text: 'AI visibility optimization helps systems retrieve the best answer quickly. In 2025, 62% of retrieval flows were answer-first.',
            node_ref: 'block-1',
            signature: 'sig-1'
          }
        ],
        title: 'AI Visibility Optimization'
      };

      const manifestA = JSON.parse(JSON.stringify(baseManifest));
      const manifestB = JSON.parse(JSON.stringify(baseManifest));

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

    test('should fall back to plain text when intro blocks unavailable', async () => {
      const words = Array.from({ length: 220 }, (_, idx) => `word${idx + 1}`).join(' ');
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        plain_text: words
      };

      await performDeterministicChecks(manifest, {}, {
        enableIntroFocusFactuality: true,
        contentHtml: ''
      });

      expect(manifest.preflight_intro).toBeDefined();
      expect(manifest.preflight_intro.intro_bounds.fallback_applied).toBe(true);
      expect(manifest.preflight_intro.word_count).toBe(200);
    });

    test('should evaluate freshness and internal links', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        content_html: `<time datetime="${recentDate.toISOString()}">Recent</time>`,
        links: [
          { url: '/ok', internal: true, status: 200 },
          { url: '/missing', internal: true, status: 404 }
        ]
      };

      const checks = await performDeterministicChecks(manifest, {}, { enableWebLookups: true });

      expect(checks.content_updated_12_months.verdict).toBe('pass');
      expect(checks.no_broken_internal_links.verdict).toBe('partial');
      expect(checks.no_broken_internal_links.details.broken_links).toHaveLength(1);
    });

    test('should highlight stale date text when freshness check fails', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        content_html: '<p>Updated on January 10, 2024</p><time datetime="2024-01-10">January 10, 2024</time>',
        block_map: [
          {
            node_ref: 'block-20',
            block_type: 'core/paragraph',
            text: 'Updated on January 10, 2024 to reflect the previous release.'
          }
        ]
      };

      const checks = await performDeterministicChecks(manifest, {}, { enableWebLookups: true });

      expect(checks.content_updated_12_months.verdict).toBe('fail');
      expect(checks.content_updated_12_months.highlights.length).toBeGreaterThan(0);
    });

    test('should highlight broken internal link anchor text when present in block map', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        content_html: '<p>See our <a href="/pricing">Pricing page</a> for details.</p>',
        block_map: [
          {
            node_ref: 'block-31',
            block_type: 'core/paragraph',
            text: 'See our Pricing page for details before making any decision.'
          }
        ],
        links: [
          { url: '/pricing', internal: true, status: 404 }
        ]
      };

      const checks = await performDeterministicChecks(manifest, {}, { enableWebLookups: true });

      expect(checks.no_broken_internal_links.verdict).toBe('fail');
      expect(checks.no_broken_internal_links.highlights.length).toBeGreaterThan(0);
    });

    test('should classify metadata issues as recommendation-only deterministic findings', async () => {
      const manifest = {
        metadata: { h1_count: 1 },
        jsonld: [],
        content_html: '<html><head></head><body><p>Body only</p></body></html>'
      };

      const checks = await performDeterministicChecks(manifest);

      expect(checks.metadata_checks.verdict).toBe('fail');
      expect(checks.metadata_checks.non_inline).toBe(true);
      expect(checks.metadata_checks.non_inline_reason).toBe('metadata_document_scope');
    });

    test('should ignore topical headings for FAQ detection under strict question mode', async () => {
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

    test('should trigger FAQ detection for explicit strict question headings', async () => {
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

    test('should expose deterministic detected_steps and intro schema recommendation fields', async () => {
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

    test('should reserve orphan heading evaluation for AI scope only', async () => {
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

    test('should emit per-heading fragmentation messages instead of aggregate count text', async () => {
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
});
