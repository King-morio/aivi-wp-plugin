const { buildFixAssistTriage } = require('./fix-assist-triage');

describe('fix-assist-triage', () => {
    test('classifies extractible list-style answer formatting as leave_as_is', () => {
        const triage = buildFixAssistTriage({
            checkId: 'clear_answer_formatting',
            snippet: 'The three states of matter are solid, liquid, and gas.',
            rewriteTarget: {
                actionable: true,
                mode: 'section',
                target_text: 'The three states of matter are solid, liquid, and gas.'
            }
        });

        expect(triage.state).toBe('leave_as_is');
        expect(triage.copilot_mode).toBe('structural_transform');
        expect(triage.variants_allowed).toBe(true);
        expect(triage.summary).toMatch(/already clear and extractible/i);
    });

    test('classifies list opportunity without extractible direct answer as optional_improvement', () => {
        const triage = buildFixAssistTriage({
            checkId: 'lists_tables_presence',
            snippet: 'Start by reviewing the cost, the workflow impact, the long-term maintenance burden, and the team training requirement before making a decision.',
            rewriteTarget: {
                actionable: true,
                mode: 'block',
                target_text: 'Start by reviewing the cost, the workflow impact, the long-term maintenance burden, and the team training requirement before making a decision.'
            }
        });

        expect(triage.state).toBe('optional_improvement');
        expect(triage.copilot_mode).toBe('structural_transform');
        expect(triage.summary).toMatch(/optional/i);
    });

    test('classifies actionable heading support gap as rewrite_needed', () => {
        const triage = buildFixAssistTriage({
            checkId: 'heading_topic_fulfillment',
            snippet: 'Use caching.',
            rewriteTarget: {
                actionable: true,
                mode: 'heading_support_range',
                target_text: 'Use caching.'
            }
        });

        expect(triage.state).toBe('rewrite_needed');
        expect(triage.copilot_mode).toBe('local_rewrite');
        expect(triage.summary).toMatch(/rewrite/i);
    });

    test('classifies non-actionable document scope issue as structural_guidance_only', () => {
        const triage = buildFixAssistTriage({
            checkId: 'external_authoritative_sources',
            snippet: '',
            rewriteTarget: {
                actionable: false,
                mode: 'section'
            }
        });

        expect(triage.state).toBe('structural_guidance_only');
        expect(triage.copilot_mode).toBe('web_backed_evidence_assist');
        expect(triage.requires_web_consent).toBe(true);
        expect(triage.variants_allowed).toBe(false);
    });

    test('classifies actionable evidence issue as rewrite_needed with web consent flag', () => {
        const triage = buildFixAssistTriage({
            checkId: 'external_authoritative_sources',
            snippet: 'Medical experts say this treatment always works quickly for everyone.',
            rewriteTarget: {
                actionable: true,
                mode: 'section',
                operation: 'replace_block',
                target_text: 'Medical experts say this treatment always works quickly for everyone.'
            }
        });

        expect(triage.state).toBe('rewrite_needed');
        expect(triage.copilot_mode).toBe('web_backed_evidence_assist');
        expect(triage.requires_web_consent).toBe(true);
        expect(triage.variants_allowed).toBe(true);
        expect(triage.summary).toMatch(/stronger support|claim framing/i);
    });

    test('routes schema checks into schema assist instead of rewrite mode', () => {
        const triage = buildFixAssistTriage({
            checkId: 'valid_jsonld_schema',
            rewriteTarget: {
                actionable: false,
                mode: 'section'
            }
        });

        expect(triage.state).toBe('structural_guidance_only');
        expect(triage.copilot_mode).toBe('schema_metadata_assist');
        expect(triage.label).toMatch(/schema assist/i);
    });

    test('routes intro length issues into local rewrite instead of generic manual guidance', () => {
        const triage = buildFixAssistTriage({
            checkId: 'intro_wordcount',
            snippet: 'This introduction keeps circling around the topic with extra setup before it reaches the actual point readers came for in the first place.',
            rewriteTarget: {
                actionable: true,
                mode: 'block',
                operation: 'replace_block',
                target_text: 'This introduction keeps circling around the topic with extra setup before it reaches the actual point readers came for in the first place.'
            }
        });

        expect(triage.state).toBe('rewrite_needed');
        expect(triage.copilot_mode).toBe('local_rewrite');
        expect(triage.variants_allowed).toBe(true);
    });

    test('keeps broken-link issues in truthful technical guidance mode even when a block is selected', () => {
        const triage = buildFixAssistTriage({
            checkId: 'no_broken_internal_links',
            snippet: 'See our related guide for more detail.',
            rewriteTarget: {
                actionable: true,
                mode: 'block',
                operation: 'replace_block',
                target_text: 'See our related guide for more detail.'
            }
        });

        expect(triage.state).toBe('structural_guidance_only');
        expect(triage.copilot_mode).toBe('limited_technical_guidance');
        expect(triage.variants_allowed).toBe(false);
    });

    test('routes author support issues into schema metadata assist', () => {
        const triage = buildFixAssistTriage({
            checkId: 'author_bio_present',
            rewriteTarget: {
                actionable: true,
                mode: 'section'
            }
        });

        expect(triage.state).toBe('structural_guidance_only');
        expect(triage.copilot_mode).toBe('schema_metadata_assist');
        expect(triage.variants_allowed).toBe(false);
    });

    test('routes freshness claim issues into evidence assist with consent flag', () => {
        const triage = buildFixAssistTriage({
            checkId: 'temporal_claim_check',
            snippet: 'As of today, this is the newest treatment standard.',
            rewriteTarget: {
                actionable: true,
                mode: 'section',
                operation: 'replace_block',
                target_text: 'As of today, this is the newest treatment standard.'
            }
        });

        expect(triage.state).toBe('rewrite_needed');
        expect(triage.copilot_mode).toBe('web_backed_evidence_assist');
        expect(triage.requires_web_consent).toBe(true);
        expect(triage.variants_allowed).toBe(true);
    });
});
