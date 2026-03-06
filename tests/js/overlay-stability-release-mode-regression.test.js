/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay stability release mode regression guard', () => {
    test('suppresses Fix with AI actions when stability release mode is enabled', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const stabilityReleaseMode = isStabilityReleaseModeEnabled();');
        expect(source).toContain('if (stabilityReleaseMode || !hasTarget || guardrail.blockAi || isFallback) {');
        expect(source).toContain("status.textContent = '';");
        expect(source).toContain('if (isStabilityReleaseModeEnabled()) {');
        expect(source).not.toContain('Read-only guidance mode: Fix with AI is temporarily disabled.');
        expect(source).not.toContain("setMetaStatus('Read-only guidance mode enabled.')");
    });

    test('keeps re-enable path explicit via config gate', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function isStabilityReleaseModeEnabled() {');
        expect(source).toContain('if (typeof cfg.stabilityReleaseMode === \'boolean\') {');
        expect(source).toContain('return cfg.stabilityReleaseMode;');
        expect(source).toContain('return false;');
    });
});
