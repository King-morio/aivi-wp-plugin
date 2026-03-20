const fs = require('fs');
const path = require('path');

describe('overlay draft compatibility regression', () => {
    const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
    const source = fs.readFileSync(overlayPath, 'utf8');

    test('overlay drafts are versioned and tied to the current analysis/article context before restore', () => {
        expect(source).toContain('const OVERLAY_DRAFT_VERSION = 2;');
        expect(source).toContain('analysis_content_hash: compatibility.analysis_content_hash,');
        expect(source).toContain('editor_signature: compatibility.editor_signature,');
        expect(source).toContain('overlay_schema_version: compatibility.overlay_schema_version,');
        expect(source).toContain('if (payloadVersion !== OVERLAY_DRAFT_VERSION) return false;');
        expect(source).toContain('if (current.run_id && savedRunId && current.run_id !== savedRunId) return false;');
        expect(source).toContain('if (current.analysis_content_hash && savedAnalysisHash && current.analysis_content_hash !== savedAnalysisHash) return false;');
        expect(source).toContain('if (current.editor_signature && savedEditorSignature && current.editor_signature !== savedEditorSignature) return false;');
        expect(source).toContain('if (current.overlay_schema_version && savedSchemaVersion && current.overlay_schema_version !== savedSchemaVersion) return false;');
        expect(source).toContain('if (!isOverlayDraftCompatible(parsed)) {');
        expect(source).toContain('clearOverlayDraft();');
    });
});
