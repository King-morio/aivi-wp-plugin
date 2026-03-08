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

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/account_summary',
			array(
				array(
					'methods' => \WP_REST_Server::READABLE,
					'callback' => array($this, 'proxy_account_summary'),
					'permission_callback' => array($this, 'check_permissions'),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/account_connect',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_account_connect'),
					'permission_callback' => array($this, 'check_manage_options_permissions'),
					'args' => array(
						'connection_token' => array(
							'type' => 'string',
							'required' => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
						'connection_label' => array(
							'type' => 'string',
							'required' => false,
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/account_disconnect',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_account_disconnect'),
					'permission_callback' => array($this, 'check_manage_options_permissions'),
					'args' => array(
						'notify_backend' => array(
							'type' => 'boolean',
							'required' => false,
							'default' => false,
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/billing_subscribe',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_billing_subscribe'),
					'permission_callback' => array($this, 'check_manage_options_permissions'),
					'args' => array(
						'plan_code' => array(
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
			'/' . $this->rest_base . '/billing_topup',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_billing_topup'),
					'permission_callback' => array($this, 'check_manage_options_permissions'),
					'args' => array(
						'topup_pack_code' => array(
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
			'/' . $this->rest_base . '/billing_manage',
			array(
				array(
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => array($this, 'proxy_billing_manage'),
					'permission_callback' => array($this, 'check_manage_options_permissions'),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/billing_return',
			array(
				array(
					'methods' => \WP_REST_Server::READABLE,
					'callback' => array($this, 'proxy_billing_return'),
					'permission_callback' => '__return_true',
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
	 * Check if user can perform site-level configuration actions.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return bool|WP_Error
	 */
	public function check_manage_options_permissions($request)
	{
		if (!current_user_can('manage_options')) {
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
	 * Proxy account summary request to backend when available.
	 *
	 * Falls back to the locally stored normalized account state if the backend
	 * is not configured or the account endpoint is not available yet.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function proxy_account_summary($request)
	{
		$backend_url = Admin_Settings::get_backend_url( 'account_summary' );
		$local_state = Admin_Settings::get_account_state();
		$local_dashboard = Admin_Settings::get_account_dashboard_state();
		if (empty($backend_url)) {
			return rest_ensure_response($this->build_account_summary_response($local_state, false, 'local', 'backend_not_configured', $local_dashboard));
		}

		$site_identity = Admin_Settings::get_site_identity_payload();
		$summary_url = trailingslashit($backend_url) . 'aivi/v1/account/summary';
		$summary_url = add_query_arg(
			array(
				'account_id' => $local_state['account_id'],
				'site_id' => $site_identity['site_id'],
				'blog_id' => $site_identity['blog_id'],
				'home_url' => $site_identity['home_url'],
			),
			$summary_url
		);

		$headers = Admin_Settings::get_api_headers();
		$headers['X-AIVI-Account-Id'] = (string) $local_state['account_id'];
		$headers['X-AIVI-Site-Id'] = (string) $site_identity['site_id'];
		$headers['X-AIVI-Blog-Id'] = (string) $site_identity['blog_id'];
		$headers['X-AIVI-Home-Url'] = (string) $site_identity['home_url'];
		$headers['X-AIVI-Plugin-Version'] = (string) $site_identity['plugin_version'];

		$response = $this->wp_remote_get_with_retries(
			$summary_url,
			array(
				'timeout' => 12,
				'sslverify' => true,
				'httpversion' => '1.1',
				'headers' => $headers,
			),
			2
		);

		if (is_wp_error($response)) {
			$this->log_event('account_summary_fallback', array(
				'error' => $response->get_error_message(),
			));
			return rest_ensure_response($this->build_account_summary_response($local_state, false, 'local', 'remote_unavailable', $local_dashboard));
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);
		$data = json_decode($body, true);

		if ($status_code >= 200 && $status_code < 300 && is_array($data)) {
			$remote_state = $this->extract_remote_account_state($data);
			$remote_dashboard = $this->extract_remote_dashboard_summary($data);
			if (is_array($remote_state)) {
				Admin_Settings::sync_remote_account_snapshot($remote_state, is_array($remote_dashboard) ? $remote_dashboard : array());
				return rest_ensure_response($this->build_account_summary_response(Admin_Settings::get_account_state(), true, 'remote', null, Admin_Settings::get_account_dashboard_state()));
			}
			if (is_array($remote_dashboard)) {
				Admin_Settings::sync_remote_account_snapshot(array(), $remote_dashboard);
				return rest_ensure_response($this->build_account_summary_response(Admin_Settings::get_account_state(), true, 'remote', null, Admin_Settings::get_account_dashboard_state()));
			}
		}

		if ($this->should_fallback_account_summary($status_code, $body)) {
			$this->log_event('account_summary_fallback', array(
				'status' => $status_code,
				'body' => is_string($body) ? substr($body, 0, 200) : '',
			));
			return rest_ensure_response($this->build_account_summary_response($local_state, false, 'local', 'remote_unavailable', $local_dashboard));
		}

		return rest_ensure_response($this->build_account_summary_response($local_state, false, 'local', 'invalid_remote_response', $local_dashboard));
	}

	/**
	 * Proxy site connection handshake to backend.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_account_connect($request)
	{
		$backend_url = Admin_Settings::get_backend_url( 'account_connect' );
		if (empty($backend_url)) {
			return new \WP_Error(
				'no_backend',
				__('Backend URL not configured.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		$connection_token = (string) $request->get_param('connection_token');
		if ($connection_token === '') {
			return new \WP_Error(
				'missing_connection_token',
				__('A connection token is required.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		$connect_url = trailingslashit($backend_url) . 'aivi/v1/account/connect';
		$site_identity = Admin_Settings::get_site_identity_payload();
		$payload = array(
			'connection_token' => $connection_token,
			'connection_label' => (string) $request->get_param('connection_label'),
			'site' => $site_identity,
		);

		$response = $this->wp_remote_post_with_retries(
			$connect_url,
			array(
				'timeout' => 15,
				'sslverify' => true,
				'httpversion' => '1.1',
				'headers' => Admin_Settings::get_api_headers(),
				'body' => wp_json_encode($payload),
			),
			2
		);

		if (is_wp_error($response)) {
			return new \WP_Error(
				'backend_error',
				__('Failed to connect this site to AiVI.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $this->build_http_diagnostics(
						$response->get_error_code(),
						$response->get_error_message(),
						$response->get_error_data()
					),
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);
		$data = json_decode($body, true);
		if ($status_code >= 200 && $status_code < 300 && is_array($data)) {
			$remote_state = $this->extract_remote_account_state($data);
			$remote_dashboard = $this->extract_remote_dashboard_summary($data);
			if (is_array($remote_state)) {
				Admin_Settings::sync_remote_account_snapshot($remote_state, is_array($remote_dashboard) ? $remote_dashboard : array());
			}
			return rest_ensure_response(array(
				'ok' => true,
				'account_state' => Admin_Settings::get_public_account_state(),
				'dashboard_summary' => Admin_Settings::get_public_account_dashboard_state(),
				'message' => isset($data['message']) && is_string($data['message'])
					? $data['message']
					: __('Site connected successfully.', 'ai-visibility-inspector'),
			));
		}

		return new \WP_Error(
			'backend_error',
			__('AiVI account connection failed.', 'ai-visibility-inspector'),
			array(
				'status' => $status_code > 0 ? $status_code : 502,
				'body' => is_string($body) ? substr($body, 0, 300) : '',
			)
		);
	}

	/**
	 * Disconnect the locally stored account state and optionally notify backend.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_account_disconnect($request)
	{
		$notify_backend = (bool) $request->get_param('notify_backend');
		$backend_url = Admin_Settings::get_backend_url( 'account_disconnect' );
		$previous_state = Admin_Settings::get_account_state();

		if ($notify_backend && !empty($backend_url) && !empty($previous_state['account_id'])) {
			$disconnect_url = trailingslashit($backend_url) . 'aivi/v1/account/disconnect';
			$site_identity = Admin_Settings::get_site_identity_payload();
			$this->wp_remote_post_with_retries(
				$disconnect_url,
				array(
					'timeout' => 10,
					'sslverify' => true,
					'httpversion' => '1.1',
					'headers' => Admin_Settings::get_api_headers(),
					'body' => wp_json_encode(array(
						'account_id' => $previous_state['account_id'],
						'site' => $site_identity,
					)),
				),
				1
			);
		}

		Admin_Settings::clear_account_state();

		return rest_ensure_response(array(
			'ok' => true,
			'account_state' => Admin_Settings::get_public_account_state(),
			'message' => __('Site disconnected from AiVI account.', 'ai-visibility-inspector'),
		));
	}

	/**
	 * Proxy hosted subscription checkout creation.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_billing_subscribe($request)
	{
		$plan_code = sanitize_text_field((string) $request->get_param('plan_code'));
		if (!in_array($plan_code, AIVI_PLAN_CODES, true)) {
			return new \WP_Error(
				'invalid_plan_code',
				__('A valid billing plan is required.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		return $this->proxy_billing_request(
			'aivi/v1/billing/checkout/subscription',
			array(
				'plan_code' => $plan_code,
			)
		);
	}

	/**
	 * Proxy hosted top-up checkout creation.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_billing_topup($request)
	{
		$pack_code = sanitize_text_field((string) $request->get_param('topup_pack_code'));
		if (!in_array($pack_code, AIVI_TOPUP_PACK_CODES, true)) {
			return new \WP_Error(
				'invalid_topup_pack_code',
				__('A valid credit pack is required.', 'ai-visibility-inspector'),
				array('status' => 400)
			);
		}

		return $this->proxy_billing_request(
			'aivi/v1/billing/checkout/topup',
			array(
				'topup_pack_code' => $pack_code,
			)
		);
	}

	/**
	 * Proxy manage billing redirect lookup.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function proxy_billing_manage($request)
	{
		return $this->proxy_billing_request('aivi/v1/billing/manage', array(), true);
	}

	/**
	 * Proxy the public PayPal return callback to the backend and land users back on the local settings page.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function proxy_billing_return($request)
	{
		$backend_url = Admin_Settings::get_backend_url( 'billing_return' );
		if (empty($backend_url)) {
			return $this->build_redirect_rest_response(
				$this->build_local_billing_status_url(array(
					'aivi_billing_return' => 'backend_not_configured',
				))
			);
		}

		$query_params = array();
		foreach (array('token', 'PayerID', 'payer_id', 'ba_token', 'baToken', 'subscription_id', 'subscriptionId') as $key) {
			$value = $request->get_param($key);
			if ($value !== null && $value !== '') {
				$query_params[$key] = sanitize_text_field((string) $value);
			}
		}

		$backend_return_url = add_query_arg(
			$query_params,
			trailingslashit($backend_url) . 'aivi/v1/billing/return/paypal'
		);

		$response = $this->wp_remote_get_with_retries(
			$backend_return_url,
			array(
				'timeout' => 20,
				'sslverify' => true,
				'httpversion' => '1.1',
				'headers' => Admin_Settings::get_api_headers(),
				'redirection' => 0,
			),
			2
		);

		if (is_wp_error($response)) {
			$this->log_event('billing_return_proxy_error', array(
				'error' => $response->get_error_message(),
			));
			return $this->build_redirect_rest_response(
				$this->build_local_billing_status_url(array(
					'aivi_billing_return' => 'remote_unavailable',
				))
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$location = wp_remote_retrieve_header($response, 'location');
		$redirect_params = $this->extract_billing_redirect_params($location);

		if ($status_code >= 300 && $status_code < 400) {
			return $this->build_redirect_rest_response(
				$this->build_local_billing_status_url($redirect_params)
			);
		}

		if ($status_code >= 200 && $status_code < 300) {
			return $this->build_redirect_rest_response(
				$this->build_local_billing_status_url(array(
					'aivi_billing_return' => 'processed',
				))
			);
		}

		$this->log_event('billing_return_proxy_http_error', array(
			'status' => $status_code,
			'body' => substr((string) wp_remote_retrieve_body($response), 0, 300),
		));

		return $this->build_redirect_rest_response(
			$this->build_local_billing_status_url(array(
				'aivi_billing_return' => 'backend_error',
			))
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
			'token_estimate' => absint($request->get_param('token_estimate')),
			'run_metadata' => array(
				'site_id' => $site_id,
				'user_id' => get_current_user_id(),
				'post_id' => $request->get_param('post_id'),
				'content_type' => $request->get_param('content_type') ?: 'article',
				'source' => 'editor-sidebar',
				'prompt_version' => 'v1',
				'feature_flags' => Admin_Settings::get_feature_flags(),
				'account_state' => Admin_Settings::get_account_state(),
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
			$parsed_error = json_decode($body_preview, true);
			$remote_error_code = (is_array($parsed_error) && !empty($parsed_error['error'])) ? sanitize_key($parsed_error['error']) : 'backend_error';
			$remote_error_message = (is_array($parsed_error) && !empty($parsed_error['message'])) ? sanitize_text_field($parsed_error['message']) : __('Backend returned error.', 'ai-visibility-inspector');
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
				'remote_error_code' => $remote_error_code,
				'diagnostics' => $diagnostics
			));
			return new \WP_Error(
				$remote_error_code,
				$remote_error_message,
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

			if (
				isset($data['status']) &&
				in_array($data['status'], array('success', 'success_partial', 'failed', 'failed_schema', 'failed_too_long', 'aborted'), true) &&
				isset($data['billing_summary']) &&
				is_array($data['billing_summary'])
			) {
				Admin_Settings::record_run_usage_summary(
					(string) $run_id,
					(string) $data['status'],
					$data['billing_summary'],
					(string) ($data['completed_at'] ?? '')
				);
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
	 * Build a normalized account summary response payload.
	 *
	 * @param array       $account_state Normalized account state.
	 * @param bool        $remote_available Whether remote summary is available.
	 * @param string      $source local|remote.
	 * @param string|null $sync_status Optional sync status.
	 * @return array
	 */
	private function build_account_summary_response($account_state, $remote_available, $source, $sync_status, $dashboard_state = array())
	{
		return array(
			'ok' => true,
			'remote_available' => (bool) $remote_available,
			'source' => sanitize_text_field((string) $source),
			'sync_status' => $sync_status ? sanitize_text_field((string) $sync_status) : null,
			'account_state' => Admin_Settings::get_public_account_state(),
			'dashboard_summary' => Admin_Settings::get_public_account_dashboard_state($dashboard_state),
			'site' => Admin_Settings::get_site_identity_payload(),
		);
	}

	/**
	 * Build a REST redirect response.
	 *
	 * @param string $location Redirect target.
	 * @return WP_REST_Response
	 */
	private function build_redirect_rest_response($location)
	{
		$response = new \WP_REST_Response(null, 302);
		$response->header('Location', esc_url_raw($location));
		$response->header('Cache-Control', 'no-store');
		return $response;
	}

	/**
	 * Build the local AiVI billing status URL on the WordPress admin domain.
	 *
	 * @param array $params Optional query params.
	 * @return string
	 */
	private function build_local_billing_status_url($params = array())
	{
		$base_url = add_query_arg(
			array(
				'page' => Admin_Settings::PAGE_SLUG,
			),
			admin_url('admin.php')
		);

		$allowed = array();
		foreach (array('aivi_billing_return', 'provider_order_id', 'payer_id', 'subscription_ref') as $key) {
			if (!empty($params[$key])) {
				$allowed[$key] = sanitize_text_field((string) $params[$key]);
			}
		}

		if (empty($allowed['aivi_billing_return'])) {
			$allowed['aivi_billing_return'] = 'unknown';
		}

		return add_query_arg($allowed, $base_url) . '#aivi-billing-status';
	}

	/**
	 * Extract the small billing status payload from a backend redirect location.
	 *
	 * @param string $location Backend redirect location.
	 * @return array
	 */
	private function extract_billing_redirect_params($location)
	{
		$location = is_string($location) ? trim($location) : '';
		if ($location === '') {
			return array(
				'aivi_billing_return' => 'unknown',
			);
		}

		$query = wp_parse_url($location, PHP_URL_QUERY);
		$params = array();
		if (is_string($query) && $query !== '') {
			parse_str($query, $params);
		}

		$filtered = array();
		foreach (array('aivi_billing_return', 'provider_order_id', 'payer_id', 'subscription_ref') as $key) {
			if (!empty($params[$key])) {
				$filtered[$key] = sanitize_text_field((string) $params[$key]);
			}
		}

		if (empty($filtered['aivi_billing_return'])) {
			$filtered['aivi_billing_return'] = 'unknown';
		}

		return $filtered;
	}

	/**
	 * Proxy a billing request to the backend with bound account and site context.
	 *
	 * @param string $backend_path Backend path relative to stage root.
	 * @param array  $payload Additional request payload.
	 * @param bool   $allow_not_supported Whether a 501 backend response should be relayed.
	 * @return WP_REST_Response|WP_Error
	 */
	private function proxy_billing_request($backend_path, $payload = array(), $allow_not_supported = false)
	{
		$backend_url = Admin_Settings::get_backend_url( 'billing' );
		if (empty($backend_url)) {
			return new \WP_Error(
				'no_backend',
				__('AiVI billing backend is not configured.', 'ai-visibility-inspector'),
				array('status' => 503)
			);
		}

		$account_state = Admin_Settings::get_account_state();
		$account_id = sanitize_text_field((string) ($account_state['account_id'] ?? ''));
		if ($account_id === '') {
			return new \WP_Error(
				'account_not_connected',
				__('Connect this site to an AiVI account before using billing actions.', 'ai-visibility-inspector'),
				array('status' => 409)
			);
		}

		$site_identity = Admin_Settings::get_site_identity_payload();
		$request_payload = array_merge(
			array(
				'account' => array(
					'account_id' => $account_id,
					'connection_status' => sanitize_text_field((string) ($account_state['connection_status'] ?? '')),
					'plan_code' => sanitize_text_field((string) ($account_state['plan_code'] ?? '')),
					'subscription_status' => sanitize_text_field((string) ($account_state['subscription_status'] ?? '')),
				),
				'site' => $site_identity,
			),
			is_array($payload) ? $payload : array()
		);

		$response = $this->wp_remote_post_with_retries(
			trailingslashit($backend_url) . ltrim($backend_path, '/'),
			array(
				'timeout' => 20,
				'sslverify' => true,
				'httpversion' => '1.1',
				'headers' => Admin_Settings::get_api_headers(),
				'body' => wp_json_encode($request_payload),
			),
			2
		);

		if (is_wp_error($response)) {
			return new \WP_Error(
				'billing_backend_error',
				__('AiVI billing service is currently unavailable.', 'ai-visibility-inspector'),
				array(
					'status' => 503,
					'diagnostics' => $this->build_http_diagnostics(
						$response->get_error_code(),
						$response->get_error_message(),
						$response->get_error_data()
					),
				)
			);
		}

		$status_code = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);
		$data = json_decode($body, true);

		if ($status_code >= 200 && $status_code < 300 && is_array($data)) {
			return rest_ensure_response($data);
		}

		if ($allow_not_supported && $status_code === 501 && is_array($data)) {
			return rest_ensure_response($data);
		}

		return new \WP_Error(
			'billing_backend_error',
			__('AiVI billing request failed.', 'ai-visibility-inspector'),
			array(
				'status' => $status_code > 0 ? $status_code : 502,
				'body' => is_string($body) ? substr($body, 0, 300) : '',
			)
		);
	}

	/**
	 * Extract account state from a backend account response.
	 *
	 * @param mixed $data Backend response.
	 * @return array|null
	 */
	private function extract_remote_account_state($data)
	{
		if (!is_array($data)) {
			return null;
		}

		if (isset($data['account_state']) && is_array($data['account_state'])) {
			return $data['account_state'];
		}

		if (isset($data['data']) && is_array($data['data']) && isset($data['data']['account_state']) && is_array($data['data']['account_state'])) {
			return $data['data']['account_state'];
		}

		return null;
	}

	/**
	 * Extract dashboard summary from a backend account response.
	 *
	 * @param mixed $data Backend response.
	 * @return array|null
	 */
	private function extract_remote_dashboard_summary($data)
	{
		if (!is_array($data)) {
			return null;
		}

		if (isset($data['dashboard_summary']) && is_array($data['dashboard_summary'])) {
			return $data['dashboard_summary'];
		}

		if (isset($data['data']) && is_array($data['data']) && isset($data['data']['dashboard_summary']) && is_array($data['data']['dashboard_summary'])) {
			return $data['data']['dashboard_summary'];
		}

		return null;
	}

	/**
	 * Determine whether account summary should fall back to local state.
	 *
	 * @param int    $status_code HTTP status code.
	 * @param string $body Raw body preview.
	 * @return bool
	 */
	private function should_fallback_account_summary($status_code, $body)
	{
		$body = is_string($body) ? strtolower($body) : '';
		if ($status_code === 404) {
			return true;
		}
		if ($status_code === 403 && strpos($body, 'missing authentication token') !== false) {
			return true;
		}
		if ($status_code === 501) {
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
