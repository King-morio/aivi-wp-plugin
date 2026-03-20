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
        expect(source).toContain('if (!schemaInsertAllowed && schemaKind === \'jsonld_repair\') {');
    });

    test('uses semantic-markup specific labels and copy-only note', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("if (kind === 'semantic_markup_plan') return 'Semantic Markup Plan';");
        expect(source).toContain("const isSemanticMarkupPlan = schemaKind === 'semantic_markup_plan';");
        expect(source).toContain("generateBtn.textContent = isSemanticMarkupPlan ? 'Generate markup' : 'Generate schema';");
        expect(source).toContain("copyBtn.textContent = isSemanticMarkupPlan ? 'Copy markup' : 'Copy schema';");
        expect(source).toContain("note.textContent = 'Copy-only semantic markup plan. Apply these changes in your theme/editor markup.';");
    });

    test('wires Insert schema button and guarded insert handler in recommendation panel', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("insertBtn.textContent = 'Insert schema';");
        expect(source).toContain('if (schemaInsertAllowed) {');
        expect(source).toContain('const result = insertSchemaAssistIntoEditor(item, schemaAssist, draft);');
        expect(source).toContain("if (result.code === 'duplicate') {");
        expect(source).toContain("schemaStatus.textContent = 'Schema inserted as JSON-LD block in the editor.';");
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
});
