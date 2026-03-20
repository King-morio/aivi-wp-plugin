<?php
/**
 * Helper functions
 *
 * @package AiVI
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Estimate tokens from raw HTML/text
 * Conservative heuristic: tokens ≈ words * 1.6 (account for HTML & attributes)
 *
 * @param string $text Text to estimate.
 * @return int
 */
function aivi_estimate_tokens($text)
{
    if (!is_string($text)) {
        return 0;
    }
    $words = str_word_count(wp_strip_all_tags($text));
    $estimate = (int) ceil($words * 1.6);
    return $estimate;
}

/**
 * Get preflight message for too long content
 *
 * @return string
 */
function aivi_preflight_message_too_long()
{
    return 'The single-pass AI analysis is only available for articles below the context cutoff. Please split the article or analyze a section.';
}

/**
 * Get preflight success message
 *
 * @return string
 */
function aivi_preflight_message_ok()
{
    return 'Preflight OK. AiVI will attempt to run AI analysis (if backend configured).';
}

/**
 * Count H1 tags in HTML content
 *
 * @param string $html HTML content.
 * @return int Number of H1 tags found.
 */
function aivi_count_h1_tags($html)
{
    if (!is_string($html) || empty($html)) {
        return 0;
    }

    // Match opening H1 tags (case insensitive)
    // Pattern: <h1 optionally followed by attributes, then >
    preg_match_all('/<h1(?:\s[^>]*)?>/i', $html, $matches, PREG_SET_ORDER);

    return count($matches);
}

/**
 * Extract JSON-LD blocks from HTML content
 *
 * @param string $html HTML content.
 * @return array Array of decoded JSON-LD objects found.
 */
function aivi_extract_jsonld_blocks($html)
{
    if (!is_string($html) || empty($html)) {
        return array();
    }

    $blocks = array();

    // Match script tags with type="application/ld+json"
    // Handles both single and double quotes, case insensitive
    $pattern = '/<script[^>]*type\s*=\s*["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/is';

    if (preg_match_all($pattern, $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $json_string = trim($match[1]);
            if (empty($json_string)) {
                continue;
            }

            $decoded = json_decode($json_string, true);

            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $blocks[] = array(
                    'valid' => true,
                    'type' => isset($decoded['@type']) ? $decoded['@type'] : 'Unknown',
                    'content' => $decoded,
                );
            } else {
                // Include invalid JSON-LD for reporting
                $blocks[] = array(
                    'valid' => false,
                    'error' => json_last_error_msg(),
                    'raw' => substr($json_string, 0, 200),
                );
            }
        }
    }

    return $blocks;
}

/**
 * Extract internal links from HTML content
 *
 * @param string $html     HTML content.
 * @param string $site_url Optional. Site URL to determine internal links. Defaults to home_url().
 * @return array Array of internal link URLs found.
 */
function aivi_extract_internal_links($html, $site_url = '')
{
    if (!is_string($html) || empty($html)) {
        return array();
    }

    if (empty($site_url)) {
        $site_url = home_url();
    }

    $links = array();
    $site_host = wp_parse_url($site_url, PHP_URL_HOST);

    // Match href attributes in anchor tags
    $pattern = '/<a\s[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>/i';

    if (preg_match_all($pattern, $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $href = trim($match[1]);

            // Skip anchors, mailto, tel, javascript
            if (preg_match('/^(#|mailto:|tel:|javascript:)/i', $href)) {
                continue;
            }

            // Handle relative URLs (starting with /)
            if (strpos($href, '/') === 0 && strpos($href, '//') !== 0) {
                $links[] = $href;
                continue;
            }

            // Check if same host (internal link)
            $link_host = wp_parse_url($href, PHP_URL_HOST);
            if ($link_host && strtolower($link_host) === strtolower($site_host)) {
                $links[] = $href;
            }
        }
    }

    // Remove duplicates
    return array_unique($links);
}

/**
 * Validate JSON-LD syntax
 *
 * @param string $jsonld_string JSON-LD string to validate.
 * @return array Array with 'valid' boolean and 'error' string if invalid.
 */
function aivi_validate_jsonld_syntax($jsonld_string)
{
    if (!is_string($jsonld_string) || empty($jsonld_string)) {
        return array(
            'valid' => false,
            'error' => 'Empty or invalid input',
        );
    }

    $decoded = json_decode($jsonld_string, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        return array(
            'valid' => false,
            'error' => json_last_error_msg(),
        );
    }

    return array(
        'valid' => true,
        'error' => null,
    );
}
