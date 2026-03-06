<?php
/**
 * Capture a full sidebar proxy flow payload (analyze -> run_status polling)
 * using WordPress REST dispatch under an admin user context.
 */

if ( ! defined( 'WP_USE_THEMES' ) ) {
	define( 'WP_USE_THEMES', false );
}

require_once dirname( __DIR__, 4 ) . '/wp-load.php';

$admin_ids = get_users(
	array(
		'role__in' => array( 'administrator' ),
		'number'   => 1,
		'fields'   => 'ids',
	)
);

$admin_id = ! empty( $admin_ids ) ? (int) $admin_ids[0] : 0;
if ( $admin_id <= 0 ) {
	fwrite( STDERR, "No admin user found.\n" );
	exit( 1 );
}

wp_set_current_user( $admin_id );

$content_html = <<<HTML
<h1>Milestone 3 Validation</h1>
<p>This is a real sidebar flow validation run from the WordPress proxy endpoint.</p>
<h2>Section</h2>
<p>We need to verify feature flag propagation and payload shape from proxy_run_status.</p>
HTML;

$analyze_request = new WP_REST_Request( 'POST', '/aivi/v1/backend/proxy_analyze' );
$analyze_request->set_body_params(
	array(
		'title'        => 'Milestone 3 Proxy Flow Validation',
		'content_html' => $content_html,
		'content_type' => 'post',
		'site_id'      => 'milestone3-local',
	)
);

$analyze_response = rest_do_request( $analyze_request );
if ( is_wp_error( $analyze_response ) ) {
	fwrite( STDERR, "proxy_analyze WP_Error: " . $analyze_response->get_error_message() . "\n" );
	exit( 1 );
}

$analyze_data = $analyze_response->get_data();
if ( ! is_array( $analyze_data ) || empty( $analyze_data['run_id'] ) ) {
	fwrite( STDERR, "proxy_analyze returned no run_id.\n" );
	fwrite( STDERR, wp_json_encode( $analyze_data, JSON_PRETTY_PRINT ) . "\n" );
	exit( 1 );
}

$run_id = (string) $analyze_data['run_id'];
echo "RUN_ID={$run_id}\n";
echo "PROXY_ANALYZE_RESPONSE:\n";
echo wp_json_encode( $analyze_data, JSON_PRETTY_PRINT ) . "\n";

$terminal_states = array( 'success', 'success_partial', 'failed', 'aborted', 'timeout' );
$timeline = array();
$final_status_payload = null;

for ( $i = 0; $i < 40; $i++ ) {
	sleep( 3 );

	$status_request = new WP_REST_Request( 'GET', '/aivi/v1/backend/proxy_run_status/' . $run_id );
	$status_request->set_param( 'run_id', $run_id );

	$status_response = rest_do_request( $status_request );
	if ( is_wp_error( $status_response ) ) {
		$timeline[] = array(
			'poll'  => $i + 1,
			'error' => $status_response->get_error_message(),
		);
		continue;
	}

	$status_data = $status_response->get_data();
	$status = is_array( $status_data ) && isset( $status_data['status'] ) ? (string) $status_data['status'] : 'unknown';
	$timeline[] = array(
		'poll'   => $i + 1,
		'status' => $status,
	);

	if ( in_array( $status, $terminal_states, true ) ) {
		$final_status_payload = $status_data;
		break;
	}
}

echo "STATUS_TIMELINE:\n";
echo wp_json_encode( $timeline, JSON_PRETTY_PRINT ) . "\n";

if ( null === $final_status_payload ) {
	echo "FINAL_STATUS_PAYLOAD: null (did not reach terminal status in polling window)\n";
	exit( 2 );
}

echo "FINAL_STATUS_PAYLOAD:\n";
echo wp_json_encode( $final_status_payload, JSON_PRETTY_PRINT ) . "\n";
