/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay deferred-details actionability regression guard', () => {
    test('uses first-instance fallback fields to reconstruct actionable targets', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const buildFirstInstanceFallbackHighlight = (source) => {');
        expect(source).toContain('source.first_instance_snippet');
        expect(source).toContain('source.first_instance_signature');
        expect(source).toContain('source.first_instance_start');
        expect(source).toContain('source.first_instance_end');
        expect(source).toContain('const fallbackHighlight = buildFirstInstanceFallbackHighlight(issue);');
    });

    test('enables Fix with AI using rewrite_target.actionable contract', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const rewriteContext = resolveItemRewriteContext(item);');
        expect(source).toContain('const hasTarget = rewriteContext.rewrite_target && rewriteContext.rewrite_target.actionable === true;');
        expect(source).toContain('const fallbackInlineAllowed = hasAnchorRef && (hasSnippetText || hasOffsetRange)');
        expect(source).toContain('&& !hasStructuralRewriteHint;');
        expect(source).toContain('function isStructuralRewriteOperation(operation) {');
        expect(source).toContain('function hasStructuralRewriteIntentHints(repairIntent) {');
        expect(source).toContain("resolver_reason: 'ui_inline_fallback'");
        expect(source).toContain("if (!Object.prototype.hasOwnProperty.call(target, 'actionable')) {");
    });
});
