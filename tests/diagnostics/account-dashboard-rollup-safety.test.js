const fs = require('fs');
const path = require('path');

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('Account dashboard rollup safety', () => {
    test('usage rollup option and local rollup helpers are defined on the WordPress side', () => {
        const config = read('includes/config.php');
        const adminSettings = read('includes/class-admin-settings.php');

        expect(config).toContain("define( 'AIVI_USAGE_ROLLUP_OPTION', 'aivi_usage_rollup_state' );");
        expect(config).toContain("define( 'AIVI_ACCOUNT_DASHBOARD_OPTION', 'aivi_account_dashboard_state' );");
        expect(adminSettings).toContain('const USAGE_ROLLUP_OPTION_KEY = AIVI_USAGE_ROLLUP_OPTION;');
        expect(adminSettings).toContain('const ACCOUNT_DASHBOARD_OPTION_KEY = AIVI_ACCOUNT_DASHBOARD_OPTION;');
        expect(adminSettings).toContain('public static function record_run_usage_summary( $run_id, $status, $billing_summary = array(), $completed_at = \'\' )');
        expect(adminSettings).toContain('private static function get_usage_rollup_state()');
        expect(adminSettings).toContain('private static function get_default_usage_rollup_state( $month_key = null )');
        expect(adminSettings).toContain('public static function sync_remote_account_snapshot( $account_state = array(), $dashboard_state = array() )');
    });

    test('run-status proxy records sanitized recent usage from completed runs', () => {
        const proxy = read('includes/class-rest-backend-proxy.php');

        expect(proxy).toContain('Admin_Settings::record_run_usage_summary(');
        expect(proxy).toContain("isset($data['billing_summary']) &&");
        expect(proxy).toContain("in_array($data['status'], array('success', 'success_partial', 'failed', 'failed_schema', 'failed_too_long', 'aborted'), true)");
    });

    test('dashboard defaults now expose recent usage fields without leaking ledger internals', () => {
        const adminSettings = read('includes/class-admin-settings.php');

        expect(adminSettings).toContain("'analyses_this_month' => $usage_rollup['analyses_this_month']");
        expect(adminSettings).toContain("'credits_used_this_month' => $usage_rollup['credits_used_this_month']");
        expect(adminSettings).toContain("'last_analysis_at' => $usage_rollup['last_analysis_at']");
        expect(adminSettings).toContain("'last_run_status' => $usage_rollup['last_run_status']");
        expect(adminSettings).not.toContain('raw_cost_usd');
        expect(adminSettings).not.toContain('pricing_version');
        expect(adminSettings).not.toContain('event_id');
    });
});
