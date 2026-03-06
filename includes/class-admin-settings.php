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

		echo '<p>';
		printf(
			/* translators: 1: Site ID, 2: Plugin version */
			__( 'Site ID: %1$d | Plugin Version: %2$s', 'ai-visibility-inspector' ),
			intval( $site_id ),
			esc_html( $version )
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
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

			<form action="options.php" method="post">
				<?php
				settings_fields( self::OPTION_KEY );
				do_settings_sections( self::PAGE_SLUG );
				submit_button();
				?>
			</form>

			<hr>

			<h2><?php _e( 'Test Connection', 'ai-visibility-inspector' ); ?></h2>
			<p><?php _e( 'Test the connection to your configured backend.', 'ai-visibility-inspector' ); ?></p>

			<button type="button" id="aivi-test-connection" class="button button-secondary">
				<?php _e( 'Test Connection', 'ai-visibility-inspector' ); ?>
			</button>

			<div id="aivi-test-result" class="notice" style="display: none;"></div>
		</div>

		<script>
		jQuery(document).ready(function($) {
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
		});
		</script>
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
	 * Get backend URL
	 *
	 * @return string
	 */
	public static function get_backend_url() {
		$settings = self::get_settings();
		if ( isset( $settings['backend_url'] ) && ! empty( $settings['backend_url'] ) ) {
			return self::normalize_backend_url( $settings['backend_url'] );
		}
		if ( defined( 'AIVI_BACKEND_URL' ) ) {
			return self::normalize_backend_url( AIVI_BACKEND_URL );
		}
		return '';
	}

	private static function normalize_backend_url( $url ) {
		$url = trim( (string) $url );
		if ( $url === '' ) {
			return '';
		}
		$url = rtrim( $url, '/' );
		$parts = wp_parse_url( $url );
		if ( $parts && isset( $parts['host'] ) && strpos( $parts['host'], 'execute-api.' ) !== false ) {
			$path = isset( $parts['path'] ) ? trim( $parts['path'] ) : '';
			if ( $path === '' || $path === '/' ) {
				$url .= '/dev';
			}
		}
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
