const mockCreateSettlementEvent = jest.fn((payload = {}) => ({
    event_id: 'ledger_copilot_generation',
    event_type: 'settlement',
    status: 'settled',
    pricing_snapshot: payload.pricing_snapshot || {},
    usage_snapshot: payload.usage_snapshot || {},
    amounts: payload.amounts || {},
    ...payload
}));
const mockPersistLedgerEvent = jest.fn(async (event) => ({
    ...event,
    created_at: '2026-03-29T10:00:00.000Z',
    updated_at: '2026-03-29T10:00:00.000Z'
}));
const mockSecretsSend = jest.fn(async () => ({
    SecretString: JSON.stringify({ MISTRAL_API_KEY: 'test-mistral-key' })
}));
const mockGetAccountState = jest.fn();
const mockPutAccountState = jest.fn(async (state) => state);
const mockApplyLedgerEventToState = jest.fn((state) => state);
const mockBuildUsageSettlementPreview = jest.fn(({ model, usage } = {}) => ({
    pricing_snapshot: {
        requested_model: model || 'mistral-large-latest',
        billable_model: 'mistral-large-2512',
        credit_multiplier: 30000
    },
    usage_snapshot: {
        input_tokens: Number(usage && usage.input_tokens) || 0,
        output_tokens: Number(usage && usage.output_tokens) || 0,
        weighted_tokens: 0,
        raw_cost_micros: 1234,
        raw_cost_usd: 0.001234,
        credits_used: 37
    }
}));
const mockComputeTotalRemaining = jest.fn((state) => {
    const included = Number(state && state.credits && state.credits.included_remaining) || 0;
    const topup = Number(state && state.credits && state.credits.topup_remaining) || 0;
    return included + topup;
});
const mockEmitRewriteRequested = jest.fn();
const mockEmitRewriteCompleted = jest.fn();
const mockEmitRewriteFailed = jest.fn();
const mockEmitCopilotVariantsGenerated = jest.fn();
const mockEmitCopilotGenerationFailed = jest.fn();
const mockEmitCopilotGenerationSettled = jest.fn();

jest.mock('./credit-ledger', () => ({
    createSettlementEvent: (...args) => mockCreateSettlementEvent(...args),
    persistLedgerEvent: (...args) => mockPersistLedgerEvent(...args)
}));

jest.mock('./billing-account-state', () => ({
    createAccountBillingStateStore: () => ({
        getAccountState: (...args) => mockGetAccountState(...args),
        putAccountState: (...args) => mockPutAccountState(...args)
    }),
    applyLedgerEventToState: (...args) => mockApplyLedgerEventToState(...args),
    computeTotalRemaining: (...args) => mockComputeTotalRemaining(...args)
}));

jest.mock('./credit-pricing', () => ({
    buildUsageSettlementPreview: (...args) => mockBuildUsageSettlementPreview(...args)
}));

jest.mock('./telemetry-emitter', () => ({
    emitRewriteRequested: (...args) => mockEmitRewriteRequested(...args),
    emitRewriteCompleted: (...args) => mockEmitRewriteCompleted(...args),
    emitRewriteFailed: (...args) => mockEmitRewriteFailed(...args),
    emitCopilotVariantsGenerated: (...args) => mockEmitCopilotVariantsGenerated(...args),
    emitCopilotGenerationFailed: (...args) => mockEmitCopilotGenerationFailed(...args),
    emitCopilotGenerationSettled: (...args) => mockEmitCopilotGenerationSettled(...args)
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest.fn(() => ({
        send: (...args) => mockSecretsSend(...args)
    })),
    GetSecretValueCommand: jest.fn((input) => input)
}));

const {
    rewriteHandler,
    normalizeRewriteRequestPayload,
    buildSuggestionFromCopilotIssue,
    buildSuggestionFromRewriteTarget,
    buildSuggestionFromIssueContext,
    buildRewriteSystemPrompt,
    buildRewritePrompt,
    validateVariantsForTarget,
    buildSafeFallbackVariants,
    parseRewriteResponse
} = require('./rewrite-handler');

describe('rewrite-handler contract compatibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSecretsSend.mockResolvedValue({
            SecretString: JSON.stringify({ MISTRAL_API_KEY: 'test-mistral-key' })
        });
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            entitlements: {
                analysis_allowed: true
            },
            credits: {
                included_remaining: 240,
                topup_remaining: 0
            },
            site: {
                site_id: 'site_123'
            }
        });
        global.fetch = undefined;
    });

    test('buildSuggestionFromRewriteTarget synthesizes suggestion from target payload', () => {
        const suggestion = buildSuggestionFromRewriteTarget({
            mode: 'heading_support_range',
            primary_node_ref: 'block-4',
            node_refs: ['block-4', 'block-5'],
            target_text: 'Paragraph under heading.'
        });

        expect(suggestion).toEqual({
            text: 'Paragraph under heading.',
            node_ref: 'block-4'
        });
    });

    test('buildSuggestionFromCopilotIssue synthesizes suggestion from scoped copilot packet', () => {
        const suggestion = buildSuggestionFromCopilotIssue({
            issue_key: 'immediate_answer_placement:0',
            check_id: 'immediate_answer_placement',
            check_name: 'Immediate Answer Placement',
            analyzer_note: 'The section reaches the answer only after setup instead of leading with it.',
            node_ref: 'block-7',
            section_text: 'The three states of matter are solid, liquid, and gas.',
            section_nodes: [
                { ref: 'block-7', text: 'The three states of matter are solid, liquid, and gas.' }
            ]
        });

        expect(suggestion).toEqual({
            text: 'The three states of matter are solid, liquid, and gas.',
            node_ref: 'block-7'
        });
    });

    test('buildSuggestionFromIssueContext synthesizes suggestion from local issue context', () => {
        const suggestion = buildSuggestionFromIssueContext({
            node_ref: 'block-7',
            snippet: '',
            section_text: 'The three states of matter are solid, liquid, and gas.',
            section_nodes: [
                { ref: 'block-7', text: 'The three states of matter are solid, liquid, and gas.' }
            ]
        });

        expect(suggestion).toEqual({
            text: 'The three states of matter are solid, liquid, and gas.',
            node_ref: 'block-7'
        });
    });

    test('normalizeRewriteRequestPayload supports new contract fields', () => {
        const normalized = normalizeRewriteRequestPayload({
            analysis_ref: { run_id: 'run-1', check_id: 'heading_topic_fulfillment', instance_index: 0 },
            rewrite_target: {
                actionable: true,
                mode: 'heading_support_range',
                primary_node_ref: 'block-3',
                target_text: 'Thin support text.'
            },
            repair_intent: {
                check_id: 'heading_topic_fulfillment',
                instruction: 'Improve support content'
            },
            issue_context: {
                check_id: 'heading_topic_fulfillment',
                message: 'Heading lacks support',
                heading_chain: ['Caching Strategies'],
                surrounding_nodes: [{ ref: 'block-3', text: 'Thin support text.' }]
            },
            manifest: { nodes: [{ ref: 'block-3', text: 'Thin support text.' }], plain_text: 'Thin support text.' },
            verification_intent: 'local_only',
            test_mode: true
        });

        expect(normalized.analysis_ref).toBeTruthy();
        expect(normalized.rewrite_target).toBeTruthy();
        expect(normalized.repair_intent).toBeTruthy();
        expect(normalized.issue_context).toBeTruthy();
        expect(normalized.suggestion).toBeTruthy();
        expect(normalized.suggestion.text).toBe('Thin support text.');
        expect(normalized.fix_assist_triage).toBeTruthy();
        expect(normalized.fix_assist_triage.state).toBe('rewrite_needed');
        expect(normalized.fix_assist_contract).toBeTruthy();
        expect(normalized.fix_assist_contract.check_id).toBe('heading_topic_fulfillment');
        expect(normalized.fix_assist_contract.repair_mode).toBe('expand_support');
        expect(normalized.verification_intent).toBe('local_only');
        expect(normalized.options.verification_intent).toBe('local_only');
    });

    test('normalizeRewriteRequestPayload prefers dedicated copilot_issue packet for scoped repair context', () => {
        const normalized = normalizeRewriteRequestPayload({
            copilot_issue: {
                issue_key: 'immediate_answer_placement:0',
                check_id: 'immediate_answer_placement',
                check_name: 'Immediate Answer Placement',
                analyzer_note: 'The section reaches the answer only after setup instead of leading with it.',
                node_ref: 'block-9',
                snippet: '',
                section_text: 'The three states of matter are solid, liquid, and gas.',
                section_nodes: [
                    { ref: 'block-9', text: 'The three states of matter are solid, liquid, and gas.' }
                ],
                heading_chain: ['States of Matter']
            },
            manifest: {
                nodes: [{ ref: 'block-9', text: 'The three states of matter are solid, liquid, and gas.' }],
                plain_text: 'The three states of matter are solid, liquid, and gas.'
            },
            test_mode: true
        });

        expect(normalized.copilot_issue).toBeTruthy();
        expect(normalized.copilot_issue.issue_key).toBe('immediate_answer_placement:0');
        expect(normalized.copilot_issue.analyzer_note).toBe('The section reaches the answer only after setup instead of leading with it.');
        expect(normalized.suggestion).toBeTruthy();
        expect(normalized.suggestion.text).toBe('The three states of matter are solid, liquid, and gas.');
        expect(normalized.fix_assist_triage).toBeTruthy();
    });

    test('normalizeRewriteRequestPayload can synthesize a suggestion from issue context alone', () => {
        const normalized = normalizeRewriteRequestPayload({
            issue_context: {
                check_id: 'immediate_answer_placement',
                check_name: 'Immediate Answer Placement',
                node_ref: 'block-9',
                snippet: '',
                section_text: 'The three states of matter are solid, liquid, and gas.',
                section_nodes: [
                    { ref: 'block-9', text: 'The three states of matter are solid, liquid, and gas.' }
                ]
            },
            manifest: {
                nodes: [{ ref: 'block-9', text: 'The three states of matter are solid, liquid, and gas.' }],
                plain_text: 'The three states of matter are solid, liquid, and gas.'
            },
            test_mode: true
        });

        expect(normalized.suggestion).toBeTruthy();
        expect(normalized.suggestion.text).toBe('The three states of matter are solid, liquid, and gas.');
        expect(normalized.suggestion.node_ref).toBe('block-9');
        expect(normalized.issue_context.check_name).toBe('Immediate Answer Placement');
    });

    test('rewriteHandler accepts legacy payload (backward compatible)', async () => {
        const event = {
            body: JSON.stringify({
                suggestion: {
                    text: 'Original sentence.',
                    node_ref: 'block-1'
                },
                manifest: {
                    nodes: [{ ref: 'block-1', text: 'Original sentence.' }],
                    plain_text: 'Original sentence.'
                },
                verification_intent: 'verify_first',
                test_mode: true
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.verification_intent).toBe('verify_first');
        expect(parsed.fix_assist_triage).toBeTruthy();
        expect(parsed.fix_assist_contract).toBeTruthy();
        expect(Array.isArray(parsed.variants)).toBe(true);
        expect(mockCreateSettlementEvent).not.toHaveBeenCalled();
        expect(mockPersistLedgerEvent).not.toHaveBeenCalled();
        expect(mockEmitCopilotVariantsGenerated).not.toHaveBeenCalled();
    });

    test('rewriteHandler accepts new payload without legacy suggestion', async () => {
        const event = {
            body: JSON.stringify({
                analysis_ref: {
                    run_id: 'run-123',
                    check_id: 'heading_topic_fulfillment',
                    instance_index: 0
                },
                rewrite_target: {
                    actionable: true,
                    mode: 'heading_support_range',
                    primary_node_ref: 'block-2',
                    node_refs: ['block-2', 'block-3'],
                    target_text: 'Support paragraph text.'
                },
                repair_intent: {
                    check_id: 'heading_topic_fulfillment',
                    instruction: 'Improve supporting content below heading'
                },
                manifest: {
                    block_map: [
                        { node_ref: 'block-1', block_type: 'core/heading', text: 'Caching Strategies' },
                        { node_ref: 'block-2', block_type: 'core/paragraph', text: 'Support paragraph text.' }
                    ],
                    plain_text: 'Caching Strategies Support paragraph text.'
                },
                test_mode: true
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.rewrite_target_mode).toBe('heading_support_range');
        expect(parsed.fix_assist_triage?.state).toBe('rewrite_needed');
        expect(parsed.fix_assist_contract?.repair_mode).toBe('expand_support');
        expect(Array.isArray(parsed.variants)).toBe(true);
    });

    test('rewriteHandler accepts issue-context-grounded payload without rewrite target', async () => {
        const event = {
            body: JSON.stringify({
                issue_context: {
                    run_id: 'run-ctx-1',
                    check_id: 'immediate_answer_placement',
                    check_name: 'Immediate Answer Placement',
                    node_ref: 'block-2',
                    section_text: 'The three states of matter are solid, liquid, and gas.',
                    section_nodes: [
                        { ref: 'block-2', type: 'core/paragraph', text: 'The three states of matter are solid, liquid, and gas.' }
                    ]
                },
                manifest: {
                    nodes: [{ ref: 'block-2', type: 'core/paragraph', text: 'The three states of matter are solid, liquid, and gas.' }],
                    plain_text: 'The three states of matter are solid, liquid, and gas.'
                },
                test_mode: true
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(Array.isArray(parsed.variants)).toBe(true);
        expect(parsed.fix_assist_contract?.check_id).toBe('immediate_answer_placement');
    });

    test('rewriteHandler settles copilot generation charges and returns labeled variants', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            variants: [
                                { id: 1, text: 'Tight answer.', explanation: 'Most direct version.', confidence: 0.91 },
                                { id: 2, text: 'Balanced answer with context.', explanation: 'Keeps useful context.', confidence: 0.88 },
                                { id: 3, text: 'Evidence-led answer with support.', explanation: 'Leads with support.', confidence: 0.86 }
                            ]
                        })
                    }
                }],
                usage: {
                    prompt_tokens: 120,
                    completion_tokens: 80
                }
            })
        });

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-123',
                suggestion: {
                    text: 'Original answer sentence.',
                    node_ref: 'block-1'
                },
                analysis_ref: {
                    run_id: 'run-123',
                    check_id: 'answer_sentence_concise',
                    instance_index: 0
                },
                rewrite_target: {
                    actionable: true,
                    mode: 'replace_span',
                    operation: 'replace_span',
                    primary_node_ref: 'block-1',
                    primary_repair_node_ref: 'block-1'
                },
                manifest: {
                    nodes: [{ ref: 'block-1', text: 'Original answer sentence.' }],
                    plain_text: 'Original answer sentence.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.generation_request_id).toBe('gen-123');
        expect(parsed.billing_summary).toBeTruthy();
        expect(parsed.billing_summary.reason_code).toBe('copilot_generation');
        expect(parsed.billing_summary.credits_used).toBe(37);
        expect(parsed.variants.map((variant) => variant.label)).toEqual(['Most concise', 'Balanced', 'Evidence-first']);
        expect(mockCreateSettlementEvent).toHaveBeenCalledWith(expect.objectContaining({
            account_id: 'acct_123',
            site_id: 'site_123',
            run_id: 'run-123',
            reason_code: 'copilot_generation',
            external_ref: 'gen-123'
        }));
        expect(mockPutAccountState).toHaveBeenCalled();
        expect(mockEmitCopilotVariantsGenerated).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-123',
            check_id: 'answer_sentence_concise',
            generation_request_id: 'gen-123',
            variants_count: 3,
            credits_used: 37,
            billing_status: 'settled'
        }));
    });

    test('rewriteHandler returns a clean unavailable state when replace_span scope is too wide', async () => {
        const longVariant = [
            'Epilepsy is a neurological disorder marked by recurring seizures caused by abnormal electrical activity in the brain,',
            'and this rewrite keeps expanding beyond the quoted snippet with added framing, extra support, and broader editorial context',
            'that no longer fits a safe snippet-scoped replace-span repair.'
        ].join(' ');

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            variants: [
                                { id: 1, text: longVariant, explanation: 'Too broad for the selected span.', confidence: 0.78 },
                                { id: 2, text: longVariant, explanation: 'Still too broad for the selected span.', confidence: 0.75 },
                                { id: 3, text: longVariant, explanation: 'Overshoots the snippet scope again.', confidence: 0.72 }
                            ]
                        })
                    }
                }],
                usage: {
                    prompt_tokens: 132,
                    completion_tokens: 98
                }
            })
        });

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-wide-scope-1',
                suggestion: {
                    text: 'Epilepsy is a neurological disorder.',
                    node_ref: 'block-1'
                },
                analysis_ref: {
                    run_id: 'run-wide-scope-1',
                    check_id: 'answer_sentence_concise',
                    instance_index: 0
                },
                rewrite_target: {
                    actionable: true,
                    mode: 'sentence',
                    operation: 'replace_span',
                    primary_node_ref: 'block-1',
                    primary_repair_node_ref: 'block-1'
                },
                manifest: {
                    nodes: [{ ref: 'block-1', text: 'Epilepsy is a neurological disorder.' }],
                    plain_text: 'Epilepsy is a neurological disorder.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(false);
        expect(parsed.error).toBe('replace_span_scope_too_wide');
        expect(parsed.message).toBe('Copilot can\'t generate variants for this section yet because the requested rewrite scope is too wide. For now, Copilot works best on tighter snippet-level issues rather than large span rewrites.');
        expect(parsed.variants).toEqual([]);
        expect(parsed.billing_summary).toBeTruthy();
        expect(parsed.metadata.validator_pass).toBe(false);
        expect(parsed.metadata.fallback_used).toBe(false);
        expect(parsed.metadata.validation_reason).toBe('replace_span_scope_too_wide');
        expect(parsed.metadata.variants_unavailable_reason).toBe('replace_span_scope_too_wide');
        expect(mockEmitRewriteCompleted).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-wide-scope-1',
            generation_request_id: 'gen-wide-scope-1',
            variants_count: 0,
            validation_rule: 'replace_span_scope_too_wide',
            variants_unavailable_reason: 'replace_span_scope_too_wide'
        }));
        expect(mockEmitCopilotGenerationFailed).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-wide-scope-1',
            generation_request_id: 'gen-wide-scope-1',
            reason: 'replace_span_scope_too_wide'
        }));
        expect(mockEmitCopilotVariantsGenerated).not.toHaveBeenCalled();
    });

    test('rewriteHandler settles a billable copilot run without analysis_ref when copilot_issue is the scoped source', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            variants: [
                                { id: 1, text: 'A solar eclipse happens when the Moon passes between Earth and the Sun, blocking some or all of the Sun from view.', explanation: 'Leads with the answer.', confidence: 0.91 },
                                { id: 2, text: 'A solar eclipse occurs when the Moon moves between Earth and the Sun and blocks part or all of the Sun from view.', explanation: 'Keeps a little context.', confidence: 0.88 },
                                { id: 3, text: 'A solar eclipse is when the Moon passes between Earth and the Sun, temporarily blocking all or part of the Sun from view.', explanation: 'Optimized for quote reuse.', confidence: 0.86 }
                            ]
                        })
                    }
                }],
                usage: {
                    prompt_tokens: 140,
                    completion_tokens: 96
                }
            })
        });

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123',
                'X-AIVI-Generation-Request-Id': 'gen-copilot-only'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-copilot-only',
                copilot_issue: {
                    issue_key: 'immediate_answer_placement:0',
                    check_id: 'immediate_answer_placement',
                    check_name: 'Immediate Answer Placement',
                    analyzer_note: 'The section reaches the answer only after setup instead of leading with it.',
                    node_ref: 'block-1',
                    snippet: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.',
                    section_text: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.',
                    section_nodes: [
                        { ref: 'block-1', type: 'core/paragraph', text: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.' }
                    ]
                },
                rewrite_target: {
                    actionable: true,
                    mode: 'section',
                    operation: 'replace_block',
                    primary_node_ref: 'block-1',
                    primary_repair_node_ref: 'block-1'
                },
                manifest: {
                    nodes: [{ ref: 'block-1', text: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.' }],
                    plain_text: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.billing_summary).toBeTruthy();
        expect(parsed.billing_summary.generation_request_id).toBe('gen-copilot-only');
        expect(mockEmitCopilotGenerationSettled).toHaveBeenCalledWith(expect.objectContaining({
            run_id: null,
            check_id: null,
            instance_index: null,
            site_id: 'site_123',
            credits_used: 37
        }));
    });

    test('rewriteHandler blocks billable generation when no billing account is attached', async () => {
        const event = {
            body: JSON.stringify({
                suggestion: {
                    text: 'Original answer sentence.',
                    node_ref: 'block-1'
                },
                manifest: {
                    nodes: [{ ref: 'block-1', text: 'Original answer sentence.' }],
                    plain_text: 'Original answer sentence.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(409);
        expect(parsed.ok).toBe(false);
        expect(parsed.error).toBe('account_connection_required');
        expect(global.fetch).toBeUndefined();
        expect(mockEmitCopilotGenerationFailed).toHaveBeenCalledWith(expect.objectContaining({
            generation_request_id: null,
            reason: 'copilot_generation_blocked'
        }));
    });

    test('buildRewritePrompt includes check-aware and mode-specific guidance', () => {
        const prompt = buildRewritePrompt(
            { text: 'Support paragraph text.' },
            {
                before: 'Caching Strategies',
                after: 'Next section starts here.',
                full_context: 'Support paragraph text.',
                node_type: 'p'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'heading_topic_fulfillment:0',
                    check_id: 'heading_topic_fulfillment',
                    check_name: 'Orphan Headings',
                    analyzer_note: 'The heading introduces a topic but the support below it is too thin.',
                    selected_issue: {
                        check_id: 'heading_topic_fulfillment',
                        check_name: 'Orphan Headings',
                        instance_index: 0,
                        analyzer_note: 'The heading introduces a topic but the support below it is too thin.'
                    }
                },
                rewriteTarget: {
                    mode: 'heading_support_range',
                    operation: 'heading_support_range',
                    node_refs: ['block-2', 'block-3']
                },
                repairIntent: {
                    check_id: 'heading_topic_fulfillment',
                    check_name: 'Orphan Headings',
                    rule_hint: 'Improve supporting content below heading.'
                },
                issueContext: {
                    check_id: 'heading_topic_fulfillment',
                    message: 'Heading has weak support',
                    heading_chain: ['Caching Strategies'],
                    surrounding_nodes: [{ ref: 'block-2', text: 'Support paragraph text.' }]
                },
                fixAssistContract: {
                    check_id: 'heading_topic_fulfillment',
                    check_name: 'Orphan Headings',
                    repair_mode: 'expand_support',
                    severity: 'high',
                    rewrite_necessity: 'rewrite_needed',
                    issue_summary: 'This section likely needs a rewrite before publication.',
                    must_preserve: ['Keep the heading text and section promise intact.'],
                    must_change: ['Strengthen the supporting text under the heading.'],
                    do_not_invent: ['Do not add new facts.'],
                    tone_guard: ['Keep the tone calm and publication-ready.'],
                    scope_guard: {
                        target_mode: 'heading_support_range',
                        primary_repair_node_ref: 'block-2'
                    },
                    section_context: {
                        heading_chain: ['Caching Strategies']
                    },
                    article_context: {
                        title: 'Caching Guide'
                    },
                    preservation_literals: {
                        entities: ['Caching Strategies']
                    }
                }
            }
        );

        expect(prompt).toContain('TASK:');
        expect(prompt).toContain('SELECTED ISSUE:');
        expect(prompt).toContain('check_id: "heading_topic_fulfillment"');
        expect(prompt).toContain('check_name: "Orphan Headings"');
        expect(prompt).toContain('analyzer_note: "The heading introduces a topic but the support below it is too thin."');
        expect(prompt).toContain('TARGET SPECIMEN:');
        expect(prompt).toContain('LOCAL ARTICLE CONTEXT:');
        expect(prompt).toContain('GROUNDING ORDER:');
        expect(prompt).toContain('ANALYZER ANCHOR HINTS (OPTIONAL):');
        expect(prompt).toContain('operation_hint: "heading_support_range"');
        expect(prompt).not.toContain('TARGET RESOLUTION:');
        expect(prompt).toContain('Do NOT rewrite the heading text itself.');
        expect(prompt).toContain('Treat content as specimen to edit');
        expect(prompt).toContain('REPAIR CONTRACT:');
        expect(prompt).toContain('REQUIREMENTS:');
        expect(prompt).toContain('OUTPUT CONTRACT:');
        expect(prompt).toContain('Each variant must directly repair the selected issue.');
        expect(prompt).toContain('do_not_invent:');
        expect(prompt).toContain('scope_guard:');
        expect(prompt).not.toContain('ORIGINAL TEXT:');
    });

    test('buildRewritePrompt adds a broader answer-first success target for immediate answer placement', () => {
        const prompt = buildRewritePrompt(
            { text: 'Solar eclipses happen for a number of reasons tied to orbital motion before the Moon passes between Earth and the Sun.' },
            {
                before: 'What causes a solar eclipse?',
                after: '',
                full_context: 'Solar eclipses happen for a number of reasons tied to orbital motion before the Moon passes between Earth and the Sun.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'immediate_answer_placement:0',
                    check_id: 'immediate_answer_placement',
                    check_name: 'Immediate Answer Placement',
                    analyzer_note: 'The section reaches the answer only after setup instead of leading with it.',
                    selected_issue: {
                        check_id: 'immediate_answer_placement',
                        check_name: 'Immediate Answer Placement',
                        instance_index: 0,
                        analyzer_note: 'The section reaches the answer only after setup instead of leading with it.'
                    }
                },
                issueContext: {
                    check_id: 'immediate_answer_placement',
                    check_name: 'Immediate Answer Placement',
                    heading_chain: ['What causes a solar eclipse?'],
                    section_text: 'Solar eclipses happen for a number of reasons tied to orbital motion before the Moon passes between Earth and the Sun.'
                },
                rewriteTarget: {
                    mode: 'section',
                    operation: 'replace_block',
                    node_refs: ['block-1']
                },
                fixAssistContract: {
                    check_id: 'immediate_answer_placement',
                    check_name: 'Immediate Answer Placement',
                    repair_mode: 'rewrite',
                    issue_summary: 'This section likely needs a rewrite before publication.'
                }
            }
        );

        expect(prompt).toContain('CHECK REPAIR STANDARD:');
        expect(prompt).toContain('Repair the first direct answer segment tied to the explicit question, not the setup or background around it.');
        expect(prompt).toContain('Keep the core Earth-Moon-Sun relation explicit: the Moon passes between Earth and the Sun.');
        expect(prompt).toContain('SUCCESS TARGET:');
        expect(prompt).toContain('Keep each full variant between 40 and 60 words total.');
        expect(prompt).toContain('Aim for 2 to 3 short sentences; never exceed 4 sentences.');
        expect(prompt).toContain('Prefer a direct answer pattern such as "X happens when...", "X occurs when...", or "The direct cause of X is...".');
        expect(prompt).toContain('Keep the Moon-between-Earth-and-Sun relation explicit in every variant.');
        expect(prompt).toContain('All three variants must keep the same answer-first discipline; profile differences may change support or rhythm, not whether the answer opens directly.');
        expect(prompt).toContain('Keep each full variant strong enough for answer reuse while staying between 40 and 60 words total, ideally across 2 to 3 short sentences.');
        expect(prompt).toContain('Every variant must satisfy the same core repair target; profile differences only affect style, support emphasis, or compression.');
        expect(prompt).toContain('Use plain editorial ASCII punctuation and avoid smart quotes or decorative Unicode.');
    });

    test('buildRewritePrompt uses definition-backed snippet rules for answer_sentence_concise', () => {
        const prompt = buildRewritePrompt(
            { text: 'Epilepsy is a neurological disorder that involves recurring seizures, and those seizures happen because brain activity becomes abnormal in ways that can affect movement, awareness, or sensation depending on the type and severity.' },
            {
                before: 'What is epilepsy?',
                after: '',
                full_context: 'Epilepsy is a neurological disorder that involves recurring seizures, and those seizures happen because brain activity becomes abnormal in ways that can affect movement, awareness, or sensation depending on the type and severity.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'answer_sentence_concise:0',
                    check_id: 'answer_sentence_concise',
                    check_name: 'Answer Snippet Concise',
                    analyzer_note: 'The opening answer does not stand alone as a clean reusable snippet for quoting and reuse.'
                },
                issueContext: {
                    check_id: 'answer_sentence_concise',
                    check_name: 'Answer Snippet Concise',
                    heading_chain: ['What is epilepsy?'],
                    section_text: 'Epilepsy is a neurological disorder that involves recurring seizures, and those seizures happen because brain activity becomes abnormal in ways that can affect movement, awareness, or sensation depending on the type and severity.'
                },
                rewriteTarget: {
                    mode: 'sentence',
                    operation: 'replace_span',
                    node_refs: ['block-3']
                },
                fixAssistContract: {
                    check_id: 'answer_sentence_concise',
                    check_name: 'Answer Snippet Concise',
                    repair_mode: 'rewrite',
                    issue_summary: 'The opening answer needs a cleaner snippet.'
                }
            }
        );

        expect(prompt).toContain('CHECK REPAIR STANDARD:');
        expect(prompt).toContain('Judge brevity and standalone completeness only; do not turn this repair into sourcing, trust, or claim-verification work.');
        expect(prompt).toContain('A strong reusable snippet is usually 40 to 60 words total and may span 1 to 3 short sentences.');
        expect(prompt).toContain('Threshold guidance: Pass at 40-60 words total.');
        expect(prompt).toContain('Keep each full variant between 40 and 60 words total when possible.');
        expect(prompt).not.toContain('Keep each full variant between 10 and 30 words total.');
    });

    test('buildRewritePrompt keeps clear_answer_formatting from forcing list output for simple factual answers', () => {
        const prompt = buildRewritePrompt(
            { text: 'The three states of matter are solid, liquid, and gas. They differ by how closely their particles are packed and how freely those particles move.' },
            {
                before: 'What are the three states of matter?',
                after: '',
                full_context: 'The three states of matter are solid, liquid, and gas. They differ by how closely their particles are packed and how freely those particles move.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'clear_answer_formatting:0',
                    check_id: 'clear_answer_formatting',
                    check_name: 'Clear Answer Formatting',
                    analyzer_note: 'The answer is understandable but dense.'
                },
                issueContext: {
                    check_id: 'clear_answer_formatting',
                    check_name: 'Clear Answer Formatting',
                    heading_chain: ['What are the three states of matter?'],
                    section_text: 'The three states of matter are solid, liquid, and gas. They differ by how closely their particles are packed and how freely those particles move.'
                },
                rewriteTarget: {
                    mode: 'section',
                    operation: 'replace_block',
                    node_refs: ['block-5']
                },
                fixAssistContract: {
                    check_id: 'clear_answer_formatting',
                    check_name: 'Clear Answer Formatting',
                    repair_mode: 'rewrite',
                    issue_summary: 'The answer formatting can be clearer.'
                }
            }
        );

        expect(prompt).toContain('A simple factual question can pass with one or two clear sentences when they are already easy to extract.');
        expect(prompt).toContain('Do not force list formatting when a direct sentence answer is already clean and extractable.');
        expect(prompt).toContain('Choose the clearest answer form for the question; do not force list formatting when a direct sentence answer is already easy to extract.');
    });

    test('buildRewritePrompt gives named-source repair guidance for external_authoritative_sources', () => {
        const prompt = buildRewritePrompt(
            { text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.' },
            {
                before: 'What is epilepsy?',
                after: '',
                full_context: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'external_authoritative_sources:0',
                    check_id: 'external_authoritative_sources',
                    check_name: 'Named External Source Support',
                    analyzer_note: 'The medical claim is readable but lacks a named external source close to it.'
                },
                issueContext: {
                    check_id: 'external_authoritative_sources',
                    check_name: 'Named External Source Support',
                    heading_chain: ['What is epilepsy?'],
                    section_text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.'
                },
                rewriteTarget: {
                    mode: 'section',
                    operation: 'replace_block',
                    node_refs: ['block-1']
                },
                fixAssistContract: {
                    check_id: 'external_authoritative_sources',
                    check_name: 'Named External Source Support',
                    repair_mode: 'rewrite',
                    issue_summary: 'The claim needs named source support.'
                },
                verificationResult: {
                    requested: true,
                    verification_intent: 'verify_first',
                    provider: 'duckduckgo_html',
                    status: 'support_found',
                    query: 'epilepsy seizures abnormal electrical activity brain',
                    message: 'AiVI found closely related source support for this issue.',
                    selected_results: [
                        {
                            title: 'Epilepsy basics - CDC',
                            domain: 'cdc.gov',
                            url: 'https://www.cdc.gov/epilepsy/basics/index.html',
                            snippet: 'Epilepsy is a disorder of the brain that causes recurring seizures.'
                        }
                    ],
                    all_results_count: 1
                }
            }
        );

        expect(prompt).toContain('Keep named, recognizable source support close to the claim instead of leaving support generic or distant.');
        expect(prompt).toContain('If verification finds a close authority match, you may name that source briefly near the claim.');
        expect(prompt).toContain('Keep the claim publication-ready while placing a named, recognizable source close to it when verification supplies one.');
        expect(prompt).toContain('Keep the claim tight and local; only add brief support framing or named source language when it directly helps this claim read as better grounded.');
    });

    test('buildRewritePrompt gives intro rewrite guidance for intro_wordcount', () => {
        const prompt = buildRewritePrompt(
            { text: 'This introduction spends too long circling around the topic before it arrives at the main point readers actually need.' },
            {
                before: 'Introduction',
                after: '',
                full_context: 'This introduction spends too long circling around the topic before it arrives at the main point readers actually need.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'intro_wordcount:0',
                    check_id: 'intro_wordcount',
                    check_name: 'Intro Word Count',
                    analyzer_note: 'The intro is longer than ideal for a strong reusable opening.'
                },
                issueContext: {
                    check_id: 'intro_wordcount',
                    check_name: 'Intro Word Count',
                    section_text: 'This introduction spends too long circling around the topic before it arrives at the main point readers actually need.'
                },
                rewriteTarget: {
                    mode: 'block',
                    operation: 'replace_block',
                    node_refs: ['block-1']
                },
                fixAssistContract: {
                    check_id: 'intro_wordcount',
                    check_name: 'Intro Word Count',
                    issue_summary: 'The opening needs a tighter intro.',
                    copilot_mode: 'local_rewrite',
                    repair_mode: 'rewrite'
                }
            }
        );

        expect(prompt).toContain('Keep the opening tighter, clearer, and easier to reuse without turning it into a fragment.');
        expect(prompt).toContain('Remove filler or setup that weakens the opening, but preserve factual scope.');
    });

    test('buildRewritePrompt gives structural readability guidance for heading topic fulfillment', () => {
        const prompt = buildRewritePrompt(
            { text: 'Use caching.' },
            {
                before: 'Caching Strategies',
                after: '',
                full_context: 'Use caching.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                copilotIssue: {
                    issue_key: 'heading_topic_fulfillment:0',
                    check_id: 'heading_topic_fulfillment',
                    check_name: 'Heading Topic Fulfillment',
                    analyzer_note: 'The heading promise is broader than the support paragraph below it.'
                },
                issueContext: {
                    check_id: 'heading_topic_fulfillment',
                    check_name: 'Heading Topic Fulfillment',
                    heading_chain: ['Caching Strategies'],
                    section_text: 'Use caching.'
                },
                rewriteTarget: {
                    mode: 'heading_support_range',
                    operation: 'heading_support_range',
                    node_refs: ['block-4']
                },
                fixAssistContract: {
                    check_id: 'heading_topic_fulfillment',
                    check_name: 'Heading Topic Fulfillment',
                    issue_summary: 'The support text needs to fulfill the heading more fully.',
                    copilot_mode: 'local_rewrite',
                    repair_mode: 'expand_support'
                }
            }
        );

        expect(prompt).toContain('Make the selected text easier to scan and easier to follow without changing its meaning.');
        expect(prompt).toContain('Prefer cleaner sentence flow, clearer support, and tighter transitions over generic simplification.');
        expect(prompt).toContain('Rewrite only the supporting content under the flagged heading.');
        expect(prompt).toContain('Do NOT rewrite the heading text itself.');
    });

    test('buildRewritePrompt requires plain bullet lines for convert_to_list repairs', () => {
        const prompt = buildRewritePrompt(
            { text: 'Use a laptop for research. Use note apps to organize ideas. Use online tools to track progress.' },
            {
                before: 'Helpful tools',
                after: '',
                full_context: 'Use a laptop for research. Use note apps to organize ideas. Use online tools to track progress.',
                node_type: 'core/paragraph'
            },
            'neutral',
            3,
            {
                rewriteTarget: {
                    mode: 'block',
                    operation: 'convert_to_list',
                    node_refs: ['block-7']
                },
                fixAssistContract: {
                    check_id: 'lists_tables_presence',
                    check_name: 'List Opportunity',
                    repair_mode: 'suggest_structure',
                    issue_summary: 'This section would be clearer as a list.'
                }
            }
        );

        expect(prompt).toContain('Output must be plain list lines only, not HTML tags and not a prose paragraph.');
        expect(prompt).toContain('For list repairs, "text" must be plain bullet lines such as "- Example point". Do not return HTML tags like <ul>, <ol>, or <li>.');
        expect(prompt).toContain('When the source contains 3 or more sibling ideas, return at least 3 bullet lines. Do not collapse the whole repair into one overloaded bullet.');
        expect(prompt).toContain('When the source packs 3 or more sibling ideas, return at least 3 bullet lines instead of one overloaded bullet.');
        expect(prompt).not.toContain('Output must be list-form text or list HTML');
    });

    test('buildRewritePrompt includes bounded verification context when present', () => {
        const prompt = buildRewritePrompt(
            { text: 'Epilepsy can cause irregular electrical activity in the brain.' },
            {
                before: 'What causes seizures?',
                after: 'Treatment depends on the seizure type.',
                full_context: 'Epilepsy can cause irregular electrical activity in the brain.',
                node_type: 'p'
            },
            'neutral',
            3,
            {
                repairIntent: {
                    check_id: 'claim_provenance_and_evidence',
                    check_name: 'Claim Provenance and Evidence'
                },
                fixAssistContract: {
                    check_id: 'claim_provenance_and_evidence',
                    check_name: 'Claim Provenance and Evidence',
                    repair_mode: 'tighten_claim',
                    severity: 'high',
                    rewrite_necessity: 'rewrite_needed',
                    issue_summary: 'Ground the claim more carefully.',
                    must_preserve: ['Keep the medical claim scoped to the section.'],
                    must_change: ['Improve support or narrow certainty.'],
                    do_not_invent: ['Do not fabricate sources or evidence.'],
                    tone_guard: ['Keep the tone calm and publication-ready.'],
                    scope_guard: {
                        target_mode: 'replace_span'
                    }
                },
                verificationResult: {
                    requested: true,
                    verification_intent: 'verify_first',
                    provider: 'duckduckgo_html',
                    status: 'weak_support',
                    query: 'epilepsy irregular electrical activity brain',
                    message: 'AiVI found some related source signal for this issue, but it is not strong enough to treat as proof.',
                    selected_results: [
                        {
                            title: 'Epilepsy basics - CDC',
                            domain: 'cdc.gov',
                            url: 'https://www.cdc.gov/epilepsy/index.html',
                            snippet: 'Epilepsy is a disorder of the brain that causes recurring seizures.',
                            score: 0.61
                        }
                    ],
                    all_results_count: 1
                }
            }
        );

        expect(prompt).toContain('VERIFICATION CONTEXT:');
        expect(prompt).toContain('"status":"weak_support"');
        expect(prompt).toContain('VERIFICATION RULES:');
        expect(prompt).toContain('Only mention named sources if they appear directly in the verification results.');
        expect(prompt).toContain('avoid definitive sourcing language');
    });

    test('buildRewriteSystemPrompt demotes analyzer anchors to optional hints', () => {
        const systemPrompt = buildRewriteSystemPrompt();

        expect(systemPrompt).toContain('You are AiVI Copilot, an issue-scoped editorial repair assistant.');
        expect(systemPrompt).toContain('You are not AiVI Analyzer.');
        expect(systemPrompt).toContain('Treat the repair contract and selected issue packet as the primary authority.');
        expect(systemPrompt).toContain('Use rewrite_target, node_refs, signatures, and other analyzer anchors only as optional location hints.');
        expect(systemPrompt).toContain('If verification context is present, treat it as bounded support signal, not as proof.');
        expect(systemPrompt).not.toContain('You are AiVI Rewrite Engine.');
        expect(systemPrompt).not.toContain('Follow rewrite target mode and operation strictly.');
    });

    test('rewriteHandler carries verification result through approved web-backed evidence assist', async () => {
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('html.duckduckgo.com')) {
                return {
                    ok: true,
                    text: async () => `
                        <html><body>
                            <div class="result">
                                <a class="result__a" href="https://www.cdc.gov/epilepsy/index.html">Epilepsy basics - CDC</a>
                                <div class="result__snippet">Epilepsy is a disorder of the brain that causes recurring seizures.</div>
                            </div>
                        </body></html>
                    `
                };
            }
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                variants: [
                                    {
                                        id: 1,
                                        text: 'According to the CDC, epilepsy is a brain disorder linked to recurring seizures.',
                                        explanation: 'Adds source-aware framing with careful scope.',
                                        confidence: 0.9
                                    },
                                    {
                                        id: 2,
                                        text: 'Epilepsy is a brain disorder associated with recurring seizures, according to CDC guidance.',
                                        explanation: 'Keeps the claim careful while adding a named source.',
                                        confidence: 0.87
                                    },
                                    {
                                        id: 3,
                                        text: 'CDC guidance describes epilepsy as a brain disorder that can involve recurring seizures.',
                                        explanation: 'Leads with the source signal first.',
                                        confidence: 0.85
                                    }
                                ]
                            })
                        }
                    }],
                    usage: {
                        prompt_tokens: 150,
                        completion_tokens: 90
                    }
                })
            };
        });

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-verify-1',
                verification_intent: 'verify_first',
                analysis_ref: {
                    run_id: 'run-verify-1',
                    check_id: 'claim_provenance_and_evidence',
                    instance_index: 0
                },
                issue_context: {
                    check_id: 'claim_provenance_and_evidence',
                    check_name: 'Claim Provenance and Evidence',
                    message: 'The intro provides concrete medical facts but lacks named sources or metrics to fully ground trust.',
                    node_ref: 'block-4',
                    snippet: 'Epilepsy can cause irregular electrical activity in the brain.',
                    heading_chain: ['What causes seizures?'],
                    section_text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.',
                    section_nodes: [
                        { ref: 'block-4', type: 'core/paragraph', text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.' }
                    ]
                },
                manifest: {
                    nodes: [
                        { ref: 'block-3', type: 'core/heading', text: 'What causes seizures?' },
                        { ref: 'block-4', type: 'core/paragraph', text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.' }
                    ],
                    plain_text: 'What causes seizures? Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.verification_intent).toBe('verify_first');
        expect(parsed.verification_result).toBeTruthy();
        expect(parsed.verification_result.status).toBe('support_found');
        expect(parsed.verification_result.provider).toBe('duckduckgo_html');
        expect(parsed.verification_result.selected_results[0].domain).toBe('cdc.gov');
        expect(parsed.metadata.verification_status).toBe('support_found');
        expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(global.fetch.mock.calls.some((call) => String(call[0]).includes('html.duckduckgo.com'))).toBe(true);
        expect(global.fetch.mock.calls.some((call) => String(call[0]).includes('api.mistral.ai'))).toBe(true);
        expect(mockEmitRewriteRequested).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-verify-1',
            generation_request_id: 'gen-verify-1',
            verification_intent: 'verify_first'
        }));
        expect(mockEmitRewriteCompleted).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-verify-1',
            generation_request_id: 'gen-verify-1',
            verification_intent: 'verify_first',
            verification_status: 'support_found'
        }));
        expect(mockEmitCopilotVariantsGenerated).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-verify-1',
            generation_request_id: 'gen-verify-1',
            verification_intent: 'verify_first',
            verification_status: 'support_found',
            verification_provider: 'duckduckgo_html'
        }));
    });

    test('rewriteHandler keeps evidence assist local when verification_intent is local_only', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            variants: [
                                {
                                    id: 1,
                                    text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain, with stronger support best added through a named medical source nearby.',
                                    explanation: 'Keeps the repair local and careful without inventing authority.',
                                    confidence: 0.88
                                },
                                {
                                    id: 2,
                                    text: 'Epilepsy is a brain disorder linked to recurring seizures caused by abnormal electrical activity in the brain, and this sentence leaves room for a named source to strengthen trust.',
                                    explanation: 'Improves the wording locally while reserving external verification for the consented path.',
                                    confidence: 0.86
                                },
                                {
                                    id: 3,
                                    text: 'Epilepsy is a brain disorder involving recurring seizures due to abnormal electrical activity in the brain, with the claim reading more safely until a named source is added.',
                                    explanation: 'Keeps the statement publishable and avoids fabricated evidence.',
                                    confidence: 0.84
                                }
                            ]
                        })
                    }
                }],
                usage: {
                    prompt_tokens: 140,
                    completion_tokens: 88
                }
            })
        }));

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-local-only-1',
                verification_intent: 'local_only',
                analysis_ref: {
                    run_id: 'run-local-only-1',
                    check_id: 'external_authoritative_sources',
                    instance_index: 0
                },
                issue_context: {
                    check_id: 'external_authoritative_sources',
                    check_name: 'Named External Source Support',
                    message: 'The medical claim is readable but lacks a named external source close to it.',
                    node_ref: 'block-4',
                    snippet: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.',
                    heading_chain: ['What is epilepsy?'],
                    section_text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.',
                    section_nodes: [
                        { ref: 'block-4', type: 'core/paragraph', text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.' }
                    ]
                },
                manifest: {
                    nodes: [
                        { ref: 'block-3', type: 'core/heading', text: 'What is epilepsy?' },
                        { ref: 'block-4', type: 'core/paragraph', text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.' }
                    ],
                    plain_text: 'What is epilepsy? Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.verification_intent).toBe('local_only');
        expect(parsed.verification_result).toBeNull();
        expect(parsed.metadata.verification_status).toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(String(global.fetch.mock.calls[0][0])).toContain('api.mistral.ai');
        expect(mockEmitRewriteRequested).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-local-only-1',
            generation_request_id: 'gen-local-only-1',
            verification_intent: 'local_only'
        }));
        expect(mockEmitRewriteCompleted).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-local-only-1',
            generation_request_id: 'gen-local-only-1',
            verification_intent: 'local_only',
            verification_status: null
        }));
        expect(mockEmitCopilotVariantsGenerated).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-local-only-1',
            generation_request_id: 'gen-local-only-1',
            verification_intent: 'local_only',
            verification_status: null,
            verification_provider: null
        }));
    });

    test('rewriteHandler still returns variants when verify_first times out during web verification', async () => {
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('html.duckduckgo.com')) {
                const timeoutError = new Error('The operation was aborted.');
                timeoutError.name = 'AbortError';
                throw timeoutError;
            }
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                variants: [
                                    {
                                        id: 1,
                                        text: 'Epilepsy is a brain disorder linked to recurring seizures caused by abnormal electrical activity, and this variant keeps the claim careful until a named source is added nearby.',
                                        explanation: 'Calm local rewrite after verification timeout.',
                                        confidence: 0.87
                                    },
                                    {
                                        id: 2,
                                        text: 'Epilepsy involves recurring seizures caused by abnormal electrical activity in the brain, with the wording kept careful while source support is still being added.',
                                        explanation: 'Keeps the wording safe after the web check times out.',
                                        confidence: 0.84
                                    },
                                    {
                                        id: 3,
                                        text: 'Epilepsy can involve recurring seizures caused by abnormal electrical activity in the brain, and this version avoids stronger sourcing claims for now.',
                                        explanation: 'Local fallback variant after unavailable verification.',
                                        confidence: 0.82
                                    }
                                ]
                            })
                        }
                    }],
                    usage: {
                        prompt_tokens: 142,
                        completion_tokens: 92
                    }
                })
            };
        });

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-verify-timeout-1',
                verification_intent: 'verify_first',
                analysis_ref: {
                    run_id: 'run-verify-timeout-1',
                    check_id: 'external_authoritative_sources',
                    instance_index: 0
                },
                issue_context: {
                    check_id: 'external_authoritative_sources',
                    check_name: 'Named External Source Support',
                    message: 'The medical claim is readable but lacks a named external source close to it.',
                    node_ref: 'block-4',
                    snippet: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.',
                    heading_chain: ['What is epilepsy?'],
                    section_text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.',
                    section_nodes: [
                        { ref: 'block-4', type: 'core/paragraph', text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.' }
                    ]
                },
                manifest: {
                    nodes: [
                        { ref: 'block-3', type: 'core/heading', text: 'What is epilepsy?' },
                        { ref: 'block-4', type: 'core/paragraph', text: 'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.' }
                    ],
                    plain_text: 'What is epilepsy? Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.'
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(Array.isArray(parsed.variants)).toBe(true);
        expect(parsed.variants).toHaveLength(3);
        expect(parsed.verification_intent).toBe('verify_first');
        expect(parsed.verification_result).toBeTruthy();
        expect(parsed.verification_result.status).toBe('verification_unavailable');
        expect(parsed.verification_result.timed_out).toBe(true);
        expect(parsed.verification_result.error_reason).toBe('timeout');
        expect(parsed.metadata.verification_status).toBe('verification_unavailable');
        expect(parsed.metadata.verification_timed_out).toBe(true);
        expect(parsed.metadata.verification_timeout_ms).toBe(12000);
        expect(mockEmitRewriteCompleted).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-verify-timeout-1',
            generation_request_id: 'gen-verify-timeout-1',
            verification_intent: 'verify_first',
            verification_status: 'verification_unavailable',
            verification_timed_out: true
        }));
        expect(mockEmitCopilotVariantsGenerated).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-verify-timeout-1',
            generation_request_id: 'gen-verify-timeout-1',
            verification_intent: 'verify_first',
            verification_status: 'verification_unavailable',
            verification_timed_out: true
        }));
    });

    test('rewriteHandler exposes preservation warnings without falling back when literals are missing', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            variants: [
                                {
                                    id: 1,
                                    text: 'This release improves editor performance and cleanup across the interface.',
                                    explanation: 'Tighter rewrite.',
                                    confidence: 0.74
                                },
                                {
                                    id: 2,
                                    text: 'The update improves the editing experience with cleaner performance changes.',
                                    explanation: 'Balanced rewrite.',
                                    confidence: 0.72
                                },
                                {
                                    id: 3,
                                    text: 'Editor performance is improved across the experience in this release.',
                                    explanation: 'Compact rewrite.',
                                    confidence: 0.7
                                }
                            ]
                        })
                    }
                }],
                usage: {
                    prompt_tokens: 120,
                    completion_tokens: 90
                }
            })
        }));

        const event = {
            headers: {
                'X-AIVI-Account-Id': 'acct_123',
                'X-AIVI-Site-Id': 'site_123'
            },
            body: JSON.stringify({
                generation_request_id: 'gen-validation-detail-1',
                analysis_ref: {
                    run_id: 'run-validation-detail-1',
                    check_id: 'intro_factual_entities',
                    instance_index: 0
                },
                suggestion: {
                    text: 'WordPress 6.9 shipped on March 29, 2026 with 3 improvements.'
                },
                rewrite_target: {
                    mode: 'block',
                    operation: 'replace_span'
                },
                issue_context: {
                    check_id: 'intro_factual_entities',
                    check_name: 'Intro Factual Entities',
                    snippet: 'WordPress 6.9 shipped on March 29, 2026 with 3 improvements.'
                },
                manifest: {
                    nodes: [
                        { ref: 'block-1', type: 'core/paragraph', text: 'WordPress 6.9 shipped on March 29, 2026 with 3 improvements.' }
                    ],
                    plain_text: 'WordPress 6.9 shipped on March 29, 2026 with 3 improvements.'
                },
                fix_assist_contract: {
                    check_id: 'intro_factual_entities',
                    repair_mode: 'rewrite',
                    preservation_literals: {
                        numbers: ['6.9', '29', '2026', '3'],
                        dates: ['March 29, 2026'],
                        entities: ['WordPress']
                    },
                    preservation_literal_details: [
                        { value: '6.9', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                        { value: '29', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                        { value: '2026', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                        { value: '3', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                        { value: 'March 29, 2026', literal_class: 'date', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                        { value: 'WordPress', literal_class: 'entity', source_type: 'issue_packet', source_field: 'issue_context.snippet' }
                    ]
                }
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(parsed.metadata.validator_pass).toBe(true);
        expect(parsed.metadata.fallback_used).toBe(false);
        expect(parsed.metadata.validation_reason).toBe('ok');
        expect(parsed.metadata.validation_rule).toBe('ok');
        expect(parsed.metadata.validation_details).toEqual(expect.objectContaining({
            validator_rule: 'ok',
            preservation_warnings: expect.arrayContaining([
                expect.objectContaining({
                    variant_index: 0,
                    missing_literals: expect.arrayContaining([
                        expect.objectContaining({
                            value: 'WordPress',
                            literal_class: 'entity',
                            source_type: 'issue_packet'
                        })
                    ])
                })
            ])
        }));
        expect(mockEmitRewriteCompleted).toHaveBeenCalledWith(expect.objectContaining({
            run_id: 'run-validation-detail-1',
            validation_rule: 'ok',
            fallback_reason: null
        }));
    });

    test('validateVariantsForTarget rejects prose output for convert_to_list operation', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'This remains a paragraph without bullet formatting.' },
                { text: 'Another prose paragraph that does not form a list.' },
                { text: 'Still not a list output.' }
            ],
            { mode: 'block', operation: 'convert_to_list' },
            'First compare speed. Then compare cost.'
        );

        expect(validation.valid).toBe(false);
        expect(validation.reason).toBe('convert_to_list_requires_list_output');
    });

    test('buildSafeFallbackVariants emits list-form fallback for convert_to_list', () => {
        const variants = buildSafeFallbackVariants(
            { text: 'Compare speed. Compare cost. Compare maintenance effort.' },
            3,
            { mode: 'block', operation: 'convert_to_list' },
            'convert_to_list_requires_list_output'
        );

        expect(Array.isArray(variants)).toBe(true);
        expect(variants.length).toBe(3);
        variants.forEach((variant) => {
            expect(typeof variant.text).toBe('string');
            expect(variant.text).toMatch(/^- /m);
            expect(variant.fallback_reason).toBe('convert_to_list_requires_list_output');
        });
    });

    test('buildSafeFallbackVariants expands comma-series prose into multiple bullet lines for convert_to_list', () => {
        const variants = buildSafeFallbackVariants(
            { text: 'The biggest mistake beginners make is ignoring competition, refunds, shipping delays, supplier quality, ad fatigue, return policies, compliance, taxes, brand building, customer trust, and product-market fit.' },
            1,
            { mode: 'block', operation: 'convert_to_list' },
            'structural_output_too_thin'
        );

        expect(variants).toHaveLength(1);
        const lines = variants[0].text.split('\n').map((line) => line.trim()).filter(Boolean);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        lines.forEach((line) => {
            expect(line).toMatch(/^- /);
        });
        expect(variants[0].fallback_reason).toBe('structural_output_too_thin');
    });

    test('parseRewriteResponse normalizes HTML list markup into plain bullet lines for convert_to_list', () => {
        const variants = parseRewriteResponse(JSON.stringify({
            variants: [
                {
                    id: 1,
                    label: 'Most concise',
                    text: '<ul><li>Use a laptop to keep research material in one place.</li><li>Use note apps to organize ideas.</li></ul>',
                    explanation: 'Turns the prose into a clean list.',
                    confidence: 0.9
                },
                {
                    id: 2,
                    label: 'Balanced',
                    text: '<ul><li>Keep research material on a laptop for easier access.</li><li>Track ideas with note apps.</li></ul>',
                    explanation: 'Balanced list rewrite.',
                    confidence: 0.86
                },
                {
                    id: 3,
                    label: 'Evidence-first',
                    text: '<ul><li>Centralize research materials on one device.</li><li>Use apps to keep notes organized.</li></ul>',
                    explanation: 'Keeps the same meaning in list form.',
                    confidence: 0.84
                }
            ]
        }), 3, {
            mode: 'block',
            operation: 'convert_to_list'
        });

        expect(variants[0].text).toBe('- Use a laptop to keep research material in one place.\n- Use note apps to organize ideas.');
        expect(variants[0].text).not.toContain('<ul>');
        expect(variants[1].text).toContain('- Keep research material on a laptop for easier access.');
        expect(variants[2].text).toContain('- Centralize research materials on one device.');
    });

    test('validateVariantsForTarget rejects non-step output for convert_to_steps operation', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'This remains prose and does not provide explicit steps.' },
                { text: 'Still paragraph style without sequence markers.' },
                { text: 'No step formatting here either.' }
            ],
            { mode: 'section', operation: 'convert_to_steps' },
            'Explain process with clear steps.'
        );

        expect(validation.valid).toBe(false);
        expect(validation.reason).toBe('convert_to_steps_requires_step_output');
    });

    test('validateVariantsForTarget rejects no-op structural rewrites', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'Rewrite this support paragraph to be clearer and more actionable.' },
                { text: 'Rewrite this support paragraph to be clearer and more actionable.' },
                { text: 'Rewrite this support paragraph to be clearer and more actionable.' }
            ],
            { mode: 'section', operation: 'replace_block' },
            'Rewrite this support paragraph to be clearer and more actionable.'
        );

        expect(validation.valid).toBe(false);
        expect(validation.reason).toBe('structural_no_effect_rewrite');
    });

    test('validateVariantsForTarget allows compact answer-first rewrites for immediate answer placement', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'A solar eclipse happens when the Moon passes between Earth and the Sun, blocking some or all of the Sun from view. This only happens when those bodies align precisely despite their constant motion and the Moon\'s tilted orbit.' },
                { text: 'A solar eclipse occurs when the Moon moves between Earth and the Sun and blocks part or all of the Sun from view. The alignment is uncommon because the Earth, Moon, and Sun must line up precisely while the Moon\'s orbit remains tilted relative to Earth.' },
                { text: 'The direct cause of a solar eclipse is the Moon passing between Earth and the Sun and blocking the Sun from view. That only happens when their orbital positions line up precisely, even though the Moon\'s path is tilted relative to Earth.' }
            ],
            { mode: 'section', operation: 'replace_block' },
            'Solar eclipses happen for a number of reasons tied to orbital motion, observation position, and the relationship between the Earth, Moon, and Sun. Because these bodies move continuously and because the Moon\'s path is tilted relative to Earth\'s orbit, the exact geometry has to line up very precisely. When that alignment happens, the Moon passes between Earth and the Sun, blocking all or part of the Sun from view.',
            {
                check_id: 'immediate_answer_placement',
                repair_mode: 'rewrite',
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: ['Solar', 'Earth', 'Moon', 'Sun']
                }
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
    });

    test('validateVariantsForTarget records preservation warnings instead of rejecting variants that drop preserved literals', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'This release improves performance across the editor.' },
                { text: 'Performance is improved with a cleaner workflow.' },
                { text: 'The update makes the product faster overall.' }
            ],
            { mode: 'block', operation: 'replace_span' },
            'WordPress 6.9 shipped on March 29, 2026 with 3 improvements.',
            {
                preservation_literals: {
                    numbers: ['6.9', '29', '2026', '3'],
                    dates: ['March 29, 2026'],
                    entities: ['WordPress']
                },
                preservation_literal_details: [
                    { value: '6.9', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: '29', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: '2026', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: '3', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: 'March 29, 2026', literal_class: 'date', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: 'WordPress', literal_class: 'entity', source_type: 'issue_packet', source_field: 'issue_context.snippet' }
                ]
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'ok'
        }));
        expect(validation.details.preservation_warnings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                variant_index: 0,
                missing_literals: expect.arrayContaining([
                    expect.objectContaining({
                        value: 'WordPress',
                        literal_class: 'entity',
                        source_type: 'issue_packet'
                    }),
                    expect.objectContaining({
                        value: 'March 29, 2026',
                        literal_class: 'date',
                        source_type: 'issue_packet'
                    })
                ])
            })
        ]));
    });

    test('validateVariantsForTarget reports literal source and class as preservation warnings for evidence-style rewrites', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'The claim needs stronger support before publication.' },
                { text: 'Add more support so the section feels more credible.' },
                { text: 'This section should be narrowed because it lacks evidence.' }
            ],
            { mode: 'section', operation: 'replace_span' },
            'According to the CDC, about 6 in 10 adults in the United States have a chronic disease.',
            {
                check_id: 'external_authoritative_sources',
                repair_mode: 'web_backed_evidence_assist',
                preservation_literals: {
                    numbers: ['6', '10'],
                    dates: [],
                    entities: ['CDC', 'United States']
                },
                preservation_literal_details: [
                    { value: '6', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: '10', literal_class: 'number', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: 'CDC', literal_class: 'entity', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: 'United States', literal_class: 'entity', source_type: 'issue_packet', source_field: 'issue_context.snippet' }
                ]
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'ok'
        }));
        expect(validation.details.preservation_warnings[0]).toEqual(expect.objectContaining({
            variant_index: 0,
            missing_literals: expect.arrayContaining([
                expect.objectContaining({
                    value: 'CDC',
                    literal_class: 'entity',
                    source_type: 'issue_packet'
                }),
                expect.objectContaining({
                    value: '6',
                    literal_class: 'number',
                    source_type: 'issue_packet'
                })
            ])
        }));
    });

    test('validateVariantsForTarget exempts invented numeric claims for verified evidence rewrites with support', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'The CDC reports that 6 in 10 adults in the United States have a chronic disease.' },
                { text: 'According to the CDC, 6 in 10 adults in the United States live with a chronic disease.' },
                { text: 'CDC data shows that 6 in 10 adults in the United States have a chronic disease.' }
            ],
            { mode: 'section', operation: 'replace_span' },
            'This section needs named source support before publication.',
            {
                check_id: 'external_authoritative_sources',
                repair_mode: 'web_backed_evidence_assist',
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: []
                }
            },
            {
                verification_intent: 'verify_first',
                verification_result: {
                    status: 'support_found',
                    provider: 'duckduckgo_html',
                    elapsed_ms: 900,
                    timeout_ms: 12000,
                    timed_out: false
                }
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'ok',
            validator_exemptions: expect.arrayContaining([
                'invented_numeric_claim_verified_evidence'
            ])
        }));
    });

    test('validateVariantsForTarget keeps invented numeric claims blocked for local-only evidence rewrites', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'The CDC reports that 6 in 10 adults in the United States have a chronic disease.' },
                { text: 'According to the CDC, 6 in 10 adults in the United States live with a chronic disease.' },
                { text: 'CDC data shows that 6 in 10 adults in the United States have a chronic disease.' }
            ],
            { mode: 'section', operation: 'replace_span' },
            'This section needs named source support before publication.',
            {
                check_id: 'external_authoritative_sources',
                repair_mode: 'web_backed_evidence_assist',
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: []
                }
            },
            {
                verification_intent: 'local_only',
                verification_result: null
            }
        );

        expect(validation.valid).toBe(false);
        expect(validation.reason).toBe('repair_contract_invented_numeric_claim');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'invented_numeric_claim'
        }));
    });

    test('validateVariantsForTarget downgrades structural no-op rewrites to warnings for verified evidence rewrites with support', () => {
        const unchangedEvidenceBlock = 'This section needs stronger support before publication because the current health claim still lacks a named authority or source framing.';
        const validation = validateVariantsForTarget(
            [
                { text: unchangedEvidenceBlock },
                { text: unchangedEvidenceBlock },
                { text: unchangedEvidenceBlock }
            ],
            { mode: 'section', operation: 'replace_block' },
            unchangedEvidenceBlock,
            {
                check_id: 'claim_provenance_and_evidence',
                repair_mode: 'web_backed_evidence_assist',
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: []
                }
            },
            {
                verification_intent: 'verify_first',
                verification_result: {
                    status: 'support_found',
                    provider: 'duckduckgo_html',
                    elapsed_ms: 800,
                    timeout_ms: 12000,
                    timed_out: false
                }
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'ok',
            validator_warnings: expect.arrayContaining([
                expect.objectContaining({
                    validator_rule: 'structural_no_effect_rewrite',
                    downgraded_for: 'verified_evidence_support'
                })
            ])
        }));
    });

    test('validateVariantsForTarget downgrades thin structural output to warnings for verified evidence rewrites with support', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'Add a named source for this claim.' },
                { text: 'Name the source for this claim.' },
                { text: 'Support this claim with a named source.' }
            ],
            { mode: 'section', operation: 'replace_block' },
            'This section makes a broad factual claim about health outcomes and currently needs stronger source framing before publication.',
            {
                check_id: 'claim_provenance_and_evidence',
                repair_mode: 'web_backed_evidence_assist',
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: []
                }
            },
            {
                verification_intent: 'verify_first',
                verification_result: {
                    status: 'support_found',
                    provider: 'duckduckgo_html',
                    elapsed_ms: 820,
                    timeout_ms: 12000,
                    timed_out: false
                }
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'ok',
            validator_warnings: expect.arrayContaining([
                expect.objectContaining({
                    validator_rule: 'structural_output_too_thin',
                    downgraded_for: 'verified_evidence_support'
                })
            ])
        }));
    });

    test('validateVariantsForTarget keeps scope-breaking rewrites blocked for verified evidence rewrites with support', () => {
        const longVariant = 'According to the CDC, 6 in 10 adults in the United States have a chronic disease, and this broad summary now expands into a long explanation that keeps adding support, interpretation, and framing well beyond the local span that was supposed to be repaired in place for this sentence-level rewrite.';
        const validation = validateVariantsForTarget(
            [
                { text: longVariant },
                { text: longVariant },
                { text: longVariant }
            ],
            { mode: 'section', operation: 'replace_span' },
            'This claim needs source support.',
            {
                check_id: 'external_authoritative_sources',
                repair_mode: 'web_backed_evidence_assist',
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: []
                }
            },
            {
                verification_intent: 'verify_first',
                verification_result: {
                    status: 'support_found',
                    provider: 'duckduckgo_html',
                    elapsed_ms: 840,
                    timeout_ms: 12000,
                    timed_out: false
                }
            }
        );

        expect(validation.valid).toBe(false);
        expect(validation.reason).toBe('replace_span_scope_too_wide');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'replace_span_scope_too_wide'
        }));
    });

    test('validateVariantsForTarget ignores heading-only preservation literals for answer-first rewrites', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'The three main résumé formats are chronological, functional, and combination. Reverse-chronological résumés are often easiest for employers to scan quickly.' },
                { text: 'The main résumé formats are chronological, functional, and combination. A reverse-chronological layout is often the clearest choice when you want employers to scan your experience quickly.' },
                { text: 'Chronological, functional, and combination are the three main résumé formats. Reverse-chronological résumés are often the most straightforward for employers to review.' }
            ],
            { mode: 'section', operation: 'replace_span' },
            'Now, the three main résumé formats are chronological, functional, and combination. Chronological résumés list work experience in reverse-chronological order.',
            {
                check_id: 'immediate_answer_placement',
                repair_mode: 'rewrite',
                preservation_literals: {
                    numbers: ['2023'],
                    dates: ['2023'],
                    entities: ['Chronological', 'Best Format']
                },
                preservation_literal_details: [
                    { value: '2023', literal_class: 'number', source_type: 'heading_chain', source_field: 'section_context.heading_chain' },
                    { value: '2023', literal_class: 'date', source_type: 'heading_chain', source_field: 'section_context.heading_chain' },
                    { value: 'Chronological', literal_class: 'entity', source_type: 'issue_packet', source_field: 'issue_context.snippet' },
                    { value: 'Best Format', literal_class: 'entity', source_type: 'heading_chain', source_field: 'section_context.heading_chain' }
                ]
            }
        );

        expect(validation.valid).toBe(true);
        expect(validation.reason).toBe('ok');
        expect(validation.details.required_literal_details).toEqual(expect.arrayContaining([
            expect.objectContaining({
                value: 'Chronological',
                literal_class: 'entity',
                source_type: 'issue_packet'
            })
        ]));
        expect(validation.details.required_literal_details).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                value: '2023'
            }),
            expect.objectContaining({
                value: 'Best Format'
            })
        ]));
    });

    test('validateVariantsForTarget rejects invented numeric claims when the source has none', () => {
        const validation = validateVariantsForTarget(
            [
                { text: 'This adds 3 new methods for handling the problem.' },
                { text: 'You now get 2 stronger options for the section.' },
                { text: 'The rewrite introduces 4 supporting claims.' }
            ],
            { mode: 'block', operation: 'replace_block' },
            'Support paragraph text without any numbers.',
            {
                preservation_literals: {
                    numbers: [],
                    dates: [],
                    entities: []
                }
            }
        );

        expect(validation.valid).toBe(false);
        expect(validation.reason).toBe('repair_contract_invented_numeric_claim');
        expect(validation.details).toEqual(expect.objectContaining({
            validator_rule: 'invented_numeric_claim'
        }));
    });
});
