/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay apply safety regression guard', () => {
    test('uses the manual copy-and-paste guidance model in the rail instead of top apply actions', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const cssPath = path.resolve(__dirname, '../../assets/css/aivi-overlay-editor.css');
        const source = fs.readFileSync(overlayPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');

        expect(source).toContain("const OVERLAY_EDITOR_PERSISTENCE_NOTE = 'Edit inside AiVI, then copy the revised text and paste it into the matching WordPress block. Close this panel anytime to return to the editor.';");
        expect(source).toContain("note.className = 'aivi-overlay-rail-note';");
        expect(source).toContain("note.textContent = OVERLAY_EDITOR_PERSISTENCE_NOTE;");
        expect(source).toContain("closeButton.textContent = 'Close';");
        expect(source).not.toContain("applyButton.textContent = 'Apply Changes';");
        expect(source).not.toContain("copyButton.textContent = 'Copy';");
        expect(source).toContain('head.appendChild(closeButton);');
        expect(css).toContain('.aivi-overlay-rail-note');
    });

    test('keeps direct overlay article edits local until Apply Changes commits them', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function markOverlayEditableChanged(reason, body) {');
        expect(source).toContain("body.addEventListener('input', () => markOverlayEditableChanged('input', body));");
        expect(source).not.toContain("body.addEventListener('input', () => scheduleBlockUpdate(nodeRef, body));");
        expect(source).not.toContain("updateBlockFromEditable(active.nodeRef, active.body);");
        expect(source).toContain("setMetaStatus('Formatting staged in AiVI. Copy the revised text into the matching WordPress block when you are ready.');");
        expect(source).toContain("if (body) {");
        expect(source).toContain("markOverlayBodyDirty(body);");
        expect(source).toContain("setMetaStatus(sync.noChanges ? 'No changes to apply' : 'No editable content found');");
    });

    test('fix assist variants stay copy-only instead of auto-applying to the editor', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("copyBtn.textContent = 'Copy variant';");
        expect(source).toContain("copyBtn.addEventListener('click', () => handleAccept(item, idx));");
        expect(source).toContain("info.status = 'Copied for paste';");
        expect(source).toContain("setMetaStatus('Copied revised text. Paste it into the matching WordPress block, then review and update the post.');");
        expect(source).not.toContain("acceptBtn.textContent = 'Accept';");
        expect(source).not.toContain("info.status = 'Applied in editor';");
        expect(source).not.toContain('applyVariantToEditor(item, text);');
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
        expect(source).toContain("if (unsupportedCount > 0) return 'unsupported_block';");
    });
});
