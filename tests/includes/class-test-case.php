<?php
/**
 * Base test case for AiVI tests
 *
 * @package AiVI
 */

abstract class AIVI_Test_Case extends WP_UnitTestCase {

	/**
	 * Setup the test.
	 */
	public function setUp() {
		parent::setUp();
		
		// Set up common test data
		$this->admin_user = $this->factory->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin_user );
	}

	/**
	 * Teardown the test.
	 */
	public function tearDown() {
		parent::tearDown();
		wp_set_current_user( 0 );
	}

	/**
	 * Create a test post.
	 *
	 * @param array $args Post arguments.
	 * @return int Post ID.
	 */
	protected function create_test_post( $args = array() ) {
		$defaults = array(
			'post_title'   => 'Test Post',
			'post_content' => 'This is test content for the AiVI plugin.',
			'post_status'  => 'publish',
			'post_author'  => $this->admin_user,
		);

		return $this->factory->post->create( wp_parse_args( $args, $defaults ) );
	}

	/**
	 * Make a REST API request.
	 *
	 * @param string $method HTTP method.
	 * @param string $route  REST route.
	 * @param array  $body   Request body.
	 * @return array Response.
	 */
	protected function make_rest_request( $method, $route, $body = array() ) {
		$request = new WP_REST_Request( $method, $route );
		
		if ( ! empty( $body ) ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}

		return rest_do_request( $request );
	}
}
