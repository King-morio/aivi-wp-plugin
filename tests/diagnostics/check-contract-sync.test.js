/** @jest-environment node */
const fs = require('fs');
const path = require('path');

const definitionsPath = path.resolve(
    __dirname,
    '../../infrastructure/lambda/shared/schemas/checks-definitions-v1.json'
);
const runtimeContractPath = path.resolve(
    __dirname,
    '../../infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json'
);
const {
    ALLOWED_ISSUE_FIELDS,
    ALLOWED_HIGHLIGHT_FIELDS
} = require('../../infrastructure/lambda/orchestrator/sidebar-payload-stripper');

const loadJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));

const flattenDefinitionChecks = (definitions) => {
    const checks = {};
    const categories = definitions && definitions.categories ? definitions.categories : {};
    Object.values(categories).forEach((category) => {
        if (!category || !category.checks) return;
        Object.entries(category.checks).forEach(([checkId, checkDef]) => {
            checks[checkId] = checkDef || {};
        });
    });
    return checks;
};

describe('Runtime check contract sync', () => {
    test('runtime contract defines all checks with required policy fields', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const definitionChecks = flattenDefinitionChecks(definitions);
        const definitionCheckIds = Object.keys(definitionChecks);
        const contractChecks = runtimeContract && runtimeContract.checks ? runtimeContract.checks : {};
        const contractCheckIds = Object.keys(contractChecks);

        expect(definitionCheckIds.length).toBe(55);
        expect(contractCheckIds.length).toBe(55);

        const missing = definitionCheckIds.filter((checkId) => !Object.prototype.hasOwnProperty.call(contractChecks, checkId));
        const extra = contractCheckIds.filter((checkId) => !Object.prototype.hasOwnProperty.call(definitionChecks, checkId));
        expect(missing).toEqual([]);
        expect(extra).toEqual([]);

        contractCheckIds.forEach((checkId) => {
            const entry = contractChecks[checkId];
            expect(entry).toBeDefined();
            expect(typeof entry.analysis_engine).toBe('string');
            expect(['ai', 'deterministic']).toContain(entry.analysis_engine);
            expect(typeof entry.evidence_mode).toBe('string');
            expect(['inline_required', 'recommendation_only', 'absence_sensitive']).toContain(entry.evidence_mode);
            expect(typeof entry.rewrite_mode).toBe('string');
            expect(['ai_rewrite', 'manual_review']).toContain(entry.rewrite_mode);
            const scopes = Array.isArray(entry.allowed_scopes) ? entry.allowed_scopes : [entry.allowed_scopes];
            expect(scopes.length).toBeGreaterThan(0);
            scopes.forEach((scope) => {
                expect(['sentence', 'span', 'block']).toContain(scope);
            });

            expect(typeof entry.rewrite_target_policy).toBe('string');
            expect(['inline_span', 'block', 'heading_support_range', 'section']).toContain(entry.rewrite_target_policy);

            expect(Array.isArray(entry.rewrite_allowed_ops)).toBe(true);
            entry.rewrite_allowed_ops.forEach((op) => {
                expect(['replace_span', 'replace_block', 'insert_after_heading', 'append_support', 'convert_to_list']).toContain(op);
            });
            if (entry.rewrite_mode === 'ai_rewrite') {
                expect(entry.rewrite_allowed_ops.length).toBeGreaterThan(0);
            } else {
                expect(entry.rewrite_allowed_ops.length).toBe(0);
            }

            expect(Number.isInteger(entry.rewrite_context_window)).toBe(true);
            expect(entry.rewrite_context_window).toBeGreaterThanOrEqual(1);
            expect(entry.rewrite_context_window).toBeLessThanOrEqual(6);
        });
    });

    test('analysis engine ownership aligns with semantic/deterministic contract', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const definitionChecks = flattenDefinitionChecks(definitions);
        const contractChecks = runtimeContract.checks || {};

        Object.entries(definitionChecks).forEach(([checkId, checkDef]) => {
            const type = String(checkDef.type || '').toLowerCase();
            const engine = String(contractChecks[checkId]?.analysis_engine || '');
            if (type === 'deterministic' || type === 'hybrid') {
                expect(engine).toBe('deterministic');
                return;
            }
            if (type === 'semantic') {
                expect(engine).toBe('ai');
            }
        });
    });

    test('heading ownership split and rewrite target policies match product contract', () => {
        const runtimeContract = loadJson(runtimeContractPath);
        const contractChecks = runtimeContract.checks || {};

        expect(contractChecks.heading_topic_fulfillment?.analysis_engine).toBe('ai');
        expect(contractChecks.heading_fragmentation?.analysis_engine).toBe('deterministic');
        expect(contractChecks.heading_like_text_uses_heading_markup?.analysis_engine).toBe('deterministic');
        expect(contractChecks.heading_topic_fulfillment?.allowed_scopes).toEqual(['span']);
        expect(contractChecks.heading_like_text_uses_heading_markup?.allowed_scopes).toEqual(['block']);
        expect(contractChecks.heading_like_text_uses_heading_markup?.rewrite_target_policy).toBe('block');
        expect(contractChecks.heading_topic_fulfillment?.rewrite_target_policy).toBe('heading_support_range');
        expect(contractChecks.lists_tables_presence?.allowed_scopes).toEqual(['block']);
        expect(contractChecks.lists_tables_presence?.rewrite_target_policy).toBe('block');
        expect(contractChecks.lists_tables_presence?.rewrite_allowed_ops || []).toContain('convert_to_list');
        expect(['inline_span', 'block']).toContain(contractChecks.heading_fragmentation?.rewrite_target_policy);
        expect(contractChecks.canonical_clarity?.analysis_engine).toBe('deterministic');
        expect(contractChecks.ai_crawler_accessibility?.analysis_engine).toBe('deterministic');
        expect(contractChecks.original_evidence_signal?.analysis_engine).toBe('ai');
    });

    test('sidebar payload contract stays aligned with stripper allowlists', () => {
        const runtimeContract = loadJson(runtimeContractPath);
        const sidebarPayload = runtimeContract.sidebar_payload || {};

        expect(sidebarPayload.analysis_summary_version).toBe('1.2.0');
        expect(sidebarPayload.preferred_visible_summary_field).toBe('review_summary');
        expect(sidebarPayload.raw_audit_message_field).toBe('message');
        expect(sidebarPayload.allowed_issue_fields).toEqual(ALLOWED_ISSUE_FIELDS);
        expect(sidebarPayload.allowed_highlight_fields).toEqual(ALLOWED_HIGHLIGHT_FIELDS);
        expect(sidebarPayload.allowed_issue_fields || []).toContain('review_summary');
        expect(sidebarPayload.allowed_highlight_fields || []).toContain('review_summary');
    });
});
