const fs = require('fs');
const path = require('path');

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('Account dashboard contract', () => {
    test('dashboard state stays server-rendered and is not localized into browser payloads', () => {
        const classAssets = read('includes/class-assets.php');
        const adminSettings = read('includes/class-admin-settings.php');

        expect(classAssets).not.toContain("'accountDashboard' => Admin_Settings::get_public_account_dashboard_state()");
        expect(adminSettings).toContain('$dashboard_state = self::get_account_dashboard_state();');
        expect(adminSettings).toContain("self::render_customer_dashboard_panel( $dashboard_state, $site_identity );");
    });

    test('settings page renders dashboard-first UI and gates legacy operational controls', () => {
        const adminSettings = read('includes/class-admin-settings.php');

        expect(adminSettings).toContain('$show_operational_settings = self::should_show_operational_settings();');
        expect(adminSettings).toContain('<?php if ( $show_operational_settings ) : ?>');
        expect(adminSettings).toContain('public static function should_show_operational_settings()');
        expect(adminSettings).toContain("'aivi_show_operational_settings'");
        expect(adminSettings).toContain('function triggerBillingReturnRefresh()');
        expect(adminSettings).toContain("params.get('aivi_billing_return')");
        expect(adminSettings).toContain('resolveAccountSummaryEndpoint()');
        expect(adminSettings).toContain('operator-issued connection token');
        expect(adminSettings).toContain('Add another site to this account');
        expect(adminSettings).toContain('Disconnect this site');
    });

    test('admin menu now points the top-level AiVI page at the same dashboard renderer', () => {
        const adminMenu = read('includes/class-admin-menu.php');

        expect(adminMenu).toContain('public function render_admin_page() {');
        expect(adminMenu).toContain('Admin_Settings::render_settings_page_static();');
        expect(adminMenu).not.toContain('Prototype UI Shell');
    });

    test('account summary proxy returns public dashboard summary alongside account state', () => {
        const proxy = read('includes/class-rest-backend-proxy.php');

        expect(proxy).toContain("'dashboard_summary' => Admin_Settings::get_public_account_dashboard_state($dashboard_state)");
        expect(proxy).toContain('private function extract_remote_dashboard_summary($data)');
        expect(proxy).toContain('Admin_Settings::sync_remote_account_snapshot($remote_state, is_array($remote_dashboard) ? $remote_dashboard : array());');
        expect(proxy).toContain("'dashboard_summary' => Admin_Settings::get_public_account_dashboard_state(),");
        expect(proxy).toContain("contact_email = sanitize_email( (string) ( $params['contact_email'] ?? '' ) );");
        expect(proxy).toContain("Admin_Settings::update_preferred_contact_email( $contact_email );");
        expect(proxy).toContain('summary_contact_email');
        expect(proxy).toContain("if ( '' !== $summary_contact_email ) {");
        expect(proxy).toContain("$headers['X-AIVI-Admin-Email'] = $summary_contact_email;");
    });
});
