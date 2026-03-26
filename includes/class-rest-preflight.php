<?php
/**
 * REST API Preflight class
 *
 * @package AiVI
 */

namespace AiVI;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * REST Preflight class
 *
 * Performs deterministic checks before AI analysis:
 * - Token estimation and cutoff enforcement
 * - H1 tag count validation
 * - JSON-LD extraction and validation
 * - Internal link detection
 * - Block map generation for navigation highlights
 */
class REST_Preflight
{
    /**
     * Top-level HTML tags treated as blocks in Classic editor.
     * Must match client-side extraction logic exactly.
     */
    const CLASSIC_BLOCK_TAGS = array('p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'table', 'blockquote', 'div', 'figure', 'img');

    /**
     * Constructor
     */
    public function __construct()
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    /**
     * Register REST routes
     */
    public function register_routes()
    {
        register_rest_route(
            'aivi/v1',
            '/preflight',
            array(
                'methods' => 'POST',
                'permission_callback' => array($this, 'check_permissions'),
                'callback' => array($this, 'handle_preflight'),
                'args' => array(
                    'title' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required' => false,
                    ),
                    'content' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'wp_kses_post',
                        'required' => false,
                    ),
                    'content_type' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required' => false,
                    ),
                    'meta_description' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_textarea_field',
                        'required' => false,
                    ),
                    'canonical_url' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'esc_url_raw',
                        'required' => false,
                    ),
                    'lang' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required' => false,
                    ),
                    'site_id' => array(
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required' => false,
                    ),
                ),
            )
        );
    }

    /**
     * Check permissions
     *
     * @param \WP_REST_Request $request Request object.
     * @return bool
     */
    public function check_permissions($request)
    {
        return current_user_can('edit_posts');
    }

    /**
     * Handle preflight request
     *
     * Validates content, estimates tokens, runs deterministic checks,
     * and returns manifest for AI analysis.
     *
     * @param \WP_REST_Request $request Request object.
     * @return \WP_REST_Response
     */
    public function handle_preflight($request)
    {
        $title = sanitize_text_field( (string) $request->get_param('title') );
        $content = wp_kses_post( (string) $request->get_param('content') );
        $content_type = sanitize_text_field( (string) $request->get_param('content_type') );
        $meta_description = sanitize_textarea_field( (string) $request->get_param('meta_description') );
        $canonical_url = esc_url_raw( (string) $request->get_param('canonical_url') );
        $lang = sanitize_text_field( (string) $request->get_param('lang') );
        if ($content_type === '') {
            $content_type = 'post';
        }

        // Edge case: Empty content
        if (empty($content)) {
            return rest_ensure_response(
                array(
                    'ok' => false,
                    'reason' => 'empty_content',
                    'message' => __('No content to analyze yet. Consider saving this article as a draft first, then retry.', 'ai-visibility-inspector'),
                    'manifest' => null,
                )
            );
        }

        // Calculate text metrics
        $plain_text = wp_strip_all_tags($content);
        $word_count = str_word_count($plain_text);
        $token_estimate = \aivi_estimate_tokens($content);
        $h1_count = \aivi_count_h1_tags($content);
        $h2_count = preg_match_all('/<h2(?:\s[^>]*)?>/i', $content, $matches_h2);
        $h3_count = preg_match_all('/<h3(?:\s[^>]*)?>/i', $content, $matches_h3);
        $img_count = preg_match_all('/<img\b[^>]*>/i', $content, $matches_img);
        $link_count = preg_match_all('/<a\b[^>]*href\s*=\s*["\']?[^"\'>]+["\']?/i', $content, $matches_link);
        $jsonld_blocks = \aivi_extract_jsonld_blocks($content);
        $internal_links = \aivi_extract_internal_links($content);
        $has_jsonld = !empty($jsonld_blocks);

        // Get token cutoff from admin settings (defaults to 200000)
        $cutoff = Admin_Settings::get_token_cutoff();

        // Build block map for deterministic navigation highlights
        $block_data = $this->build_block_map($content);

        // Build manifest for downstream consumers
        $manifest = array(
            'title' => $title,
            'content_html' => $content,
            'content_snippet' => substr($plain_text, 0, 500),
            'word_count' => $word_count,
            'wordEstimate' => $word_count,
            'token_estimate' => $token_estimate,
            'plain_text' => $plain_text,
            'metadata' => array(
                'h1_count' => $h1_count,
                'h2_count' => $h2_count,
                'h3_count' => $h3_count,
                'img_count' => $img_count,
                'link_count' => $link_count,
                'has_jsonld' => $has_jsonld,
            ),
            'jsonld' => $jsonld_blocks,
            'links' => $internal_links,
            'content_type' => $block_data['content_type'], // 'gutenberg' or 'classic'
            'blocks_count' => $block_data['blocks_count'],
            'block_map' => $block_data['block_map'],
            'meta_description' => $meta_description,
            'canonical_url' => $canonical_url,
            'lang' => $lang,
        );

        // Enforce token cutoff
        if ($token_estimate > $cutoff) {
            return rest_ensure_response(
                array(
                    'ok' => false,
                    'reason' => 'too_long',
                    'message' => sprintf(
                        /* translators: 1: Estimated tokens, 2: Cutoff limit, 3: Additional message */
                        __('Content exceeds analysis limit. Estimated tokens: %1$d. Limit: %2$d. %3$s', 'ai-visibility-inspector'),
                        $token_estimate,
                        $cutoff,
                        \aivi_preflight_message_too_long()
                    ),
                    'manifest' => $manifest,
                    'tokenEstimate' => $token_estimate,
                    'token_estimate' => $token_estimate,
                    'withinCutoff' => false,
                    'cutoff' => $cutoff,
                )
            );
        }

        // Run deterministic checks
        $deterministic_checks = $this->run_deterministic_checks($content, $title);

        // Success response
        return rest_ensure_response(
            array(
                'ok' => true,
                'message' => \aivi_preflight_message_ok(),
                'manifest' => $manifest,
                'tokenEstimate' => $token_estimate,
                'token_estimate' => $token_estimate,
                'withinCutoff' => true,
                'cutoff' => $cutoff,
                'deterministic_checks' => $deterministic_checks,
            )
        );
    }

    /**
     * Run deterministic checks on content
     *
     * These checks run before AI analysis and provide instant feedback.
     *
     * @param string $content HTML content.
     * @return array Check results with status and messages.
     */
    private function run_deterministic_checks($content, $title = '')
    {
        $checks = array();

        // Check 1: H1 count
        $h1_count = \aivi_count_h1_tags($content);
        $has_visible_title = is_string($title) && trim($title) !== '';
        $effective_h1_count = ($h1_count > 0) ? $h1_count : ($has_visible_title ? 1 : 0);
        $checks['h1_count'] = array(
            'id' => 'single_h1',
            'value' => $effective_h1_count,
            'status' => ($effective_h1_count === 1) ? 'pass' : (($effective_h1_count === 0) ? 'warning' : 'fail'),
            'message' => $this->get_h1_message($h1_count, $has_visible_title),
        );

        // Check 2: JSON-LD presence and validity
        $jsonld_blocks = \aivi_extract_jsonld_blocks($content);
        $valid_blocks = array_filter($jsonld_blocks, function ($block) {
            return isset($block['valid']) && $block['valid'] === true;
        });
        $invalid_count = count($jsonld_blocks) - count($valid_blocks);

        $checks['jsonld'] = array(
            'id' => 'valid_jsonld_schema',
            'total' => count($jsonld_blocks),
            'valid' => count($valid_blocks),
            'invalid' => $invalid_count,
            'status' => $this->get_jsonld_status($jsonld_blocks, $valid_blocks),
            'message' => $this->get_jsonld_message($jsonld_blocks, $valid_blocks),
            'types' => array_map(function ($block) {
                return isset($block['type']) ? $block['type'] : 'Unknown';
            }, $valid_blocks),
        );

        // Check 3: Internal links count
        $internal_links = \aivi_extract_internal_links($content);
        $checks['internal_links'] = array(
            'id' => 'internal_links',
            'value' => count($internal_links),
            'status' => (count($internal_links) > 0) ? 'pass' : 'info',
            'message' => sprintf(
                /* translators: %d: Number of internal links */
                _n('%d internal link found', '%d internal links found', count($internal_links), 'ai-visibility-inspector'),
                count($internal_links)
            ),
        );

        return $checks;
    }

    /**
     * Get H1 count status message
     *
     * @param int $count Number of H1 tags.
     * @return string Human-readable message.
     */
    private function get_h1_message($count, $has_visible_title = false)
    {
        if ($count === 1) {
            return __('Single H1 tag found (correct)', 'ai-visibility-inspector');
        }
        if ($count === 0 && $has_visible_title) {
            return __('Visible post title provides the primary H1 surface for this article.', 'ai-visibility-inspector');
        }
        if ($count === 0) {
            return __('No H1 tag found. Consider adding a main heading.', 'ai-visibility-inspector');
        }
        return sprintf(
            /* translators: %d: Number of H1 tags */
            __('Multiple H1 tags found (%d). Use only one H1 per page.', 'ai-visibility-inspector'),
            $count
        );
    }

    /**
     * Get JSON-LD status
     *
     * @param array $all_blocks   All JSON-LD blocks.
     * @param array $valid_blocks Valid JSON-LD blocks only.
     * @return string Status: pass, warning, fail, or info.
     */
    private function get_jsonld_status($all_blocks, $valid_blocks)
    {
        if (empty($all_blocks)) {
            return 'info'; // No JSON-LD is not an error
        }
        if (count($all_blocks) === count($valid_blocks)) {
            return 'pass'; // All valid
        }
        if (count($valid_blocks) > 0) {
            return 'warning'; // Some invalid
        }
        return 'fail'; // All invalid
    }

    /**
     * Get JSON-LD status message
     *
     * @param array $all_blocks   All JSON-LD blocks.
     * @param array $valid_blocks Valid JSON-LD blocks only.
     * @return string Human-readable message.
     */
    private function get_jsonld_message($all_blocks, $valid_blocks)
    {
        if (empty($all_blocks)) {
            return __('No JSON-LD structured data found in content.', 'ai-visibility-inspector');
        }

        $total = count($all_blocks);
        $valid = count($valid_blocks);
        $invalid = $total - $valid;

        if ($invalid === 0) {
            return sprintf(
                /* translators: %d: Number of valid JSON-LD blocks */
                _n('%d valid JSON-LD block found', '%d valid JSON-LD blocks found', $valid, 'ai-visibility-inspector'),
                $valid
            );
        }

        return sprintf(
            /* translators: 1: Number of valid blocks, 2: Number of invalid blocks */
            __('%1$d valid, %2$d invalid JSON-LD block(s) found. Fix syntax errors.', 'ai-visibility-inspector'),
            $valid,
            $invalid
        );
    }

    /**
     * Build block map for navigation highlights.
     *
     * Creates an ordered list of blocks with node_refs and content hashes
     * for deterministic anchor resolution in both Gutenberg and Classic editors.
     *
     * @param string $content HTML content.
     * @return array { content_type: string, blocks_count: int, block_map: array }
     */
    public function build_block_map($content)
    {
        $content_type = $this->detect_content_type($content);

        if ($content_type === 'gutenberg') {
            $block_map = $this->extract_gutenberg_blocks($content);
        } else {
            $block_map = $this->extract_classic_blocks($content);
        }

        return array(
            'content_type' => $content_type,
            'blocks_count' => count($block_map),
            'block_map' => $block_map,
        );
    }

    /**
     * Detect if content is Gutenberg or Classic.
     *
     * @param string $content HTML content.
     * @return string 'gutenberg' or 'classic'
     */
    private function detect_content_type($content)
    {
        // Check for Gutenberg block markers
        if (function_exists('has_blocks') && has_blocks($content)) {
            return 'gutenberg';
        }

        // Fallback: check for <!-- wp: markers
        if (preg_match('/<!-- wp:/', $content)) {
            return 'gutenberg';
        }

        return 'classic';
    }

    /**
     * Extract blocks from Gutenberg content.
     *
     * @param string $content Gutenberg HTML content.
     * @return array Block map entries.
     */
    private function extract_gutenberg_blocks($content)
    {
        $block_map = array();

        // Use WordPress block parser if available
        if (!function_exists('parse_blocks')) {
            // Fallback if parse_blocks unavailable
            return $this->extract_classic_blocks($content);
        }

        $blocks = parse_blocks($content);
        $index = 0;

        foreach ($blocks as $block) {
            // Skip empty/null blocks (whitespace between blocks)
            if (empty($block['blockName']) && empty(trim($block['innerHTML'] ?? ''))) {
                continue;
            }

            $block_name = $block['blockName'] ?? 'core/freeform';
            $inner_html = $block['innerHTML'] ?? '';
            $text_content = $this->extract_gutenberg_block_text($block);
            $media_context = null;

            $heading_level = null;
            if ($block_name === 'core/heading') {
                $heading_level = $this->extract_heading_level($block, $inner_html);
                $heading_text = $this->extract_heading_text($inner_html);
                if ($heading_text !== '') {
                    $text_content = $heading_text;
                }
            }

            $text_length = $this->string_length($text_content);

            if ($text_length === 0) {
                $media_context = $this->extract_gutenberg_media_context($block, $block_name, $inner_html);
                if (is_array($media_context) && !empty($media_context['text'])) {
                    $text_content = $media_context['text'];
                    $text_length = $this->string_length($text_content);
                }
            }

            // Skip blocks with no text content
            if ($text_length === 0) {
                continue;
            }

            $block_type = is_array($media_context) && !empty($media_context['block_type'])
                ? $media_context['block_type']
                : $this->resolve_gutenberg_block_type($block_name, $inner_html, $text_content, $heading_level);
            if (!preg_match('/\/h[1-6]$/i', $block_type)) {
                $heading_level = null;
            }

            $normalized = $this->canonicalize_php($text_content);
            $signature = hash('sha256', $normalized); // Reuse normalized text

            $meta = array(
                'length' => $text_length,
                'prefix' => $this->string_substr($normalized, 0, 24)
            );
            if ($heading_level !== null) {
                $meta['heading_level'] = $heading_level;
            }
            if (is_array($media_context) && isset($media_context['meta']) && is_array($media_context['meta'])) {
                $meta = array_merge($meta, $media_context['meta']);
            }

            $snippet = is_array($media_context) && !empty($media_context['snippet'])
                ? $media_context['snippet']
                : $this->generate_snippet($text_content);

            $block_map[] = array(
                'node_ref' => 'block-' . $index,
                'block_type' => $block_type,
                'text_length' => $text_length,
                'signature' => $signature,
                'text' => $text_content,
                'meta' => $meta,
                'snippet' => $snippet,
                'start_offset' => 0,
                'end_offset' => $text_length,
            );

            $index++;
        }

        return $block_map;
    }

    /**
     * Extract meaningful plain text from a Gutenberg block.
     *
     * Some Gutenberg wrapper blocks, especially `core/list`, can render
     * nearly-empty `innerHTML` while storing meaningful text in descendant
     * `innerBlocks`. We keep the existing top-level block_map contract, but
     * recover text from descendants when the wrapper itself has no usable text.
     *
     * @param array $block Parsed Gutenberg block.
     * @return string Plain text content for the block.
     */
    private function extract_gutenberg_block_text($block)
    {
        if (!is_array($block)) {
            return '';
        }

        $inner_html = isset($block['innerHTML']) && is_string($block['innerHTML'])
            ? $block['innerHTML']
            : '';
        $text_content = $this->strip_to_text($inner_html);

        if ($text_content !== '') {
            return $text_content;
        }

        $inner_blocks = isset($block['innerBlocks']) && is_array($block['innerBlocks'])
            ? $block['innerBlocks']
            : array();
        if (empty($inner_blocks)) {
            return '';
        }

        $parts = array();
        foreach ($inner_blocks as $child_block) {
            $child_text = $this->extract_gutenberg_block_text($child_block);
            if ($child_text === '') {
                continue;
            }
            $parts[] = $child_text;
        }

        return trim(implode("\n", $parts));
    }

    private function extract_gutenberg_media_context($block, $block_name, $inner_html)
    {
        if (!is_array($block)) {
            return null;
        }

        $attrs = isset($block['attrs']) && is_array($block['attrs'])
            ? $block['attrs']
            : array();
        $sources = array();
        $alt = '';
        $caption = '';

        if (isset($attrs['url']) && is_string($attrs['url']) && trim($attrs['url']) !== '') {
            $sources[] = trim($attrs['url']);
        }
        if (isset($attrs['alt']) && is_string($attrs['alt'])) {
            $alt = trim($attrs['alt']);
        }
        if (isset($attrs['caption']) && is_string($attrs['caption'])) {
            $caption = $this->strip_to_text($attrs['caption']);
        }
        if (isset($attrs['images']) && is_array($attrs['images'])) {
            foreach ($attrs['images'] as $image) {
                if (!is_array($image)) {
                    continue;
                }
                if (isset($image['url']) && is_string($image['url']) && trim($image['url']) !== '') {
                    $sources[] = trim($image['url']);
                }
                if ($alt === '' && isset($image['alt']) && is_string($image['alt'])) {
                    $alt = trim($image['alt']);
                }
                if ($caption === '' && isset($image['caption']) && is_string($image['caption'])) {
                    $caption = $this->strip_to_text($image['caption']);
                }
            }
        }

        $html_media = $this->extract_image_context_from_html($inner_html);
        if (is_array($html_media)) {
            if (isset($html_media['sources']) && is_array($html_media['sources'])) {
                $sources = array_merge($sources, $html_media['sources']);
            }
            if ($alt === '' && !empty($html_media['alt'])) {
                $alt = $html_media['alt'];
            }
            if ($caption === '' && !empty($html_media['caption'])) {
                $caption = $html_media['caption'];
            }
        }

        $sources = array_values(array_unique(array_filter($sources, function ($value) {
            return is_string($value) && trim($value) !== '';
        })));
        if (empty($sources)) {
            return null;
        }

        $primary_src = $sources[0];
        $label = $this->build_image_fallback_text($primary_src, $alt, $caption, count($sources));
        $meta = array(
            'media_kind' => 'image',
            'image_src' => $primary_src,
            'image_alt' => $alt,
            'image_caption' => $caption,
            'image_label' => $label,
        );
        if (count($sources) > 1) {
            $meta['image_sources'] = $sources;
        }

        return array(
            'text' => $label,
            'snippet' => $label,
            'block_type' => is_string($block_name) && $block_name !== '' ? $block_name : 'core/image',
            'meta' => $meta,
        );
    }

    /**
     * Extract blocks from Classic editor content.
     *
     * Uses DOMDocument to find top-level block elements.
     *
     * @param string $content Classic HTML content.
     * @return array Block map entries.
     */
    private function extract_classic_blocks($content)
    {
        $block_map = array();

        if (empty(trim($content))) {
            return $block_map;
        }

        // Use DOMDocument for HTML-aware parsing
        $dom = new \DOMDocument();

        // Suppress warnings for malformed HTML
        libxml_use_internal_errors(true);

        // Wrap in UTF-8 encoding declaration and container
        $wrapped = '<?xml encoding="UTF-8"><div id="aivi-root">' . $content . '</div>';
        $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);

        libxml_clear_errors();

        // Find the root container
        $root = $dom->getElementById('aivi-root');
        if (!$root) {
            return $block_map;
        }

        $index = 0;

        // Iterate direct children of root (top-level elements)
        // Iterate direct children of root (top-level elements)
        foreach ($root->childNodes as $node) {
            // Only process element nodes (not text nodes)
            if ($node->nodeType !== XML_ELEMENT_NODE) {
                continue;
            }

            $tag_name = strtolower($node->nodeName);

            // Only include allowed block tags
            if (!in_array($tag_name, self::CLASSIC_BLOCK_TAGS, true)) {
                continue;
            }

            $text_content = $this->get_node_text($node);
            $text_length = $this->string_length($text_content);
            $media_context = null;

            if ($text_length === 0) {
                $media_context = $this->extract_classic_media_context($node, $tag_name);
                if (is_array($media_context) && !empty($media_context['text'])) {
                    $text_content = $media_context['text'];
                    $text_length = $this->string_length($text_content);
                }
            }

            // Skip empty elements
            if ($text_length === 0) {
                continue;
            }

            $normalized = $this->canonicalize_php($text_content);
            $signature = hash('sha256', $normalized); // Reuse normalized text
            $meta = array(
                'length' => $text_length,
                'prefix' => $this->string_substr($normalized, 0, 24)
            );
            if (is_array($media_context) && isset($media_context['meta']) && is_array($media_context['meta'])) {
                $meta = array_merge($meta, $media_context['meta']);
            }

            $snippet = is_array($media_context) && !empty($media_context['snippet'])
                ? $media_context['snippet']
                : $this->generate_snippet($text_content);
            $block_type = is_array($media_context) && !empty($media_context['block_type'])
                ? $media_context['block_type']
                : 'classic/' . $tag_name;

            $block_map[] = array(
                'node_ref' => 'block-' . $index,
                'block_type' => $block_type,
                'text_length' => $text_length,
                'signature' => $signature,
                'text' => $text_content,
                'meta' => $meta,
                'snippet' => $snippet,
                'start_offset' => 0,
                'end_offset' => $text_length,
            );

            $index++;
        }

        return $block_map;
    }

    /**
     * Strip HTML tags and decode entities to plain text.
     *
     * @param string $html HTML content.
     * @return string Plain text.
     */
    private function strip_to_text($html)
    {
        // Decode HTML entities
        $text = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Strip all HTML tags
        $text = wp_strip_all_tags($text);

        // Normalize whitespace
        $text = preg_replace('/\s+/', ' ', $text);

        return trim($text);
    }

    private function extract_classic_media_context($node, $tag_name)
    {
        if (!$node instanceof \DOMElement) {
            return null;
        }

        $image_node = null;
        if (strtolower($node->tagName) === 'img') {
            $image_node = $node;
        } else {
            $image_nodes = $node->getElementsByTagName('img');
            if ($image_nodes instanceof \DOMNodeList && $image_nodes->length > 0) {
                $candidate = $image_nodes->item(0);
                if ($candidate instanceof \DOMElement) {
                    $image_node = $candidate;
                }
            }
        }

        if (!$image_node instanceof \DOMElement) {
            return null;
        }

        $src = trim($image_node->getAttribute('src'));
        if ($src === '') {
            return null;
        }

        $alt = trim($image_node->getAttribute('alt'));
        $caption = '';
        $captions = $node->getElementsByTagName('figcaption');
        if ($captions instanceof \DOMNodeList && $captions->length > 0) {
            $caption_node = $captions->item(0);
            if ($caption_node instanceof \DOMNode) {
                $caption = $this->get_node_text($caption_node);
            }
        }

        $label = $this->build_image_fallback_text($src, $alt, $caption, 1);
        return array(
            'text' => $label,
            'snippet' => $label,
            'block_type' => 'classic/image',
            'meta' => array(
                'media_kind' => 'image',
                'image_src' => $src,
                'image_alt' => $alt,
                'image_caption' => $caption,
                'image_label' => $label,
                'source_tag' => $tag_name,
            ),
        );
    }

    /**
     * Get text content from DOM node.
     *
     * @param \DOMNode $node DOM node.
     * @return string Text content.
     */
    private function get_node_text($node)
    {
        $text = $node->textContent;

        // Normalize whitespace
        $text = preg_replace('/\s+/', ' ', $text);

        return trim($text);
    }

    private function extract_image_context_from_html($html)
    {
        if (!is_string($html) || trim($html) === '') {
            return null;
        }

        $sources = array();
        $alt = '';
        if (preg_match_all('/<img\b[^>]*>/i', $html, $matches) >= 1 && !empty($matches[0])) {
            foreach ($matches[0] as $image_tag) {
                $src = $this->extract_html_attribute($image_tag, 'src');
                if ($src !== '') {
                    $sources[] = $src;
                }
                if ($alt === '') {
                    $alt = $this->extract_html_attribute($image_tag, 'alt');
                }
            }
        }

        $caption = '';
        if (preg_match('/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i', $html, $caption_matches) === 1) {
            $caption = $this->strip_to_text($caption_matches[1]);
        }

        $sources = array_values(array_unique(array_filter($sources, function ($value) {
            return is_string($value) && trim($value) !== '';
        })));
        if (empty($sources) && $alt === '' && $caption === '') {
            return null;
        }

        return array(
            'sources' => $sources,
            'alt' => $alt,
            'caption' => $caption,
        );
    }

    private function extract_html_attribute($tag_html, $attribute_name)
    {
        if (!is_string($tag_html) || !is_string($attribute_name) || $attribute_name === '') {
            return '';
        }
        $pattern = "/\b" . preg_quote($attribute_name, '/') . '\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))/i';
        if (preg_match($pattern, $tag_html, $matches) !== 1) {
            return '';
        }
        $value = '';
        if (isset($matches[1]) && $matches[1] !== '') {
            $value = $matches[1];
        } elseif (isset($matches[2]) && $matches[2] !== '') {
            $value = $matches[2];
        } elseif (isset($matches[3])) {
            $value = $matches[3];
        }
        return trim(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    private function build_image_fallback_text($src, $alt = '', $caption = '', $count = 1)
    {
        $label = '';
        if (is_string($alt) && trim($alt) !== '') {
            $label = trim($alt);
        } elseif (is_string($caption) && trim($caption) !== '') {
            $label = trim($caption);
        } else {
            $label = $this->build_media_source_label($src);
        }

        $prefix = intval($count) > 1 ? 'Image gallery' : 'Image';
        return $label !== '' ? $prefix . ': ' . $label : $prefix;
    }

    private function build_media_source_label($src)
    {
        if (!is_string($src) || trim($src) === '') {
            return '';
        }

        $path = parse_url($src, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            $path = $src;
        }
        $basename = basename($path);
        if (!is_string($basename) || $basename === '') {
            return '';
        }

        $stem = preg_replace('/\.[a-z0-9]+$/i', '', $basename);
        $stem = preg_replace('/[-_]+/', ' ', $stem);
        $stem = preg_replace('/\s+/', ' ', $stem);

        return trim($stem);
    }

    private function extract_heading_text($html)
    {
        if (!is_string($html) || $html === '') {
            return '';
        }
        if (preg_match('/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i', $html, $matches) === 1) {
            return $this->strip_to_text($matches[1]);
        }
        return '';
    }

    private function extract_heading_level($block, $inner_html)
    {
        if (is_array($block) && isset($block['attrs']) && is_array($block['attrs']) && isset($block['attrs']['level'])) {
            $level = intval($block['attrs']['level']);
            if ($level >= 1 && $level <= 6) {
                return $level;
            }
        }
        if (is_string($inner_html) && preg_match('/<h([1-6])\b/i', $inner_html, $matches) === 1) {
            return intval($matches[1]);
        }
        return null;
    }

    private function resolve_gutenberg_block_type($block_name, $inner_html, $text_content, $heading_level)
    {
        if ($block_name !== 'core/heading') {
            return $block_name;
        }

        $word_count = $this->count_words($text_content);
        $length = $this->string_length($text_content);
        $has_heading_tag = is_string($inner_html) && preg_match('/<h[1-6]\b/i', $inner_html) === 1;
        $has_paragraph_tag = is_string($inner_html) && stripos($inner_html, '<p') !== false;
        $looks_like_paragraph = $has_paragraph_tag || !$has_heading_tag || $word_count > 24 || $length > 180;

        if ($looks_like_paragraph) {
            return 'core/paragraph';
        }

        if ($heading_level !== null) {
            return 'core/h' . $heading_level;
        }

        return 'core/heading';
    }

    private function count_words($text)
    {
        if (!is_string($text)) {
            return 0;
        }
        $parts = preg_split('/\s+/u', trim($text));
        if (!is_array($parts)) {
            return 0;
        }
        $parts = array_filter($parts, function ($part) {
            return $part !== '';
        });
        return count($parts);
    }

    private function string_length($text)
    {
        if (function_exists('mb_strlen')) {
            return \mb_strlen($text, 'UTF-8');
        }
        return strlen($text);
    }

    private function string_substr($text, $start, $length)
    {
        if (function_exists('mb_substr')) {
            return \mb_substr($text, $start, $length, 'UTF-8');
        }
        return substr($text, $start, $length);
    }

    private function string_lower($text)
    {
        if (function_exists('mb_strtolower')) {
            return \mb_strtolower($text, 'UTF-8');
        }
        return strtolower($text);
    }

    /**
     * Compute SHA256 hash of block text content.
     *
     * @param string $text_content Plain text content.
     * @return string Lowercase hex SHA256 hash.
     */
    /**
     * Generate a representative snippet for the block.
     * Takes a 60-char slice from the middle to avoid header repetition.
     *
     * @param string $text Block text
     * @return string Snippet
     */
    private function generate_snippet($text)
    {
        $len = $this->string_length($text);
        if ($len <= 60) {
            return $text;
        }
        $start = (int) floor(($len - 60) / 2);
        return $this->string_substr($text, $start, 60);
    }

    /**
     * Normalize text for signature generation.
     * MUST IDENTICALLY match client-side canonicalize() function.
     *
     * Rules:
     * 1. Decode HTML entities
     * 2. Normalize Unicode to NFKC
     * 3. Remove zero-width & control chars
     * 4. Collapse whitespace to single space
     * 5. Trim
     * 6. Lowercase
     *
     * @param string $text Text to normalize
     * @return string Normalized text
     */
    private function canonicalize_php($text)
    {
        // 1. Decode HTML entities
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // 2. Normalize Unicode to NFKC
        if (class_exists('Normalizer')) {
            $text = \Normalizer::normalize($text, \Normalizer::FORM_KC);
        }

        // 3. Remove zero-width & control chars (regex p{C} includes control chars)
        // \x{200B}-\x{200D}\x{FEFF} are zero-width spaces/joiners
        $text = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]+/u', '', $text);

        // 4. Collapse whitespace
        $text = preg_replace('/\s+/u', ' ', $text);

        // 5 & 6. Trim and Lowercase
        return $this->string_lower(trim($text));
    }

    /**
     * Compute SHA-256 signature for block content
     *
     * @param string $text_content Block text
     * @return string Hex signature
     */
    private function compute_block_signature($text_content)
    {
        $normalized = $this->canonicalize_php($text_content);
        return hash('sha256', $normalized);
    }

    /**
     * Compute SHA-256 hash of block content (Legacy, kept for backward compat)
     *
     * @param string $text_content The text content of the block.
     * @return string The SHA-256 hash of the content.
     */
    private function compute_block_hash($text_content)
    {
        return hash('sha256', $text_content);
    }
}
