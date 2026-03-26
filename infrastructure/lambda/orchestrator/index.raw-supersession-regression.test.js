const fs = require('fs');
const path = require('path');

describe('raw analysis supersession regression', () => {
    test('raw handler rejects superseded runs instead of returning stale raw payloads', () => {
        const source = fs.readFileSync(path.resolve(__dirname, './index.js'), 'utf8');

        expect(source).toContain("error: 'results_superseded'");
        expect(source).toContain('superseded_by_run_id: supersedingRunId');
    });
});
