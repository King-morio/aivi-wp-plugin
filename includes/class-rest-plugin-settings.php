<?php
/**
 * REST API Plugin Settings Controller
 *
 * @package AiVI
 */

namespace AiVI;

defined( 'ABSPATH' ) || exit;

class REST_Plugin_Settings extends \WP_REST_Controller {

	public function __construct() {
		$this->namespace = 'aivi/v1';
		$this->rest_base = 'settings';

		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/web-lookups',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_web_lookups' ),
					'permission_callback' => array( $this, 'check_permissions' ),
				),
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_web_lookups' ),
					'permission_callback' => array( $this, 'check_permissions' ),
					'args'                => array(
						'enabled' => array(
							'type'              => 'boolean',
							'required'          => true,
							'sanitize_callback' => array( $this, 'sanitize_enabled' ),
						),
					),
				),
			)
		);
	}

	public function check_permissions() {
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}

		return new \WP_Error(
			'rest_forbidden',
			__( 'Sorry, you are not allowed to update AiVI operational settings.', 'ai-visibility-inspector' ),
			array( 'status' => rest_authorization_required_code() )
		);
	}

	public function get_web_lookups() {
		return rest_ensure_response(
			array(
				'ok'      => true,
				'enabled' => Admin_Settings::are_web_lookups_enabled(),
			)
		);
	}

	public function update_web_lookups( $request ) {
		$enabled = $this->sanitize_enabled( $request->get_param( 'enabled' ) );
		$updated = Admin_Settings::update_web_lookups_enabled( $enabled );

		return rest_ensure_response(
			array(
				'ok'      => (bool) $updated || Admin_Settings::are_web_lookups_enabled() === $enabled,
				'enabled' => Admin_Settings::are_web_lookups_enabled(),
			)
		);
	}

	public function sanitize_enabled( $value ) {
		if ( is_bool( $value ) ) {
			return $value;
		}
		if ( is_string( $value ) ) {
			$normalized = strtolower( trim( $value ) );
			return in_array( $normalized, array( '1', 'true', 'yes', 'on' ), true );
		}
		return (bool) $value;
	}
}
