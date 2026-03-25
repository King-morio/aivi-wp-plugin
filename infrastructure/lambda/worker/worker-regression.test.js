global.Request = global.Request || function Request() {};
global.Response = global.Response || function Response() {};
global.Headers = global.Headers || function Headers() {};
global.fetch = global.fetch || jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({ send: jest.fn() }))
    },
    PutCommand: jest.fn((input) => ({ input })),
    GetCommand: jest.fn((input) => ({ input }))
}), { virtual: true });
const fs = require('fs');
const path = require('path');

const { __testHooks } = require('./index');
const { ensureManifestPreflightStructure } = require('./preflight-handler');
const { SUPPORTED_SCHEMA_ASSIST_CHECKS, buildSchemaAssistDraft } = require('./schema-draft-builder');

const definitionsPath = path.resolve(__dirname, '../shared/schemas/checks-definitions-v1.json');
const runtimeContractPath = path.resolve(__dirname, '../shared/schemas/check-runtime-contract-v1.json');
const promptTemplatePath = path.resolve(__dirname, 'prompts/analysis-system-v1.txt');

const loadJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));

describe('worker regression guards', () => {
    test('Mistral chunk requests use schema-enforced output and smaller default chunks', () => {
        const responseFormat = __testHooks.buildMistralChunkResponseFormat();

        expect(responseFormat.type).toBe('json_schema');
        expect(responseFormat.json_schema?.name).toBeTruthy();
        expect(responseFormat.json_schema?.strict).toBe(true);
        expect(responseFormat.json_schema?.schema?.properties?.findings?.items?.properties?.explanation?.maxLength).toBe(180);
        expect(__testHooks.DEFAULT_AI_CHUNK_SIZE).toBe(5);
        expect(__testHooks.DEFAULT_AI_COMPACT_CHUNK_SIZE).toBe(5);
    });

    test('malformed chunk capture entries retain diagnostic metadata and preview', () => {
        const entry = __testHooks.buildMalformedChunkCaptureEntry({
            chunkIndex: 1,
            chunkTag: '2/7',
            attemptLabel: 'compact-retry-1',
            model: 'mistral-large-latest',
            finishReason: 'stop',
            parseError: new Error('Unterminated string in JSON at position 7649'),
            rawText: '{"findings":[{"check_id":"immediate_answer_placement","verdict":"partial"'
        });

        expect(entry.chunk_index).toBe(2);
        expect(entry.chunk_tag).toBe('2/7');
        expect(entry.attempt_label).toBe('compact-retry-1');
        expect(entry.model).toBe('mistral-large-latest');
        expect(entry.finish_reason).toBe('stop');
        expect(entry.parse_error_class).toBe('unterminated_string');
        expect(entry.raw_response_length).toBeGreaterThan(10);
        expect(entry.raw_preview).toContain('"check_id":"immediate_answer_placement"');
    });

    test('malformed chunk capture respects the configured per-run cap', () => {
        const captures = [];
        const first = __testHooks.captureMalformedChunkEntry(captures, {
            chunkIndex: 0,
            chunkTag: '1/3',
            attemptLabel: 'normal',
            model: 'mistral-large-latest',
            finishReason: 'stop',
            parseError: new Error('Expected \',\' or \']\' after array element in JSON at position 7631'),
            rawText: '{"findings":[1,2,3'
        }, 1);
        const second = __testHooks.captureMalformedChunkEntry(captures, {
            chunkIndex: 1,
            chunkTag: '2/3',
            attemptLabel: 'compact',
            model: 'mistral-small-latest',
            finishReason: 'length',
            parseError: new Error('Unterminated string in JSON at position 7649'),
            rawText: '{"findings":[{"check_id":"x"'
        }, 1);

        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(captures).toHaveLength(1);
        expect(captures[0].chunk_tag).toBe('1/3');
    });

    test('validateFindingsContract accepts the reduced minimal model output contract', () => {
        const findings = __testHooks.validateFindingsContract({
            findings: [
                {
                    check_id: 'immediate_answer_placement',
                    verdict: 'partial',
                    confidence: 0.42,
                    scope: 'span',
                    text_quote_selector: {
                        exact: 'Website performance affects rankings and conversions.',
                        prefix: 'The article opens with broad context saying ',
                        suffix: ' before it moves into generic discussion.'
                    },
                    explanation: 'The opening is informative but not explicitly answer-led.'
                }
            ]
        });

        expect(Array.isArray(findings)).toBe(true);
        expect(findings).toHaveLength(1);
        expect(findings[0].check_id).toBe('immediate_answer_placement');
        expect(findings[0]).not.toHaveProperty('why_it_matters');
        expect(findings[0]).not.toHaveProperty('how_to_fix_steps');
        expect(findings[0]).not.toHaveProperty('example_pattern');
        expect(findings[0]).not.toHaveProperty('text_position_selector');
    });

    test('semantic html usage is wired into deterministic schema assist as a copy-only markup plan', () => {
        expect(SUPPORTED_SCHEMA_ASSIST_CHECKS.has('semantic_html_usage')).toBe(true);

        const assist = buildSchemaAssistDraft({
            checkId: 'semantic_html_usage',
            checkData: { verdict: 'fail' },
            manifest: {
                title: 'What Is Painting?',
                block_map: [
                    { node_ref: 'block-0', block_type: 'core/heading', text: 'What Is Painting?' },
                    { node_ref: 'block-1', block_type: 'core/paragraph', text: 'Painting is the application of pigment to a surface.' }
                ]
            },
            runMetadata: { content_type: 'article' }
        });

        expect(assist).toBeTruthy();
        expect(assist.schema_kind).toBe('semantic_markup_plan');
        expect(assist.can_copy).toBe(true);
        expect(assist.can_insert).toBe(false);
        expect(Array.isArray(assist.draft_jsonld?.recommended_structure)).toBe(true);
    });

    test('worker schema assist supports the new ItemList and Article deterministic checks', () => {
        expect(SUPPORTED_SCHEMA_ASSIST_CHECKS.has('itemlist_jsonld_presence_and_completeness')).toBe(true);
        expect(SUPPORTED_SCHEMA_ASSIST_CHECKS.has('article_jsonld_presence_and_completeness')).toBe(true);

        const itemListAssist = buildSchemaAssistDraft({
            checkId: 'itemlist_jsonld_presence_and_completeness',
            checkData: {
                verdict: 'fail',
                details: {
                    detected_candidates: [
                        {
                            heading: 'Top AI SEO tools',
                            ordered: true,
                            items: [
                                { text: 'Ahrefs', position: 1 },
                                { text: 'Semrush', position: 2 },
                                { text: 'Similarweb', position: 3 }
                            ]
                        }
                    ]
                }
            },
            manifest: {},
            runMetadata: { canonical_url: 'https://example.com/tools' }
        });

        const articleAssist = buildSchemaAssistDraft({
            checkId: 'article_jsonld_presence_and_completeness',
            checkData: {
                verdict: 'fail',
                details: {
                    preferred_article_type: 'BlogPosting'
                }
            },
            manifest: {
                title: 'What Is GEO?',
                excerpt: 'Guide to generative engine optimization.'
            },
            runMetadata: {
                content_type: 'blog',
                author_name: 'AiVI Team',
                date_published: '2026-03-23',
                canonical_url: 'https://example.com/geo-guide'
            }
        });

        expect(itemListAssist).toBeTruthy();
        expect(itemListAssist.schema_kind).toBe('itemlist_jsonld');
        expect(itemListAssist.can_insert).toBe(true);
        expect(itemListAssist.draft_jsonld?.['@type']).toBe('ItemList');

        expect(articleAssist).toBeTruthy();
        expect(articleAssist.schema_kind).toBe('article_jsonld');
        expect(articleAssist.can_insert).toBe(true);
        expect(articleAssist.draft_jsonld?.['@type']).toBe('BlogPosting');
    });

    test('parser truncation errors are treated as schema-like for fallback', () => {
        expect(__testHooks.isSchemaLikeError(new Error('Unterminated string in JSON at position 10861'))).toBe(true);
        expect(__testHooks.isSchemaLikeError(new Error('Unexpected end of JSON input'))).toBe(true);
    });

    test('extractPartialFindingsFromRaw recovers legacy checks payload from malformed chunk output', () => {
        const raw = '{"checks":{"immediate_answer_placement":{"verdict":"fail","confidence":0.81,"scope":"sentence","explanation":"No direct answer in opening.","highlights":[{"snippet":"This section delays the answer.","scope":"sentence","message":"No direct answer in opening."}]},"answer_sentence_concise":{"verdict":"partial","confidence":0.62,"explanation":"Answer sentence is too long and indirect."}}';
        const recovered = __testHooks.extractPartialFindingsFromRaw(raw, {
            block_map: [{ text: 'Fallback selector seed text for recovery path.' }]
        });
        const ids = recovered.map((finding) => finding.check_id);

        expect(recovered.length).toBe(2);
        expect(ids).toContain('immediate_answer_placement');
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
        expect(__testHooks.isStrictQuestionAnchorText('What Changed This Year')).toBe(true);
        expect(__testHooks.isStrictQuestionAnchorText('How teams improve delivery speed')).toBe(true);
    });

    test('worker prompt keeps answer-family interpretation rules compact and separate from FAQ candidacy guidance', () => {
        const prompt = fs.readFileSync(promptTemplatePath, 'utf8');
        const gateMatch = prompt.match(/\*\*Question-Anchor Gate\*\*:[\s\S]*?(?=\n\s*\d+\.\s+\*\*|\n## |\Z)/i);
        const gateSection = gateMatch ? gateMatch[0] : '';

        expect(prompt).toMatch(/Answer-Family Interpretation/i);
        expect(prompt).toMatch(/Answer-Family Explanation Quality/i);
        expect(prompt).toMatch(/count to the start of the first direct answer/i);
        expect(prompt).toMatch(/reset the word count at the end of that anchor/i);
        expect(prompt).toMatch(/do not use missing evidence, sourcing, or claim support as the rationale for this check/i);
        expect(prompt).toMatch(/one or two clear sentences can pass/i);
        expect(prompt).toMatch(/do not tell the user to force it into one sentence/i);
        expect(prompt).toMatch(/If the verdict is `pass`, set `explanation` to an empty string/i);
        expect(prompt).toMatch(/Dense inline Q&A should not be classified as "not a FAQ candidate"/i);
        expect(prompt).toMatch(/Do not return `pass` merely because the answers appear in prose instead of separated pairs/i);
        expect(gateSection).not.toMatch(/faq_structure_opportunity/);
        expect(gateSection).not.toMatch(/faq_jsonld_generation_suggestion/);
    });

    test('validateFindingsContract allows blank explanation for pass but still requires it for partial', () => {
        const passPayload = {
            findings: [
                {
                    check_id: 'question_answer_alignment',
                    verdict: 'pass',
                    confidence: 0.93,
                    scope: 'sentence',
                    text_quote_selector: {
                        exact: 'How fast can a mini excavator dig? A standard mini excavator can dig at speeds ranging from 6 to 12 cubic meters per hour.',
                        prefix: 'Contractors often ask this before comparing machine sizes. ',
                        suffix: ' The exact speed still depends on bucket size and soil conditions.'
                    },
                    explanation: ''
                }
            ]
        };
        expect(() => __testHooks.validateFindingsContract(passPayload)).not.toThrow();
        expect(passPayload.findings[0].explanation).toBe('');

        expect(() => __testHooks.validateFindingsContract({
            findings: [
                {
                    check_id: 'question_answer_alignment',
                    verdict: 'partial',
                    confidence: 0.73,
                    scope: 'sentence',
                    text_quote_selector: {
                        exact: 'Mini excavators are useful on compact job sites.',
                        prefix: 'Equipment buyers compare several machines before making a choice. ',
                        suffix: ' Digging speed still depends on the exact model and soil profile.'
                    },
                    explanation: ''
                }
            ]
        })).toThrow(/failed_schema/i);
    });

    test('question-anchor payload includes only strict anchors from manifest', () => {
        const payload = __testHooks.buildQuestionAnchorPayload({
            block_map: [
                { node_ref: 'b0', block_type: 'core/heading', text: 'Speed Optimization' },
                { node_ref: 'b1', block_type: 'core/heading', text: 'What is website performance?' },
                { node_ref: 'b4', block_type: 'core/heading', text: 'What Changed This Year' },
                { node_ref: 'b2', block_type: 'core/paragraph', text: 'How to improve speed in 2026.' },
                { node_ref: 'b3', block_type: 'core/paragraph', text: 'What is crawl budget? Crawl budget is the fetch limit for bots.' }
            ]
        });

        expect(payload.strict_mode).toBe(true);
        expect(payload.anchor_count).toBe(3);
        expect(payload.anchors.map((item) => item.text)).toContain('What is website performance?');
        expect(payload.anchors.map((item) => item.text)).toContain('What is crawl budget?');
        expect(payload.anchors.map((item) => item.text)).toContain('What Changed This Year');
    });

    test('question-anchor guardrail accepts relaxed heading anchors for adjacent answer paragraphs in multi-anchor sections', () => {
        const manifest = {
            block_map: [
                { node_ref: 'h-1', block_type: 'core/heading', text: 'Why teams miss crawl budget' },
                {
                    node_ref: 'p-1',
                    block_type: 'core/paragraph',
                    text: 'Teams miss crawl budget when faceted navigation creates too many low-value URLs.'
                },
                { node_ref: 'h-2', block_type: 'core/heading', text: 'What causes crawl delays?' },
                {
                    node_ref: 'p-2',
                    block_type: 'core/paragraph',
                    text: 'Crawl delays usually come from slow servers, crawl traps, or bloated filter combinations.'
                },
                { node_ref: 'h-3', block_type: 'core/heading', text: 'Overview of crawl budget changes' }
            ]
        };

        const payload = __testHooks.buildQuestionAnchorPayload(manifest);
        expect(payload.anchor_count).toBe(2);
        expect(payload.anchors.map((item) => item.text)).toEqual(expect.arrayContaining([
            'Why teams miss crawl budget',
            'What causes crawl delays?'
        ]));
        expect(payload.anchors.map((item) => item.text)).not.toContain('Overview of crawl budget changes');

        const decision = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'partial',
            finding: {
                node_ref: 'p-1',
                text_quote_selector: {
                    exact: 'Teams miss crawl budget when faceted navigation creates too many low-value URLs.'
                }
            },
            questionAnchorPayload: payload
        });

        expect(decision.verdict).toBe('partial');
        expect(decision.adjusted).toBe(false);
        expect(decision.reason).toBeNull();
    });

    test('question-anchor guardrail downgrades gated failures when strict anchors are absent', () => {
        const decision = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'immediate_answer_placement',
            verdict: 'fail',
            finding: {},
            questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] }
        });

        expect(decision.verdict).toBe('partial');
        expect(decision.adjusted).toBe(true);
        expect(decision.reason).toBe('no_strict_question_anchor');
    });

    test('question-anchor guardrail no longer rewrites faq structure opportunity when strict anchors are absent', () => {
        const decision = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'faq_structure_opportunity',
            verdict: 'pass',
            finding: {},
            questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] }
        });

        expect(decision.verdict).toBe('pass');
        expect(decision.adjusted).toBe(false);
        expect(decision.reason).toBeNull();
    });

    test('question-anchor guardrail preserves finding when evidence maps to a strict-anchor block', () => {
        const payload = {
            strict_mode: true,
            anchor_count: 2,
            anchors: [
                { node_ref: 'b3', text: 'What is crawl budget?' },
                { node_ref: 'b4', text: 'Why does page speed matter?' }
            ],
            anchor_node_text_lookup: {
                b3: 'What is crawl budget? Crawl budget controls how many URLs bots fetch per cycle.',
                b4: 'Why does page speed matter? Slow pages hurt discovery and engagement.'
            }
        };

        const inAnchorBlock = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'partial',
            finding: { text_quote_selector: { exact: 'Crawl budget controls how many URLs bots fetch.' } },
            questionAnchorPayload: payload
        });
        expect(inAnchorBlock.verdict).toBe('partial');
        expect(inAnchorBlock.adjusted).toBe(false);
        expect(inAnchorBlock.reason).toBeNull();

        const validBinding = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'partial',
            finding: { question_anchor_text: 'Why does page speed matter?' },
            questionAnchorPayload: payload
        });
        expect(validBinding.verdict).toBe('partial');
        expect(validBinding.adjusted).toBe(false);
        expect(validBinding.reason).toBeNull();

        const ambiguousBinding = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'partial',
            finding: { text_quote_selector: { exact: 'Metadata should be present for all pages.' } },
            questionAnchorPayload: payload
        });
        expect(ambiguousBinding.verdict).toBe('partial');
        expect(ambiguousBinding.adjusted).toBe(true);
        expect(ambiguousBinding.reason).toBe('invalid_or_missing_question_anchor');
    });

    test('question-anchor guardrail preserves answer-family findings when the local question window contains the answer', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-0',
                    block_type: 'core/paragraph',
                    text: 'Mini excavators are designed for trenching, landscaping and other small construction tasks. In this quick article we answer the question many contractors and homeowners frequently ask: how fast can a mini excavator dig? Keep reading!'
                },
                {
                    node_ref: 'block-1',
                    block_type: 'core/h2',
                    text: 'How Fast can you Dig with a Mini Excavator?'
                },
                {
                    node_ref: 'block-2',
                    block_type: 'core/paragraph',
                    text: 'Mini excavators are typically efficient for precision work where speed and control matter more than raw volume. When considering making a purchase you may wonder; how fast can you dig with a mini excavator?'
                },
                {
                    node_ref: 'block-3',
                    block_type: 'core/paragraph',
                    text: 'Depending on bucket size, soil conditions, and operator skill, a standard mini excavator can dig at speeds ranging from 6 to 12 cubic meters per hour.'
                },
                {
                    node_ref: 'block-4',
                    block_type: 'core/h2',
                    text: 'How much can a Mini digger dig in a day?'
                },
                {
                    node_ref: 'block-5',
                    block_type: 'core/paragraph',
                    text: 'To begin with, average cost of acquiring a new mini digger typically ranges between $15,000 and $110,000. So, it makes sense if the question on your mind before investing in a mini excavator is; how much can a mini digger dig in a day?'
                }
            ]
        };

        const payload = __testHooks.buildQuestionAnchorPayload(manifest);
        const decision = __testHooks.evaluateQuestionAnchorGuardrail({
            checkId: 'question_answer_alignment',
            verdict: 'pass',
            finding: {
                node_ref: 'block-3',
                text_quote_selector: {
                    exact: 'Depending on bucket size, soil conditions, and operator skill, a standard mini excavator can dig at speeds ranging from 6 to 12 cubic meters per hour.'
                }
            },
            questionAnchorPayload: payload
        });

        expect(payload.anchor_count).toBeGreaterThan(1);
        expect(payload.anchor_node_text_lookup['block-1']).toContain('depending on bucket size');
        expect(payload.anchor_node_text_lookup['block-2']).toContain('depending on bucket size');
        expect(decision.verdict).toBe('pass');
        expect(decision.adjusted).toBe(false);
        expect(decision.reason).toBeNull();
    });

    test('guardrail-adjusted pass findings do not preserve pass explanations', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'question_answer_alignment',
                verdict: 'pass',
                confidence: 0.93,
                scope: 'sentence',
                text_quote_selector: {
                    exact: 'A standard mini excavator can dig at speeds ranging from 6 to 12 cubic meters per hour.',
                    prefix: 'Buyers comparing compact excavation options often ask how fast the machine can dig. ',
                    suffix: ' Output still varies by operator skill and soil conditions.'
                },
                explanation: 'The answer directly resolves the question about digging speed.'
            }
        ];
        const manifest = {
            block_map: [
                {
                    node_ref: 'b-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'A standard mini excavator can dig at speeds ranging from 6 to 12 cubic meters per hour.'
                }
            ]
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const check = converted.checks.question_answer_alignment;

        expect(check.verdict).toBe('partial');
        expect(check.guardrail_adjusted).toBe(true);
        expect(check.guardrail_reason).toBe('no_strict_question_anchor');
        expect(check.guardrail_source_verdict).toBe('pass');
        expect(check.guardrail_source_explanation).toBeNull();
        expect(check.explanation).toMatch(/question|answer/i);
    });

    test('question-anchor guardrail user copy stays editorial while internal reason stays machine-readable', () => {
        const checkIds = [
            'immediate_answer_placement',
            'answer_sentence_concise',
            'question_answer_alignment',
            'clear_answer_formatting'
        ];
        const explanations = checkIds.map((checkId) => __testHooks.buildQuestionAnchorGuardrailExplanation(
            checkId,
            'no_strict_question_anchor'
        ));
        explanations.forEach((explanation) => {
            expect(explanation).toMatch(/question|answer|extract/i);
            expect(explanation).not.toMatch(/strict question anchor/i);
            expect(explanation).not.toMatch(/cannot be evaluated/i);
            expect(explanation).not.toMatch(/remains unproven/i);
        });
        expect(new Set(explanations).size).toBe(4);
    });

    test('live-pattern multi-question block keeps distinct answer-check rationales without fallback collapse', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-6',
                    signature: 'sig-6',
                    block_type: 'core/paragraph',
                    text: 'What is painting? Painting is the application of color to a surface. Why does painting matter? Painting improves expression and visual communication. Can painting help learning? Painting can improve observation and memory retention.'
                }
            ]
        };
        const questionAnchorPayload = __testHooks.buildQuestionAnchorPayload(manifest);
        expect(questionAnchorPayload.anchor_count).toBe(3);
        const findings = [
            {
                check_id: 'immediate_answer_placement',
                verdict: 'partial',
                confidence: 0.69,
                scope: 'span',
                node_ref: 'block-6',
                text_quote_selector: {
                    exact: 'Painting is the application of color to a surface.',
                    prefix: 'What is painting? ',
                    suffix: ' Why does painting matter? Painting improves expression and visual communication.'
                },
                explanation: 'The response is direct but could answer the question more crisply in the opening line.'
            },
            {
                check_id: 'answer_sentence_concise',
                verdict: 'fail',
                confidence: 0.77,
                scope: 'sentence',
                node_ref: 'block-6',
                text_quote_selector: {
                    exact: 'Painting improves expression and visual communication.',
                    prefix: 'Why does painting matter? ',
                    suffix: ' Can painting help learning? Painting can improve observation and memory retention.'
                },
                explanation: 'The answer sentence is broad and not concise enough for quick extraction.'
            },
            {
                check_id: 'question_answer_alignment',
                verdict: 'partial',
                confidence: 0.73,
                scope: 'sentence',
                node_ref: 'block-6',
                text_quote_selector: {
                    exact: 'Painting can improve observation and memory retention.',
                    prefix: 'Can painting help learning? ',
                    suffix: ''
                },
                explanation: 'The answer aligns with the question but could be more explicit about learning outcomes.'
            },
            {
                check_id: 'clear_answer_formatting',
                verdict: 'fail',
                confidence: 0.71,
                scope: 'block',
                node_ref: 'block-6',
                text_quote_selector: {
                    exact: 'What is painting? Painting is the application of color to a surface. Why does painting matter? Painting improves expression and visual communication. Can painting help learning? Painting can improve observation and memory retention.',
                    prefix: '',
                    suffix: ''
                },
                explanation: 'The section answers multiple questions but keeps all answers densely inline instead of separated formatting.'
            }
        ];
        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload }
        );

        const checkIds = [
            'immediate_answer_placement',
            'answer_sentence_concise',
            'question_answer_alignment',
            'clear_answer_formatting'
        ];
        checkIds.forEach((checkId) => {
            const check = converted.checks[checkId];
            expect(check.guardrail_adjusted).not.toBe(true);
            expect([null, undefined]).toContain(check.guardrail_reason);
        });
        expect(converted.checks.immediate_answer_placement.explanation).toContain('opening line');
        expect(converted.checks.answer_sentence_concise.explanation).toContain('not concise enough');
        expect(converted.checks.question_answer_alignment.explanation).toContain('learning outcomes');
        expect(converted.checks.clear_answer_formatting.explanation).toContain('densely inline');
        expect(converted.telemetry.aggregate.question_anchor_count).toBe(3);
        expect(converted.telemetry.aggregate.question_anchor_guardrail_adjustments_total).toBe(0);
    });

    test('March 16 answer-extractability specimen keeps raw analyzer verdicts when question-anchor guardrail does not fire', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-0',
                    signature: 'sig-0',
                    block_type: 'core/paragraph',
                    text: 'In 2026, it feels like every serious team has adopted the same AI workflow, and it is often described as the obvious next step: add an assistant to writing, planning, and customer support, then measure the gains. People repeat the benefits confidently, but the details about when the evidence was produced and which conditions were tested are not always clear.'
                },
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    block_type: 'core/heading',
                    text: 'What Changed This Year'
                },
                {
                    node_ref: 'block-2',
                    signature: 'sig-2',
                    block_type: 'core/paragraph',
                    text: 'This year, the strongest teams supposedly moved from experimentation to full adoption, and many guides say the switch already happened across most industries. In practice, those statements depend heavily on sector, region, and regulatory context, but they are often presented as if they apply everywhere.'
                }
            ]
        };
        const questionAnchorPayload = __testHooks.buildQuestionAnchorPayload(manifest);
        const findings = [
            {
                check_id: 'immediate_answer_placement',
                verdict: 'partial',
                confidence: 0.45,
                scope: 'span',
                node_ref: 'block-2',
                text_quote_selector: {
                    exact: 'This year, the strongest teams supposedly moved from experimentation to full adoption',
                    prefix: '',
                    suffix: ' and many guides say the switch already happened across most industries.'
                },
                explanation: 'Answer appears at 121-150 words after the question anchor.'
            },
            {
                check_id: 'answer_sentence_concise',
                verdict: 'fail',
                confidence: 0.85,
                scope: 'sentence',
                node_ref: 'block-2',
                text_quote_selector: {
                    exact: 'This year, the strongest teams supposedly moved from experimentation to full adoption, and many guides say the switch already happened across most industries.',
                    prefix: '',
                    suffix: ' In practice, those statements depend heavily on sector, region, and regulatory context, but they are often presented as if they apply everywhere.'
                },
                explanation: 'Answer sentence has 32 words, which is below the 40-60 word threshold.'
            },
            {
                check_id: 'clear_answer_formatting',
                verdict: 'partial',
                confidence: 0.65,
                scope: 'block',
                node_ref: 'block-2',
                text_quote_selector: {
                    exact: 'This year, the strongest teams supposedly moved from experimentation to full adoption, and many guides say the switch already happened across most industries. In practice, those statements depend heavily on sector, region, and regulatory context, but they are often presented as if they apply everywhere.',
                    prefix: '',
                    suffix: ''
                },
                explanation: 'Answer is not separated into clear steps or bullet points for better readability.'
            }
        ];

        expect(questionAnchorPayload.anchor_count).toBe(1);
        expect(questionAnchorPayload.anchors.map((item) => item.text)).toContain('What Changed This Year');

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload }
        );
        const expectations = {
            immediate_answer_placement: {
                verdict: 'partial',
                explanation: 'Answer appears at 121-150 words after the question anchor.'
            },
            answer_sentence_concise: {
                verdict: 'fail',
                explanation: 'Answer sentence has 32 words, which is below the 40-60 word threshold.'
            },
            clear_answer_formatting: {
                verdict: 'partial',
                explanation: 'Answer is not separated into clear steps or bullet points for better readability.'
            }
        };

        Object.entries(expectations).forEach(([checkId, matcher]) => {
            const check = converted.checks[checkId];

            expect(check).toBeDefined();
            expect(check.verdict).toBe(matcher.verdict);
            expect(check.explanation).toBe(matcher.explanation);
            expect(check.guardrail_adjusted).not.toBe(true);
            expect([null, undefined]).toContain(check.guardrail_reason);
        });
        expect(converted.telemetry.aggregate.question_anchor_guardrail_adjustments_total).toBe(0);
    });

    test('internal_link_context_relevance becomes neutral when manifest has no internal links', () => {
        const checks = {
            internal_link_context_relevance: {
                verdict: 'fail',
                confidence: 0.87,
                explanation: 'The section lacks contextual internal links.',
                highlights: [{ node_ref: 'b-1', start: 0, end: 48 }],
                failed_candidates: [{ node_ref: 'b-1', message: 'Missing link context.' }],
                candidate_highlights: [{ node_ref: 'b-1', message: 'Link support needed.' }]
            }
        };
        __testHooks.applyNoInternalLinksNeutrality(checks, { links: [] });

        const adjusted = checks.internal_link_context_relevance;
        expect(adjusted.verdict).toBe('pass');
        expect(adjusted.ui_verdict).toBe('pass');
        expect(adjusted.score_neutral).toBe(true);
        expect(adjusted.score_neutral_reason).toBe('internal_links_absent');
        expect(adjusted.non_inline).toBe(true);
        expect(adjusted.non_inline_reason).toBe('internal_links_absent');
        expect(adjusted.highlights).toEqual([]);
        expect(adjusted.failed_candidates).toEqual([]);
        expect(adjusted.candidate_highlights).toEqual([]);
        expect(adjusted.details.internal_link_count).toBe(0);
    });

    test('convertFindingsToChecks keeps guardrail reason internal while summary explanation stays user-safe', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'immediate_answer_placement',
                verdict: 'fail',
                confidence: 0.72,
                scope: 'span',
                text_quote_selector: {
                    exact: 'Website performance affects rankings, conversions, and user satisfaction.',
                    prefix: 'The article opens by saying ',
                    suffix: ' before moving into broader discussion.'
                },
                explanation: 'The article opens with broad context instead of a direct answer.'
            }
        ];
        const manifest = {
            block_map: [
                {
                    node_ref: 'b-1',
                    signature: 'sig-1',
                    block_type: 'core/paragraph',
                    text: 'The article opens by saying Website performance affects rankings, conversions, and user satisfaction. before moving into broader discussion.'
                }
            ]
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const check = converted.checks.immediate_answer_placement;

        expect(check.guardrail_adjusted).toBe(true);
        expect(check.guardrail_reason).toBe('no_strict_question_anchor');
        expect(typeof check.guardrail_source_explanation).toBe('string');
        expect(check.guardrail_source_explanation).toContain('broad context');
        expect(check.explanation).toContain('question-led setup');
        expect(check.explanation).not.toMatch(/strict question anchor/i);
        expect(check.explanation).not.toMatch(/cannot be evaluated/i);
        expect(check.explanation).not.toMatch(/remains unproven/i);
        expect(Array.isArray(check.candidate_highlights)).toBe(true);
        expect(check.candidate_highlights[0].message).toContain('question-led setup');
        expect(check.candidate_highlights[0].message).not.toMatch(/strict question anchor/i);
        expect(check.candidate_highlights[0].message).not.toMatch(/cannot be evaluated/i);
        expect(check.candidate_highlights[0].message).not.toMatch(/remains unproven/i);
        expect(converted.telemetry.aggregate.question_anchor_guardrail_adjustments_by_reason.no_strict_question_anchor).toBe(1);
        expect(converted.telemetry.aggregate.question_anchor_guardrail_fallback_explanations_total).toBe(1);
        expect(converted.telemetry.aggregate.question_anchor_guardrail_fallback_explanations_by_check.immediate_answer_placement).toBe(1);
        expect(converted.telemetry.question_anchor_guardrail.adjustments_by_reason.no_strict_question_anchor).toBe(1);
        expect(converted.telemetry.question_anchor_guardrail.fallback_explanations_total).toBe(1);
    });

    test('normalizeChunkFindings preserves distinct repeated failures for the same check', () => {
        const manifest = {
            block_map: [
                { text: 'First unsupported claim.' },
                { text: 'Second unsupported claim.' }
            ]
        };
        const normalized = __testHooks.normalizeChunkFindings(
            [
                {
                    check_id: 'claim_pattern_detection',
                    verdict: 'fail',
                    scope: 'sentence',
                    text_quote_selector: { exact: 'First unsupported claim.', prefix: '', suffix: '' },
                    explanation: 'Claim one is unsupported.'
                },
                {
                    check_id: 'claim_pattern_detection',
                    verdict: 'fail',
                    scope: 'sentence',
                    text_quote_selector: { exact: 'Second unsupported claim.', prefix: '', suffix: '' },
                    explanation: 'Claim two is unsupported.'
                }
            ],
            ['claim_pattern_detection'],
            manifest,
            'missing_chunk_output',
            { synthesizeMissing: false }
        );

        expect(normalized.missingCheckIds).toEqual([]);
        expect(normalized.findings).toHaveLength(2);
        expect(normalized.findings.map((finding) => finding.text_quote_selector.exact)).toEqual([
            'First unsupported claim.',
            'Second unsupported claim.'
        ]);
    });

    test('AI scope includes heading_topic_fulfillment and excludes heading_fragmentation', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = Array.from(__testHooks.getAiEligibleCheckIds(definitions, runtimeContract));

        expect(aiCheckIds).toContain('heading_topic_fulfillment');
        expect(aiCheckIds).not.toContain('heading_fragmentation');
    });

    test('semantic fallback check marks heading_topic_fulfillment as partial recommendation', () => {
        const definitions = loadJson(definitionsPath);
        const fallback = __testHooks.buildSemanticFallbackCheck('heading_topic_fulfillment', definitions);

        expect(fallback.verdict).toBe('partial');
        expect(fallback.non_inline).toBe(true);
        expect(fallback.non_inline_reason).toBe('ai_unavailable_fallback');
        expect(fallback.provenance).toBe('synthetic');
        expect(fallback.explanation).toMatch(/validation is partial/i);
    });

    test('heading_topic_fulfillment findings are coerced to span with heading-specific explanation and heading anchor', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'heading_topic_fulfillment',
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
        const orphan = converted.checks.heading_topic_fulfillment;
        const candidate = orphan.candidate_highlights[0];

        expect(orphan.verdict).toBe('fail');
        expect(orphan.explanation).toMatch(/Heading "Section One"/);
        expect(candidate.scope).toBe('span');
        expect(candidate.node_ref).toBe('h-1');
        expect(candidate.message).toMatch(/Heading "Section One"/);
    });

    test('lists_tables_presence findings are normalized to one block-level section issue', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'lists_tables_presence',
                verdict: 'fail',
                confidence: 0.88,
                scope: 'span',
                text_quote_selector: {
                    exact: 'competition, refunds, shipping delays, supplier quality',
                    prefix: 'The section lists ',
                    suffix: ' without using a real list structure.'
                },
                explanation: 'This section contains listable content but keeps it inside one dense sentence.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'block-1', signature: 'sig-1', block_type: 'core/paragraph', text: 'The section lists competition, refunds, shipping delays, supplier quality without using a real list structure.' }
            ]
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const listCheck = converted.checks.lists_tables_presence;
        const candidate = listCheck.candidate_highlights[0];

        expect(listCheck.verdict).toBe('fail');
        expect(candidate.scope).toBe('block');
        expect(candidate.node_ref).toBe('block-1');
    });

    test('lists_tables_presence is vetoed when the section already has a visible list', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'lists_tables_presence',
                verdict: 'fail',
                confidence: 0.92,
                scope: 'span',
                text_quote_selector: {
                    exact: 'beam looks, wash colors, silhouette moments, and audience blinders',
                    prefix: 'Concert lighting ideas include ',
                    suffix: ' before the visible bullets begin.'
                },
                explanation: 'Listable content exists but is still embedded in dense prose.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'What are the Top Concert Lighting Ideas?' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'Concert lighting ideas include beam looks, wash colors, silhouette moments, and audience blinders before the visible bullets begin.' },
                { node_ref: 'p-2', signature: 'sig-p-2', block_type: 'core/paragraph', text: '\u00B7 Use Intensity, Color & Motion to Shape Mood' },
                { node_ref: 'p-3', signature: 'sig-p-3', block_type: 'core/paragraph', text: '\u00B7 Choose Fixtures by Function' },
                { node_ref: 'p-4', signature: 'sig-p-4', block_type: 'core/paragraph', text: '\u00B7 Time Effects to Musical Transitions' }
            ],
            preflight_structure: {
                visible_itemlist_sections: [
                    { heading_node_ref: 'h-1', node_ref: 'p-2', source_kind: 'bullet_block_sequence' }
                ],
                pseudo_list_sections: [],
                question_sections: [
                    { heading_node_ref: 'h-1', support_node_refs: ['p-1', 'p-2', 'p-3', 'p-4'] }
                ],
                faq_candidate_sections: [],
                faq_signals: { explicit_signal: false, blocked_by_type: false },
                procedural_sections: [],
                howto_summary: { step_heading_count: 0, list_item_count: 0, procedural_support_count: 0, detected_steps: [], title_signal: false }
            }
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const listCheck = converted.checks.lists_tables_presence;

        expect(listCheck.verdict).toBe('pass');
        expect(listCheck.guardrail_adjusted).toBe(true);
        expect(listCheck.guardrail_kind).toBe('semantic_structure');
        expect(listCheck.guardrail_reason).toBe('visible_list_already_present');
        expect(listCheck.explanation).toMatch(/already presents the ideas as a visible list/i);
        expect(listCheck.candidate_highlights).toBeUndefined();
        expect(converted.telemetry.aggregate.question_anchor_guardrail_adjustments_total).toBe(0);
        expect(converted.telemetry.aggregate.semantic_structure_guardrail_adjustments_total).toBe(1);
    });

    test('live-path structure enrichment enables faq vetoes for question-led list sections before AI conversion', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'faq_structure_opportunity',
                verdict: 'fail',
                confidence: 0.84,
                scope: 'span',
                text_quote_selector: {
                    exact: 'Create a mood with lighting: Fade between colors so the change feels natural.',
                    prefix: 'Here are three practical ideas to consider: ',
                    suffix: ' You can also match fades to the beat.'
                },
                explanation: 'The section should be converted into FAQ pairs.'
            }
        ];
        const manifest = {
            title: 'Concert Lighting Ideas: Stage Lighting Designs & Techniques for Concerts',
            content_type: 'post',
            block_map: [
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'What are Lighting Tips & Techniques for Concerts?' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'To create a concert experience that stands out, use simple techniques that repeat across songs so lights feel tied to the music and not random. Here are three practical ideas to consider:' },
                { node_ref: 'p-2', signature: 'sig-p-2', block_type: 'core/paragraph', text: '\u00B7 Create a mood with lighting: Fade between colors so the change feels natural. You can also match fades to the beat.' },
                { node_ref: 'p-3', signature: 'sig-p-3', block_type: 'core/paragraph', text: '\u00B7 Highlight performers: Choose a tight spot for solos and add rim light for separation.' },
                { node_ref: 'p-4', signature: 'sig-p-4', block_type: 'core/paragraph', text: '\u00B7 Position light fixtures: Use front lights for clear faces and backlights for silhouette.' }
            ]
        };

        expect(manifest.preflight_structure).toBeUndefined();

        const structure = ensureManifestPreflightStructure(manifest, { content_type: 'post' }, { contentHtml: '' });

        expect(Array.isArray(structure.visible_itemlist_sections)).toBe(true);
        expect(Array.isArray(structure.pseudo_list_sections)).toBe(true);
        expect(Array.isArray(structure.faq_candidate_sections)).toBe(true);
        expect(structure.faq_candidate_sections).toHaveLength(0);
        expect(structure.question_sections).toHaveLength(1);
        expect(manifest.preflight_structure).toBe(structure);

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const faqCheck = converted.checks.faq_structure_opportunity;

        expect(faqCheck.verdict).toBe('pass');
        expect(faqCheck.guardrail_adjusted).toBe(true);
        expect(faqCheck.guardrail_kind).toBe('semantic_structure');
        expect(faqCheck.guardrail_reason).toBe('insufficient_faq_pairs');
        expect(faqCheck.explanation).toMatch(/does not contain enough explicit reusable question-and-answer pairs/i);
    });

    test('faq_structure_opportunity is vetoed for a single question-led explainer', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'faq_structure_opportunity',
                verdict: 'fail',
                confidence: 0.81,
                scope: 'span',
                text_quote_selector: {
                    exact: 'Use wash lights for coverage, spotlights for solos, and strobes for energy.',
                    prefix: 'The section explains: ',
                    suffix: ' This is still one explainer section.'
                },
                explanation: 'The section should be broken into FAQ pairs.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'What are Lighting Tips & Techniques for Concerts?' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'The section explains: Use wash lights for coverage, spotlights for solos, and strobes for energy. This is still one explainer section.' }
            ],
            preflight_structure: {
                visible_itemlist_sections: [],
                pseudo_list_sections: [
                    { heading_node_ref: 'h-1', node_ref: 'p-1', source_kind: 'colon_labeled_paragraph' }
                ],
                question_sections: [
                    { heading_node_ref: 'h-1', support_node_refs: ['p-1'] }
                ],
                faq_candidate_sections: [],
                faq_signals: { explicit_signal: false, blocked_by_type: false },
                procedural_sections: [],
                howto_summary: { step_heading_count: 0, list_item_count: 0, procedural_support_count: 0, detected_steps: [], title_signal: false }
            }
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const faqCheck = converted.checks.faq_structure_opportunity;

        expect(faqCheck.verdict).toBe('pass');
        expect(faqCheck.guardrail_adjusted).toBe(true);
        expect(faqCheck.guardrail_kind).toBe('semantic_structure');
        expect(faqCheck.guardrail_reason).toBe('insufficient_faq_pairs');
        expect(faqCheck.explanation).toMatch(/does not contain enough explicit reusable question-and-answer pairs/i);
        expect(faqCheck.candidate_highlights).toBeUndefined();
        expect(converted.telemetry.aggregate.semantic_structure_guardrail_adjustments_by_check.faq_structure_opportunity).toBe(1);
    });

    test('temporal_claim_check is vetoed when a clear local interval is mistaken for an article-date problem', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'temporal_claim_check',
                verdict: 'fail',
                confidence: 0.77,
                scope: 'sentence',
                text_quote_selector: {
                    exact: 'But after 48 hours, you should start gentle movements.',
                    prefix: 'Recovery advice says ',
                    suffix: ' The recommendation is framed as a local care interval.'
                },
                explanation: 'The claim specifies a 48-hour window but lacks a clear publication or update date for context.'
            }
        ];
        const manifest = {
            block_map: [
                {
                    node_ref: 'p-1',
                    signature: 'sig-p-1',
                    block_type: 'core/paragraph',
                    text: 'But after 48 hours, you should start gentle movements. You do not want to stay in bed for a week or more.'
                }
            ]
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const temporalCheck = converted.checks.temporal_claim_check;

        expect(temporalCheck.verdict).toBe('pass');
        expect(temporalCheck.guardrail_adjusted).toBe(true);
        expect(temporalCheck.guardrail_kind).toBe('semantic_temporal');
        expect(temporalCheck.guardrail_reason).toBe('local_interval_already_anchored');
        expect(temporalCheck.explanation).toMatch(/clear local interval/i);
        expect(converted.telemetry.aggregate.semantic_temporal_guardrail_adjustments_total).toBe(1);
        expect(converted.telemetry.semantic_temporal_guardrail.adjustments_by_check.temporal_claim_check).toBe(1);
    });

    test('howto_semantic_validity is vetoed when no procedural signals exist', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'howto_semantic_validity',
                verdict: 'fail',
                confidence: 0.79,
                scope: 'span',
                text_quote_selector: {
                    exact: 'Concert lighting can shape mood, focus attention, and support pacing.',
                    prefix: '',
                    suffix: ' It reads like an explainer, not a procedure.'
                },
                explanation: 'This section is not a valid step-by-step procedure.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'Concert lighting can shape mood, focus attention, and support pacing. It reads like an explainer, not a procedure.' }
            ],
            preflight_structure: {
                visible_itemlist_sections: [],
                pseudo_list_sections: [],
                question_sections: [],
                faq_candidate_sections: [],
                faq_signals: { explicit_signal: false, blocked_by_type: false },
                procedural_sections: [],
                howto_summary: { step_heading_count: 0, list_item_count: 0, procedural_support_count: 0, detected_steps: [], title_signal: false }
            }
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const howtoCheck = converted.checks.howto_semantic_validity;

        expect(howtoCheck.verdict).toBe('pass');
        expect(howtoCheck.guardrail_adjusted).toBe(true);
        expect(howtoCheck.guardrail_kind).toBe('semantic_structure');
        expect(howtoCheck.guardrail_reason).toBe('not_procedural_content');
        expect(howtoCheck.explanation).toMatch(/does not present strong step-by-step procedural signals/i);
    });

    test('faq_structure_opportunity still survives when structural FAQ support is real', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'faq_structure_opportunity',
                verdict: 'fail',
                confidence: 0.86,
                scope: 'span',
                text_quote_selector: {
                    exact: 'Wash lights cover the stage evenly and moving heads add motion.',
                    prefix: '',
                    suffix: ' Keep the answers reusable.'
                },
                explanation: 'These answers should be separated into reusable FAQ pairs.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'h-1', signature: 'sig-h-1', block_type: 'core/heading', text: 'What lights cover the stage evenly?' },
                { node_ref: 'p-1', signature: 'sig-p-1', block_type: 'core/paragraph', text: 'Wash lights cover the stage evenly and moving heads add motion. Keep the answers reusable.' },
                { node_ref: 'h-2', signature: 'sig-h-2', block_type: 'core/heading', text: 'What lights create crowd-energy moments?' },
                { node_ref: 'p-2', signature: 'sig-p-2', block_type: 'core/paragraph', text: 'Blinders and strobes create crowd-energy moments when used carefully.' }
            ],
            preflight_structure: {
                visible_itemlist_sections: [],
                pseudo_list_sections: [],
                question_sections: [
                    { heading_node_ref: 'h-1', support_node_refs: ['p-1'] },
                    { heading_node_ref: 'h-2', support_node_refs: ['p-2'] }
                ],
                faq_candidate_sections: [
                    { heading_node_ref: 'h-1', source: 'question_section' },
                    { heading_node_ref: 'h-2', source: 'question_section' }
                ],
                faq_signals: { explicit_signal: true, blocked_by_type: false },
                procedural_sections: [],
                howto_summary: { step_heading_count: 0, list_item_count: 0, procedural_support_count: 0, detected_steps: [], title_signal: false }
            }
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const faqCheck = converted.checks.faq_structure_opportunity;

        expect(faqCheck.verdict).toBe('fail');
        expect(faqCheck.guardrail_adjusted).not.toBe(true);
        expect(faqCheck.candidate_highlights).toHaveLength(1);
        expect(converted.telemetry.aggregate.semantic_structure_guardrail_adjustments_total).toBe(0);
    });

    test('convertFindingsToChecks preserves repeated semantic instances while keeping the strongest top-level verdict', () => {
        const definitions = loadJson(definitionsPath);
        const runtimeContract = loadJson(runtimeContractPath);
        const aiCheckIds = __testHooks.getAiEligibleCheckIds(definitions, runtimeContract);
        const findings = [
            {
                check_id: 'claim_pattern_detection',
                verdict: 'partial',
                confidence: 0.64,
                scope: 'sentence',
                text_quote_selector: {
                    exact: 'Coffee cures every disease.',
                    prefix: 'Opening copy says ',
                    suffix: ' and readers are told to trust it.'
                },
                explanation: 'This claim is exaggerated and unsupported.'
            },
            {
                check_id: 'claim_pattern_detection',
                verdict: 'fail',
                confidence: 0.91,
                scope: 'sentence',
                text_quote_selector: {
                    exact: 'Drink 10 cups now for perfect health.',
                    prefix: 'Later the article says ',
                    suffix: ' without medical evidence.'
                },
                explanation: 'This claim is unsafe and unsupported.'
            }
        ];
        const manifest = {
            block_map: [
                { node_ref: 'b-1', signature: 'sig-1', block_type: 'core/paragraph', text: 'Opening copy says Coffee cures every disease. and readers are told to trust it.' },
                { node_ref: 'b-2', signature: 'sig-2', block_type: 'core/paragraph', text: 'Later the article says Drink 10 cups now for perfect health. without medical evidence.' }
            ]
        };

        const converted = __testHooks.convertFindingsToChecks(
            findings,
            definitions,
            manifest,
            aiCheckIds,
            { questionAnchorPayload: { strict_mode: true, anchor_count: 0, anchors: [] } }
        );
        const claimCheck = converted.checks.claim_pattern_detection;

        expect(claimCheck.verdict).toBe('fail');
        expect(claimCheck.instance_count).toBe(2);
        expect(claimCheck.candidate_highlights).toHaveLength(2);
        expect(claimCheck.candidate_highlights[0].snippet).toContain('Coffee cures every disease.');
        expect(claimCheck.candidate_highlights[1].snippet).toContain('Drink 10 cups now for perfect health.');
    });
});
