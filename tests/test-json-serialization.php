<?php
/**
 * JSON Serialization Tests
 *
 * Tests to ensure wp_json_encode produces valid JSON for the backend.
 * Run with: php tests/test-json-serialization.php
 *
 * @package AiVI
 */

// Minimal WordPress compatibility stubs
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, $options = 0, $depth = 512) {
        return json_encode($data, $options | JSON_UNESCAPED_SLASHES, $depth);
    }
}

class JsonSerializationTest {

    private $passed = 0;
    private $failed = 0;

    public function run() {
        echo "=== JSON Serialization Tests ===\n\n";

        $this->test_basic_payload();
        $this->test_html_with_quotes();
        $this->test_html_with_special_chars();
        $this->test_unicode_content();
        $this->test_newlines_and_whitespace();
        $this->test_large_content();
        $this->test_bad_article_fixture();
        $this->test_roundtrip();

        echo "\n=== Results ===\n";
        echo "Passed: {$this->passed}\n";
        echo "Failed: {$this->failed}\n";

        return $this->failed === 0;
    }

    private function assert($condition, $message) {
        if ($condition) {
            echo "✓ {$message}\n";
            $this->passed++;
        } else {
            echo "✗ {$message}\n";
            $this->failed++;
        }
    }

    private function test_basic_payload() {
        echo "--- Basic Payload ---\n";

        $payload = array(
            'manifest' => array(
                'title' => 'Test Title',
                'content_html' => '<p>Simple content</p>',
                'meta_description' => 'Description'
            ),
            'run_metadata' => array(
                'site_id' => 'test-001',
                'user_id' => 1,
                'content_type' => 'article'
            )
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Basic payload encodes');
        $this->assert(strpos($json, '{') === 0, 'JSON starts with {');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Basic payload decodes');
        $this->assert($decoded['manifest']['title'] === 'Test Title', 'Title preserved');
    }

    private function test_html_with_quotes() {
        echo "\n--- HTML with Quotes ---\n";

        $html = '<p>She said "Hello" and he replied "Goodbye"</p>';
        $payload = array(
            'manifest' => array(
                'title' => 'Title with "quotes"',
                'content_html' => $html
            ),
            'run_metadata' => array('site_id' => 'test')
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Payload with quotes encodes');
        $this->assert(strpos($json, '\\"') !== false, 'Quotes are escaped');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Payload with quotes decodes');
        $this->assert(strpos($decoded['manifest']['content_html'], '"Hello"') !== false, 'Quotes preserved in content');
    }

    private function test_html_with_special_chars() {
        echo "\n--- HTML with Special Characters ---\n";

        $html = '<p>Content with &amp; ampersand, &lt;tag&gt; entities, and © symbol</p>';
        $payload = array(
            'manifest' => array(
                'title' => 'Test',
                'content_html' => $html
            ),
            'run_metadata' => array('site_id' => 'test')
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Special chars encode');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Special chars decode');
        $this->assert(strpos($decoded['manifest']['content_html'], '&amp;') !== false, 'Ampersand entity preserved');
    }

    private function test_unicode_content() {
        echo "\n--- Unicode Content ---\n";

        $html = '<p>Emoji: 🚀 • Accents: café résumé • Symbols: © ™ ® — –</p>';
        $payload = array(
            'manifest' => array(
                'title' => 'Unicode Test 🎉',
                'content_html' => $html
            ),
            'run_metadata' => array('site_id' => 'test')
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Unicode encodes');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Unicode decodes');
        $this->assert(strpos($decoded['manifest']['title'], '🎉') !== false, 'Emoji preserved');
        $this->assert(strpos($decoded['manifest']['content_html'], 'café') !== false, 'Accents preserved');
    }

    private function test_newlines_and_whitespace() {
        echo "\n--- Newlines and Whitespace ---\n";

        $html = "<p>Line 1</p>\n<p>Line 2</p>\r\n<p>Line 3</p>\t<p>Tabbed</p>";
        $payload = array(
            'manifest' => array(
                'title' => 'Test',
                'content_html' => $html
            ),
            'run_metadata' => array('site_id' => 'test')
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Newlines encode');
        $this->assert(strpos($json, '\\n') !== false, 'Newlines escaped');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Newlines decode');
        $this->assert(strpos($decoded['manifest']['content_html'], "\n") !== false, 'Newlines preserved');
    }

    private function test_large_content() {
        echo "\n--- Large Content ---\n";

        $html = str_repeat('<p>' . str_repeat('Lorem ipsum dolor sit amet. ', 50) . '</p>', 100);
        $payload = array(
            'manifest' => array(
                'title' => 'Large Article',
                'content_html' => $html
            ),
            'run_metadata' => array('site_id' => 'test')
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Large content encodes');
        $this->assert(strlen($json) > 100000, 'JSON is large');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Large content decodes');
    }

    private function test_bad_article_fixture() {
        echo "\n--- Bad Article Fixture (500-word) ---\n";

        $html = '<article>
<h1>Understanding AI Optimization for "Content" Creators</h1>
<p>In today\'s digital landscape, AI-powered search engines are changing how content is discovered & consumed.</p>
<h2>Key Strategies</h2>
<ul>
<li>Structure your content with clear headings</li>
<li>Use "semantic" HTML tags properly</li>
<li>Include <strong>relevant</strong> keywords naturally</li>
</ul>
<p>Here\'s what experts say: "The future of SEO is AEO" — according to industry leaders.</p>
<blockquote>"Optimizing for AI requires thinking differently about content structure."</blockquote>
<script type="application/ld+json">{"@type": "Article", "name": "Test"}</script>
</article>';

        $payload = array(
            'manifest' => array(
                'title' => 'Test Article with "quotes" and special chars',
                'content_html' => $html,
                'meta_description' => 'SEO description with "quotes"'
            ),
            'run_metadata' => array(
                'site_id' => 'test-site-001',
                'user_id' => 1,
                'post_id' => 123,
                'content_type' => 'article',
                'source' => 'editor-sidebar',
                'prompt_version' => 'v1'
            ),
            'enable_web_lookups' => false
        );

        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Bad article encodes');

        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Bad article decodes');
        $this->assert(strpos($decoded['manifest']['content_html'], '"Content"') !== false, 'Quotes in content preserved');
        $this->assert(strpos($decoded['manifest']['content_html'], '<blockquote>') !== false, 'HTML tags preserved');
    }

    private function test_roundtrip() {
        echo "\n--- Roundtrip Test ---\n";

        $payload = array(
            'manifest' => array(
                'title' => 'Roundtrip "Test" with spëcial çhars © 🚀',
                'content_html' => '<article><h1>Test</h1><p>Content with "quotes" and & ampersand</p></article>'
            ),
            'run_metadata' => array(
                'site_id' => 'test-001'
            )
        );

        // Encode
        $json = wp_json_encode($payload);
        $this->assert($json !== false, 'Roundtrip encodes');

        // Decode
        $decoded = json_decode($json, true);
        $this->assert($decoded !== null, 'Roundtrip decodes');

        // Re-encode
        $json2 = wp_json_encode($decoded);
        $this->assert($json2 !== false, 'Roundtrip re-encodes');

        // Compare
        $decoded2 = json_decode($json2, true);
        $this->assert(
            $decoded['manifest']['title'] === $decoded2['manifest']['title'],
            'Roundtrip title preserved'
        );
        $this->assert(
            $decoded['manifest']['content_html'] === $decoded2['manifest']['content_html'],
            'Roundtrip content preserved'
        );
    }
}

// Run tests
$test = new JsonSerializationTest();
$success = $test->run();
exit($success ? 0 : 1);
