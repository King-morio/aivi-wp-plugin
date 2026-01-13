<?php
/**
 * REST API Backend Proxy Controller
 *
 * @package AiVI
 */

defined( 'ABSPATH' ) || exit;

/**
 * REST_Backend_Proxy Class
 */
class REST_Backend_Proxy extends \WP_REST_Controller {

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->namespace = 'aivi/v1';
		$this->rest_base = 'backend';
	}

	/**
	 * Register routes.
	 */
	public function register_routes() {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/proxy_ping',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'proxy_ping' ),
					'permission_callback' => array( $this, 'check_permissions' ),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/proxy_analyze',
			array(
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'proxy_analyze' ),
					'permission_callback' => array( $this, 'check_permissions' ),
					'args'                => array(
						'title' => array(
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
							'required'          => false,
						),
						'content_html' => array(
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_textarea_field',
							'required'          => true,
						),
						'post_id' => array(
							'type'              => 'integer',
							'sanitize_callback' => 'absint',
							'required'          => false,
						),
						'content_type' => array(
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
							'required'          => false,
						),
					),
				),
			)
		);
	}

	/**
	 * Check if user has permission.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return bool|WP_Error
	 */
	public function check_permissions( $request ) {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return new \WP_Error(
				'rest_forbidden',
				__( 'Sorry, you cannot perform this action.', 'ai-visibility-inspector' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * Proxy ping request to backend
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_ping( $request ) {
		if ( ! AiVI_Admin_Settings::is_enabled() ) {
			return rest_ensure_response(
				array(
					'ok' => false,
					'aiAvailable' => false,
					'message' => __( 'AiVI plugin is disabled.', 'ai-visibility-inspector' ),
				)
			);
		}

		$backend_url = AiVI_Admin_Settings::get_backend_url();
		if ( empty( $backend_url ) ) {
			return rest_ensure_response(
				array(
					'ok' => false,
					'aiAvailable' => false,
					'message' => __( 'Backend URL not configured.', 'ai-visibility-inspector' ),
				)
			);
		}

		$ping_url = trailingslashit( $backend_url ) . 'ping';
		
		$response = wp_remote_get(
			$ping_url,
			array(
				'timeout' => 10,
				'sslverify' => true,
				'headers' => array(
					'Content-Type' => 'application/json',
					'User-Agent' => 'AiVI-WordPress/' . ( defined( 'AIVI_VERSION' ) ? AIVI_VERSION : '1.0.0' ),
					'X-Site-ID' => (string) get_current_blog_id(),
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			$this->log_event( 'backend_ping_error', array( 'error' => $response->get_error_message() ) );
			return rest_ensure_response(
				array(
					'ok' => false,
					'aiAvailable' => false,
					'message' => __( 'Backend unavailable.', 'ai-visibility-inspector' ),
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );

		if ( $status_code !== 200 ) {
			$this->log_event( 'backend_ping_error', array( 'status' => $status_code ) );
			return rest_ensure_response(
				array(
					'ok' => false,
					'aiAvailable' => false,
					'message' => __( 'Backend returned error.', 'ai-visibility-inspector' ),
				)
			);
		}

		$data = json_decode( $body, true );
		if ( json_last_error() === JSON_ERROR_NONE && is_array( $data ) ) {
			// Ensure aiAvailable is set
			if ( ! isset( $data['aiAvailable'] ) ) {
				$data['aiAvailable'] = isset( $data['ok'] ) && $data['ok'];
			}
			
			$this->log_event( 'backend_ping_success' );
			return rest_ensure_response( $data );
		}

		return rest_ensure_response(
			array(
				'ok' => false,
				'aiAvailable' => false,
				'message' => __( 'Invalid backend response.', 'ai-visibility-inspector' ),
			)
		);
	}

	/**
	 * Proxy analyze request to backend
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_analyze( $request ) {
		if ( ! AiVI_Admin_Settings::is_enabled() ) {
			return new \WP_Error(
				'ai_disabled',
				__( 'AiVI plugin is disabled.', 'ai-visibility-inspector' ),
				array( 'status' => 503 )
			);
		}

		$backend_url = AiVI_Admin_Settings::get_backend_url();
		if ( empty( $backend_url ) ) {
			return new \WP_Error(
				'no_backend',
				__( 'Backend URL not configured.', 'ai-visibility-inspector' ),
				array( 'status' => 503 )
			);
		}

		// Prepare request data
		$body = array(
			'title' => $request->get_param( 'title' ),
			'content_html' => $request->get_param( 'content_html' ),
			'post_id' => $request->get_param( 'post_id' ),
			'content_type' => $request->get_param( 'content_type' ),
			'site_id' => get_current_blog_id(),
			'enable_web_lookups' => AiVI_Admin_Settings::are_web_lookups_enabled(),
		);

		$analyze_url = trailingslashit( $backend_url ) . 'analyze';
		
		$response = wp_remote_post(
			$analyze_url,
			array(
				'timeout' => 30,
				'sslverify' => true,
				'headers' => array(
					'Content-Type' => 'application/json',
					'User-Agent' => 'AiVI-WordPress/' . ( defined( 'AIVI_VERSION' ) ? AIVI_VERSION : '1.0.0' ),
					'X-Site-ID' => (string) get_current_blog_id(),
				),
				'body' => wp_json_encode( $body ),
			)
		);

		if ( is_wp_error( $response ) ) {
			$error_code = $response->get_error_code();
			if ( 'http_request_failed' === $error_code ) {
				$this->log_event( 'backend_analyze_timeout' );
				return new \WP_Error(
					'timeout',
					__( 'Backend request timed out.', 'ai-visibility-inspector' ),
					array( 'status' => 504 )
				);
			}
			
			$this->log_event( 'backend_analyze_error', array( 'error' => $response->get_error_message() ) );
			return new \WP_Error(
				'backend_error',
				__( 'Backend unavailable.', 'ai-visibility-inspector' ),
				array( 'status' => 503 )
			);
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );

		if ( $status_code !== 200 ) {
			$this->log_event( 'backend_analyze_error', array( 'status' => $status_code ) );
			return new \WP_Error(
				'backend_error',
				sprintf( __( 'Backend returned error: %d', 'ai-visibility-inspector' ), $status_code ),
				array( 'status' => 502 )
			);
		}

		$data = json_decode( $body, true );
		if ( json_last_error() === JSON_ERROR_NONE && is_array( $data ) ) {
			$this->log_event( 'backend_analyze_success' );
			return rest_ensure_response( $data );
		}

		return new \WP_Error(
			'invalid_response',
			__( 'Invalid backend response.', 'ai-visibility-inspector' ),
			array( 'status' => 502 )
		);
	}

	/**
	 * Log event
	 *
	 * @param string $event Event name.
	 * @param array  $context Event context.
	 */
	private function log_event( $event, $context = array() ) {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$log_entry = array(
				'timestamp' => current_time( 'mysql' ),
				'event' => $event,
				'context' => $context,
			);
			error_log( 'AiVI Backend: ' . wp_json_encode( $log_entry ) );
		}
	}
}
