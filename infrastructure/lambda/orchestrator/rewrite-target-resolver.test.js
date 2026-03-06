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
            check_id: 'orphan_headings',
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
            checkId: 'orphan_headings',
            checkDetails,
            manifest,
            instanceIndex: 0
        });

        expect(resolved.rewrite_target.actionable).toBe(true);
        expect(resolved.rewrite_target.mode).toBe('heading_support_range');
        expect(resolved.rewrite_target.heading_node_ref).toBe('block-0');
        expect(resolved.rewrite_target.node_refs).toEqual(['block-1', 'block-2']);
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

    test('enforces manual_review checks as non-actionable', () => {
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

        expect(resolved.rewrite_target.actionable).toBe(false);
        expect(resolved.rewrite_target.resolver_reason).toBe('manual_review_policy');
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
        expect(resolved.rewrite_target.node_refs).toEqual(['block-0', 'block-1', 'block-2']);
        expect(resolved.rewrite_target.start).toBeNull();
        expect(resolved.rewrite_target.end).toBeNull();
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
});
