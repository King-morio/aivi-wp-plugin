<?php
/**
 * Admin Settings Page
 *
 * @package AiVI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin Settings Class
 */
class AiVI_Admin_Settings {

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
		add_action( 'admin_menu', array( $this, 'add_menu_page' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'wp_ajax_aivi_test_connection', array( $this, 'ajax_test_connection' ) );
	}

	/**
	 * Add settings menu page
	 */
	public function add_menu_page() {
		add_options_page(
			__( 'AiVI Settings', 'ai-visibility-inspector' ),
			__( 'AiVI', 'ai-visibility-inspector' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_settings_page' )
		);
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
			__( 'AiVI Backend Base URL', 'ai-visibility-inspector' ),
			array( $this, 'render_backend_url_field' ),
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
			/* translators: 1: Site ID, 2: Plugin version, 3: Link to Papa Fuego plan */
			__( 'Site ID: %1$d | Plugin Version: %2$s | See <a href="%3$s" target="_blank">Papa Fuego Plan</a> for implementation details.', 'ai-visibility-inspector' ),
			esc_html( $site_id ),
			esc_html( $version ),
			esc_url( 'https://github.com/King-morio/AiVI-WP-Plugin/blob/dev/docs/papa_fuego_plan.md' )
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
		$value = isset( $settings['backend_url'] ) ? $settings['backend_url'] : '';
		?>
		<input type="url" 
			   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[backend_url]" 
			   value="<?php echo esc_attr( $value ); ?>" 
			   class="regular-text"
			   placeholder="https://api.aivi.example.com">
		<p class="description">
			<?php _e( 'The base URL for the AiVI backend API. Include the protocol (https://).', 'ai-visibility-inspector' ); ?>
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

		if ( isset( $input['backend_url'] ) ) {
			$url = esc_url_raw( $input['backend_url'] );
			if ( $url && filter_var( $url, FILTER_VALIDATE_URL ) ) {
				$sanitized['backend_url'] = untrailingslashit( $url );
			}
		}

		$sanitized['enable_web_lookups'] = isset( $input['enable_web_lookups'] ) ? (bool) $input['enable_web_lookups'] : false;
		$sanitized['enable_plugin'] = isset( $input['enable_plugin'] ) ? (bool) $input['enable_plugin'] : true;

		if ( isset( $input['token_cutoff'] ) ) {
			$cutoff = absint( $input['token_cutoff'] );
			$sanitized['token_cutoff'] = max( 1000, min( 1000000, $cutoff ) );
		}

		return $sanitized;
	}

	/**
	 * Render settings page
	 */
	public function render_settings_page() {
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

		$settings = $this->get_settings();
		$backend_url = isset( $settings['backend_url'] ) ? $settings['backend_url'] : '';

		if ( empty( $backend_url ) ) {
			wp_send_json_error( array( 'message' => __( 'Backend URL not configured.', 'ai-visibility-inspector' ) ) );
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
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			$error_message = $response->get_error_message();
			$this->log_event( 'ping_failed', array( 'error' => $error_message ) );
			wp_send_json_error( array( 'message' => sprintf( __( 'Connection failed: %s', 'ai-visibility-inspector' ), $error_message ) ) );
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );

		if ( $status_code !== 200 ) {
			$this->log_event( 'ping_failed', array( 'status' => $status_code ) );
			wp_send_json_error( array( 'message' => sprintf( __( 'Backend returned status %d', 'ai-visibility-inspector' ), $status_code ) ) );
		}

		$data = json_decode( $body, true );
		if ( json_last_error() === JSON_ERROR_NONE && isset( $data['ok'] ) && $data['ok'] ) {
			$this->log_event( 'ping_success' );
			wp_send_json_success( array( 'message' => __( 'Connection successful! Backend is available.', 'ai-visibility-inspector' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Backend returned unexpected response.', 'ai-visibility-inspector' ) ) );
		}
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
		return isset( $settings['backend_url'] ) ? $settings['backend_url'] : '';
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

new AiVI_Admin_Settings();
