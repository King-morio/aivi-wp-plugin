<?php
/**
 * REST API Rewrite class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST Rewrite class
 */
class REST_Rewrite {

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
            '/rewrite',
            array(
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_rewrite' ),
                'args'                => array(
                    'run_id'         => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                    'highlight_id'    => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                    'context'        => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'wp_kses_post',
                        'required'          => false,
                    ),
                    'instructions'   => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_textarea_field',
                        'required'          => false,
                    ),
                    'tone'           => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                ),
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
     * Handle rewrite request
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function handle_rewrite( $request ) {
        // Not implemented in skeleton
        return new \WP_REST_Response(
            array(
                'ok'      => false,
                'error'   => 'not_implemented',
                'message' => 'Rewrite agent is not implemented in the skeleton. Implement AiVI orchestrator and rewrite agent to provide suggestions.',
            ),
            501
        );
    }
}
