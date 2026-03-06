/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay underline style regression guard', () => {
    test('keeps severity-based underline styles and severity tagging hooks', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function resolveItemSeverity(item)');
        expect(source).toContain('function applySeverityToHighlightNode(node, severity)');
        expect(source).toContain('applySeverityToHighlightNode(span, severity);');

        expect(source).toMatch(/aivi-overlay-highlight\[data-severity=["\\]*fail["\\]*\],\s*\.aivi-overlay-highlight-fail\s*\{\s*text-decoration-style:\s*solid/);
        expect(source).toMatch(/aivi-overlay-highlight\[data-severity=["\\]*partial["\\]*\],\s*\.aivi-overlay-highlight-partial\s*\{\s*text-decoration-style:\s*dashed/);
        expect(source).toMatch(/\.aivi-overlay-highlight\.v2-rect\s*\{\s*text-decoration:\s*none;/);
    });
});
