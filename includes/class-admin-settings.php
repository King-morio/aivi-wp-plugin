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
		$value = isset( $settings['backend_url'] ) ? $settings['backend_url'] : AIVI_BACKEND_URL;
		$is_fallback = ! isset( $settings['backend_url'] ) || empty( $settings['backend_url'] );
		?>
		<input type="url"
			   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[backend_url]"
			   value="<?php echo esc_attr( $value ); ?>"
			   class="regular-text"
			   placeholder="https://example.execute-api.eu-north-1.amazonaws.com/dev">
		<p class="description">
			<?php _e( 'Base URL for the AiVI backend API.', 'ai-visibility-inspector' ); ?>
		</p>
		<?php if ( $is_fallback ) : ?>
			<div class="notice notice-warning inline">
				<p><?php _e( 'Backend URL is not explicitly set. The plugin is using its built-in default, which may be wrong after deployments. Set this value to your current API stage URL.', 'ai-visibility-inspector' ); ?></p>
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
			<?php _e( 'Allow semantic checks to perform web lookups for fact-checking and source verification.', 'ai-visibility-inspector' ); ?>
		</label>
		<p class="description">
			<?php _e( 'When enabled, the backend may perform external web requests. Disable if you have strict network policies.', 'ai-visibility-inspector' ); ?>
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
	public function sanitize_settings( $input ) {
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
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

			<?php self::render_customer_dashboard_panel( $dashboard_state, $site_identity ); ?>

			<?php if ( $show_operational_settings ) : ?>
				<details class="aivi-operational-settings">
					<summary><?php esc_html_e( 'Operational fallback settings', 'ai-visibility-inspector' ); ?></summary>
					<p class="aivi-operational-settings__intro">
						<?php esc_html_e( 'These legacy connection and fallback controls remain available during the account-dashboard rollout. They are not intended as the primary customer experience.', 'ai-visibility-inspector' ); ?>
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

			function resolveAccountSummaryEndpoint() {
				var cfg = window.AIVI_CONFIG || {};
				var endpoints = cfg.apiEndpoints && typeof cfg.apiEndpoints === 'object' ? cfg.apiEndpoints : {};
				return endpoints.account_summary || '';
			}

			function resolveBillingEndpoint(action) {
				var cfg = window.AIVI_CONFIG || {};
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

			function triggerBillingReturnRefresh() {
				var cfg = window.AIVI_CONFIG || {};
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
							requestAccountSummary(restBase, summaryEndpoint, nonce)
								.done(function() {
									persistBillingReturnFlash(buildBillingReturnNotice(returnStatus));
								})
								.fail(function() {
									persistBillingReturnFlash({
										kind: 'warning',
										message: '<?php echo esc_js( __( 'AiVI recorded your billing return. Reload once more if the updated plan or credits do not appear right away.', 'ai-visibility-inspector' ) ); ?>'
									});
								})
								.always(function() {
									window.location.replace(buildCleanBillingReturnUrl());
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

			$('.aivi-billing-action').on('click', function() {
				var cfg = window.AIVI_CONFIG || {};
				var restBase = typeof cfg.restBase === 'string' ? cfg.restBase.replace(/\/$/, '') : '';
				var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
				var action = String($(this).data('billingAction') || '').trim();
				var endpoint = resolveBillingEndpoint(action);
				var $button = $(this);
				var $result = $('#aivi-billing-result');
				var payload = {};

				if (!restBase || !endpoint || !nonce) {
					setInlineNotice($result, 'error', '<?php echo esc_js( __( 'AiVI billing is not ready on this site yet.', 'ai-visibility-inspector' ) ); ?>');
					return;
				}

				if ($button.prop('disabled')) {
					return;
				}

				if (action === 'subscribe') {
					payload.plan_code = String($button.data('planCode') || '').trim();
				} else if (action === 'topup') {
					payload.topup_pack_code = String($button.data('topupPackCode') || '').trim();
				}

				$button.addClass('is-busy').prop('disabled', true);
				setInlineNotice($result, 'warning', '<?php echo esc_js( __( 'Opening secure PayPal checkoutâ€¦', 'ai-visibility-inspector' ) ); ?>');

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
		$last_sync = self::format_account_sync_time( $dashboard_state['account']['last_sync_at'] ?? '' );
		$connected_domain = self::resolve_dashboard_domain( $dashboard_state, $site_identity );
		$binding_status = self::humanize_dashboard_status( $dashboard_state['site']['binding_status'] ?? '', __( 'Not available', 'ai-visibility-inspector' ) );
		$docs_url = $dashboard_state['support']['docs_url'] ?? '';
		$billing_url = $dashboard_state['support']['billing_url'] ?? '';
		$support_url = $dashboard_state['support']['support_url'] ?? '';
		$help_label = self::format_dashboard_text_value( $dashboard_state['support']['help_label'] ?? '', __( 'AiVI Help', 'ai-visibility-inspector' ) );
		$current_plan_code = sanitize_text_field( (string) ( $dashboard_state['plan']['plan_code'] ?? $account_state['plan_code'] ?? '' ) );
		$billing_status_message = self::get_dashboard_billing_status_message( $dashboard_state, $billing_enabled, $is_connected );
		$billing_status_tone = sanitize_html_class( $billing_status_message['tone'] );
		$plan_entries = is_array( $billing_catalog['plans'] ?? null ) ? $billing_catalog['plans'] : array();
		$topup_entries = is_array( $billing_catalog['topups'] ?? null ) ? $billing_catalog['topups'] : array();
		$account_label = self::format_dashboard_text_value( $dashboard_state['account']['account_label'] ?? '', __( 'No account linked yet', 'ai-visibility-inspector' ) );
		$max_sites = self::format_dashboard_metric_value( $dashboard_state['plan']['max_sites'] ?? null, __( 'Not set', 'ai-visibility-inspector' ) );
		$site_id = sanitize_text_field( (string) ( $dashboard_state['site']['site_id'] ?? '' ) );
		$blog_id = self::format_dashboard_metric_value( $dashboard_state['site']['blog_id'] ?? null, __( 'Not available', 'ai-visibility-inspector' ) );
		?>
		<style>
			.aivi-settings-shell{margin:18px 0 22px;padding:24px;background:linear-gradient(180deg,#f7f8fc 0%,#ffffff 100%);border:1px solid #d7dce5;border-radius:18px;box-shadow:0 1px 2px rgba(15,23,42,.05);}
			.aivi-settings-shell *{box-sizing:border-box;}
			.aivi-settings-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:18px;}
			.aivi-settings-hero__eyebrow,.aivi-settings-section__eyebrow{display:block;margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6a7d94;}
			.aivi-settings-hero__title{margin:0;font-size:28px;line-height:1.08;font-weight:700;color:#10233f;}
			.aivi-settings-hero__desc{margin:10px 0 0;max-width:760px;font-size:14px;line-height:1.65;color:#516175;}
			.aivi-dashboard-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid transparent;background:#f4f7fb;color:#41556f;text-transform:uppercase;letter-spacing:.04em;}
			.aivi-dashboard-badge::before{content:'';width:8px;height:8px;border-radius:50%;background:currentColor;}
			.aivi-dashboard-badge--active,.aivi-dashboard-badge--connected{background:#edf9f3;border-color:#bfe4cc;color:#17633f;}
			.aivi-dashboard-badge--trial,.aivi-dashboard-badge--pending{background:#fff7e8;border-color:#f3d499;color:#8a5a00;}
			.aivi-dashboard-badge--attention_required,.aivi-dashboard-badge--revoked,.aivi-dashboard-badge--error{background:#fff1f2;border-color:#f2c2c7;color:#a12f41;}
			.aivi-settings-tabs{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;border-bottom:1px solid #d7dce5;}
			.aivi-settings-tab{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;margin-bottom:-1px;border:1px solid #c3c4c7;border-bottom-color:#d7dce5;border-radius:10px 10px 0 0;background:#f3f4f6;color:#4f5662;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;}
			.aivi-settings-tab:hover{background:#fff;color:#10233f;}
			.aivi-settings-tab.is-active{background:#fff;color:#10233f;border-bottom-color:#fff;position:relative;z-index:2;}
			.aivi-settings-tab__badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:2px 8px;border-radius:999px;background:#eef4ff;color:#214d9c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
			.aivi-billing-result{margin:0 0 18px;display:none;}
			.aivi-settings-section{display:none;padding:22px;border:1px solid #d7dce5;border-radius:0 16px 16px 16px;background:#fff;}
			.aivi-settings-section.is-active{display:block;}
			.aivi-settings-section__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
			.aivi-settings-section__title{margin:0;font-size:24px;line-height:1.15;font-weight:700;color:#10233f;}
			.aivi-settings-section__desc{margin:8px 0 0;max-width:760px;font-size:14px;line-height:1.65;color:#516175;}
			.aivi-settings-meta{display:inline-flex;align-items:center;padding:10px 12px;border:1px solid #d7e0ee;border-radius:999px;background:#f8fbff;color:#33506f;font-size:13px;font-weight:700;}
			.aivi-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}
			.aivi-settings-grid--two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));}
			.aivi-settings-card{padding:18px;border:1px solid #e4ebf5;border-radius:14px;background:#fff;}
			.aivi-settings-card__title{margin:0 0 10px;font-size:20px;line-height:1.2;font-weight:700;color:#10233f;}
			.aivi-settings-card__value{font-size:28px;line-height:1;font-weight:800;color:#10233f;margin-bottom:10px;}
			.aivi-settings-card__meta,.aivi-settings-list{margin:0;padding:0;list-style:none;color:#516175;font-size:13px;line-height:1.65;}
			.aivi-settings-list li + li{margin-top:4px;}
			.aivi-settings-card__hint{margin:10px 0 0;font-size:13px;line-height:1.55;color:#516175;}
			.aivi-settings-card__status{margin:12px 0 0;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.55;border:1px solid #d9e4f2;background:#f8fbff;color:#33506f;}
			.aivi-dashboard-card__status--success{background:#edf9f3;border-color:#bfe4cc;color:#17633f;}
			.aivi-dashboard-card__status--warning{background:#fff7e8;border-color:#f3d499;color:#8a5a00;}
			.aivi-dashboard-card__status--danger{background:#fff1f2;border-color:#f2c2c7;color:#a12f41;}
			.aivi-settings-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
			.aivi-dashboard-card__pill{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:#eef4ff;color:#214d9c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
			.aivi-settings-offer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;}
			.aivi-dashboard-offer{display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid #dbe6f3;border-radius:14px;background:#fbfdff;}
			.aivi-dashboard-offer--current{border-color:#bfd6fb;background:#f4f8ff;box-shadow:inset 0 0 0 1px #dbeafe;}
			.aivi-dashboard-offer__row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;}
			.aivi-dashboard-offer__title{margin:0;font-size:18px;line-height:1.25;font-weight:700;color:#10233f;}
			.aivi-dashboard-offer__price{font-size:30px;line-height:1;font-weight:800;color:#10233f;}
			.aivi-dashboard-offer__price small{display:block;margin-top:4px;font-size:11px;line-height:1.4;font-weight:600;color:#6a7d94;}
			.aivi-dashboard-offer__meta{margin:0;padding:0;list-style:none;font-size:13px;line-height:1.6;color:#516175;}
			.aivi-dashboard-offer__meta li + li{margin-top:2px;}
			.aivi-dashboard-offer__tag{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#e8f1ff;color:#214d9c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
			.aivi-dashboard-offer__actions{display:flex;flex-wrap:wrap;gap:8px;}
			.aivi-billing-action.is-busy{opacity:.7;pointer-events:none;}
			.aivi-operational-settings{margin-top:22px;padding:18px 20px;border:1px solid #d7e0ee;border-radius:16px;background:#fff;}
			.aivi-operational-settings > summary{cursor:pointer;font-size:15px;font-weight:700;color:#10233f;}
			.aivi-operational-settings__intro{margin:14px 0 0;color:#516175;max-width:760px;}
			.aivi-operational-settings__test{margin-top:20px;padding-top:18px;border-top:1px solid #e4ebf5;}
			@media (max-width: 782px){.aivi-settings-shell{padding:18px;}.aivi-settings-tab{width:100%;border-radius:10px;border-bottom:1px solid #c3c4c7;margin-bottom:0;}.aivi-settings-tab.is-active{border-bottom-color:#c3c4c7;}.aivi-settings-section{border-radius:16px;}}
		</style>
		<div class="aivi-settings-shell">
			<div class="aivi-settings-hero">
				<div>
					<span class="aivi-settings-hero__eyebrow"><?php esc_html_e( 'AiVI account workspace', 'ai-visibility-inspector' ); ?></span>
					<h2 class="aivi-settings-hero__title"><?php esc_html_e( 'Cleaner billing and connection settings, one panel at a time.', 'ai-visibility-inspector' ); ?></h2>
					<p class="aivi-settings-hero__desc"><?php esc_html_e( 'Plans, credit packs, connection health, and support are grouped into separate tabs so customers can focus on one task without scanning a noisy all-in-one dashboard.', 'ai-visibility-inspector' ); ?></p>
				</div>
				<span class="aivi-dashboard-badge <?php echo esc_attr( $badge_class ); ?>"><?php echo esc_html( self::get_dashboard_display_label( $display_state ) ); ?></span>
			</div>
			<nav class="aivi-settings-tabs" aria-label="<?php esc_attr_e( 'AiVI settings sections', 'ai-visibility-inspector' ); ?>">
				<a href="#aivi-settings-tab-overview" class="aivi-settings-tab is-active" data-aivi-settings-tab-button="overview"><?php esc_html_e( 'Overview', 'ai-visibility-inspector' ); ?></a>
				<a href="#aivi-settings-tab-billing" class="aivi-settings-tab" data-aivi-settings-tab-button="billing"><?php esc_html_e( 'Plans', 'ai-visibility-inspector' ); ?><?php if ( $current_plan_code !== '' ) : ?><span class="aivi-settings-tab__badge"><?php echo esc_html( self::format_dashboard_text_value( $dashboard_state['plan']['plan_name'] ?? '', ucfirst( $current_plan_code ) ) ); ?></span><?php endif; ?></a>
				<a href="#aivi-settings-tab-credits" class="aivi-settings-tab" data-aivi-settings-tab-button="credits"><?php esc_html_e( 'Credits', 'ai-visibility-inspector' ); ?></a>
				<a href="#aivi-settings-tab-connection" class="aivi-settings-tab" data-aivi-settings-tab-button="connection"><?php esc_html_e( 'Connection', 'ai-visibility-inspector' ); ?></a>
				<a href="#aivi-settings-tab-help" class="aivi-settings-tab" data-aivi-settings-tab-button="help"><?php esc_html_e( 'Help', 'ai-visibility-inspector' ); ?></a>
			</nav>
			<div id="aivi-billing-result" class="notice inline aivi-billing-result"></div>
			<div class="aivi-settings-sections">
				<section class="aivi-settings-section is-active" data-aivi-settings-tab-panel="overview">
					<div class="aivi-settings-section__head">
						<div>
							<span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Account overview', 'ai-visibility-inspector' ); ?></span>
							<h3 class="aivi-settings-section__title"><?php esc_html_e( 'Current state at a glance', 'ai-visibility-inspector' ); ?></h3>
							<p class="aivi-settings-section__desc"><?php esc_html_e( 'This tab keeps the essentials visible: current plan, remaining credits, usage this month, and site binding. Customers should land here first.', 'ai-visibility-inspector' ); ?></p>
						</div>
						<span class="aivi-settings-meta"><?php printf( esc_html__( 'Last sync %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></span>
					</div>
					<div class="aivi-settings-grid">
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Current plan', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $plan_name ); ?></h4><p class="aivi-settings-card__meta"><?php echo esc_html( $subscription_status ); ?></p><p class="aivi-settings-card__hint"><?php printf( esc_html__( 'Trial status: %s', 'ai-visibility-inspector' ), esc_html( $trial_status ) ); ?></p></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Credit balance', 'ai-visibility-inspector' ); ?></span><div class="aivi-settings-card__value"><?php echo esc_html( $total_credits ); ?></div><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Included: %s', 'ai-visibility-inspector' ), esc_html( $included_credits ) ); ?></li><li><?php printf( esc_html__( 'Top-up: %s', 'ai-visibility-inspector' ), esc_html( $topup_credits ) ); ?></li><li><?php printf( esc_html__( 'Last analysis debit: %s', 'ai-visibility-inspector' ), esc_html( $last_run_debit ) ); ?></li></ul></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Usage this month', 'ai-visibility-inspector' ); ?></span><div class="aivi-settings-card__value"><?php echo esc_html( $analyses_this_month ); ?></div><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Credits used this month: %s', 'ai-visibility-inspector' ), esc_html( $credits_used_this_month ) ); ?></li><li><?php printf( esc_html__( 'Last analysis: %s', 'ai-visibility-inspector' ), esc_html( $last_analysis_at ) ); ?></li><li><?php printf( esc_html__( 'Last result: %s', 'ai-visibility-inspector' ), esc_html( $last_run_status ) ); ?></li></ul></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Connected site', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $connected_domain ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Binding: %s', 'ai-visibility-inspector' ), esc_html( $binding_status ) ); ?></li><li><?php printf( esc_html__( 'Site ID: %s', 'ai-visibility-inspector' ), esc_html( $site_id ) ); ?></li><li><?php printf( esc_html__( 'Blog ID: %s', 'ai-visibility-inspector' ), esc_html( $blog_id ) ); ?></li></ul></section>
					</div>
					<div class="aivi-settings-grid aivi-settings-grid--two" style="margin-top:14px;">
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Subscription status', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $subscription_status ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Account: %s', 'ai-visibility-inspector' ), esc_html( $account_label ) ); ?></li><li><?php printf( esc_html__( 'Max sites: %s', 'ai-visibility-inspector' ), esc_html( $max_sites ) ); ?></li></ul><div class="aivi-settings-card__status aivi-dashboard-card__status--<?php echo esc_attr( $billing_status_tone ); ?>" id="aivi-billing-status"><?php echo esc_html( $billing_status_message['message'] ); ?></div><div class="aivi-settings-actions"><button type="button" class="button button-primary aivi-billing-action" data-billing-action="manage" <?php disabled( ! $is_connected || ! $billing_enabled ); ?>><?php esc_html_e( 'Manage billing', 'ai-visibility-inspector' ); ?></button></div></section>
						<section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Recent activity', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php esc_html_e( 'Latest billing and usage context', 'ai-visibility-inspector' ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Last analysis debit: %s', 'ai-visibility-inspector' ), esc_html( $last_run_debit ) ); ?></li><li><?php printf( esc_html__( 'Last sync: %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></li><li><?php printf( esc_html__( 'Display state: %s', 'ai-visibility-inspector' ), esc_html( self::get_dashboard_display_label( $display_state ) ) ); ?></li></ul></section>
					</div>
				</section>
				<section class="aivi-settings-section" data-aivi-settings-tab-panel="billing" id="aivi-billing-plans"><div class="aivi-settings-section__head"><div><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Billing plans', 'ai-visibility-inspector' ); ?></span><h3 class="aivi-settings-section__title"><?php esc_html_e( 'Choose the right monthly plan', 'ai-visibility-inspector' ); ?></h3><p class="aivi-settings-section__desc"><?php esc_html_e( 'An active trial or subscription unlocks analysis. Credits extend usage after your trial or plan is active.', 'ai-visibility-inspector' ); ?></p></div></div><div class="aivi-settings-offer-grid">
						<?php foreach ( $plan_entries as $plan_entry ) : ?>
							<?php
							$plan_code = sanitize_text_field( (string) ( $plan_entry['code'] ?? '' ) );
							if ( $plan_code === '' ) {
								continue;
							}
							$is_current_plan = $current_plan_code !== '' && $plan_code === $current_plan_code;
							$plan_button_label = self::get_dashboard_plan_action_label( $current_plan_code, $plan_code );
							$plan_price = self::format_billing_price_label( $plan_entry['price_usd'] ?? null, true );
							$plan_intro_offer = self::format_plan_intro_offer_label( $plan_entry['intro_offer'] ?? array() );
							?>
							<article class="aivi-dashboard-offer<?php echo $is_current_plan ? ' aivi-dashboard-offer--current' : ''; ?>"><div class="aivi-dashboard-offer__row"><div><h4 class="aivi-dashboard-offer__title"><?php echo esc_html( self::format_dashboard_text_value( $plan_entry['label'] ?? '', ucfirst( $plan_code ) ) ); ?></h4><?php if ( $is_current_plan ) : ?><span class="aivi-dashboard-offer__tag"><?php esc_html_e( 'Current plan', 'ai-visibility-inspector' ); ?></span><?php elseif ( $plan_intro_offer !== '' ) : ?><span class="aivi-dashboard-offer__tag"><?php echo esc_html( $plan_intro_offer ); ?></span><?php endif; ?></div><div class="aivi-dashboard-offer__price"><?php echo esc_html( $plan_price ); ?><small><?php esc_html_e( 'per month', 'ai-visibility-inspector' ); ?></small></div></div><ul class="aivi-dashboard-offer__meta"><li><?php printf( esc_html__( '%s monthly credits', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $plan_entry['included_credits'] ?? null, '0' ) ) ); ?></li><li><?php printf( esc_html__( '%s connected site(s)', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $plan_entry['site_limit'] ?? null, '0' ) ) ); ?></li><li><?php printf( esc_html__( '%s days of history', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $plan_entry['history_days'] ?? null, '0' ) ) ); ?></li></ul><div class="aivi-dashboard-offer__actions"><button type="button" class="button <?php echo $is_current_plan ? 'button-secondary' : 'button-primary'; ?> aivi-billing-action" data-billing-action="subscribe" data-plan-code="<?php echo esc_attr( $plan_code ); ?>" <?php disabled( ! $is_connected || ! $billing_enabled || $is_current_plan ); ?>><?php echo esc_html( $is_current_plan ? __( 'Current plan', 'ai-visibility-inspector' ) : $plan_button_label ); ?></button></div></article>
						<?php endforeach; ?>
					</div></section>
				<section class="aivi-settings-section" data-aivi-settings-tab-panel="credits" id="aivi-billing-topups"><div class="aivi-settings-section__head"><div><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Credit packs', 'ai-visibility-inspector' ); ?></span><h3 class="aivi-settings-section__title"><?php esc_html_e( 'Add credits to your active AiVI access', 'ai-visibility-inspector' ); ?></h3><p class="aivi-settings-section__desc"><?php esc_html_e( 'Top-ups add extra capacity to an active trial or subscription. They do not activate analysis on their own.', 'ai-visibility-inspector' ); ?></p></div></div><div class="aivi-settings-grid aivi-settings-grid--two" style="margin-bottom:16px;"><section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Current balance', 'ai-visibility-inspector' ); ?></span><div class="aivi-settings-card__value"><?php echo esc_html( $total_credits ); ?></div><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Included: %s', 'ai-visibility-inspector' ), esc_html( $included_credits ) ); ?></li><li><?php printf( esc_html__( 'Top-up: %s', 'ai-visibility-inspector' ), esc_html( $topup_credits ) ); ?></li></ul></section><section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Credit grant policy', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php esc_html_e( 'Granted after verified capture', 'ai-visibility-inspector' ); ?></h4><p class="aivi-settings-card__hint"><?php esc_html_e( 'Top-up credits appear after PayPal capture is verified and reconciled. They extend an active trial or subscription instead of replacing it.', 'ai-visibility-inspector' ); ?></p></section></div><div class="aivi-settings-offer-grid">
						<?php foreach ( $topup_entries as $topup_entry ) : ?>
							<?php
							$topup_code = sanitize_text_field( (string) ( $topup_entry['code'] ?? '' ) );
							if ( $topup_code === '' ) {
								continue;
							}
							?>
							<article class="aivi-dashboard-offer"><div class="aivi-dashboard-offer__row"><div><h4 class="aivi-dashboard-offer__title"><?php echo esc_html( self::format_dashboard_text_value( $topup_entry['label'] ?? '', $topup_code ) ); ?></h4></div><div class="aivi-dashboard-offer__price"><?php echo esc_html( self::format_billing_price_label( $topup_entry['price_usd'] ?? null, false ) ); ?><small><?php esc_html_e( 'one-time', 'ai-visibility-inspector' ); ?></small></div></div><ul class="aivi-dashboard-offer__meta"><li><?php printf( esc_html__( '%s credits added after verified capture', 'ai-visibility-inspector' ), esc_html( self::format_dashboard_metric_value( $topup_entry['credits'] ?? null, '0' ) ) ); ?></li></ul><div class="aivi-dashboard-offer__actions"><button type="button" class="button button-secondary aivi-billing-action" data-billing-action="topup" data-topup-pack-code="<?php echo esc_attr( $topup_code ); ?>" <?php disabled( ! $is_connected || ! $billing_enabled ); ?>><?php esc_html_e( 'Buy top-up', 'ai-visibility-inspector' ); ?></button></div></article>
						<?php endforeach; ?>
					</div><?php if ( ! $is_connected ) : ?><p class="aivi-settings-card__hint"><?php esc_html_e( 'Connect this site to your AiVI account before starting a plan or buying credits.', 'ai-visibility-inspector' ); ?></p><?php elseif ( ! $billing_enabled ) : ?><p class="aivi-settings-card__hint"><?php esc_html_e( 'Hosted billing actions are hidden until PayPal checkout is enabled for this environment.', 'ai-visibility-inspector' ); ?></p><?php endif; ?></section>
				<section class="aivi-settings-section" data-aivi-settings-tab-panel="connection"><div class="aivi-settings-section__head"><div><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Connection state', 'ai-visibility-inspector' ); ?></span><h3 class="aivi-settings-section__title"><?php esc_html_e( 'Binding and sync health', 'ai-visibility-inspector' ); ?></h3><p class="aivi-settings-section__desc"><?php esc_html_e( 'Site binding, account sync, and connected-site details live here instead of crowding the billing workspace.', 'ai-visibility-inspector' ); ?></p></div></div><div class="aivi-settings-grid aivi-settings-grid--two"><section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Site binding', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $connected_domain ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Binding: %s', 'ai-visibility-inspector' ), esc_html( $binding_status ) ); ?></li><li><?php printf( esc_html__( 'Site ID: %s', 'ai-visibility-inspector' ), esc_html( $site_id ) ); ?></li><li><?php printf( esc_html__( 'Blog ID: %s', 'ai-visibility-inspector' ), esc_html( $blog_id ) ); ?></li></ul></section><section class="aivi-settings-card"><span class="aivi-settings-section__eyebrow"><?php esc_html_e( 'Account sync', 'ai-visibility-inspector' ); ?></span><h4 class="aivi-settings-card__title"><?php echo esc_html( $account_label ); ?></h4><ul class="aivi-settings-list"><li><?php printf( esc_html__( 'Display state: %s', 'ai-visibility-inspector' ), esc_html( self::get_dashboard_display_label( $display_state ) ) ); ?></li><li><?php printf( esc_html__( 'Last sync: %s', 'ai-visibility-inspector' ), esc_html( $last_sync ) ); ?></li><li><?php printf( esc_html__( 'Subscription status: %s', 'ai-visibility-inspector' ), esc_html( $subscription_status ) ); ?></li></ul></section></div></section>
				<section class="aivi-settings-section" data-aivi-settings-tab-panel="help"><div class="aivi-settings-section__head"><div><span class="aivi-settings-section__eyebrow"><?php echo esc_html( $help_label ); ?></span><h3 class="aivi-settings-section__title"><?php esc_html_e( 'Help and support', 'ai-visibility-inspector' ); ?></h3><p class="aivi-settings-section__desc"><?php esc_html_e( 'Support links stay available without taking over the billing layout. Pending states are reduced to small chips instead of large empty panels.', 'ai-visibility-inspector' ); ?></p></div></div><div class="aivi-settings-actions"><?php if ( ! empty( $docs_url ) ) : ?><a class="button button-secondary" href="<?php echo esc_url( $docs_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Documentation', 'ai-visibility-inspector' ); ?></a><?php else : ?><span class="aivi-dashboard-card__pill"><?php esc_html_e( 'Documentation pending', 'ai-visibility-inspector' ); ?></span><?php endif; ?><?php if ( ! empty( $billing_url ) ) : ?><a class="button button-secondary" href="<?php echo esc_url( $billing_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Billing', 'ai-visibility-inspector' ); ?></a><?php else : ?><span class="aivi-dashboard-card__pill"><?php esc_html_e( 'Billing link pending', 'ai-visibility-inspector' ); ?></span><?php endif; ?><?php if ( ! empty( $support_url ) ) : ?><a class="button button-secondary" href="<?php echo esc_url( $support_url ); ?>" target="_blank" rel="noreferrer noopener"><?php esc_html_e( 'Support', 'ai-visibility-inspector' ); ?></a><?php else : ?><span class="aivi-dashboard-card__pill"><?php esc_html_e( 'Support link pending', 'ai-visibility-inspector' ); ?></span><?php endif; ?></div></section>
			</div>
			<script>
			(function() {
				var shell = document.querySelector('.aivi-settings-shell');
				if (!shell) return;
				var buttons = shell.querySelectorAll('[data-aivi-settings-tab-button]');
				var panels = shell.querySelectorAll('[data-aivi-settings-tab-panel]');
				function tabFromHash(hash) {
					var value = String(hash || '').replace(/^#/, '');
					if (!value) return 'overview';
					if (value === 'aivi-billing-status') return 'overview';
					if (value === 'aivi-billing-plans' || value === 'aivi-settings-tab-billing') return 'billing';
					if (value === 'aivi-billing-topups' || value === 'aivi-settings-tab-credits') return 'credits';
					if (value === 'aivi-settings-tab-connection') return 'connection';
					if (value === 'aivi-settings-tab-help') return 'help';
					return 'overview';
				}
				function activateTab(tab) {
					buttons.forEach(function(button) {
						var active = button.getAttribute('data-aivi-settings-tab-button') === tab;
						button.classList.toggle('is-active', active);
						button.setAttribute('aria-selected', active ? 'true' : 'false');
					});
					panels.forEach(function(panel) {
						panel.classList.toggle('is-active', panel.getAttribute('data-aivi-settings-tab-panel') === tab);
					});
				}
				buttons.forEach(function(button) {
					button.addEventListener('click', function(event) {
						event.preventDefault();
						var tab = button.getAttribute('data-aivi-settings-tab-button') || 'overview';
						activateTab(tab);
						if (window.history && window.history.replaceState) {
							window.history.replaceState(null, document.title, '#aivi-settings-tab-' + tab);
						}
					});
				});
				activateTab(tabFromHash(window.location.hash));
				window.addEventListener('hashchange', function() { activateTab(tabFromHash(window.location.hash)); });
			})();
			</script>
		</div>
		<?php
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
						<?php esc_html_e( 'This is the Milestone 1 read-only connection overview. Backend configuration remains below until account connection fully replaces it.', 'ai-visibility-inspector' ); ?>
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
				<?php esc_html_e( 'Next Milestone 1 steps will add connection handshake and account-state refresh so this panel becomes live, not just scaffolded.', 'ai-visibility-inspector' ); ?>
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
			wp_send_json_error( array( 'message' => __( 'Backend returned Missing Authentication Token. Verify the backend base URL includes the API stage (for example, .../dev).', 'ai-visibility-inspector' ) ) );
		}

		$error_detail = is_array( $decoded ) ? wp_json_encode( $decoded ) : $body;
		wp_send_json_error( array( 'message' => sprintf( __( 'Connection test failed (HTTP %d): %s', 'ai-visibility-inspector' ), $status_code, $error_detail ) ) );
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
		return array(
			'site_id' => $core_site_id,
			'blog_id' => (int) get_current_blog_id(),
			'home_url' => esc_url_raw( home_url( '/' ) ),
			'admin_email' => sanitize_email( (string) get_bloginfo( 'admin_email' ) ),
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
			'plan_code' => '',
			'plan_name' => '',
			'subscription_status' => '',
			'trial_status' => '',
			'site_binding_status' => 'unbound',
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
			'support' => array(
				'docs_url' => '',
				'billing_url' => '',
				'support_url' => '',
				'help_label' => __( 'AiVI Help', 'ai-visibility-inspector' ),
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
		$value = str_replace( array( '_', '-' ), ' ', strtolower( $value ) );
		return ucwords( $value );
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
				'message' => __( 'Connect this site to an AiVI account before starting a plan or adding top-up credits. Credits extend an active trial or subscription.', 'ai-visibility-inspector' ),
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
					'message' => __( 'Your subscription has expired. Choose a plan or buy credits to continue analysis without interruption.', 'ai-visibility-inspector' ),
				);
			default:
				return array(
					'tone'    => 'warning',
					'message' => __( 'Billing status is still syncing. You can review plans and credits here while the account state refreshes.', 'ai-visibility-inspector' ),
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
	 * Whether legacy operational settings should be visible.
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
