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
     * Add the single top-level AiVI menu and preserve the legacy slug.
     */
    public function add_menu_page() {
        add_menu_page(
            'AiVI - AI Visibility Inspector',
            'AiVI',
            'manage_options',
            'aivi-settings',
            array( $this, 'render_settings_page' ),
            'dashicons-visibility',
            56
        );

        // Preserve the older page slug without rendering a duplicate submenu item.
        add_submenu_page(
            null,
			__( 'AiVI Settings', 'ai-visibility-inspector' ),
			__( 'AiVI Settings', 'ai-visibility-inspector' ),
            'manage_options',
            'aivi-inspector',
            array( $this, 'render_settings_page' )
        );
    }

    /**
     * Render settings page (delegates to Admin_Settings).
     */
    public function render_settings_page() {
        Admin_Settings::render_settings_page_static();
    }

    /**
     * Render admin page.
     *
     * Kept for backward compatibility with any callers still invoking the old callback.
     */
    public function render_admin_page() {
        Admin_Settings::render_settings_page_static();
    }
}
