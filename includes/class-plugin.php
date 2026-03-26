<?php
/**
 * Main plugin class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Plugin class
 */
class Plugin {

    /**
     * Singleton instance
     *
     * @var self
     */
    private static $instance = null;

    /**
     * Core settings
     *
     * @var array
     */
    private $core = array();

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
        $this->load_core_settings();
        $this->init();
    }

    /**
     * Load core settings
     */
    private function load_core_settings() {
        $this->core = get_option( 'aivi_core', array() );
        if ( empty( $this->core['site_id'] ) ) {
            $this->core['site_id'] = '';
        }
        if ( empty( $this->core['version'] ) ) {
            $this->core['version'] = AIVI_VERSION;
        }
    }

    /**
     * Initialize plugin
     */
    private function init() {
        // Load required files
        $this->load_dependencies();

        // Initialize components
        add_action( 'plugins_loaded', array( $this, 'init_components' ) );
    }

    /**
     * Load plugin dependencies
     */
    private function load_dependencies() {
        require_once AIVI_PLUGIN_DIR . 'includes/helpers/functions.php';
        require_once AIVI_PLUGIN_DIR . 'includes/config.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-admin-settings.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-admin-menu.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-assets.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-editor-sidebar.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-preflight.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-analyze.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-rewrite.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-ping.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-backend-proxy.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-document-meta.php';
        require_once AIVI_PLUGIN_DIR . 'includes/class-rest-plugin-settings.php';
    }

    /**
     * Initialize plugin components
     */
    public function init_components() {
        // Initialize admin menu
        Admin_Menu::get_instance();

        // Initialize assets
        Assets::get_instance();

        // Initialize editor sidebar
        Editor_Sidebar::get_instance();

        // Initialize REST endpoints
        new REST_Preflight();
        new REST_Analyze();
        new REST_Rewrite();
        new REST_Ping();
        new REST_Backend_Proxy();
        new REST_Document_Meta();
        new REST_Plugin_Settings();
    }

    /**
     * Get core setting
     *
     * @param string $key Setting key.
     * @param mixed  $default Default value.
     * @return mixed
     */
    public function get_core_setting( $key, $default = null ) {
        return isset( $this->core[ $key ] ) ? $this->core[ $key ] : $default;
    }

    /**
     * Get site ID
     *
     * @return string
     */
    public function get_site_id() {
        return $this->get_core_setting( 'site_id', '' );
    }

    /**
     * Get plugin version
     *
     * @return string
     */
    public function get_version() {
        return $this->get_core_setting( 'version', AIVI_VERSION );
    }
}
