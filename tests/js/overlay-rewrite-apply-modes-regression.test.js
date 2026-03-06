/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay rewrite apply-mode regression guard', () => {
    test('uses mode-aware apply path for span/block/heading-support rewrites', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function resolveRewriteApplyMode(rewriteTarget) {');
        expect(source).toContain("if (operation === 'replace_span' || operation === 'replace_block' || operation === 'heading_support_range' || operation === 'convert_to_list') {");
        expect(source).toContain("if (mode === 'convert_to_list') return 'convert_to_list';");
        expect(source).toContain("if (mode === 'heading_support_range') return 'heading_support_range';");
        expect(source).toContain("if (mode === 'block' || mode === 'section') return 'replace_block';");
    });

    test('prevents heading-only replacement for heading_support_range mode', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("if (applyMode === 'heading_support_range') {");
        expect(source).toContain('const headingNodeRef = String(rewriteTarget && rewriteTarget.heading_node_ref ? rewriteTarget.heading_node_ref : \'\').trim();');
        expect(source).toContain('targetNodeRefs = targetNodeRefs.filter((ref) => ref !== headingNodeRef);');
    });

    test('supports convert_to_list apply flow with list markup conversion', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function convertTextToListMarkup(text) {');
        expect(source).toContain('if (isListLikeMode(applyMode)) {');
        expect(source).toContain('const listMarkup = convertTextToListMarkup(appliedText) || String(appliedText || \'\');');
    });
});
