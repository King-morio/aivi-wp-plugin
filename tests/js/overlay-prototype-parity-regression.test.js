/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay prototype parity regression guard', () => {
    test('does not render an internal right-side overlay reserve panel', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const overlayCssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const source = fs.readFileSync(overlayPath, 'utf8');
        const css = fs.readFileSync(overlayCssPath, 'utf8');

        expect(source).not.toContain('aivi-overlay-sidebar-reserve');
        expect(source).not.toContain("header.className = 'aivi-overlay-header';");
        expect(source).not.toContain("meta.className = 'aivi-overlay-meta';");
        expect(source).toContain("shell.appendChild(rail);");
        expect(source).toContain("shell.appendChild(stage);");
        expect(source).toContain("state.overlayRailViewport = viewport;");
        expect(css).toContain('grid-template-columns: 392px minmax(0, 1fr);');
        expect(css).toContain('border-left: 1px solid #dee3ea;');
        expect(css).toContain('align-items: stretch;');
        expect(css).toContain('position: fixed;');
        expect(css).toContain('height: 100%;');
        expect(css).toContain('overflow: hidden;');
        expect(css).toContain('.aivi-overlay-review-viewport {');
        expect(css).toContain('.aivi-overlay-review-scroll-controls {');
        expect(css).toContain('background: linear-gradient(180deg, rgba(37, 99, 235, 0.05), transparent 24%), #f5f6f8;');
    });

    test('uses a prototype-style row menu instead of the older chip-grid popup contract', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const overlayCssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const source = fs.readFileSync(overlayPath, 'utf8');
        const css = fs.readFileSync(overlayCssPath, 'utf8');

        expect(source).toContain("label: 'Block type'");
        expect(source).toContain("label: 'Insert nearby'");
        expect(source).toContain("label: 'Links and evidence'");
        expect(source).toContain("label: 'Block actions'");
        expect(source).toContain("label: 'Return to issue'");
        expect(source).not.toContain("label: 'Improve block'");
        expect(css).toContain('.aivi-overlay-block-menu-submenu');
        expect(css).toContain('.aivi-overlay-block-menu-action.wide');
    });

    test('softens block-island behavior toward a continuous document feel', () => {
        const overlayJsPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const overlayCssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const source = fs.readFileSync(overlayJsPath, 'utf8');
        const css = fs.readFileSync(overlayCssPath, 'utf8');

        expect(source).toContain("wrapper.addEventListener('mousedown'");
        expect(css).toContain('.aivi-overlay-block::before');
        expect(css).toContain('padding: 0 28px 0 20px;');
        expect(css).toContain('font-size: 18px;');
        expect(css).not.toContain('.aivi-overlay-block:hover {');
    });
});
