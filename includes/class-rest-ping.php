<?php
/**
 * REST API Ping class
 *
 * @package AiVI
 */

namespace AiVI;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * REST Ping class
 */
class REST_Ping
{

    /**
     * Constructor
     */
    public function __construct()
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    /**
     * Register REST routes
     */
    public function register_routes()
    {
        register_rest_route(
            'aivi/v1',
            '/ping',
            array(
                'methods' => 'GET',
                'permission_callback' => array($this, 'check_permissions'),
                'callback' => array($this, 'handle_ping'),
            )
        );
    }

    /**
     * Check permissions
     *
     * @param WP_REST_Request $request Request object.
     * @return bool
     */
    public function check_permissions($request)
    {
        return current_user_can('edit_posts');
    }

    /**
     * Handle ping request
     *
     * Calls the backend ping endpoint directly without instantiating REST_Backend_Proxy
     * to avoid re-registering routes in its constructor.
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response|\WP_Error
     */
    public function handle_ping($request)
    {
        $backend_url = Admin_Settings::get_backend_url();

        if (empty($backend_url)) {
            return new \WP_Error('no_backend', 'Backend URL not configured', array('status' => 503));
        }

        $ping_url = trailingslashit($backend_url) . 'ping';

        $response = wp_remote_get(
            $ping_url,
            array(
                'timeout' => 15,
                'sslverify' => true,
                'headers' => Admin_Settings::get_api_headers(),
            )
        );

        if (is_wp_error($response)) {
            return new \WP_Error(
                'backend_error',
				__('Backend unavailable.', 'ai-visibility-inspector'),
                array('status' => 503)
            );
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        if ($status_code !== 200) {
            return new \WP_Error(
                'backend_error',
				__('Backend returned error.', 'ai-visibility-inspector'),
                array('status' => $status_code)
            );
        }

        $data = json_decode($body, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
            // Ensure aiAvailable is set
            if (!isset($data['aiAvailable'])) {
                $data['aiAvailable'] = isset($data['ok']) && $data['ok'];
            }
            return rest_ensure_response($data);
        }

        return rest_ensure_response(
            array(
                'ok' => false,
                'aiAvailable' => false,
				'message' => __('Invalid backend response.', 'ai-visibility-inspector'),
            )
        );
    }
}
