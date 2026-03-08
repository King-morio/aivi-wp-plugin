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
    'account_summary' => '/backend/account_summary',
    'account_connect' => '/backend/account_connect',
    'account_disconnect' => '/backend/account_disconnect',
    'billing_subscribe' => '/backend/billing_subscribe',
    'billing_topup' => '/backend/billing_topup',
    'billing_manage' => '/backend/billing_manage',
    'billing_return' => '/backend/billing_return',
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

/**
 * Account and entitlement state
 */
define( 'AIVI_ACCOUNT_STATE_OPTION', 'aivi_account_state' );
define( 'AIVI_ACCOUNT_STATE_VERSION', 'v1' );
define( 'AIVI_ACCOUNT_DASHBOARD_OPTION', 'aivi_account_dashboard_state' );
define( 'AIVI_USAGE_ROLLUP_OPTION', 'aivi_usage_rollup_state' );

/**
 * Billing and commercial catalog constants
 */
if ( ! defined( 'AIVI_BILLING_PROVIDER' ) ) {
    define( 'AIVI_BILLING_PROVIDER', 'paypal' );
}
if ( ! defined( 'AIVI_BILLING_READY' ) ) {
    define( 'AIVI_BILLING_READY', false );
}
define( 'AIVI_TRIAL_CREDITS', 15000 );
define( 'AIVI_TRIAL_DAYS', 14 );
define( 'AIVI_PLAN_CODES', array( 'starter', 'growth', 'pro' ) );
define( 'AIVI_TOPUP_PACK_CODES', array( 'topup_25k', 'topup_100k', 'topup_300k' ) );
define( 'AIVI_PUBLIC_BILLING_CATALOG', array(
    'trial' => array(
        'code' => 'free_trial',
        'label' => 'Free Trial',
        'billing_type' => 'trial',
        'included_credits' => 15000,
        'duration_days' => 14,
        'site_limit' => 1,
    ),
    'plans' => array(
        array(
            'code' => 'starter',
            'label' => 'Starter',
            'billing_type' => 'subscription',
            'price_usd' => 10,
            'included_credits' => 60000,
            'site_limit' => 1,
            'history_days' => 30,
        ),
        array(
            'code' => 'growth',
            'label' => 'Growth',
            'billing_type' => 'subscription',
            'price_usd' => 22,
            'included_credits' => 150000,
            'site_limit' => 3,
            'history_days' => 90,
            'intro_offer' => array(
                'type' => 'percent_off_first_cycle',
                'percent_off' => 50,
            ),
        ),
        array(
            'code' => 'pro',
            'label' => 'Pro',
            'billing_type' => 'subscription',
            'price_usd' => 59,
            'included_credits' => 450000,
            'site_limit' => 10,
            'history_days' => 365,
        ),
    ),
    'topups' => array(
        array(
            'code' => 'topup_25k',
            'label' => '25,000 Credits',
            'billing_type' => 'topup',
            'credits' => 25000,
            'price_usd' => 7,
        ),
        array(
            'code' => 'topup_100k',
            'label' => '100,000 Credits',
            'billing_type' => 'topup',
            'credits' => 100000,
            'price_usd' => 25,
        ),
        array(
            'code' => 'topup_300k',
            'label' => '300,000 Credits',
            'billing_type' => 'topup',
            'credits' => 300000,
            'price_usd' => 69,
        ),
    ),
) );

/**
 * PayPal environment variable names (names only; no secrets in WordPress)
 */
define( 'AIVI_PAYPAL_ENV_KEYS', array(
    'api_base' => 'PAYPAL_API_BASE',
    'client_id' => 'PAYPAL_CLIENT_ID',
    'client_secret' => 'PAYPAL_CLIENT_SECRET',
    'webhook_id' => 'PAYPAL_WEBHOOK_ID',
    'brand_name' => 'PAYPAL_BRAND_NAME',
    'return_url' => 'PAYPAL_RETURN_URL',
    'cancel_url' => 'PAYPAL_CANCEL_URL',
    'plan_ids' => array(
        'starter' => 'PAYPAL_PLAN_ID_STARTER',
        'growth' => 'PAYPAL_PLAN_ID_GROWTH',
        'pro' => 'PAYPAL_PLAN_ID_PRO',
    ),
) );
