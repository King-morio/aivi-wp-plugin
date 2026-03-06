<?php
/**
 * AiVI Plugin Configuration
 *
 * @package AiVI
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
    die;
}

/**
 * Plugin configuration constants
 */
define( 'AIVI_MIN_PHP_VERSION', '7.4' );
define( 'AIVI_MIN_WP_VERSION', '5.8' );

/**
 * REST API endpoints
 */
define( 'AIVI_API_NAMESPACE', 'aivi/v1' );
define( 'AIVI_API_ENDPOINTS', array(
    'ping' => '/backend/proxy_ping',
    'preflight' => '/preflight',
    'analyze' => '/analyze/run',
    'rewrite' => '/rewrite',
    'apply_suggestion' => '/apply_suggestion',
    'suggestion_history' => '/suggestion_history'
) );

/**
 * Analysis options
 */
define( 'AIVI_DEFAULT_ANALYSIS_OPTIONS', array(
    'enable_web_lookups' => false,
    'anchor_v2_enabled' => false,
    'defer_details_enabled' => true,
    'partial_results_enabled' => true,
    'compact_prompt_enabled' => true,
    'max_tokens' => 4000,
    'temperature' => 0.3,
) );

/**
 * Cache settings
 */
define( 'AIVI_CACHE_EXPIRY', HOUR_IN_SECONDS );
define( 'AIVI_TRANSIENT_PREFIX', 'aivi_' );
