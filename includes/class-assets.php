<?php
/**
 * Assets management class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Assets class
 */
class Assets {

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
    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Private constructor
     */
    private function __construct() {
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
        add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_assets' ) );
    }

    /**
     * Enqueue admin assets
     *
     * @param string $hook Current admin page.
     */
    public function enqueue_admin_assets( $hook ) {
        // Only load on post edit screens and our admin page
        if ( 'post.php' !== $hook && 'post-new.php' !== $hook && 'toplevel_page_aivi-inspector' !== $hook ) {
            return;
        }

        $this->register_assets();
        $this->localize_script();
        $this->enqueue_assets();
    }

    /**
     * Enqueue block editor assets
     */
    public function enqueue_editor_assets() {
        $this->register_assets();
        $this->localize_script();
        $this->enqueue_assets();
    }

    /**
     * Register assets
     */
    private function register_assets() {
        $handle = 'aivi-inline';

        // Register an empty script for inline content
        wp_register_script(
            $handle,
            false,
            array( 'wp-element', 'wp-components', 'wp-data', 'wp-plugins', 'wp-edit-post' ),
            AIVI_VERSION,
            true
        );

        // Register CSS
        wp_register_style(
            $handle,
            false,
            array(),
            AIVI_VERSION
        );
    }

    /**
     * Localize script with configuration
     */
    private function localize_script() {
        $plugin = Plugin::get_instance();
        $core   = get_option( 'aivi_core', array( 'site_id' => '' ) );
        $aivi_settings = AiVI_Admin_Settings::get_settings();

        $settings = array(
            'siteId'        => isset( $core['site_id'] ) ? $core['site_id'] : '',
            'pluginVersion' => isset( $core['version'] ) ? $core['version'] : AIVI_VERSION,
            'restBase'      => esc_url_raw( rest_url( 'aivi/v1' ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'backendUrl'    => isset( $aivi_settings['backend_url'] ) ? $aivi_settings['backend_url'] : '',
            'isEnabled'     => AiVI_Admin_Settings::is_enabled(),
            'webLookupsEnabled' => AiVI_Admin_Settings::are_web_lookups_enabled(),
            'tokenCutoff'   => AiVI_Admin_Settings::get_token_cutoff(),
            'text'          => array(
                'title'             => 'AiVI — AI Visibility Inspector',
                'analyze'           => 'Analyze Content',
                'clear_cache'       => 'Clear Cache',
                'ai_unavailable'    => 'AI analysis unavailable. Please check your backend configuration.',
                'preflight_too_long' => 'Article too long for single-pass analysis. Please analyze a section or split the article.',
                'preflight_ok'      => 'Preflight OK. Attempting AI analysis...',
                'no_editor'         => 'Editor APIs not available in this context.',
                'awaiting'          => 'Awaiting analysis',
                'backend_not_configured' => 'Backend URL not configured. Please configure in Settings > AiVI.',
                'plugin_disabled'   => 'AiVI plugin is disabled. Please enable in Settings > AiVI.',
            ),
        );

        wp_localize_script( 'aivi-inline', 'AIVI_CONFIG', $settings );
    }

    /**
     * Enqueue assets
     */
    private function enqueue_assets() {
        // Get CSS content
        $css_content = $this->get_css_content();
        wp_add_inline_style( 'aivi-inline', $css_content );

        // Get JS content
        $js_content = $this->get_js_content();
        wp_add_inline_script( 'aivi-inline', $js_content );

        // Enqueue the scripts/styles
        wp_enqueue_style( 'aivi-inline' );
        wp_enqueue_script( 'aivi-inline' );
    }

    /**
     * Get CSS content
     *
     * @return string
     */
    private function get_css_content() {
        return "
        .aivi-panel { padding:12px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
        
        /* Global Score Card */
        .aivi-global-card { 
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); 
            border-radius:12px; 
            padding:20px; 
            margin-bottom:20px; 
            border:1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            text-align: center;
        }
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
    }

    /**
     * Get JS content
     *
     * @return string
     */
    private function get_js_content() {
        ob_start();
        include AIVI_PLUGIN_DIR . 'assets/js/aivi-sidebar.js';
        return ob_get_clean();
    }
}
