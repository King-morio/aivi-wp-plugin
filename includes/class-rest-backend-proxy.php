<?php
/**
 * REST API Backend Proxy Controller
 *
 * @package AiVI
 */

namespace AiVI;

defined('ABSPATH') || exit;

/**
 * REST_Backend_Proxy Class
 */
class REST_Backend_Proxy extends \WP_REST_Controller
{

	/**
	 * Constructor.
	 */
	public function __construct()
	{
		$this->namespace = 'aivi/v1';
		$this->rest_base = 'backend';

		// Register routes - CRITICAL: Without this, proxy_ping and proxy_analyze endpoints return 404
		add_action('rest_api_init', array($this, 'register_routes'));
	}

	/**
	 * Register routes.
	 */
	public function register_routes()
	{
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/proxy_ping',
			array(
				array(
					'methods' => \WP_REST_Server::READABLE,
					'callback' => array($this, 'proxy_ping'),
					'permission_callback' => array($this, 'check_permissions'),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/proxy_analyze',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_analyze'),
					'permission_callback' => array($this, 'check_permissions'),
					'args' => array(
						'title' => array(
							'type' => 'string',
							'sanitize_callback' => 'sanitize_text_field',
							'required' => false,
						),
						'content_html' => array(
							'type' => 'string',
							'sanitize_callback' => array($this, 'sanitize_html_preserve_formatting'),
							'required' => true,
						),
						'post_id' => array(
							'type' => 'integer',
							'sanitize_callback' => 'absint',
							'required' => false,
						),
						'content_type' => array(
							'type' => 'string',
							'sanitize_callback' => 'sanitize_text_field',
							'required' => false,
						),
					),
				),
			)
		);

		// Phase 5: Polling endpoint for async analysis status
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/proxy_run_status/(?P<run_id>[a-zA-Z0-9\-]+)',
			array(
				array(
					'methods' => \WP_REST_Server::READABLE,
					'callback' => array($this, 'proxy_run_status'),
					'permission_callback' => array($this, 'check_permissions'),
					'args' => array(
						'run_id' => array(
							'type' => 'string',
							'required' => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/proxy_worker_health',
			array(
				array(
					'methods' => \WP_REST_Server::READABLE,
					'callback' => array($this, 'proxy_worker_health'),
					'permission_callback' => array($this, 'check_permissions'),
				),
			)
		);

		// Result Contract Lock: On-demand check details endpoint
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/analysis-details',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_analysis_details'),
					'permission_callback' => array($this, 'check_permissions'),
					'args' => array(
						'details_token' => array(
							'type' => 'string',
							'required' => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
						'check_id' => array(
							'type' => 'string',
							'required' => false,
							'sanitize_callback' => 'sanitize_text_field',
						),
						'detail_ref' => array(
							'type' => 'string',
							'required' => false,
							'sanitize_callback' => 'sanitize_text_field',
						),
						'instance_index' => array(
							'type' => 'integer',
							'required' => false,
							'sanitize_callback' => 'absint',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/analysis-raw',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_analysis_raw'),
					'permission_callback' => array($this, 'check_permissions'),
					'args' => array(
						'details_token' => array(
							'type' => 'string',
							'required' => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
						'content_hash' => array(
							'type' => 'string',
							'required' => false,
							'sanitize_callback' => 'sanitize_text_field',
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
	public function check_permissions($request)
	{
		if (!current_user_can('edit_posts')) {
			return new \WP_Error(
				'rest_forbidden',
				__('Sorry, you cannot perform this action.', 'ai-visibility-inspector'),
				array('status' => rest_authorization_required_code())
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
	public function proxy_ping($request)
	{
		$backend_url = Admin_Settings::get_backend_url();

		// ACTIVE WARMUP DISABLED: Causing local server overload (502s)
		// $this->trigger_lambda_warmup($backend_url);
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
			$error_code = $response->get_error_code();
			$error_message = $response->get_error_message();
			$diagnostics = $this->build_http_diagnostics($error_code, $error_message, $response->get_error_data());
			$this->log_event('backend_ping_error', array(
				'error' => $error_message,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Backend unavailable.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $diagnostics
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);

		if ($status_code !== 200) {
			$this->log_event('backend_ping_error', array('status' => $status_code));
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

			$this->log_event('backend_ping_success');
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

	public function proxy_worker_health($request)
	{
		$backend_url = Admin_Settings::get_backend_url();
		if (empty($backend_url)) {
			return new \WP_Error('no_backend', 'Backend URL not configured', array('status' => 503));
		}

		$health_url = trailingslashit($backend_url) . 'aivi/v1/worker/health';
		$response = wp_remote_get(
			$health_url,
			array(
				'timeout' => 12,
				'sslverify' => true,
				'headers' => Admin_Settings::get_api_headers(),
			)
		);

		if (is_wp_error($response)) {
			$error_code = $response->get_error_code();
			$error_message = $response->get_error_message();
			$diagnostics = $this->build_http_diagnostics($error_code, $error_message, $response->get_error_data());
			$this->log_event('backend_worker_health_error', array(
				'error' => $error_message,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Backend unavailable.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $diagnostics
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);

		if ($status_code !== 200) {
			$this->log_event('backend_worker_health_error', array('status' => $status_code));
			return new \WP_Error(
				'backend_error',
				__('Backend returned error.', 'ai-visibility-inspector'),
				array('status' => $status_code)
			);
		}

		$data = json_decode($body, true);
		if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
			return rest_ensure_response($data);
		}

		return rest_ensure_response(
			array(
				'ok' => false,
				'message' => __('Invalid backend response.', 'ai-visibility-inspector'),
			)
		);
	}

	/**
	 * Proxy analyze request to backend (Phase 5: Async pattern)
	 *
	 * Calls POST /aivi/v1/analyze/run which returns 202 Accepted with run_id.
	 * Frontend will poll GET /aivi/v1/analyze/run/{run_id} for results.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_analyze($request)
	{
		if (!Admin_Settings::is_enabled()) {
			return new \WP_Error(
				'ai_disabled',
				__('AiVI plugin is disabled.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		$backend_url = Admin_Settings::get_backend_url();
		if (empty($backend_url)) {
			return new \WP_Error(
				'no_backend',
				__('Backend URL not configured.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		$manifest_param = $request->get_param('manifest');
		if (is_array($manifest_param)) {
			$manifest = $manifest_param;
		} else {
			$manifest = array();
		}

		// Sanitize manifest fields consistently
		if (isset($manifest['title']) && is_string($manifest['title'])) {
			$manifest['title'] = sanitize_text_field($manifest['title']);
		}
		if (isset($manifest['content_html']) && is_string($manifest['content_html'])) {
			$manifest['content_html'] = $this->sanitize_html_preserve_formatting($manifest['content_html']);
		}
		if (isset($manifest['meta_description']) && is_string($manifest['meta_description'])) {
			$manifest['meta_description'] = sanitize_textarea_field($manifest['meta_description']);
		}

		if (empty($manifest['title'])) {
			$manifest['title'] = $request->get_param('title');
		}
		if (empty($manifest['content_html'])) {
			$manifest['content_html'] = $request->get_param('content_html');
		}

		// Ensure block_map exists for backend anchoring
		if (empty($manifest['block_map']) && !empty($manifest['content_html'])) {
			$preflight = new REST_Preflight();
			$block_data = $preflight->build_block_map($manifest['content_html']);
			$manifest['block_map'] = $block_data['block_map'];
			if (empty($manifest['content_type'])) {
				$manifest['content_type'] = $block_data['content_type'];
			}
			$manifest['blocks_count'] = $block_data['blocks_count'];
		}

		if (!array_key_exists('meta_description', $manifest)) {
			$manifest['meta_description'] = $request->get_param('meta_description');
		}

		$site_id = \AiVI\Plugin::get_instance()->get_site_id();
		if (!is_string($site_id) || $site_id === '') {
			$site_id = (string) $request->get_param('site_id');
		}
		if (!is_string($site_id) || $site_id === '') {
			$site_id = (string) get_current_blog_id();
		}
		if (!is_string($site_id) || $site_id === '') {
			return new \WP_Error(
				'missing_site_id',
				__('site_id is required to start analysis.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		// Phase 5 Fix: Client-Side ID Generation (Fire-and-Forget)
		$run_id = wp_generate_uuid4();

		$body = array(
			// Pass generated run_id to backend
			'run_id' => $run_id,
			'manifest' => $manifest,
			'run_metadata' => array(
				'site_id' => $site_id,
				'user_id' => get_current_user_id(),
				'post_id' => $request->get_param('post_id'),
				'content_type' => $request->get_param('content_type') ?: 'article',
				'source' => 'editor-sidebar',
				'prompt_version' => 'v1',
				'feature_flags' => Admin_Settings::get_feature_flags(),
			),
			'enable_web_lookups' => Admin_Settings::are_web_lookups_enabled(),
			'feature_flags' => Admin_Settings::get_feature_flags(),
		);

		// Call async analyze endpoint
		$analyze_url = trailingslashit($backend_url) . 'aivi/v1/analyze/run';

		// JSON encode the body
		$json_body = wp_json_encode($body);

		// Validate JSON encoding succeeded
		if ($json_body === false) {
			$json_error = json_last_error_msg();
			$this->log_event('backend_json_encode_error', array(
				'error' => $json_error,
				'title_length' => strlen($manifest['title'] ?? ''),
				'content_length' => strlen($manifest['content_html'] ?? '')
			));
			return new \WP_Error(
				'json_encode_failed',
				__('Failed to encode request body as JSON.', 'ai-visibility-inspector'),
				array('status' => 500, 'json_error' => $json_error)
			);
		}

		// Non-blocking request to avoid PHP timeout
		$headers = Admin_Settings::get_api_headers();
		$headers['X-AIVI-Run-Id'] = $run_id;
		$request_args = array(
			'timeout' => 25,
			'blocking' => true,
			'sslverify' => true,
			'httpversion' => '1.1',
			'headers' => $headers,
			'body' => $json_body,
		);
		$request_context = $this->build_request_context($analyze_url, $request_args, 2, $run_id, $backend_url);
		$request_context['method'] = 'POST';
		$response = $this->wp_remote_post_with_retries(
			$analyze_url,
			$request_args,
			2
		);

		// Even with blocking=false, wp_remote_post might return WP_Error if connection initiation fails
		if (is_wp_error($response)) {
			$error_code = $response->get_error_code();
			$error_message = $response->get_error_message();
			$diagnostics = $this->build_http_diagnostics($error_code, $error_message, $response->get_error_data());
			$diagnostics['request'] = $request_context;
			$this->log_event('backend_analyze_dispatch_error', array(
				'run_id' => $run_id,
				'error' => $error_message,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Failed to dispatch analysis job.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $diagnostics
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		if ($status_code < 200 || $status_code >= 300) {
			$body_preview = wp_remote_retrieve_body($response);
			$diagnostics = array(
				'request' => $request_context,
				'response' => array(
					'status' => $status_code,
					'headers' => $this->pick_response_headers($response),
					'body' => is_string($body_preview) ? substr($body_preview, 0, 500) : null
				)
			);
			$this->log_event('backend_analyze_http_error', array(
				'run_id' => $run_id,
				'status' => $status_code,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Backend returned error.', 'ai-visibility-inspector'),
				array(
					'status' => $status_code,
					'diagnostics' => $diagnostics
				)
			);
		}

		$this->log_event('backend_analyze_dispatched', array('run_id' => $run_id));

		// Prevent Race Condition: Wait 0.5s to allow Lambda cold start / DDB creation
		// Frontend polls immediately, so we give backend a head start.
		usleep(500000);

		// Return 202 Accepted immediately
		$data = array(
			'ok' => true,
			'run_id' => $run_id,
			'status' => 'queued',
			'poll_url' => '/aivi/v1/analyze/run/' . $run_id,
			'backend_url' => $backend_url, // For polling construction
			'message' => 'Analysis job queued (client-side ID)'
		);

		$rest_response = rest_ensure_response($data);
		$rest_response->set_status(202);
		return $rest_response;
	}

	/**
	 * Proxy run status request to backend (Phase 5: Polling)
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_run_status($request)
	{
		$backend_url = Admin_Settings::get_backend_url();
		if (empty($backend_url)) {
			return new \WP_Error(
				'no_backend',
				__('Backend URL not configured.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		$run_id = $request->get_param('run_id');
		$status_url = trailingslashit($backend_url) . 'aivi/v1/analyze/run/' . $run_id;

		$headers = Admin_Settings::get_api_headers();
		$headers['X-AIVI-Run-Id'] = $run_id;

		$request_args = array(
			'timeout' => 20,
			'sslverify' => true,
			'httpversion' => '1.1',
			'headers' => $headers,
		);
		$request_context = $this->build_request_context($status_url, $request_args, 5, $run_id, $backend_url);

		$response = $this->wp_remote_get_with_retries(
			$status_url,
			$request_args,
			5
		);

		if (is_wp_error($response)) {
			$error_code = $response->get_error_code();
			$error_message = $response->get_error_message();
			$diagnostics = $this->build_http_diagnostics($error_code, $error_message, $response->get_error_data());
			$diagnostics['request'] = $request_context;
			$this->log_event('backend_status_error', array(
				'run_id' => $run_id,
				'error' => $error_message,
				'diagnostics' => $diagnostics,
				'url' => $status_url
			));
			return new \WP_Error(
				'backend_error',
				__('Failed to check run status.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $diagnostics
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);

		$data = json_decode($body, true);
		if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
			if ($status_code < 200 || $status_code >= 300) {
				$diagnostics = isset($data['diagnostics']) && is_array($data['diagnostics']) ? $data['diagnostics'] : null;
				if (!is_array($diagnostics)) {
					$diagnostics = array();
				}
				$diagnostics['request'] = $request_context;
				$diagnostics['response'] = array(
					'status' => $status_code,
					'headers' => $this->pick_response_headers($response)
				);
				$this->log_event('backend_status_http_error', array(
					'run_id' => $run_id,
					'status' => $status_code,
					'diagnostics' => $diagnostics,
					'url' => $status_url
				));
				return new \WP_Error(
					'backend_error',
					__('Backend returned error.', 'ai-visibility-inspector'),
					array(
						'status' => $status_code,
						'diagnostics' => $diagnostics
					)
				);
			}

			if (!isset($data['status']) || !is_string($data['status']) || $data['status'] === '') {
				$this->log_event('backend_status_invalid_shape', array(
					'run_id' => $run_id,
					'status' => $status_code,
					'url' => $status_url
				));
				return new \WP_Error(
					'invalid_response',
					__('Invalid backend response.', 'ai-visibility-inspector'),
					array('status' => 502)
				);
			}

			// Phase 5 Fix: Fetch S3 content server-side to bypass CORS
			if (isset($data['status']) && in_array($data['status'], array('success', 'success_partial'), true) && !empty($data['result_url'])) {
				$s3_response = $this->wp_remote_get_with_retries(
					$data['result_url'],
					array(
						'timeout' => 15,
						'sslverify' => true,
						'httpversion' => '1.1',
					),
					2
				);

				if (!is_wp_error($s3_response) && wp_remote_retrieve_response_code($s3_response) === 200) {
					$s3_body = wp_remote_retrieve_body($s3_response);
					$s3_json = json_decode($s3_body, true);

					if (json_last_error() === JSON_ERROR_NONE) {
						$data['result'] = $s3_json;
						unset($data['result_url']); // Consumed server-side
						$this->log_event('backend_s3_fetch_success', array('run_id' => $run_id));
					} else {
						$this->log_event('backend_s3_fetch_json_error', array('run_id' => $run_id));
					}
				} else {
					$error = is_wp_error($s3_response) ? $s3_response->get_error_message() : 'HTTP ' . wp_remote_retrieve_response_code($s3_response);
					$this->log_event('backend_s3_fetch_error', array('run_id' => $run_id, 'error' => $error));
				}
			}

			$this->log_event('backend_status_check', array('run_id' => $run_id, 'status' => $data['status'] ?? 'unknown'));
			return rest_ensure_response($data);
		}

		$this->log_event('backend_status_invalid_json', array(
			'run_id' => $run_id,
			'status' => $status_code,
			'url' => $status_url
		));
		return new \WP_Error(
			'invalid_response',
			__('Invalid backend response.', 'ai-visibility-inspector'),
			array('status' => 502, 'backend_status' => $status_code)
		);
	}

	/**
	 * Proxy analysis details request to backend
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_analysis_details($request)
	{
		$backend_url = Admin_Settings::get_backend_url();
		if (empty($backend_url)) {
			return new \WP_Error(
				'no_backend',
				__('Backend URL not configured.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		// Extract parameters
		$details_token = $request->get_param('details_token');
		$check_id = $request->get_param('check_id');
		$detail_ref = $request->get_param('detail_ref');
		$instance_index = $request->get_param('instance_index');
		$content_hash = $request->get_param('content_hash');

		if (empty($check_id) && empty($detail_ref)) {
			return new \WP_Error(
				'missing_check_reference',
				__('check_id or detail_ref is required.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		// Details token format: base64(run_id:site_id:timestamp:signature)
		// Decode first, then extract run_id for routing
		$decoded_token = base64_decode($details_token, true);
		if ($decoded_token === false) {
			return new \WP_Error(
				'invalid_token',
				__('Invalid details token encoding.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		$token_parts = explode(':', $decoded_token);
		if (count($token_parts) < 4) {
			return new \WP_Error(
				'invalid_token',
				__('Invalid details token format.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}
		$run_id = $token_parts[0];

		// Validate run_id is UUID format
		if (!preg_match('/^[a-f0-9\-]{36}$/i', $run_id)) {
			return new \WP_Error(
				'invalid_run_id',
				__('Invalid run ID in token.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		// Build URL - Lambda endpoint is GET /aivi/v1/analysis/{run_id}/details
		$details_url = trailingslashit($backend_url) . 'aivi/v1/analysis/' . $run_id . '/details';
		$query_args = array(
			'instance_index' => $instance_index,
			// Pass session token as query param for backend validation
			'token' => $details_token,
		);
		if (!empty($check_id)) {
			$query_args['check_id'] = $check_id;
		}
		if (!empty($detail_ref)) {
			$query_args['detail_ref'] = $detail_ref;
		}
		$details_url = add_query_arg($query_args, $details_url);

		$headers = array_merge(
			Admin_Settings::get_api_headers(),
			array(
				'X-AIVI-Run-Id' => $run_id,
				'x-aivi-token' => $details_token,
				'x-aivi-content-hash' => is_string($content_hash) ? $content_hash : '',
			)
		);

		$response = $this->wp_remote_get_with_retries(
			$details_url,
			array(
				'timeout' => 15,
				'sslverify' => true,
				'httpversion' => '1.1',
				'headers' => $headers,
			),
			3
		);

		if (is_wp_error($response)) {
			$error_code = $response->get_error_code();
			$error_message = $response->get_error_message();
			$diagnostics = $this->build_http_diagnostics($error_code, $error_message, $response->get_error_data());
			$this->log_event('backend_details_error', array(
				'run_id' => $run_id,
				'check_id' => $check_id,
				'detail_ref' => $detail_ref,
				'url' => $details_url, // Log the URL
				'error' => $error_message,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Failed to fetch analysis details: ' . $error_message, 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $diagnostics
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);

		// Handle 410 Gone (stale results)
		if ($status_code === 410) {
			return new \WP_Error(
				'results_stale',
				__('Analysis results have expired. Please re-run analysis.', 'ai-visibility-inspector'),
				array('status' => 410)
			);
		}

		// Handle other errors
		if ($status_code !== 200) {
			$error_data = json_decode($body, true);
			$diagnostics = null;
			if (json_last_error() === JSON_ERROR_NONE && is_array($error_data)) {
				$diagnostics = $error_data['diagnostics'] ?? null;
			}
			$this->log_event('backend_details_error', array(
				'run_id' => $run_id,
				'status' => $status_code,
				'url' => $details_url,
				'detail_ref' => $detail_ref,
				'body' => substr($body, 0, 200),
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Backend returned error.', 'ai-visibility-inspector'),
				array(
					'status' => $status_code,
					'diagnostics' => $diagnostics
				)
			);
		}

		$data = json_decode($body, true);
		if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
			$this->log_event('backend_details_success', array('run_id' => $run_id, 'check_id' => $check_id, 'detail_ref' => $detail_ref));
			return rest_ensure_response($data);
		}

		return new \WP_Error(
			'invalid_response',
			__('Invalid backend response.', 'ai-visibility-inspector'),
			array('status' => 502)
		);
	}

	public function proxy_analysis_raw($request)
	{
		$backend_url = Admin_Settings::get_backend_url();
		if (empty($backend_url)) {
			return new \WP_Error(
				'no_backend',
				__('Backend URL not configured.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		$details_token = $request->get_param('details_token');
		$content_hash = $request->get_param('content_hash');
		$decoded_token = base64_decode($details_token, true);
		if ($decoded_token === false) {
			return new \WP_Error(
				'invalid_token',
				__('Invalid details token encoding.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}
		$parts = explode(':', $decoded_token);
		if (count($parts) < 4) {
			return new \WP_Error(
				'invalid_token',
				__('Invalid details token format.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}
		$run_id = $parts[0];
		if (!preg_match('/^[a-f0-9\-]{36}$/i', $run_id)) {
			return new \WP_Error(
				'invalid_run_id',
				__('Invalid run ID in token.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		$raw_url = trailingslashit($backend_url) . 'aivi/v1/analysis/' . $run_id . '/raw';
		$raw_url = add_query_arg(array('token' => $details_token), $raw_url);

		$headers = array_merge(
			Admin_Settings::get_api_headers(),
			array(
				'X-AIVI-Run-Id' => $run_id,
				'x-aivi-token' => $details_token,
				'x-aivi-content-hash' => is_string($content_hash) ? $content_hash : '',
			)
		);

		$response = $this->wp_remote_get_with_retries(
			$raw_url,
			array(
				'timeout' => 12,
				'sslverify' => true,
				'httpversion' => '1.1',
				'headers' => $headers,
			),
			3
		);

		if (is_wp_error($response)) {
			$error_code = $response->get_error_code();
			$error_message = $response->get_error_message();
			$diagnostics = $this->build_http_diagnostics($error_code, $error_message, $response->get_error_data());
			$this->log_event('backend_raw_error', array(
				'run_id' => $run_id,
				'error' => $error_message,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				'backend_error',
				__('Failed to fetch raw analysis.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $diagnostics
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);

		if ($status_code !== 200) {
			if ((int) $status_code === 403) {
				return new \WP_Error(
					'backend_raw_unavailable',
					__('Raw analysis endpoint unavailable on backend.', 'ai-visibility-inspector'),
					array(
						'status' => 503,
						'backend_status' => $status_code,
						'hint' => 'deploy_api_route_analysis_raw'
					)
				);
			}
			return new \WP_Error(
				'backend_error',
				__('Backend returned error.', 'ai-visibility-inspector'),
				array('status' => $status_code)
			);
		}

		$data = json_decode($body, true);
		if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
			return rest_ensure_response($data);
		}

		return new \WP_Error(
			'invalid_response',
			__('Invalid backend response.', 'ai-visibility-inspector'),
			array('status' => 502)
		);
	}

	/**
	 * Custom HTML sanitizer that preserves formatting tags
	 * without encoding special characters that break JSON
	 *
	 * @param string $html HTML content to sanitize.
	 * @return string
	 */
	public function sanitize_html_preserve_formatting($html)
	{
		if (!is_string($html)) {
			return '';
		}

		// Strip dangerous tags but preserve formatting tags and essential attributes
		$allowed_tags = array(
			'h1' => array(),
			'h2' => array(),
			'h3' => array(),
			'h4' => array(),
			'h5' => array(),
			'h6' => array(),
			'p' => array(),
			'br' => array(),
			'strong' => array(),
			'b' => array(),
			'em' => array(),
			'i' => array(),
			'u' => array(),
			'span' => array(),
			'div' => array(),
			'section' => array(),
			'article' => array(),
			'header' => array(),
			'footer' => array(),
			'nav' => array(),
			'main' => array(),
			'aside' => array(),
			'ul' => array(),
			'ol' => array(),
			'li' => array(),
			'dl' => array(),
			'dt' => array(),
			'dd' => array(),
			'blockquote' => array(),
			'pre' => array(),
			'code' => array(),
			'table' => array(),
			'thead' => array(),
			'tbody' => array(),
			'tr' => array(),
			'th' => array(),
			'td' => array(),
			'a' => array(
				'href' => true,
				'title' => true,
				'target' => true,
				'rel' => true
			),
			'img' => array(
				'src' => true,
				'alt' => true,
				'width' => true,
				'height' => true,
				'title' => true
			),
			'figure' => array(),
			'figcaption' => array(),
			'small' => array(),
			'sub' => array(),
			'sup' => array(),
			'del' => array(),
			'ins' => array(),
			'mark' => array()
		);

		// Use wp_kses with custom allowed tags and attributes
		$sanitized = wp_kses($html, $allowed_tags);

		// CRITICAL: Do NOT encode special characters that break JSON
		// Keep raw quotes, ampersands, etc. for the AI to analyze

		return $sanitized;
	}

	/**
	 * Log event
	 *
	 * @param string $event Event name.
	 * @param array  $context Event context.
	 */
	private function log_event($event, $context = array())
	{
		// Custom logging to avoid noise
		// WARNING: Disabled to prevent file locking issues on Windows causing 502s
		/*
		$log_entry = array(
			'timestamp' => current_time('mysql'),
			'event' => $event,
			'context' => $context,
		);
		$file = WP_CONTENT_DIR . '/aivi-debug.log';
		file_put_contents($file, json_encode($log_entry) . "\n", FILE_APPEND);
		*/

		// Fallback to error_log for critical errors only
		if (strpos($event, 'error') !== false) {
			error_log("AiVI Error [$event]: " . json_encode($context));
		}
	}
	private function build_http_diagnostics($error_code, $error_message, $error_data)
	{
		$message = is_string($error_message) ? $error_message : '';
		$message_lower = strtolower($message);
		$type = 'unknown';
		if (strpos($message_lower, 'timed out') !== false || strpos($message_lower, 'timeout') !== false || strpos($message_lower, 'curl error 28') !== false) {
			$type = 'timeout';
		} elseif (strpos($message_lower, 'could not resolve host') !== false || strpos($message_lower, 'name or service not known') !== false) {
			$type = 'dns';
		} elseif (strpos($message_lower, 'ssl') !== false || strpos($message_lower, 'certificate') !== false) {
			$type = 'ssl';
		} elseif (
			strpos($message_lower, 'connection refused') !== false ||
			strpos($message_lower, 'failed to connect') !== false ||
			strpos($message_lower, 'curl error 55') !== false ||
			strpos($message_lower, 'socket not connected') !== false ||
			strpos($message_lower, 'connection reset') !== false
		) {
			$type = 'connection';
		}
		$diagnostics = array(
			'type' => $type,
			'code' => $error_code,
			'message' => $message,
			'summary' => trim($type . ': ' . $message)
		);
		if (!empty($error_data)) {
			$diagnostics['data'] = $error_data;
		}
		return $diagnostics;
	}

	private function build_request_context($url, $args, $max_attempts, $run_id = null, $backend_url = null)
	{
		$headers = array();
		if (is_array($args) && isset($args['headers']) && is_array($args['headers'])) {
			$headers = array_keys($args['headers']);
		}
		$parsed = is_string($url) ? wp_parse_url($url) : array();
		$context = array(
			'method' => 'GET',
			'url' => $url,
			'host' => isset($parsed['host']) ? $parsed['host'] : '',
			'path' => isset($parsed['path']) ? $parsed['path'] : '',
			'query' => isset($parsed['query']) ? $parsed['query'] : '',
			'timeout' => isset($args['timeout']) ? $args['timeout'] : null,
			'sslverify' => isset($args['sslverify']) ? (bool) $args['sslverify'] : null,
			'httpversion' => isset($args['httpversion']) ? $args['httpversion'] : null,
			'headers' => $headers,
			'max_attempts' => (int) $max_attempts
		);
		if (is_string($run_id) && $run_id !== '') {
			$context['run_id'] = $run_id;
		}
		if (is_string($backend_url) && $backend_url !== '') {
			$context['backend_url'] = $backend_url;
		}
		return $context;
	}

	private function pick_response_headers($response)
	{
		$headers = wp_remote_retrieve_headers($response);
		// wp_remote_retrieve_headers returns CaseInsensitiveDictionary (ArrayAccess), not array
		if (!$headers || (!is_array($headers) && !($headers instanceof \ArrayAccess))) {
			return array();
		}
		$keys = array(
			'content-type',
			'content-length',
			'x-request-id',
			'x-amzn-requestid',
			'x-amz-request-id',
			'x-amz-id-2',
			'x-amzn-trace-id'
		);
		$filtered = array();
		foreach ($keys as $key) {
			if (isset($headers[$key])) {
				$filtered[$key] = is_array($headers[$key]) ? implode(', ', $headers[$key]) : (string) $headers[$key];
			}
		}
		return $filtered;
	}

	private function wp_remote_get_with_retries($url, $args, $max_attempts)
	{
		$max_attempts = (int) $max_attempts;
		if ($max_attempts < 1) {
			$max_attempts = 1;
		}

		$last_response = null;

		for ($attempt = 1; $attempt <= $max_attempts; $attempt++) {
			$last_response = wp_remote_get($url, $args);
			if (!is_wp_error($last_response)) {
				return $last_response;
			}

			$error_code = $last_response->get_error_code();
			$error_message = $last_response->get_error_message();
			if (!$this->should_retry_http_error($error_code, $error_message)) {
				return $last_response;
			}

			if ($attempt < $max_attempts) {
				$jitter_ms = 200 + (function_exists('random_int') ? random_int(0, 600) : mt_rand(0, 600));
				usleep($jitter_ms * 1000);
			}
		}

		return $last_response;
	}

	private function wp_remote_post_with_retries($url, $args, $max_attempts)
	{
		$max_attempts = (int) $max_attempts;
		if ($max_attempts < 1) {
			$max_attempts = 1;
		}

		$last_response = null;

		for ($attempt = 1; $attempt <= $max_attempts; $attempt++) {
			$last_response = wp_remote_post($url, $args);
			if (!is_wp_error($last_response)) {
				return $last_response;
			}

			$error_code = $last_response->get_error_code();
			$error_message = $last_response->get_error_message();
			if (!$this->should_retry_http_error($error_code, $error_message)) {
				return $last_response;
			}

			if ($attempt < $max_attempts) {
				$jitter_ms = 200 + (function_exists('random_int') ? random_int(0, 600) : mt_rand(0, 600));
				usleep($jitter_ms * 1000);
			}
		}

		return $last_response;
	}

	private function should_retry_http_error($error_code, $error_message)
	{
		$code = is_string($error_code) ? $error_code : '';
		$message = is_string($error_message) ? strtolower($error_message) : '';

		if ($code !== 'http_request_failed') {
			return false;
		}

		if (strpos($message, 'curl error 55') !== false) {
			return true;
		}

		if (strpos($message, 'curl error 28') !== false) {
			return true;
		}

		if (strpos($message, 'timed out') !== false || strpos($message, 'timeout') !== false) {
			return true;
		}

		if (strpos($message, 'socket not connected') !== false) {
			return true;
		}

		if (strpos($message, 'connection reset') !== false) {
			return true;
		}

		if (strpos($message, 'recv failure') !== false) {
			return true;
		}

		if (strpos($message, 'empty reply from server') !== false) {
			return true;
		}

		return false;
	}
	/**
	 * Triggers a lightweight non-blocking ping to warm up Lambda containers
	 *
	 * Uses the ping endpoint instead of analyze to minimize overhead while
	 * still triggering Lambda container initialization for cold start mitigation.
	 *
	 * @param string $backend_url The backend API URL
	 */
	private function trigger_lambda_warmup($backend_url)
	{
		// Use ping endpoint for lightweight warmup (no AI processing)
		$ping_url = trailingslashit($backend_url) . 'ping';

		// Fire and forget (blocking = false) with proper SSL verification
		wp_remote_get($ping_url, array(
			'timeout' => 2,
			'blocking' => false,
			'sslverify' => true,
			'headers' => Admin_Settings::get_api_headers(),
		));

		// Also warm up the worker endpoint for faster analysis starts
		$worker_url = trailingslashit($backend_url) . 'aivi/v1/worker/health';
		wp_remote_get($worker_url, array(
			'timeout' => 2,
			'blocking' => false,
			'sslverify' => true,
			'headers' => Admin_Settings::get_api_headers(),
		));
	}
}
