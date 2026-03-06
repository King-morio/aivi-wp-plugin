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
const promptTemplatePath = path.resolve(
    __dirname,
    '../../infrastructure/lambda/worker/prompts/analysis-system-v1.txt'
);

const loadJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));

const flattenDefinitionChecks = (definitions) => {
    const checks = {};
    Object.values(definitions.categories || {}).forEach((category) => {
        if (!category || !category.checks) return;
        Object.entries(category.checks).forEach(([checkId, checkDef]) => {
            checks[checkId] = checkDef || {};
        });
    });
    return checks;
};

describe('Prompt/runtime contract sync', () => {
    test('prompt template uses runtime check count token and no intro special handling', () => {
        const prompt = fs.readFileSync(promptTemplatePath, 'utf8');
        expect(prompt).toContain('{{CHECKS_DEFINITIONS}}');
        expect(prompt).toContain('{{AI_CHECK_COUNT}}');
        expect(prompt).toContain('{{QUESTION_ANCHORS_JSON}}');
        expect(prompt).not.toMatch(/38\s+checks?/i);
        expect(prompt).not.toMatch(/Intro Focus & Factuality:\s*Use manifest\.preflight_intro/i);
        expect(prompt).toMatch(/Specimen Mode Only/i);
        expect(prompt).toMatch(/at least one finding for every check_id/i);
        expect(prompt).toMatch(/MAY include multiple findings for a check_id/i);
        expect(prompt).toMatch(/Orphan Headings Specificity/i);
    });

    test('runtime AI check list is semantic-only (with deterministic intro override) and count is prompt-compatible', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const definitionChecks = flattenDefinitionChecks(definitions);
        const contractChecks = runtimeContract.checks || {};

        const aiCheckIds = Object.entries(contractChecks)
            .filter(([, entry]) => String(entry.analysis_engine || '') === 'ai')
            .map(([checkId]) => checkId);

        expect(aiCheckIds.length).toBeGreaterThan(0);

        aiCheckIds.forEach((checkId) => {
            expect(definitionChecks[checkId]).toBeDefined();
            expect(String(definitionChecks[checkId].type || '')).toBe('semantic');
        });

        expect(aiCheckIds).toContain('orphan_headings');
        expect(aiCheckIds).not.toContain('heading_fragmentation');

        const prompt = fs.readFileSync(promptTemplatePath, 'utf8');
        const defsForPrompt = {};
        aiCheckIds.forEach((checkId) => {
            defsForPrompt[checkId] = definitionChecks[checkId];
        });
        const builtPrompt = prompt
            .split('{{CHECKS_DEFINITIONS}}').join(JSON.stringify(defsForPrompt, null, 2))
            .split('{{AI_CHECK_COUNT}}').join(String(aiCheckIds.length))
            .split('{{QUESTION_ANCHORS_JSON}}').join(JSON.stringify({ strict_mode: true, anchor_count: 0, anchors: [] }, null, 2));

        expect(builtPrompt).not.toContain('{{CHECKS_DEFINITIONS}}');
        expect(builtPrompt).not.toContain('{{AI_CHECK_COUNT}}');
        expect(builtPrompt).not.toContain('{{QUESTION_ANCHORS_JSON}}');
    });
});
