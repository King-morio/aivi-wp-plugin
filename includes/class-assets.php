<?php
/**
 * Assets management class
 *
 * @package AiVI
 */

namespace AiVI;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Assets class
 */
class Assets
{

    /**
     * Singleton instance
     *
     * @var self
     */
    private static $instance = null;

    /**
     * Get singleton instance
     *
     * @return self
     */
    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Private constructor
     */
    private function __construct()
    {
        // Only use enqueue_block_editor_assets for Gutenberg sidebar
        // This prevents double loading that was causing "plugin already registered" errors
        // Classic editor meta box uses separate mechanism (not inline script)
        add_action('enqueue_block_editor_assets', array($this, 'enqueue_editor_assets'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    /**
     * Enqueue admin assets
     *
     * @param string $hook Current admin page.
     */
    public function enqueue_admin_assets($hook)
    {
        // Only load on post edit screens and our admin page
        if ('post.php' !== $hook && 'post-new.php' !== $hook && 'toplevel_page_aivi-settings' !== $hook) {
            return;
        }

        $this->register_assets();
        $this->localize_script();
        $this->enqueue_assets();
    }

    /**
     * Enqueue block editor assets
     */
    public function enqueue_editor_assets()
    {
        $this->register_assets();
        $this->localize_script();
        $this->enqueue_assets();
    }

    /**
     * Register assets
     */
    private function register_assets()
    {
        $style_handle = 'aivi-inline';
        $overlay_style_handle = 'aivi-overlay-editor';
        $overlay_handle = 'aivi-overlay-editor';
        $sidebar_handle = 'aivi-sidebar';
        $sidebar_path = AIVI_PLUGIN_DIR . 'assets/js/aivi-sidebar.js';
        $overlay_path = AIVI_PLUGIN_DIR . 'assets/js/aivi-overlay-editor.js';
        $overlay_style_path = AIVI_PLUGIN_DIR . 'assets/css/aivi-overlay-editor.css';
        $sidebar_version = file_exists($sidebar_path) ? (string) filemtime($sidebar_path) : AIVI_VERSION;
        $overlay_version = file_exists($overlay_path) ? (string) filemtime($overlay_path) : AIVI_VERSION;
        $overlay_style_version = file_exists($overlay_style_path) ? (string) filemtime($overlay_style_path) : AIVI_VERSION;

        wp_register_script(
            $sidebar_handle,
            AIVI_PLUGIN_URL . 'assets/js/aivi-sidebar.js',
            array($overlay_handle, 'wp-element', 'wp-components', 'wp-data', 'wp-plugins', 'wp-editor', 'wp-edit-post'),
            $sidebar_version,
            true
        );

        wp_register_script(
            $overlay_handle,
            AIVI_PLUGIN_URL . 'assets/js/aivi-overlay-editor.js',
            array('wp-data'),
            $overlay_version,
            true
        );

        // Register CSS
        wp_register_style(
            $style_handle,
            false,
            array(),
            AIVI_VERSION
        );

        wp_register_style(
            $overlay_style_handle,
            AIVI_PLUGIN_URL . 'assets/css/aivi-overlay-editor.css',
            array(),
            $overlay_style_version
        );
    }

    /**
     * Localize script with configuration
     */
    private function localize_script()
    {
        $settings = array(
            'restBase' => esc_url_raw(rest_url('aivi/v1')),
            'adminDashboardUrl' => esc_url_raw(admin_url('admin.php?page=aivi-settings')),
            'apiEndpoints' => AIVI_API_ENDPOINTS,
            'nonce' => wp_create_nonce('wp_rest'),
            'backendConfigured' => Admin_Settings::get_backend_url() !== '',
            'accountState' => Admin_Settings::get_public_account_state(),
            'billingProvider' => AIVI_BILLING_PROVIDER,
            'billingReady' => (bool) AIVI_BILLING_READY,
            'allowUnboundAnalysis' => (bool) AIVI_ALLOW_UNBOUND_ANALYSIS,
            'isEnabled' => Admin_Settings::is_enabled(),
            'webLookupsEnabled' => Admin_Settings::are_web_lookups_enabled(),
            'featureFlags' => Admin_Settings::get_feature_flags(),
            'copilotIconUrl' => esc_url_raw(AIVI_PLUGIN_URL . 'assets/img/aivi-icon.png'),
            'fixAssistGenerationEnabled' => true,
            // Stability Release Mode is overlay-local and intentionally does not alter sidebar messaging.
            'stabilityReleaseMode' => false,
            'stabilityReleaseModeVersion' => 'v1',
            'autoRunOnLoad' => false,
            'aiHighlightSourcePriority' => array('analyzer'),
            'checkCategoryMap' => $this->get_check_category_map(),
            'text' => array(
                'title' => 'AiVI — AI Visibility Inspector',
                'analyze' => 'Analyze Content',
                'clear_cache' => 'Clear Cache',
                'ai_unavailable' => 'AI analysis is temporarily unavailable. Please try again later or contact support if the problem persists.',
                'preflight_too_long' => 'Article too long for single-pass analysis. Please analyze a section or split the article.',
                'preflight_ok' => 'Preflight OK. Attempting AI analysis...',
                'no_editor' => 'Editor APIs not available in this context.',
                'awaiting' => 'Awaiting analysis',
                'backend_not_configured' => 'AiVI is not ready on this site yet. Connect your AiVI account or contact support.',
                'plugin_disabled' => 'AiVI is currently disabled for this site. Contact support if this was unexpected.',
            ),
        );

        wp_localize_script('aivi-sidebar', 'AIVI_CONFIG', $settings);
    }

    /**
     * Build a check_id => category name map from canonical primary-category-map.json.
     *
     * @return array<string,string>
     */
    private function get_check_category_map()
    {
        static $check_category_map = null;

        if (null !== $check_category_map) {
            return $check_category_map;
        }

        $check_category_map = array();
        $candidate_paths = array(
            AIVI_PLUGIN_DIR . 'includes/data/primary-category-map.json',
            AIVI_PLUGIN_DIR . 'infrastructure/lambda/orchestrator/schemas/primary-category-map.json',
            AIVI_PLUGIN_DIR . 'infrastructure/lambda/worker/schemas/primary-category-map.json',
        );

        $map_data = null;
        foreach ($candidate_paths as $path) {
            if (!file_exists($path)) {
                continue;
            }

            $json = file_get_contents($path);
            if (!is_string($json) || '' === trim($json)) {
                continue;
            }

            $decoded = json_decode($json, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                continue;
            }

            $map_data = $decoded;
            break;
        }

        if (!is_array($map_data) || !isset($map_data['categories']) || !is_array($map_data['categories'])) {
            return $check_category_map;
        }

        foreach ($map_data['categories'] as $category) {
            if (!is_array($category)) {
                continue;
            }

            $category_name = isset($category['name']) && is_string($category['name']) ? trim($category['name']) : '';
            if ('' === $category_name) {
                continue;
            }

            $check_ids = isset($category['check_ids']) && is_array($category['check_ids']) ? $category['check_ids'] : array();
            foreach ($check_ids as $check_id) {
                if (!is_string($check_id)) {
                    continue;
                }

                $normalized_id = trim($check_id);
                if ('' === $normalized_id) {
                    continue;
                }

                $check_category_map[$normalized_id] = $category_name;
            }
        }

        return $check_category_map;
    }

    /**
     * Enqueue assets
     */
    private function enqueue_assets()
    {
        // Get CSS content
        $css_content = $this->get_css_content();
        wp_add_inline_style('aivi-inline', $css_content);

        wp_enqueue_style('aivi-inline');
        wp_enqueue_style('aivi-overlay-editor');
        wp_enqueue_script('aivi-overlay-editor');
        wp_enqueue_script('aivi-sidebar');
    }

    /**
     * Get CSS content
     *
     * @return string
     */
    private function get_css_content()
    {
        $base_css = "
        .aivi-panel { padding:12px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
        .aivi-global-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius:12px; padding:20px; margin-bottom:20px; border:1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: center; }
        .aivi-global-header {
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:20px;
            text-align: left;
        }
        .aivi-global-header h3 {
            margin:0;
            font-size:18px;
            font-weight:600;
            color:#1e293b;
        }
        .aivi-grade-badge {
            background: #3b82f6;
            color: white;
            padding:4px 10px;
            border-radius:20px;
            font-weight:700;
            font-size:14px;
        }
        .aivi-global-score {
            display:flex;
            justify-content:center;
            margin-bottom:16px;
        }
        .aivi-score-breakdown {
            display:flex;
            justify-content:center;
            gap:20px;
            font-size:13px;
            color:#64748b;
            text-align: center;
        }

        /* Circle Components */
        .aivi-circle {
            position:relative;
            opacity:0.92;
            display:flex;
            align-items:center;
            justify-content:center;
        }
        .aivi-circle svg{
            transform: rotate(-90deg);
            display:block;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05));
        }
        .aivi-circle-large svg {
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.08));
        }
        .aivi-score-label{
            position:absolute;
            inset:0;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            font-weight:700;
            font-size:14px;
            text-align:center;
            padding: 8px;
            box-sizing: border-box;
        }
        .aivi-score-value {
            font-size: 24px;
            font-weight: 800;
            line-height: 1;
            margin-bottom: 2px;
        }
        .aivi-circle-large .aivi-score-value {
            font-size: 32px;
        }
        .aivi-small{
            font-size:12px;
            color:#64748b;
            line-height: 1.2;
        }
        .aivi-score-detail {
            font-size: 10px;
            opacity: 0.7;
        }

        /* Sub-scores Section */
        .aivi-subscores {
            display:flex;
            gap:16px;
            margin-bottom:20px;
        }
        .aivi-subscore-card {
            flex:1;
            background: white;
            border-radius:8px;
            padding:16px;
            text-align:center;
            border:1px solid #e2e8f0;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .aivi-subscore-label {
            font-size:14px;
            font-weight:600;
            color:#374151;
            margin-bottom:12px;
            text-align: center;
        }

        /* CTA Section */
        .aivi-cta-section {
            display:flex;
            flex-direction:column;
            gap:10px;
            margin-bottom:16px;
        }
        .aivi-analyze-button {
            width:100% !important;
            height:44px !important;
            font-size:15px !important;
            font-weight:600 !important;
            border-radius:8px !important;
            box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2) !important;
            transition: all 0.2s ease !important;
        }
        .aivi-analyze-button:hover {
            box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3) !important;
            transform: translateY(-1px) !important;
        }
        .aivi-clear-cache {
            background: transparent;
            border:1px solid #d1d5db;
            color:#6b7280;
            padding:10px 16px;
            border-radius:6px;
            cursor:pointer;
            font-size:13px;
            transition: all 0.2s ease;
            align-self: center;
        }
        .aivi-clear-cache:hover {
            background: #f9fafb;
            border-color: #9ca3af;
            color: #374151;
        }
        .aivi-clear-cache:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Existing Styles */
        .aivi-breakdown{ margin-top:10px; }
        .aivi-category{ cursor:pointer; margin-top:10px; width:100%; }
        .aivi-category-header{ display:flex; justify-content:space-between; align-items:center; font-weight:600; background:#f3f4f6; padding:8px; border-radius:4px; }
        .aivi-check{ border-left:4px solid transparent; padding:8px; margin-bottom:8px; border-radius:3px; background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,0.02) inset; cursor:default; }
        .aivi-pass{ border-left-color:#16a34a; }
        .aivi-low{ border-left-color:#f59e0b; }
        .aivi-medium{ border-left-color:#f97316; }
        .aivi-high{ border-left-color:#ef4444; }
        .aivi-title{ font-weight:600; }
        .aivi-msg{ margin-top:4px; color:#444; }
        .aivi-meta{ margin-top:8px; font-size:13px; color:#666; }
        .aivi-highlight-temp { outline: 3px solid rgba(250,204,21,0.9); background: rgba(250,204,21,0.05); transition: background 0.2s ease; }
        .aivi-banner { padding:12px; border-radius:6px; background:#fff5f5; border:1px solid #f2dede; color:#721c24; margin-bottom:12px; }
        .aivi-placeholder { opacity:0.5; color:#6b7280; }

        /* Classic Editor Specific */
        .aivi-classic-container {
            max-width: 100%;
            overflow: hidden;
        }
        #aivi-meta-root {
            min-width: 250px;
        }
        .is-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        ";

        // Append highlight popover/toast styles
        $highlights_css_path = AIVI_PLUGIN_DIR . 'assets/css/aivi-highlights.css';
        $extra_css = '';
        if (file_exists($highlights_css_path)) {
            $extra_css = file_get_contents($highlights_css_path);
        }

        return $base_css . "\n\n" . $extra_css;
    }

}

