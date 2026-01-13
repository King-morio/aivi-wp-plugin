<?php
/**
 * Test preflight functionality
 *
 * @package AiVI
 */

class Test_Preflight extends AIVI_Test_Case {

	/**
	 * Test preflight endpoint with valid content.
	 */
	public function test_preflight_valid_content() {
		$post_id = $this->create_test_post();
		$post = get_post( $post_id );

		$request = array(
			'title'   => $post->post_title,
			'content' => $post->post_content,
		);

		$response = $this->make_rest_request( 'POST', '/aivi/v1/preflight', $request );

		$this->assertEquals( 200, $response->get_status() );
		$data = $response->get_data();
		
		$this->assertTrue( $data['ok'] );
		$this->assertArrayHasKey( 'tokenEstimate', $data );
		$this->assertArrayHasKey( 'manifest', $data );
		$this->assertLessThan( 200000, $data['tokenEstimate'] );
	}

	/**
	 * Test preflight endpoint with empty content.
	 */
	public function test_preflight_empty_content() {
		$request = array(
			'title'   => '',
			'content' => '',
		);

		$response = $this->make_rest_request( 'POST', '/aivi/v1/preflight', $request );

		$this->assertEquals( 200, $response->get_status() );
		$data = $response->get_data();
		
		$this->assertTrue( $data['ok'] );
		$this->assertEquals( 0, $data['tokenEstimate'] );
	}

	/**
	 * Test preflight endpoint permissions.
	 */
	public function test_preflight_permissions() {
		wp_set_current_user( 0 ); // Log out

		$request = array(
			'title'   => 'Test',
			'content' => 'Test content',
		);

		$response = $this->make_rest_request( 'POST', '/aivi/v1/preflight', $request );

		$this->assertEquals( 401, $response->get_status() );
	}
}
