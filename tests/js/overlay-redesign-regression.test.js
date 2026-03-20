/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay redesign regression guard', () => {
    test('surfaces the document title and uses the left review rail as the primary issue navigator', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("rail.className = 'aivi-overlay-review-rail';");
        expect(source).toContain("docTitle.className = 'aivi-overlay-doc-title';");
        expect(source).toContain('function getOverlayDocumentTitle(blocks) {');
        expect(source).toContain('function renderReviewRail(recommendations) {');
        expect(source).toContain("viewport.className = 'aivi-overlay-review-viewport';");
        expect(source).toContain("list.className = 'aivi-overlay-review-list';");
        expect(source).toContain("controls.className = 'aivi-overlay-review-scroll-controls';");
        expect(source).toContain("upButton.setAttribute('data-rail-scroll', 'up');");
        expect(source).toContain("downButton.setAttribute('data-rail-scroll', 'down');");
        expect(source).toContain("applyButton.className = 'aivi-overlay-rail-btn primary';");
        expect(source).toContain("copyButton.className = 'aivi-overlay-rail-btn';");
        expect(source).toContain("closeButton.className = 'aivi-overlay-rail-btn subtle';");
        expect(source).not.toContain('state.overlayContent.appendChild(listSection);');
    });

    test('uses the contextual right-side block handle and floating block menu instead of the top toolbar', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildBlockHandle(nodeRef, body) {');
        expect(source).toContain("button.className = 'aivi-overlay-block-handle';");
        expect(source).toContain('function buildBlockMenu(nodeRef) {');
        expect(source).toContain("menu.className = 'aivi-overlay-block-menu';");
        expect(source).not.toContain('function buildOverlayEditToolbar() {');
    });
});
