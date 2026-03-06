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
        add_action( 'plugins_loaded', array( $this, 'apply_local_http_hardening' ), 0 );
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
    }

    public function apply_local_http_hardening() {
        if ( defined( 'AIVI_DISABLE_LOCAL_HTTP_HARDENING' ) && AIVI_DISABLE_LOCAL_HTTP_HARDENING ) {
            return;
        }
        if ( ! $this->is_local_environment() ) {
            return;
        }

        add_filter( 'automatic_updater_disabled', '__return_true', 9999 );
        add_filter( 'auto_update_core', '__return_false', 9999 );

        add_filter( 'pre_site_transient_update_core', array( $this, 'disable_wp_updates_transient' ), 9999 );
        add_filter( 'pre_site_transient_update_plugins', array( $this, 'disable_wp_updates_transient' ), 9999 );
        add_filter( 'pre_site_transient_update_themes', array( $this, 'disable_wp_updates_transient' ), 9999 );
        add_filter( 'pre_site_transient_update_translations', array( $this, 'disable_wp_updates_transient' ), 9999 );

        add_filter( 'pre_http_request', array( $this, 'block_wordpress_org_http_requests' ), 9999, 3 );
    }

    public function disable_wp_updates_transient( $value ) {
        $obj = new \stdClass();
        $obj->updates = array();
        $obj->version_checked = time();
        return $obj;
    }

    public function block_wordpress_org_http_requests( $preempt, $parsed_args, $url ) {
        $host = wp_parse_url( $url, PHP_URL_HOST );
        if ( ! is_string( $host ) || $host === '' ) {
            return $preempt;
        }

        $host_lower = strtolower( $host );
        if ( $this->is_allowed_external_host( $host_lower ) ) {
            return $preempt;
        }

        if ( $this->ends_with( $host_lower, 'wordpress.org' ) ) {
            return new \WP_Error(
                'aivi_local_http_blocked',
                'Blocked external WordPress.org request in local environment.',
                array( 'url' => $url, 'host' => $host_lower )
            );
        }

        return $preempt;
    }

    private function is_allowed_external_host( $host_lower ) {
        if ( $host_lower === 'localhost' || $host_lower === '127.0.0.1' ) {
            return true;
        }
        if ( $this->ends_with( $host_lower, 'amazonaws.com' ) ) {
            return true;
        }
        if ( $this->ends_with( $host_lower, 'execute-api.eu-north-1.amazonaws.com' ) ) {
            return true;
        }
        return false;
    }

    private function is_local_environment() {
        $http_host = isset( $_SERVER['HTTP_HOST'] ) ? (string) $_SERVER['HTTP_HOST'] : '';
        $http_host_lower = strtolower( $http_host );
        return ( strpos( $http_host_lower, 'localhost' ) !== false || strpos( $http_host_lower, '127.0.0.1' ) !== false );
    }

    private function ends_with( $value, $suffix ) {
        $value = (string) $value;
        $suffix = (string) $suffix;
        $len = strlen( $suffix );
        if ( $len === 0 ) {
            return true;
        }
        if ( strlen( $value ) < $len ) {
            return false;
        }
        return substr( $value, -$len ) === $suffix;
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
