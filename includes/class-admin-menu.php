<?php
/**
 * Admin Menu class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Admin Menu class
 */
class Admin_Menu {

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
        add_action( 'admin_menu', array( $this, 'add_menu_page' ) );
    }

    /**
     * Add admin menu page and settings submenu
     */
    public function add_menu_page() {
        add_menu_page(
            'AiVI — AI Visibility Inspector',
            'AiVI Inspector',
            'manage_options',
            'aivi-inspector',
            array( $this, 'render_admin_page' ),
            'dashicons-visibility',
            56
        );

        // Add Settings submenu under AiVI Inspector
        add_submenu_page(
            'aivi-inspector',
            __( 'AiVI Settings', 'ai-visibility-inspector' ),
            __( 'Settings', 'ai-visibility-inspector' ),
            'manage_options',
            'aivi-settings',
            array( $this, 'render_settings_page' )
        );
    }

    /**
     * Render settings page (delegates to Admin_Settings)
     */
    public function render_settings_page() {
        Admin_Settings::render_settings_page_static();
    }

    /**
     * Render admin page
     */
    public function render_admin_page() {
        Admin_Settings::render_settings_page_static();
    }
}
