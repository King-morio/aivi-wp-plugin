<?php
/**
 * REST API Analyze class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST Analyze class
 */
class REST_Analyze {

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
            '/analyze',
            array(
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_analyze' ),
                'args'                => array(
                    'title'    => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                    'content'  => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'wp_kses_post',
                        'required'          => false,
                    ),
                    'manifest' => array(
                        'type'              => 'object',
                        'sanitize_callback' => array( $this, 'sanitize_manifest' ),
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
     * Sanitize manifest
     *
     * @param array $manifest Manifest data.
     * @return array
     */
    public function sanitize_manifest( $manifest ) {
        if ( ! is_array( $manifest ) ) {
            return array();
        }

        $sanitized = array();
        // Support both camelCase and snake_case for backward compatibility
        $allowed_keys = array( 'title', 'content_snippet', 'wordEstimate', 'word_count', 'tokenEstimate', 'token_estimate' );

        foreach ( $allowed_keys as $key ) {
            if ( isset( $manifest[ $key ] ) ) {
                if ( is_string( $manifest[ $key ] ) ) {
                    $sanitized[ $key ] = sanitize_text_field( $manifest[ $key ] );
                } elseif ( is_numeric( $manifest[ $key ] ) ) {
                    $sanitized[ $key ] = (int) $manifest[ $key ];
                }
            }
        }

        return $sanitized;
    }

    /**
     * Handle analyze request
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function handle_analyze( $request ) {
        // AI-gated: We intentionally do not attempt semantic analysis here.
        // This endpoint is a stub that indicates backend AI is not wired.
        return new \WP_REST_Response(
            array(
                'ok'      => false,
                'error'   => 'ai_unavailable',
                'message' => 'AI analysis could not be completed. The AiVI orchestrator is not yet configured on this site.',
            ),
            503
        );
    }
}
