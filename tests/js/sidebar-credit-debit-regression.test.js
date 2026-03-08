const fs = require('fs');
const path = require('path');

describe('sidebar credit debit regression', () => {
    test('renders a post-run credit debit card and does not expose estimate copy', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('function normalizeBillingSummary(raw)');
        expect(source).toContain('function buildPostRunDebitSummary(raw)');
        expect(source).toContain('function CreditDebitCard(props)');
        expect(source).toContain("const billingSummary = buildPostRunDebitSummary(report && report.billing_summary);");
        expect(source).toContain("billingSummary && createElement(CreditDebitCard, { summary: billingSummary })");
        expect(source).toContain('Last analysis debit: ${formatCreditCount(billing.creditsUsed || 0)} credits');
        expect(source).toContain("title: 'Last analysis debit: 0 credits'");
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
