const fs = require('fs');
const path = require('path');

describe('sidebar billing CTA regression', () => {
    const sidebarPath = path.join(__dirname, '..', '..', 'assets', 'js', 'aivi-sidebar.js');

    test('routes billing prompts back to the WordPress dashboard anchors', () => {
        const source = fs.readFileSync(sidebarPath, 'utf8');
        expect(source).toContain('function buildAdminDashboardUrl(anchor) {');
        expect(source).toContain("buildAccountAction('Buy credits', '#aivi-billing-topups', false)");
        expect(source).toContain("buildAccountAction('Change plan', '#aivi-billing-plans', true)");
        expect(source).toContain("buildAccountAction('Manage plan', '#aivi-billing-status', true)");
        expect(source).not.toContain('billing_subscribe');
        expect(source).not.toContain('billing_topup');
    });

    test('renders the connected account card with inline actions and web-lookups toggle', () => {
        const source = fs.readFileSync(sidebarPath, 'utf8');
        expect(source).toContain("justifyContent: summary.canBuyCredits ? 'space-between' : 'center'");
        expect(source).toContain('Verify with web lookups');
        expect(source).toContain('summary.manageHref && createElement(\'a\'');
        expect(source).toContain('summary.canBuyCredits && summary.buyCreditsHref');
    });
});
