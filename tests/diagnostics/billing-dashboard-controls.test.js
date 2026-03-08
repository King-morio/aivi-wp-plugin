const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('billing dashboard controls contract', () => {
    test('localizes only the billing metadata required by sidebar/editor flows', () => {
        const classAssets = read('includes/class-assets.php');
        expect(classAssets).toContain("'adminDashboardUrl' => esc_url_raw(admin_url('admin.php?page=aivi-inspector'))");
        expect(classAssets).toContain("'apiEndpoints' => AIVI_API_ENDPOINTS");
        expect(classAssets).toContain("'billingProvider' => AIVI_BILLING_PROVIDER");
        expect(classAssets).toContain("'billingReady' => (bool) AIVI_BILLING_READY");
        expect(classAssets).not.toContain("'billingCatalog' => Admin_Settings::get_public_billing_catalog()");
        expect(classAssets).not.toContain('PAYPAL_CLIENT_SECRET');
        expect(classAssets).not.toContain('PAYPAL_WEBHOOK_ID');
    });

    test('admin dashboard exposes hosted billing actions without raw provider secrets', () => {
        const adminSettings = read('includes/class-admin-settings.php');
        expect(adminSettings).toContain('public static function get_public_billing_catalog()');
        expect(adminSettings).toContain("id=\"aivi-billing-plans\"");
        expect(adminSettings).toContain("id=\"aivi-billing-topups\"");
        expect(adminSettings).toContain("id=\"aivi-billing-status\"");
        expect(adminSettings).toContain("id=\"aivi-billing-result\"");
        expect(adminSettings).toContain("data-billing-action=\"subscribe\"");
        expect(adminSettings).toContain("data-billing-action=\"topup\"");
        expect(adminSettings).toContain("data-billing-action=\"manage\"");
        expect(adminSettings).toContain('window.open(approvalUrl,');
        expect(adminSettings).not.toContain('PAYPAL_CLIENT_SECRET');
        expect(adminSettings).not.toContain('providerSubscriptionId');
        expect(adminSettings).not.toContain('providerOrderId');
    });
});
