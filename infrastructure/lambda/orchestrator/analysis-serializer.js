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
const { resolveRewriteTarget } = require('./rewrite-target-resolver');
const { buildSchemaAssistDraft } = require('./schema-draft-builder');

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
            const categoryName = String(category.name || '').trim();
            const categoryDescription = String(category.description || '').trim();
            const checks = category.checks && typeof category.checks === 'object'
                ? category.checks
                : {};
            Object.entries(checks).forEach(([checkId, checkDef]) => {
                if (!checkId || !checkDef || typeof checkDef !== 'object') return;
                lookup[String(checkId)] = {
                    name: String(checkDef.name || checkId).trim(),
                    description: String(checkDef.description || '').trim(),
                    category_name: categoryName,
                    category_description: categoryDescription
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

const isSyntheticDiagnosticCheck = (checkData) => {
    if (!checkData || typeof checkData !== 'object') return false;
    const provenance = typeof checkData.provenance === 'string'
        ? checkData.provenance.toLowerCase().trim()
        : '';
    return checkData.synthetic_generated === true
        || checkData.diagnostic_only === true
        || provenance === 'synthetic';
};

const LEGACY_NON_INLINE_REASON_BY_CHECK = {
    metadata_checks: 'metadata_document_scope',
    valid_jsonld_schema: 'jsonld_document_scope',
    schema_matches_content: 'schema_content_alignment_non_inline',
    semantic_html_usage: 'semantic_structure_non_inline',
    supported_schema_types_validation: 'schema_validation_non_inline',
    faq_jsonld_presence_and_completeness: 'faq_schema_non_inline',
    howto_jsonld_presence_and_completeness: 'howto_schema_non_inline',
    howto_schema_presence_and_completeness: 'howto_schema_non_inline',
    author_identified: 'missing_author_byline',
    author_bio_present: 'missing_author_bio',
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
const DETERMINISTIC_WHY_FALLBACK_VARIANTS = [
    ({ checkName }) => `${checkName} affects whether this section is interpreted as reliable evidence.`,
    ({ checkName }) => `Weak ${checkName} signals can lower retrieval precision and citation confidence.`,
    ({ checkName }) => `${checkName} is a grounding signal; weak coverage can reduce answer reliability.`,
    ({ checkName }) => `Strong ${checkName} cues help machine readers rank and reuse this content safely.`
];

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
    const message = typeof builder === 'function'
        ? builder({ checkName })
        : `This highlighted section maps to ${checkName}. Improve clarity and supporting detail for extraction reliability.`;
    return clampGuidanceText(message, 320);
};

const resolveInlineIssueMessage = ({ checkId, checkData, preferredMessage, fallbackMessage }) => {
    const preferred = String(preferredMessage || '').trim();
    const fallback = String(fallbackMessage || '').trim();
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

const SEMANTIC_WHY_IT_MATTERS_VARIANTS = [
    ({ checkName, definitionDescription }) => definitionDescription
        ? `${checkName} checks ${definitionDescription}. When this signal is weak, extraction precision and citation confidence can drop.`
        : `${checkName} is a quality signal for answer extraction. Weak results can reduce citation confidence.`,
    ({ checkName, definitionDescription }) => definitionDescription
        ? `Answer engines rely on ${checkName} because it reflects ${definitionDescription}. Failing here can lower trust and retrieval reliability.`
        : `Answer engines use ${checkName} as a trust cue. Weak performance here can reduce retrieval reliability and answer quality.`,
    ({ checkName, definitionDescription }) => definitionDescription
        ? `This finding impacts how models interpret ${definitionDescription}. Better quality in ${checkName} usually improves grounding and summary accuracy.`
        : `This finding affects grounding quality. Stronger ${checkName} signals typically improve summary accuracy and citation stability.`,
    ({ checkName, definitionDescription }) => definitionDescription
        ? `${checkName} influences whether evidence is treated as reliable for machine summaries. Gaps in ${definitionDescription} can weaken citability.`
        : `${checkName} influences whether evidence is treated as reliable in machine summaries. Weak signals here can limit citability.`
];

const clampGuidanceText = (value, max = 280) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const ensureSentence = (value) => {
    const text = clampGuidanceText(value, 360);
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

const normalizeGuidanceSteps = (value) => {
    const raw = Array.isArray(value)
        ? value
        : (typeof value === 'string' && value.trim() ? [value] : []);
    return raw
        .map((step) => normalizeStepText(step, 220))
        .filter(Boolean)
        .slice(0, 4);
};

const LOW_VALUE_STEP_PATTERNS = [
    /^review this recommendation/i,
    /^review this check manually/i,
    /^review this section manually/i,
    /^rewrite only the flagged inline span\.?$/i,
    /^rewrite only the flagged text\.?$/i,
    /^use jump to block/i,
    /^view details/i,
    /^this issue is absence-based/i,
    /^this check is recommendation-only by policy/i
];

const isLowValueGuidanceStep = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return true;
    return LOW_VALUE_STEP_PATTERNS.some((pattern) => pattern.test(text));
};

const buildRecommendationDepthSteps = ({
    checkName,
    snippet,
    actionSuggestion,
    rewriteTarget,
    existingSteps,
    failureReason
}) => {
    const seedSteps = Array.isArray(existingSteps)
        ? existingSteps.filter((step) => !isLowValueGuidanceStep(step))
        : [];
    const steps = [...seedSteps];
    const operation = String(rewriteTarget?.operation || '').toLowerCase().trim();
    const actionStep = isGenericRepairInstruction(actionSuggestion)
        ? ''
        : normalizeStepText(actionSuggestion, 220);
    const syntheticFallback = isSyntheticFallbackReason(failureReason);

    if (syntheticFallback) {
        if (steps.length > 0) {
            return normalizeGuidanceSteps(steps).slice(0, 2);
        }
        const syntheticSteps = [];
        if (actionStep) {
            syntheticSteps.push(actionStep);
        } else if (snippet) {
            syntheticSteps.push('Start with the quoted passage and strengthen one concrete claim with explicit support.');
        } else {
            syntheticSteps.push(`Apply the highest-impact edit for ${checkName}: tighten one core claim and add concrete evidence.`);
        }
        syntheticSteps.push(`Re-run analysis and confirm ${checkName} returns pass.`);
        return normalizeGuidanceSteps(syntheticSteps).slice(0, 2);
    }
    const needsScaffold = steps.length < 2;

    if (needsScaffold) {
        if (snippet) {
            steps.push('Start from the quoted passage and rewrite one clear claim with no filler language.');
        } else {
            steps.push(`Locate the section tied to ${checkName} and rewrite the weakest sentence first.`);
        }

        if (operation === 'convert_to_list' || operation === 'convert_to_steps') {
            steps.push('Convert dense prose into short bullets so each point carries one concrete action or fact.');
        } else if (operation === 'heading_support_range') {
            steps.push('Keep the heading intact and strengthen the supporting sentences directly below it.');
        } else {
            steps.push('Add one concrete supporting detail (fact, number, condition, or source cue) near the revised claim.');
        }

        if (actionStep) {
            steps.push(actionStep);
        }
        steps.push(`Re-run analysis and confirm ${checkName} passes.`);
    } else if (actionStep && steps.length < 4) {
        steps.push(actionStep);
    }

    return normalizeGuidanceSteps(steps).slice(0, 4);
};

const enrichRecommendationExplanationPack = (pack, context = {}) => {
    const normalized = normalizeExplanationPack(pack) || {};
    const checkName = clampGuidanceText(context.checkName || 'this check', 120);
    const snippet = clampGuidanceText(context.snippet || '', 260);
    const fallbackWhatFailed = snippet
        ? `The section for ${checkName} is not specific enough for reliable extraction and citation.`
        : `${checkName} did not provide sufficiently explicit, supportable evidence in this section.`;

    const whatFailed = clampGuidanceText(normalized.what_failed || fallbackWhatFailed, 280);
    const whyItMatters = clampGuidanceText(normalized.why_it_matters || context.whyFallback || '', 300);
    const depthSteps = buildRecommendationDepthSteps({
        checkName,
        snippet,
        actionSuggestion: context.actionSuggestion || '',
        rewriteTarget: context.rewriteTarget || null,
        existingSteps: normalized.how_to_fix_steps || [],
        failureReason: context.failureReason || ''
    });
    const syntheticFallback = isSyntheticFallbackReason(context.failureReason);

    const merged = {
        what_failed: whatFailed,
        ...(whyItMatters ? { why_it_matters: whyItMatters } : {}),
        ...(depthSteps.length ? { how_to_fix_steps: depthSteps } : {}),
        ...(!syntheticFallback && normalized.example_pattern
            ? { example_pattern: normalized.example_pattern }
            : (!syntheticFallback && context.examplePattern ? { example_pattern: context.examplePattern } : {}))
    };

    return normalizeExplanationPack(merged);
};

const normalizeExplanationPack = (rawPack) => {
    if (!rawPack || typeof rawPack !== 'object') return null;
    const whatFailed = clampGuidanceText(rawPack.what_failed || rawPack.message || '', 280);
    const whyItMatters = clampGuidanceText(rawPack.why_it_matters || '', 300);
    const howToFixSteps = normalizeGuidanceSteps(rawPack.how_to_fix_steps);
    const examplePattern = clampGuidanceText(rawPack.example_pattern || '', 240);
    const issueExplanation = clampGuidanceText(rawPack.issue_explanation || '', 900);
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

const stableHash = (value) => {
    const input = String(value || '');
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const buildSemanticWhyItMatters = ({ checkName, definitionDescription, checkId, runId, instanceIndex }) => {
    const variants = SEMANTIC_WHY_IT_MATTERS_VARIANTS;
    const seed = `${String(runId || '')}:${String(checkId || '')}:${Number.isFinite(instanceIndex) ? instanceIndex : 0}:semantic-why`;
    const idx = stableHash(seed) % variants.length;
    const selected = variants[idx];
    const raw = typeof selected === 'function'
        ? selected({ checkName, definitionDescription })
        : '';
    return clampGuidanceText(raw, 300);
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
        return normalizedVariant;
    }
    const fallbackSteps = [];
    if (snippet) {
        fallbackSteps.push('Edit this specific snippet first, then tighten the surrounding sentence for clarity.');
    } else {
        fallbackSteps.push('Locate the affected section and isolate the weakest sentence before rewriting.');
    }
    fallbackSteps.push('Add concrete, verifiable detail so the section can be extracted and cited reliably.');
    fallbackSteps.push('Re-run analysis and confirm this check returns pass.');
    const fallbackCheckName = String(checkId || 'this check');
    const whySeed = `${String(runId || '')}:${fallbackCheckName}:${Number.isFinite(instanceIndex) ? instanceIndex : 0}:deterministic-why`;
    const whyIdx = stableHash(whySeed) % DETERMINISTIC_WHY_FALLBACK_VARIANTS.length;
    const whyBuilder = DETERMINISTIC_WHY_FALLBACK_VARIANTS[whyIdx];
    const fallbackWhy = typeof whyBuilder === 'function'
        ? whyBuilder({ checkName: fallbackCheckName })
        : `Weak ${fallbackCheckName} signals can reduce retrieval precision and citation confidence.`;
    return {
        what_failed: clampGuidanceText(message || `${String(checkId || 'This check')} did not meet its structural threshold.`, 280),
        why_it_matters: clampGuidanceText(fallbackWhy, 300),
        how_to_fix_steps: fallbackSteps.slice(0, 3),
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
        280
    );
    const actionStep = !isGenericRepairInstruction(actionSuggestion)
        ? normalizeStepText(actionSuggestion, 220)
        : '';
    const steps = [];
    if (actionStep) {
        steps.push(actionStep);
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

const isGenericRepairInstruction = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    return GENERIC_REPAIR_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text));
};

const composeIssueExplanationNarrative = (pack) => {
    const normalized = normalizeExplanationPack(pack);
    if (!normalized) return '';
    const explicit = clampGuidanceText(stripGuidanceScaffold(pack && pack.issue_explanation ? pack.issue_explanation : ''), 900);
    if (explicit) return explicit;
    const parts = [];
    if (normalized.what_failed) parts.push(ensureSentence(normalized.what_failed));
    if (normalized.why_it_matters) parts.push(ensureSentence(normalized.why_it_matters));
    if (Array.isArray(normalized.how_to_fix_steps) && normalized.how_to_fix_steps.length) {
        normalized.how_to_fix_steps.slice(0, 3).forEach((step) => {
            const sentence = ensureSentence(step);
            if (sentence) parts.push(sentence);
        });
    }
    if (normalized.example_pattern) {
        parts.push(ensureSentence(`For example, ${normalized.example_pattern}`));
    }
    return clampGuidanceText(parts.join(' ').replace(/\s+/g, ' ').trim(), 900);
};

const inferExamplePattern = ({ rewriteTarget, failureReason, checkId }) => {
    const operation = String(rewriteTarget?.operation || '').toLowerCase().trim();
    const reason = String(failureReason || '').toLowerCase().trim();
    const id = String(checkId || '').toLowerCase().trim();

    if (operation === 'convert_to_list' || operation === 'convert_to_steps') {
        return 'Use a short lead sentence, then 3-5 bullet points with concrete actions and outcomes.';
    }
    if (operation === 'heading_support_range' || reason.includes('heading') || id.includes('heading')) {
        return 'After the heading, add 2-3 supporting sentences: definition, concrete detail, and a clear takeaway.';
    }
    if (reason.includes('citation') || reason.includes('source') || id.includes('citation') || id.includes('claim')) {
        return 'State the claim directly, add a verifiable source near it, and include one concrete number/date.';
    }
    return 'Lead with a direct statement, add one supporting fact, then close with a concrete next step.';
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
    const definitionDescription = clampGuidanceText(
        definitionMeta?.description || definitionMeta?.category_description || '',
        220
    );
    const normalizedFailureReason = String(failureReason || '').trim().toLowerCase();
    const resolvedMessage = clampGuidanceText(
        message
        || checkData?.explanation
        || `${checkName} did not meet the required quality threshold.`,
        260
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
    const aiPack = normalizeExplanationPack(sourcePack)
        || normalizeExplanationPack(checkData?.ai_explanation_pack)
        || normalizeExplanationPack(checkData?.explanation_pack);
    if (aiPack) {
        const preferredActionSuggestion = !isGenericRepairInstruction(actionSuggestion)
            ? normalizeStepText(actionSuggestion, 220)
            : '';
        const merged = {
            ...aiPack,
            what_failed: aiPack.what_failed || resolvedMessage,
            why_it_matters: aiPack.why_it_matters || buildSemanticWhyItMatters({
                checkName,
                definitionDescription,
                checkId,
                runId,
                instanceIndex
            })
        };
        if (preferredActionSuggestion && (!Array.isArray(merged.how_to_fix_steps) || merged.how_to_fix_steps.length === 0)) {
            merged.how_to_fix_steps = [preferredActionSuggestion];
        }
        if (!merged.example_pattern) {
            merged.example_pattern = inferExamplePattern({ rewriteTarget, failureReason, checkId });
        }
        return normalizeExplanationPack(merged);
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

    const whyItMatters = buildSemanticWhyItMatters({
        checkName,
        definitionDescription,
        checkId,
        runId,
        instanceIndex
    });
    const steps = [];
    if (snippet) {
        steps.push('Locate the flagged snippet and edit only the smallest sentence/section needed.');
    } else {
        steps.push(`Locate the section tied to ${checkName} and isolate the weakest passage first.`);
    }
    const actionStep = isGenericRepairInstruction(actionSuggestion)
        ? ''
        : normalizeStepText(actionSuggestion, 220);
    if (actionStep) {
        steps.push(actionStep);
    } else {
        steps.push('Rewrite for clarity and specificity: remove filler, keep one clear claim, and add concrete support.');
    }
    steps.push(`Re-run analysis and confirm ${checkName} returns pass.`);

    return {
        what_failed: resolvedMessage,
        why_it_matters: whyItMatters,
        how_to_fix_steps: steps.slice(0, 3),
        example_pattern: inferExamplePattern({ rewriteTarget, failureReason, checkId })
    };
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
        rewrite_target_policy: String(entry.rewrite_target_policy || '').trim().toLowerCase(),
        rewrite_allowed_ops: Array.isArray(entry.rewrite_allowed_ops)
            ? entry.rewrite_allowed_ops.map((op) => String(op || '').trim()).filter(Boolean)
            : [],
        rewrite_context_window: Number.isInteger(entry.rewrite_context_window)
            ? entry.rewrite_context_window
            : null
    };
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

const inferRewriteOperation = (policy, allowedOps) => {
    if (Array.isArray(allowedOps) && allowedOps.length > 0) {
        return allowedOps[0];
    }
    if (policy === 'heading_support_range') return 'heading_support_range';
    if (policy === 'block' || policy === 'section') return 'replace_block';
    return 'replace_span';
};

const isSectionFirstRewriteEnabled = () => {
    const raw = process.env.REWRITE_SECTION_FIRST_V1;
    if (raw === undefined || raw === null) return false;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1'
        || normalized === 'true'
        || normalized === 'yes'
        || normalized === 'on'
        || normalized === 'enabled';
};

const isStabilityReleaseModeEnabled = () => {
    const raw = process.env.STABILITY_RELEASE_MODE_V1;
    if (raw === undefined || raw === null) return false;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1'
        || normalized === 'true'
        || normalized === 'yes'
        || normalized === 'on'
        || normalized === 'enabled';
};

const hasStrongProjectionAnchor = ({ primaryNodeRef, signature, start, end }) => {
    const hasNodeRef = !!String(primaryNodeRef || '').trim();
    const hasSignature = !!String(signature || '').trim();
    const hasOffsets = Number.isInteger(start) && Number.isInteger(end) && end > start;
    return hasNodeRef || hasSignature || hasOffsets;
};

const inferSectionProjectionOperation = (allowedOps = []) => {
    const normalized = (Array.isArray(allowedOps) ? allowedOps : [])
        .map((op) => String(op || '').trim().toLowerCase())
        .filter(Boolean);
    const preferredOrder = [
        'convert_to_steps',
        'convert_to_list',
        'replace_block',
        'insert_after_heading',
        'append_support'
    ];
    for (const preferred of preferredOrder) {
        if (normalized.includes(preferred)) return preferred;
    }
    const firstNonInline = normalized.find((op) => op !== 'replace_span');
    if (firstNonInline) return firstNonInline;
    return 'replace_block';
};

const buildSummaryRepairIntent = (checkId, checkData, policy, operation) => {
    const checkName = String(checkData?.title || checkData?.name || checkId || '').trim();
    const explanation = String(checkData?.explanation || '').trim();
    const mustPreserve = [];
    const mustChange = [];

    if (policy === 'heading_support_range') {
        mustPreserve.push('Keep the heading text and section intent.');
        mustChange.push('Improve the supporting content under the heading.');
    } else if (operation === 'convert_to_list') {
        mustPreserve.push('Keep the original meaning and factual details.');
        mustChange.push('Convert dense prose into a clear bullet list for scanning.');
    } else if (policy === 'block' || policy === 'section') {
        mustPreserve.push('Keep section intent and factual meaning.');
        mustChange.push('Rewrite the targeted block(s) for clarity and citability.');
    } else {
        mustPreserve.push('Keep surrounding sentence meaning and tone.');
        mustChange.push('Rewrite only the flagged inline span.');
    }

    return {
        check_id: checkId,
        check_name: checkName || checkId,
        rule_hint: explanation || `Improve content for ${checkName || checkId}.`,
        instruction: mustChange[0],
        must_preserve: mustPreserve,
        must_change: mustChange
    };
};

const buildSummaryRewriteContext = ({ checkId, checkData, highlight, fallbackSource }) => {
    const policy = getRuntimeContractCheckPolicy(checkId);
    if (!policy) {
        return { rewrite_target: null, repair_intent: null };
    }

    const rewritePolicy = String(policy.rewrite_target_policy || '').trim().toLowerCase() || 'inline_span';
    const rewriteMode = String(policy.rewrite_mode || '').trim().toLowerCase();
    const operation = inferRewriteOperation(rewritePolicy, policy.rewrite_allowed_ops);
    const source = highlight && typeof highlight === 'object'
        ? highlight
        : (fallbackSource && typeof fallbackSource === 'object' ? fallbackSource : {});
    const snippet = String(source.snippet || source.text || '').trim();
    const primaryNodeRef = String(source.node_ref || source.nodeRef || '').trim();
    const signature = String(source.signature || '').trim();
    const start = Number.isInteger(source.start) ? source.start : null;
    const end = Number.isInteger(source.end) ? source.end : null;
    const strongAnchor = hasStrongProjectionAnchor({ primaryNodeRef, signature, start, end });
    const sectionFirstEnabled = isSectionFirstRewriteEnabled();
    const weakInlineProjection = sectionFirstEnabled
        && rewritePolicy === 'inline_span'
        && !strongAnchor
        && !!snippet;
    const projectedPolicy = weakInlineProjection ? 'section' : rewritePolicy;
    const projectedOperation = weakInlineProjection
        ? inferSectionProjectionOperation(policy.rewrite_allowed_ops)
        : operation;
    const actionable = rewriteMode === 'ai_rewrite' && (
        strongAnchor
        || !!snippet
    );
    const resolvedStart = weakInlineProjection ? null : start;
    const resolvedEnd = weakInlineProjection ? null : end;

    const rewriteTarget = {
        actionable,
        mode: projectedPolicy,
        operation: projectedOperation,
        primary_node_ref: primaryNodeRef || null,
        node_refs: primaryNodeRef ? [primaryNodeRef] : [],
        target_text: snippet || null,
        quote: snippet ? { exact: snippet } : null,
        start: resolvedStart,
        end: resolvedEnd,
        resolver_reason: actionable
            ? (weakInlineProjection ? 'summary_weak_inline_routed_to_section' : 'summary_contract_projection')
            : (rewriteMode === 'manual_review' ? 'manual_review_policy' : 'summary_anchor_unavailable')
    };

    if (projectedPolicy === 'heading_support_range' && primaryNodeRef) {
        rewriteTarget.heading_node_ref = primaryNodeRef;
    }
    if (Number.isInteger(policy.rewrite_context_window)) {
        rewriteTarget.rewrite_context_window = policy.rewrite_context_window;
    }

    const repairIntent = buildSummaryRepairIntent(checkId, checkData, projectedPolicy, projectedOperation);
    return { rewrite_target: rewriteTarget, repair_intent: repairIntent };
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
            const effectiveHighlights = checkData.highlights || [];
            const instanceCount = effectiveHighlights.length;

            const compactHighlights = effectiveHighlights.map((highlight, highlightIndex) => {
                const snippet = highlight.snippet || highlight.text || '';
                const scope = normalizeScope(highlight.scope);
                const boundaryFallback = buildBoundaryFromText(snippet, scope);
                const boundary = mergeBoundary(highlight.boundary, boundaryFallback);
                const rewriteContext = buildSummaryRewriteContext({
                    checkId,
                    checkData,
                    highlight,
                    fallbackSource: highlight
                });
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
                    anchor_strategy: highlight.anchor_strategy || null,
                    analysis_ref: {
                        run_id: runId || '',
                        check_id: checkId,
                        instance_index: highlightIndex
                    }
                };
                const highlightExplanationPack = buildIssueExplanationPack({
                    checkId,
                    checkData,
                    message: compactHighlight.message,
                    actionSuggestion: rewriteContext?.repair_intent?.instruction || checkData.explanation || '',
                    snippet,
                    failureReason: highlight.failure_reason || '',
                    rewriteTarget: rewriteContext?.rewrite_target || null,
                    sourcePack: highlight.explanation_pack,
                    runId,
                    instanceIndex: highlightIndex
                });
                compactHighlight.explanation_pack = highlightExplanationPack;
                compactHighlight.issue_explanation = composeIssueExplanationNarrative(highlightExplanationPack);
                if (rewriteContext.rewrite_target) {
                    compactHighlight.rewrite_target = rewriteContext.rewrite_target;
                }
                if (rewriteContext.repair_intent) {
                    compactHighlight.repair_intent = rewriteContext.repair_intent;
                }
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
            const issueRewriteContext = buildSummaryRewriteContext({
                checkId,
                checkData,
                highlight: effectiveHighlights.length > 0 ? effectiveHighlights[0] : null,
                fallbackSource: firstInstanceSource
            });
            const issueExplanationPack = buildIssueExplanationPack({
                checkId,
                checkData,
                message: checkData.explanation || '',
                actionSuggestion: issueRewriteContext?.repair_intent?.instruction || checkData.explanation || '',
                snippet: firstInstanceSnippet,
                failureReason: '',
                rewriteTarget: issueRewriteContext?.rewrite_target || null,
                sourcePack: checkData.ai_explanation_pack || checkData.explanation_pack,
                runId,
                instanceIndex: 0
            });

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
                analysis_ref: {
                    run_id: runId || '',
                    check_id: checkId,
                    instance_index: 0
                },
                explanation_pack: issueExplanationPack,
                issue_explanation: composeIssueExplanationNarrative(issueExplanationPack),
                highlights: includeHighlights ? compactHighlights : []
            };
            if (issueRewriteContext.rewrite_target) {
                issueSummary.rewrite_target = issueRewriteContext.rewrite_target;
            }
            if (issueRewriteContext.repair_intent) {
                issueSummary.repair_intent = issueRewriteContext.repair_intent;
            }

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
const extractCheckDetails = (fullAnalysis, checkId, instanceIndex = null) => {
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
    const normalizeCandidate = (candidate) => {
        if (!candidate || typeof candidate !== 'object') return candidate;
        const snippet = candidate.snippet || candidate.text || (candidate.quote && candidate.quote.exact) || '';
        const scope = normalizeScope(candidate.scope);
        const boundaryFallback = buildBoundaryFromText(snippet, scope);
        const boundary = mergeBoundary(candidate.boundary, boundaryFallback);
        const quote = candidate.text_quote_selector || candidate.quote || (snippet ? { exact: snippet } : null);
        return {
            ...candidate,
            snippet,
            scope,
            boundary,
            text_quote_selector: quote,
            quote: quote
        };
    };

    // If instance index specified, filter highlights to that instance
    if (instanceIndex !== null) {
        if (highlights[instanceIndex]) {
            details.focused_highlight = normalizeHighlight(highlights[instanceIndex]);
        } else if (failedCandidates[instanceIndex]) {
            details.focused_failed_candidate = normalizeCandidate(failedCandidates[instanceIndex]);
            details.cannot_anchor = true;
        } else if (candidateHighlights[instanceIndex]) {
            details.focused_failed_candidate = normalizeCandidate(candidateHighlights[instanceIndex]);
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
    const stabilityReleaseMode = isStabilityReleaseModeEnabled();
    const crypto = require('crypto');
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
        'orphan_headings',
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
    blockMap.forEach((b) => {
        if (!b) return;
        if (b.signature && b.node_ref) signatureToNodeRef.set(String(b.signature), String(b.node_ref));
        if (b.node_ref) nodeRefToText.set(String(b.node_ref), normalizeText(b.text || b.text_content || ''));
    });

    const highlightsByNodeRef = new Map();
    const unhighlightableIssues = [];
    const checks = (analysisResult && analysisResult.checks) ? analysisResult.checks : {};
    const v2Findings = [];
    const rewriteResolutionCache = new Map();
    const recommendationTelemetry = {
        total: 0,
        actionable: 0,
        explanation_pack_attached: 0,
        fix_with_ai_eligible_targets: 0,
        fix_with_ai_suppressed_by_stability_mode: 0,
        by_mode: {},
        by_failure_reason: {}
    };
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
                runMetadata,
                allChecks: checks || {}
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
        schemaAssistCache.set(normalizedCheckId, schemaAssist || null);
        return schemaAssist;
    };
    const resolveRecommendationRewriteContext = (checkId, check, instanceIndex) => {
        const cacheKey = `${String(checkId || '')}:${Number.isFinite(Number(instanceIndex)) ? Number(instanceIndex) : 0}`;
        if (rewriteResolutionCache.has(cacheKey)) {
            return rewriteResolutionCache.get(cacheKey);
        }
        let resolution = null;
        try {
            resolution = resolveRewriteTarget({
                checkId: String(checkId || ''),
                checkDetails: check || {},
                manifest,
                instanceIndex: Number.isFinite(Number(instanceIndex)) ? Number(instanceIndex) : 0
            });
        } catch (resolverError) {
            console.log(JSON.stringify({
                level: 'WARN',
                message: 'Recommendation rewrite target resolver failed',
                run_id: runId || '',
                check_id: String(checkId || ''),
                instance_index: Number.isFinite(Number(instanceIndex)) ? Number(instanceIndex) : 0,
                error: resolverError && resolverError.message ? resolverError.message : 'resolver_error',
                timestamp: new Date().toISOString()
            }));
            resolution = null;
        }
        rewriteResolutionCache.set(cacheKey, resolution);
        return resolution;
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
    const resolveRecommendationAction = (failureReason, context = {}) => {
        const normalizedReason = String(failureReason || '').toLowerCase();
        const checkName = String(context.check_name || context.check_id || 'this check').trim();
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
            return 'Generate and add FAQ JSON-LD for this section in your schema/SEO settings.';
        }
        if (normalizedReason === 'intro_schema_non_inline') {
            return 'Add FAQ/HowTo schema for the intro question using your schema/SEO settings.';
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
                return 'Adjust the intro toward the target range (about 40-60 words): keep one direct topic sentence and one supporting fact.';
            case 'intro_readability_non_inline':
                return 'Simplify the intro by splitting long sentences, reducing passive voice, and keeping wording direct.';
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
                return `Rewrite the section tied to ${checkName} with one explicit claim, one concrete support detail, and concise wording.`;
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
        const normalizedInstanceIndex = Number.isFinite(Number(instanceIndex)) ? Number(instanceIndex) : 0;
        const resolution = resolveRecommendationRewriteContext(checkId, check, normalizedInstanceIndex);
        const rewriteTarget = resolution && resolution.rewrite_target && resolution.rewrite_target.actionable === true
            ? resolution.rewrite_target
            : null;
        const repairIntent = resolution && resolution.repair_intent ? resolution.repair_intent : null;
        const normalizedFailureReason = failureReason ? String(failureReason) : '';
        const resolvedNodeRef = isSyntheticFallbackReason(normalizedFailureReason)
            ? ''
            : (
                nodeRef
                || (signature ? (signatureToNodeRef.get(signature) || '') : '')
                || (rewriteTarget && rewriteTarget.primary_node_ref ? String(rewriteTarget.primary_node_ref) : '')
            );
        const definitionMeta = getCheckDefinitionMeta(checkId);
        const checkName = (check && (check.title || check.name))
            ? String(check.title || check.name)
            : String(definitionMeta?.name || checkId || '');
        const actionSuggestion = resolveRecommendationAction(failureReason, {
            check_id: String(checkId || ''),
            check_name: checkName
        });
        const semanticWhyFallback = buildSemanticWhyItMatters({
            checkName: clampGuidanceText(checkName || checkId || 'this check', 120),
            definitionDescription: clampGuidanceText(getCheckDefinitionMeta(checkId)?.description || '', 220),
            checkId,
            runId,
            instanceIndex: normalizedInstanceIndex
        });
        const explanationPack = buildIssueExplanationPack({
            checkId,
            checkData: check || {},
            message,
            actionSuggestion,
            snippet,
            failureReason: normalizedFailureReason,
            rewriteTarget: rewriteTarget || null,
            sourcePack: sourcePack || check?.ai_explanation_pack || check?.explanation_pack || null,
            runId,
            instanceIndex: normalizedInstanceIndex
        });
        const enrichedExplanationPack = enrichRecommendationExplanationPack(explanationPack, {
            checkName: checkName || checkId || 'this check',
            snippet,
            actionSuggestion,
            rewriteTarget,
            failureReason: normalizedFailureReason,
            whyFallback: semanticWhyFallback,
            examplePattern: inferExamplePattern({ rewriteTarget, failureReason: normalizedFailureReason, checkId })
        });
        if (rewriteTarget) {
            recommendationTelemetry.actionable += 1;
            const mode = String(rewriteTarget.mode || 'unknown');
            recommendationTelemetry.by_mode[mode] = (recommendationTelemetry.by_mode[mode] || 0) + 1;
            recommendationTelemetry.fix_with_ai_eligible_targets += 1;
        }
        recommendationTelemetry.total += 1;
        if (enrichedExplanationPack && typeof enrichedExplanationPack === 'object') {
            recommendationTelemetry.explanation_pack_attached += 1;
        }
        if (normalizedFailureReason) {
            recommendationTelemetry.by_failure_reason[normalizedFailureReason] =
                (recommendationTelemetry.by_failure_reason[normalizedFailureReason] || 0) + 1;
        }
        const baseIssue = {
            run_id: runId || '',
            check_id: String(checkId || ''),
            check_name: checkName,
            instance_index: normalizedInstanceIndex,
            issue_key: `${String(checkId || '')}:${normalizedInstanceIndex}`,
            verdict: String(verdict),
            message: String(message || '').slice(0, 300),
            rationale: String(message || '').slice(0, 300),
            snippet: snippet ? String(snippet).slice(0, 600) : '',
            action_suggestion: actionSuggestion,
            explanation_pack: enrichedExplanationPack,
            issue_explanation: composeIssueExplanationNarrative(enrichedExplanationPack),
            failure_reason: normalizedFailureReason,
            node_ref: resolvedNodeRef,
            jump_node_ref: resolvedNodeRef,
            signature: signature || '',
            anchor_status: 'unhighlightable',
            analysis_ref: {
                run_id: runId || '',
                check_id: String(checkId || ''),
                instance_index: normalizedInstanceIndex
            }
        };
        if (rewriteTarget) {
            baseIssue.rewrite_target = rewriteTarget;
        }
        if (repairIntent) {
            baseIssue.repair_intent = repairIntent;
        }
        if (rewriteTarget && Number.isFinite(rewriteTarget.start)) {
            baseIssue.start = rewriteTarget.start;
        }
        if (rewriteTarget && Number.isFinite(rewriteTarget.end)) {
            baseIssue.end = rewriteTarget.end;
        }
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
    Object.entries(checks).forEach(([checkId, check]) => {
        if (!check) return;
        const verdict = check.ui_verdict || check.verdict;
        if (verdict !== 'fail' && verdict !== 'partial') return;
        if (isSyntheticDiagnosticCheck(check)) {
            const syntheticReason = String(
                check.synthetic_reason
                || check.non_inline_reason
                || 'synthetic_fallback'
            );
            unhighlightableIssues.push(buildUnhighlightableIssue({
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
            const policyHighlight = (Array.isArray(check.highlights) && check.highlights.length > 0
                ? check.highlights[0]
                : ((Array.isArray(check.failed_candidates) && check.failed_candidates.length > 0
                    ? check.failed_candidates[0]
                    : ((Array.isArray(check.candidate_highlights) && check.candidate_highlights.length > 0)
                        ? check.candidate_highlights[0]
                        : null))));
            const policyNodeRef = resolveNodeRef(policyHighlight || {});
            const policyMessage = resolveInlineIssueMessage({
                checkId,
                checkData: check,
                preferredMessage: policyHighlight?.message,
                fallbackMessage: check.explanation || `${String(checkId || '')} requires manual review`
            });
            unhighlightableIssues.push(buildUnhighlightableIssue({
                checkId,
                check,
                instanceIndex: 0,
                verdict,
                message: policyMessage,
                snippet: policyHighlight?.snippet || policyHighlight?.text || '',
                failureReason: highlightIntentPolicy.reason || 'non_inline_policy',
                nodeRef: policyNodeRef,
                signature: policyHighlight?.signature || '',
                sourcePack: policyHighlight?.explanation_pack || check.ai_explanation_pack || null
            }));
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
                const candidateScope = normalizeScope(candidate.scope || 'block');
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
                    snippetValue: snippet,
                    boundary: null,
                    anchorStatus: candidateRange.anchor_status,
                    anchorStrategy: candidateRange.anchor_strategy
                });
                if (!candidatePrecision.allowed) {
                    unhighlightableIssues.push(buildUnhighlightableIssue({
                        checkId,
                        check,
                        instanceIndex,
                        verdict,
                        message,
                        snippet,
                        failureReason: candidatePrecision.reason,
                        nodeRef,
                        signature: candidate.signature || '',
                        sourcePack: candidate.explanation_pack || check.ai_explanation_pack || null
                    }));
                    hasRenderedInstance = true;
                    return;
                }
                const inlineResolution = resolveRecommendationRewriteContext(checkId, check, instanceIndex);
                const inlineRewriteTarget = inlineResolution && inlineResolution.rewrite_target
                    ? inlineResolution.rewrite_target
                    : null;
                const inlineRepairIntent = inlineResolution && inlineResolution.repair_intent
                    ? inlineResolution.repair_intent
                    : null;
                const inlineExplanationPack = buildIssueExplanationPack({
                    checkId,
                    checkData: check,
                    message,
                    actionSuggestion: inlineRepairIntent?.instruction || check?.explanation || '',
                    snippet,
                    failureReason,
                    rewriteTarget: inlineRewriteTarget || null,
                    sourcePack: candidate.explanation_pack || check.ai_explanation_pack || null,
                    runId,
                    instanceIndex
                });
                const issueKey = `${String(checkId || '')}:${instanceIndex}`;
                const blockOnlyItem = {
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
                    analysis_ref: {
                        run_id: runId || '',
                        check_id: String(checkId || ''),
                        instance_index: instanceIndex
                    },
                    explanation_pack: inlineExplanationPack,
                    issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack),
                    start: candidatePrecision.start,
                    end: candidatePrecision.end,
                    range_key: `${issueKey}:0`
                };
                if (inlineRewriteTarget) {
                    blockOnlyItem.rewrite_target = inlineRewriteTarget;
                    recommendationTelemetry.fix_with_ai_eligible_targets += 1;
                }
                if (inlineRepairIntent) {
                    blockOnlyItem.repair_intent = inlineRepairIntent;
                }
                if (inlineExplanationPack && typeof inlineExplanationPack === 'object') {
                    recommendationTelemetry.explanation_pack_attached += 1;
                }
                if (!highlightsByNodeRef.has(nodeRef)) highlightsByNodeRef.set(nodeRef, []);
                highlightsByNodeRef.get(nodeRef).push(blockOnlyItem);
                const blockOnlyFinding = {
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
                    text_quote_selector: candidate.text_quote_selector || candidate.quote || null,
                    snippet: snippet ? String(snippet).slice(0, 800) : '',
                    type: candidate.type,
                    anchor_status: candidateRange.anchor_status,
                    anchor_strategy: candidateRange.anchor_strategy,
                    failure_reason: failureReason ? String(failureReason) : '',
                    analysis_ref: {
                        run_id: runId || '',
                        check_id: String(checkId || ''),
                        instance_index: instanceIndex
                    },
                    explanation_pack: inlineExplanationPack,
                    issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack)
                };
                if (inlineRewriteTarget) {
                    blockOnlyFinding.rewrite_target = inlineRewriteTarget;
                }
                if (inlineRepairIntent) {
                    blockOnlyFinding.repair_intent = inlineRepairIntent;
                }
                v2Findings.push(blockOnlyFinding);
                hasRenderedInstance = true;
                return;
            }
            unhighlightableIssues.push(buildUnhighlightableIssue({
                checkId,
                check,
                instanceIndex,
                verdict,
                message,
                snippet,
                failureReason,
                nodeRef: candidate.node_ref || '',
                signature: candidate.signature || '',
                sourcePack: candidate.explanation_pack || check.ai_explanation_pack || null
            }));
            hasRenderedInstance = true;
        });
        const highlights = Array.isArray(check.highlights) ? check.highlights : [];
        highlights.forEach((h, idx) => {
            if (!h) return;
            const signature = typeof h.signature === 'string' ? h.signature : '';
            const nodeRef = resolveNodeRef(h);
            const highlightMessage = resolveInlineIssueMessage({
                checkId,
                checkData: check,
                preferredMessage: h.message,
                fallbackMessage: check.explanation || ''
            });
            if (!nodeRef) {
                unhighlightableIssues.push(buildUnhighlightableIssue({
                    checkId,
                    check,
                    instanceIndex: idx,
                    verdict,
                    message: highlightMessage,
                    snippet: h.snippet || h.text || '',
                    failureReason: 'missing_anchor',
                    nodeRef: '',
                    signature: signature || '',
                    sourcePack: h.explanation_pack || check.ai_explanation_pack || null
                }));
                hasRenderedInstance = true;
                return;
            }

            const blockText = nodeRefToText.get(nodeRef) || '';
            if (!blockText) {
                unhighlightableIssues.push(buildUnhighlightableIssue({
                    checkId,
                    check,
                    instanceIndex: idx,
                    verdict,
                    message: highlightMessage,
                    snippet: h.snippet || h.text || '',
                    failureReason: 'missing_block_text',
                    nodeRef,
                    signature: signature || '',
                    sourcePack: h.explanation_pack || check.ai_explanation_pack || null
                }));
                hasRenderedInstance = true;
                return;
            }

            const scope = normalizeScope(h.scope);
            const message = resolveInlineIssueMessage({
                checkId,
                checkData: check,
                preferredMessage: h.message,
                fallbackMessage: check.explanation || ''
            }).toString().slice(0, 300);
            const snippetValue = h.snippet || h.text || '';
            const boundaryFallback = buildBoundaryFromText(snippetValue, scope);
            const boundary = mergeBoundary(h.boundary, boundaryFallback);
            const textQuoteSelector = h.text_quote_selector || h.quote || null;
            const resolvedRange = resolveDeterministicRange(blockText, h, scope, boundary, snippetValue);
            if (!resolvedRange) {
                unhighlightableIssues.push(buildUnhighlightableIssue({
                    checkId,
                    check,
                    instanceIndex: idx,
                    verdict,
                    message,
                    snippet: snippetValue || '',
                    failureReason: 'resolver_failed',
                    nodeRef,
                    signature: signature || '',
                    sourcePack: h.explanation_pack || check.ai_explanation_pack || null
                }));
                hasRenderedInstance = true;
                return;
            }
            const resolvedPrecision = evaluateInlinePrecision({
                checkId,
                provenance: check.provenance || '',
                scope,
                resolvedRange,
                blockText,
                snippetValue,
                boundary,
                anchorStatus: resolvedRange.anchor_status,
                anchorStrategy: resolvedRange.anchor_strategy
            });
            const inlineResolution = resolveRecommendationRewriteContext(checkId, check, idx);
            const inlineRewriteTarget = inlineResolution && inlineResolution.rewrite_target
                ? inlineResolution.rewrite_target
                : null;
            const inlineRepairIntent = inlineResolution && inlineResolution.repair_intent
                ? inlineResolution.repair_intent
                : null;
            const inlineExplanationPack = buildIssueExplanationPack({
                checkId,
                checkData: check,
                message,
                actionSuggestion: inlineRepairIntent?.instruction || check?.explanation || '',
                snippet: snippetValue || '',
                failureReason: '',
                rewriteTarget: inlineRewriteTarget || null,
                sourcePack: h.explanation_pack || check.ai_explanation_pack || null,
                runId,
                instanceIndex: idx
            });
            if (!resolvedPrecision.allowed) {
                unhighlightableIssues.push(buildUnhighlightableIssue({
                    checkId,
                    check,
                    instanceIndex: idx,
                    verdict,
                    message,
                    snippet: snippetValue || '',
                    failureReason: resolvedPrecision.reason,
                    nodeRef,
                    signature: signature || '',
                    sourcePack: h.explanation_pack || check.ai_explanation_pack || null
                }));
                hasRenderedInstance = true;
                return;
            }
            const inlineFinding = {
                run_id: runId || '',
                check_id: String(checkId || ''),
                instance_index: idx,
                issue_key: `${String(checkId || '')}:${idx}`,
                verdict: String(verdict),
                message,
                node_ref: nodeRef,
                signature: signature || '',
                scope,
                boundary,
                text_quote_selector: textQuoteSelector,
                snippet: snippetValue ? String(snippetValue).slice(0, 800) : '',
                type: h.type,
                anchor_status: resolvedRange.anchor_status,
                anchor_strategy: resolvedRange.anchor_strategy,
                analysis_ref: {
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    instance_index: idx
                },
                explanation_pack: inlineExplanationPack,
                issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack)
            };
            if (inlineRewriteTarget) {
                inlineFinding.rewrite_target = inlineRewriteTarget;
                recommendationTelemetry.fix_with_ai_eligible_targets += 1;
            }
            if (inlineRepairIntent) {
                inlineFinding.repair_intent = inlineRepairIntent;
            }
            if (inlineExplanationPack && typeof inlineExplanationPack === 'object') {
                recommendationTelemetry.explanation_pack_attached += 1;
            }
            v2Findings.push(inlineFinding);
            const baseItem = {
                run_id: runId || '',
                check_id: String(checkId || ''),
                instance_index: idx,
                issue_key: `${String(checkId || '')}:${idx}`,
                verdict: String(verdict),
                message,
                node_ref: nodeRef,
                signature: signature || '',
                provenance: check.provenance || '',
                anchor_status: resolvedRange.anchor_status,
                anchor_strategy: resolvedRange.anchor_strategy,
                analysis_ref: {
                    run_id: runId || '',
                    check_id: String(checkId || ''),
                    instance_index: idx
                },
                explanation_pack: inlineExplanationPack,
                issue_explanation: composeIssueExplanationNarrative(inlineExplanationPack)
            };
            if (inlineRewriteTarget) {
                baseItem.rewrite_target = inlineRewriteTarget;
            }
            if (inlineRepairIntent) {
                baseItem.repair_intent = inlineRepairIntent;
            }
            if (!highlightsByNodeRef.has(nodeRef)) highlightsByNodeRef.set(nodeRef, []);
            highlightsByNodeRef.get(nodeRef).push({
                ...baseItem,
                start: resolvedPrecision.start,
                end: resolvedPrecision.end,
                range_key: `${baseItem.issue_key}:0`
            });
            hasRenderedInstance = true;
        });

        if (!hasRenderedInstance) {
            unhighlightableIssues.push(buildUnhighlightableIssue({
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
    const dedupedUnhighlightableIssues = dedupeUnhighlightableIssues(unhighlightableIssues);
    if (stabilityReleaseMode) {
        recommendationTelemetry.fix_with_ai_suppressed_by_stability_mode =
            recommendationTelemetry.fix_with_ai_eligible_targets;
    }

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

        return `<div class="aivi-overlay-block" data-node-ref="${escapeAttr(nodeRef)}"><div class="aivi-overlay-block-body">${bodyHtml}</div><div class="aivi-overlay-inline-panel" style="${panelStyle}"></div></div>`;
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
        event: 'recommendation_target_resolution',
        run_id: runId || '',
        stability_release_mode: stabilityReleaseMode,
        recommendations_total: recommendationTelemetry.total,
        actionable_total: recommendationTelemetry.actionable,
        explanation_pack_attached: recommendationTelemetry.explanation_pack_attached,
        fix_with_ai_eligible_targets: recommendationTelemetry.fix_with_ai_eligible_targets,
        fix_with_ai_suppressed_by_stability_mode: recommendationTelemetry.fix_with_ai_suppressed_by_stability_mode,
        schema_assist_emitted_total: schemaAssistTelemetry.emitted_total,
        schema_assist_insertable_total: schemaAssistTelemetry.insertable_total,
        schema_assist_by_check: schemaAssistTelemetry.by_check,
        actionable_rate: recommendationTelemetry.total
            ? Number((recommendationTelemetry.actionable / recommendationTelemetry.total).toFixed(4))
            : 0,
        by_mode: recommendationTelemetry.by_mode,
        by_failure_reason: recommendationTelemetry.by_failure_reason,
        timestamp: new Date().toISOString()
    }));

    return {
        schema_version: '2.0.0',
        generated_at: generatedAt,
        run_id: runId,
        highlighted_html: blocksHtml,
        content_hash: contentHash,
        highlight_count: highlightCount,
        release_flags: {
            stability_release_mode: stabilityReleaseMode
        },
        telemetry: {
            explanation_pack_attached: recommendationTelemetry.explanation_pack_attached,
            fix_with_ai_eligible_targets: recommendationTelemetry.fix_with_ai_eligible_targets,
            fix_with_ai_suppressed_by_stability_mode: recommendationTelemetry.fix_with_ai_suppressed_by_stability_mode,
            schema_assist_emitted_total: schemaAssistTelemetry.emitted_total,
            schema_assist_insertable_total: schemaAssistTelemetry.insertable_total,
            schema_assist_by_check: schemaAssistTelemetry.by_check
        },
        recommendations: dedupedUnhighlightableIssues,
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
