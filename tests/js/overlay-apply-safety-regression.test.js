/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay apply safety regression guard', () => {
    test('makes editor-only persistence explicit in the rail and apply confirmation flow', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const cssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const source = fs.readFileSync(overlayPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');

        expect(source).toContain("const OVERLAY_EDITOR_PERSISTENCE_NOTE = 'Apply Changes sends your overlay edits to the WordPress editor. Then click Update or Publish to make them live.';");
        expect(source).toContain("note.className = 'aivi-overlay-rail-note';");
        expect(source).toContain("note.textContent = OVERLAY_EDITOR_PERSISTENCE_NOTE;");
        expect(source).toContain("const message = 'Your article edits stay inside AiVI until you apply them. This sends those edits to the WordPress editor state. Use Update or Publish afterward to make them live. You can still undo after applying.';");
        expect(source).toContain("const noticeMessage = sync.failed > 0");
        expect(source).toContain("showEditorNotice(noticeMessage, 'success');");
        expect(source).toContain("Review the changed blocks, then click Update or Publish.");
        expect(css).toContain('.aivi-overlay-rail-note');
    });

    test('keeps direct overlay article edits local until Apply Changes commits them', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function markOverlayEditableChanged(reason) {');
        expect(source).toContain("body.addEventListener('input', () => markOverlayEditableChanged('input'));");
        expect(source).not.toContain("body.addEventListener('input', () => scheduleBlockUpdate(nodeRef, body));");
        expect(source).not.toContain("updateBlockFromEditable(active.nodeRef, active.body);");
        expect(source).toContain("setMetaStatus('Formatting staged in AiVI. Click Apply Changes to send it to the WordPress editor.');");
    });

    test('reveals applied Gutenberg blocks after a clean apply', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const cssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const source = fs.readFileSync(overlayPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');

        expect(source).toContain('function revealAppliedChangesInEditor(clientIds) {');
        expect(source).toContain('dispatcher.selectBlock(ids[0]);');
        expect(source).toContain("elements.forEach((element) => element.classList.add('aivi-editor-apply-flash'));");
        expect(source).toContain("first.scrollIntoView({ behavior: 'smooth', block: 'center' });");
        expect(source).toContain("showEditorNotice(noticeMessage, 'success');");
        expect(source).toContain('closeOverlayInternal();');
        expect(css).toContain('.aivi-editor-apply-flash');
        expect(css).toContain('@keyframes aiviEditorApplyPulse');
    });

    test('prevents list-style rewrites from coercing generic prose into fake lists', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function convertTextToListMarkup(text) {');
        expect(source).toContain('if (lines.length >= 2) {');
        expect(source).toContain("if (!listMarkup) return 'list_format_required';");
        expect(source).not.toContain(".split(/(?<=[.!?])\\s+/)");
    });

    test('blocks rewrite apply from mutating read-only or unsupported rich blocks', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function isOverlayApplySupportedBlockInfo(blockInfo) {');
        expect(source).toContain("if (!isOverlayApplySupportedBlockInfo(blockInfo)) return 'unsupported_block';");
        expect(source).toContain("return hasUnsupportedTarget ? 'unsupported_block' : 'apply_failed';");
        expect(source).toContain("info.status = 'Read-only block';");
        expect(source).toContain("setMetaStatus('AiVI did not rewrite a read-only block. Use the editor directly for rich content.');");
    });
});
