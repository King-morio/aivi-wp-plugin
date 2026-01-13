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
     * Add admin menu page
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
    }

    /**
     * Render admin page
     */
    public function render_admin_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $plugin = Plugin::get_instance();
        $site_id = $plugin->get_site_id();
        $version = $plugin->get_version();
        ?>
        <div class="wrap">
            <h1>AiVI — AI Visibility Inspector (Prototype UI Shell)</h1>
            <p>
                AiVI is an AI-gated content analysis product that measures AEO/GEO visibility.
                This single-file plugin is a <strong>UI-first skeleton</strong>. It intentionally:
            </p>
            <ul>
                <li>Runs a deterministic <strong>preflight</strong> token estimate on content (server-side).</li>
                <li>Delegates all semantic checks to the AiVI backend (AI Orchestrator).</li>
                <li>Aborts analysis and shows a clear banner if AI is unavailable.</li>
            </ul>

            <h2>Site Info</h2>
            <p><strong>Site ID (internal):</strong> <code><?php echo esc_html( $site_id ); ?></code></p>
            <p><strong>Plugin version:</strong> <?php echo esc_html( $version ); ?></p>

            <h2>How to test</h2>
            <ol>
                <li>Activate plugin and open any post (Gutenberg or Classic).</li>
                <li>Open the editor sidebar and click <strong>Analyze Content</strong>.</li>
                <li>The plugin calls a deterministic preflight (token estimate). If the article is below the configured token cutoff, it calls the AI analyze endpoint.<br>
                In this skeleton, the analyze endpoint returns "AI unavailable" so the UI will show the abort banner (this is correct behavior).</li>
            </ol>

            <p style="color:#666;font-size:13px">This plugin contains REST stubs. The backend orchestrator should be implemented to replace the analyze/rewrite stubs with real logic.</p>
        </div>
        <?php
    }
}
