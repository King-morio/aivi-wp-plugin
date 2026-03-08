const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('milestone 6 step 5 validation matrix', () => {
    test('validation matrix locks chosen domains, regions, and required staging scenarios', () => {
        const doc = read('docs/PHASE5_M6_E2E_VALIDATION_MATRIX.md');

        expect(doc).toContain('eu-north-1');
        expect(doc).toContain('console-staging.dollarchain.store');
        expect(doc).toContain('console.dollarchain.store');
        expect(doc).toContain('us-east-1');
        expect(doc).toContain('Trial lifecycle');
        expect(doc).toContain('Top-up purchase');
        expect(doc).toContain('Insufficient-credit block');
        expect(doc).toContain('Diagnostics/replay recovery');
    });
});
