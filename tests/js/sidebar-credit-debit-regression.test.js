const fs = require('fs');
const path = require('path');

describe('sidebar credit debit regression', () => {
    test('refreshes authoritative account state after a run and does not render a separate debit card', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('function normalizeBillingSummary(raw)');
        expect(source).toContain('async function fetchLatestAccountSummary()');
        expect(source).toContain('const [liveAccountState, setLiveAccountState] = useState(() => (');
        expect(source).toContain("const accountStatusSummary = buildAccountStatusSummary(report && report.billing_summary, liveAccountState, {");
        expect(source).toContain('void refreshLiveAccountState();');
        expect(source).toContain("(state === 'idle' || state === 'error' || state === 'aborted') && createElement(AccountStatusCard");
        expect(source).not.toContain('function buildPostRunDebitSummary(raw)');
        expect(source).not.toContain('function CreditDebitCard(props)');
        expect(source).not.toContain('Last analysis debit: ${formatCreditCount(billing.creditsUsed || 0)} credits');
        expect(source).not.toContain('Estimated credits');
        expect(source).not.toContain('Estimated cost');
    });

    test('keeps low-balance blocking tied to admission denial paths', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain("code === 'insufficient_credits' || code === 'analysis_not_allowed' || status === 402 || status === 403");
        expect(source).toContain('AiVI could not admit this analysis run for the current account state.');
    });

    test('shows buy credits only for active paid subscriptions', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain("const canBuyCredits = isConnected && accountState.subscriptionStatus === 'active';");
        expect(source).toContain("canBuyCredits ? buildAccountAction('Buy credits', '#aivi-billing-topups', false) : null");
        expect(source).not.toContain("buildAccountAction('Buy credits', '#aivi-billing-topups', true)");
    });

    test('passes the live web-lookups toggle state into summary and analysis payloads', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('const [webLookupsEnabledLive, setWebLookupsEnabledLive] = useState(config.webLookupsEnabled === true);');
        expect(source).toContain('webLookupsEnabled: webLookupsEnabledLive');
        expect(source).toContain('enable_web_lookups: isWebLookupVerificationEnabled(undefined, webLookupsEnabledLive)');
        expect(source).toContain('enable_web_lookups: isWebLookupVerificationEnabled(liveAccountState, webLookupsEnabledLive)');
    });
});
