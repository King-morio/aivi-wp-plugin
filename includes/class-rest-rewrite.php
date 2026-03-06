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
        // Rewrite endpoint
        register_rest_route(
            'aivi/v1',
            '/rewrite',
            array(
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_rewrite' ),
                'args'                => array(
                    'suggestion_id'    => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                    'suggestion'       => array(
                        'type'              => 'object',
                        'required'          => false,
                        'validate_callback' => function($param) {
                            if (empty($param)) {
                                return true;
                            }
                            return is_array($param) && isset($param['text']);
                        }
                    ),
                    'manifest'         => array(
                        'type'              => 'object',
                        'required'          => true,
                        'validate_callback' => function($param) {
                            if (!is_array($param)) {
                                return false;
                            }
                            return isset($param['nodes']) || isset($param['block_map']) || isset($param['plain_text']) || isset($param['content_html']);
                        }
                    ),
                    'analysis_ref'     => array(
                        'type'              => 'object',
                        'required'          => false,
                        'validate_callback' => function($param) {
                            return empty($param) || is_array($param);
                        }
                    ),
                    'rewrite_target'   => array(
                        'type'              => 'object',
                        'required'          => false,
                        'validate_callback' => function($param) {
                            return empty($param) || is_array($param);
                        }
                    ),
                    'repair_intent'    => array(
                        'type'              => 'object',
                        'required'          => false,
                        'validate_callback' => function($param) {
                            return empty($param) || is_array($param);
                        }
                    ),
                    'options'          => array(
                        'type'              => 'object',
                        'required'          => false,
                        'sanitize_callback' => function($param) {
                            if (!is_array($param)) return $param;
                            return array_map('sanitize_text_field', $param);
                        }
                    ),
                    'test_mode'        => array(
                        'type'              => 'boolean',
                        'required'          => false,
                        'sanitize_callback' => 'rest_sanitize_boolean',
                    ),
                ),
            )
        );

        // Apply suggestion endpoint
        register_rest_route(
            'aivi/v1',
            '/apply_suggestion',
            array(
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_apply_suggestion' ),
                'args'                => array(
                    'suggestion_id'    => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => true,
                    ),
                    'original_text'    => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'wp_kses_post',
                        'required'          => true,
                    ),
                    'applied_text'     => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'wp_kses_post',
                        'required'          => true,
                    ),
                    'explanation'      => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_textarea_field',
                        'required'          => false,
                    ),
                    'confidence'       => array(
                        'type'              => 'number',
                        'sanitize_callback' => 'floatval',
                        'required'          => false,
                    ),
                    'post_id'          => array(
                        'type'              => 'integer',
                        'sanitize_callback' => 'absint',
                        'required'          => true,
                    ),
                    'site_id'          => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => true,
                    ),
                    'user_id'          => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                        'required'          => false,
                    ),
                ),
            )
        );

        // Get suggestion history
        register_rest_route(
            'aivi/v1',
            '/suggestion/(?P<suggestion_id>[a-zA-Z0-9-]+)/history',
            array(
                'methods'             => 'GET',
                'permission_callback' => array( $this, 'check_permissions' ),
                'callback'            => array( $this, 'handle_get_history' ),
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
        try {
			$backend_url = Admin_Settings::get_backend_url();
            if (!$backend_url) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'no_backend',
                        'message' => 'Backend URL not configured',
                    ),
                    503
                );
            }

            // Prepare request body
            $body = array(
                'suggestion_id' => $request->get_param('suggestion_id'),
                'suggestion' => $request->get_param('suggestion'),
                'manifest'   => $request->get_param('manifest'),
                'analysis_ref' => $request->get_param('analysis_ref'),
                'rewrite_target' => $request->get_param('rewrite_target'),
                'repair_intent' => $request->get_param('repair_intent'),
                'options'    => $request->get_param('options') ?: array(),
                'test_mode'  => $request->get_param('test_mode') ?: false,
            );

            // Call Lambda rewrite endpoint
            $url = rtrim($backend_url, '/') . '/aivi/v1/rewrite';
            $json_body = wp_json_encode($body);
            if ($json_body === false) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'json_encode_failed',
                        'message' => 'Failed to encode request body as JSON',
                    ),
                    500
                );
            }
            $response = wp_remote_post(
                $url,
                array(
                    'body'    => $json_body,
                    'headers' => Admin_Settings::get_api_headers(),
                    'timeout' => 30,
                    'sslverify' => true,
                    'httpversion' => '1.1',
                )
            );

            if (is_wp_error($response)) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'request_failed',
                        'message' => $response->get_error_message(),
                    ),
                    500
                );
            }

            $status = wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            return new \WP_REST_Response($data, $status);

        } catch (\Exception $e) {
            return new \WP_REST_Response(
                array(
                    'ok'      => false,
                    'error'   => 'internal_error',
                    'message' => $e->getMessage(),
                ),
                500
            );
        }
    }

    /**
     * Handle apply suggestion request
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function handle_apply_suggestion( $request ) {
        try {
			$backend_url = Admin_Settings::get_backend_url();
            if (!$backend_url) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'no_backend',
                        'message' => 'Backend URL not configured',
                    ),
                    503
                );
            }

            // Prepare request body
            $body = array(
                'suggestion_id' => $request->get_param('suggestion_id'),
                'original_text' => $request->get_param('original_text'),
                'applied_text'  => $request->get_param('applied_text'),
                'explanation'   => $request->get_param('explanation') ?: '',
                'confidence'    => $request->get_param('confidence') ?: 1.0,
                'post_id'       => $request->get_param('post_id'),
                'site_id'       => $request->get_param('site_id'),
                'user_id'       => $request->get_param('user_id') ?: wp_get_current_user()->user_login,
            );

            // Call Lambda apply_suggestion endpoint
            $url = rtrim($backend_url, '/') . '/aivi/v1/apply_suggestion';
            $json_body = wp_json_encode($body);
            if ($json_body === false) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'json_encode_failed',
                        'message' => 'Failed to encode request body as JSON',
                    ),
                    500
                );
            }
            $response = wp_remote_post(
                $url,
                array(
                    'body'    => $json_body,
                    'headers' => Admin_Settings::get_api_headers(),
                    'timeout' => 10,
                    'sslverify' => true,
                    'httpversion' => '1.1',
                )
            );

            if (is_wp_error($response)) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'request_failed',
                        'message' => $response->get_error_message(),
                    ),
                    500
                );
            }

            $status = wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            return new \WP_REST_Response($data, $status);

        } catch (\Exception $e) {
            return new \WP_REST_Response(
                array(
                    'ok'      => false,
                    'error'   => 'internal_error',
                    'message' => $e->getMessage(),
                ),
                500
            );
        }
    }

    /**
     * Handle get suggestion history request
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function handle_get_history( $request ) {
        try {
            $backend_url = Admin_Settings::get_backend_url();
            if (!$backend_url) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'no_backend',
                        'message' => 'Backend URL not configured',
                    ),
                    503
                );
            }

            $suggestion_id = $request->get_param('suggestion_id');

            // Call Lambda history endpoint
            $url = rtrim($backend_url, '/') . '/aivi/v1/suggestion/' . $suggestion_id . '/history';
            $response = wp_remote_get(
                $url,
                array(
                    'headers' => Admin_Settings::get_api_headers(),
                    'timeout' => 10,
                    'sslverify' => true,
                    'httpversion' => '1.1',
                )
            );

            if (is_wp_error($response)) {
                return new \WP_REST_Response(
                    array(
                        'ok'      => false,
                        'error'   => 'request_failed',
                        'message' => $response->get_error_message(),
                    ),
                    500
                );
            }

            $status = wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            return new \WP_REST_Response($data, $status);

        } catch (\Exception $e) {
            return new \WP_REST_Response(
                array(
                    'ok'      => false,
                    'error'   => 'internal_error',
                    'message' => $e->getMessage(),
                ),
                500
            );
        }
    }
}
