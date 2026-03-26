/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay rich-block fidelity regression guard', () => {
    test('keeps explicit fallback rendering for essential rich blocks', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildRichBlockFallbackHtml(block) {');
        expect(source).toContain("if (name === 'core/table') {");
        expect(source).toContain("if (name === 'core/embed') {");
        expect(source).toContain("if (name === 'core/video') {");
        expect(source).toContain("if (name === 'core/audio') {");
        expect(source).toContain("if (name === 'core/file') {");
        expect(source).toContain("if (name === 'core/button') {");
        expect(source).toContain("if (name === 'core/buttons') {");
        expect(source).toContain("if (name === 'core/gallery') {");
        expect(source).toContain("if (name === 'core/separator') {");
        expect(source).toContain("if (name === 'core/spacer') {");
        expect(source).toContain('const richFallback = buildRichBlockFallbackHtml(block);');
    });

    test('marks non-editable overlay blocks as read-only without changing the node_ref wrapper model', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function getOverlayBlockRenderMode(block) {');
        expect(source).toContain("wrapper.setAttribute('data-node-ref', nodeRef);");
        expect(source).toContain("wrapper.setAttribute('data-editability', renderMode);");
        expect(source).toContain("body.setAttribute('data-editability', renderMode);");
        expect(source).toContain("chip.className = 'aivi-overlay-block-state';");
    });

    test('styles read-only block shells and common rich content in the checked-in css mirror', () => {
        const cssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const css = fs.readFileSync(cssPath, 'utf8');

        expect(css).toContain('.aivi-overlay-block[data-editability="readonly"]');
        expect(css).toContain('.aivi-overlay-block-state');
        expect(css).toContain('.aivi-overlay-block-body table');
        expect(css).toContain('.aivi-overlay-block-body iframe');
        expect(css).toContain('.aivi-overlay-button-fallback');
        expect(css).toContain('.aivi-overlay-gallery-grid');
        expect(css).toContain('.aivi-overlay-separator');
    });
});
