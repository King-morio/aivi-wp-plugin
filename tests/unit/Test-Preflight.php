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
		
		$this->assertFalse( $data['ok'] );
		$this->assertEquals( 'empty_content', $data['reason'] );
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

	/**
	 * Test Gutenberg list blocks preserve descendant list-item text in block_map.
	 */
	public function test_build_block_map_preserves_gutenberg_list_text() {
		$preflight = new \AiVI\REST_Preflight();
		$content   = implode(
			"\n",
			array(
				'<!-- wp:heading -->',
				'<h2>Best Structure for AEO + GEO Content</h2>',
				'<!-- /wp:heading -->',
				'<!-- wp:paragraph -->',
				'<p>To maximize performance, follow this structure:</p>',
				'<!-- /wp:paragraph -->',
				'<!-- wp:list {"ordered":true} -->',
				'<ol><!-- wp:list-item -->',
				'<li>Title: Clear and query-focused</li>',
				'<!-- /wp:list-item -->',
				'<!-- wp:list-item -->',
				'<li>Introduction: Direct answer first</li>',
				'<!-- /wp:list-item --></ol>',
				'<!-- /wp:list -->',
			)
		);

		$block_data = $preflight->build_block_map( $content );
		$block_map  = $block_data['block_map'];
		$list_block = null;

		foreach ( $block_map as $block ) {
			if ( isset( $block['block_type'] ) && 'core/list' === $block['block_type'] ) {
				$list_block = $block;
				break;
			}
		}

		$this->assertSame( 'gutenberg', $block_data['content_type'] );
		$this->assertNotNull( $list_block, 'Expected a core/list block to be preserved in block_map.' );
		$this->assertGreaterThan( 0, $list_block['text_length'] );
		$this->assertStringContainsString( 'Title: Clear and query-focused', $list_block['text'] );
		$this->assertStringContainsString( 'Introduction: Direct answer first', $list_block['text'] );
	}

	/**
	 * Test the preflight manifest includes Gutenberg list support in block_map.
	 */
	public function test_preflight_manifest_includes_gutenberg_list_blocks() {
		$content = implode(
			"\n",
			array(
				'<!-- wp:heading -->',
				'<h2>Common Mistakes to Avoid</h2>',
				'<!-- /wp:heading -->',
				'<!-- wp:list -->',
				'<ul><!-- wp:list-item -->',
				'<li>Writing long introductions without answering the question</li>',
				'<!-- /wp:list-item -->',
				'<!-- wp:list-item -->',
				'<li>Ignoring structure and formatting</li>',
				'<!-- /wp:list-item --></ul>',
				'<!-- /wp:list -->',
			)
		);

		$response = $this->make_rest_request(
			'POST',
			'/aivi/v1/preflight',
			array(
				'title'   => 'AEO Content Structure',
				'content' => $content,
			)
		);

		$this->assertEquals( 200, $response->get_status() );
		$data      = $response->get_data();
		$block_map = $data['manifest']['block_map'];
		$list_block = null;

		foreach ( $block_map as $block ) {
			if ( isset( $block['block_type'] ) && 'core/list' === $block['block_type'] ) {
				$list_block = $block;
				break;
			}
		}

		$this->assertTrue( $data['ok'] );
		$this->assertNotNull( $list_block, 'Expected preflight manifest block_map to include core/list.' );
		$this->assertStringContainsString( 'Ignoring structure and formatting', $list_block['text'] );
	}
}
