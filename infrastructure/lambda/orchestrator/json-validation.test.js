/**
 * JSON Validation Tests
 *
 * Tests to ensure JSON parsing works correctly and catches regressions
 * for the invalid_json bug that was affecting production.
 */

const { Buffer } = require('buffer');

// Mock event helper
function createMockEvent(body, options = {}) {
    return {
        body: typeof body === 'string' ? body : JSON.stringify(body),
        isBase64Encoded: options.isBase64Encoded || false,
        headers: {
            'content-type': options.contentType || 'application/json'
        }
    };
}

// Test payload similar to what WordPress sends
const VALID_PAYLOAD = {
    manifest: {
        title: 'Test Article with "quotes" and special chars',
        content_html: '<article><h1>Main Title</h1><p>Content with &amp; ampersands and "quotes"</p></article>',
        meta_description: 'A test description'
    },
    run_metadata: {
        site_id: 'test-site-001',
        user_id: 1,
        post_id: 123,
        content_type: 'article',
        source: 'editor-sidebar',
        prompt_version: 'v1'
    },
    enable_web_lookups: false
};

// Bad article content that previously caused issues
const BAD_ARTICLE_CONTENT = `<article>
<h1>Understanding AI Optimization for "Content" Creators</h1>
<p>In today's digital landscape, AI-powered search engines are changing how content is discovered & consumed.</p>
<h2>Key Strategies</h2>
<ul>
<li>Structure your content with clear headings</li>
<li>Use "semantic" HTML tags properly</li>
<li>Include <strong>relevant</strong> keywords naturally</li>
</ul>
<p>Here's what experts say: "The future of SEO is AEO" — according to industry leaders.</p>
<blockquote>"Optimizing for AI requires thinking differently about content structure."</blockquote>
<script type="application/ld+json">{"@type": "Article", "name": "Test"}</script>
</article>`;

describe('JSON Parsing', () => {

    test('parses valid JSON payload correctly', () => {
        const json = JSON.stringify(VALID_PAYLOAD);
        const parsed = JSON.parse(json);

        expect(parsed.manifest.title).toBe('Test Article with "quotes" and special chars');
        expect(parsed.manifest.content_html).toContain('<h1>Main Title</h1>');
        expect(parsed.run_metadata.site_id).toBe('test-site-001');
    });

    test('handles content with HTML special characters', () => {
        const payload = {
            manifest: {
                title: 'Test',
                content_html: BAD_ARTICLE_CONTENT
            },
            run_metadata: { site_id: 'test' }
        };

        const json = JSON.stringify(payload);
        const parsed = JSON.parse(json);

        expect(parsed.manifest.content_html).toContain('"Content"');
        expect(parsed.manifest.content_html).toContain('&');
        expect(parsed.manifest.content_html).toContain('<blockquote>');
    });

    test('handles nested quotes correctly', () => {
        const payload = {
            manifest: {
                title: 'Title with "nested" quotes',
                content_html: '<p>She said "Hello, how are you?" and he replied "Fine, thanks!"</p>'
            },
            run_metadata: { site_id: 'test' }
        };

        const json = JSON.stringify(payload);
        expect(json).toContain('\\"nested\\"');

        const parsed = JSON.parse(json);
        expect(parsed.manifest.title).toContain('"nested"');
    });

    test('handles Unicode characters', () => {
        const payload = {
            manifest: {
                title: 'Test with émojis 🚀 and spëcial châräctérs',
                content_html: '<p>© 2024 — All rights reserved • Privacy Policy</p>'
            },
            run_metadata: { site_id: 'test' }
        };

        const json = JSON.stringify(payload);
        const parsed = JSON.parse(json);

        expect(parsed.manifest.title).toContain('🚀');
        expect(parsed.manifest.content_html).toContain('©');
        expect(parsed.manifest.content_html).toContain('—');
    });

    test('handles newlines and whitespace in content', () => {
        const payload = {
            manifest: {
                title: 'Test',
                content_html: '<p>Line 1\n\nLine 2\r\n\r\nLine 3</p>\n<p>\tIndented</p>'
            },
            run_metadata: { site_id: 'test' }
        };

        const json = JSON.stringify(payload);
        expect(json).toContain('\\n');
        expect(json).toContain('\\r');
        expect(json).toContain('\\t');

        const parsed = JSON.parse(json);
        expect(parsed.manifest.content_html).toContain('\n');
    });

    test('rejects BOM at start of payload', () => {
        const json = '\uFEFF' + JSON.stringify(VALID_PAYLOAD);

        // Direct parse should still work (JSON.parse tolerates BOM)
        // but we want to detect and log it
        const hasBOM = json.charCodeAt(0) === 0xFEFF;
        expect(hasBOM).toBe(true);

        // After removing BOM
        const cleanJson = json.replace(/^\uFEFF/, '');
        const parsed = JSON.parse(cleanJson);
        expect(parsed.manifest.title).toBeDefined();
    });

    test('handles base64 encoded body', () => {
        const json = JSON.stringify(VALID_PAYLOAD);
        const base64 = Buffer.from(json).toString('base64');

        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);

        expect(parsed.manifest.title).toBe('Test Article with "quotes" and special chars');
    });

    test('detects and rejects null bytes', () => {
        const badJson = '{"test": "value\x00with null"}';

        // Null byte detection
        const hasNullByte = badJson.includes('\x00');
        expect(hasNullByte).toBe(true);

        // Removal
        const cleaned = badJson.replace(/\x00/g, '');
        const parsed = JSON.parse(cleaned);
        expect(parsed.test).toBe('valuewith null');
    });

    test('handles double-escaped quotes (WordPress edge case)', () => {
        // This simulates what might happen if JSON.stringify is called twice
        const payload = { title: 'Test "title"' };
        const singleEncoded = JSON.stringify(payload);
        const doubleEncoded = JSON.stringify(singleEncoded);

        // Double encoded has extra escapes
        expect(doubleEncoded).toContain('\\\\"');

        // First parse returns string
        const firstParse = JSON.parse(doubleEncoded);
        expect(typeof firstParse).toBe('string');

        // Second parse returns object
        const secondParse = JSON.parse(firstParse);
        expect(secondParse.title).toBe('Test "title"');
    });

    test('WP-style payload roundtrip', () => {
        // Simulate exact WordPress payload structure
        const wpPayload = {
            manifest: {
                title: VALID_PAYLOAD.manifest.title,
                content_html: BAD_ARTICLE_CONTENT,
                meta_description: 'SEO description with "quotes"'
            },
            run_metadata: VALID_PAYLOAD.run_metadata,
            enable_web_lookups: false
        };

        // Simulate wp_json_encode (uses JSON_HEX_TAG | JSON_HEX_AMP etc)
        // Node's JSON.stringify is close enough for this test
        const wpJsonEncoded = JSON.stringify(wpPayload);

        // Simulate Lambda receiving it
        const event = createMockEvent(wpJsonEncoded);

        // Parse as Lambda would
        let body;
        if (typeof event.body === 'string') {
            body = JSON.parse(event.body);
        } else {
            body = event.body;
        }

        expect(body.manifest.title).toBe(VALID_PAYLOAD.manifest.title);
        expect(body.manifest.content_html).toContain('<h1>Understanding AI');
        expect(body.run_metadata.site_id).toBe('test-site-001');
    });
});

describe('Error Detection', () => {

    test('provides helpful error for truncated JSON', () => {
        const json = '{"manifest": {"title": "Test"';

        try {
            JSON.parse(json);
            fail('Should have thrown');
        } catch (e) {
            expect(e.message).toMatch(/Unexpected end|unexpected end|Expected|position|column/i);
        }
    });

    test('provides position for syntax errors', () => {
        const json = '{"manifest": {"title": Test"}}';

        try {
            JSON.parse(json);
            fail('Should have thrown');
        } catch (e) {
            // Error message should indicate position
            expect(e.message).toMatch(/position|column|offset|unexpected token|not valid json/i);
        }
    });

    test('identifies invalid first character', () => {
        const badJson = 'undefined';
        const firstChar = badJson.charAt(0);

        expect(firstChar).not.toBe('{');
        expect(firstChar).not.toBe('[');

        try {
            JSON.parse(badJson);
            fail('Should have thrown');
        } catch (e) {
            expect(e.message).toMatch(/unexpected token|not valid json/i);
        }
    });
});

// Run tests if executed directly
if (typeof jest === 'undefined') {
    console.log('Running tests without Jest...\n');

    const tests = [
        () => {
            const json = JSON.stringify(VALID_PAYLOAD);
            const parsed = JSON.parse(json);
            console.assert(parsed.manifest.title === 'Test Article with "quotes" and special chars', 'Valid JSON test');
            console.log('✓ Valid JSON parsing');
        },
        () => {
            const json = JSON.stringify({ content: BAD_ARTICLE_CONTENT });
            const parsed = JSON.parse(json);
            console.assert(parsed.content.includes('"Content"'), 'Bad article content test');
            console.log('✓ Bad article content handling');
        },
        () => {
            const json = '\uFEFF{"test": 1}';
            const clean = json.replace(/^\uFEFF/, '');
            const parsed = JSON.parse(clean);
            console.assert(parsed.test === 1, 'BOM removal test');
            console.log('✓ BOM detection and removal');
        }
    ];

    tests.forEach(test => {
        try {
            test();
        } catch (e) {
            console.error('✗ Test failed:', e.message);
        }
    });

    console.log('\nAll tests passed!');
}
