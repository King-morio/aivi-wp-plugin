<?php
/**
 * Editor Sidebar class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Editor Sidebar class
 */
class Editor_Sidebar {

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
        add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
    }

    /**
     * Add meta box for classic editor
     */
    public function add_meta_box() {
        add_meta_box(
            'aivi_meta',
            'AiVI — AI Visibility Inspector',
            array( $this, 'render_meta_box' ),
            null,
            'side',
            'high'
        );
    }

    /**
     * Render meta box content
     *
     * @param WP_Post $post Post object.
     */
    public function render_meta_box( $post ) {
        ?>
        <div id="aivi-meta-root" style="min-height:220px;">
            <p style="margin:0;"><strong>AiVI Inspector</strong></p>
            <div id="aivi-meta-ui"></div>
        </div>
        <?php
    }
}
