const fs = require('fs');
const path = require('path');

const normalizeText = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
};

const countWords = (value = '') => normalizeText(value).split(/\s+/).filter(Boolean).length;

const countSentences = (value = '') => {
    const text = normalizeText(value);
    if (!text) return 0;
    const matches = text.match(/[.!?]+/g);
    return matches ? matches.length : 1;
};

const ALLOWED_COPILOT_MODES = new Set([
    'local_rewrite',
    'structural_transform',
    'schema_metadata_assist',
    'web_backed_evidence_assist',
    'limited_technical_guidance'
]);

const OPTIONAL_IMPROVEMENT_CHECK_IDS = new Set([
    'lists_tables_presence',
    'clear_answer_formatting',
    'faq_structure_opportunity'
]);

const DIRECT_REWRITE_CHECK_IDS = new Set([
    'immediate_answer_placement',
    'question_answer_alignment',
    'claim_pattern_detection',
    'readability_adaptivity',
    'factual_statements_well_formed'
]);

const STRUCTURAL_TRANSFORM_CHECK_IDS = new Set([
    'clear_answer_formatting',
    'lists_tables_presence',
    'faq_structure_opportunity',
    'heading_like_text_uses_heading_markup',
    'howto_semantic_validity'
]);

const EXPLICIT_COPILOT_MODE_BY_CHECK = Object.freeze({
    intro_wordcount: 'local_rewrite',
    intro_readability: 'local_rewrite',
    intro_factual_entities: 'web_backed_evidence_assist',
    intro_schema_suggestion: 'schema_metadata_assist',
    immediate_answer_placement: 'local_rewrite',
    answer_sentence_concise: 'local_rewrite',
    question_answer_alignment: 'local_rewrite',
    clear_answer_formatting: 'structural_transform',
    faq_structure_opportunity: 'structural_transform',
    single_h1: 'structural_transform',
    logical_heading_hierarchy: 'structural_transform',
    heading_topic_fulfillment: 'local_rewrite',
    heading_fragmentation: 'structural_transform',
    heading_like_text_uses_heading_markup: 'structural_transform',
    lists_tables_presence: 'structural_transform',
    readability_adaptivity: 'local_rewrite',
    appropriate_paragraph_length: 'local_rewrite',
    valid_jsonld_schema: 'schema_metadata_assist',
    article_jsonld_presence_and_completeness: 'schema_metadata_assist',
    schema_matches_content: 'schema_metadata_assist',
    canonical_clarity: 'schema_metadata_assist',
    semantic_html_usage: 'structural_transform',
    supported_schema_types_validation: 'schema_metadata_assist',
    faq_jsonld_presence_and_completeness: 'schema_metadata_assist',
    howto_jsonld_presence_and_completeness: 'schema_metadata_assist',
    faq_jsonld_generation_suggestion: 'schema_metadata_assist',
    howto_schema_presence_and_completeness: 'schema_metadata_assist',
    itemlist_jsonld_presence_and_completeness: 'schema_metadata_assist',
    content_updated_12_months: 'web_backed_evidence_assist',
    no_broken_internal_links: 'limited_technical_guidance',
    temporal_claim_check: 'web_backed_evidence_assist',
    named_entities_detected: 'local_rewrite',
    entities_contextually_relevant: 'local_rewrite',
    entity_relationships_clear: 'local_rewrite',
    entity_disambiguation: 'local_rewrite',
    terminology_consistency: 'local_rewrite',
    howto_semantic_validity: 'structural_transform',
    author_identified: 'schema_metadata_assist',
    author_bio_present: 'schema_metadata_assist',
    metadata_checks: 'schema_metadata_assist',
    ai_crawler_accessibility: 'limited_technical_guidance',
    external_authoritative_sources: 'web_backed_evidence_assist',
    claim_provenance_and_evidence: 'web_backed_evidence_assist',
    numeric_claim_consistency: 'web_backed_evidence_assist',
    contradictions_and_coherence: 'local_rewrite',
    no_exaggerated_claims: 'local_rewrite',
    promotional_or_commercial_intent: 'local_rewrite',
    pii_sensitive_content_detector: 'local_rewrite',
    original_evidence_signal: 'web_backed_evidence_assist',
    claim_pattern_detection: 'local_rewrite',
    factual_statements_well_formed: 'local_rewrite',
    internal_link_context_relevance: 'limited_technical_guidance',
    duplicate_or_near_duplicate_detection: 'local_rewrite',
    citation_format_and_context: 'web_backed_evidence_assist'
});

let cachedRuntimeContract = null;

const readJsonFile = (filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(String(raw).replace(/^\uFEFF/, ''));
};

const resolveRuntimeContractPath = () => {
    const candidates = [
        path.join(__dirname, '..', 'shared', 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, 'shared', 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, 'schemas', 'check-runtime-contract-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
};

const loadRuntimeContract = () => {
    if (cachedRuntimeContract) return cachedRuntimeContract;
    cachedRuntimeContract = readJsonFile(resolveRuntimeContractPath());
    return cachedRuntimeContract;
};

const getContractEntry = (checkId) => {
    const runtime = loadRuntimeContract();
    const checks = runtime && runtime.checks && typeof runtime.checks === 'object'
        ? runtime.checks
        : {};
    return checks[String(checkId || '').trim()] || null;
};

const normalizeCopilotMode = (value) => {
    const mode = normalizeText(String(value || '')).toLowerCase();
    return ALLOWED_COPILOT_MODES.has(mode) ? mode : '';
};

const EXTRACTIBLE_LIST_PATTERNS = [
    /\b(?:are|include|includes|consist(?:s)? of|can be|come in|fall into|means)\b/i,
    /\b(?:first|second|third)\b/i
];

const looksDirectExtractibleAnswer = (snippet = '') => {
    const text = normalizeText(snippet);
    if (!text) return false;
    const words = countWords(text);
    const sentences = countSentences(text);
    if (words < 5 || words > 40) return false;
    if (sentences > 2) return false;
    if (/[?]$/.test(text)) return false;
    if (/^[-*â€¢]\s+/m.test(text)) return false;
    return EXTRACTIBLE_LIST_PATTERNS.some((pattern) => pattern.test(text));
};

const isNearReusableSnippetBand = (snippet = '') => {
    const words = countWords(snippet);
    return words >= 30 && words <= 80;
};

const buildRewriteNeeded = (overrides = {}) => ({
    state: 'rewrite_needed',
    label: overrides.label || 'Rewrite needed',
    summary: overrides.summary || 'This section likely needs a rewrite before publication.',
    framing: overrides.framing || 'AiVI found a scoped repair area for this issue, so the fix should stay focused on the targeted text.',
    copilot_mode: overrides.copilot_mode || 'local_rewrite',
    requires_web_consent: overrides.requires_web_consent === true,
    variants_allowed: overrides.variants_allowed !== false,
    keep_as_is_note: overrides.keep_as_is_note || 'Marked as keep as is for now. AiVI still considers this worth revisiting before publication.'
});

const buildOptionalImprovement = (overrides = {}) => ({
    state: 'optional_improvement',
    label: overrides.label || 'Optional improvement',
    summary: overrides.summary || 'This section is usable as written. A clearer structure or tighter phrasing could help, but the change is optional.',
    framing: overrides.framing || 'AiVI found a safe repair scope, but this reads more like an improvement than a must-fix.',
    copilot_mode: overrides.copilot_mode || 'local_rewrite',
    requires_web_consent: overrides.requires_web_consent === true,
    variants_allowed: overrides.variants_allowed !== false,
    keep_as_is_note: overrides.keep_as_is_note || 'Marked as keep as is. This is optional, so leaving it alone is a reasonable choice.'
});

const buildGuidanceOnly = (overrides = {}) => ({
    state: 'structural_guidance_only',
    label: overrides.label || 'Guidance only',
    summary: overrides.summary || 'This issue needs structural or manual guidance more than a block-local rewrite.',
    framing: overrides.framing || 'AiVI does not have a safe block-level repair target here, so review the guidance and adjust the section manually if needed.',
    copilot_mode: overrides.copilot_mode || 'limited_technical_guidance',
    requires_web_consent: overrides.requires_web_consent === true,
    variants_allowed: false,
    keep_as_is_note: overrides.keep_as_is_note || 'Marked as keep as is. This one is better handled through manual structural edits if you revisit it later.'
});

const buildLeaveAsIs = (overrides = {}) => ({
    state: 'leave_as_is',
    label: overrides.label || 'Leave as is',
    summary: overrides.summary || 'This section is already clear and extractible. I would keep it as-is unless you want a different presentation style.',
    framing: overrides.framing || 'A rewrite is not necessary for this issue. If you change it later, treat any rewrite as an optional stylistic improvement.',
    copilot_mode: overrides.copilot_mode || 'local_rewrite',
    requires_web_consent: overrides.requires_web_consent === true,
    variants_allowed: overrides.variants_allowed !== false,
    keep_as_is_note: overrides.keep_as_is_note || 'Marked as keep as is. This is already usable in its current form.'
});

const determineCopilotMode = ({ checkId, contractEntry, rewriteTarget }) => {
    const explicitMode = normalizeCopilotMode(contractEntry && contractEntry.copilot_mode);
    if (explicitMode) return explicitMode;

    const overrideMode = normalizeCopilotMode(EXPLICIT_COPILOT_MODE_BY_CHECK[String(checkId || '').trim()]);
    if (overrideMode) return overrideMode;

    const categoryId = normalizeText(contractEntry && contractEntry.category_id).toLowerCase();
    const rewriteMode = normalizeText(contractEntry && contractEntry.rewrite_mode).toLowerCase();
    const operation = normalizeText(rewriteTarget && rewriteTarget.operation).toLowerCase();
    const targetMode = normalizeText(rewriteTarget && rewriteTarget.mode).toLowerCase();

    if (contractEntry && typeof contractEntry.schema_assist_mode === 'string' && contractEntry.schema_assist_mode.trim()) {
        return 'schema_metadata_assist';
    }

    if (categoryId === 'schema_structured_data') {
        return 'schema_metadata_assist';
    }

    if (
        STRUCTURAL_TRANSFORM_CHECK_IDS.has(checkId)
        || operation === 'convert_to_list'
        || operation === 'convert_to_steps'
        || operation === 'insert_after_heading'
        || operation === 'append_support'
        || targetMode === 'heading_support_range'
    ) {
        return 'structural_transform';
    }

    if (
        rewriteMode === 'manual_review'
        && (categoryId === 'trust_neutrality' || categoryId === 'citability_verifiability')
    ) {
        return 'web_backed_evidence_assist';
    }

    if (rewriteMode === 'manual_review') {
        return 'limited_technical_guidance';
    }

    return 'local_rewrite';
};

const buildModeSpecificGuidance = (copilotMode) => {
    if (copilotMode === 'schema_metadata_assist') {
        return buildGuidanceOnly({
            label: 'Schema assist',
            summary: 'This issue needs a schema or metadata update more than a wording change.',
            framing: 'Copilot should guide the next schema or metadata step instead of pretending a paragraph rewrite will fix it.',
            copilot_mode: 'schema_metadata_assist'
        });
    }
    if (copilotMode === 'web_backed_evidence_assist') {
        return buildGuidanceOnly({
            label: 'Evidence assist',
            summary: 'This issue needs stronger support, provenance, or source framing more than a plain local rewrite.',
            framing: 'Copilot should treat this as a source-aware evidence assist path for the selected issue.',
            copilot_mode: 'web_backed_evidence_assist',
            requires_web_consent: true,
            keep_as_is_note: 'Marked as keep as is for now. Revisit this section if you want stronger support or a narrower claim.'
        });
    }
    if (copilotMode === 'structural_transform') {
        return buildGuidanceOnly({
            label: 'Structure change',
            summary: 'This issue needs a structural change more than a narrow wording tweak.',
            framing: 'Copilot should stay scoped to the selected issue, but the next fix path is structural rather than sentence-level.',
            copilot_mode: 'structural_transform'
        });
    }
    return buildGuidanceOnly({
        label: 'Technical guidance',
        summary: 'This issue looks more structural than editorial and may need an editor or settings change.',
        framing: 'Copilot should guide the next step here while staying clear that this may require an editor or settings change.',
            copilot_mode: 'limited_technical_guidance'
    });
};

const buildEvidenceAssistRewrite = () => buildRewriteNeeded({
    label: 'Evidence assist',
    summary: 'This section would benefit from stronger support or more careful claim framing.',
    framing: 'Copilot can suggest safer local variants for the selected section now, and a later verification step can strengthen support further.',
    copilot_mode: 'web_backed_evidence_assist',
    requires_web_consent: true,
    keep_as_is_note: 'Marked as keep as is for now. Revisit this section if you want stronger support or narrower claim framing.'
});

const buildFixAssistTriage = (context = {}) => {
    const checkId = String(context.checkId || '').trim();
    const contractEntry = getContractEntry(checkId);
    const rewriteTarget = context.rewriteTarget && typeof context.rewriteTarget === 'object'
        ? context.rewriteTarget
        : null;
    const actionable = rewriteTarget && rewriteTarget.actionable === true;
    const snippet = normalizeText(
        context.snippet
        || rewriteTarget?.quote?.exact
        || rewriteTarget?.target_text
        || ''
    );
    const rewriteMode = normalizeText(rewriteTarget?.mode).toLowerCase();
    const copilotMode = determineCopilotMode({ checkId, contractEntry, rewriteTarget });

    if (copilotMode === 'schema_metadata_assist' || copilotMode === 'limited_technical_guidance') {
        return buildModeSpecificGuidance(copilotMode);
    }

    if (!actionable) {
        return buildModeSpecificGuidance(copilotMode);
    }

    if (copilotMode === 'web_backed_evidence_assist') {
        return buildEvidenceAssistRewrite();
    }

    if (OPTIONAL_IMPROVEMENT_CHECK_IDS.has(checkId)) {
        if (looksDirectExtractibleAnswer(snippet)) {
            return buildLeaveAsIs({ copilot_mode: copilotMode });
        }
        if (copilotMode === 'structural_transform') {
            return buildOptionalImprovement({
                label: 'Optional structure change',
                summary: 'This section is usable as written. A clearer structure could help, but the change is optional.',
                framing: 'AiVI found a safe local section, so Copilot can help with cleaner structure if you want it.',
                copilot_mode: 'structural_transform'
            });
        }
        return buildOptionalImprovement({ copilot_mode: copilotMode });
    }

    if (checkId === 'answer_sentence_concise') {
        if (looksDirectExtractibleAnswer(snippet)) {
            return buildLeaveAsIs({ copilot_mode: copilotMode });
        }
        if (isNearReusableSnippetBand(snippet)) {
            return buildOptionalImprovement({ copilot_mode: copilotMode });
        }
        return buildRewriteNeeded({ copilot_mode: copilotMode });
    }

    if (DIRECT_REWRITE_CHECK_IDS.has(checkId)) {
        return buildRewriteNeeded({ copilot_mode: copilotMode });
    }

    if (copilotMode === 'structural_transform') {
        return buildRewriteNeeded({
            label: 'Structure change',
            summary: 'This section likely needs a structural change before publication.',
            framing: 'AiVI found a scoped repair area, so Copilot can keep the change local while improving structure.',
            copilot_mode: 'structural_transform'
        });
    }

    if (rewriteMode === 'heading_support_range' || rewriteMode === 'section') {
        return buildRewriteNeeded({ copilot_mode: copilotMode });
    }

    return buildRewriteNeeded({ copilot_mode: copilotMode });
};

module.exports = {
    buildFixAssistTriage,
    __testHooks: {
        normalizeText,
        countWords,
        countSentences,
        looksDirectExtractibleAnswer,
        isNearReusableSnippetBand,
        determineCopilotMode
    }
};
