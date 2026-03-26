const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('paypal rollout safety', () => {
    test('ships hosted billing enabled by default while keeping provider secrets and identifiers out of the browser', () => {
        const config = read('includes/config.php');
        expect(config).toContain("define( 'AIVI_BILLING_READY', true );");
        expect(config).toContain("define( 'AIVI_DEFAULT_BACKEND_URL', 'https://dnvo4w1sca.execute-api.eu-north-1.amazonaws.com' );");
        expect(config).toContain("define( 'AIVI_BILLING_PROVIDER', 'paypal' );");
        expect(config).toContain("define( 'AIVI_PUBLIC_BILLING_CATALOG'");
    });

    test('browser payload exposes only safe billing metadata', () => {
        const assets = read('includes/class-assets.php');
        expect(assets).toContain("'billingProvider' => AIVI_BILLING_PROVIDER");
        expect(assets).toContain("'billingReady' => (bool) AIVI_BILLING_READY");
        expect(assets).not.toContain("'billingCatalog' => Admin_Settings::get_public_billing_catalog()");
        expect(assets).not.toContain("'accountDashboard' => Admin_Settings::get_public_account_dashboard_state()");
        expect(assets).not.toContain("'paypalEnvKeys'");
        expect(assets).not.toContain('PAYPAL_CLIENT_SECRET');
        expect(assets).not.toContain('PAYPAL_WEBHOOK_ID');
    });

    test('wordpress proxy keeps billing actions hosted and account-bound', () => {
        const proxy = read('includes/class-rest-backend-proxy.php');
        expect(proxy).toContain("public function proxy_billing_subscribe($request)");
        expect(proxy).toContain("public function proxy_billing_topup($request)");
        expect(proxy).toContain("public function proxy_billing_manage($request)");
        expect(proxy).toContain("'account_id' => $account_id");
        expect(proxy).toContain("'site' => $site_identity");
        expect(proxy).toContain('foreach (array(\'aivi_billing_return\', \'provider_order_id\', \'payer_id\', \'subscription_ref\') as $key)');
        expect(proxy).not.toContain("'provider_subscription_id' =>");
        expect(proxy).not.toContain("'provider_order_id' =>");
    });

    test('rollout prerequisites are documented in the sandbox runbook', () => {
        const runbook = read('docs/PHASE5_M4_PAYPAL_SANDBOX_RUNBOOK.md');
        expect(runbook).toContain('PAYPAL_API_BASE');
        expect(runbook).toContain('PAYPAL_CLIENT_ID');
        expect(runbook).toContain('PAYPAL_CLIENT_SECRET');
        expect(runbook).toContain('PAYPAL_WEBHOOK_ID');
        expect(runbook).toContain('BILLING_CHECKOUT_INTENTS_TABLE');
        expect(runbook).toContain('PAYPAL_WEBHOOK_EVENTS_TABLE');
        expect(runbook).toContain('BILLING_SUBSCRIPTIONS_TABLE');
        expect(runbook).toContain('BILLING_TOPUP_ORDERS_TABLE');
        expect(runbook).toContain('ACCOUNT_BILLING_STATE_TABLE');
        expect(runbook).toContain('trial -> paid');
        expect(runbook).toContain('top-up purchase');
        expect(runbook).toContain('payment failure');
        expect(runbook).toContain('cancelled subscription');
    });
});
