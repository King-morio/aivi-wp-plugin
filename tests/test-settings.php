<?php
/**
 * Settings Tests
 *
 * @package AiVI
 */

class Test_Settings extends AIVI_Test_Case {

	/**
	 * Test settings save and load
	 */
	public function test_settings_save_load() {
		// Get initial settings
		$initial = AiVI_Admin_Settings::get_settings();
		$this->assertIsArray( $initial );

		// Save test settings
		$test_settings = array(
			'backend_url' => 'https://test-api.example.com',
			'enable_web_lookups' => true,
			'enable_plugin' => false,
			'token_cutoff' => 150000,
		);

		update_option( AiVI_Admin_Settings::OPTION_KEY, $test_settings, false );

		// Load settings
		$loaded = AiVI_Admin_Settings::get_settings();
		$this->assertEquals( $test_settings, $loaded );
	}

	/**
	 * Test settings sanitization
	 */
	public function test_settings_sanitization() {
		$admin_settings = new AiVI_Admin_Settings();

		// Test URL sanitization
		$input = array(
			'backend_url' => 'https://test.com/path/',
			'enable_web_lookups' => '1',
			'enable_plugin' => '0',
			'token_cutoff' => '250000',
		);

		$sanitized = $admin_settings->sanitize_settings( $input );

		$this->assertEquals( 'https://test.com/path', $sanitized['backend_url'] );
		$this->assertTrue( $sanitized['enable_web_lookups'] );
		$this->assertFalse( $sanitized['enable_plugin'] );
		$this->assertEquals( 250000, $sanitized['token_cutoff'] );
	}

	/**
	 * Test invalid URL is rejected
	 */
	public function test_invalid_url_rejected() {
		$admin_settings = new AiVI_Admin_Settings();

		$input = array(
			'backend_url' => 'not-a-url',
		);

		$sanitized = $admin_settings->sanitize_settings( $input );
		$this->assertArrayNotHasKey( 'backend_url', $sanitized );
	}

	/**
	 * Test token cutoff bounds
	 */
	public function test_token_cutoff_bounds() {
		$admin_settings = new AiVI_Admin_Settings();

		// Test minimum
		$input = array( 'token_cutoff' => '500' );
		$sanitized = $admin_settings->sanitize_settings( $input );
		$this->assertEquals( 1000, $sanitized['token_cutoff'] );

		// Test maximum
		$input = array( 'token_cutoff' => '2000000' );
		$sanitized = $admin_settings->sanitize_settings( $input );
		$this->assertEquals( 1000000, $sanitized['token_cutoff'] );
	}

	/**
	 * Test helper methods
	 */
	public function test_helper_methods() {
		// Set test settings
		$test_settings = array(
			'backend_url' => 'https://test.example.com',
			'enable_web_lookups' => true,
			'enable_plugin' => true,
			'token_cutoff' => 300000,
		);
		update_option( AiVI_Admin_Settings::OPTION_KEY, $test_settings, false );

		// Test get_backend_url
		$this->assertEquals( 'https://test.example.com', AiVI_Admin_Settings::get_backend_url() );

		// Test is_enabled
		$this->assertTrue( AiVI_Admin_Settings::is_enabled() );

		// Test are_web_lookups_enabled
		$this->assertTrue( AiVI_Admin_Settings::are_web_lookups_enabled() );

		// Test get_token_cutoff
		$this->assertEquals( 300000, AiVI_Admin_Settings::get_token_cutoff() );

		// Test defaults when empty
		delete_option( AiVI_Admin_Settings::OPTION_KEY );
		$this->assertEquals( '', AiVI_Admin_Settings::get_backend_url() );
		$this->assertTrue( AiVI_Admin_Settings::is_enabled() );
		$this->assertFalse( AiVI_Admin_Settings::are_web_lookups_enabled() );
		$this->assertEquals( 200000, AiVI_Admin_Settings::get_token_cutoff() );
	}

	/**
	 * Test proxy ping with mock
	 */
	public function test_proxy_ping_mock() {
		// Mock successful ping response
		add_filter( 'pre_http_request', function( $preempt, $r, $url ) {
			if ( strpos( $url, '/ping' ) !== false ) {
				return array(
					'body' => wp_json_encode( array( 'ok' => true, 'aiAvailable' => true ) ),
					'response' => array( 'code' => 200 ),
				);
			}
			return $preempt;
		}, 10, 3 );

		// Set backend URL
		$test_settings = array( 'backend_url' => 'https://test.example.com' );
		update_option( AiVI_Admin_Settings::OPTION_KEY, $test_settings, false );

		// Create request
		$request = new WP_REST_Request();
		$proxy = new REST_Backend_Proxy();
		$response = $proxy->proxy_ping( $request );

		$this->assertEquals( 200, $response->status );
		$data = $response->get_data();
		$this->assertTrue( $data['ok'] );
		$this->assertTrue( $data['aiAvailable'] );

		// Remove filter
		remove_all_filters( 'pre_http_request' );
	}

	/**
	 * Test proxy ping when backend disabled
	 */
	public function test_proxy_ping_backend_disabled() {
		// Disable plugin
		$test_settings = array( 'enable_plugin' => false );
		update_option( AiVI_Admin_Settings::OPTION_KEY, $test_settings, false );

		$request = new WP_REST_Request();
		$proxy = new REST_Backend_Proxy();
		$response = $proxy->proxy_ping( $request );

		$data = $response->get_data();
		$this->assertFalse( $data['ok'] );
		$this->assertFalse( $data['aiAvailable'] );
		$this->assertStringContains( 'disabled', $data['message'] );
	}

	/**
	 * Test proxy ping when no backend URL
	 */
	public function test_proxy_ping_no_backend_url() {
		// Ensure no backend URL
		delete_option( AiVI_Admin_Settings::OPTION_KEY );

		$request = new WP_REST_Request();
		$proxy = new REST_Backend_Proxy();
		$response = $proxy->proxy_ping( $request );

		$data = $response->get_data();
		$this->assertFalse( $data['ok'] );
		$this->assertFalse( $data['aiAvailable'] );
		$this->assertStringContains( 'not configured', $data['message'] );
	}
}
