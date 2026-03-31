const { resolveRewriteTarget, __testHooks } = require('./rewrite-target-resolver');

describe('rewrite-target-resolver', () => {
    const originalSectionFirstFlag = process.env.REWRITE_SECTION_FIRST_V1;

    afterEach(() => {
        if (typeof originalSectionFirstFlag === 'undefined') {
            delete process.env.REWRITE_SECTION_FIRST_V1;
        } else {
            process.env.REWRITE_SECTION_FIRST_V1 = originalSectionFirstFlag;
        }
    });

    test('resolves orphan heading to supporting content range', () => {
        const checkDetails = {
            check_id: 'heading_topic_fulfillment',
            name: 'Orphan Headings',
            explanation: 'Heading lacks semantic support.',
            candidate_highlights: [
                {
                    scope: 'span',
                    snippet: 'Caching Strategies',
                    quote: {
                        exact: 'Caching Strategies'
                    }
                }
            ]
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-0', block_type: 'core/heading', text: 'Caching Strategies' },
                { node_ref: 'block-1', block_type: 'core/paragraph', text: 'Use caching.' },
                { node_ref: 'block-2', block_type: 'core/paragraph', text: 'It improves repeat-load latency and extractability for answers.' },
                { node_ref: 'block-3', block_type: 'core/heading', text: 'Image Optimization' },
                { node_ref: 'block-4', block_type: 'core/paragraph', text: 'Compress images.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'heading_topic_fulfillment',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('heading_support_range');
        expect(resolved.rewrite_target.heading_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.anchor_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.primary_repair_node_ref).toBe('block-1');
        expect(resolved.rewrite_target.repair_node_refs).toEqual(['block-1', 'block-2']);
        expect(resolved.rewrite_target.node_refs).toEqual(['block-1', 'block-2']);
        expect(resolved.rewrite_target.section_start_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.section_end_node_ref).toBe('block-2');
        expect(resolved.rewrite_target.boundary_type).toBe('heading');
        expect(resolved.rewrite_target.boundary_node_ref).toBe('block-3');
        expect(resolved.rewrite_target.scope_confidence).toBeCloseTo(0.9, 5);
        expect(resolved.rewrite_target.target_text).toContain('Use caching.');
        expect(resolved.rewrite_target.target_text).not.toContain('Caching Strategies');
        expect(resolved.repair_intent.instruction).toMatch(/supporting content/i);
    });

    test('resolves inline span target for regular AI check', () => {
        const checkDetails = {
            check_id: 'claim_pattern_detection',
            name: 'Claim Pattern Detection',
            explanation: 'Claim is unsupported.',
            focused_highlight: {
                node_ref: 'block-7',
                snippet: 'Studies show 10000% improvement overnight',
                start: 12,
                end: 53
            }
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-7', block_type: 'core/paragraph', text: 'Studies show 10000% improvement overnight in every case.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'claim_pattern_detection',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('inline_span');
        expect(resolved.rewrite_target.primary_node_ref).toBe('block-7');
        expect(resolved.rewrite_target.anchor_node_ref).toBe('block-7');
        expect(resolved.rewrite_target.primary_repair_node_ref).toBe('block-7');
        expect(resolved.rewrite_target.repair_node_refs).toEqual(['block-7']);
        expect(resolved.rewrite_target.operation).toBe('replace_span');
        expect(resolved.rewrite_target.start).toBe(12);
        expect(resolved.rewrite_target.end).toBe(53);
    });

    test('returns non-actionable target when manifest nodes unavailable', () => {
        const checkDetails = {
            check_id: 'claim_pattern_detection',
            name: 'Claim Pattern Detection',
            explanation: 'Unsupported claim detected.',
            candidate_highlights: [
                { snippet: 'Studies show 10000% improvement' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'claim_pattern_detection',
            checkDetails,
            manifest: {},
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(false);
        expect(resolved.rewrite_target.resolver_reason).toBe('manifest_nodes_unavailable');
        expect(resolved.repair_intent).toHaveProperty('check_id', 'claim_pattern_detection');
    });

    test('resolves evidence-assist checks as actionable local section targets', () => {
        const checkDetails = {
            check_id: 'external_authoritative_sources',
            name: 'External Authoritative Sources',
            explanation: 'Missing authoritative citation.',
            highlights: [
                {
                    node_ref: 'block-4',
                    snippet: 'This claim has no source.'
                }
            ]
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-4', block_type: 'core/paragraph', text: 'This claim has no source.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'external_authoritative_sources',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('section');
        expect(resolved.rewrite_target.operation).toBe('replace_block');
        expect(resolved.rewrite_target.primary_node_ref).toBe('block-4');
        expect(resolved.rewrite_target.resolver_reason).toBe('section_resolved');
    });

    test('resolves lists_tables_presence as structural convert_to_list rewrite', () => {
        const checkDetails = {
            check_id: 'lists_tables_presence',
            name: 'Lists & Tables Presence',
            explanation: 'Opportunity to convert comparative prose into bullets.',
            highlights: [
                {
                    node_ref: 'block-9',
                    snippet: 'First, compare speed. Second, compare cost. Third, compare risk.'
                }
            ]
        };
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-9',
                    block_type: 'core/paragraph',
                    text: 'First, compare speed. Second, compare cost. Third, compare risk.'
                }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'lists_tables_presence',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('block');
        expect(resolved.rewrite_target.operation).toBe('convert_to_list');
        expect(resolved.rewrite_target.primary_node_ref).toBe('block-9');
    });

    test('routes weak inline anchors to section when section-first gate is enabled', () => {
        process.env.REWRITE_SECTION_FIRST_V1 = 'true';

        const checkDetails = {
            check_id: 'howto_semantic_validity',
            name: 'HowTo Semantic Validity',
            explanation: 'No logical steps found.',
            candidate_highlights: [
                {
                    snippet: 'Some people say you should optimize images because images can be large and slow things down.'
                }
            ]
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-0', block_type: 'core/heading', text: 'Speed Optimization' },
                { node_ref: 'block-1', block_type: 'core/paragraph', text: 'Some people say you should optimize images because images can be large and slow things down.' },
                { node_ref: 'block-2', block_type: 'core/paragraph', text: 'Others argue hosting matters more than image optimization.' },
                { node_ref: 'block-3', block_type: 'core/heading', text: 'Other Advice' },
                { node_ref: 'block-4', block_type: 'core/paragraph', text: 'Separate section content.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'howto_semantic_validity',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('section');
        expect(resolved.rewrite_target.operation).toBe('replace_block');
        expect(resolved.rewrite_target.resolver_reason).toBe('weak_inline_routed_to_section');
        expect(resolved.rewrite_target.anchor_node_ref).toBe('block-1');
        expect(resolved.rewrite_target.primary_repair_node_ref).toBe('block-1');
        expect(resolved.rewrite_target.repair_node_refs).toEqual(['block-0', 'block-1', 'block-2']);
        expect(resolved.rewrite_target.node_refs).toEqual(['block-0', 'block-1', 'block-2']);
        expect(resolved.rewrite_target.section_start_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.section_end_node_ref).toBe('block-2');
        expect(resolved.rewrite_target.boundary_type).toBe('heading');
        expect(resolved.rewrite_target.boundary_node_ref).toBe('block-3');
        expect(resolved.rewrite_target.start).toBeNull();
        expect(resolved.rewrite_target.end).toBeNull();
    });

    test('treats pseudo headings as section boundaries for heading support scope', () => {
        const checkDetails = {
            check_id: 'heading_topic_fulfillment',
            name: 'Orphan Headings',
            explanation: 'Heading lacks semantic support.',
            candidate_highlights: [
                {
                    scope: 'span',
                    snippet: 'What are the three states of matter?',
                    quote: {
                        exact: 'What are the three states of matter?'
                    }
                }
            ]
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-0', block_type: 'core/heading', text: 'What are the three states of matter?' },
                { node_ref: 'block-1', block_type: 'core/paragraph', text: 'The three states of matter are solid, liquid, and gas.' },
                { node_ref: 'block-2', block_type: 'core/paragraph', text: 'Solid keeps its shape while liquid and gas do not.' },
                { node_ref: 'block-3', block_type: 'core/paragraph', text: 'Why this matters:' },
                { node_ref: 'block-4', block_type: 'core/paragraph', text: 'These states explain how matter behaves in different conditions.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'heading_topic_fulfillment',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.anchor_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.primary_repair_node_ref).toBe('block-1');
        expect(resolved.rewrite_target.repair_node_refs).toEqual(['block-1', 'block-2']);
        expect(resolved.rewrite_target.section_start_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.section_end_node_ref).toBe('block-2');
        expect(resolved.rewrite_target.boundary_type).toBe('pseudo_heading');
        expect(resolved.rewrite_target.boundary_node_ref).toBe('block-3');
    });

    test('treats pseudo headings as section boundaries for section-first routing', () => {
        process.env.REWRITE_SECTION_FIRST_V1 = 'true';

        const checkDetails = {
            check_id: 'howto_semantic_validity',
            name: 'HowTo Semantic Validity',
            explanation: 'No logical steps found.',
            candidate_highlights: [
                {
                    snippet: 'Some people say you should optimize images because images can be large and slow things down.'
                }
            ]
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-0', block_type: 'core/heading', text: 'Speed Optimization' },
                { node_ref: 'block-1', block_type: 'core/paragraph', text: 'Some people say you should optimize images because images can be large and slow things down.' },
                { node_ref: 'block-2', block_type: 'core/paragraph', text: 'A concise process should explain what to optimize first and why.' },
                { node_ref: 'block-3', block_type: 'core/paragraph', text: 'Why this matters:' },
                { node_ref: 'block-4', block_type: 'core/paragraph', text: 'This supporting note belongs to the next section and should not be absorbed into the rewrite scope.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'howto_semantic_validity',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('section');
        expect(resolved.rewrite_target.primary_repair_node_ref).toBe('block-1');
        expect(resolved.rewrite_target.repair_node_refs).toEqual(['block-0', 'block-1', 'block-2']);
        expect(resolved.rewrite_target.section_end_node_ref).toBe('block-2');
        expect(resolved.rewrite_target.boundary_type).toBe('pseudo_heading');
        expect(resolved.rewrite_target.boundary_node_ref).toBe('block-3');
    });

    test('keeps legacy inline routing when section-first gate is disabled', () => {
        process.env.REWRITE_SECTION_FIRST_V1 = 'false';

        const checkDetails = {
            check_id: 'howto_semantic_validity',
            name: 'HowTo Semantic Validity',
            explanation: 'No logical steps found.',
            candidate_highlights: [
                {
                    snippet: 'Some people say you should optimize images because images can be large and slow things down.'
                }
            ]
        };
        const manifest = {
            block_map: [
                { node_ref: 'block-0', block_type: 'core/heading', text: 'Speed Optimization' },
                { node_ref: 'block-1', block_type: 'core/paragraph', text: 'Some people say you should optimize images because images can be large and slow things down.' }
            ]
        };

        const resolved = resolveRewriteTarget({
            checkId: 'howto_semantic_validity',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('inline_span');
        expect(resolved.rewrite_target.operation).toBe('replace_span');
        expect(resolved.rewrite_target.resolver_reason).toBe('inline_span_resolved');
    });

    test('node collection supports block_map and legacy nodes list', () => {
        const fromBlockMap = __testHooks.collectManifestNodes({
            block_map: [{ node_ref: 'block-1', block_type: 'core/paragraph', text: 'Alpha' }]
        });
        const fromNodes = __testHooks.collectManifestNodes({
            nodes: [{ ref: 'n-1', type: 'paragraph', text: 'Beta' }]
        });

        expect(fromBlockMap.length).toBe(1);
        expect(fromBlockMap[0].node_ref).toBe('block-1');
        expect(fromNodes.length).toBe(1);
        expect(fromNodes[0].node_ref).toBe('n-1');
    });

    test('prefers snippet evidence before signature fallback when resolving nodes', () => {
        const nodes = __testHooks.collectManifestNodes({
            nodes: [
                { ref: 'block-1', type: 'paragraph', text: 'Generic support text.', signature: 'sig-match' },
                { ref: 'block-2', type: 'paragraph', text: 'Support paragraph text that actually matches the flagged issue.' }
            ]
        });

        const resolved = __testHooks.resolveNodeFromCandidate(
            {
                signature: 'sig-match',
                snippet: 'Support paragraph text that actually matches the flagged issue.'
            },
            nodes
        );

        expect(resolved.node_ref).toBe('block-2');
    });

    test('keeps signature available as a last-resort advisory fallback', () => {
        const nodes = __testHooks.collectManifestNodes({
            nodes: [
                { ref: 'block-1', type: 'paragraph', text: 'Generic support text.', signature: 'sig-match' }
            ]
        });

        const resolved = __testHooks.resolveNodeFromCandidate(
            {
                signature: 'sig-match'
            },
            nodes
        );

        expect(resolved.node_ref).toBe('block-1');
    });
});
