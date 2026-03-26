const fs = require('fs');
const path = require('path');

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('Account state payload contract', () => {
    test('browser config localizes only the public account state payload', () => {
        const classAssets = read('includes/class-assets.php');

        expect(classAssets).toContain("'accountState' => Admin_Settings::get_public_account_state()");
        expect(classAssets).not.toContain("'accountState' => Admin_Settings::get_account_state()");
    });

    test('public account state does not expose private account identifiers or unnecessary site internals', () => {
        const adminSettings = read('includes/class-admin-settings.php');
        const match = adminSettings.match(/public static function get_public_account_state\(\) \{([\s\S]*?)\n\t\}/);

        expect(match).toBeTruthy();
        const body = match[1];

        expect(body).not.toContain('account_id');
        expect(body).not.toContain('home_url');
        expect(body).not.toContain('admin_email');
        expect(body).not.toContain('site_id');
        expect(body).not.toContain('blog_id');
        expect(body).not.toContain('plugin_version');
    });

    test('sidebar surfaces the account status card and gates only on explicit analysis block', () => {
        const sidebar = read('assets/js/aivi-sidebar.js');

        expect(sidebar).toContain('const accountStatusSummary = buildAccountStatusSummary(report && report.billing_summary, liveAccountState, {');
        expect(sidebar).toContain('const analysisBlocked = accountStatusSummary.shouldBlockAnalysis === true;');
        expect(sidebar).toContain("if (analysisBlocked) {");
        expect(sidebar).toContain("(state === 'idle' || state === 'error' || state === 'aborted') && createElement(AccountStatusCard");
    });

    test('auto-run path respects entitlement block as well', () => {
        const sidebar = read('assets/js/aivi-sidebar.js');

        expect(sidebar).toContain("async function runAutoAnalysisOnLoad()");
        expect(sidebar).toContain("if (accountStatusSummary.shouldBlockAnalysis) return;");
    });

    test('overlay config now carries accountState for future entitlement-aware UI', () => {
        const overlay = read('assets/js/aivi-overlay-editor.js');

        expect(overlay).toContain("const accountState = (cfg.accountState && typeof cfg.accountState === 'object') ? cfg.accountState : {};");
        expect(overlay).toContain('return { restBase, nonce, backendConfigured, accountState, isEnabled, text, featureFlags, stalePolicy, stabilityReleaseMode };');
    });
});
