<?php
/**
 * REST API Preflight class
 *
 * @package AiVI
 */

namespace AiVI;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST Preflight class
 */
class REST_Preflight {

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
            '/preflight',
            array(
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_preflight' ),
                'args'                => array(
                    'title'   => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                    'content' => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'wp_kses_post',
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
     * Handle preflight request
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function handle_preflight( $request ) {
        $params   = $request->get_json_params();
        $title    = isset( $params['title'] ) ? (string) $params['title'] : '';
        $content  = isset( $params['content'] ) ? (string) $params['content'] : '';

        // Build minimal manifest
        $manifest = array(
            'title'          => $title,
            'content_snippet' => substr( wp_strip_all_tags( $content ), 0, 2000 ),
            'wordEstimate'   => str_word_count( wp_strip_all_tags( $content ) ),
        );

        // Estimate tokens
        $token_estimate = aivi_estimate_tokens( $content );
        $manifest['tokenEstimate'] = $token_estimate;

        // Sonnet cutoff (default 200k tokens)
        $cutoff = 200000;

        if ( $token_estimate > $cutoff ) {
            return rest_ensure_response(
                array(
                    'ok'           => false,
                    'reason'       => 'too_long',
                    'message'      => 'Article exceeds single-pass context limit (estimated tokens: ' . $token_estimate . '). ' . aivi_preflight_message_too_long(),
                    'manifest'     => $manifest,
                    'tokenEstimate' => $token_estimate,
                    'cutoff'       => $cutoff,
                )
            );
        }

        return rest_ensure_response(
            array(
                'ok'           => true,
                'message'      => aivi_preflight_message_ok(),
                'manifest'     => $manifest,
                'tokenEstimate' => $token_estimate,
                'cutoff'       => $cutoff,
            )
        );
    }
}
