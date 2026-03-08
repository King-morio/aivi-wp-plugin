const fs = require('fs');
const path = require('path');

describe('billing summary status contract', () => {
    test('run status handler exposes billing_summary to the sidebar response', () => {
        const handlerPath = path.resolve(__dirname, '../../infrastructure/lambda/orchestrator/run-status-handler.js');
        const source = fs.readFileSync(handlerPath, 'utf8');

        expect(source).toContain("if (run.billing_summary && typeof run.billing_summary === 'object') {");
        expect(source).toContain('response.billing_summary = run.billing_summary;');
    });

    test('sidebar payload stripper explicitly allowlists sanitized billing_summary', () => {
        const stripperPath = path.resolve(__dirname, '../../infrastructure/lambda/orchestrator/sidebar-payload-stripper.js');
        const source = fs.readFileSync(stripperPath, 'utf8');

        expect(source).toContain("'billing_summary'");
        expect(source).toContain("} else if (field === 'billing_summary') {");
        expect(source).toContain('const billingSummary = stripBillingSummary(payload[field]);');
    });
});
