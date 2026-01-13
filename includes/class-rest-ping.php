<?php
/**
 * REST API Ping class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST Ping class
 */
class REST_Ping {

    /**
     * Constructor
     */
    public function __construct() {
        add_action( 'rest_api_init', array( $this, 'register_routes' ) );
    }

    /**
     * Register REST routes
     */
    public function register_routes() {
        register_rest_route(
            'aivi/v1',
            '/ping',
            array(
                'methods'             => 'GET',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_ping' ),
            )
        );
    }

    /**
     * Check permissions
     *
     * @param WP_REST_Request $request Request object.
     * @return bool
     */
    public function check_permissions( $request ) {
        return current_user_can( 'edit_posts' );
    }

    /**
     * Handle ping request
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function handle_ping( $request ) {
        // Skeleton: return aiAvailable=false to match abort behavior by default
        return rest_ensure_response(
            array(
                'ok'          => true,
                'aiAvailable' => false,
                'message'     => 'AiVI backend not configured in skeleton.',
            )
        );
    }
}
