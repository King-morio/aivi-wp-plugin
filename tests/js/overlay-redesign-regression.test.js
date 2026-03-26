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
        expect(source).toContain("closeButton.className = 'aivi-overlay-rail-btn subtle';");
        expect(source).toContain("note.textContent = OVERLAY_EDITOR_PERSISTENCE_NOTE;");
        expect(source).toContain('head.appendChild(closeButton);');
        expect(source).toContain('grid-template-columns:minmax(320px,360px) minmax(0,1fr);');
        expect(source).toContain('width:min(100%,940px);');
        expect(source).not.toContain('state.overlayContent.appendChild(listSection);');
    });

    test('places impact pills in the review rail header instead of the sidebar', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const HIGH_IMPACT_CHECK_IDS = new Set([');
        expect(source).toContain('function buildOverlayImpactPill(issue) {');
        expect(source).toContain("pill.className = 'aivi-overlay-review-impact-pill';");
        expect(source).toContain("pill.textContent = tier === 'high'");
        expect(source).toContain("header.className = 'aivi-overlay-review-item-header';");
        expect(source).toContain('const impactPill = buildOverlayImpactPill(issue);');
    });

    test('uses the contextual right-side block handle and floating block menu instead of the top toolbar', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildBlockHandle(nodeRef, body) {');
        expect(source).toContain("button.className = 'aivi-overlay-block-handle';");
        expect(source).toContain('function buildBlockMenu(nodeRef) {');
        expect(source).toContain("menu.className = 'aivi-overlay-block-menu';");
        expect(source).toContain("state.contextDoc.addEventListener('mousedown', state.blockMenuDismissHandler, true);");
        expect(source).toContain('const menuWidth = 288;');
        expect(source).toContain('position:fixed;width:288px;max-width:calc(100vw - 28px);padding:8px;');
        expect(source).not.toContain('function buildOverlayEditToolbar() {');
    });
});
