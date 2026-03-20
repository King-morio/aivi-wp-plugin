const fs = require('fs');
const path = require('path');

describe('sidebar poll timeout regression', () => {
    const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
    const source = fs.readFileSync(sidebarPath, 'utf8');

    test('poll window allows for long-running worker completions', () => {
        expect(source).toContain('const MAX_DURATION = 300000;');
    });

    test('timeout path no longer falls through to the generic analysis failed message', () => {
        expect(source).toContain(
            "return 'Analysis is taking longer than expected. It may still finish shortly. Please wait a moment and refresh, or try again in a few minutes.';"
        );
    });
});
