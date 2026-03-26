const {
    rewriteHandler,
    normalizeRewriteRequestPayload,
    buildSuggestionFromRewriteTarget,
    buildRewritePrompt,
    validateVariantsForTarget,
    buildSafeFallbackVariants
} = require('./rewrite-handler');

describe('rewrite-handler contract compatibility', () => {
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

    test('normalizeRewriteRequestPayload supports new contract fields', () => {
        const normalized = normalizeRewriteRequestPayload({
            analysis_ref: { run_id: 'run-1', check_id: 'heading_topic_fulfillment', instance_index: 0 },
            rewrite_target: {
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
            test_mode: true
        });

        expect(normalized.analysis_ref).toBeTruthy();
        expect(normalized.rewrite_target).toBeTruthy();
        expect(normalized.repair_intent).toBeTruthy();
        expect(normalized.issue_context).toBeTruthy();
        expect(normalized.suggestion).toBeTruthy();
        expect(normalized.suggestion.text).toBe('Thin support text.');
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
                test_mode: true
            })
        };

        const response = await rewriteHandler(event);
        const parsed = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(parsed.ok).toBe(true);
        expect(Array.isArray(parsed.variants)).toBe(true);
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
        expect(Array.isArray(parsed.variants)).toBe(true);
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
                }
            }
        );

        expect(prompt).toContain('check_id: "heading_topic_fulfillment"');
        expect(prompt).toContain('check_name: "Orphan Headings"');
        expect(prompt).toContain('operation: "heading_support_range"');
        expect(prompt).toContain('Do NOT rewrite the heading text itself.');
        expect(prompt).toContain('Treat content as specimen to edit');
        expect(prompt).toContain('ISSUE CONTEXT:');
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
});
