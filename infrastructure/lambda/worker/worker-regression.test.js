global.Request = global.Request || function Request() {};
global.Response = global.Response || function Response() {};
global.Headers = global.Headers || function Headers() {};
global.fetch = global.fetch || jest.fn();
const fs = require('fs');
const path = require('path');

const { __testHooks } = require('./index');

const definitionsPath = path.resolve(__dirname, '../shared/schemas/checks-definitions-v1.json');
const runtimeContractPath = path.resolve(__dirname, '../shared/schemas/check-runtime-contract-v1.json');

const loadJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));

describe('worker regression guards', () => {
    test('parser truncation errors are treated as schema-like for fallback', () => {
        expect(__testHooks.isSchemaLikeError(new Error('Unterminated string in JSON at position 10861'))).toBe(true);
        expect(__testHooks.isSchemaLikeError(new Error('Unexpected end of JSON input'))).toBe(true);
    });

    test('extractPartialFindingsFromRaw recovers legacy checks payload from malformed chunk output', () => {
        const raw = '{"checks":{"direct_answer_first_120":{"verdict":"fail","confidence":0.81,"scope":"sentence","explanation":"No direct answer in opening.","highlights":[{"snippet":"This section delays the answer.","scope":"sentence","message":"No direct answer in opening."}]},"answer_sentence_concise":{"verdict":"partial","confidence":0.62,"explanation":"Answer sentence is too long and indirect."}}';
        const recovered = __testHooks.extractPartialFindingsFromRaw(raw, {
            block_map: [{ text: 'Fallback selector seed text for recovery path.' }]
        });
        const ids = recovered.map((finding) => finding.check_id);

        expect(recovered.length).toBe(2);
        expect(ids).toContain('direct_answer_first_120');
        expect(ids).toContain('answer_sentence_concise');
        recovered.forEach((finding) => {
            expect(['pass', 'partial', 'fail']).toContain(finding.verdict);
            expect(['sentence', 'span', 'block']).toContain(finding.scope);
            expect(typeof finding.text_quote_selector?.exact).toBe('string');
            expect(finding.text_quote_selector.exact.length).toBeGreaterThan(0);
            expect(finding._recovered_partial).toBe(true);
        });
    });

    test('coverage shortfall with semantic findings stays recoverable (success_partial path)', () => {
        const result = __testHooks.evaluateCoverageGuardrail({
            expectedCheckCount: 35,
            returnedAiChecks: 27,
            syntheticFindingCount: 8,
            failedChunkCount: 1,
            chunkCount: 5,
            minReturnedCheckRate: 0.85,
            maxSyntheticCheckRate: 0.15
        });

        expect(result.coverageTooLow).toBe(true);
        expect(result.unrecoverableCoverage).toBe(false);
        expect(result.hasSemanticCoverage).toBe(true);
    });

    test('zero semantic findings remains unrecoverable', () => {
        const result = __testHooks.evaluateCoverageGuardrail({
            expectedCheckCount: 35,
            returnedAiChecks: 0,
            syntheticFindingCount: 35,
            failedChunkCount: 5,
            chunkCount: 5,
            minReturnedCheckRate: 0.85,
            maxSyntheticCheckRate: 0.15
        });

        expect(result.coverageTooLow).toBe(true);
        expect(result.unrecoverableCoverage).toBe(true);
        expect(result.hasSemanticCoverage).toBe(false);
    });

    test('budget-hit partial context resolves to success_partial and time_budget_exceeded', () => {
        const state = __testHooks.derivePartialRunState({
            budget_hit: true,
            budget_ms: 90000,
            budget_elapsed_ms: 93412,
            failed_chunk_count: 1,
            synthetic_findings_count: 9,
            missing_ai_checks: 9
        });

        expect(state.budgetHit).toBe(true);
        expect(state.isPartialRun).toBe(true);
        expect(state.partialReason).toBe('time_budget_exceeded');
        expect(state.runStatus).toBe('success_partial');
    });

    test('budget-hit reason takes precedence over truncation and chunk parse failure reasons', () => {
        const state = __testHooks.derivePartialRunState({
            budget_hit: true,
            was_truncated: true,
            failed_chunk_count: 2,
            synthetic_findings_count: 5,
            missing_ai_checks: 7
        });

        expect(state.partialReason).toBe('time_budget_exceeded');
    });

    test('chunk budget window marks exhaustion when remaining headroom is too small', () => {
        const budgetWindow = __testHooks.computeChunkBudgetWindow({
            remainingBudgetMs: 9000,
            minChunkHeadroomMs: 12000,
            minChunkRequestTimeoutMs: 12000,
            maxChunkRequestTimeoutMs: 45000,
            chunkTimeoutSlackMs: 3000
        });

        expect(budgetWindow.exhausted).toBe(true);
        expect(budgetWindow.requestTimeoutMs).toBe(0);
    });

    test('chunk budget window computes bounded request timeout under remaining budget', () => {
        const budgetWindow = __testHooks.computeChunkBudgetWindow({
            remainingBudgetMs: 24000,
            minChunkHeadroomMs: 12000,
            minChunkRequestTimeoutMs: 12000,
            maxChunkRequestTimeoutMs: 45000,
            chunkTimeoutSlackMs: 3000
        });

        expect(budgetWindow.exhausted).toBe(false);
        expect(budgetWindow.requestTimeoutMs).toBe(21000);
        expect(budgetWindow.requestTimeoutMs).toBeLessThan(budgetWindow.remainingBudgetMs);
    });

    test('strict question anchor classifier ignores topical headings', () => {
        expect(__testHooks.isStrictQuestionAnchorText('Speed Optimization')).toBe(false);
        expect(__testHooks.isStrictQuestionAnchorText('How to improve website speed')).toBe(false);
        expect(__testHooks.isStrictQuestionAnchorText('What is website performance?')).toBe(true);
        expect(__testHooks.isStrictQuestionAnchorText('What is website performance')).toBe(true);
    });

    test('question-anchor payload includes only strict anchors from manifest', () => {
        const payload = __testHooks.buildQuestionAnchorPayload({
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'Speed Optimization' },
                { node_ref: 'b1', block_type: 'core/heading', text: 'What is website performance?' },
                { node_ref: 'b2', block_type: 'core/paragraph', text: 'How to improve speed in 2026.' },
                { node_ref: 'b3', block_type: 'core/paragraph', text: 'What is crawl budget? Crawl budget is the fetch limit for bots.' }
            ]
        });

        expect(payload.strict_mode).toBe(true);
        expect(payload.anchor_count).toBe(2);
        expect(payload.anchors.map((item) => item.text)).toContain('What is website performance?');
        expect(payload.anchors.map((item) => item.text)).toContain('What is crawl budget?');
    });

    test('question-anchor guardrail downgrades gated failures when strict anchors are absent', () => {
        const decision = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'direct_answer_first_120',
            verdict: 'fail',
            finding: {},
            questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] }
        });

        expect(decision.verdict).toBe('pass');
        expect(decision.adjusted).toBe(true);
        expect(decision.reason).toBe('no_strict_question_anchor');
    });

    test('question-anchor guardrail requires valid anchor binding when multiple anchors exist', () => {
        const payload = {
            strict_mode: true,
            anchor_count: 2,
            anchors: [
                { text: 'What is crawl budget?' },
                { text: 'Why does page speed matter?' }
            ]
        };

        const missingBinding = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'partial',
            finding: { text_quote_selector: { exact: 'Crawl budget controls how many URLs bots fetch.' } },
            questionAnchorPayload: payload
        });
        expect(missingBinding.verdict).toBe('pass');
        expect(missingBinding.adjusted).toBe(true);
        expect(missingBinding.reason).toBe('invalid_or_missing_question_anchor');

        const validBinding = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'partial',
            finding: { question_anchor_text: 'Why does page speed matter?' },
            questionAnchorPayload: payload
        });
        expect(validBinding.verdict).toBe('partial');
        expect(validBinding.adjusted).toBe(false);
        expect(validBinding.reason).toBeNull();
    });

    test('AI scope includes orphan_headings and excludes heading_fragmentation', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = Array.from(__testHooks.getAiEligibleCheckIds(definitions, runtimeContract));

        expect(aiCheckIds).toContain('orphan_headings');
        expect(aiCheckIds).not.toContain('heading_fragmentation');
    });

    test('semantic fallback check marks orphan_headings as partial recommendation', () => {
        const definitions = loadJson(definitionsPath);
        const fallback = __testHooks.buildSemanticFallbackCheck('orphan_headings', definitions);

        expect(fallback.verdict).toBe('partial');
        expect(fallback.non_inline).toBe(true);
        expect(fallback.non_inline_reason).toBe('ai_unavailable_fallback');
        expect(fallback.provenance).toBe('synthetic');
        expect(fallback.explanation).toMatch(/semantic validation is partial/i);
    });

    test('orphan_headings findings are coerced to span with heading-specific explanation and heading anchor', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'orphan_headings',
                verdict: 'fail',
                confidence: 0.92,
                scope: 'block',
                text_quote_selector: {
                    exact: 'Section One',
                    prefix: 'This article explains how to structure content for answer engines. Section One',
                    suffix: 'Section One Brief support text follows this heading and then another section starts.'
                },
                explanation: 'Multiple headings lack meaningful semantic support or topical fulfillment.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'p-0', signature: 'sig-p-0', block_type: 'core/paragraph', text: 'This article explains how to structure content for answer engines.' },
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'Section One' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'Brief support text follows this heading and then another section starts.' }
            ]
        };
        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const orphan = converted.checks.orphan_headings;
        const candidate = orphan.candidate_highlights[0];

        expect(orphan.verdict).toBe('fail');
        expect(orphan.explanation).toMatch(/Heading "Section One"/);
        expect(candidate.scope).toBe('span');
        expect(candidate.node_ref).toBe('h-1');
        expect(candidate.message).toMatch(/Heading "Section One"/);
    });
});
