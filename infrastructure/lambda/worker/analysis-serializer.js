/**
 * Analysis Serializer - Sidebar Noise Elimination
 *
 * PRESENTATION LOCK: Groups results ONLY by 7 canonical primary categories.
 * NOISE ELIMINATION: Shows ONLY fail/partial issues, ordered (fail first, then partial).
 * AEO/GEO are SCORES only - never used for grouping.
 *
 * Version: 2.1.0
 * Last Updated: 2026-01-29
 */

const fs = require('fs');
const path = require('path');
const { buildSchemaAssistDraft } = require('./schema-draft-builder');
const { buildFixAssistTriage } = require('./fix-assist-triage');

// Cached data
let cachedCategoryMap = null;
let cachedDefinitions = null;
let cachedRuntimeContract = null;
let cachedDefinitionChecksLookup = null;
let cachedDeterministicExplanationCatalog = null;
const readJsonFile = (filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(String(raw).replace(/^\uFEFF/, ''));
};
const resolveDefinitionsPath = () => {
    const candidates = [
        path.join(__dirname, 'shared', 'schemas', 'checks-definitions-v1.json'),
        path.join(__dirname, 'schemas', 'checks-definitions-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'checks-definitions-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
};
const resolveDeterministicExplanationCatalogPath = () => {
    const candidates = [
        path.join(__dirname, 'shared', 'schemas', 'deterministic-explanations-v1.json'),
        path.join(__dirname, 'schemas', 'deterministic-explanations-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'deterministic-explanations-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || null;
};

/**
 * Load the canonical primary category map - SINGLE SOURCE OF TRUTH
 */
const loadPrimaryCategoryMap = () => {
    if (cachedCategoryMap) return cachedCategoryMap;

    try {
        const mapPath = path.join(__dirname, 'schemas', 'primary-category-map.json');
        cachedCategoryMap = readJsonFile(mapPath);
        return cachedCategoryMap;
    } catch (error) {
        console.error('CRITICAL: Failed to load primary-category-map.json:', error.message);
        throw new Error('Primary category map is required for serialization');
    }
};

const loadDefinitions = () => {
    if (cachedDefinitions) return cachedDefinitions;

    try {
        const defPath = resolveDefinitionsPath();
        cachedDefinitions = readJsonFile(defPath);
        return cachedDefinitions;
    } catch (error) {
        console.error('Failed to load checks definitions:', error.message);
        return null;
    }
};

const loadDeterministicExplanationCatalog = () => {
    if (cachedDeterministicExplanationCatalog) return cachedDeterministicExplanationCatalog;
    const catalogPath = resolveDeterministicExplanationCatalogPath();
    if (!catalogPath) {
        cachedDeterministicExplanationCatalog = { checks: {} };
        return cachedDeterministicExplanationCatalog;
    }
    try {
        cachedDeterministicExplanationCatalog = readJsonFile(catalogPath);
    } catch (error) {
        console.error('Failed to load deterministic explanations catalog:', error.message);
        cachedDeterministicExplanationCatalog = { checks: {} };
    }
    return cachedDeterministicExplanationCatalog;
};

const buildDefinitionChecksLookup = () => {
    if (cachedDefinitionChecksLookup) return cachedDefinitionChecksLookup;
    const definitions = loadDefinitions();
    const lookup = {};
    if (definitions && definitions.categories && typeof definitions.categories === 'object') {
        Object.values(definitions.categories).forEach((category) => {
            if (!category || typeof category !== 'object') return;
            const checks = category.checks && typeof category.checks === 'object'
                ? category.checks
                : {};
            Object.entries(checks).forEach(([checkId, checkDef]) => {
                if (!checkId || !checkDef || typeof checkDef !== 'object') return;
                lookup[String(checkId)] = {
                    name: String(checkDef.name || checkId).trim(),
                    description: String(checkDef.description || '').trim()
                };
            });
        });
    }
    cachedDefinitionChecksLookup = lookup;
    return cachedDefinitionChecksLookup;
};

const getCheckDefinitionMeta = (checkId) => {
    const lookup = buildDefinitionChecksLookup();
    return lookup[String(checkId || '')] || null;
};

/**
 * Map verdict to ui_verdict
 * Valid ui_verdict values: pass | partial | fail
 *
 * @param {string} verdict - Original verdict from analyzer
 * @returns {string} - Normalized ui_verdict
 */
const mapVerdictToUiVerdict = (verdict) => {
    if (!verdict || typeof verdict !== 'string') {
        return 'fail';
    }

    const normalized = verdict.toLowerCase().trim();

    // Direct mappings
    const verdictMap = {
        'pass': 'pass',
        'passed': 'pass',
        'ok': 'pass',
        'partial': 'partial',
        'fail': 'fail',
        'failed': 'fail',
        'issue': 'fail',
        'warning': 'fail',
        'unknown': 'fail'
    };

    const uiVerdict = verdictMap[normalized];

    if (!uiVerdict) {
        // Unknown verdict - log warning and default to fail
        console.warn(`[Serializer] Unknown verdict value: "${verdict}", defaulting to fail`);
        return 'fail';
    }

    return uiVerdict;
};

const resolveRuntimeContractPath = () => {
    const candidates = [
        path.join(__dirname, 'shared', 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'check-runtime-contract-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || null;
};

const loadRuntimeContract = () => {
    if (cachedRuntimeContract) return cachedRuntimeContract;
    const contractPath = resolveRuntimeContractPath();
    if (!contractPath) {
        cachedRuntimeContract = { checks: {} };
        return cachedRuntimeContract;
    }
    try {
        cachedRuntimeContract = readJsonFile(contractPath);
    } catch (error) {
        console.error('Failed to load runtime contract:', error.message);
        cachedRuntimeContract = { checks: {} };
    }
    return cachedRuntimeContract;
};

const buildSerializedFixAssistTriage = ({
    checkId,
    checkName,
    snippet,
    message,
    failureReason,
    rewriteTarget,
    repairIntent
}) => buildFixAssistTriage({
    checkId,
    checkName,
    snippet,
    message,
    failureReason,
    rewriteTarget,
    repairIntent
});

const isSyntheticDiagnosticCheck = (checkData) => {
    if (!checkData || typeof checkData !== 'object') return false;
    const provenance = typeof checkData.provenance === 'string'
        ? checkData.provenance.toLowerCase().trim()
        : '';
    return checkData.synthetic_generated === true
        || checkData.diagnostic_only === true
        || provenance === 'synthetic';
};

const getScoreNeutralReason = (checkData) => {
    if (!checkData || typeof checkData !== 'object') return '';
    const directReason = typeof checkData.score_neutral_reason === 'string'
        ? checkData.score_neutral_reason.trim().toLowerCase()
        : '';
    if (directReason) return directReason;
    const nestedReason = typeof checkData.details?.score_neutral_reason === 'string'
        ? checkData.details.score_neutral_reason.trim().toLowerCase()
        : '';
    return nestedReason;
};

const isInternalSchemaBridgeDiagnostic = (checkData) => {
    if (!checkData || typeof checkData !== 'object') return false;
    return checkData.diagnostic_only === true && getScoreNeutralReason(checkData) === 'schema_bridge_internal';
};

const NEUTRAL_RELEASE_SCHEMA_REASONS = new Set([
    'content_type_unavailable',
    'schema_types_absent',
    'schema_companion_only'
]);

const isNeutralDeterministicSchemaDiagnostic = (checkId, checkData) => {
    if (!checkData || typeof checkData !== 'object') return false;
    const normalizedId = String(checkId || '').trim();
    if (normalizedId !== 'schema_matches_content') return false;
    const provenance = typeof checkData.provenance === 'string'
        ? checkData.provenance.toLowerCase().trim()
        : '';
    if (provenance !== 'deterministic') return false;
    if (checkData.score_neutral !== true && checkData.details?.score_neutral !== true) return false;
    return NEUTRAL_RELEASE_SCHEMA_REASONS.has(getScoreNeutralReason(checkData));
};

const isVerificationAvailabilityDiagnostic = (checkId, checkData) => {
    if (!checkData || typeof checkData !== 'object') return false;
    const normalizedId = String(checkId || '').trim();
    if (normalizedId !== 'no_broken_internal_links') return false;
    const provenance = typeof checkData.provenance === 'string'
        ? checkData.provenance.toLowerCase().trim()
        : '';
    if (provenance !== 'deterministic') return false;
    const nonInlineReason = typeof checkData.non_inline_reason === 'string'
        ? checkData.non_inline_reason.trim().toLowerCase()
        : '';
    return nonInlineReason === 'link_status_unavailable';
};

const LEGACY_NON_INLINE_REASON_BY_CHECK = {
    metadata_checks: 'metadata_document_scope',
    valid_jsonld_schema: 'jsonld_document_scope',
    article_jsonld_presence_and_completeness: 'article_schema_non_inline',
    schema_matches_content: 'schema_content_alignment_non_inline',
    canonical_clarity: 'canonical_document_scope',
    semantic_html_usage: 'semantic_structure_non_inline',
    heading_like_text_uses_heading_markup: 'heading_like_markup_non_inline',
    supported_schema_types_validation: 'schema_validation_non_inline',
    faq_jsonld_presence_and_completeness: 'faq_schema_non_inline',
    howto_jsonld_presence_and_completeness: 'howto_schema_non_inline',
    howto_schema_presence_and_completeness: 'howto_schema_non_inline',
    itemlist_jsonld_presence_and_completeness: 'itemlist_schema_non_inline',
    author_identified: 'missing_author_byline',
    author_bio_present: 'missing_author_bio',
    ai_crawler_accessibility: 'crawler_accessibility_non_inline',
    intro_schema_suggestion: 'intro_schema_non_inline',
    intro_wordcount: 'intro_wordcount_non_inline',
    intro_readability: 'intro_readability_non_inline',
    'intro_focus_and_factuality.v1': 'intro_composite_non_inline',
    external_authoritative_sources: 'external_sources_document_scope',
    internal_link_context_relevance: 'internal_links_document_scope',
    citation_format_and_context: 'citation_support_document_scope',
    claim_provenance_and_evidence: 'claim_evidence_section_scope',
    faq_jsonld_generation_suggestion: 'faq_jsonld_generation_non_inline'
};

const DETERMINISTIC_NO_CANDIDATE_REASON = {
    single_h1: 'multiple_h1_anchor_unavailable',
    accessibility_basics: 'missing_alt_anchor_unavailable',
    content_updated_12_months: 'date_anchor_unavailable',
    no_broken_internal_links: 'broken_link_anchor_unavailable'
};

const normalizeRecommendationReason = (value, fallback = 'no_highlight_candidates') => {
    const reason = String(value || '').trim().toLowerCase();
    if (!reason) return fallback;
    if (reason === 'missing_candidates') return 'no_highlight_candidates';
    if (reason === 'no_candidates') return 'no_highlight_candidates';
    if (reason === 'missing_snippet') return 'missing_snippet';
    if (reason === 'anchor_not_verified') return 'anchor_failed';
    return reason;
};
const SYNTHETIC_FALLBACK_REASONS = new Set([
    'synthetic_fallback',
    'missing_ai_checks',
    'chunk_parse_failure',
    'time_budget_exceeded',
    'truncated_response'
]);
const isSyntheticFallbackReason = (value) => SYNTHETIC_FALLBACK_REASONS.has(String(value || '').trim().toLowerCase());
const shouldExposeRecommendationInRail = ({ checkData, failureReason }) => {
    const normalizedReason = String(failureReason || '').trim().toLowerCase();
    if (!normalizedReason) return true;
    if (!isSyntheticFallbackReason(normalizedReason)) return true;
    return isDeterministicCheckData(checkData);
};

const AGGREGATE_INLINE_MESSAGE_PATTERNS = [
    /\b\d+\s+[a-z0-9_-]+\(s\)/i,
    /\b\d+\s+(heading|paragraph|section|link|image|check|claim)s?\b/i,
    /\b\d+\s+of\s+\d+\b/i,
    /\bother sections?\b/i,
    /\baverage\b/i
];
const DETERMINISTIC_INLINE_FALLBACK_VARIANTS = [
    ({ checkName }) => `This highlighted section maps to ${checkName}. Clarify the claim and add one concrete support detail.`,
    ({ checkName }) => `This span relates to ${checkName}. Tighten structure so both readers and retrieval systems can parse it quickly.`,
    ({ checkName }) => `This segment needs revision for ${checkName}. Make the point explicit and remove vague wording.`,
    ({ checkName }) => `This portion is tied to ${checkName}. Improve precision and grounding so it is easier to trust and cite.`
];

const stableHash = (value) => {
    const input = String(value || '');
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const isDeterministicCheckData = (checkData) => {
    if (!checkData || typeof checkData !== 'object') return false;
    const provenance = typeof checkData.provenance === 'string'
        ? checkData.provenance.toLowerCase().trim()
        : '';
    const checkType = typeof checkData.type === 'string'
        ? checkData.type.toLowerCase().trim()
        : '';
    return provenance === 'deterministic' || checkType === 'deterministic';
};

const isAggregateInlineMessage = (value) => {
    const message = String(value || '').trim();
    if (!message) return false;
    return AGGREGATE_INLINE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
};

const buildDeterministicInlineFallbackMessage = (checkId, checkData) => {
    const checkName = String(checkData?.title || checkData?.name || checkId || 'this section').trim();
    const seed = `${String(checkId || '')}:${checkName}:inline-fallback`;
    const idx = stableHash(seed) % DETERMINISTIC_INLINE_FALLBACK_VARIANTS.length;
    const builder = DETERMINISTIC_INLINE_FALLBACK_VARIANTS[idx];
    if (typeof builder === 'function') {
        return String(builder({ checkName })).trim();
    }
    return `This highlighted section maps to ${checkName}. Improve clarity and supporting detail for extraction reliability.`;
};

const resolveInlineIssueMessage = ({ checkId, checkData, preferredMessage, fallbackMessage }) => {
    const preferred = sanitizeGuardrailTextForUser(String(preferredMessage || '').trim(), {
        checkId,
        checkData,
        guardrailReason: checkData?.guardrail_reason || ''
    });
    const fallback = sanitizeGuardrailTextForUser(String(fallbackMessage || '').trim(), {
        checkId,
        checkData,
        guardrailReason: checkData?.guardrail_reason || ''
    });
    const deterministic = isDeterministicCheckData(checkData);
    if (preferred) {
        if (!deterministic || !isAggregateInlineMessage(preferred)) {
            return preferred;
        }
    }
    if (fallback) {
        if (!deterministic || !isAggregateInlineMessage(fallback)) {
            return fallback;
        }
    }
    if (deterministic) {
        return buildDeterministicInlineFallbackMessage(checkId, checkData);
    }
    return preferred || fallback || String(checkData?.title || checkData?.name || checkId || 'Issue detected');
};

const GENERIC_REPAIR_INSTRUCTION_PATTERNS = [
    /^rewrite only the flagged inline span\.?$/i,
    /^rewrite only the flagged text\.?$/i,
    /^review this section manually/i
];

const SEMANTIC_WHY_IT_MATTERS_BY_CHECK = {
    immediate_answer_placement: 'Answer engines are more reliable when the direct answer appears immediately, not after supporting setup.',
    answer_sentence_concise: 'A concise opening answer is easier to scan, quote, and reuse in answer-driven results.',
    question_answer_alignment: 'The opening answer is easier to trust when it clearly matches the user query instead of implying it indirectly.',
    clear_answer_formatting: 'Dense answer formatting makes the main point harder to scan and extract quickly.',
    faq_structure_opportunity: 'Explicit Q&A structure helps answer engines identify reusable FAQ pairs and extract them more reliably.',
    faq_jsonld_generation_suggestion: 'FAQ schema is only reliable when the visible content already reads as clear question-and-answer pairs.',
    article_jsonld_presence_and_completeness: 'Primary article schema helps machines confirm that this page is a citable article, not just generic markup.',
    itemlist_jsonld_presence_and_completeness: 'Strong visible lists are easier to reuse when their boundaries and order are explicit in machine-readable form.',
    readability_adaptivity: 'Readable sentences are easier to scan quickly and less likely to be skipped or misread in extracted answers.',
    howto_schema_presence_and_completeness: 'Step-based content needs complete HowTo structure before machines can reuse it confidently.',
    howto_jsonld_presence_and_completeness: 'Step-based content needs complete HowTo structure before machines can reuse it confidently.',
    howto_semantic_validity: 'When a section promises instructions, answer engines extract it more reliably if each step is explicit, ordered, and action-led.',
    external_authoritative_sources: 'Named, recognizable sources placed near a claim make that claim easier to trust, cite, and reuse.',
    claim_provenance_and_evidence: 'Claims with concrete nearby support are easier to trust, quote, and reuse in answer-driven results.',
    original_evidence_signal: 'Original evidence gives answer engines something distinctive to cite instead of generic summary text.',
    citation_format_and_context: 'Claims are easier to verify when the supporting source appears with the statement or immediately after it.',
    temporal_claim_check: 'Time-sensitive claims need clear timing so readers and models can judge whether they are still valid.',
    named_entities_detected: 'Specific names reduce ambiguity and help models connect claims to the right people, companies, products, or places.',
    entity_disambiguation: 'Specific entity naming reduces ambiguity and helps models connect the claim to the right subject.',
    claim_pattern_detection: 'Absolute claims without support are harder to trust and more likely to be down-ranked.',
    no_exaggerated_claims: 'Exaggerated claims weaken trust and make the content less reusable as a reliable answer source.',
    promotional_or_commercial_intent: 'Neutral wording is easier to trust and more likely to be cited than sales-style language.',
    internal_link_context_relevance: 'Relevant internal links help readers and crawlers follow supporting context without guessing.'
};
const SEMANTIC_WHY_IT_MATTERS_BY_REASON = {
    block_wide: 'Broad, section-level claims are easier to extract when the main point is separated from supporting detail.',
    too_wide: 'Tighter sections are easier for answer engines to interpret, extract, and cite accurately.',
    low_precision: 'Specific wording makes the claim easier to trust and less likely to be misread by answer systems.',
    external_sources_document_scope: 'Named external sources make factual claims easier to verify and safer to reuse.',
    claim_evidence_section_scope: 'Claims without nearby evidence are harder to trust and reuse with confidence.',
    citation_support_document_scope: 'Claims and sources need to stay close together so the evidence is immediately clear.',
    internal_links_document_scope: 'Supportive internal links help readers and crawlers follow the argument without guesswork.',
    article_schema_non_inline: 'Article-like pages are easier to trust when a primary article schema is present and complete.',
    faq_jsonld_generation_non_inline: 'FAQ schema only works well when the visible content already follows a clear Q&A pattern.',
    howto_schema_non_inline: 'HowTo extraction works best when the visible content is already broken into explicit steps.',
    itemlist_schema_non_inline: 'Visible ranked or resource-style lists are easier to parse when ItemList schema expresses the same items and order.',
    heading_like_markup_non_inline: 'Structural section labels are easier to parse when they use real heading markup instead of paragraph styling alone.'
};

const DETERMINISTIC_WHY_FALLBACK_VARIANTS = [
    ({ checkName }) => `${checkName} affects whether this section is interpreted as reliable evidence.`,
    ({ checkName }) => `Weak ${checkName} signals can lower retrieval precision and citation confidence.`,
    ({ checkName }) => `${checkName} is a grounding signal; weak coverage can reduce answer reliability.`,
    ({ checkName }) => `Strong ${checkName} cues help machine readers rank and reuse this content safely.`
];

const clampGuidanceText = (value, max = 280) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const ensureSentence = (value) => {
    const text = clampGuidanceText(value, 420);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
};

const stripGuidanceScaffold = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text
        .replace(/\bnext steps:\s*/gi, '')
        .replace(/\buse this pattern:\s*/gi, '')
        .replace(/\breview guidance\.?\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeStepText = (value, max = 220) => {
    const text = clampGuidanceText(value, max);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
};

const countWords = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

const trimToWordLimit = (value, maxWords = 60) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const words = text.split(' ');
    if (words.length <= maxWords) return text;
    return `${words.slice(0, maxWords).join(' ').replace(/[.,;:!?-]+$/g, '').trim()}...`;
};

const normalizeComparisonText = (value) => String(value || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isNearDuplicateText = (left, right) => {
    const a = normalizeComparisonText(left);
    const b = normalizeComparisonText(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
};

const normalizeGuidanceSteps = (value) => {
    const raw = Array.isArray(value)
        ? value
        : (typeof value === 'string' && value.trim() ? [value] : []);
    return raw
        .map((step) => normalizeStepText(step, 220))
        .filter(Boolean)
        .slice(0, 4);
};

const normalizeExplanationPack = (rawPack, context = {}) => {
    if (!rawPack || typeof rawPack !== 'object') return null;
    const whatFailed = clampGuidanceText(
        sanitizeGuardrailTextForUser(rawPack.what_failed || rawPack.message || '', { ...context, field: 'what_failed' }),
        300
    );
    const whyItMatters = clampGuidanceText(
        sanitizeGuardrailTextForUser(rawPack.why_it_matters || '', { ...context, field: 'why_it_matters' }),
        320
    );
    const howToFixSteps = normalizeGuidanceSteps(rawPack.how_to_fix_steps);
    const examplePattern = clampGuidanceText(rawPack.example_pattern || '', 260);
    const issueExplanation = clampGuidanceText(
        sanitizeGuardrailTextForUser(rawPack.issue_explanation || '', { ...context, field: 'issue_explanation' }),
        420
    );
    if (!whatFailed && !whyItMatters && howToFixSteps.length === 0 && !examplePattern && !issueExplanation) {
        return null;
    }
    return {
        ...(whatFailed ? { what_failed: whatFailed } : {}),
        ...(whyItMatters ? { why_it_matters: whyItMatters } : {}),
        ...(howToFixSteps.length ? { how_to_fix_steps: howToFixSteps } : {}),
        ...(examplePattern ? { example_pattern: examplePattern } : {}),
        ...(issueExplanation ? { issue_explanation: issueExplanation } : {})
    };
};

const isGenericRepairInstruction = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    return GENERIC_REPAIR_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text));
};

const UI_INSTRUCTION_STEP_PATTERNS = [
    /^use jump to block/i,
    /^view details/i,
    /^this issue is absence-based/i,
    /^this check is recommendation-only by policy/i
];

const isUiInstructionStep = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    return UI_INSTRUCTION_STEP_PATTERNS.some((pattern) => pattern.test(text));
};

const LOW_VALUE_FIX_STEP_PATTERNS = [
    /^revise the quoted passage/i,
    /^start from the quoted passage/i,
    /^edit the quoted section/i,
    /^locate the section/i,
    /^locate the flagged snippet/i,
    /^edit this specific snippet/i,
    /^re-run analysis/i,
    /^run analysis again/i,
    /^apply one high-impact edit/i
];

const isLowValueFixStep = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    return LOW_VALUE_FIX_STEP_PATTERNS.some((pattern) => pattern.test(text));
};

const QUESTION_ANCHOR_GATED_CHECKS = new Set([
    'immediate_answer_placement',
    'answer_sentence_concise',
    'question_answer_alignment',
    'clear_answer_formatting'
]);

const ANSWER_EXTRACTABILITY_DETAIL_CHECKS = new Set([
    'immediate_answer_placement',
    'answer_sentence_concise',
    'question_answer_alignment',
    'clear_answer_formatting',
    'faq_structure_opportunity'
]);

const INTERNAL_GUARDRAIL_EXPLANATION_PATTERNS = [
    /strict question anchor/i,
    /cannot be evaluated/i,
    /remains unproven/i,
    /could not be validated/i,
    /no strict question anchors? (?:were|was) detected/i
];

const isInternalGuardrailExplanation = (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    return INTERNAL_GUARDRAIL_EXPLANATION_PATTERNS.some((pattern) => pattern.test(text));
};

const buildQuestionAnchorEditorialExplanation = (checkId, reason) => {
    const normalizedCheckId = String(checkId || '').trim();
    const normalizedReason = String(reason || '').trim().toLowerCase();
    if (normalizedCheckId === 'faq_structure_opportunity') {
        return normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The article contains answerable topics, but this section reads more like an explainer than a clean question-and-answer pair, so FAQ extraction remains only partial.'
            : 'The content shares useful information, but it is not organized into explicit question-and-answer pairs that support reliable FAQ extraction.';
    }
    if (normalizedCheckId === 'faq_jsonld_generation_suggestion') {
        return normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The article hints at answerable topics, but this section reads more like an explainer than a clean question-and-answer pair, so FAQ schema guidance remains only partial.'
            : 'The content is not framed as clear question-and-answer pairs, so FAQ schema support is only partial.';
    }
    const answerFallbackByCheck = {
        immediate_answer_placement: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The topic is introduced clearly, but the opening delays the headline or section promise, so immediate answer extraction remains only partial.'
            : 'The opening is informative, but it does not fulfill the headline or section promise quickly enough for direct extraction.',
        answer_sentence_concise: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The answer idea is present, but the opening still reads more like setup than a clean response to the headline or section promise.'
            : 'The content includes useful detail, but it is not shaped like a clean answer snippet that fulfills the headline or section promise.',
        question_answer_alignment: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The response appears relevant, but the opening does not resolve the headline or section promise cleanly enough to prove strong alignment.'
            : 'The section is informative, but it does not resolve the headline or section promise cleanly enough to prove clear alignment.',
        clear_answer_formatting: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The content covers the topic, but the answer stays buried under the headline or section promise instead of standing out cleanly.'
            : 'The section shares useful information, but the answer still does not stand out clearly beneath the headline or section promise.'
    };
    if (answerFallbackByCheck[normalizedCheckId]) {
        return answerFallbackByCheck[normalizedCheckId];
    }
    return normalizedReason === 'invalid_or_missing_question_anchor'
        ? 'The article covers the topic, but the opening does not yet fulfill the headline or section promise cleanly enough for direct-answer extraction.'
        : 'The content is informative, but the answer does not yet fulfill the headline or section promise cleanly enough for direct extraction.';
};

const buildQuestionAnchorEditorialWhy = (checkId) => {
    if (String(checkId || '').trim() === 'faq_structure_opportunity') {
        return 'Reusable FAQ sections work best when repeated user questions are grouped into short, explicit question-and-answer pairs.';
    }
    return 'Clear headline-or-query to answer structure makes answer spans easier to extract, trust, and cite consistently.';
};

const getAnswerExtractabilitySnippetWordCount = (context = {}) => {
    const candidates = [
        context.snippet,
        context.checkData?.details?.answer_snippet,
        context.checkData?.details?.selected_answer_snippet,
        context.checkData?.details?.answer_sentence,
        context.checkData?.details?.first_answer_sentence
    ];
    const snippet = candidates
        .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
    return snippet ? countWords(snippet) : 0;
};

const buildConciseAnswerSnippetFallbackText = () => (
    'The opening answer does not yet read as a clean reusable snippet. Tighten it so it stands alone cleanly without extra setup or filler.'
);

const buildImmediateAnswerPlacementFallbackText = () => (
    'The opening does not reach a clear direct answer early enough to fulfill the headline or section promise.'
);

const buildConciseAnswerNearRangeFallbackText = () => (
    'The opening answer is close, but it still needs a tighter standalone shape to read as a clean reusable snippet.'
);

const hasAnswerExtractabilityThresholdMath = (text = '') => {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) return false;
    return /120[-\s]*word/.test(normalized)
        || /40\s*-\s*60\s*word/.test(normalized)
        || /\bbelow the 40-60 word threshold\b/.test(normalized)
        || /\bideal 60-word threshold\b/.test(normalized)
        || /\bquestion anchor\b/.test(normalized);
};

const hasImplausibleConciseAnswerMath = (text, context = {}) => {
    if (String(context.checkId || '').trim() !== 'answer_sentence_concise') {
        return false;
    }
    const snippetWordCount = getAnswerExtractabilitySnippetWordCount(context);
    if (!snippetWordCount) {
        return false;
    }
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return false;
    }

    const overThresholdMatch = normalized.match(
        /(\d+)\s+words?\s+over\s+the\s+ideal\s+(\d+)(?:\s*-\s*(\d+))?[\s-]*word\s+threshold/i
    );
    if (overThresholdMatch) {
        const overBy = Number(overThresholdMatch[1]);
        const high = Number(overThresholdMatch[3] || overThresholdMatch[2]);
        const expectedWordCount = high + overBy;
        if (snippetWordCount <= high) {
            return true;
        }
        if (Math.abs(expectedWordCount - snippetWordCount) >= 18) {
            return true;
        }
    }

    const explicitWordCountMatch = normalized.match(
        /(?:opening answer|answer sentence|first sentence|opening sentence|answer)\s+(?:is|has)\s+(\d+)\s+words?/i
    );
    if (explicitWordCountMatch) {
        const claimedWordCount = Number(explicitWordCountMatch[1]);
        if (Math.abs(claimedWordCount - snippetWordCount) >= 18) {
            return true;
        }
    }

    return false;
};

const sanitizeGuardrailTextForUser = (value, context = {}) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!isInternalGuardrailExplanation(text)) {
        return text;
    }
    const checkId = String(context.checkId || '').trim();
    const reason = String(
        context.guardrailReason
        || context.failureReason
        || context.checkData?.guardrail_reason
        || ''
    ).trim().toLowerCase();
    if (!QUESTION_ANCHOR_GATED_CHECKS.has(checkId)) {
        return text;
    }
    if (context.field === 'why_it_matters') {
        return buildQuestionAnchorEditorialWhy(checkId);
    }
    if (context.field === 'issue_explanation') {
        return '';
    }
    return buildQuestionAnchorEditorialExplanation(checkId, reason);
};

const normalizeAnswerExtractabilityFailureText = (value, context = {}) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const checkId = String(context.checkId || '').trim();

    if (
        checkId === 'immediate_answer_placement'
        && (
            /answer appears at 121-150 words after the question anchor/i.test(text)
            || /direct answer starts at \d+ words/i.test(text)
            || hasAnswerExtractabilityThresholdMath(text)
        )
    ) {
        return buildImmediateAnswerPlacementFallbackText();
    }

    if (
        checkId === 'answer_sentence_concise'
        && /lacks (?:direct|specific) evidence|evidence for the claim/i.test(text)
    ) {
        return buildConciseAnswerNearRangeFallbackText();
    }

    if (
        checkId === 'answer_sentence_concise'
        && (hasImplausibleConciseAnswerMath(text, context) || hasAnswerExtractabilityThresholdMath(text))
    ) {
        return buildConciseAnswerSnippetFallbackText();
    }

    return text;
};

const resolveRawIssueExplanationForUser = (value, context = {}, fallbackMessage = '') => {
    const checkId = String(context.checkId || '').trim();
    if (!ANSWER_EXTRACTABILITY_DETAIL_CHECKS.has(checkId)) {
        return '';
    }
    const guardrailReason = String(
        context.guardrailReason
        || context.checkData?.guardrail_reason
        || ''
    ).trim().toLowerCase();
    if (
        context.checkData?.guardrail_adjusted
        || guardrailReason === 'no_strict_question_anchor'
        || guardrailReason === 'invalid_or_missing_question_anchor'
    ) {
        return '';
    }
    const sanitized = clampGuidanceText(
        sanitizeGuardrailTextForUser(value || '', { ...context, field: 'issue_explanation' }),
        420
    );
    if (!sanitized) {
        return '';
    }
    const normalizedExtractability = normalizeAnswerExtractabilityFailureText(sanitized, context);
    if (normalizedExtractability && normalizedExtractability !== sanitized) {
        return clampGuidanceText(normalizedExtractability, 420);
    }
    return sanitized;
};

const resolvePreferredRawIssueExplanationForUser = (candidates, context = {}, fallbackMessage = '') => {
    const queue = Array.isArray(candidates) ? candidates : [candidates];
    const fallback = String(fallbackMessage || '').trim();
    let best = '';
    let bestScore = -1;
    for (const candidate of queue) {
        const resolved = resolveRawIssueExplanationForUser(candidate, context, fallbackMessage);
        if (resolved) {
            const score = (isNearDuplicateText(resolved, fallback) ? 0 : 5) + Math.min(countWords(resolved), 60);
            if (score > bestScore) {
                best = resolved;
                bestScore = score;
            }
        }
    }
    return best;
};

const hasSubstantiveExplanationPackContent = (pack) => {
    if (!pack || typeof pack !== 'object') return false;
    if (typeof pack.what_failed === 'string' && pack.what_failed.trim()) return true;
    if (typeof pack.why_it_matters === 'string' && pack.why_it_matters.trim()) return true;
    if (typeof pack.issue_explanation === 'string' && pack.issue_explanation.trim()) return true;
    return Array.isArray(pack.how_to_fix_steps) && pack.how_to_fix_steps.some((step) => typeof step === 'string' && step.trim());
};

const shouldPreserveAnalyzerExplanationPack = (checkId, context = {}, pack = null) => {
    const normalizedCheckId = String(checkId || '').trim();
    if (!ANSWER_EXTRACTABILITY_DETAIL_CHECKS.has(normalizedCheckId)) {
        return false;
    }
    if (!hasSubstantiveExplanationPackContent(pack)) {
        return false;
    }
    const guardrailReason = String(
        context.guardrailReason
        || context.failureReason
        || context.checkData?.guardrail_reason
        || ''
    ).trim().toLowerCase();
    if (
        context.checkData?.guardrail_adjusted
        || guardrailReason === 'no_strict_question_anchor'
        || guardrailReason === 'invalid_or_missing_question_anchor'
    ) {
        return false;
    }
    return true;
};

const inferExamplePattern = ({ rewriteTarget, failureReason, checkId }) => {
    const operation = String(rewriteTarget?.operation || '').toLowerCase().trim();
    const reason = String(failureReason || '').toLowerCase().trim();
    const id = String(checkId || '').toLowerCase().trim();

    if (operation === 'convert_to_list' || operation === 'convert_to_steps') {
        return 'Lead with one direct sentence, then use 3-5 bullets with concrete actions or facts.';
    }
    if (operation === 'heading_support_range' || reason.includes('heading') || id.includes('heading')) {
        return 'Keep the heading, then add 2-3 supporting sentences: definition, concrete detail, and takeaway.';
    }
    if (reason.includes('citation') || reason.includes('source') || id.includes('citation') || id.includes('claim')) {
        return 'State the claim directly, add a verifiable source nearby, and include one concrete number/date.';
    }
    return 'Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.';
};

const resolveCheckAwareFixHint = ({
    checkId,
    failureReason,
    actionSuggestion,
    rewriteTarget
}) => {
    const normalizedCheckId = String(checkId || '').trim();
    const normalizedReason = String(failureReason || '').trim().toLowerCase();
    const operation = String(rewriteTarget?.operation || '').trim().toLowerCase();
    const suggested = normalizeStepText(actionSuggestion, 160);

    if (suggested && !isGenericRepairInstruction(suggested) && !isUiInstructionStep(suggested) && !isLowValueFixStep(suggested)) {
        return suggested;
    }
    if (normalizedCheckId === 'faq_jsonld_generation_suggestion' && normalizedReason === 'faq_jsonld_generation_non_inline') {
        return 'Rewrite the content into visible Q&A pairs before adding FAQ schema.';
    }

    const byCheckId = {
        immediate_answer_placement: 'Place one direct answer sentence immediately after the heading or opening line that carries the section promise, then move setup or caveats after it.',
        answer_sentence_concise: 'Keep the opening answer near 40-60 words total. Two or three short sentences are fine if they deliver one complete answer.',
        question_answer_alignment: 'Use the query term in the opening answer and answer it directly, not indirectly.',
        clear_answer_formatting: 'Split the opening answer into short, scannable sentences or bullets so the main point stands alone.',
        faq_structure_opportunity: 'Only convert this section into FAQ format if it answers repeated user questions with short, direct answers.',
        faq_jsonld_generation_suggestion: 'Generate FAQ schema from the detected FAQ-ready pairs and review the draft before inserting it.',
        readability_adaptivity: 'Shorten long sentences, reduce clause stacking, and replace jargon so the passage scans cleanly on first read.',
        appropriate_paragraph_length: 'Split this paragraph into 2-3 shorter paragraphs, keeping one claim and one support detail per paragraph.',
        external_authoritative_sources: 'Name the source directly and place it next to the factual claim it supports.',
        claim_provenance_and_evidence: 'Add one concrete source, statistic, date, or example directly next to the claim.',
        original_evidence_signal: 'Add one first-hand example, proprietary observation, or original measurement that only this page can provide.',
        citation_format_and_context: 'Place the claim and its named source in the same sentence or the next sentence.',
        temporal_claim_check: 'Add an explicit date, time window, or update marker wherever the claim implies recency or change over time.',
        named_entities_detected: 'Name the relevant person, company, product, or place explicitly instead of relying on generic labels or pronouns.',
        promotional_or_commercial_intent: 'Replace hype or imperative language with neutral wording and one verifiable supporting detail.',
        internal_link_context_relevance: 'Add one relevant internal link next to the concept it supports, using descriptive anchor text.',
        article_jsonld_presence_and_completeness: 'Generate Article JSON-LD for this page and review the required fields before inserting it.',
        howto_schema_presence_and_completeness: 'Generate HowTo schema from the detected steps and review the draft before inserting it.',
        howto_jsonld_presence_and_completeness: 'Rewrite the section as numbered steps before adding HowTo schema.',
        howto_semantic_validity: 'Turn the section into ordered steps with one action per step and no promotional filler.',
        itemlist_jsonld_presence_and_completeness: 'Generate ItemList JSON-LD from the visible list entries and review the draft before inserting it.',
        heading_like_text_uses_heading_markup: 'Convert this section label into a real heading block that matches the surrounding outline level.',
        semantic_html_usage: 'Replace generic containers with semantic headings, sections, or lists that match the visible structure.',
        canonical_clarity: 'Set one absolute canonical URL that points to this page’s preferred public version.',
        ai_crawler_accessibility: 'Remove restrictive indexing or snippet directives if this page should be reusable by answer engines.'
    };
    if (Object.prototype.hasOwnProperty.call(byCheckId, normalizedCheckId)) {
        return byCheckId[normalizedCheckId];
    }

    if (operation === 'convert_to_list' || operation === 'convert_to_steps') {
        return 'Convert the dense sentence into bullets or steps so each item carries one action or fact.';
    }
    if (operation === 'heading_support_range') {
        return 'Keep the heading and rewrite the supporting lines so each sentence adds one concrete supporting point.';
    }

    const byReason = {
        block_wide: 'Break the section into shorter claim-level sentences so one idea stands on its own.',
        too_wide: 'Narrow the section to one main claim and one supporting detail.',
        low_precision: 'Replace vague wording with one explicit claim and one concrete support detail.',
        external_sources_document_scope: 'Add one named authoritative source near the strongest factual claim.',
        claim_evidence_section_scope: 'Support the main claim with one statistic, source, or example in the same section.',
        citation_support_document_scope: 'Put the claim and its citation together so the evidence is immediately visible.',
        internal_links_document_scope: 'Add a relevant internal link where the supporting concept is first mentioned.',
        article_schema_non_inline: 'Add primary Article JSON-LD with headline, author, date, and page reference that matches this page.',
        faq_jsonld_generation_non_inline: 'Rewrite the content into visible Q&A pairs before adding FAQ schema.',
        howto_schema_non_inline: 'Rewrite the content into numbered steps before adding HowTo schema.',
        itemlist_schema_non_inline: 'Add ItemList JSON-LD that mirrors the visible list entries and their order.',
        heading_like_markup_non_inline: 'Convert the pseudo-heading paragraph into a real heading that matches the surrounding outline.',
        semantic_structure_non_inline: 'Use headings, sections, and lists that match the visible structure of the content.',
        missing_required_h1: 'Add one clear H1 that states the main page topic in plain language.',
        missing_author_byline: 'Add a visible byline near the title with the author name.',
        missing_author_bio: 'Add a short author bio that shows relevant expertise for this topic.'
    };
    if (Object.prototype.hasOwnProperty.call(byReason, normalizedReason)) {
        return byReason[normalizedReason];
    }

    return 'Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.';
};

const buildSemanticWhyItMatters = ({ checkName, checkId, failureReason }) => {
    const normalizedCheckId = String(checkId || '').trim();
    const normalizedReason = String(failureReason || '').trim().toLowerCase();
    const byCheck = SEMANTIC_WHY_IT_MATTERS_BY_CHECK[normalizedCheckId];
    if (byCheck) return clampGuidanceText(byCheck, 220);
    const byReason = SEMANTIC_WHY_IT_MATTERS_BY_REASON[normalizedReason];
    if (byReason) return clampGuidanceText(byReason, 220);
    return clampGuidanceText(
        `${String(checkName || 'This issue')} weakens trust, extraction quality, or citation reliability for this section.`,
        220
    );
};

const buildSemanticRecommendationNarrative = ({
    checkId,
    checkName,
    failureReason,
    actionSuggestion,
    rewriteTarget,
    whyItMatters,
    summaryMessage,
    fixSteps = []
}) => {
    const conciseSummary = trimToWordLimit(clampGuidanceText(summaryMessage || '', 220), 20);
    const conciseWhy = trimToWordLimit(clampGuidanceText(whyItMatters || '', 180), 18);
    const fixCandidates = [];
    const pushFixCandidate = (value) => {
        const normalized = normalizeStepText(value, 180);
        if (!normalized || isLowValueFixStep(normalized) || isUiInstructionStep(normalized)) return;
        if (fixCandidates.some((candidate) => isNearDuplicateText(candidate, normalized))) return;
        fixCandidates.push(normalized);
    };
    pushFixCandidate(resolveCheckAwareFixHint({
        checkId,
        failureReason,
        actionSuggestion,
        rewriteTarget
    }));
    normalizeGuidanceSteps(fixSteps).forEach((step) => pushFixCandidate(step));

    const sentenceOneParts = [];
    if (conciseSummary) {
        sentenceOneParts.push(conciseSummary);
    }
    if (conciseWhy && !isNearDuplicateText(conciseWhy, conciseSummary)) {
        sentenceOneParts.push(conciseWhy);
    }
    const sentenceOne = ensureSentence(trimToWordLimit(sentenceOneParts.join(' '), 36));

    const primaryFix = fixCandidates.find((candidate) =>
        candidate
        && !isNearDuplicateText(candidate, sentenceOne)
        && !isNearDuplicateText(candidate, conciseSummary)
        && !isNearDuplicateText(candidate, conciseWhy)
    ) || '';
    const sentenceTwo = primaryFix ? ensureSentence(trimToWordLimit(primaryFix, 20)) : '';

    const narrativeParts = [sentenceOne, sentenceTwo].filter(Boolean);
    let narrative = trimToWordLimit(narrativeParts.join(' ').replace(/\s+/g, ' ').trim(), 60);

    if (countWords(narrative) < 40) {
        const secondaryFix = fixCandidates.find((candidate) =>
            candidate
            && !isNearDuplicateText(candidate, primaryFix)
            && !isNearDuplicateText(candidate, narrative)
            && !isNearDuplicateText(candidate, sentenceOne)
        ) || '';
        if (secondaryFix) {
            narrative = trimToWordLimit(
                [...narrativeParts, ensureSentence(trimToWordLimit(secondaryFix, 14))]
                    .filter(Boolean)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim(),
                60
            );
        }
    }

    return narrative;
};

const resolveNonSemanticNarrativeCloser = ({ checkId, failureReason }) => {
    const normalizedCheckId = String(checkId || '').trim().toLowerCase();
    const normalizedReason = String(failureReason || '').trim().toLowerCase();
    if (normalizedCheckId === 'single_h1' || normalizedReason === 'missing_required_h1') {
        return 'Keep one H1 for the page topic and nest deeper sections under H2/H3.';
    }
    if (normalizedCheckId === 'metadata_checks' || normalizedReason === 'metadata_document_scope') {
        return 'Keep metadata aligned with the page topic and visible claims.';
    }
    if (normalizedCheckId === 'author_identified' || normalizedReason === 'missing_author_byline') {
        return 'Keep authorship details visible and consistent with the site profile.';
    }
    if (normalizedCheckId === 'author_bio_present' || normalizedReason === 'missing_author_bio') {
        return 'Keep expertise details visible and consistent with the author profile.';
    }
    if (normalizedCheckId === 'schema_matches_content' || normalizedReason === 'schema_content_alignment_non_inline') {
        return 'Keep structured fields aligned with the exact visible wording.';
    }
    if (normalizedCheckId === 'article_jsonld_presence_and_completeness' || normalizedReason === 'article_schema_non_inline') {
        return 'Keep the article schema fields aligned with the visible metadata and page URL.';
    }
    if (normalizedCheckId === 'itemlist_jsonld_presence_and_completeness' || normalizedReason === 'itemlist_schema_non_inline') {
        return 'Keep the schema list entries aligned with the visible item order and labels.';
    }
    if (normalizedCheckId === 'semantic_html_usage' || normalizedReason === 'semantic_structure_non_inline') {
        return 'Keep structure and visible content aligned after the markup update.';
    }
    if (normalizedCheckId === 'intro_schema_suggestion' || normalizedReason === 'intro_schema_non_inline') {
        return 'Keep the structured fields consistent with the visible intro.';
    }
    if (normalizedCheckId === 'intro_readability' || normalizedReason === 'intro_readability_non_inline') {
        return 'Keep the revised intro direct, scannable, and easy to parse.';
    }
    if (normalizedCheckId === 'intro_focus_and_factuality.v1' || normalizedReason === 'intro_composite_non_inline') {
        return 'Keep the opening direct, specific, and supported by one concrete fact.';
    }
    if (normalizedCheckId === 'appropriate_paragraph_length') {
        return 'Keep each paragraph focused on one claim and one support detail.';
    }
    return 'Keep the revised copy specific, visible, and aligned with the page topic.';
};

const buildNonSemanticRecommendationNarrative = ({
    checkId,
    failureReason,
    summaryMessage,
    whyItMatters,
    fixSteps = []
}) => {
    const conciseSummary = trimToWordLimit(clampGuidanceText(summaryMessage || '', 220), 20);
    const conciseWhy = trimToWordLimit(clampGuidanceText(whyItMatters || '', 180), 18);
    const fixCandidates = normalizeGuidanceSteps(fixSteps).filter((step) =>
        step
        && !isLowValueFixStep(step)
        && !isUiInstructionStep(step)
    );

    const sentenceOneParts = [];
    if (conciseSummary) {
        sentenceOneParts.push(conciseSummary);
    }
    if (conciseWhy && !isNearDuplicateText(conciseWhy, conciseSummary)) {
        sentenceOneParts.push(conciseWhy);
    }
    const sentenceOne = ensureSentence(trimToWordLimit(sentenceOneParts.join(' '), 38));

    const usedParts = [sentenceOne].filter(Boolean);
    const pickNextCandidate = () => fixCandidates.find((candidate) =>
        candidate
        && !usedParts.some((part) => isNearDuplicateText(candidate, part))
        && !isNearDuplicateText(candidate, conciseSummary)
        && !isNearDuplicateText(candidate, conciseWhy)
    ) || '';

    const primaryFix = pickNextCandidate();
    if (primaryFix) {
        usedParts.push(ensureSentence(trimToWordLimit(primaryFix, 18)));
    }

    if (countWords(usedParts.join(' ')) < 40) {
        const secondaryFix = pickNextCandidate();
        if (secondaryFix) {
            usedParts.push(ensureSentence(trimToWordLimit(secondaryFix, 14)));
        }
    }

    if (countWords(usedParts.join(' ')) < 40) {
        const closer = normalizeStepText(resolveNonSemanticNarrativeCloser({ checkId, failureReason }), 180);
        if (
            closer
            && !usedParts.some((part) => isNearDuplicateText(closer, part))
            && !isNearDuplicateText(closer, conciseSummary)
            && !isNearDuplicateText(closer, conciseWhy)
        ) {
            usedParts.push(ensureSentence(trimToWordLimit(closer, 16)));
        }
    }

    return trimToWordLimit(usedParts.join(' ').replace(/\s+/g, ' ').trim(), 60);
};

const pickDeterministicVariant = (variants, seed) => {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    const idx = stableHash(seed) % variants.length;
    const candidate = variants[idx];
    if (!candidate || typeof candidate !== 'object') return null;
    return candidate;
};

const buildDeterministicExplanationPack = ({ checkId, runId, instanceIndex, message, snippet, rewriteTarget, failureReason }) => {
    const catalog = loadDeterministicExplanationCatalog();
    const checks = catalog && typeof catalog === 'object' && catalog.checks && typeof catalog.checks === 'object'
        ? catalog.checks
        : {};
    const entry = checks[String(checkId || '')];
    const normalizedReason = String(failureReason || '').trim().toLowerCase();
    const reasonVariants = entry && entry.variants_by_reason && typeof entry.variants_by_reason === 'object'
        ? entry.variants_by_reason[normalizedReason]
        : null;
    const variantPool = Array.isArray(reasonVariants) && reasonVariants.length > 0
        ? reasonVariants
        : entry?.variants;
    const seed = `${String(runId || '')}:${String(checkId || '')}:${Number.isFinite(instanceIndex) ? instanceIndex : 0}`;
    const selectedVariant = pickDeterministicVariant(variantPool, seed);
    const normalizedVariant = normalizeExplanationPack(selectedVariant);
    if (normalizedVariant) {
        const preferredWhatFailed = clampGuidanceText(message || '', 300);
        return normalizeExplanationPack({
            ...normalizedVariant,
            what_failed: preferredWhatFailed
                && !isAggregateInlineMessage(preferredWhatFailed)
                && clampGuidanceText(snippet || '', 40)
                ? preferredWhatFailed
                : normalizedVariant.what_failed
        });
    }

    const fallbackSteps = [];
    const fallbackStepByCheckId = {
        canonical_clarity: 'Set one absolute canonical URL that points to this page\'s preferred canonical URL.',
        ai_crawler_accessibility: 'Remove restrictive indexing or snippet directives if this page should be reusable by answer engines.',
        itemlist_jsonld_presence_and_completeness: 'Add ItemList JSON-LD that mirrors the visible list entries and their order.',
        heading_like_text_uses_heading_markup: 'Convert the pseudo-heading paragraph into a real heading that matches the surrounding outline.'
    };
    const preferredSpecificStep = String(fallbackStepByCheckId[String(checkId || '').trim()] || '').trim();
    if (preferredSpecificStep) {
        fallbackSteps.push(preferredSpecificStep);
    }
    if (snippet) {
        fallbackSteps.push('Edit this specific sentence first, then tighten the surrounding wording for clarity.');
    } else {
        fallbackSteps.push('Locate the affected section and revise the weakest sentence first.');
    }
    fallbackSteps.push('Add concrete, verifiable detail so the section can be extracted and cited reliably.');
    fallbackSteps.push('Review the revised section and confirm the claim now reads clearly and specifically.');
    const fallbackCheckName = String(checkId || 'this check');
    const whySeed = `${String(runId || '')}:${fallbackCheckName}:${Number.isFinite(instanceIndex) ? instanceIndex : 0}:deterministic-why`;
    const whyIdx = stableHash(whySeed) % DETERMINISTIC_WHY_FALLBACK_VARIANTS.length;
    const whyBuilder = DETERMINISTIC_WHY_FALLBACK_VARIANTS[whyIdx];
    const fallbackWhy = typeof whyBuilder === 'function'
        ? whyBuilder({ checkName: fallbackCheckName })
        : `Weak ${fallbackCheckName} signals can reduce retrieval precision and citation confidence.`;
    return {
        what_failed: clampGuidanceText(message || `${String(checkId || 'This check')} did not meet its structural threshold.`, 300),
        why_it_matters: clampGuidanceText(fallbackWhy, 320),
        how_to_fix_steps: normalizeGuidanceSteps(fallbackSteps),
        example_pattern: inferExamplePattern({ rewriteTarget, failureReason, checkId })
    };
};

const buildSyntheticFallbackExplanationPack = ({
    checkName,
    message,
    actionSuggestion,
    snippet,
    failureReason
}) => {
    const normalizedReason = String(failureReason || '').trim().toLowerCase();
    const whatFailedByReason = {
        time_budget_exceeded: `Analyzer reached the run time budget before ${checkName} completed.`,
        chunk_parse_failure: `Analyzer returned incomplete output for ${checkName} in this run.`,
        truncated_response: `Analyzer response was truncated before ${checkName} completed.`
    };
    const whatFailed = clampGuidanceText(
        message
        || whatFailedByReason[normalizedReason]
        || `Analyzer did not complete ${checkName} in this run.`,
        300
    );
    const steps = [];
    if (actionSuggestion && !isGenericRepairInstruction(actionSuggestion) && !isUiInstructionStep(actionSuggestion)) {
        steps.push(actionSuggestion);
    } else if (snippet) {
        steps.push('Edit the quoted section to strengthen one clear claim and add one concrete support detail.');
    } else {
        steps.push(`Apply one high-impact edit for ${checkName} in the most relevant section.`);
    }
    steps.push('Run analysis again to get a complete result for this check.');
    return normalizeExplanationPack({
        what_failed: whatFailed,
        why_it_matters: 'This check is currently incomplete, so potential citation and extractability gaps may still be present.',
        how_to_fix_steps: normalizeGuidanceSteps(steps).slice(0, 2)
    });
};

const buildIssueExplanationPack = ({
    checkId,
    checkData,
    message,
    actionSuggestion,
    snippet,
    failureReason,
    rewriteTarget,
    sourcePack,
    runId,
    instanceIndex
}) => {
    const definitionMeta = getCheckDefinitionMeta(checkId);
    const checkName = clampGuidanceText(
        checkData?.title
        || checkData?.name
        || definitionMeta?.name
        || checkId
        || 'this check',
        120
    );
    const normalizedFailureReason = String(failureReason || '').trim().toLowerCase();
    const explanationContext = {
        checkId,
        failureReason,
        checkData,
        guardrailReason: checkData?.guardrail_reason || '',
        snippet
    };
    const guardrailReason = String(explanationContext.guardrailReason || normalizedFailureReason || '').trim().toLowerCase();
    const questionAnchorGuardrailActive = QUESTION_ANCHOR_GATED_CHECKS.has(String(checkId || '').trim())
        && (guardrailReason === 'no_strict_question_anchor' || guardrailReason === 'invalid_or_missing_question_anchor');
    const resolvedMessage = clampGuidanceText(
        normalizeAnswerExtractabilityFailureText(
            sanitizeGuardrailTextForUser(
                message
                || checkData?.explanation
                || `${checkName} did not meet the required quality threshold.`,
                { ...explanationContext, field: 'what_failed' }
            ),
            explanationContext
        ),
        300
    );
    if (isSyntheticFallbackReason(normalizedFailureReason)) {
        return buildSyntheticFallbackExplanationPack({
            checkName,
            message: resolvedMessage,
            actionSuggestion,
            snippet,
            failureReason: normalizedFailureReason
        });
    }
    const aiPack = normalizeExplanationPack(sourcePack, explanationContext)
        || normalizeExplanationPack(checkData?.ai_explanation_pack, explanationContext)
        || normalizeExplanationPack(checkData?.explanation_pack, explanationContext);
    const rawIssueExplanation = resolvePreferredRawIssueExplanationForUser(
        [
            checkData?.issue_explanation || '',
            message || '',
            checkData?.explanation || ''
        ],
        explanationContext,
        resolvedMessage
    );
    if (aiPack) {
        const preserveAnalyzerPack = shouldPreserveAnalyzerExplanationPack(checkId, explanationContext, aiPack);
        const focusedFixHint = resolveCheckAwareFixHint({
            checkId,
            failureReason,
            actionSuggestion,
            rewriteTarget
        });
        const merged = {
            ...aiPack
        };
        if (!preserveAnalyzerPack || !String(merged.what_failed || '').trim()) {
            merged.what_failed = resolvedMessage;
        }
        if (!String(merged.why_it_matters || '').trim()) {
            merged.why_it_matters = (
                questionAnchorGuardrailActive
                    ? buildQuestionAnchorEditorialWhy(checkId)
                    : buildSemanticWhyItMatters({
                        checkName,
                        checkId,
                        failureReason: normalizedFailureReason
                    })
            );
        }
        if (rawIssueExplanation && !merged.issue_explanation) {
            merged.issue_explanation = rawIssueExplanation;
        }
        if ((!Array.isArray(merged.how_to_fix_steps) || merged.how_to_fix_steps.length === 0)
            && focusedFixHint) {
            merged.how_to_fix_steps = [normalizeStepText(focusedFixHint, 160)];
        }
        delete merged.example_pattern;
        return normalizeExplanationPack(merged, explanationContext);
    }

    if (isDeterministicCheckData(checkData)) {
        return buildDeterministicExplanationPack({
            checkId,
            runId,
            instanceIndex,
            message: resolvedMessage,
            snippet,
            rewriteTarget,
            failureReason
        });
    }

    const whyItMatters = questionAnchorGuardrailActive
        ? buildQuestionAnchorEditorialWhy(checkId)
        : buildSemanticWhyItMatters({
            checkName,
            checkId,
            failureReason: normalizedFailureReason
        });
    const steps = [
        resolveCheckAwareFixHint({
            checkId,
            failureReason,
            actionSuggestion,
            rewriteTarget
        })
    ].filter(Boolean);

    return normalizeExplanationPack({
        what_failed: resolvedMessage,
        why_it_matters: whyItMatters,
        how_to_fix_steps: steps.slice(0, 1),
        ...(rawIssueExplanation ? { issue_explanation: rawIssueExplanation } : {})
    });
};

const buildRecommendationDepthSteps = ({
    checkId,
    checkName,
    snippet,
    actionSuggestion,
    rewriteTarget,
    existingSteps,
    failureReason
}) => {
    const seedSteps = Array.isArray(existingSteps)
        ? existingSteps.filter((step) => !isGenericRepairInstruction(step) && !isUiInstructionStep(step) && !isLowValueFixStep(step))
        : [];
    const steps = [...seedSteps];
    const focusedFixHint = resolveCheckAwareFixHint({
        checkId,
        failureReason,
        actionSuggestion,
        rewriteTarget
    });
    const syntheticFallback = isSyntheticFallbackReason(failureReason);

    if (syntheticFallback) {
        if (steps.length > 0) {
            return normalizeGuidanceSteps(steps).slice(0, 2);
        }
        const syntheticSteps = [];
        if (focusedFixHint) {
            syntheticSteps.push(focusedFixHint);
        } else {
            syntheticSteps.push(`Tighten the core claim for ${checkName} and add one concrete supporting detail.`);
        }
        return normalizeGuidanceSteps(syntheticSteps).slice(0, 2);
    }
    if (steps.length === 0 && focusedFixHint) {
        steps.push(focusedFixHint);
    }

    return normalizeGuidanceSteps(steps).slice(0, 3);
};

const enrichRecommendationExplanationPack = (pack, context = {}) => {
    const normalized = normalizeExplanationPack(pack) || {};
    const checkName = clampGuidanceText(context.checkName || 'this check', 120);
    const snippet = clampGuidanceText(context.snippet || '', 260);
    const fallbackWhatFailed = snippet
        ? `The section for ${checkName} is not specific enough for reliable extraction and citation.`
        : `${checkName} did not provide sufficiently explicit, supportable evidence in this section.`;
    const whatFailed = clampGuidanceText(normalized.what_failed || fallbackWhatFailed, 300);
    const whyItMatters = clampGuidanceText(normalized.why_it_matters || context.whyFallback || '', 220);
    const depthSteps = buildRecommendationDepthSteps({
        checkId: context.checkId || '',
        checkName,
        snippet,
        actionSuggestion: context.actionSuggestion || '',
        rewriteTarget: context.rewriteTarget || null,
        existingSteps: normalized.how_to_fix_steps || [],
        failureReason: context.failureReason || ''
    });
    const syntheticFallback = isSyntheticFallbackReason(context.failureReason);
    const isSemantic = context.isSemantic === true;
    const finalDepthSteps = isSemantic ? depthSteps.slice(0, 1) : depthSteps;
    const preservedIssueExplanation = clampGuidanceText(normalized.issue_explanation || '', 420);
    const preserveIssueExplanationForCheck = ANSWER_EXTRACTABILITY_DETAIL_CHECKS.has(String(context.checkId || '').trim());
    const canonicalIssueExplanation = (!syntheticFallback && preserveIssueExplanationForCheck && preservedIssueExplanation)
        ? preservedIssueExplanation
        : ((!syntheticFallback && isSemantic)
            ? buildSemanticRecommendationNarrative({
                checkId: context.checkId || '',
                checkName,
                failureReason: context.failureReason || '',
                actionSuggestion: context.actionSuggestion || '',
                rewriteTarget: context.rewriteTarget || null,
                whyItMatters,
                summaryMessage: normalized.what_failed || fallbackWhatFailed,
                fixSteps: finalDepthSteps
            })
            : (!syntheticFallback
                ? buildNonSemanticRecommendationNarrative({
                    checkId: context.checkId || '',
                    failureReason: context.failureReason || '',
                    summaryMessage: normalized.what_failed || fallbackWhatFailed,
                    whyItMatters,
                    fixSteps: finalDepthSteps
                })
                : ''));
    const merged = {
        what_failed: whatFailed,
        ...(whyItMatters ? { why_it_matters: whyItMatters } : {}),
        ...(finalDepthSteps.length ? { how_to_fix_steps: finalDepthSteps } : {}),
        ...(canonicalIssueExplanation ? { issue_explanation: canonicalIssueExplanation } : {}),
        ...(!isSemantic && !syntheticFallback && normalized.example_pattern
            ? { example_pattern: normalized.example_pattern }
            : (!isSemantic && !syntheticFallback && context.examplePattern ? { example_pattern: context.examplePattern } : {}))
    };
    return normalizeExplanationPack(merged);
};

const composeIssueExplanationNarrative = (pack) => {
    const normalized = normalizeExplanationPack(pack);
    if (!normalized) return '';
    const explicit = trimToWordLimit(
        clampGuidanceText(stripGuidanceScaffold(pack && pack.issue_explanation ? pack.issue_explanation : ''), 420),
        60
    );
    if (explicit && !isInternalGuardrailExplanation(explicit)) return explicit;

    const firstSentenceParts = [];
    if (normalized.what_failed) {
        firstSentenceParts.push(trimToWordLimit(normalized.what_failed, 22));
    }
    if (normalized.why_it_matters && !isNearDuplicateText(normalized.what_failed, normalized.why_it_matters)) {
        firstSentenceParts.push(trimToWordLimit(normalized.why_it_matters, 16));
    }
    const sentenceOne = ensureSentence(trimToWordLimit(firstSentenceParts.join(' '), 34));

    const fixStep = Array.isArray(normalized.how_to_fix_steps)
        ? normalized.how_to_fix_steps.find((step) =>
            step
            && !isLowValueFixStep(step)
            && !isNearDuplicateText(step, sentenceOne)
            && !isNearDuplicateText(step, normalized.what_failed)
            && !isNearDuplicateText(step, normalized.why_it_matters)
        )
        : '';
    const sentenceTwo = fixStep ? ensureSentence(trimToWordLimit(fixStep, 24)) : '';

    return trimToWordLimit([sentenceOne, sentenceTwo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), 60);
};

const REVIEW_SUMMARY_BY_CHECK = {
    immediate_answer_placement: 'The section reaches the answer only after setup instead of leading with it.',
    answer_sentence_concise: 'The opening answer does not stand alone as a clean reusable snippet for quoting and reuse.',
    question_answer_alignment: 'The response stays near the topic, but it does not cleanly resolve the exact question being asked.',
    clear_answer_formatting: 'The answer is understandable, but the main point stays buried in dense prose instead of standing out clearly.',
    faq_structure_opportunity: 'The section answers repeated user questions, but the answers stay packed into prose instead of reusable FAQ pairs.'
};

const composeReviewSummaryNarrative = (pack, context = {}) => {
    const explicit = clampGuidanceText(String(pack && pack.review_summary || '').trim(), 220);
    if (explicit) {
        return ensureSentence(trimToWordLimit(explicit, 26));
    }
    const checkId = String(context.checkId || '').trim();
    const fallback = REVIEW_SUMMARY_BY_CHECK[checkId];
    if (!fallback) return '';
    return ensureSentence(trimToWordLimit(fallback, 26));
};

const getRuntimeContractCheckPolicy = (checkId) => {
    const runtimeContract = loadRuntimeContract();
    const checks = runtimeContract && typeof runtimeContract === 'object' ? runtimeContract.checks : null;
    if (!checks || typeof checks !== 'object') {
        return null;
    }
    if (!Object.prototype.hasOwnProperty.call(checks, checkId)) {
        return null;
    }
    const entry = checks[checkId];
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const allowedScopesRaw = entry.allowed_scopes;
    const allowedScopes = Array.isArray(allowedScopesRaw)
        ? allowedScopesRaw.map((scope) => String(scope || '').trim()).filter(Boolean)
        : (typeof allowedScopesRaw === 'string' && allowedScopesRaw.trim()
            ? [allowedScopesRaw.trim()]
            : []);
    return {
        analysis_engine: String(entry.analysis_engine || '').trim().toLowerCase(),
        evidence_mode: String(entry.evidence_mode || '').trim().toLowerCase(),
        rewrite_mode: String(entry.rewrite_mode || '').trim().toLowerCase(),
        allowed_scopes: allowedScopes,
        schema_assist_mode: String(entry.schema_assist_mode || '').trim().toLowerCase(),
        schema_assist_insert_mode: String(entry.schema_assist_insert_mode || '').trim().toLowerCase(),
        schema_assist_source_check_id: String(entry.schema_assist_source_check_id || '').trim(),
        schema_assist_target_scope: String(entry.schema_assist_target_scope || '').trim().toLowerCase(),
        schema_assist_identity_basis: String(entry.schema_assist_identity_basis || '').trim().toLowerCase(),
        schema_assist_conflict_strategy: String(entry.schema_assist_conflict_strategy || '').trim().toLowerCase(),
        schema_assist_replace_scope: String(entry.schema_assist_replace_scope || '').trim().toLowerCase()
    };
};

const resolveSchemaAssistMode = (schemaAssist, contractPolicy) => {
    const explicit = String(contractPolicy?.schema_assist_mode || '').trim().toLowerCase();
    if (explicit) return explicit;
    if (schemaAssist?.can_insert === true) return 'generate_copy_insert';
    if (schemaAssist?.can_copy === true) return 'generate_copy';
    return 'unavailable';
};

const resolveSchemaAssistInsertMode = (schemaAssist, contractPolicy) => {
    const explicit = String(contractPolicy?.schema_assist_insert_mode || '').trim().toLowerCase();
    if (explicit) return explicit;
    if (schemaAssist?.can_insert === true) return 'jsonld_conflict_aware_insert';
    if (schemaAssist?.can_copy === true) return 'copy_only';
    return 'unavailable';
};

const deriveSchemaAssistInsertCapability = (schemaAssist, _contractPolicy, schemaAssistMode, insertMode) => {
    if (schemaAssist?.can_insert === true && insertMode === 'jsonld_conflict_aware_insert') {
        return 'conflict_aware_insert';
    }
    if (schemaAssist?.can_insert === true && schemaAssistMode === 'generate_copy_insert') {
        return 'insert';
    }
    if (schemaAssist?.can_copy === true) {
        return 'copy_only';
    }
    return 'unavailable';
};

const buildSchemaAssistInsertPolicyHints = (contractPolicy, schemaAssistMode, insertMode) => {
    const hints = {};
    if (schemaAssistMode) hints.schema_assist_mode = schemaAssistMode;
    if (insertMode) hints.insert_mode = insertMode;
    if (contractPolicy?.schema_assist_target_scope) {
        hints.target_scope = contractPolicy.schema_assist_target_scope;
    }
    if (contractPolicy?.schema_assist_identity_basis) {
        hints.identity_basis = contractPolicy.schema_assist_identity_basis;
    }
    if (contractPolicy?.schema_assist_conflict_strategy) {
        hints.conflict_strategy = contractPolicy.schema_assist_conflict_strategy;
    }
    if (contractPolicy?.schema_assist_replace_scope) {
        hints.replace_scope = contractPolicy.schema_assist_replace_scope;
    }
    if (insertMode === 'jsonld_conflict_aware_insert') {
        hints.exact_match_action = 'no_op_existing_match';
        hints.managed_target_action = 'replace_existing_ai_block_when_single_clear_match';
        hints.external_conflict_action = 'copy_only_external_conflict';
        hints.default_insert_action = 'append_new_block';
    }
    return Object.keys(hints).length ? hints : null;
};

const attachSchemaAssistPolicy = (checkId, schemaAssist) => {
    if (!schemaAssist || typeof schemaAssist !== 'object') return schemaAssist;
    const contractPolicy = getRuntimeContractCheckPolicy(String(checkId || '').trim()) || null;
    const schemaAssistMode = resolveSchemaAssistMode(schemaAssist, contractPolicy);
    const insertMode = resolveSchemaAssistInsertMode(schemaAssist, contractPolicy);
    const insertCapability = deriveSchemaAssistInsertCapability(schemaAssist, contractPolicy, schemaAssistMode, insertMode);
    const insertPolicyHints = buildSchemaAssistInsertPolicyHints(contractPolicy, schemaAssistMode, insertMode);
    return {
        ...schemaAssist,
        schema_assist_mode: schemaAssistMode,
        schema_assist_insert_mode: insertMode,
        insert_capability: insertCapability,
        ...(contractPolicy?.schema_assist_source_check_id
            ? { schema_assist_source_check_id: contractPolicy.schema_assist_source_check_id }
            : {}),
        ...(insertPolicyHints ? { insert_policy_hints: insertPolicyHints } : {})
    };
};

const shouldForceBlockLevelRelease = (checkId) => String(checkId || '').trim() === 'lists_tables_presence';

const shouldSuppressCheckRelease = (checkId, checks) => {
    const normalizedId = String(checkId || '').trim();
    const checkData = checks?.[normalizedId];
    if (isInternalSchemaBridgeDiagnostic(checkData)) {
        return true;
    }
    if (isNeutralDeterministicSchemaDiagnostic(normalizedId, checkData)) {
        return true;
    }
    if (isVerificationAvailabilityDiagnostic(normalizedId, checkData)) {
        return true;
    }
    if (normalizedId === 'internal_link_context_relevance') {
        const linkCount = Number(checks?.no_broken_internal_links?.details?.internal_link_count || 0);
        if (linkCount === 0) return true;
    }
    return false;
};

const resolveSerializerScope = (checkId, requestedScope) => {
    const normalizeSerializerScopeValue = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized === 'sentence' || normalized === 'span' || normalized === 'block'
            ? normalized
            : 'span';
    };
    const normalizedRequested = normalizeSerializerScopeValue(requestedScope || 'span');
    if (shouldForceBlockLevelRelease(checkId)) return 'block';
    const policy = getRuntimeContractCheckPolicy(checkId);
    const allowedScopes = Array.isArray(policy?.allowed_scopes)
        ? policy.allowed_scopes
            .map((scope) => normalizeSerializerScopeValue(scope))
            .filter((scope) => scope === 'sentence' || scope === 'span' || scope === 'block')
        : [];
    if (!allowedScopes.length) return normalizedRequested;
    if (allowedScopes.length === 1) return allowedScopes[0];
    if (allowedScopes.includes(normalizedRequested)) return normalizedRequested;
    if (allowedScopes.includes('block')) return 'block';
    if (allowedScopes.includes('sentence')) return 'sentence';
    if (allowedScopes.includes('span')) return 'span';
    return normalizedRequested;
};

const isBlockOnlySerializerCheck = (checkId) => shouldForceBlockLevelRelease(checkId);

const OPPORTUNITY_RELEASE_COLLAPSE_CHECKS = new Set([
    'lists_tables_presence',
    'faq_structure_opportunity',
    'clear_answer_formatting',
    'howto_semantic_validity',
    'readability_adaptivity'
]);

const isOpportunityReleaseCollapseCheck = (checkId, checkData) => {
    const normalizedCheckId = String(checkId || '').trim();
    const provenance = String(checkData?.provenance || '').trim().toLowerCase();
    return OPPORTUNITY_RELEASE_COLLAPSE_CHECKS.has(normalizedCheckId) && provenance !== 'deterministic';
};

const buildReleaseBlockMetaByNodeRef = (blockMap) => {
    const map = new Map();
    (Array.isArray(blockMap) ? blockMap : []).forEach((block, index) => {
        const nodeRef = typeof block?.node_ref === 'string' ? block.node_ref.trim() : '';
        if (!nodeRef) return;
        map.set(nodeRef, {
            index,
            block_type: typeof block?.block_type === 'string' ? block.block_type.toLowerCase() : ''
        });
    });
    return map;
};

const buildReleaseHighlightCollapseKey = (checkId, checkData, highlight) => {
    if (!isOpportunityReleaseCollapseCheck(checkId, checkData)) {
        return '';
    }
    if (String(highlight?.anchor_recovery_strategy || '').trim() !== 'selector_cross_block') {
        return '';
    }
    const selector = highlight?.text_quote_selector && typeof highlight.text_quote_selector === 'object'
        ? highlight.text_quote_selector
        : (highlight?.quote && typeof highlight.quote === 'object' ? highlight.quote : {});
    const selectorExact = normalizeComparisonText(selector?.exact || '');
    const boundary = highlight?.boundary && typeof highlight.boundary === 'object' ? highlight.boundary : {};
    const boundaryKey = [
        normalizeComparisonText(boundary?.first_words || ''),
        normalizeComparisonText(boundary?.last_words || '')
    ].filter(Boolean).join('|');
    const messageKey = normalizeComparisonText(highlight?.message || checkData?.explanation || '');
    const seed = selectorExact || boundaryKey;
    if (!seed) {
        return '';
    }
    return [String(checkId || '').trim(), messageKey || 'no_message', seed].join('|');
};

const chooseReleaseGroupPrimaryHighlight = (highlights, blockMetaByNodeRef) => {
    const items = Array.isArray(highlights) ? highlights.filter((item) => item && typeof item === 'object') : [];
    if (!items.length) {
        return null;
    }
    const ranked = items.slice().sort((left, right) => {
        const leftNodeRef = typeof left?.node_ref === 'string' ? left.node_ref.trim() : '';
        const rightNodeRef = typeof right?.node_ref === 'string' ? right.node_ref.trim() : '';
        const leftMeta = leftNodeRef ? blockMetaByNodeRef.get(leftNodeRef) : null;
        const rightMeta = rightNodeRef ? blockMetaByNodeRef.get(rightNodeRef) : null;
        const leftHeadingPenalty = String(leftMeta?.block_type || '').includes('heading') ? 1 : 0;
        const rightHeadingPenalty = String(rightMeta?.block_type || '').includes('heading') ? 1 : 0;
        if (leftHeadingPenalty !== rightHeadingPenalty) {
            return leftHeadingPenalty - rightHeadingPenalty;
        }
        const leftLength = String(left?.snippet || left?.text || '').trim().length;
        const rightLength = String(right?.snippet || right?.text || '').trim().length;
        if (leftLength !== rightLength) {
            return rightLength - leftLength;
        }
        const leftIndex = Number.isInteger(leftMeta?.index) ? leftMeta.index : Number.MAX_SAFE_INTEGER;
        const rightIndex = Number.isInteger(rightMeta?.index) ? rightMeta.index : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
    });
    return ranked[0];
};

const collapseReleaseHighlightGroups = ({ checkId, checkData, highlights, blockMap = [] }) => {
    const items = Array.isArray(highlights) ? highlights.filter((item) => item && typeof item === 'object') : [];
    if (!items.length) {
        return [];
    }
    const blockMetaByNodeRef = buildReleaseBlockMetaByNodeRef(blockMap);
    const groups = [];
    let currentGroup = null;

    items.forEach((highlight, rawIndex) => {
        const collapseKey = buildReleaseHighlightCollapseKey(checkId, checkData, highlight);
        const nodeRef = typeof highlight?.node_ref === 'string' ? highlight.node_ref.trim() : '';
        const blockMeta = nodeRef ? blockMetaByNodeRef.get(nodeRef) : null;
        const blockIndex = Number.isInteger(blockMeta?.index) ? blockMeta.index : null;
        const isContiguous = currentGroup
            && collapseKey
            && currentGroup.collapse_key === collapseKey
            && (
                !Number.isInteger(blockIndex)
                || !Number.isInteger(currentGroup.last_block_index)
                || blockIndex <= currentGroup.last_block_index + 1
            );

        if (isContiguous) {
            currentGroup.highlights.push(highlight);
            if (Number.isInteger(blockIndex)) {
                currentGroup.last_block_index = blockIndex;
            }
            currentGroup.source_instance_indexes.push(rawIndex);
            return;
        }

        currentGroup = {
            collapse_key: collapseKey || `single:${rawIndex}`,
            highlights: [highlight],
            last_block_index: blockIndex,
            source_instance_indexes: [rawIndex]
        };
        groups.push(currentGroup);
    });

    return groups.map((group, collapsedIndex) => ({
        instance_index: collapsedIndex,
        issue_key: `${String(checkId || '').trim()}:${collapsedIndex}`,
        primary_highlight: chooseReleaseGroupPrimaryHighlight(group.highlights, blockMetaByNodeRef) || group.highlights[0],
        highlights: group.highlights.slice(),
        source_instance_indexes: group.source_instance_indexes.slice(),
        collapsed: !String(group.collapse_key || '').startsWith('single:') && group.highlights.length > 1,
        collapse_reason: !String(group.collapse_key || '').startsWith('single:') && group.highlights.length > 1
            ? 'selector_cross_block'
            : ''
    }));
};

const resolveEvidencePolicy = (checkId, checkData) => {
    const provenance = typeof checkData?.provenance === 'string'
        ? checkData.provenance.toLowerCase().trim()
        : '';
    const isDeterministic = provenance === 'deterministic';
    const contractPolicy = getRuntimeContractCheckPolicy(checkId);
    const rawMode = String(contractPolicy?.evidence_mode || '').trim().toLowerCase();
    const mode = (rawMode === 'inline_required' || rawMode === 'recommendation_only' || rawMode === 'absence_sensitive')
        ? rawMode
        : 'inline_required';
    if (checkData?.non_inline === true) {
        return {
            isDeterministic,
            mode: 'recommendation_only',
            reason: normalizeRecommendationReason(
                checkData.non_inline_reason
                || LEGACY_NON_INLINE_REASON_BY_CHECK[checkId]
                || 'deterministic_non_inline'
            ),
            contractPolicy
        };
    }
    if (mode === 'recommendation_only') {
        return {
            isDeterministic,
            mode: 'recommendation_only',
            reason: normalizeRecommendationReason(
                LEGACY_NON_INLINE_REASON_BY_CHECK[checkId]
                || 'recommendation_only_policy'
            ),
            contractPolicy
        };
    }
    return {
        isDeterministic,
        mode,
        reason: '',
        contractPolicy
    };
};

const hasExplicitEvidenceForAbsenceSensitive = (checkData) => {
    const sources = [
        Array.isArray(checkData?.highlights) ? checkData.highlights : [],
        Array.isArray(checkData?.failed_candidates) ? checkData.failed_candidates : [],
        Array.isArray(checkData?.candidate_highlights) ? checkData.candidate_highlights : []
    ];
    return sources.some((collection) => collection.some((item) => {
        if (!item || typeof item !== 'object') return false;
        const snippet = String(item.snippet || item.text || '').trim();
        const hasAnchorRef = !!(item.node_ref || item.nodeRef || item.signature);
        const hasOffsets = Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start;
        const hasSelector = !!(item.text_quote_selector || item.quote || item.boundary);
        return !!snippet || hasAnchorRef || hasOffsets || hasSelector;
    }));
};

const resolveHighlightIntentPolicy = (checkId, evidencePolicy, checkData) => {
    if (!evidencePolicy) {
        return {
            intent: 'inline',
            reason: ''
        };
    }
    if (evidencePolicy.mode === 'recommendation_only') {
        return {
            intent: 'document',
            reason: normalizeRecommendationReason(
                evidencePolicy.reason
                || LEGACY_NON_INLINE_REASON_BY_CHECK[checkId]
                || 'recommendation_only_policy'
            )
        };
    }
    if (evidencePolicy.mode === 'absence_sensitive' && !hasExplicitEvidenceForAbsenceSensitive(checkData)) {
        const deterministicReason = evidencePolicy.isDeterministic
            ? DETERMINISTIC_NO_CANDIDATE_REASON[checkId]
            : '';
        return {
            intent: 'document',
            reason: deterministicReason || 'absence_non_inline'
        };
    }
    return {
        intent: 'inline',
        reason: ''
    };
};

const resolveNoCandidateReason = (checkId, checkData, evidencePolicy) => {
    if (checkData?.non_inline_reason) {
        return normalizeRecommendationReason(checkData.non_inline_reason);
    }
    if (evidencePolicy?.isDeterministic && DETERMINISTIC_NO_CANDIDATE_REASON[checkId]) {
        return DETERMINISTIC_NO_CANDIDATE_REASON[checkId];
    }
    if (evidencePolicy?.mode === 'absence_sensitive' && !hasExplicitEvidenceForAbsenceSensitive(checkData)) {
        return 'absence_non_inline';
    }
    if (evidencePolicy?.mode === 'recommendation_only' && evidencePolicy.reason) {
        return normalizeRecommendationReason(evidencePolicy.reason);
    }
    if (evidencePolicy?.isDeterministic) {
        if (evidencePolicy.mode === 'recommendation_only' && evidencePolicy.reason) {
            return normalizeRecommendationReason(evidencePolicy.reason);
        }
        return DETERMINISTIC_NO_CANDIDATE_REASON[checkId] || 'deterministic_highlight_unavailable';
    }
    return 'no_highlight_candidates';
};

/**
 * Build category lookup from PRIMARY CATEGORY MAP (not definitions)
 * Maps check_id -> { category_id, category_name, display_order }
 *
 * HARD RULE: A check_id may belong to one and only one primary category.
 */
const buildCategoryLookup = () => {
    const categoryMap = loadPrimaryCategoryMap();
    const definitions = loadDefinitions();
    const lookup = {};

    categoryMap.categories.forEach((category) => {
        category.check_ids.forEach(checkId => {
            // Get check name from definitions if available
            let checkName = checkId;
            if (definitions?.categories) {
                for (const catData of Object.values(definitions.categories)) {
                    if (catData.checks?.[checkId]?.name) {
                        checkName = catData.checks[checkId].name;
                        break;
                    }
                }
            }

            lookup[checkId] = {
                category_id: category.id,
                category_name: category.name,
                display_order: category.display_order,
                check_name: checkName
            };
        });
    });

    return lookup;
};

/**
 * Validate category mapping integrity
 * Returns { valid: boolean, errors: string[] }
 */
const validateCategoryMapping = () => {
    const categoryMap = loadPrimaryCategoryMap();
    const errors = [];

    if (categoryMap.categories.length !== 8) {
        errors.push(`Expected 8 categories, found ${categoryMap.categories.length}`);
    }

    // Rule 2: No duplicate check_ids across categories
    const seenCheckIds = new Set();
    categoryMap.categories.forEach(category => {
        category.check_ids.forEach(checkId => {
            if (seenCheckIds.has(checkId)) {
                errors.push(`Duplicate check_id: ${checkId}`);
            }
            seenCheckIds.add(checkId);
        });
    });

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Serialize full analysis result to analysis_summary for sidebar
 *
 * PRESENTATION LOCK:
 * - Groups ONLY by 7 canonical primary categories
 * - AEO/GEO are NEVER used for grouping
 * - Category order is stable and deterministic
 * - Checks not in category map are EXCLUDED with error logging
 *
 * @param {Object} fullAnalysis - Complete analyzer output with all details
 * @param {string} runId - Run ID for logging
 * @param {Object} options - Serialization options
 * @returns {Object} - { analysis_summary, transformationLog }
 */
const serializeForSidebar = (fullAnalysis, runId = 'unknown', options = {}) => {
    const includeHighlights = options.includeHighlights !== false;
    const categoryMap = loadPrimaryCategoryMap();
    const categoryLookup = buildCategoryLookup();
    const transformationLog = [];
    const unmappedChecks = [];

    // Initialize ALL 7 categories from the canonical map (in display order)
    const categoriesMap = {};
    categoryMap.categories.forEach(category => {
        categoriesMap[category.id] = {
            id: category.id,
            name: category.name,
            display_order: category.display_order,
            issue_count: 0,
            issues: []
        };
    });

    const normalizeScope = (value) => {
        if (value === 'sentence' || value === 'span' || value === 'block') return value;
        return 'span';
    };
    const getBoundaryWords = (text) => {
        if (typeof text !== 'string') return [];
        return text.trim().split(/\s+/).filter(Boolean);
    };
    const buildBoundaryFromText = (text, scope) => {
        const words = getBoundaryWords(text);
        if (!words.length) return null;
        const boundary = {
            first_words: words.slice(0, Math.min(3, words.length)).join(' '),
            last_words: words.slice(Math.max(words.length - 3, 0)).join(' ')
        };
        if (scope === 'sentence' && words.length < 6) {
            boundary.exact_text = String(text || '').trim();
        }
        return boundary;
    };
    const mergeBoundary = (existing, fallback) => {
        const boundary = existing && typeof existing === 'object' ? { ...existing } : {};
        boundary.paragraph_index = Number.isInteger(boundary.paragraph_index) ? boundary.paragraph_index : null;
        if ((!boundary.first_words || !boundary.last_words) && fallback) {
            if (!boundary.first_words && fallback.first_words) boundary.first_words = fallback.first_words;
            if (!boundary.last_words && fallback.last_words) boundary.last_words = fallback.last_words;
        }
        if (!boundary.exact_text && fallback && fallback.exact_text) {
            boundary.exact_text = fallback.exact_text;
        }
        if (!boundary.first_words && !boundary.last_words && !boundary.exact_text) return null;
        return boundary;
    };

    // Process each check from analysis
    const checks = fullAnalysis.checks || {};

    Object.entries(checks).forEach(([checkId, checkData]) => {
        if (shouldSuppressCheckRelease(checkId, checks)) {
            transformationLog.push({
                check_id: checkId,
                original_verdict: checkData?.verdict || 'unknown',
                ui_verdict: mapVerdictToUiVerdict(checkData?.verdict || 'fail'),
                suppressed: 'scope_not_triggered'
            });
            return;
        }
        if (isSyntheticDiagnosticCheck(checkData)) {
            transformationLog.push({
                check_id: checkId,
                original_verdict: checkData?.verdict || 'unknown',
                ui_verdict: mapVerdictToUiVerdict(checkData?.verdict || 'fail'),
                suppressed: 'synthetic_diagnostic'
            });
            return;
        }

        const originalVerdict = checkData.verdict || 'unknown';
        const uiVerdict = mapVerdictToUiVerdict(originalVerdict);

        // Log transformation
        transformationLog.push({
            check_id: checkId,
            original_verdict: originalVerdict,
            ui_verdict: uiVerdict
        });

        // STRICT: Get category ONLY from canonical category map
        const categoryInfo = categoryLookup[checkId];

        if (!categoryInfo) {
            // Check not in category map - LOG ERROR and EXCLUDE
            unmappedChecks.push(checkId);
            console.log(JSON.stringify({
                level: 'ERROR',
                message: 'Check not in primary category map - EXCLUDED from sidebar',
                run_id: runId,
                check_id: checkId,
                verdict: originalVerdict,
                timestamp: new Date().toISOString()
            }));
            return; // Skip this check
        }

        const categoryId = categoryInfo.category_id;
        const checkName = categoryInfo.check_name;

        // Include fail/partial checks as issues with full highlight data
        if (uiVerdict === 'fail' || uiVerdict === 'partial') {
            const highlightGroups = collapseReleaseHighlightGroups({
                checkId,
                checkData,
                highlights: checkData.highlights || []
            });
            const effectiveHighlights = highlightGroups.length
                ? highlightGroups.map((group) => ({
                    ...(group.primary_highlight || {}),
                    instance_index: group.instance_index,
                    issue_key: group.issue_key,
                    collapsed: group.collapsed === true,
                    collapse_reason: group.collapse_reason || '',
                    collapsed_member_count: Array.isArray(group.highlights) ? group.highlights.length : 1,
                    collapsed_source_instance_indexes: Array.isArray(group.source_instance_indexes)
                        ? group.source_instance_indexes.slice()
                        : []
                }))
                : (checkData.highlights || []);
            const instanceCount = effectiveHighlights.length;

            const compactHighlights = effectiveHighlights.map((highlight) => {
                const snippet = highlight.snippet || highlight.text || '';
                const scope = normalizeScope(highlight.scope);
                const boundaryFallback = buildBoundaryFromText(snippet, scope);
                const boundary = mergeBoundary(highlight.boundary, boundaryFallback);
                const compactHighlight = {
                    node_ref: highlight.node_ref,
                    signature: highlight.signature,
                    start: Number.isInteger(highlight.start) ? highlight.start : undefined,
                    end: Number.isInteger(highlight.end) ? highlight.end : undefined,
                    snippet,
                    message: resolveInlineIssueMessage({
                        checkId,
                        checkData,
                        preferredMessage: highlight.message,
                        fallbackMessage: checkData.explanation || ''
                    }),
                    type: highlight.type,
                    scope,
                    boundary,
                    text_quote_selector: highlight.text_quote_selector || highlight.quote,
                    anchor_status: highlight.anchor_status || (scope === 'block' ? 'block_only' : 'anchored'),
                    anchor_strategy: highlight.anchor_strategy || null
                };
                compactHighlight.fix_assist_triage = buildSerializedFixAssistTriage({
                    checkId,
                    checkName,
                    snippet,
                    message: compactHighlight.message,
                    failureReason: highlight.failure_reason || '',
                    rewriteTarget: null,
                    repairIntent: null
                });
                return compactHighlight;
            });
            const firstInstanceNodeRef = effectiveHighlights.length > 0 && effectiveHighlights[0].node_ref
                ? effectiveHighlights[0].node_ref
                : null;
            const firstInstanceSource = effectiveHighlights.length > 0
                ? effectiveHighlights[0]
                : ((Array.isArray(checkData.failed_candidates) && checkData.failed_candidates.length > 0)
                    ? checkData.failed_candidates[0]
                    : ((Array.isArray(checkData.candidate_highlights) && checkData.candidate_highlights.length > 0)
                        ? checkData.candidate_highlights[0]
                        : null));
            const firstInstanceSnippet = firstInstanceSource
                ? String(firstInstanceSource.snippet || firstInstanceSource.text || '').trim()
                : '';
            const firstInstanceSignature = firstInstanceSource && firstInstanceSource.signature
                ? String(firstInstanceSource.signature)
                : null;
            const firstInstanceStart = firstInstanceSource && Number.isInteger(firstInstanceSource.start)
                ? firstInstanceSource.start
                : null;
            const firstInstanceEnd = firstInstanceSource && Number.isInteger(firstInstanceSource.end)
                ? firstInstanceSource.end
                : null;

            const issueSummary = {
                check_id: checkId,
                detail_ref: `check:${checkId}`,
                name: checkName,
                ui_verdict: uiVerdict,
                instances: instanceCount,
                first_instance_node_ref: firstInstanceNodeRef,
                first_instance_snippet: firstInstanceSnippet || null,
                first_instance_signature: firstInstanceSignature,
                first_instance_start: firstInstanceStart,
                first_instance_end: firstInstanceEnd,
                highlights: includeHighlights ? compactHighlights : []
            };
            issueSummary.fix_assist_triage = buildSerializedFixAssistTriage({
                checkId,
                checkName,
                snippet: firstInstanceSnippet || '',
                message: typeof checkData.explanation === 'string' ? checkData.explanation : '',
                failureReason: '',
                rewriteTarget: null,
                repairIntent: null
            });
            categoriesMap[categoryId].issues.push(issueSummary);

            categoriesMap[categoryId].issue_count++;
        }

    });

    // Sort issues within each category: fail, then partial
    const verdictWeight = { 'fail': 0, 'partial': 1 };

    Object.values(categoriesMap).forEach(cat => {
        cat.issues.sort((a, b) => {
            // Primary sort: Verdict severity (Fail < Partial < Pass)
            const weightA = verdictWeight[a.ui_verdict] !== undefined ? verdictWeight[a.ui_verdict] : 99;
            const weightB = verdictWeight[b.ui_verdict] !== undefined ? verdictWeight[b.ui_verdict] : 99;

            if (weightA !== weightB) {
                return weightA - weightB;
            }
            // Secondary sort: alphabetical by name
            return a.name.localeCompare(b.name);
        });
    });

    // Convert to array, sorted by display_order (stable, deterministic)
    // Include categories with any issues (fail/partial/pass) - not just issue_count > 0
    const categories = Object.values(categoriesMap)
        .filter(cat => cat.issues.length > 0)
        .sort((a, b) => a.display_order - b.display_order)
        .map(cat => ({
            id: cat.id,
            name: cat.name,
            issue_count: cat.issue_count,
            issues: cat.issues
        }));

    // Build analysis_summary with strict schema version
    const analysisSummary = {
        version: '1.2.0',
        run_id: runId,
        categories: categories
    };
    if (options.status === 'success_partial') {
        analysisSummary.status = 'success_partial';
        if (options.partial && typeof options.partial === 'object') {
            analysisSummary.partial = options.partial;
        }
    }

    // Log summary stats
    const totalIssues = categories.reduce((sum, cat) => sum + cat.issue_count, 0);
    console.log(JSON.stringify({
        level: 'INFO',
        message: 'Serialization complete (canonical categories)',
        run_id: runId,
        total_checks: Object.keys(checks).length,
        total_issues: totalIssues,
        categories_with_issues: categories.length,
        unmapped_checks: unmappedChecks.length,
        timestamp: new Date().toISOString()
    }));

    if (unmappedChecks.length > 0) {
        console.log(JSON.stringify({
            level: 'WARN',
            message: 'Unmapped checks excluded from sidebar',
            run_id: runId,
            unmapped: unmappedChecks,
            timestamp: new Date().toISOString()
        }));
    }

    return {
        analysis_summary: analysisSummary,
        transformationLog: transformationLog
    };
};

/**
 * Add ui_verdict to each check in the full analysis
 * This enriches the full analysis before storage
 *
 * @param {Object} fullAnalysis - Complete analyzer output
 * @returns {Object} - Enriched analysis with ui_verdict on each check
 */
const enrichWithUiVerdict = (fullAnalysis) => {
    const checks = fullAnalysis.checks || {};

    Object.entries(checks).forEach(([checkId, checkData]) => {
        checkData.ui_verdict = mapVerdictToUiVerdict(checkData.verdict);
    });

    return fullAnalysis;
};

/**
 * Prepare sidebar payload from full analysis
 * Returns ONLY analysis_summary - no explanation, highlights, suggestions
 *
 * @param {Object} fullAnalysis - Complete analyzer output
 * @param {Object} options - { runId, scores, includeHighlights }
 * @returns {Object} - Sidebar-safe payload
 */
const prepareSidebarPayload = (fullAnalysis, options = {}) => {
    const { runId, scores, includeHighlights } = options;
    const status = options.status === 'success_partial' ? 'success_partial' : 'success';

    // Enrich with ui_verdict
    const enriched = enrichWithUiVerdict(fullAnalysis);

    // Serialize to summary
    const { analysis_summary, transformationLog } = serializeForSidebar(enriched, runId, { includeHighlights });

    // Build sidebar payload - MINIMAL structure only
    const sidebarPayload = {
        ok: true,
        run_id: runId,
        status,
        scores: scores || fullAnalysis.scores || {},
        analysis_summary: analysis_summary,
        completed_at: fullAnalysis.completed_at || new Date().toISOString()
    };
    if (status === 'success_partial' && options.partial && typeof options.partial === 'object') {
        sidebarPayload.partial = options.partial;
    }
    if (fullAnalysis && fullAnalysis.overlay_content) {
        sidebarPayload.overlay_content = fullAnalysis.overlay_content;
    }

    // Log transformation for audit
    console.log(JSON.stringify({
        level: 'DEBUG',
        message: 'Transformation log',
        run_id: runId,
        transformations: transformationLog.length,
        timestamp: new Date().toISOString()
    }));

    return sidebarPayload;
};

/**
 * Extract check details for on-demand retrieval
 * Returns full check object including highlights and suggestions
 *
 * @param {Object} fullAnalysis - Complete analyzer output
 * @param {string} checkId - Check ID to retrieve
 * @param {number} instanceIndex - Optional instance index for highlights
 * @returns {Object|null} - Full check details or null if not found
 */
const extractCheckDetails = (fullAnalysis, checkId, instanceIndex = null, manifest = null) => {
    const checks = fullAnalysis.checks || {};
    const check = checks[checkId];

    if (!check) {
        return null;
    }

    // Return full check object with all details
    const details = {
        check_id: checkId,
        ...check,
        ui_verdict: mapVerdictToUiVerdict(check.verdict)
    };

    const highlights = Array.isArray(check.highlights) ? check.highlights : [];
    const candidateHighlights = Array.isArray(check.candidate_highlights) ? check.candidate_highlights : [];
    const failedCandidates = Array.isArray(check.failed_candidates) ? check.failed_candidates : [];
    const fallbackMessage = typeof check.explanation === 'string' ? check.explanation : '';
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const normalizeScope = (value) => {
        if (value === 'sentence' || value === 'span' || value === 'block') return value;
        return 'span';
    };
    const getBoundaryWords = (text) => {
        if (typeof text !== 'string') return [];
        return text.trim().split(/\s+/).filter(Boolean);
    };
    const buildBoundaryFromText = (text, scope) => {
        const words = getBoundaryWords(text);
        if (!words.length) return null;
        const boundary = {
            first_words: words.slice(0, Math.min(3, words.length)).join(' '),
            last_words: words.slice(Math.max(words.length - 3, 0)).join(' ')
        };
        if (scope === 'sentence' && words.length < 6) {
            boundary.exact_text = String(text || '').trim();
        }
        return boundary;
    };
    const mergeBoundary = (existing, fallback) => {
        const boundary = existing && typeof existing === 'object' ? { ...existing } : {};
        boundary.paragraph_index = Number.isInteger(boundary.paragraph_index) ? boundary.paragraph_index : null;
        if ((!boundary.first_words || !boundary.last_words) && fallback) {
            if (!boundary.first_words && fallback.first_words) boundary.first_words = fallback.first_words;
            if (!boundary.last_words && fallback.last_words) boundary.last_words = fallback.last_words;
        }
        if (!boundary.exact_text && fallback && fallback.exact_text) {
            boundary.exact_text = fallback.exact_text;
        }
        if (!boundary.first_words && !boundary.last_words && !boundary.exact_text) return null;
        return boundary;
    };
    const normalizeHighlight = (highlight) => {
        if (!highlight || typeof highlight !== 'object') return highlight;
        const snippet = highlight.snippet || highlight.text || '';
        const message = resolveInlineIssueMessage({
            checkId,
            checkData: check,
            preferredMessage: highlight.message,
            fallbackMessage
        });
        const scope = normalizeScope(highlight.scope);
        const boundaryFallback = buildBoundaryFromText(snippet, scope);
        const boundary = mergeBoundary(highlight.boundary, boundaryFallback);
        return {
            ...highlight,
            snippet,
            message,
            scope,
            boundary,
            text_quote_selector: highlight.text_quote_selector || highlight.quote,
            anchor_status: highlight.anchor_status || (scope === 'block' ? 'block_only' : 'anchored'),
            anchor_strategy: highlight.anchor_strategy || null
        };
    };
    const highlightGroups = collapseReleaseHighlightGroups({
        checkId,
        checkData: check,
        highlights,
        blockMap
    });
    const effectiveHighlights = highlightGroups.length
        ? highlightGroups.map((group) => normalizeHighlight({
            ...(group.primary_highlight || {}),
            instance_index: group.instance_index,
            issue_key: group.issue_key,
            collapsed: group.collapsed === true,
            collapse_reason: group.collapse_reason || '',
            collapsed_member_count: Array.isArray(group.highlights) ? group.highlights.length : 1,
            collapsed_source_instance_indexes: Array.isArray(group.source_instance_indexes)
                ? group.source_instance_indexes.slice()
                : []
        }))
        : highlights.map((highlight) => normalizeHighlight(highlight));
    details.highlights = effectiveHighlights;
    details.instance_count = effectiveHighlights.length;

    // If instance index specified, filter highlights to that instance
    if (instanceIndex !== null) {
        if (effectiveHighlights[instanceIndex]) {
            details.focused_highlight = effectiveHighlights[instanceIndex];
        } else if (failedCandidates[instanceIndex]) {
            details.focused_failed_candidate = failedCandidates[instanceIndex];
            details.cannot_anchor = true;
        } else if (candidateHighlights[instanceIndex]) {
            details.focused_failed_candidate = candidateHighlights[instanceIndex];
            details.cannot_anchor = true;
        }
    }

    if (!details.focused_highlight && (failedCandidates.length > 0 || candidateHighlights.length > 0)) {
        details.cannot_anchor = true;
    }

    return details;
};

/**
 * Build highlighted HTML for overlay editor
 * Injects <span class="aivi-overlay-highlight"> around flagged snippets
 *
 * @param {Object} manifest - Original manifest with content_html
 * @param {Object} analysisResult - Full analysis with checks and highlights
 * @returns {Object} { highlighted_html: string, content_hash: string }
 */
function buildHighlightedHtml(manifest, analysisResult) {
    const runId = (analysisResult && analysisResult.run_id) || (manifest && manifest.run_id) || null;
    const generatedAt = new Date().toISOString();
    const crypto = require('crypto');
    const categoryLookup = buildCategoryLookup();
    const runMetadata = (analysisResult && analysisResult.run_metadata && typeof analysisResult.run_metadata === 'object')
        ? analysisResult.run_metadata
        : ((manifest && manifest.run_metadata && typeof manifest.run_metadata === 'object')
            ? manifest.run_metadata
            : {});

    const escapeHtml = (value) => {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const escapeAttr = (value) => {
        return escapeHtml(value).replace(/`/g, '&#96;');
    };

    const normalizeText = (value) => {
        if (typeof value !== 'string') return '';
        return value
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    };
    const normalizeScope = (value) => {
        if (value === 'sentence' || value === 'span' || value === 'block') return value;
        return 'span';
    };
    const getBoundaryWords = (text) => {
        if (typeof text !== 'string') return [];
        return text.trim().split(/\s+/).filter(Boolean);
    };
    const buildBoundaryFromText = (text, scope) => {
        const words = getBoundaryWords(text);
        if (!words.length) return null;
        const boundary = {
            first_words: words.slice(0, Math.min(3, words.length)).join(' '),
            last_words: words.slice(Math.max(words.length - 3, 0)).join(' ')
        };
        if (scope === 'sentence' && words.length < 6) {
            boundary.exact_text = String(text || '').trim();
        }
        return boundary;
    };
    const mergeBoundary = (existing, fallback) => {
        const boundary = existing && typeof existing === 'object' ? { ...existing } : {};
        boundary.paragraph_index = Number.isInteger(boundary.paragraph_index) ? boundary.paragraph_index : null;
        if ((!boundary.first_words || !boundary.last_words) && fallback) {
            if (!boundary.first_words && fallback.first_words) boundary.first_words = fallback.first_words;
            if (!boundary.last_words && fallback.last_words) boundary.last_words = fallback.last_words;
        }
        if (!boundary.exact_text && fallback && fallback.exact_text) {
            boundary.exact_text = fallback.exact_text;
        }
        if (!boundary.first_words && !boundary.last_words && !boundary.exact_text) return null;
        return boundary;
    };

    const toHtmlText = (value) => escapeHtml(value).replace(/\n/g, '<br />');
    const splitEllipsisSegments = (snippet) => {
        const normalized = normalizeText(snippet || '');
        if (!normalized) return [];
        return normalized
            .split(/…|\.{3,}/)
            .map(part => part.trim())
            .filter(part => part.length >= 5);
    };
    const resolveSegmentRanges = (blockText, segments) => {
        if (!blockText || !Array.isArray(segments) || segments.length < 2) return null;
        const lowerText = blockText.toLowerCase();
        let cursor = 0;
        const ranges = [];
        for (const segment of segments) {
            const lowerSegment = segment.toLowerCase();
            const idx = lowerText.indexOf(lowerSegment, cursor);
            if (idx === -1) {
                return null;
            }
            ranges.push({ start: idx, end: idx + segment.length });
            cursor = idx + segment.length;
        }
        return ranges.length >= 2 ? ranges : null;
    };
    const edgeWordCount = 3;
    const maxEdgeRangeChars = 800;
    const maxEdgeRangeWords = 120;
    const getWordEdgeRange = (blockText, snippet, boundary) => {
        if (!blockText) return null;
        const normalizedSnippet = normalizeText(snippet || '');
        const words = normalizedSnippet ? normalizedSnippet.split(/\s+/).filter(Boolean) : [];
        const boundaryFirst = normalizeText(boundary?.first_words || '');
        const boundaryLast = normalizeText(boundary?.last_words || '');
        const firstPhrase = boundaryFirst || (words.length >= edgeWordCount ? words.slice(0, edgeWordCount).join(' ') : '');
        const lastPhrase = boundaryLast || (words.length >= edgeWordCount ? words.slice(-edgeWordCount).join(' ') : '');
        if (!firstPhrase || !lastPhrase) return null;
        const lowerText = blockText.toLowerCase();
        const firstIdx = lowerText.indexOf(firstPhrase.toLowerCase());
        if (firstIdx === -1) return null;
        const searchStart = firstIdx + firstPhrase.length;
        const lastIdx = lowerText.indexOf(lastPhrase.toLowerCase(), searchStart);
        if (lastIdx === -1) return null;
        const start = firstIdx;
        const end = lastIdx + lastPhrase.length;
        if (end <= start) return null;
        const slice = blockText.slice(start, end);
        const wordCount = slice.split(/\s+/).filter(Boolean).length;
        if (end - start > maxEdgeRangeChars || wordCount > maxEdgeRangeWords) return null;
        return { start, end };
    };
    const resolveSentenceRange = (blockText, highlight, snippetValue) => {
        if (!blockText) return null;
        if (normalizeScope(highlight?.scope) !== 'sentence') return null;
        const quote = highlight?.text_quote_selector || highlight?.quote || null;
        const exactFromQuote = typeof quote?.exact === 'string' ? quote.exact : '';
        const needle = normalizeText(exactFromQuote || snippetValue || highlight?.text || '');
        if (!needle) return null;
        const sentenceRanges = [];
        const sentenceRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
        let match;
        while ((match = sentenceRegex.exec(blockText)) !== null) {
            const sentenceStart = match.index;
            const sentenceText = match[0];
            const trimmed = sentenceText.trim();
            if (!trimmed) continue;
            const leadingWhitespace = sentenceText.length - sentenceText.trimStart().length;
            const trailingWhitespace = sentenceText.length - sentenceText.trimEnd().length;
            const start = sentenceStart + leadingWhitespace;
            const end = sentenceStart + sentenceText.length - trailingWhitespace;
            if (end > start) {
                sentenceRanges.push({ start, end });
            }
        }
        if (!sentenceRanges.length) return null;
        const lowerNeedle = needle.toLowerCase();
        for (const range of sentenceRanges) {
            const sentence = blockText.slice(range.start, range.end).toLowerCase();
            if (sentence.includes(lowerNeedle)) {
                return { start: range.start, end: range.end };
            }
        }
        return null;
    };
    const resolveDeterministicRange = (blockText, highlight, scope, boundary, snippetValue) => {
        if (!blockText) return null;
        const start = Number.isFinite(highlight?.start) ? Number(highlight.start) : null;
        const end = Number.isFinite(highlight?.end) ? Number(highlight.end) : null;

        if (scope === 'block') {
            return { start: 0, end: blockText.length, anchor_status: 'block_only', anchor_strategy: 'scope_block' };
        }
        if (Number.isFinite(start) && Number.isFinite(end) && end > start && end <= blockText.length) {
            return { start, end, anchor_status: 'anchored', anchor_strategy: 'exact_range' };
        }

        const snippet = normalizeText(snippetValue || highlight?.text || '');
        if (snippet) {
            const pos = blockText.toLowerCase().indexOf(snippet.toLowerCase());
            if (pos >= 0) {
                return {
                    start: pos,
                    end: pos + snippet.length,
                    anchor_status: 'anchored',
                    anchor_strategy: 'exact_snippet'
                };
            }
            const segments = splitEllipsisSegments(snippetValue);
            const segmentRanges = resolveSegmentRanges(blockText, segments);
            if (segmentRanges && segmentRanges.length) {
                return {
                    start: segmentRanges[0].start,
                    end: segmentRanges[segmentRanges.length - 1].end,
                    anchor_status: 'anchored',
                    anchor_strategy: 'exact_segmented'
                };
            }
        }

        const sentenceRange = resolveSentenceRange(blockText, highlight, snippetValue);
        if (sentenceRange) {
            return {
                start: sentenceRange.start,
                end: sentenceRange.end,
                anchor_status: 'anchored',
                anchor_strategy: 'sentence_range'
            };
        }

        const edgeRange = getWordEdgeRange(blockText, snippetValue, boundary);
        if (edgeRange) {
            return {
                start: edgeRange.start,
                end: edgeRange.end,
                anchor_status: 'anchored',
                anchor_strategy: 'first_last_words'
            };
        }

        if (blockText.length > 0) {
            return { start: 0, end: blockText.length, anchor_status: 'block_only', anchor_strategy: 'block_only' };
        }
        return null;
    };
    const INLINE_GUARDRAILS = {
        max_chars: 420,
        max_words: 75,
        max_coverage_ratio: 0.8,
        max_block_strategy_chars: 220,
        max_block_strategy_words: 40,
        max_block_strategy_coverage_ratio: 0.55
    };
    const DETERMINISTIC_HEADING_INLINE_CHECKS = new Set([
        'heading_fragmentation',
        'heading_topic_fulfillment',
        'logical_heading_hierarchy'
    ]);
    const evaluateInlinePrecision = ({
        checkId,
        provenance,
        scope,
        resolvedRange,
        blockText,
        snippetValue,
        boundary,
        anchorStatus,
        anchorStrategy
    }) => {
        if (!resolvedRange || !blockText) {
            return { allowed: false, reason: 'resolver_failed' };
        }
        const safeStart = Math.max(0, Math.min(blockText.length, Number(resolvedRange.start)));
        const safeEnd = Math.max(0, Math.min(blockText.length, Number(resolvedRange.end)));
        if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd) || safeEnd <= safeStart) {
            return { allowed: false, reason: 'resolver_failed' };
        }

        const rangeText = blockText.slice(safeStart, safeEnd);
        const rangeChars = safeEnd - safeStart;
        const rangeWords = rangeText.split(/\s+/).filter(Boolean).length;
        const coverageRatio = blockText.length > 0 ? (rangeChars / blockText.length) : 1;
        const isDeterministicHeadingCheck = DETERMINISTIC_HEADING_INLINE_CHECKS.has(String(checkId || ''))
            && String(provenance || '').toLowerCase() === 'deterministic';
        if (isDeterministicHeadingCheck && rangeChars <= 200 && rangeWords <= 24) {
            return { allowed: true, start: safeStart, end: safeEnd };
        }
        const blockStrategy = scope === 'block'
            || anchorStatus === 'block_only'
            || ['scope_block', 'block_only', 'failed_candidate_block_only'].includes(String(anchorStrategy || ''));

        if (blockStrategy) {
            const isTooBroadBlock = coverageRatio > INLINE_GUARDRAILS.max_block_strategy_coverage_ratio
                || rangeChars > INLINE_GUARDRAILS.max_block_strategy_chars
                || rangeWords > INLINE_GUARDRAILS.max_block_strategy_words;
            if (isTooBroadBlock) {
                return { allowed: false, reason: 'block_wide' };
            }
        }

        const isTooWide = coverageRatio > INLINE_GUARDRAILS.max_coverage_ratio
            || rangeChars > INLINE_GUARDRAILS.max_chars
            || rangeWords > INLINE_GUARDRAILS.max_words;
        if (isTooWide) {
            return { allowed: false, reason: 'too_wide' };
        }

        const normalizedSnippet = normalizeText(snippetValue || boundary?.exact_text || '');
        if (normalizedSnippet.length >= 18) {
            const normalizedRange = normalizeText(rangeText);
            const lowerRange = normalizedRange.toLowerCase();
            const lowerSnippet = normalizedSnippet.toLowerCase();

            if (!lowerRange.includes(lowerSnippet)) {
                const snippetWords = normalizedSnippet.split(/\s+/).filter(Boolean);
                const firstPhrase = normalizeText(boundary?.first_words || snippetWords.slice(0, 3).join(' ')).toLowerCase();
                const lastPhrase = normalizeText(boundary?.last_words || snippetWords.slice(-3).join(' ')).toLowerCase();
                const hasFirst = firstPhrase && lowerRange.includes(firstPhrase);
                const hasLast = lastPhrase && lowerRange.includes(lastPhrase);
                if (!(hasFirst && hasLast)) {
                    return { allowed: false, reason: 'low_precision' };
                }
            }
        }

        return { allowed: true, start: safeStart, end: safeEnd };
    };

    const blockMap = manifest && Array.isArray(manifest.block_map) ? manifest.block_map : [];
    if (!blockMap.length) {
        return {
            schema_version: '2.0.0',
            generated_at: generatedAt,
            run_id: runId,
            highlighted_html: null,
            content_hash: null,
            highlight_count: 0,
            recommendations: [],
            unhighlightable_issues: [],
            v2_findings: []
        };
    }

    const contentHashSource = typeof manifest.content_html === 'string'
        ? manifest.content_html
        : blockMap.map((b) => (b && b.text ? String(b.text) : '')).join('\n');
    const contentHash = crypto.createHash('sha256')
        .update(contentHashSource)
        .digest('hex')
        .substring(0, 16);

    const signatureToNodeRef = new Map();
    const nodeRefToText = new Map();
    const nodeRefToBlock = new Map();
    blockMap.forEach((b) => {
        if (!b) return;
        if (b.signature && b.node_ref) signatureToNodeRef.set(String(b.signature), String(b.node_ref));
        if (b.node_ref) nodeRefToText.set(String(b.node_ref), normalizeText(b.text || b.text_content || ''));
        if (b.node_ref) nodeRefToBlock.set(String(b.node_ref), b);
    });

    const getMediaPreview = (block) => {
        const meta = block && typeof block === 'object' && block.meta && typeof block.meta === 'object'
            ? block.meta
            : {};
        const src = String(
            meta.image_src
            || (Array.isArray(meta.image_sources) && meta.image_sources.length ? meta.image_sources[0] : '')
            || ''
        ).trim();
        if (!src) {
            return null;
        }
        return {
            src,
            alt: String(meta.image_alt || '').trim(),
            caption: String(meta.image_caption || '').trim()
        };
    };

    const renderPreviewBodyHtml = (block, renderedTextHtml) => {
        const media = getMediaPreview(block);
        if (!media) {
            return renderedTextHtml;
        }
        const captionHtml = media.caption
            ? `<figcaption>${escapeHtml(media.caption)}</figcaption>`
            : '';
        const labelHtml = renderedTextHtml
            ? `<div class="aivi-overlay-media-label">${renderedTextHtml}</div>`
            : '';
        return `<figure class="aivi-overlay-media-block"><img src="${escapeAttr(media.src)}" alt="${escapeAttr(media.alt)}" />${captionHtml}${labelHtml}</figure>`;
    };

    const highlightsByNodeRef = new Map();
    const unhighlightableIssues = [];
    const recommendationRecords = [];
    const checks = (analysisResult && analysisResult.checks) ? analysisResult.checks : {};
    const v2Findings = [];
    const schemaAssistTelemetry = {
        emitted_total: 0,
        insertable_total: 0,
        by_check: {}
    };
    const schemaAssistCache = new Map();
    const recordSchemaAssistTelemetry = (checkId, schemaAssist) => {
        if (!schemaAssist || typeof schemaAssist !== 'object') return;
        const normalizedCheckId = String(checkId || '').trim();
        if (!normalizedCheckId) return;
        schemaAssistTelemetry.emitted_total += 1;
        if (schemaAssist.can_insert === true) {
            schemaAssistTelemetry.insertable_total += 1;
        }
        if (!Object.prototype.hasOwnProperty.call(schemaAssistTelemetry.by_check, normalizedCheckId)) {
            schemaAssistTelemetry.by_check[normalizedCheckId] = {
                emitted: 0,
                insertable: 0,
                by_schema_kind: {}
            };
        }
        const entry = schemaAssistTelemetry.by_check[normalizedCheckId];
        entry.emitted += 1;
        if (schemaAssist.can_insert === true) {
            entry.insertable += 1;
        }
        const schemaKind = String(schemaAssist.schema_kind || 'unknown').trim() || 'unknown';
        entry.by_schema_kind[schemaKind] = (entry.by_schema_kind[schemaKind] || 0) + 1;
    };
    const resolveSchemaAssist = (checkId, checkData) => {
        const normalizedCheckId = String(checkId || '').trim();
        if (!normalizedCheckId) return null;
        if (schemaAssistCache.has(normalizedCheckId)) {
            return schemaAssistCache.get(normalizedCheckId);
        }
        let schemaAssist = null;
        try {
            schemaAssist = buildSchemaAssistDraft({
                checkId: normalizedCheckId,
                checkData: checkData || {},
                manifest: manifest || {},
                runMetadata
            });
        } catch (schemaAssistError) {
            console.log(JSON.stringify({
                level: 'WARN',
                message: 'Schema assist generation failed',
                run_id: runId || '',
                check_id: normalizedCheckId,
                error: schemaAssistError && schemaAssistError.message ? schemaAssistError.message : 'schema_assist_error',
                timestamp: new Date().toISOString()
            }));
            schemaAssist = null;
        }
        if (schemaAssist && typeof schemaAssist === 'object') {
            schemaAssist = attachSchemaAssistPolicy(normalizedCheckId, schemaAssist);
        }
        schemaAssistCache.set(normalizedCheckId, schemaAssist || null);
        return schemaAssist;
    };
    const resolveNodeRef = (input) => {
        if (!input || typeof input !== 'object') return '';
        if (typeof input.node_ref === 'string' && input.node_ref) return input.node_ref;
        const signature = typeof input.signature === 'string' ? input.signature : '';
        if (signature && signatureToNodeRef.has(signature)) {
            return signatureToNodeRef.get(signature);
        }
        return '';
    };
    const resolveDocumentScopeContextNodeRef = (checkData) => {
        if (!checkData || typeof checkData !== 'object') return '';
        const details = checkData.details && typeof checkData.details === 'object' ? checkData.details : {};
        const directCandidates = [
            details.context_node_ref,
            details.heading_node_ref,
            details.primary_node_ref
        ];
        for (const candidate of directCandidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim();
            }
        }
        const detectedSteps = Array.isArray(details.detected_steps) ? details.detected_steps : [];
        for (const step of detectedSteps) {
            const stepNodeRef = resolveNodeRef(step);
            if (stepNodeRef) {
                return stepNodeRef;
            }
            if (typeof step?.heading_node_ref === 'string' && step.heading_node_ref.trim()) {
                return step.heading_node_ref.trim();
            }
        }
        for (const step of detectedSteps) {
            const stepText = normalizeText(step?.text || '').toLowerCase();
            if (!stepText) {
                continue;
            }
            for (const [candidateNodeRef, blockText] of nodeRefToText.entries()) {
                if (blockText && blockText.includes(stepText)) {
                    return candidateNodeRef;
                }
            }
        }
        const detectedPairs = Array.isArray(details.detected_pairs) ? details.detected_pairs : [];
        for (const pair of detectedPairs) {
            const pairNodeRef = resolveNodeRef(pair);
            if (pairNodeRef) {
                return pairNodeRef;
            }
            if (typeof pair?.heading_node_ref === 'string' && pair.heading_node_ref.trim()) {
                return pair.heading_node_ref.trim();
            }
        }
        for (const pair of detectedPairs) {
            const pairTexts = [
                normalizeText(pair?.question || '').toLowerCase(),
                normalizeText(pair?.answer || '').toLowerCase()
            ].filter(Boolean);
            if (!pairTexts.length) {
                continue;
            }
            for (const [candidateNodeRef, blockText] of nodeRefToText.entries()) {
                if (!blockText) {
                    continue;
                }
                if (pairTexts.some((text) => blockText.includes(text))) {
                    return candidateNodeRef;
                }
            }
        }
        return '';
    };
    const resolveRecommendationAction = (failureReason, context = {}) => {
        const normalizedReason = String(failureReason || '').toLowerCase();
        const normalizedCheckId = String(context.check_id || '').trim();
        const checkName = String(context.check_name || context.check_id || 'this check').trim();
        const byCheckId = {
            readability_adaptivity: 'Shorten long sentences, reduce clause stacking, and replace jargon so the section scans cleanly on first read.',
            temporal_claim_check: 'Add an explicit date, time window, or update marker wherever the copy implies recency or change over time.',
            named_entities_detected: 'Name the relevant person, company, product, or place explicitly instead of relying on generic labels or pronouns.'
        };
        if (
            Object.prototype.hasOwnProperty.call(byCheckId, normalizedCheckId)
            && (
                normalizedReason === 'no_highlight_candidates'
                || normalizedReason === 'recommendation_only_policy'
                || normalizedReason === 'missing_candidate'
                || normalizedReason === 'missing_snippet'
                || normalizedReason === 'anchor_failed'
            )
        ) {
            return byCheckId[normalizedCheckId];
        }
        if (normalizedReason.startsWith('metadata_')) {
            return 'Update title, meta description, canonical URL, and language metadata at the document level.';
        }
        if (normalizedReason.includes('schema')) {
            return 'Review your JSON-LD/schema configuration and update it in your SEO/schema plugin settings.';
        }
        if (normalizedReason === 'external_sources_document_scope') {
            return 'Add at least one authoritative external citation to support key claims in this article.';
        }
        if (normalizedReason === 'internal_links_document_scope') {
            return 'Add contextually relevant internal links so users and crawlers can follow supporting sections.';
        }
        if (normalizedReason === 'citation_support_document_scope') {
            return 'Add explicit source citations for key factual claims and place them close to those statements.';
        }
        if (normalizedReason === 'claim_evidence_section_scope') {
            return 'Strengthen this section with concrete evidence or citations for the claim being made.';
        }
        if (normalizedReason === 'faq_jsonld_generation_non_inline') {
            return 'Rewrite the visible content into reusable Q&A pairs before adding FAQ JSON-LD.';
        }
        if (normalizedReason === 'intro_schema_non_inline') {
            return 'Add the recommended schema type only if it matches the visible intro exactly, then validate it in your schema or SEO settings.';
        }
        if (normalizedReason === 'semantic_structure_non_inline') {
            return 'Add semantic HTML elements (article, section, nav, main) to improve structural clarity.';
        }
        if (normalizedReason === 'missing_author_byline' || normalizedReason === 'missing_author_bio') {
            return 'Add a clear author byline and an author bio section near the article header or footer.';
        }
        if (normalizedReason === 'absence_non_inline') {
            return 'Add the missing evidence directly in the relevant section: state one clear claim and support it with a concrete fact or source cue.';
        }
        switch (normalizedReason) {
            case 'signature_mismatch':
            case 'node_ref_mismatch':
            case 'missing_anchor':
            case 'block_not_found':
            case 'missing_block_text':
                return 'Rewrite the weakest sentence in this section: keep key terms together, state one clear claim, and add one concrete supporting detail.';
            case 'offset_resolution_failed':
            case 'resolver_failed':
                return 'Revise the nearest sentence with one explicit claim and one concrete supporting detail.';
            case 'block_wide':
                return 'Break the section into smaller claim-level sentences and rewrite the weakest one first.';
            case 'too_wide':
                return 'Narrow the revision to a single claim sentence, then add one supporting fact.';
            case 'low_precision':
                return 'Rewrite the key claim sentence with clearer wording and tighter terminology.';
            case 'missing_candidate':
            case 'missing_snippet':
            case 'anchor_failed':
                return 'Add one explicit sentence in the target section with a concrete fact, example, or source cue.';
            case 'missing_required_h1':
                return 'Add one primary H1 that states the page topic. Use H2 for major sections and H3/H4 only for nested subsections.';
            case 'multiple_h1_anchor_unavailable':
                return 'Keep a single H1 as the page headline, then convert extra top-level headings to H2/H3 according to section depth.';
            case 'missing_alt_anchor_unavailable':
                return 'Add descriptive alt text to images that convey meaning; keep decorative images intentionally empty.';
            case 'date_anchor_unavailable':
                return 'Update the visible published/updated date so freshness is explicit in the content.';
            case 'link_status_unavailable':
                return 'Enable link-status checks or manually verify internal links to confirm none are broken.';
            case 'broken_link_anchor_unavailable':
                return 'Fix or replace broken internal URLs and ensure anchor text points to valid destinations.';
            case 'deterministic_highlight_unavailable':
                return 'Review this deterministic issue in Recommendations and apply a direct content-level fix.';
            case 'intro_wordcount_non_inline':
                return 'Aim for 40-150 intro words; 20-39 or 151-200 can still work, below 20 is too short, and above 200 is too long. Keep one direct topic sentence and one supporting fact.';
            case 'intro_readability_non_inline':
                return 'Shorten long intro sentences, reduce passive voice, and aim for sentences at or below 22 words so the opening is easier to scan.';
            case 'intro_composite_non_inline':
                return 'Refocus the intro on one explicit topic sentence, add one concrete supporting fact, and remove filler.';
            case 'recommendation_only_policy':
                return 'Apply this fix at section or document level: make the claim explicit, add concrete support, and keep structure consistent.';
            case 'synthetic_fallback':
            case 'missing_ai_checks':
                return 'Analyzer did not complete this check in this run. Apply the highest-impact edit, then re-run analysis.';
            case 'chunk_parse_failure':
                return 'Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.';
            case 'time_budget_exceeded':
                return 'Analysis reached the time budget before this check completed. Apply one high-impact edit, then re-run.';
            case 'truncated_response':
                return 'The model response was truncated for this check. Tighten the section and re-run analysis.';
            case 'invalid_checks_filtered':
                return 'Strengthen this section with explicit claims and concrete support, then re-run analysis.';
            case 'no_highlight_candidates':
                return `Refine the section tied to ${checkName}: make one explicit claim, add one concrete support detail, and remove vague phrasing.`;
            default:
                return `Refine the section for ${checkName}: make the claim explicit, add concrete support, and keep terminology consistent.`;
        }
    };
    const buildUnhighlightableIssue = ({
        checkId,
        check,
        instanceIndex,
        verdict,
        message,
        snippet,
        failureReason,
        nodeRef,
        signature,
        sourcePack
    }) => {
        const definitionMeta = getCheckDefinitionMeta(checkId);
        const checkName = (check && (check.title || check.name))
            ? String(check.title || check.name)
            : String(definitionMeta?.name || checkId || '');
        const normalizedFailureReason = failureReason ? String(failureReason) : '';
        const contextualNodeRef = resolveDocumentScopeContextNodeRef(check);
        const resolvedNodeRef = isSyntheticFallbackReason(normalizedFailureReason)
            ? ''
            : (nodeRef || (signature ? (signatureToNodeRef.get(signature) || '') : ''));
        const resolvedJumpNodeRef = resolvedNodeRef || contextualNodeRef || '';
        const actionSuggestion = resolveRecommendationAction(failureReason, {
            check_id: String(checkId || ''),
            check_name: checkName
        });
        const semanticWhyFallback = buildSemanticWhyItMatters({
            checkName: clampGuidanceText(checkName || checkId || 'this check', 120),
            definitionDescription: clampGuidanceText(definitionMeta?.description || '', 220),
            checkId,
            runId,
            instanceIndex
        });
        const explanationPack = buildIssueExplanationPack({
            checkId,
            checkData: check || {},
            message,
            actionSuggestion,
            snippet,
            failureReason: normalizedFailureReason,
            rewriteTarget: null,
            sourcePack: sourcePack || check?.ai_explanation_pack || check?.explanation_pack || null,
            runId,
            instanceIndex
        });
        const enrichedExplanationPack = enrichRecommendationExplanationPack(explanationPack, {
            checkId,
            checkName: checkName || checkId || 'this check',
            snippet,
            actionSuggestion,
            rewriteTarget: null,
            failureReason: normalizedFailureReason,
            whyFallback: semanticWhyFallback,
            examplePattern: inferExamplePattern({ rewriteTarget: null, failureReason: normalizedFailureReason, checkId }),
            isSemantic: !isDeterministicCheckData(check)
        });
        const reviewSummary = composeReviewSummaryNarrative(enrichedExplanationPack, {
            checkId,
            failureReason: normalizedFailureReason
        });
        const fixAssistTriage = buildSerializedFixAssistTriage({
            checkId,
            checkName,
            snippet,
            message,
            failureReason: normalizedFailureReason,
            rewriteTarget: null,
            repairIntent: null
        });
        const baseIssue = {
            run_id: runId || '',
            check_id: String(checkId || ''),
            check_name: checkName,
            instance_index: instanceIndex,
            issue_key: `${String(checkId || '')}:${instanceIndex}`,
            verdict: String(verdict),
            message: String(message || '').slice(0, 300),
            rationale: isDeterministicCheckData(check) ? String(message || '').slice(0, 300) : '',
            snippet: snippet ? String(snippet).slice(0, 600) : '',
            action_suggestion: actionSuggestion,
            explanation_pack: enrichedExplanationPack,
            issue_explanation: composeIssueExplanationNarrative(enrichedExplanationPack),
            ...(reviewSummary ? { review_summary: reviewSummary } : {}),
            fix_assist_triage: fixAssistTriage,
            failure_reason: normalizedFailureReason,
            node_ref: resolvedNodeRef,
            jump_node_ref: resolvedJumpNodeRef,
            signature: signature || '',
            anchor_status: 'unhighlightable',
            analysis_ref: {
                run_id: runId || '',
                check_id: String(checkId || ''),
                instance_index: instanceIndex
            }
        };
        const schemaAssist = resolveSchemaAssist(checkId, check);
        if (schemaAssist) {
            baseIssue.schema_assist = schemaAssist;
            recordSchemaAssistTelemetry(checkId, schemaAssist);
        }
        return baseIssue;
    };
    const dedupeUnhighlightableIssues = (issues) => {
        const seen = new Set();
        const deduped = [];
        (Array.isArray(issues) ? issues : []).forEach((issue) => {
            if (!issue || typeof issue !== 'object') return;
            const checkId = String(issue.check_id || '').trim();
            const nodeRef = String(issue.node_ref || '').trim();
            const reason = String(issue.failure_reason || '').trim();
            const snippet = String(issue.snippet || '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 180);
            const key = [checkId, nodeRef, reason, snippet].join('|');
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(issue);
        });
        return deduped;
    };
    const blockOnlyIssueKeys = new Set();
    const isRailEligibleCheck = (checkId) => {
        const normalizedCheckId = String(checkId || '').trim();
        if (!normalizedCheckId) return false;
        return Boolean(categoryLookup[normalizedCheckId]);
    };
    const recordRecommendationIssue = (issue) => {
        if (!issue || typeof issue !== 'object') return;
        if (!isRailEligibleCheck(issue.check_id)) return;
        if (isBlockOnlySerializerCheck(issue.check_id)) {
            const dedupeKey = [
                String(issue.check_id || '').trim(),
                String(issue.jump_node_ref || issue.node_ref || '').trim()
            ].join('|');
            if (dedupeKey && blockOnlyIssueKeys.has(dedupeKey)) return;
            if (dedupeKey) blockOnlyIssueKeys.add(dedupeKey);
        }
        recommendationRecords.push(issue);
    };
    const pushUnhighlightableIssue = (issue) => {
        if (!issue || typeof issue !== 'object') return;
        if (!isRailEligibleCheck(issue.check_id)) return;
        unhighlightableIssues.push(issue);
        if (shouldExposeRecommendationInRail({
            checkData: checks[String(issue.check_id || '')] || null,
            failureReason: issue.failure_reason || ''
        })) {
            recordRecommendationIssue(issue);
        }
    };
    Object.entries(checks).forEach(([checkId, check]) => {
        if (shouldSuppressCheckRelease(checkId, checks)) return;
        if (!check) return;
        const verdict = check.ui_verdict || check.verdict;
        if (verdict !== 'fail' && verdict !== 'partial') return;
        if (isSyntheticDiagnosticCheck(check)) {
            const syntheticReason = String(
                check.synthetic_reason
                || check.non_inline_reason
                || 'synthetic_fallback'
            );
            pushUnhighlightableIssue(buildUnhighlightableIssue({
                checkId,
                check,
                instanceIndex: 0,
                verdict,
                message: check.explanation || `${String(checkId || '')} could not be completed by AI analyzer`,
                snippet: '',
                failureReason: syntheticReason,
                nodeRef: '',
                signature: '',
                sourcePack: check.ai_explanation_pack || check.explanation_pack || null
            }));
            return;
        }
        const evidencePolicy = resolveEvidencePolicy(checkId, check);
        const highlightIntentPolicy = resolveHighlightIntentPolicy(checkId, evidencePolicy, check);
        if (highlightIntentPolicy.intent !== 'inline') {
            const policyHighlights = Array.isArray(check.highlights) ? check.highlights : [];
            const policyFailed = Array.isArray(check.failed_candidates) ? check.failed_candidates : [];
            const policyCandidates = Array.isArray(check.candidate_highlights) ? check.candidate_highlights : [];
            const policyInstances = [...policyHighlights, ...policyFailed, ...policyCandidates];

            if (policyInstances.length === 0) {
                const policyMessage = resolveInlineIssueMessage({
                    checkId,
                    checkData: check,
                    preferredMessage: '',
                    fallbackMessage: check.explanation || `${String(checkId || '')} requires manual review`
                });
                pushUnhighlightableIssue(buildUnhighlightableIssue({
                    checkId,
                    check,
                    instanceIndex: 0,
                    verdict,
                    message: policyMessage,
                    snippet: '',
                    failureReason: highlightIntentPolicy.reason || 'non_inline_policy',
                    nodeRef: '',
                    signature: '',
                    sourcePack: check.ai_explanation_pack || check.explanation_pack || null
                }));
            } else {
                policyInstances.forEach((policyInstance, idx) => {
                    const instanceIndex = typeof policyInstance?.instance_index === 'number'
                        ? policyInstance.instance_index
                        : idx;
                    const policyNodeRef = resolveNodeRef(policyInstance || {});
                    const policyMessage = resolveInlineIssueMessage({
                        checkId,
                        checkData: check,
                        preferredMessage: policyInstance?.message,
                        fallbackMessage: check.explanation || `${String(checkId || '')} requires manual review`
                    });
                    pushUnhighlightableIssue(buildUnhighlightableIssue({
                        checkId,
                        check,
                        instanceIndex,
                        verdict,
                        message: policyMessage,
                        snippet: policyInstance?.snippet || policyInstance?.text || '',
                        failureReason: policyInstance?.failure_reason || highlightIntentPolicy.reason || 'non_inline_policy',
                        nodeRef: policyNodeRef,
                        signature: policyInstance?.signature || '',
                        sourcePack: policyInstance?.explanation_pack || check.ai_explanation_pack || check.explanation_pack || null
                    }));
                });
            }
            return;
        }
        let hasRenderedInstance = false;
        const failedCandidates = Array.isArray(check.failed_candidates) ? check.failed_candidates : [];
        const candidateHighlights = Array.isArray(check.candidate_highlights) ? check.candidate_highlights : [];
        const fallbackMessage = resolveInlineIssueMessage({
            checkId,
            checkData: check,
            preferredMessage: '',
            fallbackMessage: (typeof check.explanation === 'string'
                ? check.explanation
                : (check.title || check.name || ''))
        });
        const sourceFailed = failedCandidates.length ? failedCandidates : candidateHighlights;
        sourceFailed.forEach((candidate, idx) => {
            if (!candidate || typeof candidate !== 'object') return;
            const instanceIndex = typeof candidate.instance_index === 'number' ? candidate.instance_index : idx;
            const message = resolveInlineIssueMessage({
                checkId,
                checkData: check,
                preferredMessage: candidate.message,
                fallbackMessage
            });
            const snippet = candidate.snippet || candidate.text || '';
            const failureReason = candidate.failure_reason || (check.cannot_anchor ? 'anchor_failed' : '');
            const nodeRef = resolveNodeRef(candidate);
            const blockText = nodeRef ? (nodeRefToText.get(nodeRef) || '') : '';
            if (nodeRef && blockText) {
                const candidateScope = resolveSerializerScope(checkId, candidate.scope || 'block');
                const effectiveSnippet = candidateScope === 'block' && blockText
                    ? blockText
                    : snippet;
                const candidateRange = {
                    start: 0,
                    end: blockText.length,
                    anchor_status: 'block_only',
                    anchor_strategy: 'failed_candidate_block_only'
                };
                const candidatePrecision = evaluateInlinePrecision({
                    checkId,
                    provenance: check.provenance || '',
                    scope: candidateScope,
                    resolvedRange: candidateRange,
                    blockText,
                    snippetValue: effectiveSnippet,
                    boundary: null,
                    anchorStatus: candidateRange.anchor_status,
                    anchorStrategy: candidateRange.anchor_strategy
                });
                if (!candidatePrecision.allowed) {
                    pushUnhighlightableIssue(buildUnhighlightableIssue({
                        checkId,
                        check,
                        instanceIndex,
                        verdict,
                        message,
                        snippet: effectiveSnippet,
                        failureReason: candidatePrecision.reason,
                        nodeRef,
                        signature: candidate.signature || '',
                        sourcePack: candidate.explanation_pack || check.ai_explanation_pack || check.explanation_pack || null
                    }));
                    hasRenderedInstance = true;
                    return;
                }
                const issueKey = `${String(checkId || '')}:${instanceIndex}`;
                const inlineExplanationPack = buildIssueExplanationPack({
                    checkId,
                    checkData: check,
                    message,
                    actionSuggestion: '',
                    snippet: effectiveSnippet,
                    failureReason,
                    rewriteTarget: null,
                    sourcePack: candidate.explanation_pack || check.ai_explanation_pack || check.explanation_pack || null,
                    runId,
                    instanceIndex
                });
                const reviewSummary = composeReviewSummaryNarrative(inlineExplanationPack, {
                    checkId,
                    failureReason
                });
                const inlineFixAssistTriage = buildSerializedFixAssistTriage({
                    checkId,
                    checkName: String(check.title || check.name || getCheckDefinitionMeta(checkId)?.name || checkId || ''),
                    snippet: effectiveSnippet,
                    message,
                    failureReason,
                    rewriteTarget: null,
                    repairIntent: null
                });
                if (!highlightsByNodeRef.has(nodeRef)) highlightsByNodeRef.set(nodeRef, []);
                highlightsByNodeRef.get(nodeRef).push({
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    instance_index: instanceIndex,
                    issue_key: issueKey,
                    verdict: String(verdict),
                    message: message.toString().slice(0, 300),
                    node_ref: nodeRef,
                    signature: candidate.signature || '',
                    provenance: check.provenance || '',
                    anchor_status: candidateRange.anchor_status,
                    anchor_strategy: candidateRange.anchor_strategy,
                    start: candidatePrecision.start,
                    end: candidatePrecision.end,
                    range_key: `${issueKey}:0`
                });
                v2Findings.push({
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    instance_index: instanceIndex,
                    issue_key: issueKey,
                    verdict: String(verdict),
                    message: message.toString().slice(0, 300),
                    node_ref: nodeRef,
                    signature: candidate.signature || '',
                    scope: candidateScope,
                    boundary: null,
                    text_quote_selector: candidateScope === 'block'
                        ? null
                        : (candidate.text_quote_selector || candidate.quote || null),
                    snippet: effectiveSnippet ? String(effectiveSnippet).slice(0, 800) : '',
                    type: candidate.type,
                    anchor_status: candidateRange.anchor_status,
                    anchor_strategy: candidateRange.anchor_strategy,
                    failure_reason: failureReason ? String(failureReason) : '',
                    analysis_ref: {
                        run_id: runId || '',
                        check_id: String(checkId || ''),
                        instance_index: instanceIndex
                    },
                    fix_assist_triage: inlineFixAssistTriage,
                    explanation_pack: inlineExplanationPack,
                    issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack),
                    ...(reviewSummary ? { review_summary: reviewSummary } : {})
                });
                recordRecommendationIssue({
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    check_name: String(check.title || check.name || getCheckDefinitionMeta(checkId)?.name || checkId || ''),
                    instance_index: instanceIndex,
                    issue_key: issueKey,
                    verdict: String(verdict),
                    message: message.toString().slice(0, 300),
                    rationale: message.toString().slice(0, 300),
                    snippet: effectiveSnippet ? String(effectiveSnippet).slice(0, 600) : '',
                    explanation_pack: inlineExplanationPack,
                    issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack),
                    ...(reviewSummary ? { review_summary: reviewSummary } : {}),
                    failure_reason: failureReason ? String(failureReason) : '',
                    node_ref: nodeRef,
                    jump_node_ref: nodeRef,
                    signature: candidate.signature || '',
                    anchor_status: candidateRange.anchor_status,
                    anchor_strategy: candidateRange.anchor_strategy,
                    analysis_ref: {
                        run_id: runId || '',
                        check_id: String(checkId || ''),
                        instance_index: instanceIndex
                    },
                    fix_assist_triage: inlineFixAssistTriage,
                    start: candidatePrecision.start,
                    end: candidatePrecision.end
                });
                hasRenderedInstance = true;
                return;
            }
            pushUnhighlightableIssue(buildUnhighlightableIssue({
                checkId,
                check,
                instanceIndex,
                verdict,
                message,
                snippet,
                failureReason,
                nodeRef: candidate.node_ref || '',
                signature: candidate.signature || '',
                sourcePack: candidate.explanation_pack || check.ai_explanation_pack || check.explanation_pack || null
            }));
            hasRenderedInstance = true;
        });
        const highlights = Array.isArray(check.highlights) ? check.highlights : [];
        const highlightGroups = collapseReleaseHighlightGroups({
            checkId,
            checkData: check,
            highlights,
            blockMap
        });
        highlightGroups.forEach((group, groupIndex) => {
            if (!group || !group.primary_highlight) return;
            const instanceIndex = Number.isInteger(group.instance_index) ? group.instance_index : groupIndex;
            const issueKey = group.issue_key || `${String(checkId || '')}:${instanceIndex}`;
            const primaryHighlight = group.primary_highlight;
            const groupHighlights = Array.isArray(group.highlights) && group.highlights.length
                ? group.highlights
                : [primaryHighlight];
            const primaryMessage = resolveInlineIssueMessage({
                checkId,
                checkData: check,
                preferredMessage: primaryHighlight.message,
                fallbackMessage: check.explanation || ''
            }).toString().slice(0, 300);
            const renderedSegments = [];
            let fallbackFailureReason = '';
            let fallbackNodeRef = '';
            let fallbackSignature = '';
            let fallbackSnippet = primaryHighlight.snippet || primaryHighlight.text || '';
            let fallbackSourcePack = primaryHighlight.explanation_pack || check.ai_explanation_pack || check.explanation_pack || null;

            groupHighlights.forEach((highlight) => {
                if (!highlight) return;
                const signature = typeof highlight.signature === 'string' ? highlight.signature : '';
                const nodeRef = resolveNodeRef(highlight);
                const highlightMessage = resolveInlineIssueMessage({
                    checkId,
                    checkData: check,
                    preferredMessage: highlight.message,
                    fallbackMessage: check.explanation || ''
                }).toString().slice(0, 300);
                const snippetValue = highlight.snippet || highlight.text || '';
                fallbackSnippet = fallbackSnippet || snippetValue;
                fallbackSourcePack = fallbackSourcePack || highlight.explanation_pack || check.ai_explanation_pack || check.explanation_pack || null;
                if (!nodeRef) {
                    if (!fallbackFailureReason) {
                        fallbackFailureReason = 'missing_anchor';
                        fallbackSignature = signature || '';
                    }
                    return;
                }

                const blockText = nodeRefToText.get(nodeRef) || '';
                if (!blockText) {
                    if (!fallbackFailureReason) {
                        fallbackFailureReason = 'missing_block_text';
                        fallbackNodeRef = nodeRef;
                        fallbackSignature = signature || '';
                    }
                    return;
                }

                const scope = resolveSerializerScope(checkId, highlight.scope);
                const effectiveSnippetValue = scope === 'block' && blockText
                    ? blockText
                    : snippetValue;
                const boundaryFallback = buildBoundaryFromText(snippetValue, scope);
                const boundary = mergeBoundary(highlight.boundary, boundaryFallback);
                const textQuoteSelector = scope === 'block' ? null : (highlight.text_quote_selector || highlight.quote || null);
                const resolvedRange = resolveDeterministicRange(blockText, highlight, scope, boundary, effectiveSnippetValue);
                if (!resolvedRange) {
                    if (!fallbackFailureReason) {
                        fallbackFailureReason = 'resolver_failed';
                        fallbackNodeRef = nodeRef;
                        fallbackSignature = signature || '';
                    }
                    return;
                }

                const resolvedPrecision = evaluateInlinePrecision({
                    checkId,
                    provenance: check.provenance || '',
                    scope,
                    resolvedRange,
                    blockText,
                    snippetValue: effectiveSnippetValue,
                    boundary,
                    anchorStatus: resolvedRange.anchor_status,
                    anchorStrategy: resolvedRange.anchor_strategy
                });
                if (!resolvedPrecision.allowed) {
                    if (!fallbackFailureReason) {
                        fallbackFailureReason = resolvedPrecision.reason;
                        fallbackNodeRef = nodeRef;
                        fallbackSignature = signature || '';
                    }
                    return;
                }

                renderedSegments.push({
                    highlight,
                    nodeRef,
                    signature,
                    message: highlightMessage,
                    scope,
                    boundary,
                    textQuoteSelector,
                    effectiveSnippetValue,
                    resolvedRange,
                    resolvedPrecision,
                    isPrimary: highlight === primaryHighlight
                });
            });

            if (!renderedSegments.length) {
                pushUnhighlightableIssue(buildUnhighlightableIssue({
                    checkId,
                    check,
                    instanceIndex,
                    verdict,
                    message: primaryMessage,
                    snippet: fallbackSnippet || '',
                    failureReason: fallbackFailureReason || 'missing_anchor',
                    nodeRef: fallbackNodeRef || resolveNodeRef(primaryHighlight) || '',
                    signature: fallbackSignature || (typeof primaryHighlight.signature === 'string' ? primaryHighlight.signature : ''),
                    sourcePack: fallbackSourcePack
                }));
                hasRenderedInstance = true;
                return;
            }

            const representative = renderedSegments.find((segment) => segment.isPrimary) || renderedSegments[0];
            const inlineExplanationPack = buildIssueExplanationPack({
                checkId,
                checkData: check,
                message: primaryMessage,
                actionSuggestion: '',
                snippet: representative.effectiveSnippetValue || fallbackSnippet || '',
                failureReason: '',
                rewriteTarget: null,
                sourcePack: representative.highlight.explanation_pack || fallbackSourcePack,
                runId,
                instanceIndex
            });
            const reviewSummary = composeReviewSummaryNarrative(inlineExplanationPack, {
                checkId,
                failureReason: ''
            });
            const inlineFixAssistTriage = buildSerializedFixAssistTriage({
                checkId,
                checkName: String(check.title || check.name || getCheckDefinitionMeta(checkId)?.name || checkId || ''),
                snippet: representative.effectiveSnippetValue || fallbackSnippet || '',
                message: primaryMessage,
                failureReason: '',
                rewriteTarget: null,
                repairIntent: null
            });
            v2Findings.push({
                run_id: runId || '',
                check_id: String(checkId || ''),
                instance_index: instanceIndex,
                issue_key: issueKey,
                verdict: String(verdict),
                message: primaryMessage,
                node_ref: representative.nodeRef,
                signature: representative.signature || '',
                scope: representative.scope,
                boundary: representative.boundary,
                text_quote_selector: representative.textQuoteSelector,
                snippet: representative.effectiveSnippetValue ? String(representative.effectiveSnippetValue).slice(0, 800) : '',
                type: representative.highlight.type,
                anchor_status: representative.resolvedRange.anchor_status,
                anchor_strategy: representative.resolvedRange.anchor_strategy,
                fix_assist_triage: inlineFixAssistTriage,
                explanation_pack: inlineExplanationPack,
                issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack),
                ...(reviewSummary ? { review_summary: reviewSummary } : {}),
                ...(group.collapsed
                    ? {
                        collapsed_member_count: groupHighlights.length,
                        collapsed_source_instance_indexes: Array.isArray(group.source_instance_indexes)
                            ? group.source_instance_indexes.slice()
                            : []
                    }
                    : {})
            });

            renderedSegments.forEach((segment, segmentIndex) => {
                if (!highlightsByNodeRef.has(segment.nodeRef)) highlightsByNodeRef.set(segment.nodeRef, []);
                highlightsByNodeRef.get(segment.nodeRef).push({
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    instance_index: instanceIndex,
                    issue_key: issueKey,
                    verdict: String(verdict),
                    message: primaryMessage,
                    node_ref: segment.nodeRef,
                    signature: segment.signature || '',
                    provenance: check.provenance || '',
                    anchor_status: segment.resolvedRange.anchor_status,
                    anchor_strategy: segment.resolvedRange.anchor_strategy,
                    start: segment.resolvedPrecision.start,
                    end: segment.resolvedPrecision.end,
                    range_key: `${issueKey}:${segmentIndex}`
                });
            });

            recordRecommendationIssue({
                run_id: runId || '',
                check_id: String(checkId || ''),
                check_name: String(check.title || check.name || getCheckDefinitionMeta(checkId)?.name || checkId || ''),
                instance_index: instanceIndex,
                issue_key: issueKey,
                verdict: String(verdict),
                message: primaryMessage,
                rationale: primaryMessage,
                snippet: representative.effectiveSnippetValue ? String(representative.effectiveSnippetValue).slice(0, 600) : '',
                explanation_pack: inlineExplanationPack,
                issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack),
                ...(reviewSummary ? { review_summary: reviewSummary } : {}),
                failure_reason: '',
                node_ref: representative.nodeRef,
                jump_node_ref: representative.nodeRef,
                signature: representative.signature || '',
                anchor_status: representative.resolvedRange.anchor_status,
                anchor_strategy: representative.resolvedRange.anchor_strategy,
                analysis_ref: {
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    instance_index: instanceIndex
                },
                fix_assist_triage: inlineFixAssistTriage,
                start: representative.resolvedPrecision.start,
                end: representative.resolvedPrecision.end,
                ...(group.collapsed
                    ? {
                        collapsed_member_count: groupHighlights.length,
                        collapsed_source_instance_indexes: Array.isArray(group.source_instance_indexes)
                            ? group.source_instance_indexes.slice()
                            : []
                    }
                    : {})
            });
            hasRenderedInstance = true;
        });

        if (!hasRenderedInstance) {
            pushUnhighlightableIssue(buildUnhighlightableIssue({
                checkId,
                check,
                instanceIndex: 0,
                verdict,
                message: fallbackMessage || `${String(checkId || '')} requires manual review`,
                snippet: '',
                failureReason: resolveNoCandidateReason(checkId, check, evidencePolicy),
                nodeRef: '',
                signature: '',
                sourcePack: check.ai_explanation_pack || check.explanation_pack || null
            }));
        }
    });

    const panelStyle = 'display:none;flex-direction:column;gap:8px;margin-top:10px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;';
    const dedupedUnhighlightableIssues = dedupeUnhighlightableIssues(unhighlightableIssues)
        .filter((issue) => isRailEligibleCheck(issue && issue.check_id));
    const dedupedRecommendationRecords = dedupeUnhighlightableIssues(recommendationRecords)
        .filter((issue) => isRailEligibleCheck(issue && issue.check_id));

    const blocksHtml = blockMap.map((b) => {
        const nodeRef = b && b.node_ref ? String(b.node_ref) : '';
        const text = nodeRef ? (nodeRefToText.get(nodeRef) || '') : '';
        const items = nodeRef ? (highlightsByNodeRef.get(nodeRef) || []) : [];

        const ranges = items
            .map((it) => ({
                start: it.start,
                end: it.end,
                item: it,
                rangeKey: it.range_key || it.issue_key
            }))
            .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
            .sort((a, b2) => a.start - b2.start || b2.end - a.end);
        const events = [];
        ranges.forEach((r) => {
            events.push({ pos: r.start, type: 'start', range: r });
            events.push({ pos: r.end, type: 'end', range: r });
        });
        events.sort((a, b2) => {
            if (a.pos !== b2.pos) return a.pos - b2.pos;
            if (a.type === b2.type) {
                const aLen = a.range.end - a.range.start;
                const bLen = b2.range.end - b2.range.start;
                if (aLen !== bLen) return a.type === 'start' ? aLen - bLen : bLen - aLen;
                return a.type === 'start' ? a.range.start - b2.range.start : b2.range.start - a.range.start;
            }
            return a.type === 'end' ? -1 : 1;
        });

        const block = nodeRef ? (nodeRefToBlock.get(nodeRef) || b) : b;
        let bodyHtml = '';
        if (text && events.length) {
            let cursor = 0;
            let active = [];
            const renderSegment = (segmentText, activeRanges) => {
                if (!segmentText) return '';
                if (!activeRanges.length) return toHtmlText(segmentText);
                const sorted = activeRanges.slice().sort((a, b2) => {
                    const lenA = a.end - a.start;
                    const lenB = b2.end - b2.start;
                    if (lenA !== lenB) return lenA - lenB;
                    if (a.start !== b2.start) return a.start - b2.start;
                    return String(a.item.issue_key || '').localeCompare(String(b2.item.issue_key || ''));
                });
                const it = sorted[0].item;
                const issueKeys = sorted.map(r => r.item.issue_key).filter(Boolean);
                const provenance = String(it.provenance || '');
                const isAi = provenance !== 'deterministic';
                const spanClass = `aivi-overlay-highlight${isAi ? ' aivi-overlay-highlight-ai' : ''}`;
                const spanAttrs = [
                    `class="${spanClass}"`,
                    `data-run-id="${escapeAttr(it.run_id)}"`,
                    `data-check-id="${escapeAttr(it.check_id)}"`,
                    `data-instance-index="${escapeAttr(String(it.instance_index))}"`,
                    `data-issue-key="${escapeAttr(it.issue_key)}"`,
                    issueKeys.length ? `data-issue-keys="${escapeAttr(issueKeys.join(','))}"` : '',
                    `data-message="${escapeAttr(it.message)}"`,
                    `data-node-ref="${escapeAttr(it.node_ref)}"`,
                    it.signature ? `data-signature="${escapeAttr(it.signature)}"` : '',
                    provenance ? `data-provenance="${escapeAttr(provenance)}"` : '',
                    `data-start="${escapeAttr(String(it.start))}"`,
                    `data-end="${escapeAttr(String(it.end))}"`,
                    `data-severity="${escapeAttr(it.verdict)}"`,
                    it.anchor_status ? `data-anchor-status="${escapeAttr(it.anchor_status)}"` : '',
                    it.anchor_strategy ? `data-anchor-strategy="${escapeAttr(it.anchor_strategy)}"` : ''
                ].filter(Boolean).join(' ');
                return `<span ${spanAttrs}>${toHtmlText(segmentText)}</span>`;
            };

            events.forEach((event) => {
                if (event.pos > cursor) {
                    bodyHtml += renderSegment(text.slice(cursor, event.pos), active);
                    cursor = event.pos;
                }
                if (event.type === 'start') {
                    active.push(event.range);
                } else {
                    active = active.filter(r => r.rangeKey !== event.range.rangeKey);
                }
            });
            if (cursor < text.length) {
                bodyHtml += renderSegment(text.slice(cursor), active);
            }
        } else if (text) {
            bodyHtml = toHtmlText(text);
        } else {
            bodyHtml = '';
        }

        const previewBodyHtml = renderPreviewBodyHtml(block, bodyHtml);
        return `<div class="aivi-overlay-block" data-node-ref="${escapeAttr(nodeRef)}"><div class="aivi-overlay-block-body">${previewBodyHtml}</div><div class="aivi-overlay-inline-panel" style="${panelStyle}"></div></div>`;
    }).join('');

    const highlightItems = Array.from(highlightsByNodeRef.values()).flat();
    const highlightCount = highlightItems.length;
    const anchorStatusCounts = highlightItems.reduce((acc, item) => {
        const key = item.anchor_status === 'block_only' ? 'block_only' : 'anchored';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, { anchored: 0, block_only: 0 });

    // FIX 3: Debug logging for highlight generation diagnostics
    console.log(JSON.stringify({
        level: 'INFO',
        message: 'buildHighlightedHtml complete',
        run_id: runId,
        block_count: blockMap.length,
        checks_processed: Object.keys(checks).length,
        highlight_count: highlightCount,
        anchor_status_counts: anchorStatusCounts,
        unhighlightable_count: dedupedUnhighlightableIssues.length,
        has_html: blocksHtml.length > 0,
        html_length: blocksHtml.length,
        timestamp: new Date().toISOString()
    }));
    console.log(JSON.stringify({
        level: 'TELEMETRY',
        event: 'schema_assist_summary',
        run_id: runId || '',
        schema_assist_emitted_total: schemaAssistTelemetry.emitted_total,
        schema_assist_insertable_total: schemaAssistTelemetry.insertable_total,
        schema_assist_by_check: schemaAssistTelemetry.by_check,
        timestamp: new Date().toISOString()
    }));

    return {
        schema_version: '2.0.0',
        generated_at: generatedAt,
        run_id: runId,
        highlighted_html: blocksHtml,
        content_hash: contentHash,
        highlight_count: highlightCount,
        telemetry: {
            schema_assist_emitted_total: schemaAssistTelemetry.emitted_total,
            schema_assist_insertable_total: schemaAssistTelemetry.insertable_total,
            schema_assist_by_check: schemaAssistTelemetry.by_check
        },
        recommendations: dedupedRecommendationRecords,
        unhighlightable_issues: dedupedUnhighlightableIssues,
        v2_findings: v2Findings
    };
}

// ============================================
// ABORT RESPONSE GENERATION
// ============================================

/**
 * Abort reason codes - used in analysis_summary and details responses
 */
const ABORT_REASONS = {
    AI_UNAVAILABLE: 'ai_unavailable',
    TIMEOUT: 'timeout',
    INVALID_OUTPUT: 'invalid_output',
    INTERNAL_ERROR: 'internal_error',
    SCHEMA_VALIDATION_FAILED: 'schema_validation_failed'
};

/**
 * Generate an aborted analysis_summary payload
 * Used when AI execution fails, times out, or produces invalid output.
 *
 * CRITICAL: This is the ONLY response shape for aborted runs.
 * Do NOT expose partial results in any form.
 *
 * @param {string} runId - The run ID
 * @param {string} reason - One of ABORT_REASONS
 * @param {string} traceId - Trace ID for debugging
 * @returns {Object} - Aborted analysis_summary with exact required shape
 */
const generateAbortedSummary = (runId, reason, traceId) => {
    // Map reason to user-friendly but non-leaking message
    const reasonToMessage = {
        [ABORT_REASONS.AI_UNAVAILABLE]: 'AI service temporarily unavailable',
        [ABORT_REASONS.TIMEOUT]: 'Analysis timed out',
        [ABORT_REASONS.INVALID_OUTPUT]: 'Analysis could not be completed',
        [ABORT_REASONS.INTERNAL_ERROR]: 'An unexpected error occurred',
        [ABORT_REASONS.SCHEMA_VALIDATION_FAILED]: 'Analysis output validation failed'
    };

    return {
        version: '1.2.0',
        run_id: runId,
        status: 'aborted',
        reason: reason,
        message: 'Analysis aborted — no partial results shown',
        trace_id: traceId || `trace-${runId}-${Date.now()}`
    };
};

/**
 * Generate aborted response for details endpoint (HTTP 503)
 *
 * @param {string} runId - The run ID
 * @param {string} reason - One of ABORT_REASONS
 * @param {string} traceId - Trace ID for debugging
 * @returns {Object} - Response body for 503 Service Unavailable
 */
const generateAbortedDetailsResponse = (runId, reason, traceId) => {
    return {
        status: 'aborted',
        code: 'analysis_aborted',
        reason: reason,
        message: 'Analysis aborted — no partial results shown',
        trace_id: traceId || `trace-${runId}-${Date.now()}`
    };
};

/**
 * Generate stale response for details endpoint (HTTP 410)
 *
 * @param {string} runId - The run ID
 * @returns {Object} - Response body for 410 Gone
 */
const generateStaleDetailsResponse = (runId) => {
    return {
        status: 'stale',
        code: 'results_stale',
        message: 'Analysis results stale — please re-run analysis',
        run_id: runId
    };
};

/**
 * Map error type to abort reason
 *
 * @param {string} errorType - Error type from worker or AI client
 * @param {string} errorMessage - Error message
 * @returns {string} - One of ABORT_REASONS
 */
const mapErrorToAbortReason = (errorType, errorMessage = '') => {
    const lowerError = (errorType || '').toLowerCase();
    const lowerMessage = (errorMessage || '').toLowerCase();

    // Timeout errors
    if (lowerError.includes('timeout') || lowerMessage.includes('timeout') ||
        lowerError.includes('timed out') || lowerMessage.includes('timed out')) {
        return ABORT_REASONS.TIMEOUT;
    }

    // AI service errors (5xx, model unavailable)
    if (lowerError.includes('5') || lowerMessage.includes('service unavailable') ||
        lowerError.includes('model') || lowerMessage.includes('model not found') ||
        lowerError.includes('overload') || lowerMessage.includes('rate limit') ||
        lowerError === 'ai_unavailable' || lowerError === 'api_error') {
        return ABORT_REASONS.AI_UNAVAILABLE;
    }

    // Schema/JSON validation errors
    if (lowerError.includes('schema') || lowerError.includes('validation') ||
        lowerError.includes('json') || lowerError.includes('parse') ||
        lowerError === 'invalid_output' || lowerError === 'failed_schema') {
        return ABORT_REASONS.INVALID_OUTPUT;
    }

    // Default to internal error
    return ABORT_REASONS.INTERNAL_ERROR;
};

module.exports = {
    mapVerdictToUiVerdict,
    serializeForSidebar,
    enrichWithUiVerdict,
    prepareSidebarPayload,
    extractCheckDetails,
    buildHighlightedHtml,
    buildCategoryLookup,
    loadPrimaryCategoryMap,
    validateCategoryMapping,
    // Abort handling exports
    ABORT_REASONS,
    generateAbortedSummary,
    generateAbortedDetailsResponse,
    generateStaleDetailsResponse,
    mapErrorToAbortReason
};
