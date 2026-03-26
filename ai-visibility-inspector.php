<?php
/**
 * Plugin Name: AiVI - AI Visibility Inspector
 * Description: Analyze WordPress content for AI visibility, answer readiness, structure, schema, and trust before publishing.
 * Version: 1.0.24
 * Author: Felix O.
 * License: GPLv2 or later
 * Text Domain: ai-visibility-inspector
 * Domain Path: /languages
 *
 * @package AiVI
 */

if (!defined('ABSPATH')) {
    exit;
}

// Prevent a second copy of the plugin from fatally redeclaring bootstrap symbols
// when WordPress installs it into a different folder during an upload.
if (defined('AIVI_VERSION') || class_exists('\AiVI\Plugin', false) || function_exists('aivi_run')) {
    return;
}

/**
 * Define plugin constants
 */
define('AIVI_VERSION', '1.0.24');
define('AIVI_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('AIVI_PLUGIN_URL', plugin_dir_url(__FILE__));
define('AIVI_PLUGIN_BASENAME', plugin_basename(__FILE__));
if (!defined('AIVI_BACKEND_URL')) {
    define('AIVI_BACKEND_URL', trim((string) getenv('AIVI_BACKEND_URL')));
}
define('AIVI_PLUGIN_DISABLED', false);

/**
 * Load plugin translations.
 */
if (!function_exists('aivi_load_textdomain')) {
    function aivi_load_textdomain()
    {
        load_plugin_textdomain(
            'ai-visibility-inspector',
            false,
            dirname(AIVI_PLUGIN_BASENAME) . '/languages'
        );
    }
}

add_action('plugins_loaded', 'aivi_load_textdomain', 1);

/**
 * Activation hook: create a site_id (internal use only).
 */
register_activation_hook(__FILE__, 'aivi_activate');

/**
 * Deactivation hook
 */
register_deactivation_hook(__FILE__, 'aivi_deactivate');

/**
 * Plugin activation
 */
if (!function_exists('aivi_activate')) {
    function aivi_activate()
    {
        $opt = get_option('aivi_core', false);
        if (false === $opt) {
            $site_id = wp_generate_password(24, false, false);
            $store = array(
                'site_id' => $site_id,
                'version' => AIVI_VERSION,
            );
            add_option('aivi_core', $store, '', 'no');
        }
    }
}

/**
 * Plugin deactivation
 */
if (!function_exists('aivi_deactivate')) {
    function aivi_deactivate()
    {
        // Clean up if needed
    }
}

/**
 * Ensure option exists (init fallback)
 */
add_action('init', 'aivi_ensure_options');

if (!function_exists('aivi_ensure_options')) {
    function aivi_ensure_options()
    {
        $opt = get_option('aivi_core', false);
        if (false === $opt) {
            $site_id = wp_generate_password(24, false, false);
            $store = array(
                'site_id' => $site_id,
                'version' => AIVI_VERSION,
            );
            add_option('aivi_core', $store, '', 'no');
        }
    }
}

/**
 * Bootstrap the plugin
 */
if (!AIVI_PLUGIN_DISABLED) {
    require_once AIVI_PLUGIN_DIR . 'includes/class-plugin.php';

    if (!function_exists('aivi_run')) {
        function aivi_run()
        {
            return AiVI\Plugin::get_instance();
        }
    }

    aivi_run();
}
