/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay metadata details regression guard', () => {
    test('restores metadata form inside review-rail details only for metadata checks', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildReviewRailMetadataNode(item) {');
        expect(source).toContain("if (String(item.check_id || '').trim() !== 'metadata_checks') return null;");
        expect(source).toContain("title.textContent = 'Document metadata';");
        expect(source).toContain("badge.textContent = 'Manual';");
        expect(source).toContain("saveBtn.textContent = 'Save metadata';");
        expect(source).toContain("reloadBtn.textContent = 'Reload values';");
        expect(source).toContain("status.textContent = 'Loading saved metadata…';");
        expect(source).toContain("status.textContent = 'Metadata saved for this post.';");
        expect(source).toContain('const metadataNode = buildReviewRailMetadataNode(issue);');
        expect(source).toContain('details.appendChild(metadataNode);');
    });

    test('uses document-meta REST route and title sync helpers', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function getDocumentMetaPath(postId) {');
        expect(source).toContain('return `/document-meta/${normalized}`;');
        expect(source).toContain('async function fetchDocumentMeta(postId) {');
        expect(source).toContain('async function saveDocumentMeta(postId, payload) {');
        expect(source).toContain('function syncEditorTitleValue(nextTitle) {');
        expect(source).toContain("editorDispatcher.editPost({ title });");
    });
});
