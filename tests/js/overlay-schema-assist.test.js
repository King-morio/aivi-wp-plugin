/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay schema assist regression guard', () => {
    test('supports safe insert for allowed schema kinds only', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function canInsertSchemaKind(schemaKind) {');
        expect(source).toContain("|| kind === 'schema_alignment_jsonld';");
        expect(source).toContain('function isSchemaAssistInsertAllowed(schemaAssist) {');
        expect(source).toContain('if (schemaAssist.can_insert !== true) return false;');
        expect(source).toContain('function getSchemaAssistBaseNote(schemaAssist) {');
        expect(source).toContain("if (schemaKind === 'jsonld_repair') {");
    });

    test('uses semantic-markup specific labels and copy-only note', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("if (kind === 'semantic_markup_plan') return 'Semantic Markup Plan';");
        expect(source).toContain("const isSemanticMarkupPlan = schemaKind === 'semantic_markup_plan';");
        expect(source).toContain("generateBtn.textContent = isSemanticMarkupPlan ? 'Generate markup' : 'Generate schema';");
        expect(source).toContain("copyBtn.textContent = isSemanticMarkupPlan ? 'Copy markup' : 'Copy schema';");
        expect(source).toContain("return 'Copy-only semantic markup plan. Apply these changes in your theme/editor markup.';");
    });

    test('wires Insert schema button and guarded insert handler in recommendation panel', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("insertBtn.textContent = 'Insert schema';");
        expect(source).toContain('if (schemaInsertAllowed) {');
        expect(source).toContain('const readiness = buildSchemaInsertReadiness(item, schemaAssist, draft);');
        expect(source).toContain('syncSchemaInsertButton(insertBtn, schemaInsertAllowed, readiness);');
        expect(source).toContain('const result = insertSchemaAssistIntoEditor(item, schemaAssist, draft);');
        expect(source).toContain('const presentation = buildSchemaInsertResultPresentation(result);');
        expect(source).toContain("insertBtn.textContent = result.code === 'replace_existing_ai_block' ? 'Replaced' : 'Inserted';");
        expect(source).toContain('setSchemaAssistStatus(schemaStatus, presentation.tone, presentation.message);');
    });

    test('reuses schema assist inside review-rail details without making it a separate overlay panel', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildReviewRailSchemaAssistNode(item) {');
        expect(source).toContain("const schemaAssist = resolveSchemaAssist(item);");
        expect(source).toContain("generateBtn.textContent = isSemanticMarkupPlan ? 'Generate markup' : 'Generate schema';");
        expect(source).toContain("copyBtn.textContent = isSemanticMarkupPlan ? 'Copy markup' : 'Copy schema';");
        expect(source).toContain("insertBtn.textContent = 'Insert schema';");
        expect(source).toContain("preview.hidden = true;");
        expect(source).toContain("policy.className = 'aivi-overlay-review-schema-policy';");
        expect(source).toContain("badge.dataset.mode = getSchemaAssistInsertCapability(schemaAssist);");
        expect(source).toContain("const schemaAssistNode = buildReviewRailSchemaAssistNode(issue);");
    });

    test('tracks duplicate insert fingerprints and emits schema insert telemetry', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('insertedSchemaFingerprints: new Set()');
        expect(source).toContain('function buildSchemaFingerprint(item, schemaAssist, draft) {');
        expect(source).toContain('function hasSchemaFingerprint(fingerprint) {');
        expect(source).toContain("emitHighlightTelemetry('overlay_schema_insert_blocked_duplicate'");
        expect(source).toContain("emitHighlightTelemetry('overlay_schema_inserted'");
    });

    test('discovers existing editor schema blocks and marks AiVI-managed inserts', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("const AIVI_SCHEMA_BLOCK_MARKER = 'AIVI_SCHEMA_ASSIST';");
        expect(source).toContain('function buildManagedSchemaMarker(schemaAssist, fingerprint) {');
        expect(source).toContain('function parseManagedSchemaMarker(content) {');
        expect(source).toContain('function extractJsonLdScriptContents(content) {');
        expect(source).toContain('function buildJsonLdComparisonSignature(jsonldObject) {');
        expect(source).toContain('function buildEditorSchemaBlockEntry(block) {');
        expect(source).toContain('function collectExistingEditorSchemaBlocks(blocksInput) {');
        expect(source).toContain("management: marker ? 'aivi_managed' : 'manual'");
        expect(source).toContain("source: 'editor_block'");
        expect(source).toContain('function summarizeExistingEditorSchemaBlocks(entries) {');
        expect(source).toContain('const policySummary = insertPolicy && insertPolicy.summary ? insertPolicy.summary : {};');
        expect(source).toContain('content: buildSchemaScriptTag(canonicalDraft, schemaAssist, fingerprint)');
    });

    test('classifies schema insert outcomes before append and supports safe replace of managed blocks', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildRenderedManifestSchemaEntries(manifest) {');
        expect(source).toContain('function resolveSchemaInsertPolicy(schemaAssist, canonicalDraft, draftSignature, draftHash) {');
        expect(source).toContain('function buildSchemaInsertReadiness(item, schemaAssist, draftInput) {');
        expect(source).toContain('function buildSchemaInsertResultPresentation(result) {');
        expect(source).toContain("action: 'no_op_existing_match'");
        expect(source).toContain("action: 'replace_existing_ai_block'");
        expect(source).toContain("action: 'copy_only_external_conflict'");
        expect(source).toContain("action: 'append_new_block'");
        expect(source).toContain("emitHighlightTelemetry('overlay_schema_insert_blocked_existing_match'");
        expect(source).toContain("emitHighlightTelemetry('overlay_schema_insert_blocked_conflict'");
        expect(source).toContain("emitHighlightTelemetry('overlay_schema_replaced'");
        expect(source).toContain("dispatcher.updateBlockAttributes(targetClientId, {");
        expect(source).toContain("Ready to update. AiVI will replace one matching AiVI-managed schema block in the editor.");
        expect(source).toContain("Ready to insert. AiVI will add a new JSON-LD block at the end of the editor.");
        expect(source).toContain("Already present. Equivalent schema already exists in the editor.");
        expect(source).toContain("Conflict detected. Another schema source already covers this area, so this draft is copy-only.");
        expect(source).toContain("Replaced existing AiVI-managed schema block in the editor. Save the post to publish it live.");
        expect(source).toContain("Inserted new JSON-LD block at the end of the editor. Save the post to publish it live.");
    });
});
