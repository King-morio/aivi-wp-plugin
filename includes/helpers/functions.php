<?php
/**
 * Helper functions
 *
 * @package AiVI
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Estimate tokens from raw HTML/text
 * Conservative heuristic: tokens ≈ words * 1.6 (account for HTML & attributes)
 *
 * @param string $text Text to estimate.
 * @return int
 */
function aivi_estimate_tokens( $text ) {
    if ( ! is_string( $text ) ) {
        return 0;
    }
    $words   = str_word_count( wp_strip_all_tags( $text ) );
    $estimate = (int) ceil( $words * 1.6 );
    return $estimate;
}

/**
 * Get preflight message for too long content
 *
 * @return string
 */
function aivi_preflight_message_too_long() {
    return 'The single-pass AI analysis is only available for articles below the context cutoff. Please split the article or analyze a section.';
}

/**
 * Get preflight success message
 *
 * @return string
 */
function aivi_preflight_message_ok() {
    return 'Preflight OK. AiVI will attempt to run AI analysis (if backend configured).';
}
