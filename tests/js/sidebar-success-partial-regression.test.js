const fs = require('fs');
const path = require('path');

describe('sidebar success_partial regression guard', () => {
    test('failed statuses with recoverable partial payload are promoted to success_partial rendering', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain(
            "if (result.data?.partial && (result.data?.result_url || result.data?.result || result.data?.analysis_summary)) {"
        );
        expect(source).toContain(
            "return await finalizeSuccessfulPollPayload(result.data, 'success_partial');"
        );
        expect(source).toContain(
            "Recoverable partial payload returned with failed status; treating as success_partial"
        );
    });
});
