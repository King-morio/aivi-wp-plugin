/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay apply integrity regression guard', () => {
    test('classifies editor runtime before deciding whether overlay content is safe to apply', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function hasBlockEditorCanvas() {');
        expect(source).toContain('function getOverlayEditorRuntime(blocksInput, editorPostInput) {');
        expect(source).toContain("renderSource: 'block_editor_blocks'");
        expect(source).toContain("renderSource: 'classic_editor_html'");
        expect(source).toContain("renderSource: 'server_preview'");
        expect(source).toContain("blockedReason: 'block_editor_unready'");
        expect(source).toContain("blockedMessage: 'AiVI is waiting for the block editor to finish loading before it can safely apply changes.'");
    });

    test('treats server highlighted html as preview-only instead of an editable apply source', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("const useServerHighlightedHtmlFallback = !DISABLE_SEMANTIC_HIGHLIGHT_V1");
        expect(source).toContain("&& runtime.renderSource === 'server_preview'");
        expect(source).toContain('function markServerPreviewBlocksReadOnly() {');
        expect(source).toContain("body.removeAttribute('contenteditable');");
        expect(source).toContain("body.removeAttribute('data-editable');");
        expect(source).toContain("body.setAttribute('data-editability', 'readonly');");
    });

    test('blocks apply when AiVI cannot verify a safe editor state', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("if (state.overlayApplyRuntime && state.overlayApplyRuntime.safeApply === false) {");
        expect(source).toContain('blocked: true,');
        expect(source).toContain("blockedReason: state.overlayApplyRuntime.blockedReason || 'unsafe_editor_state'");
        expect(source).toContain("if (sync.blocked) {");
        expect(source).toContain("setMetaStatus(sync.blockedMessage || 'AiVI could not verify a safe editor state for apply.');");
    });

    test('re-reads edited editor state before treating block or classic apply as committed', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("typeof select('core/editor').getEditedPostContent === 'function'");
        expect(source).toContain('function verifyBlockAttributeApplied(nodeRef, attrKey, expectedValue) {');
        expect(source).toContain("if (!verifyBlockAttributeApplied(nodeRef, attrKey, candidateValue)) {");
        expect(source).toContain("if (!verifyBlockAttributeApplied(nodeRef, attrKey, nextValue)) return 'apply_failed';");
        expect(source).toContain('const verifyEditedPostContent = () => {');
        expect(source).toContain('const verifyTextareaContent = () => {');
        expect(source).toContain('const verifyTinyMceContent = () => {');
        expect(source).toContain('const verified = verifyEditedPostContent() || verifyTextareaContent() || verifyTinyMceContent();');
        expect(source).toContain('if (applied && verified) {');
    });

    test('only applies changed overlay bodies and normalizes editable block values before dispatch', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function getEditableBodyInitialHtml(block) {');
        expect(source).toContain('function extractEditableValueForBlock(blockInfo, body) {');
        expect(source).toContain("return `<${listTag}>${attrs.values || ''}</${listTag}>`;");
        expect(source).toContain("return list ? String(list.innerHTML || '').trim() : '';");
        expect(source).toContain("const dirtyBodies = bodies.filter((body) => isOverlayBodyDirty(body));");
        expect(source).toContain("return { updated: 0, unchanged: 0, failed: 0, total: 0, updatedClientIds: [], noChanges: true };");
        expect(source).toContain("blockedReason: 'unsafe_full_editor_snapshot'");
        expect(source).toContain("blockedMessage: 'AiVI could not safely assemble the full editor content for apply. No changes were written.'");
    });
});
