const fs = require('fs');
const path = require('path');

describe('sidebar billing CTA regression', () => {
    const sidebarPath = path.join(__dirname, '..', '..', 'assets', 'js', 'aivi-sidebar.js');

    test('routes billing prompts back to the WordPress dashboard anchors', () => {
        const source = fs.readFileSync(sidebarPath, 'utf8');
        expect(source).toContain('function buildAdminDashboardUrl(anchor) {');
        expect(source).toContain("buildAccountAction('Buy credits', '#aivi-billing-topups', true)");
        expect(source).toContain("buildAccountAction('Change plan', '#aivi-billing-plans', false)");
        expect(source).toContain("buildAccountAction('Manage plan', '#aivi-billing-status', true)");
        expect(source).not.toContain('billing_subscribe');
        expect(source).not.toContain('billing_topup');
    });

    test('renders account status actions as dashboard links', () => {
        const source = fs.readFileSync(sidebarPath, 'utf8');
        expect(source).toContain('Array.isArray(summary.actions) && summary.actions.length > 0');
        expect(source).toContain("key: `${summary.kind}-action-${index}`");
        expect(source).toContain('href: action.href');
        expect(source).toContain('action.primary ?');
    });
});
