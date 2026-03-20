/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay account-ready regression guard', () => {
    test('does not block the overlay only because backendConfigured is false', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const accountState = (cfg.accountState && typeof cfg.accountState === \'object\') ? cfg.accountState : {};');
        expect(source).toContain('const hasCompletedReport = !!(');
        expect(source).toContain('const hasConnectedAccount = accountState.connected === true');
        expect(source).toContain('if (!cfg.backendConfigured && !hasCompletedReport && !hasConnectedAccount) {');
    });
});
