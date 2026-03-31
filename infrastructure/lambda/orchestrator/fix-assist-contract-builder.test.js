const { buildFixAssistContract, __testHooks } = require('./fix-assist-contract-builder');

describe('fix assist contract builder', () => {
    test('builds a heading-support contract with scoped expansion rules', () => {
        const contract = buildFixAssistContract({
            suggestion: { text: 'Thin support paragraph.' },
            manifest: {
                title: 'Caching Guide',
                block_map: [
                    { node_ref: 'block-1', block_type: 'core/heading', text: 'Caching Strategies' },
                    { node_ref: 'block-2', block_type: 'core/paragraph', text: 'Thin support paragraph.' }
                ],
                plain_text: 'Caching Strategies Thin support paragraph.'
            },
            analysisRef: { check_id: 'heading_topic_fulfillment' },
            rewriteTarget: {
                actionable: true,
                mode: 'heading_support_range',
                operation: 'append_support',
                anchor_node_ref: 'block-1',
                primary_repair_node_ref: 'block-2',
                repair_node_refs: ['block-2'],
                section_start_node_ref: 'block-1',
                section_end_node_ref: 'block-2',
                boundary_type: 'pseudo_heading'
            },
            repairIntent: {
                check_id: 'heading_topic_fulfillment',
                check_name: 'Heading Topic Fulfillment',
                must_preserve: ['Keep the section intent.'],
                must_change: ['Add concrete support below the heading.']
            },
            issueContext: {
                check_id: 'heading_topic_fulfillment',
                check_name: 'Heading Topic Fulfillment',
                message: 'The heading promise is not fully supported.',
                heading_chain: ['Caching Strategies'],
                section_text: 'Caching Strategies\n\nThin support paragraph.',
                section_range: { start_ref: 'block-1', end_ref: 'block-2', node_count: 2 },
                section_nodes: [{ ref: 'block-1' }, { ref: 'block-2' }]
            },
            fixAssistTriage: { state: 'rewrite_needed', summary: 'This section likely needs a rewrite before publication.' }
        });

        expect(contract.check_id).toBe('heading_topic_fulfillment');
        expect(contract.copilot_mode).toBe('structural_transform');
        expect(contract.repair_mode).toBe('expand_support');
        expect(contract.rewrite_necessity).toBe('rewrite_needed');
        expect(contract.scope_guard.primary_repair_node_ref).toBe('block-2');
        expect(contract.scope_guard.boundary_type).toBe('pseudo_heading');
        expect(contract.must_preserve).toContain('Keep the heading text and section promise intact.');
        expect(contract.must_change).toContain('Strengthen the supporting text under the heading.');
    });

    test('builds a no-change contract for an already extractible answer', () => {
        const contract = buildFixAssistContract({
            suggestion: { text: 'The three states of matter are solid, liquid, and gas.' },
            analysisRef: { check_id: 'clear_answer_formatting' },
            rewriteTarget: {
                actionable: true,
                mode: 'block',
                operation: 'convert_to_list',
                primary_repair_node_ref: 'block-7',
                repair_node_refs: ['block-7']
            },
            repairIntent: {
                check_id: 'clear_answer_formatting',
                check_name: 'Clear Answer Formatting',
                must_preserve: ['Keep the direct answer intact.'],
                must_change: ['Only restructure if it materially improves scanability.']
            },
            issueContext: {
                check_id: 'clear_answer_formatting',
                check_name: 'Clear Answer Formatting',
                message: 'List formatting could improve scanability.',
                heading_chain: ['What are the three states of matter?']
            },
            fixAssistTriage: {
                state: 'leave_as_is',
                summary: 'This section is already clear and extractible. I would keep it as-is unless you want a different presentation style.'
            }
        });

        expect(contract.copilot_mode).toBe('structural_transform');
        expect(contract.repair_mode).toBe('no_change_recommended');
        expect(contract.rewrite_necessity).toBe('leave_as_is');
        expect(contract.severity).toBe('none');
    });

    test('builds a web-backed evidence assist contract for trust-source gaps', () => {
        const contract = buildFixAssistContract({
            analysisRef: { check_id: 'external_authoritative_sources' },
            issueContext: {
                check_id: 'external_authoritative_sources',
                check_name: 'External Authoritative Sources',
                message: 'The intro provides concrete facts but lacks named sources.',
                heading_chain: ['What causes seizures?'],
                section_text: 'Seizures happen when brain cells send irregular signals.'
            },
            fixAssistTriage: {
                state: 'structural_guidance_only',
                copilot_mode: 'web_backed_evidence_assist',
                requires_web_consent: true,
                summary: 'This issue needs stronger support, provenance, or source framing more than a plain local rewrite.'
            }
        });

        expect(contract.copilot_mode).toBe('web_backed_evidence_assist');
        expect(contract.requires_web_consent).toBe(true);
        expect(contract.repair_mode).toBe('web_backed_evidence_assist');
    });

    test('extracts preservation literals for numbers, dates, and named entities', () => {
        const literals = {
            numbers: __testHooks.extractNumberLiterals('WordPress 6.9 shipped on March 29, 2026 with 3 improvements.'),
            dates: __testHooks.extractDateLiterals('WordPress 6.9 shipped on March 29, 2026 with 3 improvements.'),
            entities: __testHooks.extractEntityLiterals('WordPress 6.9 shipped on March 29, 2026.', ['Google Search'])
        };

        expect(literals.numbers).toEqual(expect.arrayContaining(['6.9', '29', '2026', '3']));
        expect(literals.dates).toEqual(expect.arrayContaining(['March 29, 2026', '2026']));
        expect(literals.entities).toEqual(expect.arrayContaining(['WordPress', 'Google Search']));
    });

    test('builds preservation literal details with source tags for snippet and heading inputs', () => {
        const details = __testHooks.buildPreservationLiteralDetails({
            snippetText: 'WordPress 6.9 shipped on March 29, 2026 with 3 improvements.',
            snippetSourceMeta: {
                source_type: 'issue_packet',
                source_field: 'issue_context.snippet'
            },
            headingChain: ['What changed in WordPress 6.9 in 2026?']
        });

        expect(details).toEqual(expect.arrayContaining([
            expect.objectContaining({
                value: 'WordPress',
                literal_class: 'entity',
                source_type: 'issue_packet',
                source_field: 'issue_context.snippet'
            }),
            expect.objectContaining({
                value: 'March 29, 2026',
                literal_class: 'date',
                source_type: 'issue_packet',
                source_field: 'issue_context.snippet'
            }),
            expect.objectContaining({
                value: '2026',
                literal_class: 'number',
                source_type: 'heading_chain',
                source_field: 'section_context.heading_chain'
            })
        ]));
    });

    test('does not freeze capitalized sentence starters as preservation entities for immediate-answer rewrites', () => {
        const contract = buildFixAssistContract({
            suggestion: {
                text: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.'
            },
            analysisRef: { check_id: 'immediate_answer_placement' },
            rewriteTarget: {
                actionable: true,
                mode: 'section',
                operation: 'replace_block',
                primary_repair_node_ref: 'block-1',
                repair_node_refs: ['block-1']
            },
            repairIntent: {
                check_id: 'immediate_answer_placement',
                check_name: 'Immediate Answer Placement',
                must_change: ['Move the direct answer closer to the opening of the target section.']
            },
            issueContext: {
                check_id: 'immediate_answer_placement',
                check_name: 'Immediate Answer Placement',
                message: 'The section reaches the answer only after setup instead of leading with it.',
                heading_chain: ['What causes a solar eclipse?'],
                section_text: 'Solar eclipses happen for a number of reasons tied to orbital motion and alignment before the Moon passes between Earth and the Sun.'
            },
            fixAssistTriage: {
                state: 'rewrite_needed',
                summary: 'This section likely needs a rewrite before publication.'
            }
        });

        expect(contract.preservation_literals.entities).toEqual(expect.arrayContaining(['Solar', 'Earth', 'Moon', 'Sun']));
        expect(contract.preservation_literals.entities).not.toEqual(expect.arrayContaining(['Because', 'When', 'What']));
        expect(contract.preservation_literal_details).toEqual(expect.arrayContaining([
            expect.objectContaining({
                value: 'Solar',
                literal_class: 'entity',
                source_type: 'analyzer_text'
            })
        ]));
    });

    test('filters weak sentence openers and heading fragments out of hard-preserve entities', () => {
        const immediateLiterals = __testHooks.extractEntityLiterals(
            'Now, the three main résumé formats are chronological, functional, and combination. Chronological résumés list work experience in reverse-chronological order.',
            ['What is the Best Format for a Résumé in 2023?']
        );
        const introLiterals = __testHooks.extractEntityLiterals(
            "Keeping up with modern skills is essential for getting ahead next year. Whether you're just starting out or already have experience, this post will help you stay ahead of the game.",
            []
        );

        expect(immediateLiterals).toEqual(expect.arrayContaining(['Chronological']));
        expect(immediateLiterals).not.toEqual(expect.arrayContaining(['Now', 'Best Format']));
        expect(introLiterals).not.toEqual(expect.arrayContaining(['Keeping', 'Whether']));
    });
});
