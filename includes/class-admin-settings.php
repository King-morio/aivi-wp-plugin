<?php
/**
 * Admin Settings Page
 *
 * @package AiVI
 */

namespace AiVI;

defined( 'ABSPATH' ) || exit;

/**
 * Admin Settings Class
 */
class Admin_Settings {

	/**
	 * Settings page slug
	 */
	const PAGE_SLUG = 'aivi-settings';

	/**
	 * Option key
	 */
	const OPTION_KEY = 'aivi_settings';

	/**
	 * Account state option key
	 */
	const ACCOUNT_STATE_OPTION_KEY = AIVI_ACCOUNT_STATE_OPTION;

	/**
	 * Local usage rollup option key.
	 */
	const USAGE_ROLLUP_OPTION_KEY = AIVI_USAGE_ROLLUP_OPTION;

	/**
	 * Cached dashboard summary option key.
	 */
	const ACCOUNT_DASHBOARD_OPTION_KEY = AIVI_ACCOUNT_DASHBOARD_OPTION;

	/**
	 * Preferred trial contact email option key.
	 */
	const CONTACT_EMAIL_OPTION_KEY = 'aivi_contact_email';

	/**
	 * Constructor
	 */
	public function __construct() {
		// Menu registration moved to Admin_Menu class for single unified menu
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'wp_ajax_aivi_test_connection', array( $this, 'ajax_test_connection' ) );
	}

	/**
	 * Register settings
	 */
	public function register_settings() {
		register_setting(
			self::OPTION_KEY,
			self::OPTION_KEY,
			array(
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'autoload' => false,
			)
		);

		add_settings_section(
			'aivi_main',
			__( 'Backend Configuration', 'ai-visibility-inspector' ),
			array( $this, 'section_description' ),
			self::PAGE_SLUG
		);

		add_settings_field(
			'backend_url',
			__( 'Backend URL', 'ai-visibility-inspector' ),
			array( $this, 'render_backend_url_field' ),
			self::PAGE_SLUG,
			'aivi_main'
		);

		add_settings_field(
			'api_key',
			__( 'AiVI API Key', 'ai-visibility-inspector' ),
			array( $this, 'render_api_key_field' ),
			self::PAGE_SLUG,
			'aivi_main'
		);

		add_settings_field(
			'enable_web_lookups',
			__( 'Enable Web Lookups', 'ai-visibility-inspector' ),
			array( $this, 'render_enable_web_lookups_field' ),
			self::PAGE_SLUG,
			'aivi_main'
		);

		add_settings_field(
			'token_cutoff',
			__( 'Token Cutoff Override', 'ai-visibility-inspector' ),
			array( $this, 'render_token_cutoff_field' ),
			self::PAGE_SLUG,
			'aivi_main'
		);

		add_settings_field(
			'enable_plugin',
			__( 'Enable AiVI', 'ai-visibility-inspector' ),
			array( $this, 'render_enable_plugin_field' ),
			self::PAGE_SLUG,
			'aivi_main'
		);
	}

	/**
	 * Section description
	 */
	public function section_description() {
		$site_id = get_current_blog_id();
		$version = defined( 'AIVI_VERSION' ) ? AIVI_VERSION : '1.0.0';
		$account_state = self::get_account_state();
		$connection_label = self::get_connection_status_label( $account_state['connection_status'] );

		echo '<p>';
		printf(
			/* translators: 1: Site ID, 2: Plugin version */
			__( 'Site ID: %1$d | Plugin Version: %2$s', 'ai-visibility-inspector' ),
			intval( $site_id ),
			esc_html( $version )
		);
		echo '</p>';
		echo '<p>';
		printf(
			/* translators: %s: Connection status label */
			__( 'Account Connection: %s', 'ai-visibility-inspector' ),
			esc_html( $connection_label )
		);
		echo '</p>';
		echo '<p class="description">';
		_e( 'Configure the backend orchestration URL and plugin behavior. All API calls will be routed through this backend.', 'ai-visibility-inspector' );
		echo '</p>';
	}

	/**
	 * Render backend URL field
	 */
	public function render_backend_url_field() {
		$settings = $this->get_settings();
		$value = isset( $settings['backend_url'] ) && ! empty( $settings['backend_url'] ) ? $settings['backend_url'] : self::get_backend_url();
		$is_fallback = ! isset( $settings['backend_url'] ) || empty( $settings['backend_url'] );
		?>
		<input type="url"
			   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[backend_url]"
			   value="<?php echo esc_attr( $value ); ?>"
			   class="regular-text"
			   placeholder="https://example.execute-api.eu-north-1.amazonaws.com">
		<p class="description">
			<?php _e( 'Base URL override for the AiVI backend API. Leave this empty on customer sites to use the built-in production endpoint.', 'ai-visibility-inspector' ); ?>
		</p>
		<?php if ( $is_fallback ) : ?>
			<div class="notice notice-info inline">
				<p><?php _e( 'No backend override is set. AiVI is using its built-in production backend. Only set this field for staging, local development, or support overrides.', 'ai-visibility-inspector' ); ?></p>
			</div>
		<?php endif; ?>
		<?php
	}

	/**
	 * Render API key field
	 */
	public function render_api_key_field() {
		$settings = $this->get_settings();
		$value = isset( $settings['api_key'] ) ? $settings['api_key'] : '';
		?>
		<input type="password"
			   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[api_key]"
			   value="<?php echo esc_attr( $value ); ?>"
			   class="regular-text"
			   placeholder="Enter your API key">
		<p class="description">
			<?php _e( 'Your API key for AiVI services. Leave empty for testing (no validation yet).', 'ai-visibility-inspector' ); ?>
		</p>
		<?php
	}

	/**
	 * Render enable web lookups field
	 */
	public function render_enable_web_lookups_field() {
		$settings = $this->get_settings();
		$checked = isset( $settings['enable_web_lookups'] ) && $settings['enable_web_lookups'];
		?>
		<label>
			<input type="checkbox"
				   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[enable_web_lookups]"
				   value="1"
				   <?php checked( $checked ); ?>>
			<?php _e( 'Enable optional web lookups for claim verification.', 'ai-visibility-inspector' ); ?>
		</label>
		<p class="description">
			<?php _e( 'Keeps the default analysis specimen-bound when disabled. When enabled, AiVI may perform external verification for source-sensitive checks and analysis may take longer.', 'ai-visibility-inspector' ); ?>
		</p>
		<?php
	}

	/**
	 * Render Anchor V2 toggle field
	 */
	public function render_anchor_v2_enabled_field() {
		$settings = $this->get_settings();
		$checked = isset( $settings['anchor_v2_enabled'] ) && $settings['anchor_v2_enabled'];
		?>
		<label>
			<input type="checkbox"
				   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[anchor_v2_enabled]"
				   value="1"
				   <?php checked( $checked ); ?>>
			<?php _e( 'Enable deterministic anchor resolver v2 (feature flag).', 'ai-visibility-inspector' ); ?>
		</label>
		<?php
	}

	/**
	 * Render deferred details toggle field
	 */
	public function render_defer_details_enabled_field() {
		$settings = $this->get_settings();
		$checked = isset( $settings['defer_details_enabled'] ) && $settings['defer_details_enabled'];
		?>
		<label>
			<input type="checkbox"
				   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[defer_details_enabled]"
				   value="1"
				   <?php checked( $checked ); ?>>
			<?php _e( 'Fetch verbose issue details only on click (feature flag).', 'ai-visibility-inspector' ); ?>
		</label>
		<?php
	}

	/**
	 * Render partial results toggle field
	 */
	public function render_partial_results_enabled_field() {
		$settings = $this->get_settings();
		$checked = isset( $settings['partial_results_enabled'] ) && $settings['partial_results_enabled'];
		?>
		<label>
			<input type="checkbox"
				   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[partial_results_enabled]"
				   value="1"
				   <?php checked( $checked ); ?>>
			<?php _e( 'Allow partial analysis payloads instead of hard-aborting all results (feature flag).', 'ai-visibility-inspector' ); ?>
		</label>
		<?php
	}

	/**
	 * Render compact prompt toggle field
	 */
	public function render_compact_prompt_enabled_field() {
		$settings = $this->get_settings();
		$checked = isset( $settings['compact_prompt_enabled'] ) && $settings['compact_prompt_enabled'];
		?>
		<label>
			<input type="checkbox"
				   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[compact_prompt_enabled]"
				   value="1"
				   <?php checked( $checked ); ?>>
			<?php _e( 'Enable compact analyzer prompt/output mode for long content reliability (feature flag).', 'ai-visibility-inspector' ); ?>
		</label>
		<?php
	}

	/**
	 * Render token cutoff field
	 */
	public function render_token_cutoff_field() {
		$settings = $this->get_settings();
		$value = isset( $settings['token_cutoff'] ) ? $settings['token_cutoff'] : 200000;
		?>
		<input type="number"
			   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[token_cutoff]"
			   value="<?php echo esc_attr( $value ); ?>"
			   class="small-text"
			   min="1000"
			   max="1000000"
			   step="1000">
		<p class="description">
			<?php _e( 'Maximum tokens allowed per analysis. Default: 200,000. Admin-only setting.', 'ai-visibility-inspector' ); ?>
		</p>
		<?php
	}

	/**
	 * Render enable plugin field
	 */
	public function render_enable_plugin_field() {
		$settings = $this->get_settings();
		$checked = ! isset( $settings['enable_plugin'] ) || $settings['enable_plugin'];
		?>
		<label>
			<input type="checkbox"
				   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[enable_plugin]"
				   value="1"
				   <?php checked( $checked ); ?>>
			<?php _e( 'Enable AiVI functionality on the site. Uncheck to disable all features.', 'ai-visibility-inspector' ); ?>
		</label>
		<p class="description">
			<?php _e( 'Use this to quickly disable the plugin in case of issues.', 'ai-visibility-inspector' ); ?>
		</p>
		<?php
	}

	/**
	 * Sanitize settings
	 *
	 * @param array $input Raw input.
	 * @return array Sanitized settings
	 */
	public static function sanitize_settings( $input ) {
		$sanitized = array();
		$existing = self::get_settings();

		if ( isset( $input['backend_url'] ) ) {
			$url = esc_url_raw( trim( $input['backend_url'] ) );
			if ( ! empty( $url ) && filter_var( $url, FILTER_VALIDATE_URL ) ) {
				$sanitized['backend_url'] = rtrim( $url, '/' );
			}
		}

		// Sanitize API key
		if ( isset( $input['api_key'] ) ) {
			$sanitized['api_key'] = sanitize_text_field( $input['api_key'] );
		}

		$sanitized['enable_web_lookups'] = isset( $input['enable_web_lookups'] ) ? (bool) $input['enable_web_lookups'] : false;
		$sanitized['anchor_v2_enabled'] = array_key_exists( 'anchor_v2_enabled', $input )
			? (bool) $input['anchor_v2_enabled']
			: self::normalize_bool( $existing['anchor_v2_enabled'] ?? self::get_default_feature_flag( 'anchor_v2_enabled', false ), false );
		$sanitized['defer_details_enabled'] = array_key_exists( 'defer_details_enabled', $input )
			? (bool) $input['defer_details_enabled']
			: self::normalize_bool( $existing['defer_details_enabled'] ?? self::get_default_feature_flag( 'defer_details_enabled', true ), true );
		$sanitized['partial_results_enabled'] = array_key_exists( 'partial_results_enabled', $input )
			? (bool) $input['partial_results_enabled']
			: self::normalize_bool( $existing['partial_results_enabled'] ?? self::get_default_feature_flag( 'partial_results_enabled', true ), true );
		$sanitized['compact_prompt_enabled'] = array_key_exists( 'compact_prompt_enabled', $input )
			? (bool) $input['compact_prompt_enabled']
			: self::normalize_bool( $existing['compact_prompt_enabled'] ?? self::get_default_feature_flag( 'compact_prompt_enabled', true ), true );
		$sanitized['enable_plugin'] = isset( $input['enable_plugin'] ) ? (bool) $input['enable_plugin'] : true;

		if ( isset( $input['token_cutoff'] ) ) {
			$cutoff = absint( $input['token_cutoff'] );
			$sanitized['token_cutoff'] = max( 1000, min( 1000000, $cutoff ) );
		}

		return $sanitized;
	}

	/**
	 * Render settings page (instance method for backward compatibility)
	 */
	public function render_settings_page() {
		self::render_settings_page_static();
	}

	/**
	 * Render settings page (static method called from Admin_Menu)
	 */
	public static function render_settings_page_static() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$dashboard_state = self::get_account_dashboard_state();
		$site_identity = self::get_site_identity_payload();
		$show_operational_settings = self::should_show_operational_settings();
		$account_state = isset( $dashboard_state['account_state'] ) && is_array( $dashboard_state['account_state'] ) ? $dashboard_state['account_state'] : array();
		$is_connected = ! empty( $account_state['connected'] ) && ( $account_state['connection_status'] ?? '' ) === 'connected';
		$current_plan_code = sanitize_text_field( (string) ( $dashboard_state['plan']['plan_code'] ?? $account_state['plan_code'] ?? '' ) );
		$current_subscription_status_code = strtolower( sanitize_text_field( (string) ( $dashboard_state['plan']['subscription_status'] ?? $account_state['subscription_status'] ?? '' ) ) );
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

			<?php self::render_customer_dashboard_panel( $dashboard_state, $site_identity ); ?>

			<?php if ( $show_operational_settings ) : ?>
				<details class="aivi-operational-settings">
					<summary><?php esc_html_e( 'Operational fallback settings', 'ai-visibility-inspector' ); ?></summary>
					<p class="aivi-operational-settings__intro">
						<?php esc_html_e( 'These operational connection controls remain available for advanced troubleshooting and support-guided overrides. Most sites should use the account dashboard above and leave these settings unchanged.', 'ai-visibility-inspector' ); ?>
					</p>

					<form action="options.php" method="post">
						<?php
						settings_fields( self::OPTION_KEY );
						do_settings_sections( self::PAGE_SLUG );
						submit_button( __( 'Save operational settings', 'ai-visibility-inspector' ) );
						?>
					</form>

					<div class="aivi-operational-settings__test">
						<h2><?php _e( 'Test backend connection', 'ai-visibility-inspector' ); ?></h2>
						<p><?php _e( 'Use this only for operational troubleshooting when the customer dashboard connection does not reflect the expected account state.', 'ai-visibility-inspector' ); ?></p>

						<button type="button" id="aivi-test-connection" class="button button-secondary">
							<?php _e( 'Test Connection', 'ai-visibility-inspector' ); ?>
						</button>

						<div id="aivi-test-result" class="notice" style="display: none;"></div>
					</div>
				</details>
			<?php endif; ?>
		</div>

		<script>
		jQuery(document).ready(function($) {
			var inlineAiviSettingsConfig = {
				restBase: <?php echo wp_json_encode( esc_url_raw( rest_url( 'aivi/v1' ) ) ); ?>,
				nonce: <?php echo wp_json_encode( wp_create_nonce( 'wp_rest' ) ); ?>,
				apiEndpoints: <?php echo wp_json_encode( AIVI_API_ENDPOINTS ); ?>,
				supportCenter: <?php echo wp_json_encode( $support_center_config ); ?>
			};

			function getSettingsApiConfig() {
				var cfg = window.AIVI_CONFIG || {};
				var merged = $.extend(true, {}, inlineAiviSettingsConfig, cfg);
				if (!merged.apiEndpoints || typeof merged.apiEndpoints !== 'object') {
					merged.apiEndpoints = inlineAiviSettingsConfig.apiEndpoints || {};
				}
				return merged;
			}

			function setInlineNotice($target, kind, message) {
				if (!$target.length) return;
				var safeText = $('<div />').text(String(message || '')).html();
				$target
					.hide()
					.removeClass('notice-success notice-error notice-warning')
					.addClass(kind === 'success' ? 'notice-success' : (kind === 'warning' ? 'notice-warning' : 'notice-error'))
					.html('<p>' + safeText + '</p>')
					.fadeIn(120);
			}

			window.AIVI_SETTINGS_RUNTIME = window.AIVI_SETTINGS_RUNTIME || {};
			window.AIVI_SETTINGS_RUNTIME.getSettingsApiConfig = getSettingsApiConfig;
			window.AIVI_SETTINGS_RUNTIME.setInlineNotice = setInlineNotice;

			function getRestErrorMessage(xhr, fallbackMessage) {
				var message = String(fallbackMessage || '').trim();
				if (!xhr || !xhr.responseJSON) {
					return message;
				}
				if (xhr.responseJSON.message) {
					return String(xhr.responseJSON.message || '').trim() || message;
				}
				if (xhr.responseJSON.data && xhr.responseJSON.data.message) {
					return String(xhr.responseJSON.data.message || '').trim() || message;
				}
				if (xhr.responseJSON.data && xhr.responseJSON.data.body) {
					return String(xhr.responseJSON.data.body || '').trim() || message;
				}
				return message;
			}

			function resolveAccountSummaryEndpoint() {
				var cfg = getSettingsApiConfig();
				var endpoints = cfg.apiEndpoints && typeof cfg.apiEndpoints === 'object' ? cfg.apiEndpoints : {};
				return endpoints.account_summary || '';
			}

			function resolveOnboardingEndpoint(action) {
				var cfg = getSettingsApiConfig();
				var endpoints = cfg.apiEndpoints && typeof cfg.apiEndpoints === 'object' ? cfg.apiEndpoints : {};
				if (action === 'bootstrap') return endpoints.account_bootstrap || '';
				if (action === 'start_trial') return endpoints.account_start_trial || '';
				return '';
			}

			function resolveConnectionEndpoint(action) {
				var cfg = getSettingsApiConfig();
				var endpoints = cfg.apiEndpoints && typeof cfg.apiEndpoints === 'object' ? cfg.apiEndpoints : {};
				if (action === 'connect') return endpoints.account_connect || '';
				if (action === 'disconnect') return endpoints.account_disconnect || '';
				return '';
			}

			function buildSettingsTabUrl(tab) {
				var href = String(window.location.href || '').replace(/#.*$/, '');
				href = href.replace(/([?&])aivi_tab=[^&]*(&|$)/, function(match, prefix, suffix) {
					return suffix === '&' ? prefix : '';
				}).replace(/[?&]$/, '');
				var separator = href.indexOf('?') === -1 ? '?' : '&';
				var normalizedTab = String(tab || 'overview').trim() || 'overview';
				return href + separator + 'aivi_tab=' + encodeURIComponent(normalizedTab) + '#aivi-settings-tab-' + encodeURIComponent(normalizedTab);
			}

			function resolveBillingEndpoint(action) {
				var cfg = getSettingsApiConfig();
				var endpoints = cfg.apiEndpoints && typeof cfg.apiEndpoints === 'object' ? cfg.apiEndpoints : {};
				if (action === 'subscribe') return endpoints.billing_subscribe || '';
				if (action === 'topup') return endpoints.billing_topup || '';
				if (action === 'manage') return endpoints.billing_manage || '';
				return '';
			}

			function buildBillingReturnNotice(status) {
				switch (String(status || '').trim()) {
					case 'topup_capture_pending_credit':
						return { kind: 'warning', message: '<?php echo esc_js( __( 'Top-up approved. AiVI is syncing your credits now. This may take a few seconds.', 'ai-visibility-inspector' ) ); ?>' };
					case 'topup_credited':
						return { kind: 'success', message: '<?php echo esc_js( __( 'Top-up completed. Your credit balance has been refreshed.', 'ai-visibility-inspector' ) ); ?>' };
					case 'topup_capture_received':
						return { kind: 'warning', message: '<?php echo esc_js( __( 'Top-up approval was received. AiVI is waiting for final billing confirmation.', 'ai-visibility-inspector' ) ); ?>' };
					case 'topup_capture_failed':
						return { kind: 'error', message: '<?php echo esc_js( __( 'AiVI could not finalize the top-up after PayPal returned. Please retry or contact support.', 'ai-visibility-inspector' ) ); ?>' };
					case 'subscription_pending':
						return { kind: 'warning', message: '<?php echo esc_js( __( 'Subscription approval received. AiVI is confirming activation with PayPal now. This may take a few seconds.', 'ai-visibility-inspector' ) ); ?>' };
					case 'processed':
						return { kind: 'success', message: '<?php echo esc_js( __( 'Billing return processed. Refreshing your AiVI account state now.', 'ai-visibility-inspector' ) ); ?>' };
					case 'backend_error':
					case 'remote_unavailable':
					case 'backend_not_configured':
						return { kind: 'error', message: '<?php echo esc_js( __( 'AiVI could not refresh billing status right now. Reload the page in a moment.', 'ai-visibility-inspector' ) ); ?>' };
					default:
						return { kind: 'warning', message: '<?php echo esc_js( __( 'AiVI is refreshing your billing status.', 'ai-visibility-inspector' ) ); ?>' };
				}
			}

			function buildCleanBillingReturnUrl() {
				var url = new URL(window.location.href);
				['aivi_billing_return', 'provider_order_id', 'payer_id', 'subscription_ref'].forEach(function(key) {
					url.searchParams.delete(key);
				});
				url.hash = 'aivi-billing-status';
				return url.toString();
			}

			function persistBillingReturnFlash(notice) {
				try {
					window.sessionStorage.setItem('aiviBillingReturnFlash', JSON.stringify(notice));
				} catch (err) {
					// ignore storage failures in admin browsers with strict settings
				}
			}

			function consumeBillingReturnFlash() {
				try {
					var raw = window.sessionStorage.getItem('aiviBillingReturnFlash');
					if (!raw) return null;
					window.sessionStorage.removeItem('aiviBillingReturnFlash');
					return JSON.parse(raw);
				} catch (err) {
					return null;
				}
			}

			function needsFollowupBillingRefresh(status) {
				var normalized = String(status || '').trim();
				return normalized === 'subscription_pending' || normalized === 'topup_capture_pending_credit' || normalized === 'topup_capture_received';
			}

			function requestAccountSummary(restBase, summaryEndpoint, nonce) {
				return $.ajax({
					url: restBase + summaryEndpoint,
					type: 'GET',
					headers: {
						'X-WP-Nonce': nonce
					}
				});
			}

			function getSummarySubscriptionStatus(response) {
				try {
					return String(
						(((response || {}).dashboard_summary || {}).plan || {}).subscription_status || ''
					).trim().toLowerCase();
				} catch (err) {
					return '';
				}
			}

			function getSummaryPlanSnapshot(response) {
				try {
					var dashboard = ((response || {}).dashboard_summary || {});
					var plan = dashboard.plan || {};
					var credits = dashboard.credits || {};
					return {
						planCode: String(plan.plan_code || '').trim().toLowerCase(),
						subscriptionStatus: String(plan.subscription_status || '').trim().toLowerCase(),
						includedRemaining: Number(credits.included_remaining || 0),
						topupRemaining: Number(credits.topup_remaining || 0),
						totalRemaining: Number(credits.total_remaining || 0)
					};
				} catch (err) {
					return {
						planCode: '',
						subscriptionStatus: '',
						includedRemaining: 0,
						topupRemaining: 0,
						totalRemaining: 0
					};
				}
			}

			function getSummaryCreditSnapshot(response) {
				try {
					var credits = (((response || {}).dashboard_summary || {}).credits || {});
					return {
						includedRemaining: Number(credits.included_remaining || 0),
						topupRemaining: Number(credits.topup_remaining || 0),
						totalRemaining: Number(credits.total_remaining || 0)
					};
				} catch (err) {
					return {
						includedRemaining: 0,
						topupRemaining: 0,
						totalRemaining: 0
					};
				}
			}

			function pollPendingBillingState(restBase, summaryEndpoint, nonce, options) {
				options = options || {};
				var maxAttempts = Number(options.maxAttempts || 12);
				var intervalMs = Number(options.intervalMs || 4000);
				var attempt = 0;

				function finishWithReload() {
					window.location.replace(buildCleanBillingReturnUrl());
				}

				function run() {
					attempt += 1;
					requestAccountSummary(restBase, summaryEndpoint, nonce)
						.done(function(response) {
							if (typeof options.isSettled === 'function' && options.isSettled(response)) {
								if (typeof options.onSettled === 'function') {
									options.onSettled(response);
									return;
								}
								finishWithReload();
								return;
							}

							if (attempt >= maxAttempts) {
								if (typeof options.onTimeout === 'function') {
									options.onTimeout(response);
								}
								return;
							}

							window.setTimeout(run, intervalMs);
						})
						.fail(function(response) {
							if (attempt >= maxAttempts) {
								if (typeof options.onFailure === 'function') {
									options.onFailure(response);
								}
								return;
							}

							window.setTimeout(run, intervalMs);
						});
				}

				run();
			}

			function shouldAutoRefreshPendingBillingState() {
				return <?php echo wp_json_encode( $is_connected && in_array( $current_subscription_status_code, array( 'created', 'pending' ), true ) ); ?>;
			}

			function getBillingRefreshStorageKey() {
				return 'aiviBillingPendingRefresh:' + window.location.pathname;
			}

			function canRunPendingBillingRefresh() {
				try {
					var key = getBillingRefreshStorageKey();
					var lastRun = Number(window.sessionStorage.getItem(key) || '0');
					var now = Date.now();
					if (!Number.isFinite(lastRun) || lastRun <= 0) {
						return true;
					}
					return (now - lastRun) > 45000;
				} catch (err) {
					return true;
				}
			}

			function markPendingBillingRefreshRun() {
				try {
					window.sessionStorage.setItem(getBillingRefreshStorageKey(), String(Date.now()));
				} catch (err) {
					// ignore storage failures
				}
			}

			function triggerPendingBillingStatusRefresh() {
				var cfg = getSettingsApiConfig();
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var summaryEndpoint = resolveAccountSummaryEndpoint();
				var $result = $('#aivi-billing-result');

				if (!shouldAutoRefreshPendingBillingState() || !canRunPendingBillingRefresh()) {
					return;
				}

				if (!restBase || !summaryEndpoint || !nonce) {
					return;
				}

				markPendingBillingRefreshRun();
				setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'AiVI is syncing your latest plan and credit state...', 'ai-visibility-inspector' ) ); ?>');

				pollPendingBillingState(restBase, summaryEndpoint, nonce, {
					maxAttempts: 12,
					intervalMs: 4000,
					isSettled: function(response) {
						var subscriptionStatus = getSummarySubscriptionStatus(response);
						return subscriptionStatus === 'active' || (subscriptionStatus && subscriptionStatus !== 'created' && subscriptionStatus !== 'pending');
					},
					onSettled: function() {
						window.location.replace(buildCleanBillingReturnUrl());
					},
					onFailure: function() {
						setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'AiVI is still waiting for PayPal to confirm your subscription activation. Reload once more in a moment if the updated plan does not appear yet.', 'ai-visibility-inspector' ) ); ?>');
					},
					onTimeout: function() {
						setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'AiVI is still waiting for PayPal to confirm your subscription activation. Reload once more in a moment if the updated plan does not appear yet.', 'ai-visibility-inspector' ) ); ?>');
					}
				});
			}

			function triggerBillingReturnRefresh() {
				var cfg = getSettingsApiConfig();
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var summaryEndpoint = resolveAccountSummaryEndpoint();
				var $result = $('#aivi-billing-result');
				var params = new URLSearchParams(window.location.search);
				var returnStatus = String(params.get('aivi_billing_return') || '').trim();

				if (!returnStatus) {
					var flash = consumeBillingReturnFlash();
					if (flash && flash.message) {
						setInlineNotice($result, flash.kind || 'success', flash.message);
					}
					return;
				}

				setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'Refreshing your AiVI billing state...', 'ai-visibility-inspector' ) ); ?>');

				if (!restBase || !summaryEndpoint || !nonce) {
					var configNotice = buildBillingReturnNotice(returnStatus);
					persistBillingReturnFlash(configNotice);
					window.location.replace(buildCleanBillingReturnUrl());
					return;
				}

				requestAccountSummary(restBase, summaryEndpoint, nonce)
					.done(function() {
						if (!needsFollowupBillingRefresh(returnStatus)) {
							persistBillingReturnFlash(buildBillingReturnNotice(returnStatus));
							window.location.replace(buildCleanBillingReturnUrl());
							return;
						}

						window.setTimeout(function() {
							var currentCreditSnapshot = {
								topupRemaining: Number(<?php echo wp_json_encode( (int) ( $dashboard_state['credits']['topup_remaining'] ?? 0 ) ); ?>),
								totalRemaining: Number(<?php echo wp_json_encode( (int) ( $dashboard_state['credits']['total_remaining'] ?? 0 ) ); ?>)
							};

							if (returnStatus === 'subscription_pending') {
								var currentPlanSnapshot = {
									planCode: <?php echo wp_json_encode( strtolower( (string) $current_plan_code ) ); ?>,
									subscriptionStatus: <?php echo wp_json_encode( strtolower( (string) $current_subscription_status_code ) ); ?>,
									includedRemaining: Number(<?php echo wp_json_encode( (int) ( $dashboard_state['credits']['included_remaining'] ?? 0 ) ); ?>),
									topupRemaining: Number(<?php echo wp_json_encode( (int) ( $dashboard_state['credits']['topup_remaining'] ?? 0 ) ); ?>),
									totalRemaining: Number(<?php echo wp_json_encode( (int) ( $dashboard_state['credits']['total_remaining'] ?? 0 ) ); ?>)
								};

								pollPendingBillingState(restBase, summaryEndpoint, nonce, {
									maxAttempts: 12,
									intervalMs: 4000,
									isSettled: function(response) {
										var planSnapshot = getSummaryPlanSnapshot(response);
										var subscriptionStatus = planSnapshot.subscriptionStatus;
										var planChanged = !!planSnapshot.planCode && planSnapshot.planCode !== currentPlanSnapshot.planCode;
										var includedChanged = planSnapshot.includedRemaining !== currentPlanSnapshot.includedRemaining;
										var totalChanged = planSnapshot.totalRemaining !== currentPlanSnapshot.totalRemaining;
										if (subscriptionStatus === 'active' && (planChanged || includedChanged || totalChanged)) {
											return true;
										}
										return subscriptionStatus && subscriptionStatus !== 'created' && subscriptionStatus !== 'pending' && subscriptionStatus !== currentPlanSnapshot.subscriptionStatus;
									},
									onSettled: function() {
										persistBillingReturnFlash(buildBillingReturnNotice(returnStatus));
										window.location.replace(buildCleanBillingReturnUrl());
									},
									onFailure: function() {
										persistBillingReturnFlash({
											kind: 'warning',
											message: '<?php echo esc_js( __( 'AiVI recorded your billing return, but the upgraded plan is still syncing. Reload once more if the new plan and credits do not appear right away.', 'ai-visibility-inspector' ) ); ?>'
										});
										window.location.replace(buildCleanBillingReturnUrl());
									},
									onTimeout: function() {
										persistBillingReturnFlash({
											kind: 'warning',
											message: '<?php echo esc_js( __( 'AiVI recorded your billing return, but the upgraded plan is still syncing. Reload once more if the new plan and credits do not appear right away.', 'ai-visibility-inspector' ) ); ?>'
										});
										window.location.replace(buildCleanBillingReturnUrl());
									}
								});
								return;
							}

							pollPendingBillingState(restBase, summaryEndpoint, nonce, {
								maxAttempts: 12,
								intervalMs: 4000,
								isSettled: function(response) {
									var credits = getSummaryCreditSnapshot(response);
									return credits.topupRemaining > currentCreditSnapshot.topupRemaining || credits.totalRemaining > currentCreditSnapshot.totalRemaining;
								},
								onSettled: function() {
									persistBillingReturnFlash(buildBillingReturnNotice('topup_credited'));
									window.location.replace(buildCleanBillingReturnUrl());
								},
								onFailure: function() {
									persistBillingReturnFlash({
										kind: 'warning',
										message: '<?php echo esc_js( __( 'AiVI recorded your billing return. Your credit balance may take a few more seconds to update. Reload once more if the updated credits do not appear right away.', 'ai-visibility-inspector' ) ); ?>'
									});
									window.location.replace(buildCleanBillingReturnUrl());
								},
								onTimeout: function() {
									persistBillingReturnFlash({
										kind: 'warning',
										message: '<?php echo esc_js( __( 'AiVI recorded your billing return. Your credit balance may take a few more seconds to update. Reload once more if the updated credits do not appear right away.', 'ai-visibility-inspector' ) ); ?>'
									});
									window.location.replace(buildCleanBillingReturnUrl());
								}
							});
						}, 2500);
					})
					.fail(function() {
						persistBillingReturnFlash({
							kind: 'error',
							message: '<?php echo esc_js( __( 'AiVI could not sync your updated billing state automatically. Reload the page in a moment.', 'ai-visibility-inspector' ) ); ?>'
						});
						window.location.replace(buildCleanBillingReturnUrl());
					});
			}

			$('#aivi-test-connection').on('click', function() {
				var $button = $(this);
				var $result = $('#aivi-test-result');

				$button.prop('disabled', true);
				$result.hide().removeClass('notice-success notice-error');

				$.ajax({
					url: ajaxurl,
					type: 'POST',
					data: {
						action: 'aivi_test_connection',
						nonce: '<?php echo wp_create_nonce( 'aivi_test_connection' ); ?>'
					},
					success: function(response) {
						if (response.success) {
							$result.addClass('notice-success').html('<p>' + response.data.message + '</p>');
						} else {
							$result.addClass('notice-error').html('<p>' + response.data.message + '</p>');
						}
					},
					error: function() {
						$result.addClass('notice-error').html('<p><?php esc_html_e( 'Connection test failed. Please check your settings.', 'ai-visibility-inspector' ); ?></p>');
					},
					complete: function() {
						$button.prop('disabled', false);
						$result.show();
					}
				});
			});

			function getTrialEmailModal() {
				return $('[data-aivi-trial-email-modal="true"]');
			}

			function closeTrialEmailModal() {
				var $modal = getTrialEmailModal();
				$modal.removeClass('is-open').attr('aria-hidden', 'true').removeData('pendingButton');
			}

			function openTrialEmailModal($button) {
				var $modal = getTrialEmailModal();
				if (!$modal.length) {
					return false;
				}
				$modal.data('pendingButton', $button && $button.length ? $button.get(0) : null);
				$modal.addClass('is-open').attr('aria-hidden', 'false');
				window.setTimeout(function() {
					$modal.find('[data-aivi-trial-email-input="true"]').trigger('focus').trigger('select');
				}, 20);
				return true;
			}

			function submitAccountAction(action, $button, payload) {
				var cfg = getSettingsApiConfig();
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var endpoint = resolveOnboardingEndpoint(action);
				var $result = $('#aivi-billing-result');
				var requestBody = payload && typeof payload === 'object' ? payload : {};

				if (!restBase || !endpoint || !nonce) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'AiVI onboarding is not ready on this site yet.', 'ai-visibility-inspector' ) ); ?>');
					return false;
				}

				if ($button.prop('disabled')) {
					return false;
				}

				$button.addClass('is-busy').prop('disabled', true);
				setInlineNotice($result, 'warning', action === 'start_trial'
					? '<?php echo esc_js( __( 'Starting your AiVI free trial...', 'ai-visibility-inspector' ) ); ?>'
					: '<?php echo esc_js( __( 'Preparing your AiVI account...', 'ai-visibility-inspector' ) ); ?>'
				);

				$.ajax({
					url: restBase + endpoint,
					type: 'POST',
					contentType: 'application/json',
					headers: {
						'X-WP-Nonce': nonce
					},
					data: JSON.stringify(requestBody),
					success: function(response) {
						var message = response && response.message ? response.message : '<?php echo esc_js( __( 'AiVI account updated successfully.', 'ai-visibility-inspector' ) ); ?>';
						persistBillingReturnFlash({
							kind: 'success',
							message: message
						});
						window.location.assign(buildSettingsTabUrl('overview'));
					},
					error: function(xhr) {
						var fallbackMessage = action === 'start_trial'
							? '<?php echo esc_js( __( 'AiVI could not start the free trial for this site.', 'ai-visibility-inspector' ) ); ?>'
							: '<?php echo esc_js( __( 'AiVI could not prepare the account for this site.', 'ai-visibility-inspector' ) ); ?>';
						var message = getRestErrorMessage(xhr, fallbackMessage);
						setInlineNotice($result, 'error', message);
					},
					complete: function() {
						$button.removeClass('is-busy').prop('disabled', false);
					}
				});

				return true;
			}

			$('[data-aivi-trial-email-cancel="true"]').on('click', function() {
				closeTrialEmailModal();
			});

			$('[data-aivi-trial-email-modal="true"]').on('click', function(event) {
				if (event.target === this) {
					closeTrialEmailModal();
				}
			});

			$(document).on('keydown', function(event) {
				if (event.key === 'Escape') {
					closeTrialEmailModal();
				}
			});

			$('[data-aivi-trial-email-submit="true"]').on('click', function() {
				var $modal = getTrialEmailModal();
				var $result = $('#aivi-billing-result');
				var email = String($modal.find('[data-aivi-trial-email-input="true"]').val() || '').trim();
				var pendingButton = $modal.data('pendingButton');
				var $button = pendingButton ? $(pendingButton) : $('.aivi-account-action[data-account-action="start_trial"]').first();
				var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

				if (!emailPattern.test(email)) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'Add a valid contact email before starting the free trial.', 'ai-visibility-inspector' ) ); ?>');
					$modal.find('[data-aivi-trial-email-input="true"]').trigger('focus');
					return;
				}

				closeTrialEmailModal();
				submitAccountAction('start_trial', $button, {
					contact_email: email
				});
			});

			$('.aivi-account-action').on('click', function() {
				var action = String($(this).data('accountAction') || '').trim();
				var $button = $(this);

				if (action === 'start_trial' && openTrialEmailModal($button)) {
					return;
				}

				submitAccountAction(action, $button, {});
			});

			$('[data-account-connect-submit]').on('submit', function(event) {
				event.preventDefault();

				var cfg = getSettingsApiConfig();
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var endpoint = resolveConnectionEndpoint('connect');
				var $form = $(this);
				var $button = $form.find('.aivi-connection-action[type="submit"]');
				var $result = $('#aivi-billing-result');
				var connectionToken = String($form.find('[name="connection_token"]').val() || '').trim();
				var connectionLabel = String($form.find('[name="connection_label"]').val() || '').trim();

				if (!connectionToken) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'Paste a connection token before trying to connect this site.', 'ai-visibility-inspector' ) ); ?>');
					return;
				}

				if (!restBase || !endpoint || !nonce) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'AiVI account connection is not ready on this site yet.', 'ai-visibility-inspector' ) ); ?>');
					return;
				}

				if ($button.prop('disabled')) {
					return;
				}

				$button.addClass('is-busy').prop('disabled', true);
				setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'Connecting this site to your AiVI account...', 'ai-visibility-inspector' ) ); ?>');

				$.ajax({
					url: restBase + endpoint,
					type: 'POST',
					contentType: 'application/json',
					headers: {
						'X-WP-Nonce': nonce
					},
					data: JSON.stringify({
						connection_token: connectionToken,
						connection_label: connectionLabel
					}),
					success: function(response) {
						var message = response && response.message ? response.message : '<?php echo esc_js( __( 'This site is now connected to AiVI.', 'ai-visibility-inspector' ) ); ?>';
						persistBillingReturnFlash({
							kind: 'success',
							message: message
						});
						window.location.assign(buildSettingsTabUrl('connection'));
					},
					error: function(xhr) {
						setInlineNotice($result, 'error', getRestErrorMessage(xhr, '<?php echo esc_js( __( 'AiVI could not connect this site with that token.', 'ai-visibility-inspector' ) ); ?>'));
					},
					complete: function() {
						$button.removeClass('is-busy').prop('disabled', false);
					}
				});
			});

			$('.aivi-connection-action[data-connection-action="disconnect"]').on('click', function() {
				var cfg = getSettingsApiConfig();
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var endpoint = resolveConnectionEndpoint('disconnect');
				var $button = $(this);
				var $result = $('#aivi-billing-result');

				if (!window.confirm('<?php echo esc_js( __( 'Disconnect this site from its current AiVI account? Other connected sites on the same account will stay attached.', 'ai-visibility-inspector' ) ); ?>')) {
					return;
				}

				if (!restBase || !endpoint || !nonce) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'AiVI site disconnect is not ready on this site yet.', 'ai-visibility-inspector' ) ); ?>');
					return;
				}

				if ($button.prop('disabled')) {
					return;
				}

				$button.addClass('is-busy').prop('disabled', true);
				setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'Disconnecting this site from AiVI...', 'ai-visibility-inspector' ) ); ?>');

				$.ajax({
					url: restBase + endpoint,
					type: 'POST',
					contentType: 'application/json',
					headers: {
						'X-WP-Nonce': nonce
					},
					data: JSON.stringify({
						notify_backend: true
					}),
					success: function(response) {
						var message = response && response.message ? response.message : '<?php echo esc_js( __( 'This site is now disconnected from AiVI.', 'ai-visibility-inspector' ) ); ?>';
						persistBillingReturnFlash({
							kind: 'success',
							message: message
						});
						window.location.assign(buildSettingsTabUrl('connection'));
					},
					error: function(xhr) {
						setInlineNotice($result, 'error', getRestErrorMessage(xhr, '<?php echo esc_js( __( 'AiVI could not disconnect this site right now.', 'ai-visibility-inspector' ) ); ?>'));
					},
					complete: function() {
						$button.removeClass('is-busy').prop('disabled', false);
					}
				});
			});

			var $issuedTokenInput = $('[data-aivi-issued-token-input="true"]');
			if ($issuedTokenInput.length) {
				var maskedToken = String($issuedTokenInput.data('tokenMasked') || '');
				if (maskedToken) {
					$issuedTokenInput.val(maskedToken);
				}
				$('[data-aivi-issued-token-toggle="true"]').on('click', function() {
					var $button = $(this);
					var showingRaw = $button.data('showingRaw') === true;
					var rawToken = String($issuedTokenInput.data('tokenRaw') || '');
					var nextRawState = !showingRaw;
					$issuedTokenInput.attr('type', nextRawState ? 'text' : 'password');
					$issuedTokenInput.val(nextRawState ? rawToken : maskedToken);
					$button.data('showingRaw', nextRawState).text(nextRawState ? '<?php echo esc_js( __( 'Hide', 'ai-visibility-inspector' ) ); ?>' : '<?php echo esc_js( __( 'Show', 'ai-visibility-inspector' ) ); ?>');
				});
				$('[data-aivi-issued-token-copy="true"]').on('click', function() {
					var rawToken = String($issuedTokenInput.data('tokenRaw') || '');
					if (!rawToken) {
						return;
					}
					if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
						navigator.clipboard.writeText(rawToken);
					} else {
						$issuedTokenInput.attr('type', 'text').val(rawToken).trigger('focus').trigger('select');
						document.execCommand('copy');
					}
					setInlineNotice($('#aivi-billing-result'), 'success', '<?php echo esc_js( __( 'Connection token copied. Paste it into the next site within seven days.', 'ai-visibility-inspector' ) ); ?>');
				});
			}

			$('.aivi-billing-action').on('click', function() {
				var cfg = getSettingsApiConfig();
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var action = String($(this).data('billingAction') || '').trim();
				var endpoint = resolveBillingEndpoint(action);
				var $button = $(this);
				var $result = $('#aivi-billing-result');
				var payload = {};
				var planTransition = String($button.data('planTransition') || '').trim();
				var subscriptionStatus = String($button.data('subscriptionStatus') || '').trim();

				if (!restBase || !endpoint || !nonce) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'AiVI billing is not ready on this site yet.', 'ai-visibility-inspector' ) ); ?>');
					return;
				}

				if ($button.prop('disabled')) {
					return;
				}

				if (action === 'plan_change_info') {
					var planChangeMessage = '<?php echo esc_js( __( 'Downgrades take effect at your next renewal so your current paid access stays active until the cycle ends.', 'ai-visibility-inspector' ) ); ?>';
					if (subscriptionStatus === 'created') {
						planChangeMessage = '<?php echo esc_js( __( 'Wait for the current subscription to finish activating before changing plans. AiVI will sync the new state automatically.', 'ai-visibility-inspector' ) ); ?>';
					}
					setInlineNotice($result, 'warning', planChangeMessage);
					return;
				}

				if (action === 'subscribe') {
					payload.plan_code = String($button.data('planCode') || '').trim();
				} else if (action === 'topup') {
					payload.topup_pack_code = String($button.data('topupPackCode') || '').trim();
				}

				$button.addClass('is-busy').prop('disabled', true);
				setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'Opening secure PayPal checkout...', 'ai-visibility-inspector' ) ); ?>');

				$.ajax({
					url: restBase + endpoint,
					type: 'POST',
					contentType: 'application/json',
					headers: {
						'X-WP-Nonce': nonce
					},
					data: JSON.stringify(payload),
					success: function(response) {
						var checkout = response && response.checkout && typeof response.checkout === 'object' ? response.checkout : null;
						var approvalUrl = checkout && typeof checkout.approval_url === 'string' ? checkout.approval_url : '';
						if (approvalUrl) {
							window.open(approvalUrl, '_blank', 'noopener,noreferrer');
							setInlineNotice($result, 'success', '<?php echo esc_js( __( 'PayPal checkout opened in a new tab. Complete checkout there, then return here to refresh your plan and credits.', 'ai-visibility-inspector' ) ); ?>');
							return;
						}

						var message = response && response.message ? response.message : '<?php echo esc_js( __( 'Billing action is not available yet for this account state.', 'ai-visibility-inspector' ) ); ?>';
						setInlineNotice($result, 'warning', message);
					},
					error: function(xhr) {
						var message = '<?php echo esc_js( __( 'AiVI billing could not open a hosted checkout right now.', 'ai-visibility-inspector' ) ); ?>';
						if (xhr && xhr.responseJSON) {
							if (xhr.responseJSON.message) {
								message = xhr.responseJSON.message;
							} else if (xhr.responseJSON.data && xhr.responseJSON.data.body) {
								message = xhr.responseJSON.data.body;
							}
						}
						setInlineNotice($result, 'error', message);
					},
					complete: function() {
						$button.removeClass('is-busy').prop('disabled', false);
					}
				});
			});

			triggerBillingReturnRefresh();
			triggerPendingBillingStatusRefresh();
		});
		</script>
		<?php
	}

	/**
	 * Render the customer dashboard overview.
	 *
	 * @param array $dashboard_state Normalized dashboard state.
	 * @param array $site_identity Site identity payload.
	 * @return void
	 */
	private static function render_customer_dashboard_panel( $dashboard_state, $site_identity ) {
		$account_state = self::get_account_state();
		$dashboard_state = self::maybe_refresh_pending_dashboard_state( $dashboard_state, $account_state, $site_identity );
		$account_state = self::get_account_state();
		$billing_catalog = self::get_public_billing_catalog();
		$billing_enabled = defined( 'AIVI_BILLING_READY' ) ? (bool) AIVI_BILLING_READY : false;
		$is_connected = ! empty( $account_state['connected'] ) && ( $account_state['connection_status'] ?? '' ) === 'connected';
		$display_state = sanitize_text_field( (string) ( $dashboard_state['account']['display_state'] ?? 'disconnected' ) );
		$badge_class = 'aivi-dashboard-badge--' . esc_attr( $display_state );
		$total_credits = self::format_dashboard_metric_value( $dashboard_state['credits']['total_remaining'] ?? null, __( 'Not synced yet', 'ai-visibility-inspector' ) );
		$included_credits = self::format_dashboard_metric_value( $dashboard_state['credits']['included_remaining'] ?? null, __( 'Not synced yet', 'ai-visibility-inspector' ) );
		$topup_credits = self::format_dashboard_metric_value( $dashboard_state['credits']['topup_remaining'] ?? null, __( 'Not synced yet', 'ai-visibility-inspector' ) );
		$last_run_debit = self::format_dashboard_metric_value( $dashboard_state['credits']['last_run_debit'] ?? null, __( 'No completed run yet', 'ai-visibility-inspector' ) );
		$analyses_this_month = self::format_dashboard_metric_value( $dashboard_state['usage']['analyses_this_month'] ?? null, __( 'Waiting for usage sync', 'ai-visibility-inspector' ) );
		$credits_used_this_month = self::format_dashboard_metric_value( $dashboard_state['usage']['credits_used_this_month'] ?? null, __( 'Waiting for usage sync', 'ai-visibility-inspector' ) );
		$last_analysis_at = self::format_account_sync_time( $dashboard_state['usage']['last_analysis_at'] ?? '' );
		$last_run_status = self::humanize_dashboard_status( $dashboard_state['usage']['last_run_status'] ?? '', __( 'Not available', 'ai-visibility-inspector' ) );
		$plan_name = self::format_dashboard_text_value( $dashboard_state['plan']['plan_name'] ?? '', __( 'No plan linked yet', 'ai-visibility-inspector' ) );
		$subscription_status = self::humanize_dashboard_status( $dashboard_state['plan']['subscription_status'] ?? '', __( 'Not available', 'ai-visibility-inspector' ) );
		$trial_status = self::humanize_dashboard_status( $dashboard_state['plan']['trial_status'] ?? '', __( 'Not available', 'ai-visibility-inspector' ) );
		$trial_status_display = self::get_customer_trial_status_label(
			$dashboard_state['plan']['trial_status'] ?? '',
			$dashboard_state['plan']['subscription_status'] ?? ''
		);
		$last_sync = self::format_account_sync_time( $dashboard_state['account']['last_sync_at'] ?? '' );
		$connected_domain = self::resolve_dashboard_domain( $dashboard_state, $site_identity );
		$binding_status = self::humanize_dashboard_status( $dashboard_state['site']['binding_status'] ?? '', __( 'Not available', 'ai-visibility-inspector' ) );
		$docs_url = $dashboard_state['support']['docs_url'] ?? '';
		$billing_url = $dashboard_state['support']['billing_url'] ?? '';
		$support_url = $dashboard_state['support']['support_url'] ?? '';
		$help_label = self::format_dashboard_text_value( $dashboard_state['support']['help_label'] ?? '', __( 'AiVI Support', 'ai-visibility-inspector' ) );
		$support_provider = sanitize_text_field( (string) ( $dashboard_state['support']['provider'] ?? '' ) );
		$support_zoho_asap = is_array( $dashboard_state['support']['zoho_asap'] ?? null ) ? $dashboard_state['support']['zoho_asap'] : array();
		$support_has_zoho_asap = 'zoho_desk_asap' === $support_provider
			&& ! empty( $support_zoho_asap['widget_snippet_url'] )
			&& ! empty( $support_zoho_asap['department_id'] )
			&& ! empty( $support_zoho_asap['layout_id'] );
		$support_portal_host = wp_parse_url( $support_url, PHP_URL_HOST );
		$support_portal_host = sanitize_text_field( is_string( $support_portal_host ) ? $support_portal_host : '' );
		if ( '' === $support_portal_host ) {
			$support_portal_host = __( 'Support setup pending', 'ai-visibility-inspector' );
		}
		$support_contact_email = self::get_preferred_contact_email();
		$support_contact_email = '' !== $support_contact_email ? $support_contact_email : __( 'Add a contact email first', 'ai-visibility-inspector' );
		$support_plugin_version = defined( 'AIVI_VERSION' ) ? AIVI_VERSION : '1.0.0';
		$support_wp_version = get_bloginfo( 'version' );
		$current_plan_code = sanitize_text_field( (string) ( $dashboard_state['plan']['plan_code'] ?? $account_state['plan_code'] ?? '' ) );
		$current_subscription_status_code = strtolower( sanitize_text_field( (string) ( $dashboard_state['plan']['subscription_status'] ?? $account_state['subscription_status'] ?? '' ) ) );
		$can_show_topups = self::can_show_dashboard_topups( $dashboard_state, $account_state );
		$billing_status_message = self::get_dashboard_billing_status_message( $dashboard_state, $billing_enabled, $is_connected );
		$billing_status_tone = sanitize_html_class( $billing_status_message['tone'] );
		$plan_entries = is_array( $billing_catalog['plans'] ?? null ) ? $billing_catalog['plans'] : array();
		$topup_entries = is_array( $billing_catalog['topups'] ?? null ) ? $billing_catalog['topups'] : array();
		$trial_catalog = is_array( $billing_catalog['trial'] ?? null ) ? $billing_catalog['trial'] : array();
		$account_label = self::format_dashboard_text_value( $dashboard_state['account']['account_label'] ?? '', __( 'No account linked yet', 'ai-visibility-inspector' ) );
		$max_sites = self::format_dashboard_metric_value( $dashboard_state['plan']['max_sites'] ?? null, __( 'Not set', 'ai-visibility-inspector' ) );
		$site_id = sanitize_text_field( (string) ( $dashboard_state['site']['site_id'] ?? '' ) );
		$support_site_id = '' !== $site_id ? $site_id : __( 'Pending site ID', 'ai-visibility-inspector' );
		$support_field_map = array();
		if ( is_array( $support_zoho_asap['field_map'] ?? null ) ) {
			foreach ( $support_zoho_asap['field_map'] as $key => $value ) {
				$normalized_key   = sanitize_key( (string) $key );
				$normalized_value = sanitize_text_field( (string) $value );
				if ( '' !== $normalized_key && '' !== $normalized_value ) {
					$support_field_map[ $normalized_key ] = $normalized_value;
				}
			}
		}
		$support_channel_label = $support_has_zoho_asap
			? __( 'Zoho Desk', 'ai-visibility-inspector' )
			: $support_portal_host;
		$support_center_config = array(
			'provider' => $support_provider,
			'support_url' => esc_url_raw( $support_url ),
			'zoho_asap' => array(
				'widget_snippet_url' => esc_url_raw( (string) ( $support_zoho_asap['widget_snippet_url'] ?? '' ) ),
				'department_id' => sanitize_text_field( (string) ( $support_zoho_asap['department_id'] ?? '' ) ),
				'layout_id' => sanitize_text_field( (string) ( $support_zoho_asap['layout_id'] ?? '' ) ),
				'ticket_title' => sanitize_text_field( (string) ( $support_zoho_asap['ticket_title'] ?? __( 'AiVI Support', 'ai-visibility-inspector' ) ) ),
				'field_map' => $support_field_map,
			),
			'context' => array(
				'account_label' => $account_label,
				'plan_name' => $plan_name,
				'email' => $support_contact_email,
				'connected_domain' => $connected_domain,
				'site_id' => $support_site_id,
				'site_url' => esc_url_raw( (string) ( $site_identity['home_url'] ?? '' ) ),
				'plugin_version' => $support_plugin_version,
				'wp_version' => $support_wp_version,
			),
		);
		$blog_id = self::format_dashboard_metric_value( $dashboard_state['site']['blog_id'] ?? null, __( 'Not available', 'ai-visibility-inspector' ) );
		$requested_settings_tab    = sanitize_key( (string) ( $_GET['aivi_tab'] ?? '' ) );
		$requested_support_category = sanitize_key( (string) ( $_GET['aivi_support_category'] ?? '' ) );
		$requested_doc_slug         = sanitize_key( (string) ( $_GET['aivi_doc'] ?? '' ) );
		$documentation_catalog      = self::get_documentation_catalog();
		$requested_doc_slug         = self::normalize_documentation_slug( $requested_doc_slug );
		if ( ! in_array( $requested_settings_tab, array( 'overview', 'billing', 'credits', 'connection', 'support', 'documentation' ), true ) ) {
			$requested_settings_tab = 'overview';
		}
		if ( ! in_array( $requested_support_category, array( 'billing', 'connection', 'analysis', 'general' ), true ) ) {
			$requested_support_category = 'billing';
		}
		if ( 'credits' === $requested_settings_tab && ! $can_show_topups ) {
			$requested_settings_tab = 'billing';
		}
		$settings_page_base_url = add_query_arg(
			array(
				'page' => self::PAGE_SLUG,
			),
			admin_url( 'admin.php' )
		);
		$settings_tab_urls = array(
			'overview'   => add_query_arg( 'aivi_tab', 'overview', $settings_page_base_url ) . '#aivi-settings-tab-overview',
			'billing'    => add_query_arg( 'aivi_tab', 'billing', $settings_page_base_url ) . '#aivi-billing-plans',
			'credits'    => add_query_arg( 'aivi_tab', 'credits', $settings_page_base_url ) . '#aivi-billing-topups',
			'connection' => add_query_arg( 'aivi_tab', 'connection', $settings_page_base_url ) . '#aivi-settings-tab-connection',
			'support'    => add_query_arg(
				array(
					'aivi_tab'              => 'support',
					'aivi_support_category' => $requested_support_category,
				),
				$settings_page_base_url
			) . '#aivi-settings-tab-support',
			'documentation' => add_query_arg(
				array(
					'aivi_tab' => 'documentation',
					'aivi_doc' => $requested_doc_slug,
				),
				$settings_page_base_url
			) . '#aivi-doc-' . $requested_doc_slug,
		);
		$documentation_entry_urls = array();
		foreach ( $documentation_catalog as $doc_slug => $doc_entry ) {
			$documentation_entry_urls[ $doc_slug ] = add_query_arg(
				array(
					'aivi_tab' => 'documentation',
					'aivi_doc' => $doc_slug,
				),
				$settings_page_base_url
			) . '#aivi-doc-' . $doc_slug;
		}
		$support_category_urls = array(
			'billing'    => add_query_arg(
				array(
					'aivi_tab'              => 'support',
					'aivi_support_category' => 'billing',
				),
				$settings_page_base_url
			) . '#aivi-settings-tab-support',
			'connection' => add_query_arg(
				array(
					'aivi_tab'              => 'support',
					'aivi_support_category' => 'connection',
				),
				$settings_page_base_url
			) . '#aivi-settings-tab-support',
			'analysis'   => add_query_arg(
				array(
					'aivi_tab'              => 'support',
					'aivi_support_category' => 'analysis',
				),
				$settings_page_base_url
			) . '#aivi-settings-tab-support',
			'general'    => add_query_arg(
				array(
					'aivi_tab'              => 'support',
					'aivi_support_category' => 'general',
				),
				$settings_page_base_url
			) . '#aivi-settings-tab-support',
		);
		$support_category_is_billing    = 'billing' === $requested_support_category;
		$support_category_is_connection = 'connection' === $requested_support_category;
		$support_category_is_analysis   = 'analysis' === $requested_support_category;
		$support_category_is_general    = 'general' === $requested_support_category;
		$support_category_configs       = array(
			'billing'    => array(
				'key'                => 'billing',
				'title'              => __( 'Billing & Plans', 'ai-visibility-inspector' ),
				'subtitle'           => __( 'Credits, invoices, renewals', 'ai-visibility-inspector' ),
				'subject'            => __( 'Question about renewal and credit balance', 'ai-visibility-inspector' ),
				'category_label'     => __( 'Billing & Plans', 'ai-visibility-inspector' ),
				'priority'           => __( 'Normal', 'ai-visibility-inspector' ),
				'message'            => __( 'I expected the renewed plan balance to sync immediately, but the dashboard still shows the previous total.', 'ai-visibility-inspector' ),
				'context_link_label' => ! empty( $billing_url ) ? __( 'Billing guide', 'ai-visibility-inspector' ) : __( 'Documentation', 'ai-visibility-inspector' ),
				'context_link_url'   => ! empty( $billing_url ) ? $billing_url : $documentation_entry_urls['user-guide'],
			),
			'connection' => array(
				'key'                => 'connection',
				'title'              => __( 'Connection & Setup', 'ai-visibility-inspector' ),
				'subtitle'           => __( 'Binding, reconnect, tokens', 'ai-visibility-inspector' ),
				'subject'            => __( 'Need help reconnecting or using a connection token', 'ai-visibility-inspector' ),
				'category_label'     => __( 'Connection & Setup', 'ai-visibility-inspector' ),
				'priority'           => __( 'Normal', 'ai-visibility-inspector' ),
				'message'            => __( 'This site needs help with connection state, reconnect flow, or a multi-site token handoff.', 'ai-visibility-inspector' ),
				'context_link_label' => __( 'Open connection tab', 'ai-visibility-inspector' ),
				'context_link_url'   => $settings_tab_urls['connection'],
			),
			'analysis'   => array(
				'key'                => 'analysis',
				'title'              => __( 'Analysis & Results', 'ai-visibility-inspector' ),
				'subtitle'           => __( 'Runs, reports, scores', 'ai-visibility-inspector' ),
				'subject'            => __( 'Question about analysis output or score movement', 'ai-visibility-inspector' ),
				'category_label'     => __( 'Analysis & Results', 'ai-visibility-inspector' ),
				'priority'           => __( 'Normal', 'ai-visibility-inspector' ),
				'message'            => __( 'I need help understanding a recent result, score shift, or analysis behavior on this site.', 'ai-visibility-inspector' ),
				'context_link_label' => __( 'Documentation', 'ai-visibility-inspector' ),
				'context_link_url'   => $documentation_entry_urls['troubleshooting'],
			),
			'general'    => array(
				'key'                => 'general',
				'title'              => __( 'General Support', 'ai-visibility-inspector' ),
				'subtitle'           => __( 'Anything else', 'ai-visibility-inspector' ),
				'subject'            => __( 'Need help with something else in AiVI', 'ai-visibility-inspector' ),
				'category_label'     => __( 'General Support', 'ai-visibility-inspector' ),
				'priority'           => __( 'Normal', 'ai-visibility-inspector' ),
				'message'            => __( 'I need help with a question that does not fit billing, connection, or analysis.', 'ai-visibility-inspector' ),
				'context_link_label' => __( 'Documentation', 'ai-visibility-inspector' ),
				'context_link_url'   => $documentation_entry_urls['user-guide'],
			),
		);
		$current_support_category_config = $support_category_configs[ $requested_support_category ];
		$connection_tab_href = $settings_tab_urls['connection'];
		$billing_tab_href    = $settings_tab_urls['billing'];
		$credits_tab_href    = $settings_tab_urls['credits'];
		$support_tab_href    = $settings_tab_urls['support'];
		$documentation_tab_href = $settings_tab_urls['documentation'];
		$documentation_groups = self::get_documentation_groups();
		$trial_label = self::format_dashboard_text_value( $trial_catalog['label'] ?? '', __( 'Free Trial', 'ai-visibility-inspector' ) );
		$trial_credits = self::format_dashboard_metric_value( $trial_catalog['included_credits'] ?? AIVI_TRIAL_CREDITS, '0' );
		$trial_days = self::format_dashboard_metric_value( $trial_catalog['duration_days'] ?? AIVI_TRIAL_DAYS, '0' );
		$trial_sites = self::format_dashboard_metric_value( $trial_catalog['site_limit'] ?? 1, '1' );
		$trial_status_code = strtolower( sanitize_text_field( (string) ( $dashboard_state['plan']['trial_status'] ?? $account_state['trial_status'] ?? '' ) ) );
		$trial_is_active = 'active' === $trial_status_code || 'free_trial' === $current_plan_code;
		$trial_has_been_used = in_array( $trial_status_code, array( 'converted', 'ended' ), true ) || in_array( $current_plan_code, AIVI_PLAN_CODES, true ) || in_array( $current_subscription_status_code, array( 'active', 'created' ), true );
		$trial_is_available = ! $trial_is_active && ! $trial_has_been_used;
		$trial_button_label = __( 'Start free trial', 'ai-visibility-inspector' );
		if ( $trial_is_active ) {
			$trial_button_label = __( 'Trial active', 'ai-visibility-inspector' );
		} elseif ( $trial_has_been_used ) {
			$trial_button_label = __( 'Trial used', 'ai-visibility-inspector' );
		}
		$max_sites_limit = (int) ( $dashboard_state['plan']['max_sites'] ?? $account_state['entitlements']['max_sites'] ?? 0 );
		$multi_site_enabled = $max_sites_limit > 1;
		$site_limit_reached = ! empty( $account_state['entitlements']['site_limit_reached'] ) || 'limit_reached' === strtolower( (string) ( $account_state['site_binding_status'] ?? '' ) );
		$connected_sites = is_array( $dashboard_state['connection']['connected_sites'] ?? null ) ? $dashboard_state['connection']['connected_sites'] : array();
		$site_slots_used = (int) ( $dashboard_state['connection']['site_slots_used'] ?? count( $connected_sites ) );
		$site_slots_total = (int) ( $dashboard_state['connection']['site_slots_total'] ?? $max_sites_limit );
		$latest_connection_token = is_array( $dashboard_state['connection']['latest_connection_token'] ?? null ) ? $dashboard_state['connection']['latest_connection_token'] : array();
		$latest_connection_token_status = strtolower( sanitize_text_field( (string) ( $latest_connection_token['status'] ?? 'none' ) ) );
		$latest_connection_token_available = 'active' === $latest_connection_token_status && ! empty( $latest_connection_token['token'] );
		?>
		<style>
			.aivi-settings-shell{margin:18px 0 22px;padding:26px;background:linear-gradient(180deg,#f7f8fc 0%,#ffffff 100%);border:1px solid #d8deea;border-radius:22px;box-shadow:0 16px 44px rgba(15,23,42,.05);}
			.aivi-settings-shell *{box-sizing:border-box;}
			.aivi-settings-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:20px;padding:24px 24px 20px;border:1px solid #e4ddfb;border-radius:20px;background:linear-gradient(135deg,#f7f4ff 0%,#fbfbfe 62%,#ffffff 100%);}
			.aivi-settings-hero__eyebrow,.aivi-settings-section__eyebrow{display:block;margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6a7d94;}
			.aivi-settings-hero__title{margin:0;font-size:32px;line-height:1.04;font-weight:800;color:#10233f;letter-spacing:-.03em;}
			.aivi-settings-hero__desc{margin:10px 0 0;max-width:760px;font-size:14px;line-height:1.7;color:#516175;}
			.aivi-dashboard-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid transparent;background:#f4f7fb;color:#41556f;text-transform:uppercase;letter-spacing:.04em;}
			.aivi-dashboard-badge::before{content:'';width:8px;height:8px;border-radius:50%;background:currentColor;}
			.aivi-dashboard-badge--active,.aivi-dashboard-badge--connected{background:#edf9f3;border-color:#bfe4cc;color:#17633f;}
			.aivi-dashboard-badge--trial,.aivi-dashboard-badge--pending{background:#fff7e8;border-color:#f3d499;color:#8a5a00;}
			.aivi-dashboard-badge--attention_required,.aivi-dashboard-badge--revoked,.aivi-dashboard-badge--error{background:#fff1f2;border-color:#f2c2c7;color:#a12f41;}
			.aivi-settings-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid #e4ddc4;}
			.aivi-settings-tab{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;margin-bottom:-11px;border:1px solid #d5dbea;border-bottom-color:#dde4ef;border-radius:14px 14px 0 0;background:#f5f7fb;color:#526170;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;transition:all .16s ease;}
			.aivi-settings-tab:hover{background:#fff;color:#10233f;}
			.aivi-settings-tab.is-active{background:#fff;color:#10233f;border-color:#ddd6b8;border-bottom-color:#fff;position:relative;z-index:2;box-shadow:inset 0 3px 0 #d2a33a,0 -1px 0 rgba(255,255,255,.85),0 10px 24px rgba(15,23,42,.04);}
			.aivi-settings-tab__badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:2px 8px;border-radius:999px;background:#fff7e3;color:#946800;border:1px solid #ead193;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
			.aivi-billing-result{margin:0 0 18px;display:none;}
			.aivi-settings-section{display:none;padding:24px;border:1px solid #d8deea;border-radius:0 18px 18px 18px;background:#fff;box-shadow:0 14px 32px rgba(15,23,42,.04);}
			.aivi-settings-section.is-active{display:block;}
			.aivi-settings-section__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
			.aivi-settings-section__title{margin:0;font-size:24px;line-height:1.15;font-weight:700;color:#10233f;}
			.aivi-settings-section__desc{margin:8px 0 0;max-width:760px;font-size:14px;line-height:1.65;color:#516175;}
			.aivi-settings-meta{display:inline-flex;align-items:center;padding:10px 12px;border:1px solid #e7d6a4;border-radius:999px;background:#fffaf0;color:#8a6702;font-size:13px;font-weight:700;}
			.aivi-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}
			.aivi-settings-grid--two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));}
			.aivi-settings-card{position:relative;overflow:hidden;padding:18px;border:1px solid #e4ebf5;border-radius:16px;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);box-shadow:0 10px 24px rgba(15,23,42,.04);}
			.aivi-settings-card::before{content:'';position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,#d2a33a 0%,rgba(210,163,58,0) 82%);}
			.aivi-settings-card__title{margin:0 0 10px;font-size:20px;line-height:1.2;font-weight:700;color:#10233f;}
			.aivi-settings-card__value{font-size:28px;line-height:1;font-weight:800;color:#10233f;margin-bottom:10px;}
			.aivi-settings-card__meta,.aivi-settings-list{margin:0;padding:0;list-style:none;color:#516175;font-size:13px;line-height:1.65;}
			.aivi-settings-list li + li{margin-top:6px;}
			.aivi-settings-card__hint{margin:10px 0 0;font-size:13px;line-height:1.55;color:#516175;}
			.aivi-settings-card__status{margin:12px 0 0;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.55;border:1px solid #d9e4f2;background:#f8fbff;color:#33506f;}
			.aivi-dashboard-card__status--success{background:#edf9f3;border-color:#bfe4cc;color:#17633f;}
			.aivi-dashboard-card__status--warning{background:#fff7e8;border-color:#f3d499;color:#8a5a00;}
			.aivi-dashboard-card__status--danger{background:#fff1f2;border-color:#f2c2c7;color:#a12f41;}
			.aivi-settings-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;}
			.aivi-dashboard-card__pill{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:#eef4ff;color:#214d9c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
			.aivi-settings-offer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:12px;}
			.aivi-dashboard-offer{display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #dbe6f3;border-radius:18px;background:#fbfdff;box-shadow:0 10px 24px rgba(15,23,42,.04);}
			.aivi-dashboard-offer--current{border-color:#bfd6fb;background:#f4f8ff;box-shadow:inset 0 0 0 1px #dbeafe;}
			.aivi-dashboard-offer--featured{border-color:#ead193;background:linear-gradient(180deg,#ffffff 0%,#fffaf0 100%);box-shadow:inset 0 0 0 1px rgba(210,163,58,.18),0 12px 28px rgba(15,23,42,.06);}
			.aivi-dashboard-offer__header{display:flex;flex-direction:column;align-items:flex-start;gap:10px;}
			.aivi-dashboard-offer__kicker{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #ead193;background:#fff7e3;color:#946800;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
			.aivi-dashboard-offer__title{margin:0;font-size:18px;line-height:1.25;font-weight:700;color:#10233f;}
			.aivi-dashboard-offer__desc{margin:0;color:#516175;font-size:13px;line-height:1.6;}
			.aivi-dashboard-offer__availability{margin:0;color:#6a7d94;font-size:12px;line-height:1.5;font-weight:600;}
			.aivi-dashboard-offer__price{font-size:30px;line-height:1;font-weight:800;color:#10233f;}
			.aivi-dashboard-offer__price small{display:block;margin-top:6px;font-size:11px;line-height:1.4;font-weight:700;color:#6a7d94;}
			.aivi-dashboard-offer__meta{margin:0;padding:0;list-style:none;font-size:13px;line-height:1.6;color:#516175;}
			.aivi-dashboard-offer__meta li + li{margin-top:4px;}
			.aivi-dashboard-offer__tag{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#fff7e3;color:#946800;border:1px solid #ead193;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
			.aivi-dashboard-offer__actions{display:flex;flex-wrap:wrap;gap:8px;}
			.aivi-settings-callout{margin-bottom:16px;padding:18px 20px;border:1px solid #e5dcc1;border-radius:16px;background:linear-gradient(180deg,#fffdf7 0%,#ffffff 100%);box-shadow:0 10px 24px rgba(15,23,42,.04);}
			.aivi-settings-callout__title{margin:0 0 8px;font-size:18px;line-height:1.25;font-weight:700;color:#10233f;}
			.aivi-settings-callout__desc{margin:0;color:#516175;font-size:14px;line-height:1.65;max-width:760px;}
			.aivi-settings-callout__list{margin:12px 0 0;padding-left:18px;color:#516175;font-size:13px;line-height:1.65;}
			.aivi-settings-callout__list li + li{margin-top:4px;}
			.aivi-settings-callout--connection{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(260px,.92fr);gap:16px;align-items:start;}
			.aivi-settings-callout__main{min-width:0;}
			.aivi-settings-checklist{display:grid;gap:10px;margin-top:14px;}
			.aivi-settings-checklist__item{display:grid;grid-template-columns:36px minmax(0,1fr);gap:12px;align-items:start;padding:12px 14px;border-radius:14px;border:1px solid #eadfbd;background:rgba(255,255,255,.82);}
			.aivi-settings-checklist__step{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:12px;background:#fff7e3;border:1px solid #ead193;color:#946800;font-size:13px;font-weight:800;line-height:1;}
			.aivi-settings-checklist__body strong{display:block;margin-bottom:2px;font-size:14px;line-height:1.45;color:#10233f;}
			.aivi-settings-checklist__body span{display:block;font-size:13px;line-height:1.6;color:#516175;}
			.aivi-settings-token-card{padding:18px;border:1px solid #e4dcc0;border-radius:16px;background:rgba(255,255,255,.88);}
			.aivi-settings-token-card__eyebrow{display:block;margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a6702;}
			.aivi-settings-token-card__title{margin:0 0 10px;font-size:20px;line-height:1.2;font-weight:700;color:#10233f;}
			.aivi-settings-token-card__hint{margin:10px 0 0;font-size:13px;line-height:1.6;color:#516175;}
			.aivi-settings-token-card__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
			.aivi-settings-spotlight{margin-bottom:18px;padding:18px;border:1px solid #dae4f2;border-radius:22px;background:linear-gradient(135deg,#fffefb 0%,#f8fbff 100%);display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.88fr);gap:18px;align-items:start;}
			.aivi-settings-spotlight__main{min-width:0;}
			.aivi-settings-spotlight__eyebrow{display:inline-flex;align-items:center;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#20365a;}
			.aivi-settings-spotlight__title{margin:10px 0 8px;font-size:32px;line-height:1.02;letter-spacing:-.05em;font-weight:800;color:#10233f;max-width:700px;}
			.aivi-settings-spotlight__desc{margin:0;max-width:700px;color:#516175;font-size:15px;line-height:1.65;}
			.aivi-settings-spotlight__chip-row,.aivi-settings-spotlight__proof-row,.aivi-settings-spotlight__side-chip-row,.aivi-settings-spotlight__side-actions{display:flex;flex-wrap:wrap;gap:10px;}
			.aivi-settings-spotlight__chip-row{margin-top:14px;}
			.aivi-settings-spotlight__chip,.aivi-settings-spotlight__side-chip{display:inline-flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:#fff;border:1px solid #dbe3ee;color:#30465f;font-size:13px;font-weight:700;}
			.aivi-settings-spotlight__chip--highlight{background:#fff8df;border-color:#efd98c;color:#805a00;}
			.aivi-settings-spotlight__rating{display:inline-flex;gap:1px;letter-spacing:.04em;color:#b88912;}
			.aivi-settings-spotlight__proof-row{margin-top:12px;align-items:stretch;}
			.aivi-settings-spotlight__proof{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#f8fbfd;border:1px solid #dce6f1;min-width:160px;flex:1 1 180px;}
			.aivi-settings-spotlight__proof strong{display:block;font-size:13px;color:#10233f;}
			.aivi-settings-spotlight__proof small{display:block;margin-top:2px;font-size:12px;color:#516175;line-height:1.45;}
			.aivi-settings-spotlight__logo{width:34px;height:34px;border-radius:12px;flex:0 0 34px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;background:#edf3fb;color:#10233f;border:1px solid #d6e1ef;position:relative;overflow:hidden;}
			.aivi-settings-spotlight__logo--wp{border-radius:999px;font-family:Georgia,serif;font-size:18px;}
			.aivi-settings-spotlight__logo--blocks{background:#eef8ff;}
			.aivi-settings-spotlight__logo--blocks::before{content:'';position:absolute;width:9px;height:9px;border-radius:3px;background:#10233f;top:9px;left:7px;box-shadow:11px 0 0 #10233f,0 11px 0 #10233f,11px 11px 0 #10233f;}
			.aivi-settings-spotlight__logo--classic{background:#fff8ef;}
			.aivi-settings-spotlight__logo--classic::before{content:'';position:absolute;width:14px;height:18px;border-radius:3px;background:#fff;border:2px solid #10233f;}
			.aivi-settings-spotlight__logo--classic::after{content:'';position:absolute;width:10px;height:2px;background:#10233f;box-shadow:0 5px 0 #10233f,0 10px 0 #10233f;}
			.aivi-settings-spotlight__side{border:1px solid #d9e3ef;background:#fff;border-radius:20px;padding:16px;}
			.aivi-settings-spotlight__side-label{display:block;margin-bottom:10px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#20365a;}
			.aivi-settings-spotlight__signal-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px;}
			.aivi-settings-spotlight__signal-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:84px;padding:10px 8px;border-radius:16px;border:1px solid #ecd88f;background:linear-gradient(180deg,#fffdf7 0%,#fff6d7 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.8);}
			.aivi-settings-spotlight__signal-icon{width:38px;height:38px;border-radius:50%;border:1px solid rgba(184,137,18,.2);background:rgba(255,255,255,.9);display:inline-flex;align-items:center;justify-content:center;color:#b88912;}
			.aivi-settings-spotlight__signal-icon svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
			.aivi-settings-spotlight__signal-text{font-size:11px;font-weight:700;line-height:1.2;color:#20365a;text-align:center;letter-spacing:.02em;}
			.aivi-settings-spotlight__promo{margin:0 0 12px;color:#10233f;font-size:15px;line-height:1.55;}
			.aivi-settings-spotlight__side-chip-row{margin-bottom:0;}
			.aivi-settings-spotlight__side-actions{margin-top:0;align-items:center;flex-wrap:nowrap;gap:8px;}
			.aivi-settings-spotlight__side-actions .button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;white-space:nowrap;}
			.aivi-settings-plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;}
			.aivi-settings-plan-card{display:flex;flex-direction:column;gap:14px;padding:20px;border:1px solid #dde5f0;border-radius:18px;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);box-shadow:0 12px 24px rgba(15,23,42,.04);}
			.aivi-settings-plan-card--trial{background:linear-gradient(180deg,#f7fbff 0%,#ffffff 100%);border-color:#d5e5fb;}
			.aivi-settings-plan-card--featured{border-color:#cbbdff;background:linear-gradient(180deg,#fbf8ff 0%,#ffffff 100%);box-shadow:0 14px 34px rgba(111,76,255,.1);}
			.aivi-settings-plan-card--current{border-color:#bdd7fb;background:linear-gradient(180deg,#f4f8ff 0%,#ffffff 100%);}
			.aivi-settings-plan-card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
			.aivi-settings-plan-card__eyebrow{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6a7d94;}
			.aivi-settings-plan-card__name{margin:8px 0 0;font-size:26px;line-height:1.02;font-weight:800;letter-spacing:-.03em;color:#10233f;}
			.aivi-settings-plan-card__subhead{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
			.aivi-settings-plan-card__badge{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:#eef4ff;color:#214d9c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
			.aivi-settings-plan-card__badge--accent{background:#efe8ff;color:#6d45d7;}
			.aivi-settings-plan-card__price{font-size:38px;line-height:1;font-weight:800;letter-spacing:-.04em;color:#10233f;text-align:right;}
			.aivi-settings-plan-card__price small{display:block;margin-top:6px;font-size:12px;line-height:1.4;font-weight:600;color:#6a7d94;}
			.aivi-settings-plan-card__lead{margin:0;color:#516175;font-size:14px;line-height:1.7;}
			.aivi-settings-plan-card__features{margin:0;padding:0;list-style:none;display:grid;gap:8px;color:#33455d;font-size:14px;line-height:1.6;}
			.aivi-settings-plan-card__features li{position:relative;padding-left:22px;}
			.aivi-settings-plan-card__features li::before{content:'';position:absolute;left:0;top:8px;width:8px;height:8px;border-radius:999px;background:#7c5cff;box-shadow:0 0 0 4px rgba(124,92,255,.14);}
			.aivi-settings-inline-note{margin-top:16px;padding:12px 14px;border-radius:14px;background:#f6f8fc;border:1px solid #dfe5ef;color:#516175;font-size:13px;line-height:1.65;}
			.aivi-settings-form{display:grid;gap:12px;margin-top:16px;}
			.aivi-settings-form__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;}
			.aivi-settings-field{display:grid;gap:6px;}
			.aivi-settings-field label{font-size:12px;font-weight:700;color:#33455d;}
			.aivi-settings-field input[type="text"]{width:100%;min-height:42px;padding:10px 12px;border:1px solid #d7e0ee;border-radius:10px;background:#fff;color:#10233f;font-size:14px;}
			.aivi-settings-field input[type="text"]:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.12);outline:none;}
			.aivi-settings-form__hint{margin:0;color:#516175;font-size:13px;line-height:1.6;}
			.aivi-settings-form__actions{display:flex;flex-wrap:wrap;gap:10px;}
			.aivi-support-shell{display:grid;gap:18px;}
			.aivi-support-shell__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;}
			.aivi-support-shell__top-title{margin:6px 0 0;font-size:32px;line-height:1;letter-spacing:-.05em;color:#10233f;}
			.aivi-support-shell__chips{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;}
			.aivi-support-chip{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #d9e4ef;background:#fff;color:#30465f;font-size:13px;font-weight:700;line-height:1.2;text-decoration:none;}
			.aivi-support-chip--highlight{border-color:#efd98c;background:#fff7dc;color:#805a00;}
			.aivi-support-layout{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:18px;}
			.aivi-support-card{padding:18px;border:1px solid #dce6f1;border-radius:20px;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);box-shadow:0 12px 24px rgba(15,23,42,.04);}
			.aivi-support-card__title{margin:0 0 12px;font-size:18px;line-height:1.25;font-weight:700;color:#10233f;}
			.aivi-support-queue{display:grid;gap:10px;}
			.aivi-support-queue__item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:14px;border:1px solid #dce5ef;border-radius:16px;background:#fff;color:#10233f;text-align:left;cursor:pointer;text-decoration:none;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;}
			.aivi-support-queue__item:hover{border-color:#c7d5e8;box-shadow:0 10px 24px rgba(15,23,42,.06);}
			.aivi-support-queue__item.is-active{border-color:#efd98c;background:linear-gradient(180deg,#fffdf7 0%,#fff8e6 100%);}
			.aivi-support-queue__icon{display:grid;place-items:center;width:40px;height:40px;border-radius:14px;border:1px solid #dce5ef;background:#f7fbff;color:#12233f;}
			.aivi-support-queue__item.is-active .aivi-support-queue__icon{border-color:#efd98c;background:#fff;color:#b88912;}
			.aivi-support-queue__icon svg{display:block;width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
			.aivi-support-queue__icon--ai{font-size:13px;font-weight:800;letter-spacing:.04em;}
			.aivi-support-queue__copy strong{display:block;font-size:15px;line-height:1.25;color:#10233f;}
			.aivi-support-queue__copy small{display:block;margin-top:4px;font-size:13px;line-height:1.4;color:#5c6b80;}
			.aivi-support-queue__arrow{display:grid;place-items:center;color:#7a8aa0;}
			.aivi-support-queue__arrow svg{display:block;width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
			.aivi-support-ticket{display:none;}
			.aivi-support-ticket.is-active{display:block;}
			.aivi-support-ticket__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
			.aivi-support-ticket__title{margin:0;font-size:18px;line-height:1.2;font-weight:700;color:#10233f;}
			.aivi-support-ticket__body{padding:16px;border:1px solid #dce5ef;border-radius:18px;background:#fff;}
			.aivi-support-ticket__meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px;}
			.aivi-support-ticket__meta-item{padding:12px 14px;border:1px solid #dce6f1;border-radius:14px;background:#f8fbfd;min-width:0;}
			.aivi-support-ticket__meta-item--wide{grid-column:span 2;}
			.aivi-support-ticket__meta-item span{display:block;margin-bottom:6px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#22385d;}
			.aivi-support-ticket__meta-item strong{display:block;font-size:15px;line-height:1.45;color:#10233f;overflow-wrap:anywhere;}
			.aivi-support-ticket__form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
			.aivi-support-ticket__field{display:grid;gap:6px;}
			.aivi-support-ticket__field--full{grid-column:1 / -1;}
			.aivi-support-ticket__field label{font-size:12px;font-weight:700;color:#33455d;}
			.aivi-support-ticket__field input,
			.aivi-support-ticket__field textarea{width:100%;padding:10px 12px;border:1px solid #d7e0ee;border-radius:12px;background:#fff;color:#10233f;font-size:14px;font-family:inherit;}
			.aivi-support-ticket__field input[readonly]{background:#f8fbfd;}
			.aivi-support-ticket__field textarea{min-height:128px;resize:vertical;}
			.aivi-support-ticket__actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;}
			.aivi-support-ticket__note{font-size:13px;line-height:1.55;color:#5c6b80;}
			.aivi-support-ticket__cta{display:flex;gap:10px;flex-wrap:wrap;}
			.aivi-support-ticket__pending{display:inline-flex;align-items:center;padding:9px 12px;border-radius:999px;background:#eef4ff;color:#214d9c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
			.aivi-docs-shell{display:grid;gap:20px;}
			.aivi-docs-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:end;padding:22px 24px;border:1px solid #dbe5f1;border-radius:24px;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);box-shadow:0 14px 30px rgba(15,23,42,.04);}
			.aivi-docs-hero__eyebrow{display:inline-flex;align-items:center;padding:7px 12px;border-radius:999px;border:1px solid #efd98c;background:#fff6de;color:#8c6308;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
			.aivi-docs-hero__title{margin:14px 0 10px;font-size:34px;line-height:1.04;letter-spacing:-.05em;color:#10233f;}
			.aivi-docs-hero__desc{margin:0;max-width:760px;color:#516175;font-size:15px;line-height:1.75;}
			.aivi-docs-hero__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;}
			.aivi-docs-layout{display:grid;grid-template-columns:minmax(240px,280px) minmax(0,1fr) minmax(220px,280px);gap:18px;}
			.aivi-docs-panel{border:1px solid #dce6f1;border-radius:22px;background:#fff;box-shadow:0 12px 24px rgba(15,23,42,.04);}
			.aivi-docs-nav{padding:18px;}
			.aivi-docs-nav__title,.aivi-docs-utility__title{margin:0 0 14px;font-size:18px;line-height:1.2;color:#10233f;}
			.aivi-docs-nav__group + .aivi-docs-nav__group{margin-top:18px;}
			.aivi-docs-nav__label{display:block;margin-bottom:8px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6e8097;}
			.aivi-docs-nav__item{display:grid;gap:4px;padding:12px 14px;border:1px solid #dce6f1;border-radius:16px;background:#fff;color:#10233f;text-decoration:none;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;}
			.aivi-docs-nav__item + .aivi-docs-nav__item{margin-top:8px;}
			.aivi-docs-nav__item:hover{border-color:#cbd7e5;box-shadow:0 10px 24px rgba(15,23,42,.05);}
			.aivi-docs-nav__item.is-active{border-color:#e1b84f;background:linear-gradient(180deg,#fffdf8 0%,#fff7e5 100%);}
			.aivi-docs-nav__item strong{font-size:14px;line-height:1.35;color:#10233f;}
			.aivi-docs-nav__item span{font-size:13px;line-height:1.5;color:#516175;}
			.aivi-docs-main{padding:20px 22px;}
			.aivi-docs-article{display:none;}
			.aivi-docs-article.is-active{display:block;}
			.aivi-docs-article__top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
			.aivi-docs-article__meta{display:flex;flex-wrap:wrap;gap:10px;}
			.aivi-docs-article__chip{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;background:#edf3ff;color:#264d9e;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;}
			.aivi-docs-article__body{padding:24px;border:1px solid #dce6f1;border-radius:22px;background:linear-gradient(180deg,#ffffff 0%,#fcfdff 100%);}
			.aivi-docs-article__title{margin:0 0 12px;font-size:30px;line-height:1.05;letter-spacing:-.04em;color:#10233f;}
			.aivi-docs-article__lead{margin:0 0 18px;color:#516175;font-size:14px;line-height:1.75;}
			.aivi-docs-article__body h2{margin:28px 0 12px;font-size:26px;line-height:1.12;letter-spacing:-.03em;color:#10233f;}
			.aivi-docs-article__body h2:first-child{margin-top:0;}
			.aivi-docs-article__body h3{margin:22px 0 10px;font-size:20px;line-height:1.2;color:#10233f;}
			.aivi-docs-article__body h4{margin:18px 0 8px;font-size:16px;line-height:1.3;color:#10233f;}
			.aivi-docs-article__body p{margin:0 0 14px;color:#334a66;font-size:14px;line-height:1.85;}
			.aivi-docs-article__body ul,.aivi-docs-article__body ol{margin:0 0 16px 20px;color:#334a66;font-size:14px;line-height:1.8;}
			.aivi-docs-article__body li + li{margin-top:6px;}
			.aivi-docs-article__body a{color:#2153a4;text-decoration:none;font-weight:600;}
			.aivi-docs-article__body a:hover{text-decoration:underline;}
			.aivi-docs-article__body code{padding:2px 6px;border-radius:8px;background:#f2f5fa;color:#10233f;font-size:13px;}
			.aivi-docs-article__body pre{margin:0 0 16px;padding:14px 16px;border-radius:16px;background:#10233f;color:#eef4ff;overflow:auto;}
			.aivi-docs-article__body pre code{padding:0;background:transparent;color:inherit;}
			.aivi-docs-utility{padding:18px;}
			.aivi-docs-utility__card{padding:16px;border:1px solid #dce6f1;border-radius:18px;background:#fff;}
			.aivi-docs-utility__card + .aivi-docs-utility__card{margin-top:12px;}
			.aivi-docs-utility__card strong{display:block;margin-bottom:8px;font-size:15px;line-height:1.35;color:#10233f;}
			.aivi-docs-utility__card p{margin:0;color:#516175;font-size:13px;line-height:1.65;}
			.aivi-docs-utility__card .button{margin-top:12px;}
			.aivi-docs-status-list{display:grid;gap:10px;}
			.aivi-docs-status{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid #dce6f1;border-radius:16px;background:#f8fbff;font-size:13px;color:#334a66;}
			.aivi-docs-status b{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7c92;}
			.aivi-trial-email-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.48);z-index:100000;}
			.aivi-trial-email-modal.is-open{display:flex;}
			.aivi-trial-email-modal__dialog{width:min(100%,520px);background:#fff;border:1px solid #d7e0ee;border-radius:20px;box-shadow:0 24px 60px rgba(15,23,42,.18);padding:24px;}
			.aivi-trial-email-modal__eyebrow{display:block;margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6a7d94;}
			.aivi-trial-email-modal__title{margin:0 0 8px;font-size:24px;line-height:1.15;color:#10233f;}
			.aivi-trial-email-modal__desc{margin:0 0 16px;color:#516175;line-height:1.6;}
			.aivi-trial-email-modal__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;}
			.aivi-trial-email-modal__note{margin-top:12px;color:#6a7d94;font-size:12px;line-height:1.55;}
			.aivi-billing-action.is-busy{opacity:.7;pointer-events:none;}
			.aivi-connection-action.is-busy{opacity:.7;pointer-events:none;}
			.aivi-operational-settings{margin-top:22px;padding:18px 20px;border:1px solid #d7e0ee;border-radius:16px;background:#fff;}
			.aivi-operational-settings > summary{cursor:pointer;font-size:15px;font-weight:700;color:#10233f;}
			.aivi-operational-settings__intro{margin:14px 0 0;color:#516175;max-width:760px;}
			.aivi-operational-settings__test{margin-top:20px;padding-top:18px;border-top:1px solid #e4ebf5;}
			@media (max-width: 782px){.aivi-settings-shell{padding:18px;}.aivi-settings-hero{padding:20px;}.aivi-settings-hero__title{font-size:28px;}.aivi-settings-tab{width:100%;border-radius:12px;border-bottom:1px solid #d5dbea;margin-bottom:0;}.aivi-settings-tab.is-active{border-bottom-color:#d5dbea;}.aivi-settings-section{border-radius:18px;}.aivi-settings-spotlight{grid-template-columns:1fr;}.aivi-settings-spotlight__title{font-size:26px;}.aivi-settings-spotlight__side{padding:16px;}.aivi-settings-spotlight__signal-row{grid-template-columns:repeat(3,minmax(0,1fr));}.aivi-settings-spotlight__side-actions{flex-wrap:wrap;}.aivi-settings-plan-card__top{flex-direction:column;}.aivi-settings-plan-card__price{text-align:left;}.aivi-settings-callout--connection{grid-template-columns:1fr;}.aivi-settings-token-grid{grid-template-columns:1fr !important;}.aivi-settings-token-card__actions{justify-content:flex-start;}.aivi-support-shell__top{grid-template-columns:1fr;}.aivi-support-shell__chips{justify-content:flex-start;}.aivi-support-shell__top-title{font-size:28px;}.aivi-support-layout,.aivi-support-ticket__form,.aivi-docs-layout,.aivi-docs-hero{grid-template-columns:1fr;}.aivi-support-ticket__meta-item--wide{grid-column:auto;}.aivi-docs-hero__title{font-size:28px;}.aivi-docs-hero__actions{justify-content:flex-start;}}
		</style>
		<div class="aivi-settings-shell" data-aivi-active-support-category="<?php echo esc_attr( $requested_support_category ); ?>" data-aivi-active-doc="<?php echo esc_attr( $requested_doc_slug ); ?>">
			<div class="aivi-settings-hero">
				<div>
					<span class="aivi-settings-hero__eyebrow"><?php esc_html_e( 'AiVI account workspace', 'ai-visibility-inspector' ); ?></span>
					<h2 class="aivi-settings-hero__title"><?php esc_html_e( 'Manage plans, credits, and connection from one place.', 'ai-visibility-inspector' ); ?></h2>
					<p class="aivi-settings-hero__desc"><?php esc_html_e( 'Start a trial, choose a plan, review usage, and keep this site connected without leaving WordPress.', 'ai-visibility-inspector' ); ?></p>
				</div>
				<span class="aivi-dashboard-badge <?php echo esc_attr( $badge_class ); ?>"><?php echo esc_html( self::get_dashboard_display_label( $display_state ) ); ?></span>
			</div>
			<nav class="aivi-settings-tabs" aria-label="<?php esc_attr_e( 'AiVI settings sections', 'ai-visibility-inspector' ); ?>">
				<a href="<?php echo esc_url( $settings_tab_urls['overview'] ); ?>" class="aivi-settings-tab<?php echo 'overview' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-button="overview"><?php esc_html_e( 'Overview', 'ai-visibility-inspector' ); ?></a>
				<a href="<?php echo esc_url( $settings_tab_urls['billing'] ); ?>" class="aivi-settings-tab<?php echo 'billing' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-button="billing"><?php esc_html_e( 'Plans', 'ai-visibility-inspector' ); ?><?php if ( $current_plan_code !== '' ) : ?><span class="aivi-settings-tab__badge"><?php echo esc_html( self::format_dashboard_text_value( $dashboard_state['plan']['plan_name'] ?? '', ucfirst( $current_plan_code ) ) ); ?></span><?php endif; ?></a>
				<?php if ( $can_show_topups ) : ?>
					<a href="<?php echo esc_url( $settings_tab_urls['credits'] ); ?>" class="aivi-settings-tab<?php echo 'credits' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-button="credits"><?php esc_html_e( 'Credits', 'ai-visibility-inspector' ); ?></a>
				<?php endif; ?>
				<a href="<?php echo esc_url( $settings_tab_urls['connection'] ); ?>" class="aivi-settings-tab<?php echo 'connection' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-button="connection"><?php esc_html_e( 'Connection', 'ai-visibility-inspector' ); ?></a>
				<a href="<?php echo esc_url( $settings_tab_urls['support'] ); ?>" class="aivi-settings-tab<?php echo 'support' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-button="support"><?php esc_html_e( 'Support', 'ai-visibility-inspector' ); ?></a>
				<a href="<?php echo esc_url( $settings_tab_urls['documentation'] ); ?>" class="aivi-settings-tab<?php echo 'documentation' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-button="documentation"><?php esc_html_e( 'Documentation', 'ai-visibility-inspector' ); ?></a>
			</nav>
			<div id="aivi-billing-result" class="notice inline aivi-billing-result"></div>
			<div class="aivi-trial-email-modal" data-aivi-trial-email-modal="true" aria-hidden="true">
				<div class="aivi-trial-email-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="aivi-trial-email-title">
					<span class="aivi-trial-email-modal__eyebrow"><?php esc_html_e( 'Free trial setup', 'ai-visibility-inspector' ); ?></span>
					<h3 class="aivi-trial-email-modal__title" id="aivi-trial-email-title"><?php esc_html_e( 'Add the best email for account updates', 'ai-visibility-inspector' ); ?></h3>
					<p class="aivi-trial-email-modal__desc"><?php esc_html_e( 'We use this email to help with account recovery, billing updates, and multi-site connection support. You can keep using the current site admin email or replace it before your trial starts.', 'ai-visibility-inspector' ); ?></p>
					<div class="aivi-settings-form">
						<div class="aivi-settings-field">
							<label for="aivi-trial-contact-email"><?php esc_html_e( 'Contact email', 'ai-visibility-inspector' ); ?></label>
							<input type="text" id="aivi-trial-contact-email" data-aivi-trial-email-input="true" value="<?php echo esc_attr( self::get_preferred_contact_email() ); ?>" autocomplete="email" inputmode="email">
						</div>
					</div>
					<p class="aivi-trial-email-modal__note"><?php esc_html_e( 'This email is stored as the preferred contact for future AiVI onboarding on this site.', 'ai-visibility-inspector' ); ?></p>
					<div class="aivi-trial-email-modal__actions">
						<button type="button" class="button button-primary" data-aivi-trial-email-submit="true"><?php esc_html_e( 'Continue to free trial', 'ai-visibility-inspector' ); ?></button>
						<button type="button" class="button button-secondary" data-aivi-trial-email-cancel="true"><?php esc_html_e( 'Cancel', 'ai-visibility-inspector' ); ?></button>
					</div>
				</div>
			</div>
			<div class="aivi-settings-sections">
				<section class="aivi-settings-section<?php echo 'overview' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-panel="overview" id="aivi-settings-tab-overview">
					<div class="aivi-settings-section__head">
						<div>
							<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Account overview', 'ai-visibility-inspector' ); ?></span>
							<h3 class="aivi-settings-section__title"><?php esc_html_e( 'Current state at a glance', 'ai-visibility-inspector' ); ?></h3>
							<p class="aivi-settings-section__desc"><?php esc_html_e( 'This tab keeps the essentials visible: current plan, remaining credits, usage this month, and site binding. Customers should land here first.', 'ai-visibility-inspector' ); ?></p>
						</div>
						<span class="aivi-settings-meta"><?php printf( esc_html__( 'Last sync %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></span>
					</div>
					<div class="aivi-settings-grid">
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Current plan', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $plan_name ); ?></h4><p class="aivi-settings-card__meta"><?php echo esc_html( $subscription_status ); ?></p><?php if ( '' !== $trial_status_display ) : ?><p class="aivi-settings-card__hint"><?php printf( esc_html__( 'Trial status: %s', 'ai-visibility-inspector' ), esc_html( $trial_status_display ) ); ?></p><?php endif; ?></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Credit balance', 'ai-visibility-inspector' ); ?></span><div class="aivi-settings-card__value"><?php echo esc_html( $total_credits ); ?></div><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Included: %s', 'ai-visibility-inspector' ), esc_html( $included_credits ) ); ?></li><li><?php printf( esc_html__( 'Top-up: %s', 'ai-visibility-inspector' ), esc_html( $topup_credits ) ); ?></li><li><?php printf( esc_html__( 'Last analysis debit: %s', 'ai-visibility-inspector' ), esc_html( $last_run_debit ) ); ?></li></ul></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Usage this month', 'ai-visibility-inspector' ); ?></span><div class="aivi-settings-card__value"><?php echo esc_html( $analyses_this_month ); ?></div><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Credits used this month: %s', 'ai-visibility-inspector' ), esc_html( $credits_used_this_month ) ); ?></li><li><?php printf( esc_html__( 'Last analysis: %s', 'ai-visibility-inspector' ), esc_html( $last_analysis_at ) ); ?></li><li><?php printf( esc_html__( 'Last result: %s', 'ai-visibility-inspector' ), esc_html( $last_run_status ) ); ?></li></ul></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Connected site', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $connected_domain ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Binding: %s', 'ai-visibility-inspector' ), esc_html( $binding_status ) ); ?></li><li><?php printf( esc_html__( 'Site ID: %s', 'ai-visibility-inspector' ), esc_html( $site_id ) ); ?></li><li><?php printf( esc_html__( 'Blog ID: %s', 'ai-visibility-inspector' ), esc_html( $blog_id ) ); ?></li></ul></section>
					</div>
					<div class="aivi-settings-grid aivi-settings-grid--two" style="margin-top:14px;">
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Subscription status', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $subscription_status ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Account: %s', 'ai-visibility-inspector' ), esc_html( $account_label ) ); ?></li><li><?php printf( esc_html__( 'Max sites: %s', 'ai-visibility-inspector' ), esc_html( $max_sites ) ); ?></li></ul><div class="aivi-settings-card__status aivi-dashboard-card__status--<?php echo esc_attr( $billing_status_tone ); ?>" id="aivi-billing-status"><?php echo esc_html( $billing_status_message['message'] ); ?></div><div class="aivi-settings-actions"><?php if ( $is_connected && $billing_enabled ) : ?><a class="button button-primary" href="<?php echo esc_url( $billing_tab_href ); ?>"><?php esc_html_e( 'Open plans tab', 'ai-visibility-inspector' ); ?></a><?php if ( ! empty( $support_url ) ) : ?><a class="button button-secondary" href="<?php echo esc_url( $support_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Contact support', 'ai-visibility-inspector' ); ?></a><?php endif; ?><?php else : ?><button type="button" class="button button-primary aivi-account-action" data-account-action="start_trial"><?php esc_html_e( 'Start free trial', 'ai-visibility-inspector' ); ?></button><a class="button button-secondary" href="<?php echo esc_url( $connection_tab_href ); ?>"><?php esc_html_e( 'Open connection tab', 'ai-visibility-inspector' ); ?></a><?php endif; ?></div></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Recent activity', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php esc_html_e( 'Latest billing and usage context', 'ai-visibility-inspector' ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Last analysis debit: %s', 'ai-visibility-inspector' ), esc_html( $last_run_debit ) ); ?></li><li><?php printf( esc_html__( 'Last sync: %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></li><li><?php printf( esc_html__( 'Display state: %s', 'ai-visibility-inspector' ), esc_html( self::get_dashboard_display_label( $display_state ) ) ); ?></li></ul></section>
					</div>
				</section>
				<section class="aivi-settings-section<?php echo 'billing' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-panel="billing" id="aivi-billing-plans">
					<div class="aivi-settings-spotlight">
						<div class="aivi-settings-spotlight__main">
							<span class="aivi-settings-spotlight__eyebrow"><?php esc_html_e( 'Plans spotlight', 'ai-visibility-inspector' ); ?></span>
							<h4 class="aivi-settings-spotlight__title"><?php esc_html_e( 'Built for answer-first growth', 'ai-visibility-inspector' ); ?></h4>
							<p class="aivi-settings-spotlight__desc"><?php esc_html_e( 'Stop guessing what AI will surface. See what your content is missing, and fix it before you publish.', 'ai-visibility-inspector' ); ?></p>
							<div class="aivi-settings-spotlight__chip-row">
								<span class="aivi-settings-spotlight__chip aivi-settings-spotlight__chip--highlight"><span class="aivi-settings-spotlight__rating" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span><?php esc_html_e( 'Early adopters already know.', 'ai-visibility-inspector' ); ?></span>
								<span class="aivi-settings-spotlight__chip"><?php esc_html_e( 'WordPress 6.9.4 tested', 'ai-visibility-inspector' ); ?></span>
								<span class="aivi-settings-spotlight__chip"><?php esc_html_e( 'Growth / Pro multi-site', 'ai-visibility-inspector' ); ?></span>
							</div>
							<div class="aivi-settings-spotlight__proof-row">
								<div class="aivi-settings-spotlight__proof">
									<span class="aivi-settings-spotlight__logo aivi-settings-spotlight__logo--wp" aria-hidden="true">W</span>
									<div>
										<strong><?php esc_html_e( 'WordPress native', 'ai-visibility-inspector' ); ?></strong>
										<small><?php esc_html_e( 'Billing and connection stay inside wp-admin', 'ai-visibility-inspector' ); ?></small>
									</div>
								</div>
								<div class="aivi-settings-spotlight__proof">
									<span class="aivi-settings-spotlight__logo aivi-settings-spotlight__logo--blocks" aria-hidden="true"></span>
									<div>
										<strong><?php esc_html_e( 'Block Editor', 'ai-visibility-inspector' ); ?></strong>
										<small><?php esc_html_e( 'Ready for the current publishing workflow', 'ai-visibility-inspector' ); ?></small>
									</div>
								</div>
								<div class="aivi-settings-spotlight__proof">
									<span class="aivi-settings-spotlight__logo aivi-settings-spotlight__logo--classic" aria-hidden="true"></span>
									<div>
										<strong><?php esc_html_e( 'Classic Editor', 'ai-visibility-inspector' ); ?></strong>
										<small><?php esc_html_e( 'Supported for teams not ready to migrate', 'ai-visibility-inspector' ); ?></small>
									</div>
								</div>
							</div>
						</div>
						<aside class="aivi-settings-spotlight__side">
							<div class="aivi-settings-spotlight__signal-row" aria-label="<?php esc_attr_e( 'Structure, trust, and citation signals', 'ai-visibility-inspector' ); ?>">
								<span class="aivi-settings-spotlight__signal-card">
									<span class="aivi-settings-spotlight__signal-icon" aria-hidden="true">
										<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>
									</span>
									<span class="aivi-settings-spotlight__signal-text"><?php esc_html_e( 'Structure', 'ai-visibility-inspector' ); ?></span>
								</span>
								<span class="aivi-settings-spotlight__signal-card">
									<span class="aivi-settings-spotlight__signal-icon" aria-hidden="true">
										<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.6-2.9 8.5-7 10-4.1-1.5-7-5.4-7-10V6l7-3z"></path><path d="M9.2 12.3l2 2.1 3.8-4.2"></path></svg>
									</span>
									<span class="aivi-settings-spotlight__signal-text"><?php esc_html_e( 'Trust', 'ai-visibility-inspector' ); ?></span>
								</span>
								<span class="aivi-settings-spotlight__signal-card">
									<span class="aivi-settings-spotlight__signal-icon" aria-hidden="true">
										<svg viewBox="0 0 24 24"><path d="M8 8h5a3 3 0 010 6H9"></path><path d="M16 16h-5a3 3 0 010-6h4"></path></svg>
									</span>
									<span class="aivi-settings-spotlight__signal-text"><?php esc_html_e( 'Citation', 'ai-visibility-inspector' ); ?></span>
								</span>
							</div>
							<p class="aivi-settings-spotlight__promo"><?php esc_html_e( 'AiVI gives you visibility into what answer engines actually need so your content is structured, trusted, and ready to be cited.', 'ai-visibility-inspector' ); ?></p>
							<div class="aivi-settings-spotlight__side-actions">
								<a class="button button-primary" href="#aivi-settings-plan-grid"><?php esc_html_e( 'Choose your plan', 'ai-visibility-inspector' ); ?></a>
								<a class="button button-secondary" href="<?php echo esc_url( $connection_tab_href ); ?>"><?php esc_html_e( 'View connection requirements', 'ai-visibility-inspector' ); ?></a>
							</div>
						</aside>
					</div>
					<div class="aivi-settings-plan-grid" id="aivi-settings-plan-grid">
						<article class="aivi-settings-plan-card aivi-settings-plan-card--trial<?php echo $trial_is_active ? ' aivi-settings-plan-card--current' : ''; ?>">
							<div class="aivi-settings-plan-card__top">
								<div>
									<span class="aivi-settings-plan-card__eyebrow"><?php esc_html_e( 'Free trial', 'ai-visibility-inspector' ); ?></span>
									<h4 class="aivi-settings-plan-card__name"><?php echo esc_html( $trial_label ); ?></h4>
									<div class="aivi-settings-plan-card__subhead">
										<span class="aivi-settings-plan-card__badge aivi-settings-plan-card__badge--accent"><?php esc_html_e( 'Start here', 'ai-visibility-inspector' ); ?></span>
										<?php if ( $trial_is_active ) : ?>
											<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'Active now', 'ai-visibility-inspector' ); ?></span>
										<?php elseif ( $trial_has_been_used ) : ?>
											<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'One-time per site', 'ai-visibility-inspector' ); ?></span>
										<?php endif; ?>
									</div>
								</div>
								<div class="aivi-settings-plan-card__price">$0<small><?php esc_html_e( 'for your first site', 'ai-visibility-inspector' ); ?></small></div>
							</div>
							<ul class="aivi-settings-plan-card__features">
								<li><?php printf( esc_html__( '%s credits included', 'ai-visibility-inspector' ), esc_html( $trial_credits ) ); ?></li>
								<li><?php printf( esc_html__( '%s connected site', 'ai-visibility-inspector' ), esc_html( $trial_sites ) ); ?></li>
								<li><?php printf( esc_html__( '%s days of access', 'ai-visibility-inspector' ), esc_html( $trial_days ) ); ?></li>
							</ul>
							<div class="aivi-settings-actions">
								<?php if ( $trial_is_available ) : ?>
									<button type="button" class="button button-primary aivi-account-action" data-account-action="start_trial"><?php esc_html_e( 'Start free trial', 'ai-visibility-inspector' ); ?></button>
								<?php else : ?>
									<button type="button" class="button button-secondary" disabled><?php echo esc_html( $trial_button_label ); ?></button>
								<?php endif; ?>
							</div>
						</article>
						<?php foreach ( $plan_entries as $plan_entry ) : ?>
							<?php
							$plan_code = sanitize_text_field( (string) ( $plan_entry['code'] ?? '' ) );
							if ( $plan_code === '' ) {
								continue;
							}
							$is_current_plan              = $current_plan_code !== '' && $plan_code === $current_plan_code;
							$plan_transition             = self::get_dashboard_plan_transition( $current_plan_code, $plan_code );
							$pending_plan_activation     = $is_connected && in_array( $current_plan_code, AIVI_PLAN_CODES, true ) && 'created' === $current_subscription_status_code && ! $is_current_plan;
							$downgrade_at_renewal_only   = $is_connected && in_array( $current_plan_code, AIVI_PLAN_CODES, true ) && 'active' === $current_subscription_status_code && ! $is_current_plan && 'downgrade' === $plan_transition;
							$plan_change_requires_guard  = $pending_plan_activation || $downgrade_at_renewal_only;
							$plan_button_label            = self::get_dashboard_plan_action_label( $current_plan_code, $plan_code );
							if ( $pending_plan_activation ) {
								$plan_button_label = __( 'Wait for activation', 'ai-visibility-inspector' );
							} elseif ( $downgrade_at_renewal_only ) {
								$plan_button_label = __( 'Downgrade at renewal', 'ai-visibility-inspector' );
							}
							$plan_price     = self::format_billing_price_label( $plan_entry['price_usd'] ?? null, true );
							$plan_intro_offer = self::format_plan_intro_offer_label( $plan_entry['intro_offer'] ?? array() );
							$is_growth_plan = 'growth' === $plan_code;
							?>
							<article class="aivi-settings-plan-card<?php echo $is_current_plan ? ' aivi-settings-plan-card--current' : ''; ?><?php echo $is_growth_plan ? ' aivi-settings-plan-card--featured' : ''; ?>">
								<div class="aivi-settings-plan-card__top">
									<div>
										<span class="aivi-settings-plan-card__eyebrow"><?php esc_html_e( 'Paid plan', 'ai-visibility-inspector' ); ?></span>
										<h4 class="aivi-settings-plan-card__name"><?php echo esc_html( self::format_dashboard_text_value( $plan_entry['label'] ?? '', ucfirst( $plan_code ) ) ); ?></h4>
										<div class="aivi-settings-plan-card__subhead">
											<?php if ( $is_current_plan ) : ?>
												<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'Current plan', 'ai-visibility-inspector' ); ?></span>
											<?php elseif ( $is_growth_plan ) : ?>
												<span class="aivi-settings-plan-card__badge aivi-settings-plan-card__badge--accent"><?php esc_html_e( 'Popular', 'ai-visibility-inspector' ); ?></span>
											<?php endif; ?>
											<?php if ( ! $is_connected ) : ?>
												<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'Unlock after trial', 'ai-visibility-inspector' ); ?></span>
											<?php elseif ( $downgrade_at_renewal_only ) : ?>
												<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'Downgrade at renewal', 'ai-visibility-inspector' ); ?></span>
											<?php elseif ( $pending_plan_activation ) : ?>
												<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'Awaiting activation', 'ai-visibility-inspector' ); ?></span>
											<?php elseif ( $is_connected && 'upgrade' === $plan_transition && 'active' === $current_subscription_status_code ) : ?>
												<span class="aivi-settings-plan-card__badge"><?php esc_html_e( 'PayPal approval', 'ai-visibility-inspector' ); ?></span>
											<?php elseif ( $plan_intro_offer !== '' ) : ?>
												<span class="aivi-settings-plan-card__badge"><?php echo esc_html( $plan_intro_offer ); ?></span>
											<?php endif; ?>
										</div>
									</div>
									<div class="aivi-settings-plan-card__price"><?php echo esc_html( $plan_price ); ?><small><?php esc_html_e( 'per month', 'ai-visibility-inspector' ); ?></small></div>
								</div>
								<ul class="aivi-settings-plan-card__features">
									<li><?php printf( esc_html__( '%s monthly credits', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $plan_entry['included_credits'] ?? null, '0' ) ) ); ?></li>
									<li><?php printf( esc_html__( '%s connected site(s)', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $plan_entry['site_limit'] ?? null, '0' ) ) ); ?></li>
									<li><?php printf( esc_html__( '%s days of history', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $plan_entry['history_days'] ?? null, '0' ) ) ); ?></li>
								</ul>
								<?php if ( $is_connected ) : ?>
									<div class="aivi-settings-actions">
										<button type="button" class="button <?php echo ( $is_current_plan || $plan_change_requires_guard ) ? 'button-secondary' : 'button-primary'; ?> aivi-billing-action" data-billing-action="<?php echo esc_attr( $plan_change_requires_guard ? 'plan_change_info' : 'subscribe' ); ?>" data-plan-code="<?php echo esc_attr( $plan_code ); ?>" data-plan-transition="<?php echo esc_attr( $plan_transition ); ?>" data-subscription-status="<?php echo esc_attr( $current_subscription_status_code ); ?>" <?php disabled( ! $billing_enabled || $is_current_plan ); ?>><?php echo esc_html( $is_current_plan ? __( 'Current plan', 'ai-visibility-inspector' ) : $plan_button_label ); ?></button>
									</div>
								<?php endif; ?>
							</article>
						<?php endforeach; ?>
					</div>
					<?php if ( $is_connected && in_array( $current_plan_code, AIVI_PLAN_CODES, true ) && in_array( $current_subscription_status_code, array( 'active', 'created' ), true ) ) : ?>
						<div class="aivi-settings-callout" style="margin-top:16px;">
							<h4 class="aivi-settings-callout__title"><?php esc_html_e( 'Plan changes stay aligned with your billing cycle', 'ai-visibility-inspector' ); ?></h4>
							<p class="aivi-settings-callout__desc"><?php esc_html_e( 'Upgrades open a PayPal approval step and AiVI syncs the new plan once PayPal confirms it. Downgrades stay scheduled for renewal so your current access is not cut short or charged twice.', 'ai-visibility-inspector' ); ?></p>
						</div>
					<?php endif; ?>
					<?php if ( ! $can_show_topups ) : ?>
						<p class="aivi-settings-inline-note"><?php esc_html_e( 'Credit packs appear once a paid plan becomes active.', 'ai-visibility-inspector' ); ?></p>
					<?php endif; ?>
				</section>
				<?php if ( $can_show_topups ) : ?>
				<section class="aivi-settings-section aivi-settings-section--credits<?php echo 'credits' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-panel="credits" id="aivi-billing-topups">
					<div class="aivi-settings-section__head">
						<div>
							<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Credit packs', 'ai-visibility-inspector' ); ?></span>
							<h3 class="aivi-settings-section__title"><?php esc_html_e( 'Add credits to your active AiVI access', 'ai-visibility-inspector' ); ?></h3>
							<p class="aivi-settings-section__desc"><?php esc_html_e( 'Top-ups add extra capacity to an active paid subscription. They do not activate analysis on their own.', 'ai-visibility-inspector' ); ?></p>
						</div>
					</div>
					<div class="aivi-settings-grid aivi-settings-grid--two" style="margin-bottom:16px;">
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Current balance', 'ai-visibility-inspector' ); ?></span><div class="aivi-settings-card__value"><?php echo esc_html( $total_credits ); ?></div><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Included: %s', 'ai-visibility-inspector' ), esc_html( $included_credits ) ); ?></li><li><?php printf( esc_html__( 'Top-up: %s', 'ai-visibility-inspector' ), esc_html( $topup_credits ) ); ?></li></ul></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Credit grant policy', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php esc_html_e( 'Granted after verified capture', 'ai-visibility-inspector' ); ?></h4><p class="aivi-settings-card__hint"><?php esc_html_e( 'Top-up credits appear after PayPal capture is verified and reconciled. They extend an active paid subscription instead of replacing it.', 'ai-visibility-inspector' ); ?></p></section>
					</div>
					<?php if ( ! $is_connected ) : ?>
						<div class="aivi-settings-callout">
							<h4 class="aivi-settings-callout__title"><?php esc_html_e( 'Credits unlock after connection and active access', 'ai-visibility-inspector' ); ?></h4>
							<p class="aivi-settings-callout__desc"><?php esc_html_e( 'Top-ups are available only after this site is connected to an AiVI account and a paid plan is active. They extend existing access rather than replacing it.', 'ai-visibility-inspector' ); ?></p>
							<div class="aivi-settings-actions">
								<button type="button" class="button button-primary aivi-account-action" data-account-action="start_trial"><?php esc_html_e( 'Start free trial', 'ai-visibility-inspector' ); ?></button>
								<a class="button button-secondary" href="<?php echo esc_url( $connection_tab_href ); ?>"><?php esc_html_e( 'Open connection tab', 'ai-visibility-inspector' ); ?></a>
							</div>
						</div>
					<?php endif; ?>
					<?php
					$topup_entry_count     = count( $topup_entries );
					$featured_topup_index  = $topup_entry_count >= 3 ? (int) floor( $topup_entry_count / 2 ) : -1;
					$topup_loop_index      = 0;
					?>
					<div class="aivi-settings-offer-grid">
						<?php foreach ( $topup_entries as $topup_entry ) : ?>
							<?php
							$topup_code = sanitize_text_field( (string) ( $topup_entry['code'] ?? '' ) );
							if ( $topup_code === '' ) {
								continue;
							}
							$topup_credit_count = absint( $topup_entry['credits'] ?? 0 );
							$is_featured_topup  = $featured_topup_index === $topup_loop_index;
							if ( $topup_credit_count >= 100000 ) {
								$topup_kicker = __( 'High volume', 'ai-visibility-inspector' );
								$topup_desc   = __( 'Best for heavy editorial cycles, migrations, or concentrated analysis demand across active sites.', 'ai-visibility-inspector' );
							} elseif ( $topup_credit_count >= 50000 ) {
								$topup_kicker = __( 'Recommended', 'ai-visibility-inspector' );
								$topup_desc   = __( 'The strongest default choice for active sites that need more headroom without changing plans.', 'ai-visibility-inspector' );
							} else {
								$topup_kicker = __( 'Light use', 'ai-visibility-inspector' );
								$topup_desc   = __( 'A good fit for smaller publishing bursts or a lighter top-up before a short campaign sprint.', 'ai-visibility-inspector' );
							}
							$topup_loop_index++;
							?>
							<article class="aivi-dashboard-offer<?php echo $is_featured_topup ? ' aivi-dashboard-offer--featured' : ''; ?>">
								<div class="aivi-dashboard-offer__header">
									<span class="aivi-dashboard-offer__kicker"><?php echo esc_html( $topup_kicker ); ?></span>
									<h4 class="aivi-dashboard-offer__title"><?php echo esc_html( self::format_dashboard_text_value( $topup_entry['label'] ?? '', $topup_code ) ); ?></h4>
									<div class="aivi-dashboard-offer__price"><?php echo esc_html( self::format_billing_price_label( $topup_entry['price_usd'] ?? null, false ) ); ?><small><?php esc_html_e( 'one-time', 'ai-visibility-inspector' ); ?></small></div>
									<?php if ( ! $is_connected ) : ?>
										<p class="aivi-dashboard-offer__availability"><?php esc_html_e( 'Available after connection', 'ai-visibility-inspector' ); ?></p>
									<?php endif; ?>
								</div>
								<p class="aivi-dashboard-offer__desc"><?php echo esc_html( $topup_desc ); ?></p>
								<ul class="aivi-dashboard-offer__meta">
									<li><?php printf( esc_html__( '%s credits added after verified capture', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $topup_entry['credits'] ?? null, '0' ) ) ); ?></li>
									<?php if ( $is_featured_topup ) : ?>
										<li><?php esc_html_e( 'Best default choice for active sites that need more room without changing plan behavior.', 'ai-visibility-inspector' ); ?></li>
									<?php elseif ( $topup_credit_count >= 100000 ) : ?>
										<li><?php esc_html_e( 'Most runway for a heavy editorial month or larger multi-site burst.', 'ai-visibility-inspector' ); ?></li>
									<?php else : ?>
										<li><?php esc_html_e( 'Simple one-time purchase for smaller bursts of analysis.', 'ai-visibility-inspector' ); ?></li>
									<?php endif; ?>
								</ul>
								<div class="aivi-dashboard-offer__actions">
									<?php if ( ! $is_connected ) : ?>
										<button type="button" class="button button-secondary aivi-account-action" data-account-action="start_trial"><?php esc_html_e( 'Start free trial', 'ai-visibility-inspector' ); ?></button>
									<?php else : ?>
										<button type="button" class="button button-secondary aivi-billing-action" data-billing-action="topup" data-topup-pack-code="<?php echo esc_attr( $topup_code ); ?>" <?php disabled( ! $billing_enabled ); ?>><?php esc_html_e( 'Buy top-up', 'ai-visibility-inspector' ); ?></button>
									<?php endif; ?>
								</div>
							</article>
						<?php endforeach; ?>
					</div>
					<?php if ( $is_connected && ! $billing_enabled ) : ?>
						<p class="aivi-settings-card__hint"><?php esc_html_e( 'Hosted billing actions are hidden until PayPal checkout is enabled for this environment.', 'ai-visibility-inspector' ); ?></p>
					<?php endif; ?>
				</section>
				<?php endif; ?>
				<section class="aivi-settings-section aivi-settings-section--connection<?php echo 'connection' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-panel="connection" id="aivi-settings-tab-connection">
					<div class="aivi-settings-section__head">
						<div>
							<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Connection state', 'ai-visibility-inspector' ); ?></span>
							<h3 class="aivi-settings-section__title"><?php esc_html_e( 'Binding and sync health', 'ai-visibility-inspector' ); ?></h3>
							<p class="aivi-settings-section__desc"><?php esc_html_e( 'Review the site binding, account sync, and install details used for this AiVI workspace.', 'ai-visibility-inspector' ); ?></p>
						</div>
					</div>
					<?php if ( ! $is_connected ) : ?>
						<div class="aivi-settings-grid aivi-settings-grid--two">
							<section class="aivi-settings-card">
								<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Connection required', 'ai-visibility-inspector' ); ?></span>
								<h4 class="aivi-settings-card__title"><?php esc_html_e( 'This site must be linked to AiVI before analysis starts.', 'ai-visibility-inspector' ); ?></h4>
								<p class="aivi-settings-card__hint"><?php esc_html_e( 'Once the site is connected, the active trial or plan unlocks analysis and billing actions become available across the plugin.', 'ai-visibility-inspector' ); ?></p>
								<ul class="aivi-settings-list">
									<li><?php esc_html_e( 'Step 1: confirm the site identity shown below.', 'ai-visibility-inspector' ); ?></li>
									<li><?php esc_html_e( 'Step 2: either start a new free trial here or paste an operator-issued connection token.', 'ai-visibility-inspector' ); ?></li>
									<li><?php esc_html_e( 'Step 3: return to Plans or Credits once the connection is active.', 'ai-visibility-inspector' ); ?></li>
								</ul>
								<form class="aivi-settings-form" data-account-connect-submit>
									<div class="aivi-settings-form__grid">
										<div class="aivi-settings-field">
											<label for="aivi-connection-token"><?php esc_html_e( 'Connection token', 'ai-visibility-inspector' ); ?></label>
											<input type="text" id="aivi-connection-token" name="connection_token" value="" autocomplete="off" spellcheck="false" placeholder="<?php esc_attr_e( 'Paste your AiVI connection token', 'ai-visibility-inspector' ); ?>">
										</div>
										<div class="aivi-settings-field">
											<label for="aivi-connection-label"><?php esc_html_e( 'Label for this site', 'ai-visibility-inspector' ); ?></label>
											<input type="text" id="aivi-connection-label" name="connection_label" value="" autocomplete="off" spellcheck="false" placeholder="<?php esc_attr_e( 'Optional label, e.g. Marketing Site', 'ai-visibility-inspector' ); ?>">
										</div>
									</div>
									<p class="aivi-settings-form__hint"><?php esc_html_e( 'Growth and Pro multi-site connections currently use an operator-issued connection token. Install AiVI on the additional site, open this Connection tab, and paste the token here.', 'ai-visibility-inspector' ); ?></p>
									<div class="aivi-settings-form__actions">
										<button type="submit" class="button button-secondary aivi-connection-action"><?php esc_html_e( 'Connect with token', 'ai-visibility-inspector' ); ?></button>
									</div>
								</form>
								<div class="aivi-settings-actions">
									<button type="button" class="button button-primary aivi-account-action" data-account-action="start_trial"><?php esc_html_e( 'Start free trial', 'ai-visibility-inspector' ); ?></button>
									<a class="button button-secondary" href="<?php echo esc_url( $billing_tab_href ); ?>"><?php esc_html_e( 'Review plans', 'ai-visibility-inspector' ); ?></a>
									<?php if ( ! empty( $support_url ) ) : ?>
										<a class="button button-secondary" href="<?php echo esc_url( $support_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Contact support', 'ai-visibility-inspector' ); ?></a>
									<?php endif; ?>
								</div>
							</section>
							<section class="aivi-settings-card">
								<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Site identity', 'ai-visibility-inspector' ); ?></span>
								<h4 class="aivi-settings-card__title"><?php echo esc_html( $connected_domain ); ?></h4>
								<ul class="aivi-settings-list">
									<li><?php printf( esc_html__( 'Binding: %s', 'ai-visibility-inspector' ), esc_html( $binding_status ) ); ?></li>
									<li><?php printf( esc_html__( 'Site ID: %s', 'ai-visibility-inspector' ), esc_html( $site_id ) ); ?></li>
									<li><?php printf( esc_html__( 'Blog ID: %s', 'ai-visibility-inspector' ), esc_html( $blog_id ) ); ?></li>
									<li><?php printf( esc_html__( 'Last sync: %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></li>
								</ul>
							</section>
						</div>
					<?php else : ?>
						<div class="aivi-settings-grid aivi-settings-grid--two">
							<section class="aivi-settings-card">
								<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Site binding', 'ai-visibility-inspector' ); ?></span>
								<h4 class="aivi-settings-card__title"><?php echo esc_html( $connected_domain ); ?></h4>
								<ul class="aivi-settings-list">
									<li><?php printf( esc_html__( 'Binding: %s', 'ai-visibility-inspector' ), esc_html( $binding_status ) ); ?></li>
									<li><?php printf( esc_html__( 'Site ID: %s', 'ai-visibility-inspector' ), esc_html( $site_id ) ); ?></li>
									<li><?php printf( esc_html__( 'Blog ID: %s', 'ai-visibility-inspector' ), esc_html( $blog_id ) ); ?></li>
									<li><?php printf( esc_html__( 'Plan capacity: %s site(s)', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $max_sites_limit > 0 ? $max_sites_limit : null, '1' ) ) ); ?></li>
								</ul>
								<div class="aivi-settings-actions">
									<button type="button" class="button button-secondary aivi-connection-action" data-connection-action="disconnect"><?php esc_html_e( 'Disconnect this site', 'ai-visibility-inspector' ); ?></button>
								</div>
							</section>
							<section class="aivi-settings-card">
								<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Account sync', 'ai-visibility-inspector' ); ?></span>
								<h4 class="aivi-settings-card__title"><?php echo esc_html( $account_label ); ?></h4>
								<ul class="aivi-settings-list">
									<li><?php printf( esc_html__( 'Display state: %s', 'ai-visibility-inspector' ), esc_html( self::get_dashboard_display_label( $display_state ) ) ); ?></li>
									<li><?php printf( esc_html__( 'Last sync: %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></li>
									<li><?php printf( esc_html__( 'Subscription status: %s', 'ai-visibility-inspector' ), esc_html( $subscription_status ) ); ?></li>
								</ul>
								<p class="aivi-settings-card__hint"><?php esc_html_e( 'Disconnecting here removes only this site binding. Other connected sites on the same Growth or Pro account stay attached.', 'ai-visibility-inspector' ); ?></p>
							</section>
						</div>
						<?php if ( $multi_site_enabled ) : ?>
							<div class="aivi-settings-callout aivi-settings-callout--connection">
								<div class="aivi-settings-callout__main">
									<h4 class="aivi-settings-callout__title"><?php esc_html_e( 'Add another site to this account', 'ai-visibility-inspector' ); ?></h4>
									<p class="aivi-settings-callout__desc">
										<?php
										if ( $site_limit_reached ) {
											printf(
												esc_html__( 'This plan allows up to %s connected sites, and every slot is currently in use. Unbind a stale site before connecting a new one.', 'ai-visibility-inspector' ),
												esc_html( self::format_dashboard_metric_value( $max_sites_limit, '0' ) )
											);
										} else {
											printf(
												esc_html__( 'This plan allows up to %s connected sites. To bind another site, install AiVI on that site, open its Connection tab, and paste an operator-issued connection token there.', 'ai-visibility-inspector' ),
												esc_html( self::format_dashboard_metric_value( $max_sites_limit, '0' ) )
											);
										}
										?>
									</p>
									<div class="aivi-settings-checklist">
										<?php if ( $site_limit_reached ) : ?>
											<div class="aivi-settings-checklist__item">
												<span class="aivi-settings-checklist__step">1</span>
												<div class="aivi-settings-checklist__body">
													<strong><?php esc_html_e( 'Free one slot first', 'ai-visibility-inspector' ); ?></strong>
													<span><?php esc_html_e( 'Disconnect or unbind a stale site before trying to attach the next one to this account.', 'ai-visibility-inspector' ); ?></span>
												</div>
											</div>
										<?php else : ?>
											<div class="aivi-settings-checklist__item">
												<span class="aivi-settings-checklist__step">1</span>
												<div class="aivi-settings-checklist__body">
													<strong><?php esc_html_e( 'Prepare the next site', 'ai-visibility-inspector' ); ?></strong>
													<span><?php esc_html_e( 'Install AiVI there and open that site’s Connection tab before copying the token from this account.', 'ai-visibility-inspector' ); ?></span>
												</div>
											</div>
										<?php endif; ?>
										<div class="aivi-settings-checklist__item">
											<span class="aivi-settings-checklist__step">2</span>
											<div class="aivi-settings-checklist__body">
												<strong><?php esc_html_e( 'Use an operator-issued token', 'ai-visibility-inspector' ); ?></strong>
												<span><?php esc_html_e( 'Connection tokens are currently issued from the AiVI operator surface and copied from the latest token panel.', 'ai-visibility-inspector' ); ?></span>
											</div>
										</div>
										<div class="aivi-settings-checklist__item">
											<span class="aivi-settings-checklist__step">3</span>
											<div class="aivi-settings-checklist__body">
												<strong><?php esc_html_e( 'Complete the binding on the next site', 'ai-visibility-inspector' ); ?></strong>
												<span><?php esc_html_e( 'The new site finishes the connection by pasting that token into its own Connection tab.', 'ai-visibility-inspector' ); ?></span>
											</div>
										</div>
										<div class="aivi-settings-checklist__item">
											<span class="aivi-settings-checklist__step">4</span>
											<div class="aivi-settings-checklist__body">
												<strong><?php esc_html_e( 'Reassign carefully if needed', 'ai-visibility-inspector' ); ?></strong>
												<span><?php esc_html_e( 'If this site was connected by mistake, disconnect it here before reusing the slot elsewhere.', 'ai-visibility-inspector' ); ?></span>
											</div>
										</div>
									</div>
								</div>
								<div class="aivi-settings-token-card">
									<span class="aivi-settings-token-card__eyebrow"><?php esc_html_e( 'Latest connection token', 'ai-visibility-inspector' ); ?></span>
									<?php if ( $latest_connection_token_available ) : ?>
										<h4 class="aivi-settings-token-card__title"><?php esc_html_e( 'Reveal and copy when you are ready to connect the next site', 'ai-visibility-inspector' ); ?></h4>
										<div class="aivi-settings-form__grid aivi-settings-token-grid" style="grid-template-columns:minmax(0,1fr) auto auto;align-items:end;">
											<div class="aivi-settings-field" style="margin-bottom:0;">
												<label for="aivi-issued-connection-token"><?php esc_html_e( 'Issued token', 'ai-visibility-inspector' ); ?></label>
												<input type="password" id="aivi-issued-connection-token" readonly value="<?php echo esc_attr( $latest_connection_token['token'] ?? '' ); ?>" data-aivi-issued-token-input="true" data-token-masked="<?php echo esc_attr( $latest_connection_token['masked_token'] ?? '' ); ?>" data-token-raw="<?php echo esc_attr( $latest_connection_token['token'] ?? '' ); ?>">
											</div>
											<div class="aivi-settings-form__actions" style="margin:0;">
												<button type="button" class="button button-secondary" data-aivi-issued-token-toggle="true"><?php esc_html_e( 'Show', 'ai-visibility-inspector' ); ?></button>
											</div>
											<div class="aivi-settings-form__actions" style="margin:0;">
												<button type="button" class="button button-secondary" data-aivi-issued-token-copy="true"><?php esc_html_e( 'Copy token', 'ai-visibility-inspector' ); ?></button>
											</div>
										</div>
										<p class="aivi-settings-token-card__hint">
											<?php
											printf(
												esc_html__( 'Issued token expires %s. Keep it hidden until you need to paste it into the next site.', 'ai-visibility-inspector' ),
												esc_html( self::format_account_sync_time( $latest_connection_token['expires_at'] ?? '' ) )
											);
											?>
										</p>
									<?php else : ?>
										<h4 class="aivi-settings-token-card__title"><?php esc_html_e( 'No active token stored yet', 'ai-visibility-inspector' ); ?></h4>
										<p class="aivi-settings-token-card__hint"><?php esc_html_e( 'Once an operator issues a seven-day connection token for this account, it will appear here masked by default so you can reveal and copy it on demand.', 'ai-visibility-inspector' ); ?></p>
									<?php endif; ?>
									<?php if ( ! empty( $support_url ) ) : ?>
										<div class="aivi-settings-token-card__actions">
											<a class="button button-secondary" href="<?php echo esc_url( $support_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Request connection token', 'ai-visibility-inspector' ); ?></a>
										</div>
									<?php endif; ?>
								</div>
							</div>
							<section class="aivi-settings-card" style="margin-top:14px;">
								<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Connected sites', 'ai-visibility-inspector' ); ?></span>
								<h4 class="aivi-settings-card__title"><?php printf( esc_html__( '%1$s of %2$s slots in use', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $site_slots_used, '0' ) ), esc_html( self::format_dashboard_metric_value( $site_slots_total > 0 ? $site_slots_total : $max_sites_limit, '0' ) ) ); ?></h4>
								<?php if ( ! empty( $connected_sites ) ) : ?>
									<ul class="aivi-settings-list">
										<?php foreach ( $connected_sites as $connected_site ) : ?>
											<li>
												<strong><?php echo esc_html( self::format_dashboard_text_value( $connected_site['connected_domain'] ?? '', __( 'Unknown site', 'ai-visibility-inspector' ) ) ); ?></strong>
												<?php if ( ! empty( $connected_site['site_id'] ) ) : ?>
													<span class="aivi-settings-card__hint" style="display:block;"><?php echo esc_html( $connected_site['site_id'] ); ?></span>
												<?php endif; ?>
											</li>
										<?php endforeach; ?>
									</ul>
								<?php else : ?>
									<p class="aivi-settings-card__hint"><?php esc_html_e( 'No bound sites are currently recorded for this account.', 'ai-visibility-inspector' ); ?></p>
								<?php endif; ?>
							</section>
						<?php endif; ?>
					<?php endif; ?>
				</section>
				<section class="aivi-settings-section<?php echo 'support' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-panel="support" id="aivi-settings-tab-support">
					<div class="aivi-support-shell">
						<div class="aivi-support-shell__top">
							<div>
								<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Support center', 'ai-visibility-inspector' ); ?></span>
								<h3 class="aivi-support-shell__top-title"><?php esc_html_e( 'Create the right ticket fast', 'ai-visibility-inspector' ); ?></h3>
							</div>
							<div class="aivi-support-shell__chips">
								<span class="aivi-support-chip aivi-support-chip--highlight"><?php echo esc_html( $support_channel_label ); ?></span>
								<span class="aivi-support-chip"><?php esc_html_e( 'Site context attached', 'ai-visibility-inspector' ); ?></span>
							</div>
						</div>
						<div id="aivi-support-result" class="notice inline aivi-billing-result"></div>
						<div class="aivi-support-layout">
							<article class="aivi-support-card">
								<h4 class="aivi-support-card__title"><?php esc_html_e( 'Choose a category', 'ai-visibility-inspector' ); ?></h4>
								<div class="aivi-support-queue">
									<a href="<?php echo esc_url( $support_category_urls['billing'] ); ?>" class="aivi-support-queue__item <?php echo $support_category_is_billing ? 'is-active' : ''; ?>" data-aivi-support-category-button="billing" aria-pressed="<?php echo $support_category_is_billing ? 'true' : 'false'; ?>">
										<span class="aivi-support-queue__icon" aria-hidden="true">
											<svg viewBox="0 0 24 24"><path d="M12 3v18"></path><path d="M16 7.5c0-1.9-1.8-3.5-4-3.5S8 5.6 8 7.5 9.8 11 12 11s4 1.6 4 3.5S14.2 18 12 18s-4-1.6-4-3.5"></path></svg>
										</span>
										<span class="aivi-support-queue__copy"><strong><?php esc_html_e( 'Billing & Plans', 'ai-visibility-inspector' ); ?></strong><small><?php esc_html_e( 'Credits, invoices, renewals', 'ai-visibility-inspector' ); ?></small></span>
										<span class="aivi-support-queue__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></span>
									</a>
									<a href="<?php echo esc_url( $support_category_urls['connection'] ); ?>" class="aivi-support-queue__item <?php echo $support_category_is_connection ? 'is-active' : ''; ?>" data-aivi-support-category-button="connection" aria-pressed="<?php echo $support_category_is_connection ? 'true' : 'false'; ?>">
										<span class="aivi-support-queue__icon" aria-hidden="true">
											<svg viewBox="0 0 24 24"><path d="M10 14l-2 2a3 3 0 104.2 4.2l2-2"></path><path d="M14 10l2-2a3 3 0 10-4.2-4.2l-2 2"></path><path d="M8.5 15.5l7-7"></path></svg>
										</span>
										<span class="aivi-support-queue__copy"><strong><?php esc_html_e( 'Connection & Setup', 'ai-visibility-inspector' ); ?></strong><small><?php esc_html_e( 'Binding, reconnect, tokens', 'ai-visibility-inspector' ); ?></small></span>
										<span class="aivi-support-queue__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></span>
									</a>
									<a href="<?php echo esc_url( $support_category_urls['analysis'] ); ?>" class="aivi-support-queue__item <?php echo $support_category_is_analysis ? 'is-active' : ''; ?>" data-aivi-support-category-button="analysis" aria-pressed="<?php echo $support_category_is_analysis ? 'true' : 'false'; ?>">
										<span class="aivi-support-queue__icon aivi-support-queue__icon--ai" aria-hidden="true">AI</span>
										<span class="aivi-support-queue__copy"><strong><?php esc_html_e( 'Analysis & Results', 'ai-visibility-inspector' ); ?></strong><small><?php esc_html_e( 'Runs, reports, scores', 'ai-visibility-inspector' ); ?></small></span>
										<span class="aivi-support-queue__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></span>
									</a>
									<a href="<?php echo esc_url( $support_category_urls['general'] ); ?>" class="aivi-support-queue__item <?php echo $support_category_is_general ? 'is-active' : ''; ?>" data-aivi-support-category-button="general" aria-pressed="<?php echo $support_category_is_general ? 'true' : 'false'; ?>">
										<span class="aivi-support-queue__icon" aria-hidden="true">
											<svg viewBox="0 0 24 24"><path d="M9.1 9a3.4 3.4 0 116.3 1.8c-.5.9-1.2 1.3-2 1.8-.8.5-1.4 1-1.4 2.4"></path><path d="M12 18.5h.01"></path></svg>
										</span>
										<span class="aivi-support-queue__copy"><strong><?php esc_html_e( 'General Support', 'ai-visibility-inspector' ); ?></strong><small><?php esc_html_e( 'Anything else', 'ai-visibility-inspector' ); ?></small></span>
										<span class="aivi-support-queue__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></span>
									</a>
								</div>
							</article>
							<div class="aivi-support-card">
								<article class="aivi-support-ticket is-active" data-aivi-support-composer="true">
									<div class="aivi-support-ticket__head">
										<h4 id="aivi-support-title" class="aivi-support-ticket__title"><?php echo esc_html( $current_support_category_config['title'] ); ?></h4>
										<span class="aivi-support-chip"><?php echo esc_html( $support_channel_label ); ?></span>
									</div>
									<div class="aivi-support-ticket__body">
										<div class="aivi-support-ticket__meta">
											<div class="aivi-support-ticket__meta-item"><span><?php esc_html_e( 'Plan', 'ai-visibility-inspector' ); ?></span><strong><?php echo esc_html( $plan_name ); ?></strong></div>
											<div class="aivi-support-ticket__meta-item aivi-support-ticket__meta-item--wide"><span><?php esc_html_e( 'Site', 'ai-visibility-inspector' ); ?></span><strong><?php echo esc_html( $connected_domain ); ?></strong></div>
											<div class="aivi-support-ticket__meta-item"><span><?php esc_html_e( 'Email', 'ai-visibility-inspector' ); ?></span><strong><?php echo esc_html( $support_contact_email ); ?></strong></div>
											<div class="aivi-support-ticket__meta-item"><span><?php esc_html_e( 'Site ID', 'ai-visibility-inspector' ); ?></span><strong><?php echo esc_html( $support_site_id ); ?></strong></div>
										</div>
										<div class="aivi-support-ticket__form">
											<div class="aivi-support-ticket__field aivi-support-ticket__field--full">
												<label for="aivi-support-subject"><?php esc_html_e( 'Subject', 'ai-visibility-inspector' ); ?></label>
												<input type="text" id="aivi-support-subject" value="<?php echo esc_attr( $current_support_category_config['subject'] ); ?>">
											</div>
											<div class="aivi-support-ticket__field">
												<label for="aivi-support-category"><?php esc_html_e( 'Category', 'ai-visibility-inspector' ); ?></label>
												<input type="text" id="aivi-support-category" value="<?php echo esc_attr( $current_support_category_config['category_label'] ); ?>" readonly>
											</div>
											<div class="aivi-support-ticket__field">
												<label for="aivi-support-priority"><?php esc_html_e( 'Priority', 'ai-visibility-inspector' ); ?></label>
												<input type="text" id="aivi-support-priority" value="<?php echo esc_attr( $current_support_category_config['priority'] ); ?>" readonly>
											</div>
											<div class="aivi-support-ticket__field aivi-support-ticket__field--full">
												<label for="aivi-support-message-compose"><?php esc_html_e( 'Message', 'ai-visibility-inspector' ); ?></label>
												<textarea id="aivi-support-message-compose" data-aivi-support-default-message="<?php echo esc_attr( $current_support_category_config['message'] ); ?>" data-aivi-support-category="<?php echo esc_attr( $current_support_category_config['key'] ); ?>" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="true"><?php echo esc_textarea( $current_support_category_config['message'] ); ?></textarea>
											</div>
										</div>
										<div class="aivi-support-ticket__actions">
											<div class="aivi-support-ticket__note"><?php printf( esc_html__( 'Prefilled: site URL, site ID, plugin version %1$s, WordPress %2$s', 'ai-visibility-inspector' ), esc_html( $support_plugin_version ), esc_html( $support_wp_version ) ); ?></div>
											<div class="aivi-support-ticket__cta">
												<?php if ( ! empty( $current_support_category_config['context_link_url'] ) && ! empty( $current_support_category_config['context_link_label'] ) ) : ?>
													<?php $is_internal_context_link = false !== strpos( (string) $current_support_category_config['context_link_url'], 'page=' . self::PAGE_SLUG ); ?>
													<a id="aivi-support-context-link" class="button button-secondary" href="<?php echo esc_url( $current_support_category_config['context_link_url'] ); ?>" <?php echo $is_internal_context_link ? '' : 'target="_blank" rel="noreferrer noopener"'; ?>><?php echo esc_html( $current_support_category_config['context_link_label'] ); ?></a>
												<?php else : ?>
													<a id="aivi-support-context-link" class="button button-secondary" href="#" hidden><?php esc_html_e( 'Documentation', 'ai-visibility-inspector' ); ?></a>
												<?php endif; ?>
												<?php if ( $support_has_zoho_asap || ! empty( $support_url ) ) : ?>
													<button
														type="button"
														class="button button-primary"
														data-aivi-support-submit="<?php echo esc_attr( $current_support_category_config['key'] ); ?>"
														id="aivi-support-submit"
													><?php echo esc_html( $support_has_zoho_asap ? __( 'Create ticket', 'ai-visibility-inspector' ) : __( 'Open support portal', 'ai-visibility-inspector' ) ); ?></button>
												<?php else : ?>
													<span class="aivi-support-ticket__pending"><?php esc_html_e( 'Support link pending', 'ai-visibility-inspector' ); ?></span>
												<?php endif; ?>
											</div>
										</div>
									</div>
								</article>
							</div>
						</div>
					</div>
				</section>
				<section class="aivi-settings-section<?php echo 'documentation' === $requested_settings_tab ? ' is-active' : ''; ?>" data-aivi-settings-tab-panel="documentation" id="aivi-settings-tab-documentation">
					<div class="aivi-docs-shell">
						<div class="aivi-docs-hero">
							<div>
								<span class="aivi-docs-hero__eyebrow"><?php esc_html_e( 'AiVI knowledge surface', 'ai-visibility-inspector' ); ?></span>
								<h3 class="aivi-docs-hero__title"><?php esc_html_e( 'Open the right guide without leaving AiVI.', 'ai-visibility-inspector' ); ?></h3>
								<p class="aivi-docs-hero__desc"><?php esc_html_e( 'Use the documentation hub to understand checks, fix issues, review policy guidance, and work through contributor docs from the same settings workspace.', 'ai-visibility-inspector' ); ?></p>
							</div>
							<div class="aivi-docs-hero__actions">
								<a class="button button-primary" href="<?php echo esc_url( $documentation_entry_urls['user-guide'] ); ?>" data-aivi-doc-button="user-guide"><?php esc_html_e( 'Start here', 'ai-visibility-inspector' ); ?></a>
								<a class="button button-secondary" href="<?php echo esc_url( $support_tab_href ); ?>" data-aivi-settings-tab-link="support"><?php esc_html_e( 'Open support', 'ai-visibility-inspector' ); ?></a>
								<?php if ( ! empty( $docs_url ) ) : ?>
									<a class="button button-secondary" href="<?php echo esc_url( $docs_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Hosted docs', 'ai-visibility-inspector' ); ?></a>
								<?php endif; ?>
							</div>
						</div>
						<div class="aivi-docs-layout">
							<aside class="aivi-docs-panel aivi-docs-nav">
								<h4 class="aivi-docs-nav__title"><?php esc_html_e( 'Browse the docs', 'ai-visibility-inspector' ); ?></h4>
								<?php foreach ( $documentation_groups as $group_key => $group_label ) : ?>
									<div class="aivi-docs-nav__group">
										<span class="aivi-docs-nav__label"><?php echo esc_html( $group_label ); ?></span>
										<?php foreach ( $documentation_catalog as $doc_slug => $doc_entry ) : ?>
											<?php if ( $group_key !== $doc_entry['group'] ) : ?>
												<?php continue; ?>
											<?php endif; ?>
											<a href="<?php echo esc_url( $documentation_entry_urls[ $doc_slug ] ); ?>" class="aivi-docs-nav__item<?php echo $requested_doc_slug === $doc_slug ? ' is-active' : ''; ?>" data-aivi-doc-button="<?php echo esc_attr( $doc_slug ); ?>">
												<strong><?php echo esc_html( $doc_entry['title'] ); ?></strong>
												<span><?php echo esc_html( $doc_entry['summary'] ); ?></span>
											</a>
										<?php endforeach; ?>
									</div>
								<?php endforeach; ?>
							</aside>
							<div class="aivi-docs-panel aivi-docs-main">
								<?php foreach ( $documentation_catalog as $doc_slug => $doc_entry ) : ?>
									<?php $doc_payload = self::get_documentation_entry_payload( $doc_slug, $doc_entry ); ?>
									<article class="aivi-docs-article<?php echo $requested_doc_slug === $doc_slug ? ' is-active' : ''; ?>" data-aivi-doc-panel="<?php echo esc_attr( $doc_slug ); ?>" id="aivi-doc-<?php echo esc_attr( $doc_slug ); ?>">
										<div class="aivi-docs-article__top">
											<div class="aivi-docs-article__meta">
												<span class="aivi-docs-article__chip"><?php echo esc_html( $doc_entry['kind'] ); ?></span>
												<span class="aivi-docs-article__chip"><?php esc_html_e( 'Current', 'ai-visibility-inspector' ); ?></span>
												<span class="aivi-docs-article__chip"><?php echo esc_html( $doc_entry['audience'] ); ?></span>
											</div>
											<div class="aivi-docs-article__meta">
												<span class="aivi-docs-article__chip">
													<?php
													printf(
														esc_html__( 'Plugin v%s', 'ai-visibility-inspector' ),
														esc_html( $support_plugin_version )
													);
													?>
												</span>
											</div>
										</div>
										<div class="aivi-docs-article__body">
											<h4 class="aivi-docs-article__title"><?php echo esc_html( $doc_payload['title'] ); ?></h4>
											<p class="aivi-docs-article__lead"><?php echo esc_html( $doc_entry['summary'] ); ?></p>
											<?php echo wp_kses_post( $doc_payload['html'] ); ?>
										</div>
									</article>
								<?php endforeach; ?>
							</div>
							<aside class="aivi-docs-panel aivi-docs-utility">
								<h4 class="aivi-docs-utility__title"><?php esc_html_e( 'Related tools', 'ai-visibility-inspector' ); ?></h4>
								<div class="aivi-docs-utility__card">
									<strong><?php esc_html_e( 'Need the meaning of a check?', 'ai-visibility-inspector' ); ?></strong>
									<p><?php esc_html_e( 'Jump into the Check Reference when you need the current pass, partial, fail, or edge-case guidance behind a surfaced finding.', 'ai-visibility-inspector' ); ?></p>
									<a class="button button-secondary" href="<?php echo esc_url( $documentation_entry_urls['check-reference'] ); ?>" data-aivi-doc-button="check-reference"><?php esc_html_e( 'Open Check Reference', 'ai-visibility-inspector' ); ?></a>
								</div>
								<div class="aivi-docs-utility__card">
									<strong><?php esc_html_e( 'Still blocked after reading?', 'ai-visibility-inspector' ); ?></strong>
									<p><?php esc_html_e( 'Move into the Support tab when you need site-specific help with connection, billing, or analysis behavior.', 'ai-visibility-inspector' ); ?></p>
									<a class="button button-secondary" href="<?php echo esc_url( $support_tab_href ); ?>" data-aivi-settings-tab-link="support"><?php esc_html_e( 'Open Support', 'ai-visibility-inspector' ); ?></a>
								</div>
								<div class="aivi-docs-utility__card">
									<strong><?php esc_html_e( 'Documentation status', 'ai-visibility-inspector' ); ?></strong>
									<div class="aivi-docs-status-list">
										<div class="aivi-docs-status"><span><?php esc_html_e( 'Docs baseline', 'ai-visibility-inspector' ); ?></span><b><?php esc_html_e( 'Current', 'ai-visibility-inspector' ); ?></b></div>
										<div class="aivi-docs-status"><span><?php esc_html_e( 'Plugin package', 'ai-visibility-inspector' ); ?></span><b><?php esc_html_e( 'Ready', 'ai-visibility-inspector' ); ?></b></div>
										<div class="aivi-docs-status"><span><?php esc_html_e( 'Public repo sync', 'ai-visibility-inspector' ); ?></span><b><?php esc_html_e( 'Aligned', 'ai-visibility-inspector' ); ?></b></div>
									</div>
								</div>
							</aside>
						</div>
					</div>
				</section>
			</div>
			<script>
			(function() {
				var shell = document.querySelector('.aivi-settings-shell');
				if (!shell) {
					return;
				}

				var buttons = Array.prototype.slice.call(shell.querySelectorAll('[data-aivi-settings-tab-button]'));
				var panels = Array.prototype.slice.call(shell.querySelectorAll('[data-aivi-settings-tab-panel]'));
				var inlineTabLinks = Array.prototype.slice.call(shell.querySelectorAll('[data-aivi-settings-tab-link]'));
				var docButtons = Array.prototype.slice.call(shell.querySelectorAll('[data-aivi-doc-button]'));
				var docPanels = Array.prototype.slice.call(shell.querySelectorAll('[data-aivi-doc-panel]'));
				if (!buttons.length || !panels.length) {
					return;
				}

				function normalizeTab(tabOrHash) {
					var value = String(tabOrHash || '').replace(/^#/, '').trim().toLowerCase();
					if (!value) {
						return 'overview';
					}

					if (value === 'overview' || value === 'aivi-settings-tab-overview' || value === 'aivi-billing-status') {
						return 'overview';
					}
					if (value === 'billing' || value === 'aivi-settings-tab-billing' || value === 'aivi-billing-plans') {
						return 'billing';
					}
					if (value === 'credits' || value === 'aivi-settings-tab-credits' || value === 'aivi-billing-topups') {
						return 'credits';
					}
					if (value === 'connection' || value === 'aivi-settings-tab-connection') {
						return 'connection';
					}
					if (value === 'support' || value === 'help' || value === 'aivi-settings-tab-support' || value === 'aivi-settings-tab-help' || value === 'aivi-settings-tab-support-panel') {
						return 'support';
					}
					if (value === 'documentation' || value === 'docs' || value === 'aivi-settings-tab-documentation' || value.indexOf('aivi-doc-') === 0) {
						return 'documentation';
					}

					return 'overview';
				}

				function normalizeDoc(docOrHash) {
					var fallback = shell.getAttribute('data-aivi-active-doc') || 'user-guide';
					var value = String(docOrHash || '').replace(/^#/, '').trim().toLowerCase();
					if (value.indexOf('aivi-doc-') === 0) {
						value = value.substring(9);
					}
					if (!value) {
						return fallback;
					}
					if (!shell.querySelector('[data-aivi-doc-button="' + value + '"]') || !shell.querySelector('[data-aivi-doc-panel="' + value + '"]')) {
						return fallback;
					}
					return value;
				}

				function getPanelForTab(tab) {
					return shell.querySelector('[data-aivi-settings-tab-panel="' + tab + '"]');
				}

				function getDocPanelForSlug(slug) {
					return shell.querySelector('[data-aivi-doc-panel="' + slug + '"]');
				}

				function buildUrlForState(tab, supportCategory, docSlug) {
					var url = new URL(window.location.href);
					url.searchParams.set('aivi_tab', tab);
					if (tab === 'support') {
						url.searchParams.set('aivi_support_category', supportCategory || shell.getAttribute('data-aivi-active-support-category') || 'billing');
						url.searchParams.delete('aivi_doc');
					} else if (tab === 'documentation') {
						var activeDoc = normalizeDoc(docSlug || shell.getAttribute('data-aivi-active-doc') || 'user-guide');
						var activeDocPanel = getDocPanelForSlug(activeDoc);
						url.searchParams.set('aivi_doc', activeDoc);
						url.searchParams.delete('aivi_support_category');
						url.hash = activeDocPanel && activeDocPanel.id ? activeDocPanel.id : 'aivi-settings-tab-documentation';
						return url.toString();
					} else {
						url.searchParams.delete('aivi_support_category');
						url.searchParams.delete('aivi_doc');
					}
					var panel = getPanelForTab(tab);
					url.hash = panel && panel.id ? panel.id : 'aivi-settings-tab-' + tab;
					return url.toString();
				}

				function activateDoc(docOrHash, updateHistory) {
					if (!docButtons.length || !docPanels.length) {
						return shell.getAttribute('data-aivi-active-doc') || 'user-guide';
					}

					var slug = normalizeDoc(docOrHash);
					shell.setAttribute('data-aivi-active-doc', slug);

					docButtons.forEach(function(button) {
						button.classList.toggle('is-active', button.getAttribute('data-aivi-doc-button') === slug);
					});

					docPanels.forEach(function(panel) {
						panel.classList.toggle('is-active', panel.getAttribute('data-aivi-doc-panel') === slug);
					});

					if (updateHistory && window.history && window.history.replaceState) {
						window.history.replaceState(
							null,
							document.title,
							buildUrlForState('documentation', shell.getAttribute('data-aivi-active-support-category') || 'billing', slug)
						);
					}

					return slug;
				}

				function activateTab(tabOrHash, updateHash) {
					var tab = normalizeTab(tabOrHash);
					if (!shell.querySelector('[data-aivi-settings-tab-button="' + tab + '"]') || !getPanelForTab(tab)) {
						tab = 'overview';
					}

					buttons.forEach(function(button) {
						var isActive = button.getAttribute('data-aivi-settings-tab-button') === tab;
						button.classList.toggle('is-active', isActive);
						button.setAttribute('aria-selected', isActive ? 'true' : 'false');
					});

					panels.forEach(function(panel) {
						panel.classList.toggle('is-active', panel.getAttribute('data-aivi-settings-tab-panel') === tab);
					});

					if (updateHash && window.history && window.history.replaceState) {
						window.history.replaceState(
							null,
							document.title,
							buildUrlForState(
								tab,
								shell.getAttribute('data-aivi-active-support-category') || 'billing',
								shell.getAttribute('data-aivi-active-doc') || 'user-guide'
							)
						);
					}

					return tab;
				}

				buttons.forEach(function(button) {
					button.addEventListener('click', function(event) {
						event.preventDefault();
						activateTab(button.getAttribute('data-aivi-settings-tab-button') || button.getAttribute('href'), true);
					});
				});

				inlineTabLinks.forEach(function(link) {
					link.addEventListener('click', function(event) {
						event.preventDefault();
						if (typeof window.aiviOpenSettingsLocation === 'function') {
							window.aiviOpenSettingsLocation(link.getAttribute('href') || '', true);
							return;
						}
						activateTab(link.getAttribute('data-aivi-settings-tab-link') || link.getAttribute('href'), true);
					});
				});

				docButtons.forEach(function(button) {
					button.addEventListener('click', function(event) {
						event.preventDefault();
						activateTab('documentation', false);
						activateDoc(button.getAttribute('data-aivi-doc-button') || button.getAttribute('href'), true);
					});
				});

				window.addEventListener('hashchange', function() {
					var tab = normalizeTab(window.location.hash);
					activateTab(tab, false);
					if (tab === 'documentation') {
						activateDoc(window.location.hash, false);
					}
				});

				window.aiviOpenSettingsLocation = function(urlOrPath, updateHistory) {
					var rawValue = String(urlOrPath || '').trim();
					if (!rawValue) {
						return;
					}

					try {
						var targetUrl = new URL(rawValue, window.location.href);
						var targetTab = normalizeTab(targetUrl.searchParams.get('aivi_tab') || targetUrl.hash);
						var targetSupportCategory = String(targetUrl.searchParams.get('aivi_support_category') || shell.getAttribute('data-aivi-active-support-category') || 'billing').trim().toLowerCase();
						var targetDoc = targetUrl.searchParams.get('aivi_doc') || targetUrl.hash;

						activateTab(targetTab, false);

						if (targetTab === 'documentation') {
							activateDoc(targetDoc, false);
						}

						if (targetTab === 'support' && typeof window.aiviActivateSupportCategory === 'function') {
							window.aiviActivateSupportCategory(targetSupportCategory, {
								forceMessage: false,
								updateHistory: false
							});
						}

						if (updateHistory !== false && window.history && window.history.replaceState) {
							window.history.replaceState(
								null,
								document.title,
								buildUrlForState(
									targetTab,
									targetSupportCategory,
									targetTab === 'documentation' ? normalizeDoc(targetDoc) : (shell.getAttribute('data-aivi-active-doc') || 'user-guide')
								)
							);
						}
					} catch (error) {
						window.location.href = rawValue;
					}
				};

				window.aiviActivateSettingsTab = activateTab;
				var initialUrl = new URL(window.location.href);
				activateTab(initialUrl.searchParams.get('aivi_tab') || window.location.hash, false);
				activateDoc(initialUrl.searchParams.get('aivi_doc') || window.location.hash, false);
			})();
			</script>
			<script>
			(function($) {
				var shell = document.querySelector('.aivi-settings-shell');
				if (!shell) return;
				var sharedRuntime = window.AIVI_SETTINGS_RUNTIME = window.AIVI_SETTINGS_RUNTIME || {};
				var supportButtons = Array.prototype.slice.call(shell.querySelectorAll('[data-aivi-support-category-button]'));
				var supportSubmitButton = document.getElementById('aivi-support-submit');
				var supportResult = $('#aivi-support-result');
				var supportComposer = shell.querySelector('[data-aivi-support-composer="true"]');
				var supportTitle = document.getElementById('aivi-support-title');
				var supportSubject = document.getElementById('aivi-support-subject');
				var supportCategoryInput = document.getElementById('aivi-support-category');
				var supportPriorityInput = document.getElementById('aivi-support-priority');
				var supportMessage = document.getElementById('aivi-support-message-compose');
				var supportContextLink = document.getElementById('aivi-support-context-link');
				var localSupportCenterConfig = <?php echo wp_json_encode( $support_center_config ); ?>;
				var supportCategoryConfig = <?php echo wp_json_encode( $support_category_configs ); ?>;
				var zohoDeskAsapLoadPromise = null;
				if (!supportButtons.length || !supportComposer || !supportSubject || !supportCategoryInput || !supportPriorityInput || !supportMessage) {
					return;
				}
				function getRuntimeConfig() {
					var runtime = window.AIVI_SETTINGS_RUNTIME || sharedRuntime;
					return runtime && typeof runtime.getSettingsApiConfig === 'function'
						? runtime.getSettingsApiConfig()
						: {};
				}
				function showRuntimeNotice(target, kind, message) {
					var runtime = window.AIVI_SETTINGS_RUNTIME || sharedRuntime;
					if (runtime && typeof runtime.setInlineNotice === 'function') {
						runtime.setInlineNotice(target, kind, message);
					}
				}
				function getSupportCenterConfig() {
					var cfg = getRuntimeConfig();
					if (cfg.supportCenter && typeof cfg.supportCenter === 'object' && Object.keys(cfg.supportCenter).length) {
						return cfg.supportCenter;
					}
					if (localSupportCenterConfig && typeof localSupportCenterConfig === 'object') {
						return localSupportCenterConfig;
					}
					return {};
				}
				function sanitizeSupportValue(value) {
					return String(value || '').trim();
				}
				function messageLooksCorrupted(value) {
					return /wp-die-message|There has been a critical error on this website|<\/html>/i.test(String(value || ''));
				}
				function normalizeSupportCategory(category) {
					var key = sanitizeSupportValue(category).toLowerCase();
					return Object.prototype.hasOwnProperty.call(supportCategoryConfig, key) ? key : 'billing';
				}
				function getSupportCategoryState(category) {
					return supportCategoryConfig[ normalizeSupportCategory(category) ] || supportCategoryConfig.billing || {};
				}
				function isInternalSupportLink(url) {
					return sanitizeSupportValue(url).indexOf('admin.php?page=<?php echo esc_js( self::PAGE_SLUG ); ?>') !== -1;
				}
				function applySupportContextLink(categoryState) {
					if (!supportContextLink) {
						return;
					}
					var href = sanitizeSupportValue(categoryState.context_link_url);
					var label = sanitizeSupportValue(categoryState.context_link_label);
					if (!href || !label) {
						supportContextLink.hidden = true;
						supportContextLink.setAttribute('href', '#');
						supportContextLink.textContent = '<?php echo esc_js( __( 'Documentation', 'ai-visibility-inspector' ) ); ?>';
						supportContextLink.removeAttribute('target');
						supportContextLink.removeAttribute('rel');
						return;
					}
					supportContextLink.hidden = false;
					supportContextLink.setAttribute('href', href);
					supportContextLink.textContent = label;
					if (isInternalSupportLink(href)) {
						supportContextLink.removeAttribute('target');
						supportContextLink.removeAttribute('rel');
						return;
					}
					supportContextLink.setAttribute('target', '_blank');
					supportContextLink.setAttribute('rel', 'noreferrer noopener');
				}
				function resetSupportMessageIfNeeded(categoryKey, options) {
					var opts = options || {};
					var categoryState = getSupportCategoryState(categoryKey);
					var currentValue = String(supportMessage.value || '');
					var previousCategory = sanitizeSupportValue(supportMessage.getAttribute('data-aivi-support-category'));
					supportMessage.setAttribute('data-aivi-support-default-message', categoryState.message || '');
					supportMessage.setAttribute('data-aivi-support-category', categoryKey);
					if (opts.forceMessage || !currentValue.trim() || messageLooksCorrupted(currentValue) || previousCategory !== categoryKey) {
						supportMessage.value = sanitizeSupportValue(categoryState.message);
					}
				}
				function isValidSupportEmail(value) {
					return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizeSupportValue(value).toLowerCase());
				}
				function buildSupportContextLines(state) {
					var context = state.context || {};
					var lines = [
						'--- AiVI context ---',
						'Category: ' + sanitizeSupportValue(state.category),
						'Priority: ' + sanitizeSupportValue(state.priority),
						'Account: ' + sanitizeSupportValue(context.account_label),
						'Plan: ' + sanitizeSupportValue(context.plan_name),
						'Site: ' + sanitizeSupportValue(context.connected_domain),
						'Site URL: ' + sanitizeSupportValue(context.site_url),
						'Site ID: ' + sanitizeSupportValue(context.site_id),
						'Plugin version: ' + sanitizeSupportValue(context.plugin_version),
						'WordPress version: ' + sanitizeSupportValue(context.wp_version)
					];
					if (sanitizeSupportValue(context.binding_status)) {
						lines.push('Binding: ' + sanitizeSupportValue(context.binding_status));
					}
					if (sanitizeSupportValue(context.last_result)) {
						lines.push('Last result: ' + sanitizeSupportValue(context.last_result));
					}
					if (sanitizeSupportValue(context.last_sync)) {
						lines.push('Last sync: ' + sanitizeSupportValue(context.last_sync));
					}
					return lines.filter(function(line) {
						return line && !/:\s*$/.test(line);
					});
				}
				function getSupportTicketState(category) {
					var normalizedCategory = normalizeSupportCategory(category || shell.getAttribute('data-aivi-active-support-category'));
					var supportConfig = getSupportCenterConfig();
					var context = $.extend({}, supportConfig.context || {}, {
						category: sanitizeSupportValue(supportCategoryInput.value || getSupportCategoryState(normalizedCategory).category_label || normalizedCategory),
						priority: sanitizeSupportValue(supportPriorityInput.value || 'Normal'),
						subject: sanitizeSupportValue(supportSubject.value || ''),
						message: sanitizeSupportValue(supportMessage.value || '')
					});
					if (normalizedCategory === 'connection') {
						context.binding_status = sanitizeSupportValue(<?php echo wp_json_encode( $binding_status ); ?>);
					}
					if (normalizedCategory === 'analysis') {
						context.last_result = sanitizeSupportValue(<?php echo wp_json_encode( $last_run_status ); ?>);
						context.last_sync = sanitizeSupportValue(<?php echo wp_json_encode( $last_sync ); ?>);
					}
					return {
						categoryKey: normalizedCategory,
						category: sanitizeSupportValue(supportCategoryInput.value || normalizedCategory),
						priority: sanitizeSupportValue(supportPriorityInput.value || 'Normal'),
						subject: sanitizeSupportValue(supportSubject.value || ''),
						message: sanitizeSupportValue(supportMessage.value || ''),
						context: context
					};
				}
				function openSupportFallback(state, message) {
					var supportConfig = getSupportCenterConfig();
					if (supportConfig.support_url) {
						window.open(supportConfig.support_url, '_blank', 'noopener,noreferrer');
						showRuntimeNotice(supportResult, 'warning', message || '<?php echo esc_js( __( 'Opening the support portal in a new tab.', 'ai-visibility-inspector' ) ); ?>');
						return;
					}
					showRuntimeNotice(supportResult, 'error', '<?php echo esc_js( __( 'Support is not configured on this site yet.', 'ai-visibility-inspector' ) ); ?>');
				}
				function ensureZohoDeskAsapBridge() {
					if (typeof window.ZohoDeskAsapReady === 'function') {
						return;
					}
					window.ZohoDeskAsapReady = function(callback) {
						var queue = window.ZohoDeskAsap__asyncalls = window.ZohoDeskAsap__asyncalls || [];
						if (window.ZohoDeskAsapReadyStatus) {
							if (typeof callback === 'function') {
								queue.push(callback);
							}
							queue.forEach(function(fn) {
								if (typeof fn === 'function') {
									fn();
								}
							});
							window.ZohoDeskAsap__asyncalls = null;
							return;
						}
						if (typeof callback === 'function') {
							queue.push(callback);
						}
					};
				}
				function reserveSupportFallbackWindow(supportConfig) {
					if (!supportConfig || !sanitizeSupportValue(supportConfig.support_url)) {
						return null;
					}
					if (window.ZohoDeskAsap && typeof window.ZohoDeskAsap.invoke === 'function') {
						return null;
					}
					try {
						return window.open('', '_blank', 'noopener,noreferrer');
					} catch (error) {
						return null;
					}
				}
				function closeReservedSupportWindow(reservedWindow) {
					if (!reservedWindow || reservedWindow.closed) {
						return;
					}
					try {
						reservedWindow.close();
					} catch (error) {
					}
				}
				function openSupportFallbackWithWindow(state, message, reservedWindow) {
					var supportConfig = getSupportCenterConfig();
					var supportUrl = sanitizeSupportValue(supportConfig.support_url);
					if (!supportUrl) {
						closeReservedSupportWindow(reservedWindow);
						showRuntimeNotice(supportResult, 'error', '<?php echo esc_js( __( 'Support is not configured on this site yet.', 'ai-visibility-inspector' ) ); ?>');
						return;
					}
					var opened = false;
					if (reservedWindow && !reservedWindow.closed) {
						try {
							reservedWindow.location.href = supportUrl;
							opened = true;
						} catch (error) {
							opened = false;
						}
					}
					if (!opened) {
						try {
							opened = !!window.open(supportUrl, '_blank', 'noopener,noreferrer');
						} catch (error) {
							opened = false;
						}
					}
					if (!opened) {
						window.location.href = supportUrl;
					}
					showRuntimeNotice(supportResult, 'warning', message || '<?php echo esc_js( __( 'Opening the support portal in a new tab.', 'ai-visibility-inspector' ) ); ?>');
				}
				function buildZohoPrefillValues(state, supportConfig) {
					var fieldMap = supportConfig.zoho_asap && typeof supportConfig.zoho_asap.field_map === 'object' ? supportConfig.zoho_asap.field_map : {};
					var layoutKey = supportConfig.zoho_asap.department_id + '&&&' + supportConfig.zoho_asap.layout_id;
					var description = sanitizeSupportValue(state.message);
					var contextBlock = buildSupportContextLines(state).join('\n');
					if (contextBlock) {
						description = description ? description + '\n\n' + contextBlock : contextBlock;
					}
					var values = {
						subject: {
							defaultValue: sanitizeSupportValue(state.subject) || sanitizeSupportValue(supportConfig.zoho_asap.ticket_title)
						},
						description: {
							defaultValue: description
						}
					};
					if (isValidSupportEmail(state.context.email)) {
						values.email = {
							defaultValue: sanitizeSupportValue(state.context.email)
						};
					}
					Object.keys(fieldMap).forEach(function(sourceKey) {
						var targetField = sanitizeSupportValue(fieldMap[sourceKey]);
						var rawValue = '';
						if (sourceKey === 'subject') {
							rawValue = state.subject;
						} else if (sourceKey === 'message' || sourceKey === 'description') {
							rawValue = description;
						} else if (sourceKey === 'email') {
							rawValue = state.context.email;
						} else if (sourceKey === 'category') {
							rawValue = state.category;
						} else if (sourceKey === 'priority') {
							rawValue = state.priority;
						} else {
							rawValue = state.context[sourceKey];
						}
						rawValue = sanitizeSupportValue(rawValue);
						if (!targetField || !rawValue) {
							return;
						}
						values[targetField] = {
							defaultValue: rawValue,
							isHidden: ['subject', 'description', 'email'].indexOf(sourceKey) === -1
						};
					});
					var payload = {};
					payload[layoutKey] = values;
					return payload;
				}
				function ensureZohoDeskAsapReady(supportConfig) {
					if (window.ZohoDeskAsapReadyStatus && window.ZohoDeskAsap && typeof window.ZohoDeskAsap.invoke === 'function') {
						return Promise.resolve(window.ZohoDeskAsap);
					}
					if (zohoDeskAsapLoadPromise) {
						return zohoDeskAsapLoadPromise;
					}
					if (
						!supportConfig
						|| supportConfig.provider !== 'zoho_desk_asap'
						|| !supportConfig.zoho_asap
						|| !supportConfig.zoho_asap.widget_snippet_url
						|| !supportConfig.zoho_asap.department_id
						|| !supportConfig.zoho_asap.layout_id
					) {
						return Promise.reject(new Error('zoho_not_configured'));
					}
					ensureZohoDeskAsapBridge();
					zohoDeskAsapLoadPromise = new Promise(function(resolve, reject) {
						var timedOut = false;
						var timer = window.setTimeout(function() {
							timedOut = true;
							zohoDeskAsapLoadPromise = null;
							reject(new Error('zoho_timeout'));
						}, 12000);
						function finishWithReady() {
							if (timedOut) {
								return;
							}
							if (typeof window.ZohoDeskAsapReady === 'function') {
								window.ZohoDeskAsapReady(function() {
									if (timedOut) {
										return;
									}
									if (!window.ZohoDeskAsap || typeof window.ZohoDeskAsap.invoke !== 'function') {
										window.clearTimeout(timer);
										zohoDeskAsapLoadPromise = null;
										reject(new Error('zoho_api_unavailable'));
										return;
									}
									window.clearTimeout(timer);
									window.ZohoDeskAsapReadyStatus = true;
									resolve(window.ZohoDeskAsap);
								});
								return;
							}
							window.clearTimeout(timer);
							zohoDeskAsapLoadPromise = null;
							reject(new Error('zoho_api_unavailable'));
						}
						var existingScript = document.querySelector('script[data-aivi-zoho-asap="true"]');
						if (existingScript) {
							finishWithReady();
							return;
						}
						var script = document.createElement('script');
						script.src = supportConfig.zoho_asap.widget_snippet_url;
						script.async = true;
						script.defer = true;
						script.setAttribute('data-aivi-zoho-asap', 'true');
						script.onload = finishWithReady;
						script.onerror = function() {
							window.clearTimeout(timer);
							zohoDeskAsapLoadPromise = null;
							reject(new Error('zoho_load_failed'));
						};
						document.head.appendChild(script);
					});
					return zohoDeskAsapLoadPromise;
				}
				function openZohoSupportTicket(state, runtimeGuard) {
					var supportConfig = getSupportCenterConfig();
					var ticketTitle = sanitizeSupportValue(supportConfig.zoho_asap && supportConfig.zoho_asap.ticket_title)
						|| '<?php echo esc_js( __( 'AiVI Support', 'ai-visibility-inspector' ) ); ?>';
					return ensureZohoDeskAsapReady(supportConfig).then(function(api) {
						return new Promise(function(resolve, reject) {
							if (!api || typeof api.invoke !== 'function' || typeof api.set !== 'function') {
								reject(new Error('zoho_api_unavailable'));
								return;
							}
							var prefillValues = buildZohoPrefillValues(state, supportConfig);
							var routedTitle = ticketTitle + ' - ' + state.category;
							ensureZohoDeskAsapBridge();
							window.ZohoDeskAsapReady(function() {
								try {
									if (runtimeGuard && runtimeGuard.cancelled) {
										reject(new Error('zoho_cancelled'));
										return;
									}
									api.set('ticket.form.title', routedTitle);
									api.set('ticket.form.prefillValues', prefillValues);
									api.invoke('routeTo', {
										page: 'ticket.form',
										parameters: {
											departmentId: supportConfig.zoho_asap.department_id,
											layoutId: supportConfig.zoho_asap.layout_id
										}
									});
									api.invoke('open');
									resolve(api);
								} catch (error) {
									reject(error);
								}
							});
						});
					});
				}
				function activateSupportCategory(category, options) {
					var opts = options || {};
					var activeCategory = normalizeSupportCategory(category || shell.getAttribute('data-aivi-active-support-category'));
					var categoryState = getSupportCategoryState(activeCategory);
					shell.setAttribute('data-aivi-active-support-category', activeCategory);
					supportButtons.forEach(function(button) {
						var isActive = button.getAttribute('data-aivi-support-category-button') === activeCategory;
						button.classList.toggle('is-active', isActive);
						button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
					});
					supportComposer.classList.add('is-active');
					if (supportTitle) {
						supportTitle.textContent = sanitizeSupportValue(categoryState.title);
					}
					supportSubject.value = sanitizeSupportValue(categoryState.subject);
					supportCategoryInput.value = sanitizeSupportValue(categoryState.category_label);
					supportPriorityInput.value = sanitizeSupportValue(categoryState.priority || 'Normal');
					resetSupportMessageIfNeeded(activeCategory, opts);
					applySupportContextLink(categoryState);
					if (supportSubmitButton) {
						supportSubmitButton.setAttribute('data-aivi-support-submit', activeCategory);
					}
					if (opts.updateHistory !== false && window.history && window.history.replaceState) {
						var url = new URL(window.location.href);
						url.searchParams.set('aivi_tab', 'support');
						url.searchParams.set('aivi_support_category', activeCategory);
						url.hash = 'aivi-settings-tab-support';
						window.history.replaceState(null, document.title, url.toString());
					}
				}
				window.aiviActivateSupportCategory = activateSupportCategory;
				supportButtons.forEach(function(button) {
					button.addEventListener('click', function(event) {
						event.preventDefault();
						activateSupportCategory(button.getAttribute('data-aivi-support-category-button') || 'billing', {
							forceMessage: true
						});
					});
				});
				if (supportContextLink) {
					supportContextLink.addEventListener('click', function(event) {
						if (!supportContextLink.hidden && isInternalSupportLink(supportContextLink.getAttribute('href') || '')) {
							event.preventDefault();
							if (typeof window.aiviOpenSettingsLocation === 'function') {
								window.aiviOpenSettingsLocation(supportContextLink.getAttribute('href') || '', true);
								return;
							}
							window.location.href = supportContextLink.getAttribute('href') || '<?php echo esc_js( $support_tab_href ); ?>';
						}
					});
				}
				if (supportSubmitButton) {
					supportSubmitButton.addEventListener('click', function(event) {
						event.preventDefault();
						var category = supportSubmitButton.getAttribute('data-aivi-support-submit') || shell.getAttribute('data-aivi-active-support-category') || 'billing';
						var state = getSupportTicketState(category);
						if (!state) {
							showRuntimeNotice(supportResult, 'error', '<?php echo esc_js( __( 'AiVI could not collect the support details for this request.', 'ai-visibility-inspector' ) ); ?>');
							return;
						}
						var supportConfig = getSupportCenterConfig();
						var reservedWindow = reserveSupportFallbackWindow(supportConfig);
						if (supportConfig.provider !== 'zoho_desk_asap') {
							openSupportFallbackWithWindow(state, null, reservedWindow);
							return;
						}
						var zohoGuard = { cancelled: false };
						showRuntimeNotice(supportResult, 'warning', '<?php echo esc_js( __( 'Opening the support composer with your site context attached...', 'ai-visibility-inspector' ) ); ?>');
						Promise.race([
							openZohoSupportTicket(state, zohoGuard),
							new Promise(function(resolve, reject) {
								window.setTimeout(function() {
									zohoGuard.cancelled = true;
									reject(new Error('zoho_open_timeout'));
								}, 2500);
							})
						]).then(function() {
							closeReservedSupportWindow(reservedWindow);
							showRuntimeNotice(supportResult, 'success', '<?php echo esc_js( __( 'Zoho Desk is ready. Your ticket form has been prefilled with the selected support context.', 'ai-visibility-inspector' ) ); ?>');
						}).catch(function(error) {
							if (error && (error.message === 'zoho_not_configured' || error.message === 'zoho_open_timeout')) {
								openSupportFallbackWithWindow(state, null, reservedWindow);
								return;
							}
							if (error && error.message === 'zoho_cancelled') {
								return;
							}
							openSupportFallbackWithWindow(state, '<?php echo esc_js( __( 'Zoho Desk could not open just now, so AiVI opened the support portal instead.', 'ai-visibility-inspector' ) ); ?>', reservedWindow);
						});
					});
				}
				(function prewarmZohoSupportWidget() {
					var supportConfig = getSupportCenterConfig();
					if (!supportConfig || supportConfig.provider !== 'zoho_desk_asap') {
						return;
					}
					window.setTimeout(function() {
						ensureZohoDeskAsapReady(supportConfig).catch(function() {});
					}, 0);
				})();
				activateSupportCategory(shell.getAttribute('data-aivi-active-support-category') || 'billing', {
					updateHistory: false
				});
			})(jQuery);
			</script>
		</div>
		<?php
	}

	/**
	 * Refresh pending subscription/account state from the authoritative backend before rendering.
	 *
	 * This closes the gap where PayPal activation succeeds server-side but the local dashboard
	 * still shows a stale "created/pending" snapshot until a separate JS refresh happens.
	 *
	 * @param array $dashboard_state Current normalized dashboard state.
	 * @param array $account_state Current normalized account state.
	 * @param array $site_identity Current site identity payload.
	 * @return array
	 */
	private static function maybe_refresh_pending_dashboard_state( $dashboard_state, $account_state, $site_identity ) {
		$account_id = sanitize_text_field( (string) ( $account_state['account_id'] ?? '' ) );
		if ( $account_id === '' ) {
			return $dashboard_state;
		}

		$subscription_status = strtolower( sanitize_text_field( (string) ( $dashboard_state['plan']['subscription_status'] ?? $account_state['subscription_status'] ?? '' ) ) );
		$last_sync_raw = sanitize_text_field( (string) ( $dashboard_state['account']['last_sync_at'] ?? $account_state['updated_at'] ?? '' ) );
		$last_sync_ts = $last_sync_raw !== '' ? strtotime( $last_sync_raw ) : false;
		$stale_snapshot = ! $last_sync_ts || $last_sync_ts < ( time() - 15 );
		$should_refresh = in_array( $subscription_status, array( 'created', 'pending' ), true ) || isset( $_GET['aivi_billing_return'] ) || $stale_snapshot;
		if ( ! $should_refresh ) {
			return $dashboard_state;
		}

		$site_id    = sanitize_text_field( (string) ( $site_identity['site_id'] ?? '' ) );
		$cache_key  = 'aivi_pending_dashboard_refresh_' . md5( $account_id . '|' . $site_id );
		if ( ! isset( $_GET['aivi_billing_return'] ) ) {
			$last_refresh = get_transient( $cache_key );
			if ( $last_refresh ) {
				return $dashboard_state;
			}
		}

		$backend_url = self::get_backend_url( 'account_summary' );
		if ( empty( $backend_url ) ) {
			return $dashboard_state;
		}

		$summary_url = trailingslashit( $backend_url ) . 'aivi/v1/account/summary';
		$summary_url = add_query_arg(
			array(
				'account_id' => $account_id,
				'site_id'    => sanitize_text_field( (string) ( $site_identity['site_id'] ?? '' ) ),
				'blog_id'    => (int) ( $site_identity['blog_id'] ?? 0 ),
				'home_url'   => esc_url_raw( (string) ( $site_identity['home_url'] ?? '' ) ),
				'admin_email' => sanitize_email( (string) ( $site_identity['admin_email'] ?? '' ) ),
			),
			$summary_url
		);

		$headers                               = self::get_api_headers();
		$headers['X-AIVI-Account-Id']          = $account_id;
		$headers['X-AIVI-Site-Id']             = sanitize_text_field( (string) ( $site_identity['site_id'] ?? '' ) );
		$headers['X-AIVI-Blog-Id']             = (string) ( (int) ( $site_identity['blog_id'] ?? 0 ) );
		$headers['X-AIVI-Home-Url']            = esc_url_raw( (string) ( $site_identity['home_url'] ?? '' ) );
		$headers['X-AIVI-Plugin-Version']      = sanitize_text_field( (string) ( $site_identity['plugin_version'] ?? '' ) );
		$headers['X-AIVI-Admin-Email']         = sanitize_email( (string) ( $site_identity['admin_email'] ?? '' ) );

		$response = wp_remote_get(
			$summary_url,
			array(
				'timeout'     => 8,
				'sslverify'   => true,
				'httpversion' => '1.1',
				'headers'     => $headers,
			)
		);

		set_transient( $cache_key, time(), 5 );

		if ( is_wp_error( $response ) ) {
			return $dashboard_state;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = wp_remote_retrieve_body( $response );
		$data        = json_decode( $body, true );
		if ( $status_code < 200 || $status_code >= 300 || ! is_array( $data ) ) {
			return $dashboard_state;
		}

		$remote_state     = is_array( $data['account_state'] ?? null ) ? $data['account_state'] : array();
		$remote_dashboard = is_array( $data['dashboard_summary'] ?? null ) ? $data['dashboard_summary'] : array();
		if ( empty( $remote_state ) && empty( $remote_dashboard ) ) {
			return $dashboard_state;
		}

		self::sync_remote_account_snapshot( $remote_state, $remote_dashboard );
		$refreshed_dashboard = self::get_account_dashboard_state();
		$refreshed_status    = strtolower( sanitize_text_field( (string) ( $refreshed_dashboard['plan']['subscription_status'] ?? '' ) ) );
		if ( $refreshed_status === 'active' ) {
			delete_transient( $cache_key );
		}
		return $refreshed_dashboard;
	}

	/**
	 * Render read-only account connection overview.
	 *
	 * @param array $account_state Normalized account state.
	 * @param array $site_identity Site identity payload.
	 * @return void
	 */
	private static function render_account_connection_panel( $account_state, $site_identity ) {
		$connection_status = self::normalize_connection_status( $account_state['connection_status'] ?? 'disconnected' );
		$status_label = self::get_connection_status_label( $connection_status );
		$plan_label = ! empty( $account_state['plan_name'] )
			? $account_state['plan_name']
			: __( 'No plan linked yet', 'ai-visibility-inspector' );
		$account_label = ! empty( $account_state['account_label'] )
			? $account_state['account_label']
			: __( 'No account linked yet', 'ai-visibility-inspector' );
		$connected_domain = ! empty( $account_state['site']['connected_domain'] )
			? $account_state['site']['connected_domain']
			: __( 'Not bound yet', 'ai-visibility-inspector' );
		$last_sync = self::format_account_sync_time( $account_state['updated_at'] ?? '' );
		$subscription_status = ! empty( $account_state['subscription_status'] )
			? $account_state['subscription_status']
			: __( 'Not available', 'ai-visibility-inspector' );
		$trial_status = ! empty( $account_state['trial_status'] )
			? $account_state['trial_status']
			: __( 'Not available', 'ai-visibility-inspector' );
		$badge_class = 'aivi-account-badge--' . esc_attr( $connection_status );
		?>
		<style>
			.aivi-account-card{
				margin:16px 0 22px;
				padding:18px 20px;
				background:#ffffff;
				border:1px solid #d7e0ee;
				border-radius:14px;
				box-shadow:0 1px 2px rgba(15,23,42,.04);
			}
			.aivi-account-card__header{
				display:flex;
				align-items:flex-start;
				justify-content:space-between;
				gap:16px;
				margin-bottom:14px;
				flex-wrap:wrap;
			}
			.aivi-account-card__title{
				margin:0;
				font-size:18px;
				line-height:1.2;
				font-weight:700;
			}
			.aivi-account-card__desc{
				margin:6px 0 0;
				color:#516175;
				max-width:720px;
			}
			.aivi-account-badge{
				display:inline-flex;
				align-items:center;
				gap:8px;
				padding:7px 12px;
				border-radius:999px;
				font-size:12px;
				font-weight:700;
				border:1px solid transparent;
			}
			.aivi-account-badge::before{
				content:'';
				width:8px;
				height:8px;
				border-radius:50%;
				background:currentColor;
			}
			.aivi-account-badge--connected{background:#edf9f3;border-color:#bfe4cc;color:#17633f;}
			.aivi-account-badge--pending{background:#fff7e8;border-color:#f3d499;color:#8a5a00;}
			.aivi-account-badge--revoked,
			.aivi-account-badge--error{background:#fff1f2;border-color:#f2c2c7;color:#a12f41;}
			.aivi-account-badge--disconnected{background:#f4f7fb;border-color:#d7e0ee;color:#41556f;}
			.aivi-account-grid{
				display:grid;
				grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
				gap:12px;
				margin-bottom:14px;
			}
			.aivi-account-metric{
				padding:12px 13px;
				border:1px solid #e4ebf5;
				border-radius:12px;
				background:#f8fbff;
			}
			.aivi-account-metric__label{
				display:block;
				margin-bottom:6px;
				font-size:11px;
				font-weight:700;
				letter-spacing:.04em;
				text-transform:uppercase;
				color:#6a7d94;
			}
			.aivi-account-metric__value{
				font-size:14px;
				font-weight:700;
				color:#10233f;
				word-break:break-word;
			}
			.aivi-account-card__foot{
				margin:0;
				color:#556579;
			}
		</style>
		<div class="aivi-account-card">
			<div class="aivi-account-card__header">
				<div>
					<h2 class="aivi-account-card__title"><?php esc_html_e( 'AiVI Account Connection', 'ai-visibility-inspector' ); ?></h2>
					<p class="aivi-account-card__desc">
						<?php esc_html_e( 'Review the current account and site connection state here. Operational settings remain below for troubleshooting and support-only overrides.', 'ai-visibility-inspector' ); ?>
					</p>
				</div>
				<span class="aivi-account-badge <?php echo esc_attr( $badge_class ); ?>">
					<?php echo esc_html( $status_label ); ?>
				</span>
			</div>
			<div class="aivi-account-grid">
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Account', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( $account_label ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Plan', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( $plan_label ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Subscription', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( $subscription_status ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Trial', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( $trial_status ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Connected Domain', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( $connected_domain ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Last Sync', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( $last_sync ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Site ID', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( (string) $site_identity['site_id'] ); ?></span>
				</div>
				<div class="aivi-account-metric">
					<span class="aivi-account-metric__label"><?php esc_html_e( 'Blog ID', 'ai-visibility-inspector' ); ?></span>
					<span class="aivi-account-metric__value"><?php echo esc_html( (string) $site_identity['blog_id'] ); ?></span>
				</div>
			</div>
			<p class="aivi-account-card__foot">
				<?php esc_html_e( 'Use this panel to confirm plan, credit, and site connection status. Reach for the operational settings below only when support asks you to troubleshoot or override the backend connection.', 'ai-visibility-inspector' ); ?>
			</p>
		</div>
		<?php
	}

	/**
	 * AJAX test connection
	 */
	public function ajax_test_connection() {
		check_ajax_referer( 'aivi_test_connection', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Insufficient permissions.', 'ai-visibility-inspector' ) ) );
		}

		$backend_url = self::get_backend_url();
		if ( empty( $backend_url ) ) {
			wp_send_json_error( array( 'message' => __( 'Backend URL is not configured.', 'ai-visibility-inspector' ) ) );
		}

		$ping_url = trailingslashit( $backend_url ) . 'ping';
		$response = wp_remote_get( $ping_url, array(
			'timeout' => 8,
			'sslverify' => true,
			'headers' => self::get_api_headers(),
		) );

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array( 'message' => $response->get_error_message() ) );
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$decoded = json_decode( $body, true );
		$missing_auth = is_string( $body ) && stripos( $body, 'Missing Authentication Token' ) !== false;

		if ( $status_code === 200 && is_array( $decoded ) && ! empty( $decoded['ok'] ) ) {
			$message = isset( $decoded['service'] ) ? sprintf( __( 'Connection OK. Service: %s', 'ai-visibility-inspector' ), $decoded['service'] ) : __( 'Connection OK.', 'ai-visibility-inspector' );
			wp_send_json_success( array( 'message' => $message ) );
		}

		if ( $status_code === 403 && $missing_auth ) {
			wp_send_json_error( array( 'message' => __( 'Backend returned Missing Authentication Token. Verify the configured backend URL is correct and reachable.', 'ai-visibility-inspector' ) ) );
		}

		$error_detail = is_array( $decoded ) ? wp_json_encode( $decoded ) : $body;
		wp_send_json_error( array( 'message' => sprintf( __( 'Connection test failed (HTTP %d): %s', 'ai-visibility-inspector' ), $status_code, $error_detail ) ) );
	}

	/**
	 * Get documentation groups for the in-plugin docs surface.
	 *
	 * @return array<string, string>
	 */
	private static function get_documentation_groups() {
		return array(
			'start' => __( 'Start Here', 'ai-visibility-inspector' ),
			'trust' => __( 'Trust & Policy', 'ai-visibility-inspector' ),
			'build' => __( 'Build & Extend', 'ai-visibility-inspector' ),
		);
	}

	/**
	 * Get documentation catalog metadata.
	 *
	 * @return array<string, array<string, string>>
	 */
	private static function get_documentation_catalog() {
		return array(
			'user-guide'      => array(
				'file'     => 'USER_GUIDE.md',
				'title'    => __( 'User Guide', 'ai-visibility-inspector' ),
				'summary'  => __( 'Analyze content, read findings, rerun safely, and use the main settings tabs.', 'ai-visibility-inspector' ),
				'group'    => 'start',
				'kind'     => __( 'Guide', 'ai-visibility-inspector' ),
				'audience' => __( 'Editor Workflow', 'ai-visibility-inspector' ),
			),
			'check-reference' => array(
				'file'     => 'CHECK_REFERENCE.md',
				'title'    => __( 'Check Reference', 'ai-visibility-inspector' ),
				'summary'  => __( 'Understand the main check families, verdicts, and common edge cases.', 'ai-visibility-inspector' ),
				'group'    => 'start',
				'kind'     => __( 'Reference', 'ai-visibility-inspector' ),
				'audience' => __( 'Analysis Logic', 'ai-visibility-inspector' ),
			),
			'troubleshooting' => array(
				'file'     => 'TROUBLESHOOTING.md',
				'title'    => __( 'Troubleshooting', 'ai-visibility-inspector' ),
				'summary'  => __( 'Work through stale results, missing highlights, connection issues, and rerun confusion.', 'ai-visibility-inspector' ),
				'group'    => 'start',
				'kind'     => __( 'Guide', 'ai-visibility-inspector' ),
				'audience' => __( 'Recovery Flow', 'ai-visibility-inspector' ),
			),
			'privacy'         => array(
				'file'     => 'PRIVACY.md',
				'title'    => __( 'Privacy', 'ai-visibility-inspector' ),
				'summary'  => __( 'See what the plugin captures, stores, and sends during normal AiVI usage.', 'ai-visibility-inspector' ),
				'group'    => 'trust',
				'kind'     => __( 'Policy', 'ai-visibility-inspector' ),
				'audience' => __( 'Trust', 'ai-visibility-inspector' ),
			),
			'terms-of-service' => array(
				'file'     => 'TERMS_OF_SERVICE.md',
				'title'    => __( 'Terms of Service', 'ai-visibility-inspector' ),
				'summary'  => __( 'Review current service boundaries, responsibilities, and commercial assumptions.', 'ai-visibility-inspector' ),
				'group'    => 'trust',
				'kind'     => __( 'Policy', 'ai-visibility-inspector' ),
				'audience' => __( 'Trust', 'ai-visibility-inspector' ),
			),
			'support-guide'   => array(
				'file'     => 'SUPPORT.md',
				'title'    => __( 'Support Guide', 'ai-visibility-inspector' ),
				'summary'  => __( 'Learn how to contact support, what to include, and how to describe an issue clearly.', 'ai-visibility-inspector' ),
				'group'    => 'trust',
				'kind'     => __( 'Guide', 'ai-visibility-inspector' ),
				'audience' => __( 'Support', 'ai-visibility-inspector' ),
			),
			'development'     => array(
				'file'     => 'DEVELOPMENT.md',
				'title'    => __( 'Development', 'ai-visibility-inspector' ),
				'summary'  => __( 'Use the current contributor workflow, testing commands, and packaging helpers.', 'ai-visibility-inspector' ),
				'group'    => 'build',
				'kind'     => __( 'Guide', 'ai-visibility-inspector' ),
				'audience' => __( 'Contributors', 'ai-visibility-inspector' ),
			),
			'architecture'    => array(
				'file'     => 'ARCHITECTURE.md',
				'title'    => __( 'Architecture', 'ai-visibility-inspector' ),
				'summary'  => __( 'Understand the plugin surface, request lifecycle, sidebar, overlay, and managed backend boundary.', 'ai-visibility-inspector' ),
				'group'    => 'build',
				'kind'     => __( 'Reference', 'ai-visibility-inspector' ),
				'audience' => __( 'System Design', 'ai-visibility-inspector' ),
			),
			'operations'      => array(
				'file'     => 'OPERATIONS.md',
				'title'    => __( 'Operations', 'ai-visibility-inspector' ),
				'summary'  => __( 'Follow the current packaging, specimen verification, and public snapshot release flow.', 'ai-visibility-inspector' ),
				'group'    => 'build',
				'kind'     => __( 'Runbook', 'ai-visibility-inspector' ),
				'audience' => __( 'Release Flow', 'ai-visibility-inspector' ),
			),
			'changelog'       => array(
				'file'     => 'CHANGELOG.md',
				'title'    => __( 'Changelog', 'ai-visibility-inspector' ),
				'summary'  => __( 'See the latest public-facing release notes for the plugin surface.', 'ai-visibility-inspector' ),
				'group'    => 'build',
				'kind'     => __( 'Release Notes', 'ai-visibility-inspector' ),
				'audience' => __( 'Current Release', 'ai-visibility-inspector' ),
			),
		);
	}

	/**
	 * Normalize a documentation slug.
	 *
	 * @param string $slug Raw slug.
	 * @return string
	 */
	private static function normalize_documentation_slug( $slug ) {
		$catalog = self::get_documentation_catalog();
		$key = sanitize_key( (string) $slug );
		if ( isset( $catalog[ $key ] ) ) {
			return $key;
		}

		return 'user-guide';
	}

	/**
	 * Get parsed documentation entry payload.
	 *
	 * @param string $slug  Entry slug.
	 * @param array  $entry Entry metadata.
	 * @return array{title:string, html:string}
	 */
	private static function get_documentation_entry_payload( $slug, $entry ) {
		static $cache = array();

		$slug = self::normalize_documentation_slug( $slug );
		if ( isset( $cache[ $slug ] ) ) {
			return $cache[ $slug ];
		}

		$fallback_title = isset( $entry['title'] ) ? (string) $entry['title'] : __( 'Documentation', 'ai-visibility-inspector' );
		$file_name = isset( $entry['file'] ) ? (string) $entry['file'] : '';
		$file_path = self::get_documentation_file_path( $file_name );
		if ( '' === $file_name || ! is_readable( $file_path ) ) {
			$cache[ $slug ] = array(
				'title' => $fallback_title,
				'html'  => '<p>' . esc_html__( 'This documentation article is not available in the current plugin package.', 'ai-visibility-inspector' ) . '</p>',
			);
			return $cache[ $slug ];
		}

		$markdown = (string) file_get_contents( $file_path );
		$markdown = preg_replace( '/^## Screenshot Placeholders.*?(?=^##\s|\z)/ms', '', $markdown );
		list( $title, $body ) = self::extract_documentation_heading_and_body( $markdown, $fallback_title );
		$cache[ $slug ] = array(
			'title' => $title,
			'html'  => self::render_documentation_markdown( $body ),
		);

		return $cache[ $slug ];
	}

	/**
	 * Resolve the file path for a documentation source file.
	 *
	 * @param string $file_name File name.
	 * @return string
	 */
	private static function get_documentation_file_path( $file_name ) {
		$plugin_root = dirname( __DIR__ );
		return $plugin_root . DIRECTORY_SEPARATOR . ltrim( (string) $file_name, '\\/' );
	}

	/**
	 * Extract the first heading as title and return the remaining body.
	 *
	 * @param string $markdown       Raw markdown.
	 * @param string $fallback_title Fallback title.
	 * @return array{0:string,1:string}
	 */
	private static function extract_documentation_heading_and_body( $markdown, $fallback_title ) {
		$normalized = str_replace( array( "\r\n", "\r" ), "\n", (string) $markdown );
		$normalized = preg_replace( '/^\xEF\xBB\xBF/', '', $normalized );
		$normalized = ltrim( $normalized );
		$title = $fallback_title;

		if ( preg_match( '/^\#\s+(.+)$/m', $normalized, $matches ) && isset( $matches[1] ) ) {
			$title = trim( wp_strip_all_tags( $matches[1] ) );
		}

		$body = preg_replace( '/^\#\s+.+\n*/', '', $normalized, 1 );
		return array( $title, trim( (string) $body ) );
	}

	/**
	 * Render markdown into simple documentation HTML.
	 *
	 * @param string $markdown Markdown body.
	 * @return string
	 */
	private static function render_documentation_markdown( $markdown ) {
		$lines = preg_split( '/\n/', str_replace( array( "\r\n", "\r" ), "\n", (string) $markdown ) );
		$html = '';
		$paragraph_lines = array();
		$list_items = array();
		$list_type = '';
		$code_lines = array();
		$inside_code_block = false;

		$flush_paragraph = static function () use ( &$html, &$paragraph_lines ) {
			if ( empty( $paragraph_lines ) ) {
				return;
			}

			$text = trim( implode( ' ', array_map( 'trim', $paragraph_lines ) ) );
			$paragraph_lines = array();
			if ( '' === $text ) {
				return;
			}

			$html .= '<p>' . self::render_documentation_inline( $text ) . '</p>';
		};

		$flush_list = static function () use ( &$html, &$list_items, &$list_type ) {
			if ( empty( $list_items ) || '' === $list_type ) {
				$list_items = array();
				$list_type = '';
				return;
			}

			$tag = 'ol' === $list_type ? 'ol' : 'ul';
			$html .= '<' . $tag . '>';
			foreach ( $list_items as $item ) {
				$html .= '<li>' . self::render_documentation_inline( $item ) . '</li>';
			}
			$html .= '</' . $tag . '>';
			$list_items = array();
			$list_type = '';
		};

		$flush_code = static function () use ( &$html, &$code_lines ) {
			if ( empty( $code_lines ) ) {
				return;
			}

			$code = implode( "\n", $code_lines );
			$code_lines = array();
			$html .= '<pre><code>' . esc_html( rtrim( $code ) ) . '</code></pre>';
		};

		foreach ( $lines as $line ) {
			if ( preg_match( '/^\s*```/', $line ) ) {
				$flush_paragraph();
				$flush_list();
				if ( $inside_code_block ) {
					$flush_code();
				}
				$inside_code_block = ! $inside_code_block;
				continue;
			}

			if ( $inside_code_block ) {
				$code_lines[] = $line;
				continue;
			}

			if ( preg_match( '/^\s*-\s*`?\[Screenshot:/', $line ) ) {
				continue;
			}

			if ( '' === trim( $line ) ) {
				$flush_paragraph();
				$flush_list();
				continue;
			}

			if ( preg_match( '/^(#{2,6})\s+(.+)$/', trim( $line ), $matches ) ) {
				$flush_paragraph();
				$flush_list();
				$level = min( 6, max( 2, strlen( $matches[1] ) ) );
				$html .= sprintf(
					'<h%d>%s</h%d>',
					(int) $level,
					self::render_documentation_inline( trim( $matches[2] ) ),
					(int) $level
				);
				continue;
			}

			if ( preg_match( '/^\-\s+(.+)$/', trim( $line ), $matches ) ) {
				$flush_paragraph();
				if ( 'ul' !== $list_type ) {
					$flush_list();
					$list_type = 'ul';
				}
				$list_items[] = trim( $matches[1] );
				continue;
			}

			if ( preg_match( '/^\d+\.\s+(.+)$/', trim( $line ), $matches ) ) {
				$flush_paragraph();
				if ( 'ol' !== $list_type ) {
					$flush_list();
					$list_type = 'ol';
				}
				$list_items[] = trim( $matches[1] );
				continue;
			}

			$paragraph_lines[] = trim( $line );
		}

		$flush_paragraph();
		$flush_list();
		if ( $inside_code_block ) {
			$flush_code();
		}

		return $html;
	}

	/**
	 * Render inline markdown.
	 *
	 * @param string $text Inline markdown.
	 * @return string
	 */
	private static function render_documentation_inline( $text ) {
		$placeholders = array();
		$placeholder_index = 0;
		$raw_text = (string) $text;

		$raw_text = preg_replace_callback(
			'/`([^`]+)`/',
			static function ( $matches ) use ( &$placeholders, &$placeholder_index ) {
				$token = '__AIVI_DOC_TOKEN_' . $placeholder_index++ . '__';
				$placeholders[ $token ] = '<code>' . esc_html( $matches[1] ) . '</code>';
				return $token;
			},
			$raw_text
		);

		$raw_text = preg_replace_callback(
			'/\[([^\]]+)\]\(([^)]+)\)/',
			static function ( $matches ) use ( &$placeholders, &$placeholder_index ) {
				$token = '__AIVI_DOC_TOKEN_' . $placeholder_index++ . '__';
				$label = esc_html( $matches[1] );
				$url   = esc_url( $matches[2] );
				$placeholders[ $token ] = $url
					? '<a href="' . $url . '">' . $label . '</a>'
					: $label;
				return $token;
			},
			$raw_text
		);

		$safe = esc_html( $raw_text );
		$safe = preg_replace( '/\*\*(.+?)\*\*/', '<strong>$1</strong>', $safe );
		$safe = preg_replace( '/\*(.+?)\*/', '<em>$1</em>', $safe );

		foreach ( $placeholders as $token => $html ) {
			$safe = str_replace( $token, $html, $safe );
		}

		return $safe;
	}

	/**
	 * Get settings
	 *
	 * @return array
	 */
	public static function get_settings() {
		return get_option( self::OPTION_KEY, array() );
	}

	/**
	 * Get normalized account/entitlement state.
	 *
	 * @return array
	 */
	public static function get_account_state() {
		$raw = get_option( self::ACCOUNT_STATE_OPTION_KEY, array() );
		$defaults = self::get_default_account_state();
		$merged = wp_parse_args( is_array( $raw ) ? $raw : array(), $defaults );
		$merged['connected'] = self::normalize_bool( $merged['connected'], false );
		$merged['connection_status'] = self::normalize_connection_status( $merged['connection_status'] ?? 'disconnected' );
		$merged['account_id'] = sanitize_text_field( (string) $merged['account_id'] );
		$merged['account_label'] = sanitize_text_field( (string) $merged['account_label'] );
		$merged['contact_email'] = sanitize_email( (string) $merged['contact_email'] );
		$merged['plan_code'] = sanitize_text_field( (string) $merged['plan_code'] );
		$merged['plan_name'] = sanitize_text_field( (string) $merged['plan_name'] );
		$merged['subscription_status'] = sanitize_text_field( (string) $merged['subscription_status'] );
		$merged['trial_status'] = sanitize_text_field( (string) $merged['trial_status'] );
		$merged['site_binding_status'] = sanitize_text_field( (string) $merged['site_binding_status'] );
		$merged['updated_at'] = sanitize_text_field( (string) $merged['updated_at'] );
		$merged['credits'] = self::normalize_account_credits( $merged['credits'] ?? array() );
		$merged['entitlements'] = self::normalize_account_entitlements( $merged['entitlements'] ?? array() );
		$merged['site'] = self::normalize_account_site_state( $merged['site'] ?? array() );
		$merged['sites'] = self::normalize_dashboard_connected_sites( $merged['sites'] ?? array() );
		$merged['latest_connection_token'] = self::normalize_dashboard_connection_token( $merged['latest_connection_token'] ?? array() );
		return $merged;
	}

	/**
	 * Update normalized account/entitlement state.
	 *
	 * @param array $state Raw state payload.
	 * @return bool
	 */
	public static function update_account_state( $state ) {
		return update_option( self::ACCOUNT_STATE_OPTION_KEY, self::sanitize_account_state( $state ), false );
	}

	/**
	 * Update normalized cached dashboard summary state.
	 *
	 * @param array $dashboard_state Raw dashboard payload.
	 * @return bool
	 */
	public static function update_account_dashboard_state( $dashboard_state ) {
		$normalized = self::normalize_account_dashboard_state( $dashboard_state, self::get_account_state() );
		return update_option( self::ACCOUNT_DASHBOARD_OPTION_KEY, $normalized, false );
	}

	/**
	 * Sync authoritative remote account and dashboard payloads into local WordPress state.
	 *
	 * @param array $account_state   Optional authoritative account state.
	 * @param array $dashboard_state Optional authoritative dashboard summary.
	 * @return void
	 */
	public static function sync_remote_account_snapshot( $account_state = array(), $dashboard_state = array() ) {
		$normalized_account = self::get_account_state();
		if ( is_array( $account_state ) && ! empty( $account_state ) ) {
			self::update_account_state( $account_state );
			$normalized_account = self::get_account_state();
		}

		if ( is_array( $dashboard_state ) && ! empty( $dashboard_state ) ) {
			$normalized_dashboard = self::normalize_account_dashboard_state( $dashboard_state, $normalized_account );
		} else {
			$normalized_dashboard = self::get_default_account_dashboard_state( $normalized_account );
		}

		update_option( self::ACCOUNT_DASHBOARD_OPTION_KEY, $normalized_dashboard, false );
	}

	/**
	 * Clear account state.
	 *
	 * @return bool
	 */
	public static function clear_account_state() {
		update_option( self::ACCOUNT_STATE_OPTION_KEY, self::get_default_account_state(), false );
		update_option( self::ACCOUNT_DASHBOARD_OPTION_KEY, self::get_default_account_dashboard_state( self::get_default_account_state() ), false );
		update_option( self::USAGE_ROLLUP_OPTION_KEY, self::get_default_usage_rollup_state(), false );
		return true;
	}

	/**
	 * Whether the site is connected to an AiVI account.
	 *
	 * @return bool
	 */
	public static function is_account_connected() {
		$state = self::get_account_state();
		return $state['connected'] && $state['connection_status'] === 'connected';
	}

	/**
	 * Get browser-safe account state payload.
	 *
	 * @return array
	 */
	public static function get_public_account_state() {
		$state = self::get_account_state();
		return array(
			'connected' => $state['connected'],
			'connectionStatus' => $state['connection_status'],
			'accountLabel' => $state['account_label'],
			'contactEmail' => $state['contact_email'],
			'planCode' => $state['plan_code'],
			'planName' => $state['plan_name'],
			'subscriptionStatus' => $state['subscription_status'],
			'trialStatus' => $state['trial_status'],
			'siteBindingStatus' => $state['site_binding_status'],
			'updatedAt' => $state['updated_at'],
			'credits' => array(
				'includedRemaining' => $state['credits']['included_remaining'],
				'topupRemaining' => $state['credits']['topup_remaining'],
				'lastRunDebit' => $state['credits']['last_run_debit'],
			),
			'entitlements' => array(
				'analysisAllowed' => $state['entitlements']['analysis_allowed'],
				'webLookupsAllowed' => $state['entitlements']['web_lookups_allowed'],
				'maxSites' => $state['entitlements']['max_sites'],
				'siteLimitReached' => $state['entitlements']['site_limit_reached'],
			),
			'site' => array(
				'connectedDomain' => $state['site']['connected_domain'],
			),
			'latestConnectionToken' => $state['latest_connection_token'],
		);
	}

	/**
	 * Get normalized customer dashboard state.
	 *
	 * @param array $dashboard_state Optional dashboard summary override.
	 * @return array
	 */
	public static function get_account_dashboard_state( $dashboard_state = array() ) {
		$stored_dashboard = get_option( self::ACCOUNT_DASHBOARD_OPTION_KEY, array() );
		$merged_state = wp_parse_args( is_array( $dashboard_state ) ? $dashboard_state : array(), is_array( $stored_dashboard ) ? $stored_dashboard : array() );
		$normalized = self::normalize_account_dashboard_state( $merged_state, self::get_account_state() );
		$usage_rollup = self::get_usage_rollup_state();
		if ( self::has_local_usage_rollup_signal( $usage_rollup ) ) {
			$normalized['usage']['analyses_this_month'] = $usage_rollup['analyses_this_month'];
			$normalized['usage']['credits_used_this_month'] = $usage_rollup['credits_used_this_month'];
			$normalized['usage']['last_analysis_at'] = $usage_rollup['last_analysis_at'];
			$normalized['usage']['last_run_status'] = $usage_rollup['last_run_status'];
			$normalized['credits']['last_run_debit'] = $usage_rollup['last_run_debit'];
		}
		return $normalized;
	}

	/**
	 * Update local usage rollup from a completed run.
	 *
	 * @param string $run_id Run ID.
	 * @param string $status Run status.
	 * @param array  $billing_summary Sanitized billing summary.
	 * @param string $completed_at Completed timestamp.
	 * @return bool
	 */
	public static function record_run_usage_summary( $run_id, $status, $billing_summary = array(), $completed_at = '' ) {
		$run_id = sanitize_text_field( (string) $run_id );
		if ( $run_id === '' ) {
			return false;
		}

		$rollup = self::get_usage_rollup_state();
		$timestamp = self::normalize_usage_timestamp( $completed_at );
		$month_key = gmdate( 'Y-m', strtotime( $timestamp ) );
		if ( $rollup['month_key'] !== $month_key ) {
			$rollup = self::get_default_usage_rollup_state( $month_key );
		}

		if ( in_array( $run_id, $rollup['counted_run_ids'], true ) ) {
			return true;
		}

		$billing_status = sanitize_text_field( (string) ( $billing_summary['billing_status'] ?? '' ) );
		$credits_used = self::normalize_nullable_int( $billing_summary['credits_used'] ?? null );
		$successful = in_array( sanitize_text_field( (string) $status ), array( 'success', 'success_partial' ), true );

		if ( $successful ) {
			$rollup['analyses_this_month'] = (int) $rollup['analyses_this_month'] + 1;
			$rollup['credits_used_this_month'] = (int) $rollup['credits_used_this_month'] + max( 0, (int) ( $credits_used ?? 0 ) );
		}

		$rollup['last_run_id'] = $run_id;
		$rollup['last_run_status'] = sanitize_text_field( (string) $status );
		$rollup['last_analysis_at'] = $timestamp;
		$rollup['last_run_debit'] = $billing_status === 'settled' ? max( 0, (int) ( $credits_used ?? 0 ) ) : 0;
		$rollup['counted_run_ids'][] = $run_id;
		$rollup['counted_run_ids'] = array_slice( array_values( array_unique( array_filter( $rollup['counted_run_ids'] ) ) ), -50 );

		$updated = update_option( self::USAGE_ROLLUP_OPTION_KEY, $rollup, false );

		$account_state = self::get_account_state();
		$account_state['credits']['last_run_debit'] = $rollup['last_run_debit'];
		$account_state['updated_at'] = $timestamp;
		self::update_account_state( $account_state );

		return $updated;
	}

	/**
	 * Get browser-safe customer dashboard state payload.
	 *
	 * @param array $dashboard_state Optional dashboard summary override.
	 * @return array
	 */
	public static function get_public_account_dashboard_state( $dashboard_state = array() ) {
		return self::get_account_dashboard_state( $dashboard_state );
	}

	/**
	 * Get browser-safe public billing catalog.
	 *
	 * @return array
	 */
	public static function get_public_billing_catalog() {
		$catalog = defined( 'AIVI_PUBLIC_BILLING_CATALOG' ) && is_array( AIVI_PUBLIC_BILLING_CATALOG )
			? AIVI_PUBLIC_BILLING_CATALOG
			: array();

		return array(
			'trial'  => is_array( $catalog['trial'] ?? null ) ? $catalog['trial'] : array(),
			'plans'  => array_values( array_filter( $catalog['plans'] ?? array(), 'is_array' ) ),
			'topups' => array_values( array_filter( $catalog['topups'] ?? array(), 'is_array' ) ),
		);
	}

	/**
	 * Get the preferred contact email for billing/onboarding flows.
	 *
	 * @return string
	 */
	public static function get_preferred_contact_email() {
		$stored = sanitize_email( (string) get_option( self::CONTACT_EMAIL_OPTION_KEY, '' ) );
		if ( $stored !== '' ) {
			return $stored;
		}
		return sanitize_email( (string) get_bloginfo( 'admin_email' ) );
	}

	/**
	 * Persist a preferred contact email for future onboarding requests.
	 *
	 * @param string $email Contact email.
	 * @return void
	 */
	public static function update_preferred_contact_email( $email ) {
		$email = sanitize_email( (string) $email );
		if ( $email === '' ) {
			delete_option( self::CONTACT_EMAIL_OPTION_KEY );
			return;
		}
		update_option( self::CONTACT_EMAIL_OPTION_KEY, $email, false );
	}

	/**
	 * Build the canonical site identity payload for future account connection handshakes.
	 *
	 * @return array
	 */
	public static function get_site_identity_payload() {
		$core = get_option( 'aivi_core', array() );
		$core_site_id = '';
		if ( is_array( $core ) && ! empty( $core['site_id'] ) ) {
			$core_site_id = sanitize_text_field( (string) $core['site_id'] );
		}
		$home_url = home_url( '/' );
		if ( is_ssl() ) {
			$home_url = set_url_scheme( $home_url, 'https' );
		}
		return array(
			'site_id' => $core_site_id,
			'blog_id' => (int) get_current_blog_id(),
			'home_url' => esc_url_raw( $home_url ),
			'admin_email' => self::get_preferred_contact_email(),
			'plugin_version' => defined( 'AIVI_VERSION' ) ? AIVI_VERSION : '1.0.0',
			'wp_version' => get_bloginfo( 'version' ),
		);
	}

	/**
	 * Get backend URL
	 *
	 * @return string
	 */
	public static function get_backend_url( $context = 'default' ) {
		$settings = self::get_settings();
		if ( isset( $settings['backend_url'] ) && ! empty( $settings['backend_url'] ) ) {
			return self::normalize_backend_url( $settings['backend_url'] );
		}
		if ( defined( 'AIVI_BACKEND_URL' ) ) {
			$constant_url = self::normalize_backend_url( AIVI_BACKEND_URL );
			if ( '' !== $constant_url ) {
				return $constant_url;
			}
		}
		$filtered_url = apply_filters( 'aivi_backend_url', '', sanitize_key( (string) $context ) );
		if ( is_string( $filtered_url ) && '' !== trim( $filtered_url ) ) {
			return self::normalize_backend_url( $filtered_url );
		}
		if ( defined( 'AIVI_DEFAULT_BACKEND_URL' ) ) {
			$default_url = self::normalize_backend_url( AIVI_DEFAULT_BACKEND_URL );
			if ( '' !== $default_url ) {
				return $default_url;
			}
		}
		return '';
	}

	private static function normalize_backend_url( $url ) {
		$url = trim( (string) $url );
		if ( $url === '' ) {
			return '';
		}
		$url = rtrim( $url, '/' );
		return $url;
	}

	/**
	 * Get API key
	 *
	 * @return string
	 */
	public static function get_api_key() {
		$settings = self::get_settings();
		return isset( $settings['api_key'] ) ? $settings['api_key'] : '';
	}

	/**
	 * Get common headers for API requests
	 *
	 * @return array
	 */
	public static function get_api_headers() {
		$headers = array(
			'Content-Type' => 'application/json',
			'User-Agent' => 'AiVI-WordPress/' . ( defined( 'AIVI_VERSION' ) ? AIVI_VERSION : '1.0.0' ),
			'X-Site-ID' => (string) get_current_blog_id(),
		);
		$api_key = self::get_api_key();
		if ( ! empty( $api_key ) ) {
			$headers['X-API-Key'] = $api_key;
		}
		return $headers;
	}

	/**
	 * Is plugin enabled
	 *
	 * @return bool
	 */
	public static function is_enabled() {
		$settings = self::get_settings();
		return ! isset( $settings['enable_plugin'] ) || $settings['enable_plugin'];
	}

	/**
	 * Are web lookups enabled
	 *
	 * @return bool
	 */
	public static function are_web_lookups_enabled() {
		$settings = self::get_settings();
		return isset( $settings['enable_web_lookups'] ) && $settings['enable_web_lookups'];
	}

	/**
	 * Update the optional web lookups setting.
	 *
	 * @param bool $enabled Whether optional web lookups should be enabled.
	 * @return bool
	 */
	public static function update_web_lookups_enabled( $enabled ) {
		$settings = self::get_settings();
		$settings['enable_web_lookups'] = (bool) $enabled;
		$sanitized = self::sanitize_settings( $settings );
		return update_option( self::OPTION_KEY, $sanitized, false );
	}

	/**
	 * Is anchor resolver v2 enabled
	 *
	 * @return bool
	 */
	public static function is_anchor_v2_enabled() {
		return self::resolve_feature_flag( 'anchor_v2_enabled', false );
	}

	/**
	 * Is deferred details fetch enabled
	 *
	 * @return bool
	 */
	public static function is_defer_details_enabled() {
		return self::resolve_feature_flag( 'defer_details_enabled', true );
	}

	/**
	 * Is partial results mode enabled
	 *
	 * @return bool
	 */
	public static function is_partial_results_enabled() {
		return self::resolve_feature_flag( 'partial_results_enabled', true );
	}

	/**
	 * Is compact prompt mode enabled
	 *
	 * @return bool
	 */
	public static function is_compact_prompt_enabled() {
		return self::resolve_feature_flag( 'compact_prompt_enabled', true );
	}

	/**
	 * Get all analyzer feature flags
	 *
	 * @return array<string, bool>
	 */
	public static function get_feature_flags() {
		return array(
			'anchor_v2_enabled' => self::is_anchor_v2_enabled(),
			'defer_details_enabled' => self::is_defer_details_enabled(),
			'partial_results_enabled' => self::is_partial_results_enabled(),
			'compact_prompt_enabled' => self::is_compact_prompt_enabled(),
		);
	}

	/**
	 * Resolve a feature flag from saved settings or plugin defaults.
	 *
	 * @param string $key Feature flag key.
	 * @param bool   $fallback Fallback if key is unknown.
	 * @return bool
	 */
	private static function resolve_feature_flag( $key, $fallback ) {
		$settings = self::get_settings();
		if ( array_key_exists( $key, $settings ) ) {
			return self::normalize_bool( $settings[ $key ], $fallback );
		}
		return self::get_default_feature_flag( $key, $fallback );
	}

	/**
	 * Get default feature flag value from plugin defaults.
	 *
	 * @param string $key Feature flag key.
	 * @param bool   $fallback Fallback if key is unknown.
	 * @return bool
	 */
	private static function get_default_feature_flag( $key, $fallback ) {
		if ( defined( 'AIVI_DEFAULT_ANALYSIS_OPTIONS' ) && is_array( AIVI_DEFAULT_ANALYSIS_OPTIONS ) && array_key_exists( $key, AIVI_DEFAULT_ANALYSIS_OPTIONS ) ) {
			return self::normalize_bool( AIVI_DEFAULT_ANALYSIS_OPTIONS[ $key ], $fallback );
		}
		return $fallback;
	}

	/**
	 * Normalize mixed values into strict booleans.
	 *
	 * @param mixed $value Value to normalize.
	 * @param bool  $fallback Fallback boolean.
	 * @return bool
	 */
	private static function normalize_bool( $value, $fallback = false ) {
		if ( is_bool( $value ) ) {
			return $value;
		}
		if ( is_numeric( $value ) ) {
			return ( (int) $value ) === 1;
		}
		if ( is_string( $value ) ) {
			$normalized = strtolower( trim( $value ) );
			if ( in_array( $normalized, array( '1', 'true', 'yes', 'on' ), true ) ) {
				return true;
			}
			if ( in_array( $normalized, array( '0', 'false', 'no', 'off' ), true ) ) {
				return false;
			}
		}
		return (bool) $fallback;
	}

	/**
	 * Get default account state.
	 *
	 * @return array
	 */
	private static function get_default_account_state() {
		$site_identity = self::get_site_identity_payload();
		return array(
			'schema_version' => defined( 'AIVI_ACCOUNT_STATE_VERSION' ) ? AIVI_ACCOUNT_STATE_VERSION : 'v1',
			'connected' => false,
			'connection_status' => 'disconnected',
			'account_id' => '',
			'account_label' => '',
			'contact_email' => '',
			'plan_code' => '',
			'plan_name' => '',
			'subscription_status' => '',
			'trial_status' => '',
			'site_binding_status' => 'unbound',
			'sites' => array(),
			'latest_connection_token' => array(
				'token' => '',
				'masked_token' => '',
				'issued_at' => '',
				'expires_at' => '',
				'status' => 'none',
			),
			'updated_at' => '',
			'credits' => array(
				'included_remaining' => null,
				'topup_remaining' => null,
				'last_run_debit' => null,
			),
			'entitlements' => array(
				'analysis_allowed' => false,
				'web_lookups_allowed' => null,
				'max_sites' => null,
				'site_limit_reached' => null,
			),
			'site' => array(
				'site_id' => $site_identity['site_id'],
				'blog_id' => $site_identity['blog_id'],
				'home_url' => $site_identity['home_url'],
				'connected_domain' => '',
				'plugin_version' => $site_identity['plugin_version'],
			),
		);
	}

	/**
	 * Build the default dashboard state from normalized account state.
	 *
	 * @param array|null $account_state Normalized account state.
	 * @return array
	 */
	private static function get_default_account_dashboard_state( $account_state = null ) {
		$account_state = is_array( $account_state ) ? $account_state : self::get_account_state();
		$usage_rollup = self::get_usage_rollup_state();
		$total_remaining = null;
		if ( $account_state['credits']['included_remaining'] !== null || $account_state['credits']['topup_remaining'] !== null ) {
			$total_remaining = (int) ( $account_state['credits']['included_remaining'] ?? 0 ) + (int) ( $account_state['credits']['topup_remaining'] ?? 0 );
		}

		return array(
			'schema_version' => 'v1',
			'account' => array(
				'connected' => $account_state['connected'],
				'connection_status' => $account_state['connection_status'],
				'display_state' => self::get_dashboard_display_state( $account_state ),
				'account_label' => $account_state['account_label'],
				'last_sync_at' => $account_state['updated_at'],
			),
			'plan' => array(
				'plan_code' => $account_state['plan_code'],
				'plan_name' => $account_state['plan_name'],
				'subscription_status' => $account_state['subscription_status'],
				'trial_status' => $account_state['trial_status'],
				'trial_active' => $account_state['trial_status'] === 'active',
				'renewal_date' => null,
				'cancel_at' => null,
				'max_sites' => $account_state['entitlements']['max_sites'],
			),
			'credits' => array(
				'included_remaining' => $account_state['credits']['included_remaining'],
				'topup_remaining' => $account_state['credits']['topup_remaining'],
				'total_remaining' => $total_remaining,
				'reserved_credits' => null,
				'last_run_debit' => $usage_rollup['last_run_debit'] !== null ? $usage_rollup['last_run_debit'] : $account_state['credits']['last_run_debit'],
				'monthly_included' => null,
				'monthly_used' => null,
			),
			'usage' => array(
				'analyses_this_month' => $usage_rollup['analyses_this_month'],
				'credits_used_this_month' => $usage_rollup['credits_used_this_month'],
				'last_analysis_at' => $usage_rollup['last_analysis_at'],
				'last_run_status' => $usage_rollup['last_run_status'],
			),
			'site' => array(
				'site_id' => $account_state['site']['site_id'],
				'blog_id' => $account_state['site']['blog_id'],
				'connected_domain' => $account_state['site']['connected_domain'],
				'plugin_version' => $account_state['site']['plugin_version'],
				'binding_status' => $account_state['site_binding_status'],
			),
			'connection' => array(
				'connected_sites' => self::normalize_dashboard_connected_sites( $account_state['sites'] ?? array() ),
				'site_slots_used' => count( is_array( $account_state['sites'] ?? null ) ? $account_state['sites'] : array() ),
				'site_slots_total' => $account_state['entitlements']['max_sites'],
				'latest_connection_token' => self::normalize_dashboard_connection_token( $account_state['latest_connection_token'] ?? array() ),
			),
			'support' => array(
				'docs_url' => '',
				'billing_url' => '',
				'support_url' => '',
				'help_label' => __( 'AiVI Support', 'ai-visibility-inspector' ),
				'provider' => '',
				'zoho_asap' => array(
					'widget_snippet_url' => '',
					'department_id' => '',
					'layout_id' => '',
					'ticket_title' => __( 'AiVI Support', 'ai-visibility-inspector' ),
					'field_map' => array(),
				),
			),
		);
	}

	/**
	 * Get default local usage rollup state.
	 *
	 * @param string|null $month_key Optional month key override.
	 * @return array
	 */
	private static function get_default_usage_rollup_state( $month_key = null ) {
		$month_key = sanitize_text_field( (string) ( $month_key ?: gmdate( 'Y-m' ) ) );
		return array(
			'month_key' => $month_key,
			'analyses_this_month' => 0,
			'credits_used_this_month' => 0,
			'last_analysis_at' => '',
			'last_run_status' => '',
			'last_run_debit' => null,
			'last_run_id' => '',
			'counted_run_ids' => array(),
		);
	}

	/**
	 * Get normalized local usage rollup state.
	 *
	 * @return array
	 */
	private static function get_usage_rollup_state() {
		$raw = get_option( self::USAGE_ROLLUP_OPTION_KEY, array() );
		$defaults = self::get_default_usage_rollup_state();
		$merged = wp_parse_args( is_array( $raw ) ? $raw : array(), $defaults );
		$current_month = gmdate( 'Y-m' );
		$month_key = sanitize_text_field( (string) ( $merged['month_key'] ?? $defaults['month_key'] ) );
		if ( $month_key !== $current_month ) {
			return self::get_default_usage_rollup_state( $current_month );
		}

		$counted_run_ids = is_array( $merged['counted_run_ids'] ) ? $merged['counted_run_ids'] : array();
		$counted_run_ids = array_slice(
			array_values(
				array_unique(
					array_map(
						static function ( $value ) {
							return sanitize_text_field( (string) $value );
						},
						array_filter( $counted_run_ids )
					)
				)
			),
			-50
		);

		return array(
			'month_key' => $month_key,
			'analyses_this_month' => max( 0, (int) ( $merged['analyses_this_month'] ?? 0 ) ),
			'credits_used_this_month' => max( 0, (int) ( $merged['credits_used_this_month'] ?? 0 ) ),
			'last_analysis_at' => sanitize_text_field( (string) ( $merged['last_analysis_at'] ?? '' ) ),
			'last_run_status' => sanitize_text_field( (string) ( $merged['last_run_status'] ?? '' ) ),
			'last_run_debit' => self::normalize_nullable_int( $merged['last_run_debit'] ?? null ),
			'last_run_id' => sanitize_text_field( (string) ( $merged['last_run_id'] ?? '' ) ),
			'counted_run_ids' => $counted_run_ids,
		);
	}

	/**
	 * Whether the local rollup contains meaningful recent-usage data that should override cached dashboard usage fields.
	 *
	 * @param array $rollup Normalized usage rollup.
	 * @return bool
	 */
	private static function has_local_usage_rollup_signal( $rollup ) {
		$rollup = is_array( $rollup ) ? $rollup : array();
		return ! empty( $rollup['last_analysis_at'] )
			|| ! empty( $rollup['last_run_status'] )
			|| null !== ( $rollup['last_run_debit'] ?? null )
			|| ! empty( $rollup['analyses_this_month'] )
			|| ! empty( $rollup['credits_used_this_month'] );
	}

	/**
	 * Normalize usage timestamp to ISO-8601 UTC.
	 *
	 * @param string $timestamp Raw timestamp.
	 * @return string
	 */
	private static function normalize_usage_timestamp( $timestamp ) {
		$timestamp = trim( (string) $timestamp );
		if ( $timestamp === '' ) {
			return gmdate( 'c' );
		}
		$parsed = strtotime( $timestamp );
		if ( ! $parsed ) {
			return gmdate( 'c' );
		}
		return gmdate( 'c', $parsed );
	}

	/**
	 * Sanitize account state payload.
	 *
	 * @param mixed $state Raw state.
	 * @return array
	 */
	private static function sanitize_account_state( $state ) {
		$defaults = self::get_default_account_state();
		$merged = wp_parse_args( is_array( $state ) ? $state : array(), $defaults );
		$merged['schema_version'] = sanitize_text_field( (string) $merged['schema_version'] );
		$merged['connected'] = self::normalize_bool( $merged['connected'], false );
		$merged['connection_status'] = self::normalize_connection_status( $merged['connection_status'] ?? 'disconnected' );
		$merged['account_id'] = sanitize_text_field( (string) $merged['account_id'] );
		$merged['account_label'] = sanitize_text_field( (string) $merged['account_label'] );
		$merged['plan_code'] = sanitize_text_field( (string) $merged['plan_code'] );
		$merged['plan_name'] = sanitize_text_field( (string) $merged['plan_name'] );
		$merged['subscription_status'] = sanitize_text_field( (string) $merged['subscription_status'] );
		$merged['trial_status'] = sanitize_text_field( (string) $merged['trial_status'] );
		$merged['site_binding_status'] = sanitize_text_field( (string) $merged['site_binding_status'] );
		$merged['updated_at'] = sanitize_text_field( (string) $merged['updated_at'] );
		$merged['credits'] = self::normalize_account_credits( $merged['credits'] ?? array() );
		$merged['entitlements'] = self::normalize_account_entitlements( $merged['entitlements'] ?? array() );
		$merged['site'] = self::normalize_account_site_state( $merged['site'] ?? array() );
		return $merged;
	}

	/**
	 * Normalize connection status.
	 *
	 * @param string $status Raw status.
	 * @return string
	 */
	private static function normalize_connection_status( $status ) {
		$status = strtolower( trim( (string) $status ) );
		$allowed = array( 'disconnected', 'pending', 'connected', 'revoked', 'error' );
		return in_array( $status, $allowed, true ) ? $status : 'disconnected';
	}

	/**
	 * Normalize credit state.
	 *
	 * @param mixed $credits Raw credits.
	 * @return array
	 */
	private static function normalize_account_credits( $credits ) {
		$credits = is_array( $credits ) ? $credits : array();
		return array(
			'included_remaining' => self::normalize_nullable_int( $credits['included_remaining'] ?? null ),
			'topup_remaining' => self::normalize_nullable_int( $credits['topup_remaining'] ?? null ),
			'last_run_debit' => self::normalize_nullable_int( $credits['last_run_debit'] ?? null ),
		);
	}

	/**
	 * Normalize entitlement state.
	 *
	 * @param mixed $entitlements Raw entitlements.
	 * @return array
	 */
	private static function normalize_account_entitlements( $entitlements ) {
		$entitlements = is_array( $entitlements ) ? $entitlements : array();
		return array(
			'analysis_allowed' => self::normalize_bool( $entitlements['analysis_allowed'] ?? false, false ),
			'web_lookups_allowed' => self::normalize_nullable_bool( $entitlements['web_lookups_allowed'] ?? null ),
			'max_sites' => self::normalize_nullable_int( $entitlements['max_sites'] ?? null ),
			'site_limit_reached' => self::normalize_nullable_bool( $entitlements['site_limit_reached'] ?? null ),
		);
	}

	/**
	 * Normalize site state.
	 *
	 * @param mixed $site Raw site state.
	 * @return array
	 */
	private static function normalize_account_site_state( $site ) {
		$site = is_array( $site ) ? $site : array();
		$identity = self::get_site_identity_payload();
		return array(
			'site_id' => sanitize_text_field( (string) ( $site['site_id'] ?? $identity['site_id'] ) ),
			'blog_id' => (int) ( $site['blog_id'] ?? $identity['blog_id'] ),
			'home_url' => esc_url_raw( (string) ( $site['home_url'] ?? $identity['home_url'] ) ),
			'connected_domain' => sanitize_text_field( (string) ( $site['connected_domain'] ?? '' ) ),
			'plugin_version' => sanitize_text_field( (string) ( $site['plugin_version'] ?? $identity['plugin_version'] ) ),
		);
	}

	/**
	 * Normalize dashboard state payload.
	 *
	 * @param mixed      $dashboard_state Raw dashboard state.
	 * @param array|null $account_state Normalized account state.
	 * @return array
	 */
	private static function normalize_account_dashboard_state( $dashboard_state, $account_state = null ) {
		$account_state = is_array( $account_state ) ? $account_state : self::get_account_state();
		$defaults = self::get_default_account_dashboard_state( $account_state );
		$dashboard_state = is_array( $dashboard_state ) ? $dashboard_state : array();
		$merged = wp_parse_args( $dashboard_state, $defaults );
		$merged['schema_version'] = sanitize_text_field( (string) ( $merged['schema_version'] ?? 'v1' ) );
		$merged['account'] = self::normalize_dashboard_account_summary( $merged['account'] ?? array(), $defaults['account'] );
		$merged['plan'] = self::normalize_dashboard_plan_summary( $merged['plan'] ?? array(), $defaults['plan'] );
		$merged['credits'] = self::normalize_dashboard_credit_summary( $merged['credits'] ?? array(), $defaults['credits'] );
		$merged['usage'] = self::normalize_dashboard_usage_summary( $merged['usage'] ?? array(), $defaults['usage'] );
		$merged['site'] = self::normalize_dashboard_site_summary( $merged['site'] ?? array(), $defaults['site'] );
		$merged['connection'] = self::normalize_dashboard_connection_summary( $merged['connection'] ?? array(), $defaults['connection'] );
		$merged['support'] = self::normalize_dashboard_support_links( $merged['support'] ?? array(), $defaults['support'] );
		return $merged;
	}

	/**
	 * Normalize dashboard account summary.
	 *
	 * @param mixed $account Raw account summary.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_account_summary( $account, $defaults ) {
		$account = wp_parse_args( is_array( $account ) ? $account : array(), $defaults );
		return array(
			'connected' => self::normalize_bool( $account['connected'] ?? $defaults['connected'], false ),
			'connection_status' => self::normalize_connection_status( $account['connection_status'] ?? $defaults['connection_status'] ),
			'display_state' => sanitize_text_field( (string) ( $account['display_state'] ?? $defaults['display_state'] ) ),
			'account_label' => sanitize_text_field( (string) ( $account['account_label'] ?? $defaults['account_label'] ) ),
			'last_sync_at' => sanitize_text_field( (string) ( $account['last_sync_at'] ?? $defaults['last_sync_at'] ) ),
		);
	}

	/**
	 * Normalize dashboard plan summary.
	 *
	 * @param mixed $plan Raw plan summary.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_plan_summary( $plan, $defaults ) {
		$plan = wp_parse_args( is_array( $plan ) ? $plan : array(), $defaults );
		return array(
			'plan_code' => sanitize_text_field( (string) ( $plan['plan_code'] ?? $defaults['plan_code'] ) ),
			'plan_name' => sanitize_text_field( (string) ( $plan['plan_name'] ?? $defaults['plan_name'] ) ),
			'subscription_status' => sanitize_text_field( (string) ( $plan['subscription_status'] ?? $defaults['subscription_status'] ) ),
			'trial_status' => sanitize_text_field( (string) ( $plan['trial_status'] ?? $defaults['trial_status'] ) ),
			'trial_active' => self::normalize_bool( $plan['trial_active'] ?? $defaults['trial_active'], false ),
			'renewal_date' => sanitize_text_field( (string) ( $plan['renewal_date'] ?? $defaults['renewal_date'] ) ),
			'cancel_at' => sanitize_text_field( (string) ( $plan['cancel_at'] ?? $defaults['cancel_at'] ) ),
			'max_sites' => self::normalize_nullable_int( $plan['max_sites'] ?? $defaults['max_sites'] ),
		);
	}

	/**
	 * Normalize dashboard credit summary.
	 *
	 * @param mixed $credits Raw credit summary.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_credit_summary( $credits, $defaults ) {
		$credits = wp_parse_args( is_array( $credits ) ? $credits : array(), $defaults );
		return array(
			'included_remaining' => self::normalize_nullable_int( $credits['included_remaining'] ?? $defaults['included_remaining'] ),
			'topup_remaining' => self::normalize_nullable_int( $credits['topup_remaining'] ?? $defaults['topup_remaining'] ),
			'total_remaining' => self::normalize_nullable_int( $credits['total_remaining'] ?? $defaults['total_remaining'] ),
			'reserved_credits' => self::normalize_nullable_int( $credits['reserved_credits'] ?? $defaults['reserved_credits'] ),
			'last_run_debit' => self::normalize_nullable_int( $credits['last_run_debit'] ?? $defaults['last_run_debit'] ),
			'monthly_included' => self::normalize_nullable_int( $credits['monthly_included'] ?? $defaults['monthly_included'] ),
			'monthly_used' => self::normalize_nullable_int( $credits['monthly_used'] ?? $defaults['monthly_used'] ),
		);
	}

	/**
	 * Normalize dashboard usage summary.
	 *
	 * @param mixed $usage Raw usage summary.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_usage_summary( $usage, $defaults ) {
		$usage = wp_parse_args( is_array( $usage ) ? $usage : array(), $defaults );
		return array(
			'analyses_this_month' => self::normalize_nullable_int( $usage['analyses_this_month'] ?? $defaults['analyses_this_month'] ),
			'credits_used_this_month' => self::normalize_nullable_int( $usage['credits_used_this_month'] ?? $defaults['credits_used_this_month'] ),
			'last_analysis_at' => sanitize_text_field( (string) ( $usage['last_analysis_at'] ?? $defaults['last_analysis_at'] ) ),
			'last_run_status' => sanitize_text_field( (string) ( $usage['last_run_status'] ?? $defaults['last_run_status'] ) ),
		);
	}

	/**
	 * Normalize dashboard site summary.
	 *
	 * @param mixed $site Raw site summary.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_site_summary( $site, $defaults ) {
		$site = wp_parse_args( is_array( $site ) ? $site : array(), $defaults );
		return array(
			'site_id' => sanitize_text_field( (string) ( $site['site_id'] ?? $defaults['site_id'] ) ),
			'blog_id' => (int) ( $site['blog_id'] ?? $defaults['blog_id'] ),
			'connected_domain' => sanitize_text_field( (string) ( $site['connected_domain'] ?? $defaults['connected_domain'] ) ),
			'plugin_version' => sanitize_text_field( (string) ( $site['plugin_version'] ?? $defaults['plugin_version'] ) ),
			'binding_status' => sanitize_text_field( (string) ( $site['binding_status'] ?? $defaults['binding_status'] ) ),
		);
	}

	/**
	 * Normalize dashboard connection summary.
	 *
	 * @param mixed $connection Raw connection data.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_connection_summary( $connection, $defaults ) {
		$connection = wp_parse_args( is_array( $connection ) ? $connection : array(), $defaults );
		return array(
			'connected_sites' => self::normalize_dashboard_connected_sites( $connection['connected_sites'] ?? array() ),
			'site_slots_used' => self::normalize_nullable_int( $connection['site_slots_used'] ?? $defaults['site_slots_used'] ),
			'site_slots_total' => self::normalize_nullable_int( $connection['site_slots_total'] ?? $defaults['site_slots_total'] ),
			'latest_connection_token' => self::normalize_dashboard_connection_token( $connection['latest_connection_token'] ?? array() ),
		);
	}

	/**
	 * Normalize dashboard connected-site records.
	 *
	 * @param mixed $sites Raw site list.
	 * @return array
	 */
	private static function normalize_dashboard_connected_sites( $sites ) {
		$sites = is_array( $sites ) ? $sites : array();
		$normalized = array();
		foreach ( $sites as $site ) {
			if ( ! is_array( $site ) ) {
				continue;
			}
			$normalized[] = array(
				'site_id' => sanitize_text_field( (string) ( $site['site_id'] ?? '' ) ),
				'blog_id' => (int) ( $site['blog_id'] ?? 0 ),
				'home_url' => esc_url_raw( (string) ( $site['home_url'] ?? '' ) ),
				'connected_domain' => sanitize_text_field( (string) ( $site['connected_domain'] ?? '' ) ),
				'binding_status' => sanitize_text_field( (string) ( $site['binding_status'] ?? 'connected' ) ),
			);
		}
		return $normalized;
	}

	/**
	 * Normalize dashboard connection token metadata.
	 *
	 * @param mixed $token Raw token record.
	 * @return array
	 */
	private static function normalize_dashboard_connection_token( $token ) {
		$token = is_array( $token ) ? $token : array();
		return array(
			'token' => sanitize_text_field( (string) ( $token['token'] ?? '' ) ),
			'masked_token' => sanitize_text_field( (string) ( $token['masked_token'] ?? '' ) ),
			'issued_at' => sanitize_text_field( (string) ( $token['issued_at'] ?? '' ) ),
			'expires_at' => sanitize_text_field( (string) ( $token['expires_at'] ?? '' ) ),
			'status' => sanitize_text_field( (string) ( $token['status'] ?? 'none' ) ),
		);
	}

	/**
	 * Normalize dashboard support links.
	 *
	 * @param mixed $support Raw support links.
	 * @param array $defaults Default summary.
	 * @return array
	 */
	private static function normalize_dashboard_support_links( $support, $defaults ) {
		$support = wp_parse_args( is_array( $support ) ? $support : array(), $defaults );
		return array(
			'docs_url' => esc_url_raw( (string) ( $support['docs_url'] ?? $defaults['docs_url'] ) ),
			'billing_url' => esc_url_raw( (string) ( $support['billing_url'] ?? $defaults['billing_url'] ) ),
			'support_url' => esc_url_raw( (string) ( $support['support_url'] ?? $defaults['support_url'] ) ),
			'help_label' => sanitize_text_field( (string) ( $support['help_label'] ?? $defaults['help_label'] ) ),
			'provider' => sanitize_text_field( (string) ( $support['provider'] ?? $defaults['provider'] ?? '' ) ),
			'zoho_asap' => self::normalize_dashboard_support_zoho_asap( $support['zoho_asap'] ?? array(), $defaults['zoho_asap'] ?? array() ),
		);
	}

	/**
	 * Normalize Zoho Desk ASAP dashboard support configuration.
	 *
	 * @param mixed $config Raw config.
	 * @param array $defaults Default config.
	 * @return array
	 */
	private static function normalize_dashboard_support_zoho_asap( $config, $defaults ) {
		$config = wp_parse_args( is_array( $config ) ? $config : array(), is_array( $defaults ) ? $defaults : array() );
		$field_map = array();
		if ( is_array( $config['field_map'] ?? null ) ) {
			foreach ( $config['field_map'] as $key => $value ) {
				$normalized_key = sanitize_key( (string) $key );
				$normalized_value = sanitize_text_field( (string) $value );
				if ( '' !== $normalized_key && '' !== $normalized_value ) {
					$field_map[ $normalized_key ] = $normalized_value;
				}
			}
		}
		return array(
			'widget_snippet_url' => esc_url_raw( (string) ( $config['widget_snippet_url'] ?? '' ) ),
			'department_id' => sanitize_text_field( (string) ( $config['department_id'] ?? '' ) ),
			'layout_id' => sanitize_text_field( (string) ( $config['layout_id'] ?? '' ) ),
			'ticket_title' => sanitize_text_field( (string) ( $config['ticket_title'] ?? '' ) ),
			'field_map' => $field_map,
		);
	}

	/**
	 * Build the dashboard display state from account state.
	 *
	 * @param array $account_state Normalized account state.
	 * @return string
	 */
	private static function get_dashboard_display_state( $account_state ) {
		if ( ! is_array( $account_state ) || empty( $account_state['connected'] ) ) {
			return 'disconnected';
		}

		$connection_status = $account_state['connection_status'] ?? 'disconnected';
		if ( $connection_status !== 'connected' ) {
			return $connection_status;
		}

		if ( ! empty( $account_state['trial_status'] ) && $account_state['trial_status'] !== 'inactive' ) {
			return 'trial';
		}

		if ( isset( $account_state['entitlements']['analysis_allowed'] ) && ! $account_state['entitlements']['analysis_allowed'] ) {
			return 'attention_required';
		}

		return 'active';
	}

	/**
	 * Human-readable dashboard display label.
	 *
	 * @param string $display_state Normalized display state.
	 * @return string
	 */
	private static function get_dashboard_display_label( $display_state ) {
		switch ( sanitize_text_field( (string) $display_state ) ) {
			case 'active':
				return __( 'Active', 'ai-visibility-inspector' );
			case 'trial':
				return __( 'Trial', 'ai-visibility-inspector' );
			case 'attention_required':
				return __( 'Needs attention', 'ai-visibility-inspector' );
			case 'pending':
				return __( 'Pending connection', 'ai-visibility-inspector' );
			case 'revoked':
				return __( 'Revoked', 'ai-visibility-inspector' );
			case 'error':
				return __( 'Connection error', 'ai-visibility-inspector' );
			case 'connected':
				return __( 'Connected', 'ai-visibility-inspector' );
			default:
				return __( 'Not connected', 'ai-visibility-inspector' );
		}
	}

	/**
	 * Format a dashboard metric value for display.
	 *
	 * @param mixed  $value Raw value.
	 * @param string $fallback Fallback label.
	 * @return string
	 */
	private static function format_dashboard_metric_value( $value, $fallback ) {
		if ( $value === null || $value === '' ) {
			return $fallback;
		}
		return number_format_i18n( (int) $value );
	}

	/**
	 * Format a dashboard text value for display.
	 *
	 * @param mixed  $value Raw value.
	 * @param string $fallback Fallback label.
	 * @return string
	 */
	private static function format_dashboard_text_value( $value, $fallback ) {
		$value = trim( (string) $value );
		return $value === '' ? $fallback : $value;
	}

	/**
	 * Humanize dashboard status values like snake_case.
	 *
	 * @param mixed  $value Raw status value.
	 * @param string $fallback Fallback label.
	 * @return string
	 */
	private static function humanize_dashboard_status( $value, $fallback ) {
		$value = trim( (string) $value );
		if ( $value === '' ) {
			return $fallback;
		}
		if ( strtolower( $value ) === 'success_partial' ) {
			return __( 'Success', 'ai-visibility-inspector' );
		}
		$value = str_replace( array( '_', '-' ), ' ', strtolower( $value ) );
		return ucwords( $value );
	}

	/**
	 * Format the trial label for customer-facing plan summaries.
	 *
	 * @param string $trial_status Raw trial status.
	 * @param string $subscription_status Raw subscription status.
	 * @return string
	 */
	private static function get_customer_trial_status_label( $trial_status, $subscription_status ) {
		$trial_status = strtolower( trim( (string) $trial_status ) );
		$subscription_status = strtolower( trim( (string) $subscription_status ) );
		if ( $trial_status === '' ) {
			return '';
		}
		if ( in_array( $trial_status, array( 'converted', 'none' ), true ) ) {
			return '';
		}
		if ( $trial_status === 'active' && $subscription_status !== 'trial' ) {
			return '';
		}
		return self::humanize_dashboard_status( $trial_status, '' );
	}

	/**
	 * Resolve the domain label shown in the customer dashboard.
	 *
	 * @param array $dashboard_state Normalized dashboard state.
	 * @param array $site_identity Site identity payload.
	 * @return string
	 */
	private static function resolve_dashboard_domain( $dashboard_state, $site_identity ) {
		$connected_domain = trim( (string) ( $dashboard_state['site']['connected_domain'] ?? '' ) );
		if ( $connected_domain !== '' ) {
			return $connected_domain;
		}

		$home_url = trim( (string) ( $site_identity['home_url'] ?? '' ) );
		if ( $home_url !== '' ) {
			$parts = wp_parse_url( $home_url );
			if ( is_array( $parts ) && ! empty( $parts['host'] ) ) {
				return sanitize_text_field( (string) $parts['host'] );
			}
		}

		return __( 'Not bound yet', 'ai-visibility-inspector' );
	}

	/**
	 * Build a customer-facing billing status message for the dashboard.
	 *
	 * @param array $dashboard_state Dashboard summary payload.
	 * @param bool  $billing_enabled Whether hosted billing actions are enabled.
	 * @param bool  $is_connected Whether the site is connected to an account.
	 * @return array{tone:string,message:string}
	 */
	private static function get_dashboard_billing_status_message( $dashboard_state, $billing_enabled, $is_connected ) {
		if ( ! $is_connected ) {
			return array(
				'tone'    => 'warning',
				'message' => __( 'Connect this site to an AiVI account before starting a plan or adding top-up credits. Top-ups extend an active paid plan after billing is live.', 'ai-visibility-inspector' ),
			);
		}

		if ( ! $billing_enabled ) {
			return array(
				'tone'    => 'warning',
				'message' => __( 'Hosted billing is not enabled for this environment yet. Your plan summary is still visible here.', 'ai-visibility-inspector' ),
			);
		}

		$status = sanitize_text_field( (string) ( $dashboard_state['plan']['subscription_status'] ?? '' ) );
		switch ( $status ) {
			case 'active':
				return array(
					'tone'    => 'success',
					'message' => __( 'Your subscription is active and renews automatically while billing remains current.', 'ai-visibility-inspector' ),
				);
			case 'trial':
				return array(
					'tone'    => 'success',
					'message' => __( 'Your free trial is active. Choose a paid plan before trial credits run out to avoid interruptions.', 'ai-visibility-inspector' ),
				);
			case 'cancelled':
			case 'canceled':
				return array(
					'tone'    => 'warning',
					'message' => __( 'Your subscription is set to cancel. Billing access remains available until the current cycle ends.', 'ai-visibility-inspector' ),
				);
			case 'paused':
				return array(
					'tone'    => 'danger',
					'message' => __( 'Your subscription is paused. Resume the plan or choose a different one to restore analysis on this site.', 'ai-visibility-inspector' ),
				);
			case 'suspended':
				return array(
					'tone'    => 'danger',
					'message' => __( 'Your subscription is suspended. Update billing or switch plans to restore uninterrupted analysis access.', 'ai-visibility-inspector' ),
				);
			case 'payment_failed':
				return array(
					'tone'    => 'danger',
					'message' => __( 'The last payment did not complete. Resolve billing to keep credits and analysis access in good standing.', 'ai-visibility-inspector' ),
				);
			case 'expired':
				return array(
					'tone'    => 'danger',
					'message' => __( 'Your subscription has expired. Choose a new plan to restore analysis access.', 'ai-visibility-inspector' ),
				);
			default:
				return array(
					'tone'    => 'warning',
					'message' => __( 'AiVI is waiting for PayPal to confirm your subscription activation. Plans and credits will refresh here automatically.', 'ai-visibility-inspector' ),
				);
		}
	}

	/**
	 * Build the customer-facing plan action label.
	 *
	 * @param string $current_plan_code Current plan code.
	 * @param string $target_plan_code Target plan code.
	 * @return string
	 */
	private static function get_dashboard_plan_action_label( $current_plan_code, $target_plan_code ) {
		$order = array(
			'starter' => 1,
			'growth'  => 2,
			'pro'     => 3,
		);

		$current_rank = $order[ $current_plan_code ] ?? 0;
		$target_rank  = $order[ $target_plan_code ] ?? 0;

		if ( $current_rank > 0 && $target_rank > 0 ) {
			if ( $target_rank > $current_rank ) {
				return __( 'Upgrade plan', 'ai-visibility-inspector' );
			}
			if ( $target_rank < $current_rank ) {
				return __( 'Downgrade plan', 'ai-visibility-inspector' );
			}
		}

		return __( 'Choose plan', 'ai-visibility-inspector' );
	}

	/**
	 * Classify a dashboard plan transition for guarded plan-change UX.
	 *
	 * @param string $current_plan_code Current plan code.
	 * @param string $target_plan_code Target plan code.
	 * @return string
	 */
	private static function get_dashboard_plan_transition( $current_plan_code, $target_plan_code ) {
		$current_plan_code = sanitize_text_field( (string) $current_plan_code );
		$target_plan_code  = sanitize_text_field( (string) $target_plan_code );

		if ( '' === $target_plan_code || $current_plan_code === $target_plan_code ) {
			return 'same';
		}

		$order = array(
			'starter' => 1,
			'growth'  => 2,
			'pro'     => 3,
		);

		$current_rank = $order[ $current_plan_code ] ?? 0;
		$target_rank  = $order[ $target_plan_code ] ?? 0;

		if ( 0 === $current_rank || 0 === $target_rank ) {
			return 'initial';
		}

		return $target_rank > $current_rank ? 'upgrade' : 'downgrade';
	}

	/**
	 * Determine whether customer-facing top-up purchasing should be visible.
	 *
	 * Top-ups are intentionally hidden until a paid subscription is active. This avoids
	 * charging for extra credits before recurring access is fully enabled.
	 *
	 * @param array $dashboard_state Dashboard summary payload.
	 * @param array $account_state Normalized account state.
	 * @return bool
	 */
	private static function can_show_dashboard_topups( $dashboard_state, $account_state ) {
		$plan_code = sanitize_text_field( (string) ( $dashboard_state['plan']['plan_code'] ?? $account_state['plan_code'] ?? '' ) );
		$status    = sanitize_text_field( (string) ( $dashboard_state['plan']['subscription_status'] ?? $account_state['subscription_status'] ?? '' ) );

		return in_array( $plan_code, AIVI_PLAN_CODES, true ) && 'active' === $status;
	}

	/**
	 * Format a billing price label.
	 *
	 * @param mixed $price_usd Price in USD.
	 * @param bool  $with_dollar Whether to prefix with dollar sign.
	 * @return string
	 */
	private static function format_billing_price_label( $price_usd, $with_dollar = true ) {
		if ( $price_usd === null || $price_usd === '' ) {
			return $with_dollar ? '$0' : '0';
		}

		$price = number_format_i18n( (float) $price_usd, ( (float) $price_usd ) === floor( (float) $price_usd ) ? 0 : 2 );
		return $with_dollar ? '$' . $price : $price;
	}

	/**
	 * Format intro-offer labels for plan cards.
	 *
	 * @param array $intro_offer Intro offer payload.
	 * @return string
	 */
	private static function format_plan_intro_offer_label( $intro_offer ) {
		if ( ! is_array( $intro_offer ) ) {
			return '';
		}

		$type = sanitize_text_field( (string) ( $intro_offer['type'] ?? '' ) );
		if ( $type === 'percent_off_first_cycle' ) {
			$percent = absint( $intro_offer['percent_off'] ?? 0 );
			if ( $percent > 0 ) {
				return sprintf(
					/* translators: %d: discount percentage */
					__( '%d%% off first month', 'ai-visibility-inspector' ),
					$percent
				);
			}
		}

		return '';
	}

	/**
	 * Whether operational settings should be visible.
	 *
	 * Hidden by default for normal customers. Internal/support environments can
	 * enable them explicitly via constant or filter without affecting runtime behavior.
	 *
	 * @return bool
	 */
	public static function should_show_operational_settings() {
		$default = defined( 'AIVI_SHOW_OPERATIONAL_SETTINGS' ) ? (bool) AIVI_SHOW_OPERATIONAL_SETTINGS : false;
		return (bool) apply_filters(
			'aivi_show_operational_settings',
			$default,
			self::get_account_state(),
			self::get_settings()
		);
	}

	/**
	 * Normalize nullable integer.
	 *
	 * @param mixed $value Raw value.
	 * @return int|null
	 */
	private static function normalize_nullable_int( $value ) {
		if ( $value === null || $value === '' ) {
			return null;
		}
		return (int) $value;
	}

	/**
	 * Normalize nullable boolean.
	 *
	 * @param mixed $value Raw value.
	 * @return bool|null
	 */
	private static function normalize_nullable_bool( $value ) {
		if ( $value === null || $value === '' ) {
			return null;
		}
		return self::normalize_bool( $value, false );
	}

	/**
	 * Human-readable connection status label.
	 *
	 * @param string $status Status code.
	 * @return string
	 */
	private static function get_connection_status_label( $status ) {
		switch ( self::normalize_connection_status( $status ) ) {
			case 'pending':
				return __( 'Pending connection', 'ai-visibility-inspector' );
			case 'connected':
				return __( 'Connected', 'ai-visibility-inspector' );
			case 'revoked':
				return __( 'Revoked', 'ai-visibility-inspector' );
			case 'error':
				return __( 'Connection error', 'ai-visibility-inspector' );
			default:
				return __( 'Not connected', 'ai-visibility-inspector' );
		}
	}

	/**
	 * Format last sync time for admin display.
	 *
	 * @param string $value Raw timestamp.
	 * @return string
	 */
	private static function format_account_sync_time( $value ) {
		$value = trim( (string) $value );
		if ( $value === '' ) {
			return __( 'Not synced yet', 'ai-visibility-inspector' );
		}
		$timestamp = strtotime( $value );
		if ( ! $timestamp ) {
			return $value;
		}
		return sprintf(
			/* translators: 1: Date, 2: Time */
			__( '%1$s at %2$s', 'ai-visibility-inspector' ),
			wp_date( get_option( 'date_format' ), $timestamp ),
			wp_date( get_option( 'time_format' ), $timestamp )
		);
	}

	/**
	 * Get token cutoff
	 *
	 * @return int
	 */
	public static function get_token_cutoff() {
		$settings = self::get_settings();
		return isset( $settings['token_cutoff'] ) ? $settings['token_cutoff'] : 200000;
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
			error_log( 'AiVI: ' . wp_json_encode( $log_entry ) );
		}
	}
}

// Initialize settings registration (menu handled by Admin_Menu)
new Admin_Settings();
