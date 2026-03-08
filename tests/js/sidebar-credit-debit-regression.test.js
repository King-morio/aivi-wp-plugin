const fs = require('fs');
const path = require('path');

describe('sidebar credit debit regression', () => {
    test('refreshes authoritative account state after a run and does not render a separate debit card', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('function normalizeBillingSummary(raw)');
        expect(source).toContain('async function fetchLatestAccountSummary()');
        expect(source).toContain('const [liveAccountState, setLiveAccountState] = useState(() => (');
        expect(source).toContain("const accountStatusSummary = buildAccountStatusSummary(report && report.billing_summary, liveAccountState);");
        expect(source).toContain('void refreshLiveAccountState();');
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
});
