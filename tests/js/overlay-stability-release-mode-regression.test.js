/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay fix assist generation gate regression guard', () => {
    test('uses explicit config-driven gates for Fix Assist generation', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function isFixAssistGenerationEnabled() {');
        expect(source).toContain('if (typeof cfg.fixAssistGenerationEnabled === \'boolean\') {');
        expect(source).toContain('return cfg.fixAssistGenerationEnabled;');
        expect(source).toContain('const generationEnabled = isFixAssistGenerationEnabled()');
        expect(source).not.toContain('const OVERLAY_FIX_WITH_AI_ENABLED = false;');
        expect(source).not.toContain('Fix Assist generation is not available in this release mode.');
    });

    test('keeps stability release mode explicit but default-off in the overlay', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function isStabilityReleaseModeEnabled() {');
        expect(source).toContain('if (typeof cfg.stabilityReleaseMode === \'boolean\') {');
        expect(source).toContain('return cfg.stabilityReleaseMode;');
        expect(source).toContain('return false;');
    });
});
