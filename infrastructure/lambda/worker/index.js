const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const OpenAI = require("openai");
const Ajv = require("ajv");
const { buildHighlightedHtml } = require('./analysis-serializer');
const { performDeterministicChecks, ensureManifestPreflightStructure } = require('./preflight-handler');
const isPackagedLambdaRuntime = Boolean(process.env.AWS_EXECUTION_ENV);
const requireSharedRuntime = (modulePath) => {
    const candidates = isPackagedLambdaRuntime
        ? [`./shared/${modulePath}`, `../shared/${modulePath}`]
        : [`../shared/${modulePath}`, `./shared/${modulePath}`];
    let lastError = null;
    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (error) {
            if (error && error.code !== 'MODULE_NOT_FOUND') {
                throw error;
            }
            lastError = error;
        }
    }
    throw lastError || new Error(`Unable to load shared runtime module: ${modulePath}`);
};
const { SCORE_CONTRACT_DEFAULTS } = requireSharedRuntime('score-contract');
const { scoreChecksAgainstConfig } = requireSharedRuntime('scoring-policy');
const { buildUsageSettlementPreview } = requireSharedRuntime('credit-pricing');
const { createSettlementEvent, createRefundEvent, persistLedgerEvent } = requireSharedRuntime('credit-ledger');
const { createAccountBillingStateStore, applyLedgerEventToState } = requireSharedRuntime('billing-account-state');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const secretsClient = new SecretsManagerClient({});

// AJV validator
const ajv = new Ajv({ allErrors: true, strict: false });

// Environment variables
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;

const parseBooleanFlag = (value) => {
    return value === true || value === 'true' || value === 1 || value === '1';
};

const normalizeNonNegativeInt = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
};

const normalizeNullableInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
};

const readJsonFile = (filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(String(raw).replace(/^\uFEFF/, ''));
};

const getEffectiveFeatureFlags = (job = {}) => {
    const raw = job && typeof job.feature_flags === 'object' ? job.feature_flags : {};
    const resolveFlag = (key, envKey) => {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            return parseBooleanFlag(raw[key]);
        }
        return parseBooleanFlag(getEnv(envKey, 'false'));
    };
    return {
        anchor_v2_enabled: resolveFlag('anchor_v2_enabled', 'ANCHOR_V2_ENABLED'),
        defer_details_enabled: resolveFlag('defer_details_enabled', 'DEFER_DETAILS_ENABLED'),
        partial_results_enabled: resolveFlag('partial_results_enabled', 'PARTIAL_RESULTS_ENABLED'),
        compact_prompt_enabled: resolveFlag('compact_prompt_enabled', 'COMPACT_PROMPT_ENABLED')
    };
};

const isIntroFocusFactualityEnabled = () => parseBooleanFlag(getEnv('INTRO_FOCUS_FACTUALITY_ENABLED', 'true'));

/**
 * Build deferred details artifact payload (Phase 2)
 * Stores verbose per-check evidence separately from sidebar summary payloads.
 */
const buildDeferredDetailsPayload = (analysisResult, runId) => {
    const checks = analysisResult && analysisResult.checks && typeof analysisResult.checks === 'object'
        ? analysisResult.checks
        : {};

    const deepClone = (value) => {
        if (value === undefined) return undefined;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    };

    const detailChecks = {};
    Object.entries(checks).forEach(([checkId, check]) => {
        if (!check || typeof check !== 'object') return;
        detailChecks[checkId] = {
            check_id: checkId,
            verdict: check.verdict || null,
            ui_verdict: check.ui_verdict || mapVerdictToUiVerdict(check.verdict),
            confidence: typeof check.confidence === 'number' ? check.confidence : null,
            explanation: typeof check.explanation === 'string' ? check.explanation : '',
            ai_explanation_pack: check.ai_explanation_pack && typeof check.ai_explanation_pack === 'object'
                ? deepClone(check.ai_explanation_pack)
                : null,
            highlights: Array.isArray(check.highlights) ? deepClone(check.highlights) : [],
            candidate_highlights: Array.isArray(check.candidate_highlights) ? deepClone(check.candidate_highlights) : [],
            failed_candidates: Array.isArray(check.failed_candidates) ? deepClone(check.failed_candidates) : [],
            suggestions: Array.isArray(check.suggestions) ? deepClone(check.suggestions) : [],
            details: check.details && typeof check.details === 'object' ? deepClone(check.details) : null
        };
    });

    return {
        version: '1.0.0',
        run_id: runId,
        created_at: new Date().toISOString(),
        checks: detailChecks
    };
};

// Anthropic client (lazy initialized)


// Cache for definitions and prompt
let cachedDefinitions = null;
let cachedPromptTemplate = null;
let cachedRuntimeContract = null;
let cachedScoringConfig;

const REQUIRED_PROMPT_TOKENS = ['{{CHECKS_DEFINITIONS}}', '{{AI_CHECK_COUNT}}', '{{QUESTION_ANCHORS_JSON}}'];
const INTRO_DETERMINISTIC_CHECK_IDS = new Set([
    'intro_wordcount',
    'intro_readability',
    'intro_schema_suggestion'
]);

/**
 * AEO/GEO Mapping (Per User Specification)
 * Maps check_id -> { category: 'AEO'|'GEO', subcategory: string }
 */
/**
 * Map verdict to ui_verdict for Result Contract Lock
 * Valid ui_verdict values: pass | partial | fail
 */
const CANONICAL_VERDICTS = ['pass', 'partial', 'fail'];
const AI_CHECK_TYPE_FALLBACK = new Set(['semantic']);
const MAX_STRUCTURED_GUIDANCE_TEXT = 320;
const MAX_STRUCTURED_GUIDANCE_STEPS = 4;
const MAX_STRUCTURED_GUIDANCE_STEP_LENGTH = 220;
const MISTRAL_FINDINGS_SCHEMA_NAME = 'aivi_chunk_findings_v1';
const MISTRAL_FINDINGS_RESPONSE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['findings'],
    properties: {
        findings: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['check_id', 'verdict', 'confidence', 'scope', 'text_quote_selector', 'explanation'],
                properties: {
                    check_id: { type: 'string', minLength: 1 },
                    verdict: { type: 'string', enum: CANONICAL_VERDICTS },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    scope: { type: 'string', enum: ['sentence', 'span', 'block'] },
                    text_quote_selector: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['exact', 'prefix', 'suffix'],
                        properties: {
                            exact: { type: 'string', minLength: 1 },
                            prefix: { type: 'string' },
                            suffix: { type: 'string' }
                        }
                    },
                    question_anchor_text: { type: 'string', minLength: 1 },
                    explanation: { type: 'string', maxLength: 180 }
                }
            }
        }
    }
};

const normalizeVerdict = (verdict, fallback = 'fail') => {
    if (typeof verdict !== 'string') return fallback;
    const normalized = verdict.toLowerCase().trim();
    const map = {
        'pass': 'pass',
        'passed': 'pass',
        'ok': 'pass',
        'partial': 'partial',
        'fail': 'fail',
        'failed': 'fail',
        'issue': 'fail',
        'warning': 'fail'
    };
    return map[normalized] || fallback;
};

const mapVerdictToUiVerdict = (verdict) => {
    return normalizeVerdict(verdict, 'fail');
};

const sanitizeStructuredGuidanceText = (value, maxLength = MAX_STRUCTURED_GUIDANCE_TEXT) => {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const sanitizeStructuredGuidanceSteps = (value) => {
    const rawSteps = Array.isArray(value)
        ? value
        : (typeof value === 'string' && value.trim() ? [value] : []);
    return rawSteps
        .map((step) => sanitizeStructuredGuidanceText(step, MAX_STRUCTURED_GUIDANCE_STEP_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_STRUCTURED_GUIDANCE_STEPS);
};

const extractStructuredExplanationPackFromFinding = (finding) => {
    if (!finding || typeof finding !== 'object') return null;
    const nested = finding.explanation_pack && typeof finding.explanation_pack === 'object'
        ? finding.explanation_pack
        : {};
    const firstString = (values, maxLength = MAX_STRUCTURED_GUIDANCE_TEXT) => {
        for (const value of values) {
            const normalized = sanitizeStructuredGuidanceText(value, maxLength);
            if (normalized) return normalized;
        }
        return '';
    };
    const whyItMatters = firstString([
        finding.why_it_matters,
        nested.why_it_matters
    ]);
    const howToFixSteps = sanitizeStructuredGuidanceSteps(
        Array.isArray(finding.how_to_fix_steps) || typeof finding.how_to_fix_steps === 'string'
            ? finding.how_to_fix_steps
            : nested.how_to_fix_steps
    );
    const examplePattern = firstString([
        finding.example_pattern,
        nested.example_pattern
    ], 220);
    if (!whyItMatters && howToFixSteps.length === 0 && !examplePattern) {
        return null;
    }
    return {
        ...(whyItMatters ? { why_it_matters: whyItMatters } : {}),
        ...(howToFixSteps.length > 0 ? { how_to_fix_steps: howToFixSteps } : {}),
        ...(examplePattern ? { example_pattern: examplePattern } : {})
    };
};

const normalizeCheckType = (type) => {
    if (typeof type !== 'string') return 'semantic';
    return type.toLowerCase().trim();
};

const getRuntimeContractEntry = (checkId, runtimeContract = cachedRuntimeContract) => {
    if (!runtimeContract || typeof runtimeContract !== 'object') {
        return null;
    }
    const checks = runtimeContract.checks;
    if (!checks || typeof checks !== 'object') {
        return null;
    }
    const key = typeof checkId === 'string' ? checkId.trim() : '';
    if (!key || !Object.prototype.hasOwnProperty.call(checks, key)) {
        return null;
    }
    const entry = checks[key];
    return entry && typeof entry === 'object' ? entry : null;
};

const getAnalysisEngineForCheck = (checkId, checkDef, runtimeContract = cachedRuntimeContract) => {
    const contractEntry = getRuntimeContractEntry(checkId, runtimeContract);
    if (contractEntry && typeof contractEntry.analysis_engine === 'string') {
        return contractEntry.analysis_engine.toLowerCase().trim();
    }
    const fallbackType = checkDef && typeof checkDef.type === 'string'
        ? normalizeCheckType(checkDef.type)
        : '';
    return AI_CHECK_TYPE_FALLBACK.has(fallbackType) ? 'ai' : 'deterministic';
};

const isAiEvaluatedCheck = (checkId, checkDef, runtimeContract = cachedRuntimeContract) => {
    return getAnalysisEngineForCheck(checkId, checkDef, runtimeContract) === 'ai';
};

const getAiEligibleCheckIds = (definitions, runtimeContract = cachedRuntimeContract) => {
    const ids = new Set();
    if (!definitions || typeof definitions !== 'object' || !definitions.categories) {
        return ids;
    }
    Object.values(definitions.categories).forEach((category) => {
        if (!category || !category.checks) return;
        Object.entries(category.checks).forEach(([checkId, checkDef]) => {
            if (isAiEvaluatedCheck(checkId, checkDef, runtimeContract)) {
                ids.add(checkId);
            }
        });
    });
    return ids;
};

/**
 * Enrich analysis result with ui_verdict for each check
 */
const enrichWithUiVerdict = (result) => {
    if (!result || !result.checks) return result;
    Object.entries(result.checks).forEach(([checkId, checkData]) => {
        checkData.ui_verdict = mapVerdictToUiVerdict(checkData.verdict);
    });
    return result;
};

const normalizeHighlightsWithManifest = (result, manifest) => {
    if (!result || !manifest || !Array.isArray(manifest.block_map)) {
        return result;
    }

    const normalizeText = (value) => {
        if (typeof value !== 'string') return '';
        return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();
    };
    const normalizeScope = (value) => {
        if (value === 'sentence' || value === 'span' || value === 'block') return value;
        return 'span';
    };

    const hasEllipsis = (value) => {
        if (typeof value !== 'string') return false;
        return /(\.\s*\.\s*\.)|…/.test(value);
    };

    const matchWithEllipsis = (blockText, snippet, preferredIndex) => {
        if (!snippet || !blockText) return null;

        // 1. First try exact match (handles true ellipsis in content)
        const exactIdx = findBestMatch(blockText, snippet, preferredIndex);
        if (exactIdx !== null) {
            return { start: exactIdx, end: exactIdx + snippet.length, type: 'exact' };
        }

        // 2. Split on ellipsis patterns and match segments
        const segments = snippet.split(/\s*(?:\.{2,}|…)\s*/).filter(s => s.trim().length >= 5);

        if (segments.length === 0) {
            return null;
        }

        // Single segment fallback (e.g. "Start of text..." or "...end of text")
        if (segments.length === 1) {
            const segment = segments[0].trim();
            // Require longer match for single segment to avoid false positives
            if (segment.length < 10) return null;

            const idx = findBestMatch(blockText, segment, preferredIndex);
            if (idx !== null) {
                return {
                    start: idx,
                    end: idx + segment.length,
                    type: 'segment_match_single',
                    segments_matched: 1
                };
            }
            return null;
        }

        // 3. Find first and last segment positions
        const firstSegment = segments[0].trim();
        const lastSegment = segments[segments.length - 1].trim();
        const firstIdx = findBestMatch(blockText, firstSegment, preferredIndex);

        if (firstIdx === null) {
            return null;
        }

        // Search for last segment after the first segment
        const searchStartPos = firstIdx + firstSegment.length;
        const lastIdx = findBestMatch(blockText.slice(searchStartPos), lastSegment, 0);

        if (lastIdx === null) {
            return null;
        }

        const absoluteLastIdx = searchStartPos + lastIdx;

        // 4. Return span from start of first to end of last
        return {
            start: firstIdx,
            end: absoluteLastIdx + lastSegment.length,
            type: 'segment_match',
            segments_matched: segments.length
        };
    };

    const findBestMatch = (text, needle, preferredIndex) => {
        if (!needle) return null;
        let idx = text.indexOf(needle);
        if (idx === -1) return null;
        if (Number.isFinite(preferredIndex)) {
            const clampedPreferred = Math.max(0, Math.min(preferredIndex, text.length - needle.length));
            if (text.slice(clampedPreferred, clampedPreferred + needle.length) === needle) {
                return clampedPreferred;
            }
        }
        let bestIndex = null;
        let bestDistance = null;
        while (idx !== -1) {
            if (bestIndex === null) {
                bestIndex = idx;
                bestDistance = Number.isFinite(preferredIndex) ? Math.abs(idx - preferredIndex) : 0;
            } else if (Number.isFinite(preferredIndex)) {
                const distance = Math.abs(idx - preferredIndex);
                if (distance < bestDistance) {
                    bestIndex = idx;
                    bestDistance = distance;
                }
            }
            idx = text.indexOf(needle, idx + 1);
        }
        return bestIndex;
    };

    const getQuoteSelector = (highlight) => {
        if (!highlight || typeof highlight !== 'object') return null;
        const direct = {
            exact: typeof highlight.exact === 'string' ? highlight.exact : null,
            prefix: typeof highlight.prefix === 'string' ? highlight.prefix : null,
            suffix: typeof highlight.suffix === 'string' ? highlight.suffix : null
        };
        if (direct.exact || direct.prefix || direct.suffix) return direct;
        const selector = highlight.text_quote_selector || highlight.text_quote || highlight.quote || highlight.selector || highlight.textQuoteSelector;
        if (selector && typeof selector === 'object') {
            return {
                exact: typeof selector.exact === 'string' ? selector.exact : null,
                prefix: typeof selector.prefix === 'string' ? selector.prefix : null,
                suffix: typeof selector.suffix === 'string' ? selector.suffix : null
            };
        }
        return null;
    };

    const matchWithQuote = (blockText, exact, prefix, suffix, preferredIndex) => {
        if (!blockText || !exact) return null;
        let idx = blockText.indexOf(exact);
        if (idx === -1) return null;
        const matches = [];
        while (idx !== -1) {
            let ok = true;
            if (prefix) {
                const prefixStart = Math.max(0, idx - prefix.length);
                const prefixSlice = blockText.slice(prefixStart, idx);
                if (!prefixSlice.endsWith(prefix)) {
                    ok = false;
                }
            }
            if (ok && suffix) {
                const suffixEnd = Math.min(blockText.length, idx + exact.length + suffix.length);
                const suffixSlice = blockText.slice(idx + exact.length, suffixEnd);
                if (!suffixSlice.startsWith(suffix)) {
                    ok = false;
                }
            }
            if (ok) {
                matches.push(idx);
            }
            idx = blockText.indexOf(exact, idx + 1);
        }
        if (!matches.length) return null;
        let chosen = matches[0];
        if (Number.isFinite(preferredIndex)) {
            let bestDistance = Math.abs(matches[0] - preferredIndex);
            for (let i = 1; i < matches.length; i += 1) {
                const distance = Math.abs(matches[i] - preferredIndex);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    chosen = matches[i];
                }
            }
        }
        return { start: chosen, end: chosen + exact.length };
    };

    const resolveSentenceOffsets = (normalizedBlockText, highlight, preferredIndex) => {
        if (!normalizedBlockText) return null;
        if (normalizeScope(highlight?.scope) !== 'sentence') return null;

        const quoteSelector = getQuoteSelector(highlight);
        const candidates = [
            normalizeText(highlight?.text),
            normalizeText(highlight?.snippet),
            normalizeText(quoteSelector?.exact)
        ].filter(Boolean);
        if (!candidates.length) return null;

        const sentenceRanges = [];
        const sentenceRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
        let match;
        while ((match = sentenceRegex.exec(normalizedBlockText)) !== null) {
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
        if (!sentenceRanges.length) {
            return null;
        }

        const hits = [];
        sentenceRanges.forEach((range) => {
            const sentence = normalizedBlockText.slice(range.start, range.end).toLowerCase();
            const hasNeedle = candidates.some((candidate) => sentence.includes(candidate.toLowerCase()));
            if (!hasNeedle) return;
            const distance = Number.isFinite(preferredIndex)
                ? Math.abs(range.start - preferredIndex)
                : hits.length;
            hits.push({ ...range, distance });
        });
        if (!hits.length) return null;
        hits.sort((a, b) => a.distance - b.distance || a.start - b.start);
        return { start: hits[0].start, end: hits[0].end, strategy: 'sentence_range' };
    };

    const resolveBoundaryOffsets = (normalizedBlockText, highlight) => {
        if (!normalizedBlockText) return null;
        const boundary = (highlight && typeof highlight.boundary === 'object' && highlight.boundary)
            ? highlight.boundary
            : null;
        let firstWords = normalizeText(boundary?.first_words || '');
        let lastWords = normalizeText(boundary?.last_words || '');
        if (!firstWords || !lastWords) {
            const snippet = normalizeText(highlight?.snippet || highlight?.text || '');
            if (snippet) {
                const words = snippet.split(/\s+/).filter(Boolean);
                if (words.length >= 6) {
                    if (!firstWords) {
                        firstWords = words.slice(0, 3).join(' ');
                    }
                    if (!lastWords) {
                        lastWords = words.slice(-3).join(' ');
                    }
                }
            }
        }
        if (!firstWords || !lastWords) return null;

        const lower = normalizedBlockText.toLowerCase();
        const firstNeedle = firstWords.toLowerCase();
        const lastNeedle = lastWords.toLowerCase();
        const firstIdx = lower.indexOf(firstNeedle);
        if (firstIdx === -1) return null;
        const lastIdx = lower.indexOf(lastNeedle, firstIdx + firstNeedle.length);
        if (lastIdx === -1) return null;
        const start = firstIdx;
        const end = lastIdx + lastNeedle.length;
        if (!(end > start)) return null;
        return { start, end, strategy: 'first_last_words' };
    };

    const resolveOffsets = (blockText, highlight) => {
        const normalizedBlockText = normalizeText(blockText);
        if (!normalizedBlockText) return null;
        const preferredIndex = Number.isFinite(highlight?.start) ? highlight.start : null;
        const highlightText = normalizeText(highlight?.text);
        if (highlightText) {
            const idx = findBestMatch(normalizedBlockText, highlightText, preferredIndex);
            if (idx !== null) {
                return { start: idx, end: idx + highlightText.length, strategy: 'exact_text' };
            }
        }
        const snippetText = normalizeText(highlight?.snippet);
        if (snippetText) {
            const idx = findBestMatch(normalizedBlockText, snippetText, preferredIndex);
            if (idx !== null) {
                return { start: idx, end: idx + snippetText.length, strategy: 'exact_snippet' };
            }
        }
        const quoteSelector = getQuoteSelector(highlight);
        if (quoteSelector) {
            const exact = normalizeText(quoteSelector.exact);
            const prefix = normalizeText(quoteSelector.prefix);
            const suffix = normalizeText(quoteSelector.suffix);
            if (exact) {
                const quoteMatch = matchWithQuote(normalizedBlockText, exact, prefix || null, suffix || null, preferredIndex);
                if (quoteMatch) {
                    return { ...quoteMatch, strategy: 'quote_selector' };
                }
            }
        }
        if (Number.isFinite(highlight?.start) && Number.isFinite(highlight?.end)) {
            const start = highlight.start;
            const end = highlight.end;
            if (start >= 0 && end > start && end <= normalizedBlockText.length) {
                const slice = normalizedBlockText.slice(start, end);
                if (highlightText && slice === highlightText) {
                    return { start, end, strategy: 'provided_offsets' };
                }
                if (snippetText && slice === snippetText) {
                    return { start, end, strategy: 'provided_offsets' };
                }
            }
        }
        // ELLIPSIS FIX: Try segment matching for ellipsis snippets as last resort
        const textToMatch = highlightText || snippetText;
        if (textToMatch && hasEllipsis(textToMatch)) {
            const ellipsisMatch = matchWithEllipsis(normalizedBlockText, textToMatch, preferredIndex);
            if (ellipsisMatch) {
                return { start: ellipsisMatch.start, end: ellipsisMatch.end, strategy: 'ellipsis_segments' };
            }
        }
        return null;
    };

    const signatureMap = new Map();
    const nodeRefMap = new Map();
    for (const block of manifest.block_map) {
        if (!block) {
            continue;
        }
        if (block.signature) {
            signatureMap.set(block.signature, block);
        }
        if (block.node_ref) {
            nodeRefMap.set(block.node_ref, block);
        }
    }

    const recoverHighlightsWithoutAnchor = (highlight) => {
        const quoteSelector = getQuoteSelector(highlight);
        const exact = normalizeText(quoteSelector?.exact || highlight?.snippet || highlight?.text || '');
        const prefix = normalizeText(quoteSelector?.prefix || '');
        const suffix = normalizeText(quoteSelector?.suffix || '');
        if (!exact) {
            return [];
        }
        return findAnchorsFromSelector(manifest.block_map, exact, prefix, suffix);
    };

    const normalizeHighlight = (highlight) => {
        if (!highlight) {
            return { status: 'failed', failure_reason: 'missing_candidate', candidate: highlight };
        }
        const signature = typeof highlight.signature === 'string' ? highlight.signature : null;
        const nodeRef = typeof highlight.node_ref === 'string' ? highlight.node_ref : null;
        const rawSnippet = typeof highlight.snippet === 'string'
            ? highlight.snippet
            : (typeof highlight.text === 'string' ? highlight.text : '');
        const scope = typeof highlight.scope === 'string' ? highlight.scope : '';
        // ELLIPSIS FIX: Don't reject ellipsis snippets outright - try to match them
        // The matchWithEllipsis function will handle segment matching if exact match fails
        let block = null;
        if (signature) {
            block = signatureMap.get(signature) || null;
            if (!block) {
                return { status: 'failed', failure_reason: 'signature_mismatch', candidate: highlight };
            }
        } else if (nodeRef && nodeRefMap.has(nodeRef)) {
            block = nodeRefMap.get(nodeRef);
        } else if (!signature && !nodeRef) {
            const recoveredAnchors = recoverHighlightsWithoutAnchor(highlight);
            if (!Array.isArray(recoveredAnchors) || recoveredAnchors.length === 0) {
                return { status: 'failed', failure_reason: 'missing_anchor', candidate: highlight };
            }
            const recoveredNormalized = [];
            const recoveredFailures = [];
            recoveredAnchors.forEach((anchor) => {
                const recoveredSnippet = typeof anchor.snippet === 'string' ? anchor.snippet : (rawSnippet || '');
                const recoveredHighlight = {
                    ...highlight,
                    node_ref: anchor.node_ref || null,
                    signature: anchor.signature || null,
                    start: Number.isFinite(anchor.start) ? anchor.start : undefined,
                    end: Number.isFinite(anchor.end) ? anchor.end : undefined,
                    text: recoveredSnippet,
                    snippet: recoveredSnippet,
                    anchor_recovered: true,
                    anchor_recovery_strategy: anchor.strategy || 'selector_recovery'
                };
                const normalizedRecovered = normalizeHighlight(recoveredHighlight);
                if (normalizedRecovered.status === 'success') {
                    recoveredNormalized.push(normalizedRecovered.highlight);
                } else {
                    recoveredFailures.push(normalizedRecovered);
                }
            });
            if (recoveredNormalized.length > 1) {
                return {
                    status: 'success_multi',
                    highlights: recoveredNormalized
                };
            }
            if (recoveredNormalized.length === 1) {
                return { status: 'success', highlight: recoveredNormalized[0] };
            }
            const failureReason = recoveredFailures[0]?.failure_reason || 'missing_anchor';
            return { status: 'failed', failure_reason: failureReason, candidate: highlight };
        } else if (nodeRef && !nodeRefMap.has(nodeRef)) {
            return { status: 'failed', failure_reason: 'node_ref_mismatch', candidate: highlight };
        }
        if (!block) {
            return { status: 'failed', failure_reason: 'block_not_found', candidate: highlight };
        }
        const blockText = block.text || block.text_content || '';
        const baseHighlight = rawSnippet
            ? highlight
            : { ...highlight, snippet: blockText, text: blockText };
        if (!rawSnippet && !blockText) {
            return { status: 'failed', failure_reason: 'missing_snippet', candidate: highlight };
        }
        const normalizedBlockText = normalizeText(blockText);
        const preferredIndex = Number.isFinite(highlight?.start) ? highlight.start : null;
        let offsets = resolveOffsets(blockText, baseHighlight);
        let anchorStatus = 'anchored';
        if (!offsets) {
            offsets = resolveSentenceOffsets(normalizedBlockText, baseHighlight, preferredIndex);
        }
        if (!offsets) {
            offsets = resolveBoundaryOffsets(normalizedBlockText, baseHighlight);
        }
        if (!offsets && normalizedBlockText.length > 0) {
            offsets = { start: 0, end: normalizedBlockText.length, strategy: 'block_only' };
            anchorStatus = 'block_only';
        }
        if (!offsets) {
            return { status: 'failed', failure_reason: 'offset_resolution_failed', candidate: highlight };
        }
        if (offsets.strategy === 'block_only') {
            anchorStatus = 'block_only';
        }
        const exactSlice = normalizedBlockText.slice(offsets.start, offsets.end);
        const contextWindow = 40;
        const contextStart = Math.max(0, offsets.start - contextWindow);
        const contextEnd = Math.min(normalizedBlockText.length, offsets.end + contextWindow);
        const context = normalizedBlockText.slice(contextStart, contextEnd);
        const resolvedSnippet = exactSlice || rawSnippet || normalizedBlockText;
        const normalizedHighlight = {
            ...highlight,
            node_ref: block.node_ref || highlight.node_ref,
            signature: block.signature || signature || highlight.signature || null,
            start: offsets.start,
            end: offsets.end,
            text: resolvedSnippet,
            snippet: resolvedSnippet,
            scope: scope || undefined,
            context,
            anchor_status: anchorStatus,
            anchor_strategy: offsets.strategy || 'exact_text'
        };
        const recalculated = normalizedHighlight.start !== highlight.start ||
            normalizedHighlight.end !== highlight.end ||
            normalizedHighlight.node_ref !== highlight.node_ref ||
            normalizedHighlight.signature !== highlight.signature;
        return {
            status: 'success',
            highlight: {
                ...normalizedHighlight,
                server_recalculated: recalculated
            }
        };
    };

    const checks = result.checks || {};
    const normalizedChecks = {};
    const anchorStats = {
        candidates_total: 0,
        anchored_total: 0,
        precise_anchored_total: 0,
        block_only_total: 0,
        failed_total: 0,
        failure_reasons: {},
        checks_with_candidates: 0,
        checks_with_anchored: 0,
        checks_with_failed: 0,
        checks_abstained: 0,
        anchored_rate: 0,
        precise_anchored_rate: 0,
        block_only_rate: 0,
        failed_rate: 0,
        abstention_rate: 0
    };
    Object.entries(checks).forEach(([checkId, checkData]) => {
        if (!checkData) {
            normalizedChecks[checkId] = checkData;
            return;
        }
        const isDeterministic = checkData.provenance === 'deterministic';
        const sourceHighlights = Array.isArray(checkData.candidate_highlights)
            ? checkData.candidate_highlights
            : checkData.highlights;
        if (!Array.isArray(sourceHighlights)) {
            if (!isDeterministic) {
                // C2 FIX: Don't override verdict - just mark as non_inline
                const explanation = typeof checkData.explanation === 'string' ? checkData.explanation.trim() : '';
                normalizedChecks[checkId] = {
                    ...checkData,
                    highlights: [],
                    failed_candidates: [],
                    cannot_anchor: true,
                    non_inline: true,
                    non_inline_reason: 'missing_candidates',
                    explanation
                };
                return;
            }
            normalizedChecks[checkId] = checkData;
            return;
        }
        if (!isDeterministic && sourceHighlights.length === 0) {
            // C2 FIX: Don't override verdict - just mark as non_inline
            // Check may still have valid verdict even without highlights
            const explanation = typeof checkData.explanation === 'string' ? checkData.explanation.trim() : '';
            normalizedChecks[checkId] = {
                ...checkData,
                highlights: [],
                failed_candidates: [],
                cannot_anchor: true,
                non_inline: true,
                non_inline_reason: 'no_candidates',
                explanation
            };
            return;
        }
        if (sourceHighlights.length > 0) {
            anchorStats.checks_with_candidates += 1;
        }
        anchorStats.candidates_total += sourceHighlights.length;
        const anchoredHighlights = [];
        const failedCandidates = [];
        let anchoredCandidateCount = 0;
        let blockOnlyCandidateCount = 0;
        sourceHighlights.forEach((candidate) => {
            const normalized = normalizeHighlight(candidate);
            if (normalized.status === 'success') {
                anchoredHighlights.push(normalized.highlight);
                anchoredCandidateCount += 1;
                if (normalized.highlight.anchor_status === 'block_only') {
                    blockOnlyCandidateCount += 1;
                }
            } else if (normalized.status === 'success_multi' && Array.isArray(normalized.highlights) && normalized.highlights.length > 0) {
                anchoredHighlights.push(...normalized.highlights);
                anchoredCandidateCount += 1;
                const allBlockOnly = normalized.highlights.every((item) => item.anchor_status === 'block_only');
                if (allBlockOnly) {
                    blockOnlyCandidateCount += 1;
                }
            } else {
                const failureReason = normalized.failure_reason || 'anchor_not_verified';
                failedCandidates.push({
                    ...candidate,
                    failure_reason: failureReason
                });
                anchorStats.failure_reasons[failureReason] = (anchorStats.failure_reasons[failureReason] || 0) + 1;
            }
        });
        anchorStats.anchored_total += anchoredCandidateCount;
        anchorStats.block_only_total += blockOnlyCandidateCount;
        anchorStats.precise_anchored_total += Math.max(0, anchoredCandidateCount - blockOnlyCandidateCount);
        anchorStats.failed_total += failedCandidates.length;
        const normalizedCheck = {
            ...checkData,
            highlights: anchoredHighlights
        };
        const cannotAnchor = failedCandidates.length > 0 && anchoredHighlights.length === 0;
        if (anchoredHighlights.length > 0) {
            anchorStats.checks_with_anchored += 1;
        }
        if (failedCandidates.length > 0) {
            anchorStats.checks_with_failed += 1;
        }
        if (failedCandidates.length) {
            normalizedCheck.failed_candidates = failedCandidates;
            normalizedCheck.cannot_anchor = cannotAnchor;
            if (!isDeterministic && cannotAnchor) {
                const reasons = Array.from(new Set(failedCandidates.map(item => item.failure_reason).filter(Boolean)));
                normalizedCheck.non_inline = true;
                normalizedCheck.non_inline_reason = reasons.length ? reasons.join(',') : 'anchor_failed';
            }
        }
        if (cannotAnchor) {
            anchorStats.checks_abstained += 1;
            // C2 FIX: Do NOT override verdict when anchoring fails.
            // The check still has a valid verdict from AI - it just can't be highlighted.
            // Mark as non_inline so UI knows there's no overlay highlight, but keep the verdict.
            if (!isDeterministic) {
                normalizedCheck.non_inline = true;
                normalizedCheck.non_inline_reason = normalizedCheck.non_inline_reason || 'anchor_failed';
                const explanation = typeof checkData.explanation === 'string' ? checkData.explanation.trim() : '';
                if (explanation && !explanation.includes('could not be anchored')) {
                    normalizedCheck.explanation = `${explanation} (Highlight could not be anchored to specific text.)`;
                }
            }
        }
        if (Object.prototype.hasOwnProperty.call(checkData, 'candidate_highlights')) {
            delete normalizedCheck.candidate_highlights;
        }
        normalizedChecks[checkId] = normalizedCheck;
    });

    if (anchorStats.candidates_total > 0) {
        anchorStats.anchored_rate = Number((anchorStats.anchored_total / anchorStats.candidates_total).toFixed(4));
        anchorStats.precise_anchored_rate = Number((anchorStats.precise_anchored_total / anchorStats.candidates_total).toFixed(4));
        anchorStats.block_only_rate = Number((anchorStats.block_only_total / anchorStats.candidates_total).toFixed(4));
        anchorStats.failed_rate = Number((anchorStats.failed_total / anchorStats.candidates_total).toFixed(4));
    }
    if (anchorStats.checks_with_candidates > 0) {
        anchorStats.abstention_rate = Number((anchorStats.checks_abstained / anchorStats.checks_with_candidates).toFixed(4));
    }

    // Diagnostic logging for anchor verification
    console.log(JSON.stringify({
        level: 'INFO',
        message: 'Anchor verification complete',
        candidates_total: anchorStats.candidates_total,
        anchored_total: anchorStats.anchored_total,
        precise_anchored_total: anchorStats.precise_anchored_total,
        block_only_total: anchorStats.block_only_total,
        failed_total: anchorStats.failed_total,
        failure_reasons: anchorStats.failure_reasons,
        checks_with_candidates: anchorStats.checks_with_candidates,
        checks_abstained: anchorStats.checks_abstained,
        block_map_size: manifest.block_map?.length || 0,
        signature_map_size: signatureMap.size,
        node_ref_map_size: nodeRefMap.size,
        timestamp: new Date().toISOString()
    }));

    return { ...result, checks: normalizedChecks, anchor_verification: anchorStats };
};

// PII Scrubber import
const { scrubAnalysisResult } = require('./pii-scrubber');

const CHECK_CATEGORY_MAP = {
    // === AEO CHECKS (Answer Engine Optimization) ===
    // answer_extractability - ALL AEO
    'immediate_answer_placement': { category: 'AEO', subcategory: 'Answer Extractability' },
    'answer_sentence_concise': { category: 'AEO', subcategory: 'Answer Extractability' },
    'question_answer_alignment': { category: 'AEO', subcategory: 'Answer Extractability' },
    'clear_answer_formatting': { category: 'AEO', subcategory: 'Answer Extractability' },
    'faq_structure_opportunity': { category: 'AEO', subcategory: 'Answer Extractability' },
    // structure_readability - ALL AEO
    'single_h1': { category: 'AEO', subcategory: 'Structure & Readability' },
    'logical_heading_hierarchy': { category: 'AEO', subcategory: 'Structure & Readability' },
    'heading_topic_fulfillment': { category: 'AEO', subcategory: 'Structure & Readability' },
    'heading_fragmentation': { category: 'AEO', subcategory: 'Structure & Readability' },
    'appropriate_paragraph_length': { category: 'AEO', subcategory: 'Structure & Readability' },
    'lists_tables_presence': { category: 'AEO', subcategory: 'Structure & Readability' },
    'readability_adaptivity': { category: 'AEO', subcategory: 'Structure & Readability' },
    // schema_structured_data - MOSTLY AEO (except semantic_html_usage)
    'valid_jsonld_schema': { category: 'AEO', subcategory: 'Schema & Structured Data' },
    'schema_matches_content': { category: 'AEO', subcategory: 'Schema & Structured Data' },
    'canonical_clarity': { category: 'AEO', subcategory: 'Schema & Structured Data' },
    'supported_schema_types_validation': { category: 'AEO', subcategory: 'Schema & Structured Data' },
    'faq_jsonld_generation_suggestion': { category: 'AEO', subcategory: 'Schema & Structured Data' },
    'howto_schema_presence_and_completeness': { category: 'AEO', subcategory: 'Schema & Structured Data' },
    'semantic_html_usage': { category: 'AEO', subcategory: 'Schema & Structured Data' }, // Borderline but AEO-leaning
    // freshness_temporal - MOSTLY AEO
    'content_updated_12_months': { category: 'AEO', subcategory: 'Freshness & Temporal' },
    'no_broken_internal_links': { category: 'AEO', subcategory: 'Freshness & Temporal' },
    'temporal_claim_check': { category: 'GEO', subcategory: 'Freshness & Temporal' }, // GEO per user spec

    // === GEO CHECKS (Generative Engine Optimization) ===
    // entities_semantic - ALL GEO
    'named_entities_detected': { category: 'GEO', subcategory: 'Entities & Semantic Clarity' },
    'entities_contextually_relevant': { category: 'GEO', subcategory: 'Entities & Semantic Clarity' },
    'entity_relationships_clear': { category: 'GEO', subcategory: 'Entities & Semantic Clarity' },
    'entity_disambiguation': { category: 'GEO', subcategory: 'Entities & Semantic Clarity' },
    'terminology_consistency': { category: 'GEO', subcategory: 'Entities & Semantic Clarity' },
    'howto_semantic_validity': { category: 'GEO', subcategory: 'Entities & Semantic Clarity' },
    // trust_neutrality - ALL GEO
    'author_identified': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'author_bio_present': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'metadata_checks': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'ai_crawler_accessibility': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'accessibility_basics': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'external_authoritative_sources': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'citation_format_and_context': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'claim_provenance_and_evidence': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'numeric_claim_consistency': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'contradictions_and_coherence': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'no_exaggerated_claims': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'promotional_or_commercial_intent': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    'pii_sensitive_content_detector': { category: 'GEO', subcategory: 'Trust & Neutrality' },
    // citability_verifiability - ALL GEO
    'original_evidence_signal': { category: 'GEO', subcategory: 'Citability & Verifiability' },
    'claim_pattern_detection': { category: 'GEO', subcategory: 'Citability & Verifiability' },
    'factual_statements_well_formed': { category: 'GEO', subcategory: 'Citability & Verifiability' },
    'internal_link_context_relevance': { category: 'GEO', subcategory: 'Citability & Verifiability' },
    'duplicate_or_near_duplicate_detection': { category: 'GEO', subcategory: 'Citability & Verifiability' }
};

/**
 * P2: Recursively flatten nested checks structure from any depth
 * Handles AI outputs like:
 *   - { answer_blocks: { verdict: 'pass' } }  (flat - correct)
 *   - { answer_extractability: { answer_blocks: { verdict: 'pass' } } }  (one level nested)
 *   - { checks: { answer_extractability: { answer_blocks: { verdict: 'pass' } } } }  (double nested)
 *   - { answer_extractability: { checks: { answer_blocks: { verdict: 'pass' } } } }  (category with checks wrapper)
 */
const flattenChecks = (obj, result = {}, depth = 0) => {
    // Safety: prevent infinite recursion
    if (!obj || typeof obj !== 'object' || depth > 5) return result;

    Object.entries(obj).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;

        // If this looks like a check result (has verdict or confidence), add it
        if ('verdict' in value || 'confidence' in value || 'explanation' in value) {
            // It's a check - use the key as the check ID
            result[key] = value;
        }
        // If it has a 'checks' property, recurse into it
        else if (value.checks && typeof value.checks === 'object') {
            flattenChecks(value.checks, result, depth + 1);
        }
        // Otherwise, recurse into this object (might be a category wrapper)
        else {
            flattenChecks(value, result, depth + 1);
        }
    });

    return result;
};

/**
 * P1: Flatten definitions for prompt injection
 * Converts nested category structure to flat check_id -> definition map
 * This prevents AI from mimicking nested output structure
 */
const flattenDefinitionsForPrompt = (definitions, aiEligibleCheckIds = null) => {
    if (!definitions || typeof definitions !== 'object' || !definitions.categories || typeof definitions.categories !== 'object') {
        return {};
    }

    const aiCheckIds = aiEligibleCheckIds instanceof Set
        ? aiEligibleCheckIds
        : getAiEligibleCheckIds(definitions);
    const flat = {};
    Object.entries(definitions.categories).forEach(([catKey, catValue]) => {
        if (!catValue || !catValue.checks) return;
        Object.entries(catValue.checks).forEach(([checkId, checkDef]) => {
            if (!aiCheckIds.has(checkId)) {
                return;
            }
            // Include check definition with category context for AI
            flat[checkId] = {
                ...checkDef,
                _category: catValue.name || catKey
            };
        });
    });
    return flat;
};

/**
 * Log helper
 */
const log = (level, message, data = {}) => {
    console.log(JSON.stringify({
        level,
        message,
        service: 'aivi-analyzer-worker',
        ...data,
        timestamp: new Date().toISOString()
    }));
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

const resolveRuntimeContractPath = () => {
    const candidates = [
        path.join(__dirname, 'shared', 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'check-runtime-contract-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || null;
};

const replacePromptToken = (template, token, value) => {
    return String(template || '').split(token).join(String(value ?? ''));
};

const assertPromptTemplateTokens = (template) => {
    const missing = REQUIRED_PROMPT_TOKENS.filter((token) => !String(template || '').includes(token));
    if (missing.length > 0) {
        const err = new Error(`prompt_template_invalid: Missing required tokens ${missing.join(', ')}`);
        err.details = { missing_tokens: missing };
        throw err;
    }
};

const resolveScoringConfigPath = () => {
    const sourceCandidates = [
        path.join(__dirname, '..', 'orchestrator', 'schemas', 'scoring-config-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'scoring-config-v1.json'),
        path.join(__dirname, 'shared', 'schemas', 'scoring-config-v1.json'),
        path.join(__dirname, 'schemas', 'scoring-config-v1.json')
    ];
    const packagedCandidates = [
        path.join(__dirname, 'shared', 'schemas', 'scoring-config-v1.json'),
        path.join(__dirname, 'schemas', 'scoring-config-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'scoring-config-v1.json'),
        path.join(__dirname, '..', 'orchestrator', 'schemas', 'scoring-config-v1.json')
    ];
    const candidates = isPackagedLambdaRuntime ? packagedCandidates : sourceCandidates;
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || null;
};

const ensureScoringConfigLoaded = () => {
    if (cachedScoringConfig !== undefined) {
        return cachedScoringConfig;
    }

    const scoringPath = resolveScoringConfigPath();
    if (!scoringPath) {
        cachedScoringConfig = null;
        return cachedScoringConfig;
    }

    try {
        cachedScoringConfig = readJsonFile(scoringPath);
    } catch (error) {
        cachedScoringConfig = null;
        log('WARN', 'Failed to lazy load scoring config; using fallback scoring', {
            error: error.message
        });
    }

    return cachedScoringConfig;
};

const normalizeContentTypeForScoring = (manifest) => {
    const rawType = String(
        manifest?.content_type
        || manifest?.classification?.primary_type
        || 'article'
    ).toLowerCase().trim();
    if (rawType === 'how-to') return 'howto';
    if (rawType === 'post' || rawType === 'blog' || rawType === 'guide' || rawType === 'pillar') return 'article';
    const known = new Set(['article', 'faq', 'howto', 'news', 'product', 'opinion']);
    return known.has(rawType) ? rawType : 'article';
};

const resolveScoreCategory = (checkId, checkData = null) => {
    const fromMap = CHECK_CATEGORY_MAP[checkId]?.category;
    if (fromMap === 'AEO' || fromMap === 'GEO') return fromMap;
    const fromCheck = String(checkData?.category || '').toUpperCase();
    if (fromCheck === 'AEO' || fromCheck === 'GEO') return fromCheck;
    return null;
};

const scoreChecksForSidebar = (checks, manifest = null, runId = null) => {
    if (!checks || typeof checks !== 'object') {
        return { ...SCORE_CONTRACT_DEFAULTS };
    }

    const contentType = normalizeContentTypeForScoring(manifest);
    const scoringConfig = ensureScoringConfigLoaded();
    const computed = scoreChecksAgainstConfig(checks, scoringConfig, contentType, {
        resolveCategory: (checkId, checkData) => resolveScoreCategory(checkId, checkData)
    }).scores;

    if (runId) {
        log('INFO', 'Scores computed from checks', {
            run_id: runId,
            content_type: contentType,
            scoring_config_version: scoringConfig?.version || 'fallback',
            scores: computed
        });
    }

    return computed;
};

const parseMessageBody = (body) => {
    if (typeof body === 'string') {
        let cleaned = body.replace(/^\uFEFF/, '').replace(/^\xEF\xBB\xBF/, '');
        if (cleaned.includes('\x00')) {
            cleaned = cleaned.replace(/\x00/g, '');
        }
        return JSON.parse(cleaned);
    }
    if (typeof body === 'object' && body !== null) {
        return body;
    }
    return null;
};

const normalizeTelemetryText = (value) => {
    if (typeof value !== 'string') return '';
    return value
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

const sentenceScopedChecks = new Set([
    'answer_sentence_concise',
    'question_answer_alignment',
    'temporal_claim_check',
    'claim_pattern_detection',
    'factual_statements_well_formed'
]);

const ORPHAN_HEADING_CHECK_ID = 'heading_topic_fulfillment';
const ORPHAN_AGGREGATE_EXPLANATION_PATTERNS = [
    /\ball headings\b/i,
    /\bmultiple headings\b/i,
    /\bheadings lack\b/i,
    /\bsemantically orphaned\b/i,
    /\borphan(?:ed)? headings\b/i
];

const getAllowedScopesForCheck = (checkId, runtimeContract = cachedRuntimeContract) => {
    if (!runtimeContract && !cachedRuntimeContract) {
        try {
            loadAssets();
        } catch (error) {
            // Narrow test paths may call scope normalization before asset hydration.
        }
    }
    const effectiveRuntimeContract = runtimeContract || cachedRuntimeContract;
    const entry = getRuntimeContractEntry(checkId, effectiveRuntimeContract);
    const scopes = Array.isArray(entry?.allowed_scopes) ? entry.allowed_scopes : (entry?.allowed_scopes ? [entry.allowed_scopes] : []);
    const normalized = scopes
        .map((scope) => String(scope || '').trim().toLowerCase())
        .filter((scope) => scope === 'sentence' || scope === 'span' || scope === 'block');
    return normalized.length > 0 ? normalized : ['span', 'block'];
};

const enforceAllowedScope = (checkId, scope, runtimeContract = cachedRuntimeContract) => {
    const normalizedScope = String(scope || '').trim().toLowerCase();
    const allowedScopes = getAllowedScopesForCheck(checkId, runtimeContract);
    if (allowedScopes.includes(normalizedScope)) {
        return normalizedScope;
    }
    if (allowedScopes.includes('span')) return 'span';
    if (allowedScopes.includes('sentence')) return 'sentence';
    if (allowedScopes.includes('block')) return 'block';
    return 'span';
};

const coerceOrphanHeadingExact = (value) => {
    const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (!raw) return '';
    const words = raw.split(/\s+/).filter(Boolean);
    if (raw.length <= 120 && words.length <= 18) return raw;
    const candidates = raw
        .split(/[.\n!?;:]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && part.length <= 120);
    const best = candidates.find((part) => part.split(/\s+/).filter(Boolean).length <= 18) || candidates[0];
    if (best) return best;
    return raw.slice(0, 120).trim();
};

const buildOrphanHeadingInstanceExplanation = (headingText, fallback = '') => {
    const text = String(headingText || '').replace(/\s+/g, ' ').trim();
    if (text) {
        return `Heading "${text}" lacks meaningful support and does not fulfill its topical promise for LLM-based answer engines.`;
    }
    const fallbackText = String(fallback || '').trim();
    return fallbackText || 'This heading lacks meaningful support and topical fulfillment for LLM-based answer engines.';
};

const looksAggregateOrphanExplanation = (value) => {
    const text = String(value || '').trim();
    if (!text) return true;
    return ORPHAN_AGGREGATE_EXPLANATION_PATTERNS.some((pattern) => pattern.test(text));
};

const QUESTION_ANCHOR_GATED_CHECKS = new Set([
    'immediate_answer_placement',
    'answer_sentence_concise',
    'question_answer_alignment',
    'clear_answer_formatting'
]);
const QUESTION_ANCHOR_GUARDRAIL_VERDICT_BY_CHECK = Object.freeze({
});

const getQuestionAnchorGuardrailVerdict = (checkId) => (
    QUESTION_ANCHOR_GUARDRAIL_VERDICT_BY_CHECK[checkId] || 'partial'
);

const buildQuestionAnchorGuardrailExplanation = (checkId, reason) => {
    const normalizedCheckId = String(checkId || '').trim();
    const normalizedReason = String(reason || '').trim().toLowerCase();
    if (checkId === 'faq_structure_opportunity') {
        return normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The article contains answerable topics, but the question-and-answer structure is too ambiguous to support reliable FAQ extraction.'
            : 'The content shares useful information, but it is not organized into explicit question-and-answer pairs that support FAQ extraction.';
    }
    if (checkId === 'faq_jsonld_generation_suggestion') {
        return normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The article hints at answerable topics, but the question-and-answer path is too ambiguous to support reliable FAQ schema guidance.'
            : 'The content is not framed as clear question-and-answer pairs, so FAQ schema support is only partial.';
    }
    const answerFallbackByCheck = {
        immediate_answer_placement: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The topic is covered, but the opening does not show a clear query-to-answer path that supports immediate answer extraction.'
            : 'The opening is informative, but it does not present a clear question-led setup for direct answer extraction in the first section.',
        answer_sentence_concise: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The answer idea is present, but the query-to-answer path is too ambiguous to confirm a concise extractable answer sentence.'
            : 'The content includes useful detail, but it is not structured as concise question-led answer sentences.',
        question_answer_alignment: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The response appears relevant, but the query-to-answer path is too ambiguous to verify strong question-answer alignment.'
            : 'The section is informative, but it is not organized into explicit question-led answers that prove clear alignment.',
        clear_answer_formatting: normalizedReason === 'invalid_or_missing_question_anchor'
            ? 'The content covers the topic, but the query-to-answer path is too ambiguous to support clearly formatted answer extraction.'
            : 'The section shares useful information, but it is not formatted as explicit question-and-answer blocks for clear extraction.'
    };
    if (answerFallbackByCheck[normalizedCheckId]) {
        return answerFallbackByCheck[normalizedCheckId];
    }
    return normalizedReason === 'invalid_or_missing_question_anchor'
        ? 'The article covers the topic, but the query-to-answer path is too ambiguous to support strong direct-answer extraction.'
        : 'The content is informative, but it is not structured around explicit question prompts that support direct-answer extraction.';
};

const STRICT_QUESTION_PREFIX_PATTERNS = [ /^(what|why|when|where|who|which)\s+(is|are|was|were|does|do|did|can|could|should|would|will|has|have|had)\b/i, /^how\s+(is|are|does|do|can|could|should|would|will)\b/i, /^(is|are|was|were|does|do|did|can|could|should|would|will|has|have|had)\b/i, /^(faq|question|q:)\s*(what|why|when|where|who|which|how|is|are|does|do|can)\b/i ];

const RELAXED_HEADING_QUESTION_STARTERS = new Set(['what', 'why', 'when', 'where', 'who', 'which', 'how']);
const RELAXED_HEADING_QUESTION_VERB_CUES = new Set([
    'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'has', 'have', 'had',
    'changed', 'change', 'matters', 'matter', 'means', 'mean', 'works', 'work', 'helps', 'help', 'affects', 'affect',
    'improves', 'improve', 'supports', 'support', 'reduces', 'reduce', 'increases', 'increase', 'updated', 'update',
    'miss', 'misses', 'missed', 'drives', 'drive', 'shifts', 'shift'
]);
const RHETORICAL_HOOK_AUXILIARIES = new Set(['do', 'does', 'did', 'are', 'have', 'has', 'had']);
const RHETORICAL_HOOK_CUES = new Set([
    'find', 'yourself', 'feel', 'feeling', 'struggle', 'struggling', 'wonder', 'wondering',
    'looking', 'ready', 'trying', 'ever', 'overwhelmed', 'confused', 'stuck', 'time'
]);
const STRUCTURED_SURFACE_INTENT_PATTERNS = [
    /^what not to\b/i,
    /^what to\b/i,
    /^types?\b/i,
    /^ways?\b/i,
    /^steps?\b/i,
    /^mistakes?\b/i,
    /^pros(?:\s+and\s+|\s*&\s*)cons\b/i,
    /^compare\b/i,
    /^comparison\b/i,
    /^differences?\b/i,
    /\bversus\b/i,
    /\bvs\.?\b/i,
    /^checklist\b/i,
    /^table\b/i,
    /^options?\b/i
];

const NON_QUESTION_TOPIC_PATTERNS = [
    /^how to\b/i,
    /^step\s+\d+\b/i,
    /^overview\b/i,
    /^introduction\b/i
];

const isRelaxedQuestionLikeHeadingText = (normalizedText) => {
    if (!normalizedText || typeof normalizedText !== 'string') return false;
    const tokens = normalizedText
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (tokens.length < 3 || tokens.length > 12) return false;
    if (!RELAXED_HEADING_QUESTION_STARTERS.has(tokens[0])) return false;
    if (tokens[0] === 'how' && tokens[1] === 'to') return false;
    if (tokens.slice(1).some((token) => RELAXED_HEADING_QUESTION_VERB_CUES.has(token))) {
        return true;
    }
    return false;
};

const normalizeQuestionAnchorText = (value) => {
    if (typeof value !== 'string') return '';
    return value
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
};

const tokenizeIntentCueText = (value) => normalizeQuestionAnchorText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const isLikelyRhetoricalHookQuestionText = (value) => {
    const normalized = normalizeQuestionAnchorText(value);
    if (!normalized || !normalized.endsWith('?')) {
        return false;
    }
    if (/^if you're looking for\b/i.test(normalized) || /^if you are looking for\b/i.test(normalized)) {
        return true;
    }
    if (/\bwhy not\b/i.test(normalized)) {
        return true;
    }
    const tokens = tokenizeIntentCueText(normalized);
    if (tokens.length < 3) {
        return false;
    }
    if (!RHETORICAL_HOOK_AUXILIARIES.has(tokens[0]) || tokens[1] !== 'you') {
        return false;
    }
    return tokens.slice(2).some((token) => RHETORICAL_HOOK_CUES.has(token));
};

const isQuestionLikeIntentCueText = (value) => {
    const normalized = normalizeQuestionAnchorText(value);
    if (!normalized) return false;
    if (isLikelyRhetoricalHookQuestionText(normalized)) {
        return false;
    }
    if (normalized.endsWith('?')) {
        return true;
    }
    return isRelaxedQuestionLikeHeadingText(normalized);
};

const isStructuredSurfaceIntentCueText = (value) => {
    const normalized = normalizeQuestionAnchorText(value);
    if (!normalized) return false;
    return STRUCTURED_SURFACE_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isStrictQuestionAnchorText = (value) => {
    const normalized = normalizeQuestionAnchorText(value);
    if (!normalized || normalized.length < 5) {
        return false;
    }
    if (isLikelyRhetoricalHookQuestionText(normalized)) {
        return false;
    }
    if (NON_QUESTION_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return false;
    }
    if (normalized.endsWith('?')) {
        return true;
    }
    return STRICT_QUESTION_PREFIX_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isHeadingLikeBlockType = (blockType) => {
    if (typeof blockType !== 'string' || !blockType.trim()) {
        return false;
    }
    const normalized = blockType.toLowerCase();
    return normalized.includes('heading') || /\/h[1-6]$/.test(normalized);
};

const isPseudoHeadingLikeText = (value) => {
    const normalized = normalizeQuestionAnchorText(value);
    if (!normalized || normalized.length < 6 || normalized.length > 120) {
        return false;
    }
    if (/[.!?]$/.test(normalized) && !normalized.endsWith('?')) {
        return false;
    }
    return isQuestionLikeIntentCueText(normalized) || isStructuredSurfaceIntentCueText(normalized);
};

const isPseudoHeadingCandidateBlock = (block, normalizedText) => {
    const blockType = typeof block?.block_type === 'string' ? block.block_type.toLowerCase().trim() : '';
    if (isHeadingLikeBlockType(blockType)) {
        return false;
    }
    if (blockType && blockType !== 'core/paragraph' && blockType !== 'core/freeform' && blockType !== 'core/html') {
        return false;
    }
    return isPseudoHeadingLikeText(normalizedText);
};

const splitTextSentencesWithOffsets = (text) => {
    const value = typeof text === 'string' ? text : '';
    if (!value) return [];
    const sentenceRegex = /[^.!?\n]+[.!?]?/g;
    const sentences = [];
    let match;
    while ((match = sentenceRegex.exec(value)) !== null) {
        const raw = match[0];
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const leadingWhitespace = raw.length - raw.trimStart().length;
        const trailingWhitespace = raw.length - raw.trimEnd().length;
        const start = match.index + leadingWhitespace;
        const end = match.index + raw.length - trailingWhitespace;
        if (end <= start) continue;
        sentences.push({
            text: value.slice(start, end),
            start,
            end
        });
    }
    return sentences;
};

const buildStrictQuestionAnchors = (manifest, maxAnchors = 24) => {
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const anchors = [];
    const seen = new Set();

    const pushAnchor = (anchor) => {
        if (!anchor) return;
        const text = normalizeQuestionAnchorText(anchor.text);
        if (!text) return;
        const dedupeKey = `${anchor.node_ref || ''}|${text.toLowerCase()}|${anchor.start ?? ''}|${anchor.end ?? ''}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        anchors.push({
            node_ref: anchor.node_ref || null,
            signature: anchor.signature || null,
            source: anchor.source || 'sentence',
            start: Number.isFinite(anchor.start) ? anchor.start : null,
            end: Number.isFinite(anchor.end) ? anchor.end : null,
            text
        });
    };

    for (let i = 0; i < blockMap.length; i += 1) {
        if (anchors.length >= maxAnchors) break;
        const block = blockMap[i];
        if (!block || typeof block !== 'object') continue;
        const text = typeof block.text === 'string' ? block.text : (typeof block.text_content === 'string' ? block.text_content : '');
        const normalizedText = normalizeQuestionAnchorText(text);
        if (!normalizedText) continue;
        const nodeRef = block.node_ref || `block-${i}`;
        const signature = block.signature || null;
        const isHeading = isHeadingLikeBlockType(block.block_type);
        const isPseudoHeading = isPseudoHeadingCandidateBlock(block, normalizedText);

        if (isHeading || isPseudoHeading) {
            continue;
        }

        const sentences = splitTextSentencesWithOffsets(text);
        for (let s = 0; s < sentences.length; s += 1) {
            if (anchors.length >= maxAnchors) break;
            const sentence = sentences[s];
            if (!isStrictQuestionAnchorText(sentence.text)) continue;
            pushAnchor({
                node_ref: nodeRef,
                signature,
                source: 'sentence',
                start: sentence.start,
                end: sentence.end,
                text: sentence.text
            });
        }
    }

    return anchors;
};

const buildSectionIntentCues = (manifest, maxCues = 24) => {
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const cues = [];
    const seen = new Set();

    const pushCue = (cue) => {
        if (!cue) return;
        const text = normalizeQuestionAnchorText(cue.text);
        if (!text) return;
        const dedupeKey = `${String(cue.kind || '').trim()}|${text.toLowerCase()}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        cues.push({
            node_ref: cue.node_ref || null,
            signature: cue.signature || null,
            source: cue.source || 'heading',
            kind: cue.kind || 'question_like',
            text
        });
    };

    const titleText = normalizeQuestionAnchorText(manifest?.title || manifest?.post_title || '');
    if (titleText) {
        if (isQuestionLikeIntentCueText(titleText)) {
            pushCue({
                node_ref: '__document_title__',
                signature: null,
                source: 'title',
                kind: 'question_like',
                text: titleText
            });
        } else if (isStructuredSurfaceIntentCueText(titleText)) {
            pushCue({
                node_ref: '__document_title__',
                signature: null,
                source: 'title',
                kind: 'structured_surface',
                text: titleText
            });
        }
    }

    for (let i = 0; i < blockMap.length; i += 1) {
        if (cues.length >= maxCues) break;
        const block = blockMap[i];
        if (!block || typeof block !== 'object') continue;
        const text = typeof block.text === 'string' ? block.text : (typeof block.text_content === 'string' ? block.text_content : '');
        const normalizedText = normalizeQuestionAnchorText(text);
        if (!normalizedText) continue;
        const nodeRef = block.node_ref || `block-${i}`;
        const signature = block.signature || null;
        const isHeading = isHeadingLikeBlockType(block.block_type);
        const isPseudoHeading = isPseudoHeadingCandidateBlock(block, normalizedText);
        if (!isHeading && !isPseudoHeading) {
            continue;
        }

        if (isQuestionLikeIntentCueText(normalizedText)) {
            pushCue({
                node_ref: nodeRef,
                signature,
                source: isHeading ? 'heading' : 'pseudo_heading',
                kind: 'question_like',
                text: normalizedText
            });
            continue;
        }
        if (isStructuredSurfaceIntentCueText(normalizedText)) {
            pushCue({
                node_ref: nodeRef,
                signature,
                source: isHeading ? 'heading' : 'pseudo_heading',
                kind: 'structured_surface',
                text: normalizedText
            });
        }
    }

    return cues;
};

const buildQuestionAnchorPayload = (manifest) => {
    const anchors = buildStrictQuestionAnchors(manifest);
    const sectionIntentCues = buildSectionIntentCues(manifest);
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const anchorNodeTextLookup = {};
    const anchorNodeRefs = new Set(
        anchors
            .map((anchor) => (typeof anchor?.node_ref === 'string' ? anchor.node_ref.trim() : ''))
            .filter(Boolean)
    );
    const getAnchorWindowText = (startIndex) => {
        const windowParts = [];
        for (let index = startIndex + 1; index < blockMap.length; index += 1) {
            const candidate = blockMap[index];
            if (!candidate || typeof candidate !== 'object') continue;
            if (isHeadingLikeBlockType(candidate.block_type)) break;
            const candidateText = normalizeQuestionAnchorText(candidate?.text || candidate?.text_content || '').toLowerCase();
            if (candidateText) {
                windowParts.push(candidateText);
            }
        }
        return windowParts.join(' ').trim();
    };
    blockMap.forEach((block, blockIndex) => {
        const nodeRef = typeof block?.node_ref === 'string' ? block.node_ref.trim() : '';
        if (!nodeRef || !anchorNodeRefs.has(nodeRef)) return;
        const blockText = normalizeQuestionAnchorText(block?.text || block?.text_content || '').toLowerCase();
        if (!blockText) return;
        const anchorWindowText = getAnchorWindowText(blockIndex);
        anchorNodeTextLookup[nodeRef] = [blockText, anchorWindowText].filter(Boolean).join(' ').trim();
    });
    return {
        strict_mode: true,
        anchor_count: anchors.length,
        anchors,
        section_intent_cue_count: sectionIntentCues.length,
        section_intent_cues: sectionIntentCues,
        anchor_node_text_lookup: anchorNodeTextLookup
    };
};

const evaluateQuestionAnchorGuardrail = ({ checkId, verdict, finding, questionAnchorPayload }) => {
    const normalizedVerdict = normalizeVerdict(verdict, 'fail');
    if (!QUESTION_ANCHOR_GATED_CHECKS.has(checkId)) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    const payload = questionAnchorPayload && typeof questionAnchorPayload === 'object'
        ? questionAnchorPayload
        : { anchors: [] };
    const anchors = Array.isArray(payload.anchors) ? payload.anchors : [];
    const sectionIntentCues = Array.isArray(payload.section_intent_cues) ? payload.section_intent_cues : [];
    const anchorNodeRefSet = new Set(
        anchors
            .map((anchor) => (typeof anchor?.node_ref === 'string' ? anchor.node_ref.trim() : ''))
            .filter(Boolean)
    );
    const anchorNodeTextLookup = payload.anchor_node_text_lookup && typeof payload.anchor_node_text_lookup === 'object'
        ? payload.anchor_node_text_lookup
        : {};
    const normalizedAnchorSet = new Set(
        anchors
            .map((anchor) => normalizeQuestionAnchorText(anchor?.text).toLowerCase())
            .filter(Boolean)
    );

    if (normalizedAnchorSet.size === 0 && sectionIntentCues.length > 0) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    if (normalizedAnchorSet.size === 0) {
        return {
            verdict: getQuestionAnchorGuardrailVerdict(checkId),
            adjusted: true,
            reason: 'no_strict_question_anchor'
        };
    }

    const explicitAnchorText = normalizeQuestionAnchorText(finding?.question_anchor_text).toLowerCase();
    if (explicitAnchorText && normalizedAnchorSet.has(explicitAnchorText)) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    if (normalizedAnchorSet.size === 1) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    const selector = finding?.text_quote_selector && typeof finding.text_quote_selector === 'object'
        ? finding.text_quote_selector
        : {};
    const findingNodeRef = typeof finding?.node_ref === 'string' ? finding.node_ref.trim() : '';
    if (findingNodeRef && anchorNodeRefSet.has(findingNodeRef)) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    const normalizeAnchorEvidenceText = (value) => normalizeQuestionAnchorText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const evidenceCandidates = [
        selector.exact,
        finding?.snippet,
        finding?.text,
        typeof selector.prefix === 'string' && typeof selector.exact === 'string'
            ? `${selector.prefix} ${selector.exact}`
            : '',
        typeof selector.exact === 'string' && typeof selector.suffix === 'string'
            ? `${selector.exact} ${selector.suffix}`
            : ''
    ]
        .map((value) => normalizeAnchorEvidenceText(value))
        .filter((value) => value.length >= 24);
    const anchorBlockTexts = Object.values(anchorNodeTextLookup)
        .map((value) => normalizeAnchorEvidenceText(value))
        .filter(Boolean);
    const hasAnchorBlockEvidence = evidenceCandidates.some((candidate) => (
        anchorBlockTexts.some((blockText) => blockText.includes(candidate))
    ));
    if (hasAnchorBlockEvidence) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    const exactText = normalizeQuestionAnchorText(selector.exact || finding?.snippet || finding?.text).toLowerCase();
    if (exactText && normalizedAnchorSet.has(exactText)) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null
        };
    }

    return {
        verdict: getQuestionAnchorGuardrailVerdict(checkId),
        adjusted: true,
        reason: 'invalid_or_missing_question_anchor'
    };
};

const STRUCTURE_GOVERNED_OPPORTUNITY_CHECKS = new Set([
    'lists_tables_presence',
    'faq_structure_opportunity',
    'howto_semantic_validity'
]);

const buildBlockSectionLookup = (blockMap) => {
    const lookup = {};
    const blocks = Array.isArray(blockMap) ? blockMap : [];
    let currentHeadingNodeRef = null;

    blocks.forEach((block) => {
        const nodeRef = typeof block?.node_ref === 'string' ? block.node_ref.trim() : '';
        if (!nodeRef) {
            return;
        }
        if (isHeadingLikeBlockType(block?.block_type)) {
            currentHeadingNodeRef = nodeRef;
            lookup[nodeRef] = nodeRef;
            return;
        }
        lookup[nodeRef] = currentHeadingNodeRef || nodeRef;
    });

    return lookup;
};

const collectNodeRefSet = (items, selector) => {
    const refs = new Set();
    if (!Array.isArray(items) || typeof selector !== 'function') {
        return refs;
    }
    items.forEach((item) => {
        const value = selector(item);
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                const normalized = typeof entry === 'string' ? entry.trim() : '';
                if (normalized) {
                    refs.add(normalized);
                }
            });
            return;
        }
        const normalized = typeof value === 'string' ? value.trim() : '';
        if (normalized) {
            refs.add(normalized);
        }
    });
    return refs;
};

const buildSemanticStructureGuardrailContext = (manifest) => {
    const structure = manifest?.preflight_structure;
    if (!structure || typeof structure !== 'object') {
        return null;
    }

    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const visibleItemListSections = Array.isArray(structure.visible_itemlist_sections)
        ? structure.visible_itemlist_sections
        : [];
    const pseudoListSections = Array.isArray(structure.pseudo_list_sections)
        ? structure.pseudo_list_sections
        : [];
    const questionSections = Array.isArray(structure.question_sections)
        ? structure.question_sections
        : [];
    const faqCandidateSections = Array.isArray(structure.faq_candidate_sections)
        ? structure.faq_candidate_sections
        : [];
    const proceduralSections = Array.isArray(structure.procedural_sections)
        ? structure.procedural_sections
        : [];
    const howtoSummary = structure.howto_summary && typeof structure.howto_summary === 'object'
        ? structure.howto_summary
        : {};
    const faqSignals = structure.faq_signals && typeof structure.faq_signals === 'object'
        ? structure.faq_signals
        : {};

    return {
        blockSectionLookup: buildBlockSectionLookup(blockMap),
        visibleListNodeRefs: collectNodeRefSet(visibleItemListSections, (section) => section?.node_ref),
        visibleListHeadingRefs: collectNodeRefSet(visibleItemListSections, (section) => section?.heading_node_ref),
        pseudoListNodeRefs: collectNodeRefSet(pseudoListSections, (section) => section?.node_ref),
        pseudoListHeadingRefs: collectNodeRefSet(pseudoListSections, (section) => section?.heading_node_ref),
        questionHeadingRefs: collectNodeRefSet(questionSections, (section) => section?.heading_node_ref),
        questionSupportNodeRefs: collectNodeRefSet(questionSections, (section) => section?.support_node_refs),
        faqCandidateHeadingRefs: collectNodeRefSet(faqCandidateSections, (section) => section?.heading_node_ref),
        proceduralNodeRefs: collectNodeRefSet(proceduralSections, (section) => section?.node_ref),
        faqCandidateCount: faqCandidateSections.length,
        questionSectionCount: questionSections.length,
        faqExplicitSignal: faqSignals.explicit_signal === true && faqSignals.blocked_by_type !== true,
        proceduralSignalCount: Number(howtoSummary.step_heading_count || 0)
            + Number(howtoSummary.list_item_count || 0)
            + Number(howtoSummary.procedural_support_count || 0)
            + (Array.isArray(howtoSummary.detected_steps) ? howtoSummary.detected_steps.length : 0)
            + (howtoSummary.title_signal === true ? 1 : 0)
    };
};

const resolveStructuralSectionContext = (structureContext, nodeRef) => {
    if (!structureContext || typeof structureContext !== 'object') {
        return {
            nodeRef: null,
            sectionRef: null,
            inVisibleListSection: false,
            inPseudoListSection: false,
            inQuestionSection: false,
            inFaqCandidateSection: false,
            inProceduralSection: false
        };
    }

    const normalizedNodeRef = typeof nodeRef === 'string' ? nodeRef.trim() : '';
    const sectionRef = normalizedNodeRef
        ? (structureContext.blockSectionLookup?.[normalizedNodeRef] || normalizedNodeRef)
        : null;

    return {
        nodeRef: normalizedNodeRef || null,
        sectionRef: sectionRef || null,
        inVisibleListSection: !!(
            (normalizedNodeRef && structureContext.visibleListNodeRefs.has(normalizedNodeRef))
            || (sectionRef && structureContext.visibleListHeadingRefs.has(sectionRef))
        ),
        inPseudoListSection: !!(
            (normalizedNodeRef && structureContext.pseudoListNodeRefs.has(normalizedNodeRef))
            || (sectionRef && structureContext.pseudoListHeadingRefs.has(sectionRef))
        ),
        inQuestionSection: !!(
            (normalizedNodeRef && structureContext.questionSupportNodeRefs.has(normalizedNodeRef))
            || (sectionRef && structureContext.questionHeadingRefs.has(sectionRef))
        ),
        inFaqCandidateSection: !!(sectionRef && structureContext.faqCandidateHeadingRefs.has(sectionRef)),
        inProceduralSection: !!(
            (normalizedNodeRef && structureContext.proceduralNodeRefs.has(normalizedNodeRef))
            || (sectionRef && structureContext.proceduralNodeRefs.has(sectionRef))
        )
    };
};

const buildSemanticStructureGuardrailExplanation = (checkId, reason) => {
    const normalizedCheckId = String(checkId || '').trim();
    const normalizedReason = String(reason || '').trim().toLowerCase();

    if (normalizedCheckId === 'lists_tables_presence') {
        if (normalizedReason === 'visible_list_already_present') {
            return 'This section already presents the ideas as a visible list, so a list-formatting opportunity is not needed.';
        }
        if (normalizedReason === 'faq_candidate_section') {
            return 'This section behaves more like reusable question-and-answer material than a list-formatting problem.';
        }
    }

    if (normalizedCheckId === 'faq_structure_opportunity') {
        if (normalizedReason === 'insufficient_faq_pairs') {
            return 'The content does not contain enough explicit reusable question-and-answer pairs to justify an FAQ-structure opportunity.';
        }
        if (normalizedReason === 'question_led_explainer_or_list') {
            return 'The section uses a question-led heading, but it behaves like an explainer or list rather than repeated FAQ pairs.';
        }
        if (normalizedReason === 'section_not_faq_candidate') {
            return 'This section is not structurally supported as an FAQ candidate, so an FAQ-formatting opportunity is not triggered here.';
        }
    }

    if (normalizedCheckId === 'howto_semantic_validity' && normalizedReason === 'not_procedural_content') {
        return 'This content does not present strong step-by-step procedural signals, so a HowTo-validity issue is not triggered here.';
    }

    return 'Structural evidence does not support releasing this opportunity finding.';
};

const TEMPORAL_LOCAL_INTERVAL_PATTERNS = [
    /\b(?:after|within|in|over|during|before|by|for|throughout)\s+(?:the\s+next\s+|the\s+first\s+|at\s+least\s+|up\s+to\s+)?\d+(?:\s*(?:-|to)\s*\d+)?\s*(?:hour|hours|day|days|week|weeks|month|months|year|years)\b/i,
    /\b\d+(?:\s*(?:-|to)\s*\d+)?\s*(?:hour|hours|day|days|week|weeks|month|months|year|years)\s+(?:after|before|later)\b/i,
    /\bfor\s+(?:the\s+)?first\s+\d+(?:\s*(?:-|to)\s*\d+)?\s*(?:hour|hours|day|days|week|weeks|month|months|year|years)\b/i
];

const TEMPORAL_RECENCY_LANGUAGE_PATTERN = /\b(currently|current|today|now|right now|latest|recent|recently|at present|as of|up-to-date|changing|emerging|growing)\b/i;

const normalizeTemporalGuardrailText = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const hasAnchoredLocalTemporalInterval = (value) => {
    const text = normalizeTemporalGuardrailText(value);
    if (!text) return false;
    return TEMPORAL_LOCAL_INTERVAL_PATTERNS.some((pattern) => pattern.test(text));
};

const hasTemporalRecencyLanguage = (value) => TEMPORAL_RECENCY_LANGUAGE_PATTERN.test(normalizeTemporalGuardrailText(value));

const looksLikeArticleDateComplaint = (value) => {
    const text = normalizeTemporalGuardrailText(value).toLowerCase();
    if (!text) return false;
    return /\bdate\b/.test(text) && /\b(publication|publish(?:ed)?|posted|update(?:d)?|last updated?)\b/.test(text);
};

const buildTemporalClaimGuardrailExplanation = (reason) => {
    const normalizedReason = String(reason || '').trim().toLowerCase();
    if (normalizedReason === 'local_interval_already_anchored') {
        return 'This sentence already anchors the timing with a clear local interval, so an article-level publication date is not required for this claim.';
    }
    return 'The sentence already carries enough local timing context to judge the claim.';
};

const evaluateSemanticStructureGuardrail = ({
    checkId,
    verdict,
    finding,
    match,
    structureContext
}) => {
    const normalizedVerdict = normalizeVerdict(verdict, 'fail');
    if (normalizedVerdict === 'pass' || !STRUCTURE_GOVERNED_OPPORTUNITY_CHECKS.has(checkId) || !structureContext) {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null,
            kind: null
        };
    }

    const candidateNodeRef = typeof match?.node_ref === 'string' && match.node_ref.trim()
        ? match.node_ref.trim()
        : (typeof finding?.node_ref === 'string' ? finding.node_ref.trim() : '');
    const sectionContext = resolveStructuralSectionContext(structureContext, candidateNodeRef);

    if (checkId === 'lists_tables_presence') {
        if (sectionContext.inVisibleListSection) {
            return {
                verdict: 'pass',
                adjusted: true,
                reason: 'visible_list_already_present',
                kind: 'semantic_structure'
            };
        }
        if (sectionContext.inFaqCandidateSection && !sectionContext.inVisibleListSection) {
            return {
                verdict: 'pass',
                adjusted: true,
                reason: 'faq_candidate_section',
                kind: 'semantic_structure'
            };
        }
    }

    if (checkId === 'faq_structure_opportunity') {
        const hasStrongFaqSupport = structureContext.faqCandidateCount >= 2
            || (structureContext.faqExplicitSignal && structureContext.questionSectionCount >= 2);
        if (!hasStrongFaqSupport) {
            return {
                verdict: 'pass',
                adjusted: true,
                reason: 'insufficient_faq_pairs',
                kind: 'semantic_structure'
            };
        }
        if (sectionContext.inVisibleListSection || sectionContext.inPseudoListSection) {
            return {
                verdict: 'pass',
                adjusted: true,
                reason: 'question_led_explainer_or_list',
                kind: 'semantic_structure'
            };
        }
        if (!sectionContext.inFaqCandidateSection && !sectionContext.inQuestionSection) {
            return {
                verdict: 'pass',
                adjusted: true,
                reason: 'section_not_faq_candidate',
                kind: 'semantic_structure'
            };
        }
    }

    if (checkId === 'howto_semantic_validity') {
        if (!sectionContext.inProceduralSection && structureContext.proceduralSignalCount === 0) {
            return {
                verdict: 'pass',
                adjusted: true,
                reason: 'not_procedural_content',
                kind: 'semantic_structure'
            };
        }
    }

    return {
        verdict: normalizedVerdict,
        adjusted: false,
        reason: null,
        kind: null
    };
};

const evaluateTemporalClaimGuardrail = ({
    checkId,
    verdict,
    finding
}) => {
    const normalizedVerdict = normalizeVerdict(verdict, 'fail');
    if (checkId !== 'temporal_claim_check' || normalizedVerdict === 'pass') {
        return {
            verdict: normalizedVerdict,
            adjusted: false,
            reason: null,
            kind: null
        };
    }

    const selector = finding?.text_quote_selector && typeof finding.text_quote_selector === 'object'
        ? finding.text_quote_selector
        : {};
    const evidenceText = [
        selector.exact,
        finding?.snippet,
        finding?.text
    ]
        .map((value) => normalizeTemporalGuardrailText(value))
        .filter(Boolean)
        .join(' ');
    const explanationText = normalizeTemporalGuardrailText(finding?.explanation || '');

    if (
        looksLikeArticleDateComplaint(explanationText)
        && hasAnchoredLocalTemporalInterval(evidenceText)
        && !hasTemporalRecencyLanguage(evidenceText)
    ) {
        return {
            verdict: 'pass',
            adjusted: true,
            reason: 'local_interval_already_anchored',
            kind: 'semantic_temporal'
        };
    }

    return {
        verdict: normalizedVerdict,
        adjusted: false,
        reason: null,
        kind: null
    };
};

const applyNoInternalLinksNeutrality = (checks, manifest) => {
    if (!checks || typeof checks !== 'object') return checks;
    const links = Array.isArray(manifest?.links) ? manifest.links : null;
    if (!links || links.length > 0) return checks;
    const check = checks.internal_link_context_relevance;
    if (!check || typeof check !== 'object') return checks;
    check.verdict = 'pass';
    check.ui_verdict = 'pass';
    check.confidence = typeof check.confidence === 'number'
        ? Math.max(check.confidence, 0.6)
        : 0.6;
    check.explanation = 'No internal links were detected in this content, so contextual internal-link relevance is neutral for this run.';
    check.highlights = [];
    check.failed_candidates = [];
    check.candidate_highlights = [];
    check.non_inline = true;
    check.non_inline_reason = 'internal_links_absent';
    check.score_neutral = true;
    check.score_neutral_reason = 'internal_links_absent';
    if (!check.details || typeof check.details !== 'object') {
        check.details = {};
    }
    check.details.internal_link_count = 0;
    check.details.score_neutral = true;
    check.details.score_neutral_reason = 'internal_links_absent';
    return checks;
};

const extractSentenceFromBlock = (blockMap, snippet) => {
    const normalizedSnippet = normalizeTelemetryText(snippet);
    if (!normalizedSnippet) return null;
    for (let i = 0; i < blockMap.length; i += 1) {
        const block = blockMap[i];
        if (!block) continue;
        const blockText = typeof block.text === 'string' ? block.text : (block.text_content || '');
        if (!blockText) continue;
        const sentences = blockText.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [];
        for (let s = 0; s < sentences.length; s += 1) {
            const sentence = sentences[s].trim();
            if (!sentence) continue;
            const normalizedSentence = normalizeTelemetryText(sentence);
            if (normalizedSentence.includes(normalizedSnippet)) {
                return sentence;
            }
        }
    }
    return null;
};

const estimateTokenCount = (value) => {
    if (typeof value !== 'string') return 0;
    const words = value.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words * 1.33));
};

const hasEllipsis = (value) => {
    if (typeof value !== 'string') return false;
    return /(\.\s*\.\s*\.)|…/.test(value);
};

const DEFAULT_AI_CHUNK_SIZE = 5;
const DEFAULT_AI_CHUNK_MAX_TOKENS = 1600;
const DEFAULT_AI_CHUNK_RETRY_MAX_TOKENS = 2200;
const DEFAULT_AI_COMPACT_CHUNK_SIZE = 5;
const DEFAULT_AI_COMPACT_CHUNK_MAX_TOKENS = 1500;
const DEFAULT_AI_COMPACT_CHUNK_RETRY_MAX_TOKENS = 2000;
const DEFAULT_AI_CHUNK_REQUEST_MAX_ATTEMPTS = 2;
const DEFAULT_AI_CHUNK_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_AI_MAX_ANALYSIS_LATENCY_MS = 420000;
const DEFAULT_AI_SOFT_ANALYSIS_TARGET_MS = 90000;
const DEFAULT_AI_COMPLETION_FIRST_ENABLED = true;
const DEFAULT_AI_LAMBDA_RESERVE_MS = 20000;
const DEFAULT_AI_MIN_RETURNED_CHECK_RATE = 0.85;
const DEFAULT_AI_MAX_SYNTHETIC_CHECK_RATE = 0.15;
const DEFAULT_AI_MALFORMED_CHUNK_CAPTURE_LIMIT = 3;
const DEFAULT_MISTRAL_MODEL = 'mistral-large-latest';
const DEFAULT_MISTRAL_FALLBACK_MODEL = 'magistral-small-latest';

const clampPositiveInt = (value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return Math.min(parsed, max);
};

const evaluateCoverageGuardrail = ({
    expectedCheckCount,
    returnedAiChecks,
    syntheticFindingCount,
    failedChunkCount,
    chunkCount,
    minReturnedCheckRate,
    maxSyntheticCheckRate
}) => {
    const safeExpected = Number(expectedCheckCount || 0);
    const safeReturned = Number(returnedAiChecks || 0);
    const safeSynthetic = Number(syntheticFindingCount || 0);
    const safeFailedChunks = Number(failedChunkCount || 0);
    const safeChunkCount = Number(chunkCount || 0);
    const returnedCheckRate = safeExpected > 0 ? (safeReturned / safeExpected) : 1;
    const syntheticCheckRate = safeExpected > 0 ? (safeSynthetic / safeExpected) : 0;
    const allChunksFailed = safeChunkCount > 0 && safeFailedChunks >= safeChunkCount;
    const hasSemanticCoverage = safeReturned > 0;
    const coverageTooLow = safeExpected > 0 && (
        returnedCheckRate < minReturnedCheckRate ||
        syntheticCheckRate > maxSyntheticCheckRate ||
        !hasSemanticCoverage ||
        allChunksFailed
    );
    return {
        returnedCheckRate,
        syntheticCheckRate,
        hasSemanticCoverage,
        allChunksFailed,
        coverageTooLow,
        unrecoverableCoverage: !hasSemanticCoverage
    };
};

const derivePartialRunState = (partialContextInput) => {
    const partialContext = partialContextInput && typeof partialContextInput === 'object'
        ? partialContextInput
        : {};
    const missingAiChecks = Number(partialContext.missing_ai_checks || 0);
    const filteredInvalidChecks = Number(partialContext.filtered_invalid_checks || 0);
    const failedChunkCount = Number(partialContext.failed_chunk_count || 0);
    const syntheticFindingsCount = Number(partialContext.synthetic_findings_count || 0);
    const chunkMissingTotal = Number(partialContext.chunk_missing_total || 0);
    const truncatedResponse = !!partialContext.was_truncated;
    const budgetHit = !!partialContext.budget_hit;
    const partialReason = budgetHit
        ? 'time_budget_exceeded'
        : (truncatedResponse
            ? 'truncated_response'
            : (failedChunkCount > 0
                ? 'chunk_parse_failure'
                : ((syntheticFindingsCount > 0 || chunkMissingTotal > 0 || missingAiChecks > 0)
                    ? 'missing_ai_checks'
                    : (filteredInvalidChecks > 0 ? 'invalid_checks_filtered' : null))));
    const isPartialRun = !!partialReason;
    return {
        partialContext,
        missingAiChecks,
        filteredInvalidChecks,
        failedChunkCount,
        syntheticFindingsCount,
        chunkMissingTotal,
        truncatedResponse,
        budgetHit,
        partialReason,
        isPartialRun,
        runStatus: isPartialRun ? 'success_partial' : 'success'
    };
};

const clampRatio = (value, fallback, min = 0, max = 1) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (operation, timeoutMs, makeTimeoutError) => {
    let timer = null;
    let settled = false;
    return new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (typeof makeTimeoutError === 'function') {
                reject(makeTimeoutError());
                return;
            }
            reject(new Error(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        Promise.resolve()
            .then(() => (typeof operation === 'function' ? operation() : operation))
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(error);
            });
    });
};

const createTimeBudgetExceededError = (message, details = {}) => {
    const err = new Error(message);
    err.code = 'TIME_BUDGET_EXCEEDED';
    err.time_budget_exceeded = true;
    err.details = details;
    return err;
};

const isTimeBudgetExceededError = (error) => {
    if (!error) return false;
    if (error.code === 'TIME_BUDGET_EXCEEDED' || error.time_budget_exceeded === true) return true;
    const message = String(error?.message || '').toLowerCase();
    return message.includes('time_budget_exceeded') || message.includes('analysis budget');
};

const splitModelList = (value) => {
    if (typeof value !== 'string') return [];
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const buildModelCandidates = (primaryModel, fallbackModel, extraFallbacks = '') => {
    const candidates = [];
    const seen = new Set();
    const appendModel = (modelName) => {
        if (!modelName || seen.has(modelName)) return;
        seen.add(modelName);
        candidates.push(modelName);
    };
    appendModel(primaryModel);
    appendModel(fallbackModel);
    splitModelList(extraFallbacks).forEach(appendModel);
    return candidates;
};

const computeChunkBudgetWindow = ({
    remainingBudgetMs,
    minChunkHeadroomMs,
    minChunkRequestTimeoutMs,
    maxChunkRequestTimeoutMs,
    chunkTimeoutSlackMs
}) => {
    const safeRemaining = Number(remainingBudgetMs || 0);
    if (safeRemaining <= 0 || safeRemaining <= minChunkHeadroomMs) {
        return {
            exhausted: true,
            remainingBudgetMs: Math.max(0, safeRemaining),
            requestTimeoutMs: 0
        };
    }

    const timeoutByBudget = safeRemaining - Math.max(0, Number(chunkTimeoutSlackMs || 0));
    if (timeoutByBudget <= 0) {
        return {
            exhausted: true,
            remainingBudgetMs: safeRemaining,
            requestTimeoutMs: 0
        };
    }

    let timeoutMs = Math.max(
        minChunkRequestTimeoutMs,
        Math.min(maxChunkRequestTimeoutMs, timeoutByBudget)
    );
    const hardCeiling = Math.max(1000, safeRemaining - 250);
    timeoutMs = Math.min(timeoutMs, hardCeiling);

    if (timeoutMs <= 0) {
        return {
            exhausted: true,
            remainingBudgetMs: safeRemaining,
            requestTimeoutMs: 0
        };
    }

    return {
        exhausted: false,
        remainingBudgetMs: safeRemaining,
        requestTimeoutMs: timeoutMs
    };
};

const getErrorStatusCode = (error) => {
    const candidate = Number(
        error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        error?.cause?.status ??
        NaN
    );
    return Number.isFinite(candidate) ? candidate : null;
};

const isRetryableMistralError = (error) => {
    if (isTimeBudgetExceededError(error)) return false;
    const statusCode = getErrorStatusCode(error);
    if ([429, 500, 502, 503, 504, 529].includes(statusCode)) return true;
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('overload') ||
        message.includes('temporarily unavailable') ||
        message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('econnreset') ||
        message.includes('socket hang up')
    );
};

const isSchemaLikeError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if (message.startsWith('failed_schema:') || message.includes('invalid json')) {
        return true;
    }
    const parseFailurePatterns = [
        'unterminated string in json',
        'unexpected end of json input',
        'json at position',
        'unexpected token',
        'could not parse json'
    ];
    return parseFailurePatterns.some((pattern) => message.includes(pattern));
};

const classifyParseErrorClass = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    if (!message) return null;
    if (message.includes('unterminated string in json')) return 'unterminated_string';
    if (message.includes('unexpected end of json input')) return 'unexpected_end';
    if (message.includes('unexpected token')) return 'unexpected_token';
    if (message.includes('invalid json')) return 'invalid_json';
    if (message.includes('json at position')) return 'json_position_error';
    if (message.includes('could not parse json')) return 'parse_failure';
    if (message.startsWith('failed_schema:')) return 'failed_schema';
    return null;
};

const chunkArray = (items, chunkSize) => {
    if (!Array.isArray(items) || items.length === 0) return [];
    const size = Math.max(1, chunkSize);
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const getSyntheticSourceText = (manifest) => {
    if (Array.isArray(manifest?.block_map)) {
        for (const block of manifest.block_map) {
            const text = typeof block?.text === 'string' ? block.text : (typeof block?.text_content === 'string' ? block.text_content : '');
            if (text && text.trim().length > 0) {
                return text.replace(/\s+/g, ' ').trim();
            }
        }
    }
    if (typeof manifest?.plain_text === 'string' && manifest.plain_text.trim().length > 0) {
        return manifest.plain_text.replace(/\s+/g, ' ').trim();
    }
    const fallbackHtml = typeof manifest?.content_html === 'string' ? manifest.content_html : (typeof manifest?.content === 'string' ? manifest.content : '');
    if (!fallbackHtml) return '';
    return fallbackHtml
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
};

const buildSyntheticSelector = (manifest) => {
    const source = getSyntheticSourceText(manifest);
    if (!source) {
        return { exact: 'Content unavailable.', prefix: '', suffix: '' };
    }
    const exactStart = source.length > 220 ? 24 : 0;
    const exactLength = Math.min(180, Math.max(48, source.length - exactStart));
    const exact = source.slice(exactStart, exactStart + exactLength).trim() || source.slice(0, Math.min(180, source.length)).trim();
    const prefix = source.slice(Math.max(0, exactStart - 48), exactStart);
    const suffixStart = Math.min(source.length, exactStart + exact.length);
    const suffix = source.slice(suffixStart, Math.min(source.length, suffixStart + 48));
    return { exact, prefix, suffix };
};

const buildSyntheticPartialFinding = (checkId, manifest, reason) => {
    const selector = buildSyntheticSelector(manifest);
    return {
        check_id: checkId,
        verdict: 'partial',
        confidence: 0.01,
        scope: 'block',
        text_quote_selector: selector,
        explanation: 'Analyzer did not complete this check in this run.',
        _synthetic: true,
        _synthetic_reason: reason
    };
};

const buildMistralChunkResponseFormat = () => ({
    type: 'json_schema',
    json_schema: {
        name: MISTRAL_FINDINGS_SCHEMA_NAME,
        strict: true,
        schema: MISTRAL_FINDINGS_RESPONSE_SCHEMA
    }
});

const buildMalformedChunkCaptureEntry = ({
    chunkIndex,
    chunkTag,
    attemptLabel,
    model,
    finishReason,
    parseError,
    rawText
} = {}) => ({
    chunk_index: Number(chunkIndex || 0) + 1,
    chunk_tag: chunkTag || null,
    attempt_label: attemptLabel || null,
    model: model || null,
    finish_reason: finishReason || null,
    parse_error_class: classifyParseErrorClass(parseError) || 'unknown',
    parse_error_message: parseError?.message || 'unknown_error',
    raw_response_length: typeof rawText === 'string' ? rawText.length : 0,
    raw_preview: typeof rawText === 'string' ? rawText.slice(0, 2000) : '',
    raw_response: typeof rawText === 'string' ? rawText.slice(0, 24000) : ''
});

const captureMalformedChunkEntry = (entries, payload, limit = DEFAULT_AI_MALFORMED_CHUNK_CAPTURE_LIMIT) => {
    if (!Array.isArray(entries)) return false;
    const safeLimit = clampPositiveInt(limit, DEFAULT_AI_MALFORMED_CHUNK_CAPTURE_LIMIT, 0, 10);
    if (safeLimit === 0 || entries.length >= safeLimit) {
        return false;
    }
    entries.push(buildMalformedChunkCaptureEntry(payload));
    return true;
};

const normalizeChunkFindings = (findings, chunkCheckIds, manifest, missingReason, options = {}) => {
    const synthesizeMissing = options.synthesizeMissing !== false;
    const expectedSet = new Set(chunkCheckIds);
    const findingsByCheck = new Map();

    findings.forEach((finding) => {
        const checkId = String(finding?.check_id || '').trim();
        if (!expectedSet.has(checkId)) return;
        addNormalizedFindingToMap(findingsByCheck, finding);
    });

    const missingCheckIds = chunkCheckIds.filter((checkId) => !findingsByCheck.has(checkId));
    if (synthesizeMissing) {
        missingCheckIds.forEach((checkId) => {
            findingsByCheck.set(checkId, [buildSyntheticPartialFinding(checkId, manifest, missingReason)]);
        });
    }

    return {
        findings: Array.from(findingsByCheck.values()).flat(),
        missingCheckIds,
        syntheticCount: synthesizeMissing ? missingCheckIds.length : 0
    };
};

const validateFindingsContract = (result) => {
    if (!result || typeof result !== 'object') {
        const err = new Error('failed_schema: Response missing root object');
        err.details = { raw_result_type: typeof result };
        throw err;
    }
    if (!Array.isArray(result.findings)) {
        const err = new Error('failed_schema: Response missing findings array');
        err.details = { raw_result_keys: Object.keys(result || {}) };
        throw err;
    }
    const missingFields = [];
    const warnings = [];
    result.findings.forEach((finding, idx) => {
        if (!finding || typeof finding !== 'object') {
            missingFields.push({ index: idx, reason: 'finding_not_object' });
            return;
        }
        const checkId = typeof finding.check_id === 'string' ? finding.check_id.trim() : '';
        const rawVerdict = typeof finding.verdict === 'string' ? finding.verdict.trim() : '';
        const verdict = normalizeVerdict(rawVerdict, '');
        const scope = typeof finding.scope === 'string' ? finding.scope.trim() : '';
        const explanation = typeof finding.explanation === 'string' ? finding.explanation.trim() : '';
        const structuredExplanationPack = extractStructuredExplanationPackFromFinding(finding);
        if (structuredExplanationPack) {
            finding.explanation_pack = structuredExplanationPack;
        }
        if (!finding.text_quote_selector || typeof finding.text_quote_selector !== 'object') {
            finding.text_quote_selector = {};
        }
        const selector = finding.text_quote_selector;
        if (typeof selector.exact !== 'string' || !selector.exact.trim()) {
            const fallbackExact = typeof finding.snippet === 'string' ? finding.snippet
                : (typeof finding.text === 'string' ? finding.text : '');
            if (fallbackExact) {
                selector.exact = fallbackExact;
            }
        }
        const exact = typeof selector.exact === 'string' ? selector.exact : '';
        if (typeof selector.prefix !== 'string') selector.prefix = '';
        if (typeof selector.suffix !== 'string') selector.suffix = '';
        const prefix = selector.prefix;
        const suffix = selector.suffix;
        const hasObjectPlaceholder = (value) => typeof value === 'string' && value.trim() === '[object Object]';
        if (!checkId) missingFields.push({ index: idx, reason: 'missing_check_id' });
        if (!verdict || !CANONICAL_VERDICTS.includes(verdict)) {
            missingFields.push({ index: idx, reason: 'invalid_verdict' });
        } else {
            finding.verdict = verdict;
        }
        if (!scope || (scope !== 'sentence' && scope !== 'span' && scope !== 'block')) {
            missingFields.push({ index: idx, reason: 'invalid_scope' });
        }
        if (!exact) missingFields.push({ index: idx, reason: 'missing_exact' });
        if (hasObjectPlaceholder(exact) || hasObjectPlaceholder(prefix) || hasObjectPlaceholder(suffix)) {
            missingFields.push({ index: idx, reason: 'invalid_selector_placeholder' });
        }
        if (!prefix || prefix.length < 32) warnings.push({ index: idx, reason: 'prefix_too_short' });
        if (!suffix || suffix.length < 32) warnings.push({ index: idx, reason: 'suffix_too_short' });
        if (verdict !== 'pass' && !explanation) {
            missingFields.push({ index: idx, reason: 'missing_explanation' });
        }
        if (typeof finding.confidence !== 'number' || Number.isNaN(finding.confidence)) {
            missingFields.push({ index: idx, reason: 'missing_confidence' });
        }
    });
    if (warnings.length > 0) {
        result._contract_warnings = warnings.slice(0, 50);
    }
    if (missingFields.length > 0) {
        const err = new Error('failed_schema: Findings contract validation failed');
        err.details = { failures: missingFields.slice(0, 20), total_failures: missingFields.length };
        throw err;
    }
    return result.findings;
};

const buildCheckSkeletons = (definitions, aiEligibleCheckIds = null) => {
    const skeletons = {};
    if (!definitions || !definitions.categories) return skeletons;
    const aiCheckIds = aiEligibleCheckIds instanceof Set
        ? aiEligibleCheckIds
        : getAiEligibleCheckIds(definitions);
    Object.values(definitions.categories).forEach(category => {
        if (!category.checks) return;
        Object.entries(category.checks).forEach(([checkId, checkDef]) => {
            if (!aiCheckIds.has(checkId)) {
                return;
            }
            skeletons[checkId] = {
                verdict: 'fail',
                confidence: 0.0,
                explanation: '',
                ai_explanation_pack: null,
                highlights: [],
                suggestions: [],
                id: checkDef.id || checkId,
                name: checkDef.name || checkId,
                type: checkDef.type || 'semantic'
            };
        });
    });
    return skeletons;
};

const getCheckDefinitionById = (definitions, targetCheckId) => {
    if (!definitions || !definitions.categories || !targetCheckId) return null;
    const normalizedTarget = String(targetCheckId).trim();
    if (!normalizedTarget) return null;
    const categories = definitions.categories;
    for (const category of Object.values(categories)) {
        if (!category || !category.checks) continue;
        if (Object.prototype.hasOwnProperty.call(category.checks, normalizedTarget)) {
            return category.checks[normalizedTarget] || null;
        }
    }
    return null;
};

const buildSemanticFallbackCheck = (checkId, definitions) => {
    const checkDef = getCheckDefinitionById(definitions, checkId) || {};
    const checkName = typeof checkDef.name === 'string' && checkDef.name.trim()
        ? checkDef.name.trim()
        : checkId;
    const explanation = checkId === 'heading_topic_fulfillment'
        ? 'Heading topic fulfillment validation is partial because AI analysis was unavailable for this run.'
        : `Semantic check "${checkName}" is partial because AI analysis was unavailable for this run.`;
    return {
        verdict: 'partial',
        confidence: 0.01,
        explanation,
        highlights: [],
        suggestions: [],
        provenance: 'synthetic',
        synthetic_generated: true,
        synthetic_reason: 'ai_unavailable_fallback',
        diagnostic_only: true,
        non_inline: true,
        non_inline_reason: 'ai_unavailable_fallback',
        id: checkDef.id || checkId,
        name: checkName,
        type: checkDef.type || 'semantic'
    };
};

const findBlockMatch = (blockMap, exact, options = {}) => {
    const normalizedExact = normalizeTelemetryText(exact);
    if (!normalizedExact) return null;
    const preferHeadingOnly = options && options.preferHeadingOnly === true;
    const allowFallbackToAny = options && options.allowFallbackToAny !== false;

    const searchEntries = (entries) => {
        for (const entry of entries) {
            const i = entry.index;
            const block = entry.block;
            if (!block) continue;
            const blockText = normalizeTelemetryText(block.text || block.text_content || '');
            if (!blockText) continue;
            const idx = blockText.indexOf(normalizedExact);
            if (idx !== -1) {
                return {
                    node_ref: block.node_ref || `block-${i}`,
                    signature: block.signature || null,
                    start: idx,
                    end: idx + normalizedExact.length,
                    block_index: i
                };
            }
        }
        return null;
    };

    const indexedBlocks = Array.isArray(blockMap)
        ? blockMap.map((block, index) => ({ block, index }))
        : [];

    if (preferHeadingOnly) {
        const headingEntries = indexedBlocks.filter((entry) => isHeadingLikeBlockType(entry.block?.block_type));
        const headingMatch = searchEntries(headingEntries);
        if (headingMatch) return headingMatch;
        if (!allowFallbackToAny) return null;
    }

    return searchEntries(indexedBlocks);
};

const findAnchorsFromSelector = (blockMap, exact, prefix = '', suffix = '') => {
    const normalizeSelectorText = (value) => {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .normalize('NFKC')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const normalizedExactRaw = normalizeSelectorText(exact);
    const normalizedExact = normalizedExactRaw.toLowerCase();
    if (!normalizedExactRaw) {
        return [];
    }
    const normalizedPrefix = normalizeSelectorText(prefix).toLowerCase();
    const normalizedSuffix = normalizeSelectorText(suffix).toLowerCase();

    const scoreMatch = (before, after) => {
        let score = 1;
        if (normalizedPrefix) {
            if (before.endsWith(normalizedPrefix)) score += 4;
            else if (before.includes(normalizedPrefix)) score += 2;
        }
        if (normalizedSuffix) {
            if (after.startsWith(normalizedSuffix)) score += 4;
            else if (after.includes(normalizedSuffix)) score += 2;
        }
        return score;
    };

    // 1) Prefer strict same-block anchoring.
    let bestSingle = null;
    for (let i = 0; i < blockMap.length; i += 1) {
        const block = blockMap[i];
        if (!block) continue;
        const normalizedBlockRaw = normalizeSelectorText(block.text || block.text_content || '');
        const normalizedBlockText = normalizedBlockRaw.toLowerCase();
        if (!normalizedBlockRaw) continue;
        let idx = normalizedBlockText.indexOf(normalizedExact);
        while (idx !== -1) {
            const before = normalizedBlockText.slice(Math.max(0, idx - Math.min(320, normalizedPrefix.length + 80)), idx);
            const after = normalizedBlockText.slice(idx + normalizedExact.length, idx + normalizedExact.length + Math.min(320, normalizedSuffix.length + 80));
            const score = scoreMatch(before, after);
            const candidate = {
                node_ref: block.node_ref || `block-${i}`,
                signature: block.signature || null,
                start: idx,
                end: idx + normalizedExact.length,
                block_index: i,
                snippet: normalizedBlockRaw.slice(idx, idx + normalizedExact.length),
                strategy: 'selector_single_block',
                score
            };
            if (!bestSingle || candidate.score > bestSingle.score) {
                bestSingle = candidate;
            }
            idx = normalizedBlockText.indexOf(normalizedExact, idx + 1);
        }
    }
    if (bestSingle) {
        return [bestSingle];
    }

    // 2) Cross-block fallback: locate exact in joined normalized blocks and split.
    const blockEntries = [];
    let joined = '';
    let cursor = 0;
    for (let i = 0; i < blockMap.length; i += 1) {
        const block = blockMap[i];
        if (!block) continue;
        const normalizedBlockRaw = normalizeSelectorText(block.text || block.text_content || '');
        const normalizedBlockText = normalizedBlockRaw.toLowerCase();
        if (!normalizedBlockRaw) continue;
        if (joined) {
            joined += ' ';
            cursor += 1;
        }
        const start = cursor;
        joined += normalizedBlockText;
        cursor += normalizedBlockText.length;
        blockEntries.push({
            block,
            block_index: i,
            text: normalizedBlockText,
            text_raw: normalizedBlockRaw,
            global_start: start,
            global_end: cursor
        });
    }
    if (!joined || !blockEntries.length) {
        return [];
    }

    let bestCross = null;
    let globalIdx = joined.indexOf(normalizedExact);
    while (globalIdx !== -1) {
        const before = joined.slice(Math.max(0, globalIdx - Math.min(320, normalizedPrefix.length + 80)), globalIdx);
        const after = joined.slice(globalIdx + normalizedExact.length, globalIdx + normalizedExact.length + Math.min(320, normalizedSuffix.length + 80));
        const score = scoreMatch(before, after);
        const candidate = { global_start: globalIdx, global_end: globalIdx + normalizedExact.length, score };
        if (!bestCross || candidate.score > bestCross.score) {
            bestCross = candidate;
        }
        globalIdx = joined.indexOf(normalizedExact, globalIdx + 1);
    }
    if (!bestCross) {
        return [];
    }

    const recovered = [];
    blockEntries.forEach((entry) => {
        if (entry.global_end <= bestCross.global_start || entry.global_start >= bestCross.global_end) {
            return;
        }
        const localStart = Math.max(0, bestCross.global_start - entry.global_start);
        const localEnd = Math.min(entry.text.length, bestCross.global_end - entry.global_start);
        if (!(localEnd > localStart)) {
            return;
        }
        recovered.push({
            node_ref: entry.block.node_ref || `block-${entry.block_index}`,
            signature: entry.block.signature || null,
            start: localStart,
            end: localEnd,
            block_index: entry.block_index,
            snippet: entry.text_raw.slice(localStart, localEnd),
            strategy: 'selector_cross_block'
        });
    });

    return recovered;
};

const findOrphanHeadingMatch = (blockMap, exact, prefix = '', suffix = '') => {
    const headingExact = coerceOrphanHeadingExact(exact);
    let match = findBlockMatch(blockMap, headingExact, { preferHeadingOnly: true, allowFallbackToAny: false });
    if (match) {
        return { ...match, strategy: 'heading_exact' };
    }

    const selectorAnchors = findAnchorsFromSelector(blockMap, headingExact, prefix, suffix);
    if (selectorAnchors.length > 0) {
        const headingAnchor = selectorAnchors.find((anchor) => {
            const block = Number.isFinite(anchor.block_index) ? blockMap[anchor.block_index] : null;
            return !!block && isHeadingLikeBlockType(block.block_type);
        });
        if (headingAnchor) {
            return {
                node_ref: headingAnchor.node_ref,
                signature: headingAnchor.signature || null,
                start: headingAnchor.start,
                end: headingAnchor.end,
                block_index: headingAnchor.block_index,
                strategy: headingAnchor.strategy || 'heading_selector'
            };
        }
    }

    return findBlockMatch(blockMap, headingExact, { preferHeadingOnly: false, allowFallbackToAny: true });
};

const convertFindingsToChecks = (findings, definitions, manifest, aiEligibleCheckIds = null, options = {}) => {
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const structureGuardrailContext = buildSemanticStructureGuardrailContext(manifest);
    const questionAnchorPayload = options && options.questionAnchorPayload
        ? options.questionAnchorPayload
        : buildQuestionAnchorPayload(manifest);
    const strictQuestionAnchors = Array.isArray(questionAnchorPayload?.anchors) ? questionAnchorPayload.anchors : [];
    const aiCheckIds = aiEligibleCheckIds instanceof Set
        ? aiEligibleCheckIds
        : getAiEligibleCheckIds(definitions);
    const checks = buildCheckSkeletons(definitions, aiCheckIds);
    const telemetryFindings = [];
    const aggregate = {
        total_findings: findings.length,
        ellipsis_count: 0,
        snippet_length_total: 0,
        snippet_tokens_total: 0,
        anchor_success_total: 0,
        fallback_total: 0,
        skipped_non_ai_findings: 0,
        question_anchor_guardrail_adjustments_total: 0,
        question_anchor_guardrail_adjustments_by_check: {},
        question_anchor_guardrail_adjustments_by_reason: {},
        question_anchor_guardrail_fallback_explanations_total: 0,
        question_anchor_guardrail_fallback_explanations_by_check: {},
        semantic_structure_guardrail_adjustments_total: 0,
        semantic_structure_guardrail_adjustments_by_check: {},
        semantic_structure_guardrail_adjustments_by_reason: {},
        semantic_temporal_guardrail_adjustments_total: 0,
        semantic_temporal_guardrail_adjustments_by_check: {},
        semantic_temporal_guardrail_adjustments_by_reason: {}
    };

    findings.forEach((finding, idx) => {
        const checkId = String(finding.check_id || '').trim();
        if (!aiCheckIds.has(checkId)) {
            aggregate.skipped_non_ai_findings += 1;
            log('WARN', 'Dropping non-AI finding from model output', {
                index: idx,
                check_id: checkId || null
            });
            return;
        }
        const rawVerdict = typeof finding.verdict === 'string' ? finding.verdict.trim() : '';
        const sourceVerdict = normalizeVerdict(rawVerdict, 'fail');
        let verdict = sourceVerdict;
        const aiExplanationPack = extractStructuredExplanationPackFromFinding(finding);
        const allowSourceExplanation = sourceVerdict !== 'pass';
        const isSynthetic = finding && finding._synthetic === true;
        let guardrailDecision = isSynthetic
            ? { verdict, adjusted: false, reason: null }
            : evaluateQuestionAnchorGuardrail({
                checkId,
                verdict,
                finding,
                questionAnchorPayload
            });
        const selector = finding.text_quote_selector || {};
        let scope = typeof finding.scope === 'string' ? finding.scope : 'span';
        let exact = typeof selector.exact === 'string' ? selector.exact : '';
        const prefix = typeof selector.prefix === 'string' ? selector.prefix : '';
        const suffix = typeof selector.suffix === 'string' ? selector.suffix : '';
        const isOrphanHeadingsCheck = checkId === ORPHAN_HEADING_CHECK_ID;
        if (isOrphanHeadingsCheck) {
            scope = 'span';
            exact = coerceOrphanHeadingExact(exact);
        }
        if (sentenceScopedChecks.has(checkId)) {
            scope = 'sentence';
            const sentenceExact = extractSentenceFromBlock(blockMap, exact);
            if (sentenceExact) exact = sentenceExact;
        }
        scope = enforceAllowedScope(checkId, scope, cachedRuntimeContract);
        const snippetLength = exact.length;
        const tokenEstimate = estimateTokenCount(exact);
        const ellipsis = hasEllipsis(exact);
        const sourceExplanationNormalized = allowSourceExplanation && typeof finding.explanation === 'string'
            ? String(finding.explanation).trim()
            : '';
        const position = finding.text_position_selector || {};
        const match = isOrphanHeadingsCheck
            ? findOrphanHeadingMatch(blockMap, exact, prefix, suffix)
            : findBlockMatch(blockMap, exact);
        if (!isSynthetic) {
            const structureGuardrailDecision = evaluateSemanticStructureGuardrail({
                checkId,
                verdict: guardrailDecision.verdict,
                finding,
                match,
                structureContext: structureGuardrailContext
            });
            if (structureGuardrailDecision.adjusted) {
                guardrailDecision = structureGuardrailDecision;
            }
            const temporalGuardrailDecision = evaluateTemporalClaimGuardrail({
                checkId,
                verdict: guardrailDecision.verdict,
                finding
            });
            if (temporalGuardrailDecision.adjusted) {
                guardrailDecision = temporalGuardrailDecision;
            }
        }
        verdict = guardrailDecision.verdict;
        const anchorSuccess = !!match;
        const strategy = anchorSuccess ? (match.strategy || 'exact') : 'failed';
        const telemetryItem = {
            check_id: checkId,
            scope,
            snippet_length_chars: snippetLength,
            snippet_tokens_est: tokenEstimate,
            has_ellipsis: ellipsis,
            anchoring_strategy_used: strategy,
            anchor_success: anchorSuccess,
            wrap_errors: false,
            question_anchor_guardrail_applied: guardrailDecision.adjusted && guardrailDecision.kind !== 'semantic_structure' && guardrailDecision.kind !== 'semantic_temporal',
            question_anchor_guardrail_reason: guardrailDecision.kind !== 'semantic_structure' && guardrailDecision.kind !== 'semantic_temporal' ? (guardrailDecision.reason || null) : null,
            semantic_structure_guardrail_applied: guardrailDecision.kind === 'semantic_structure',
            semantic_structure_guardrail_reason: guardrailDecision.kind === 'semantic_structure' ? (guardrailDecision.reason || null) : null,
            semantic_temporal_guardrail_applied: guardrailDecision.kind === 'semantic_temporal',
            semantic_temporal_guardrail_reason: guardrailDecision.kind === 'semantic_temporal' ? (guardrailDecision.reason || null) : null
        };
        telemetryFindings.push(telemetryItem);
        aggregate.snippet_length_total += snippetLength;
        aggregate.snippet_tokens_total += tokenEstimate;
        if (ellipsis) aggregate.ellipsis_count += 1;
        if (anchorSuccess) aggregate.anchor_success_total += 1;
        if (!anchorSuccess) aggregate.fallback_total += 1;
        if (guardrailDecision.adjusted) {
            const guardrailReasonKey = guardrailDecision.reason || 'guardrail';
            if (guardrailDecision.kind === 'semantic_structure') {
                aggregate.semantic_structure_guardrail_adjustments_total += 1;
                aggregate.semantic_structure_guardrail_adjustments_by_check[checkId] =
                    Number(aggregate.semantic_structure_guardrail_adjustments_by_check[checkId] || 0) + 1;
                aggregate.semantic_structure_guardrail_adjustments_by_reason[guardrailReasonKey] =
                    Number(aggregate.semantic_structure_guardrail_adjustments_by_reason[guardrailReasonKey] || 0) + 1;
            } else if (guardrailDecision.kind === 'semantic_temporal') {
                aggregate.semantic_temporal_guardrail_adjustments_total += 1;
                aggregate.semantic_temporal_guardrail_adjustments_by_check[checkId] =
                    Number(aggregate.semantic_temporal_guardrail_adjustments_by_check[checkId] || 0) + 1;
                aggregate.semantic_temporal_guardrail_adjustments_by_reason[guardrailReasonKey] =
                    Number(aggregate.semantic_temporal_guardrail_adjustments_by_reason[guardrailReasonKey] || 0) + 1;
            } else {
                aggregate.question_anchor_guardrail_adjustments_total += 1;
                aggregate.question_anchor_guardrail_adjustments_by_check[checkId] =
                    Number(aggregate.question_anchor_guardrail_adjustments_by_check[checkId] || 0) + 1;
                aggregate.question_anchor_guardrail_adjustments_by_reason[guardrailReasonKey] =
                    Number(aggregate.question_anchor_guardrail_adjustments_by_reason[guardrailReasonKey] || 0) + 1;
                if (sourceExplanationNormalized) {
                    aggregate.question_anchor_guardrail_fallback_explanations_total += 1;
                    aggregate.question_anchor_guardrail_fallback_explanations_by_check[checkId] =
                        Number(aggregate.question_anchor_guardrail_fallback_explanations_by_check[checkId] || 0) + 1;
                }
            }
        }

        if (!checks[checkId]) {
            log('WARN', 'AI finding check_id missing from skeletons', { check_id: checkId });
            checks[checkId] = {
                verdict: verdict,
                confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.8,
                explanation: allowSourceExplanation && typeof finding.explanation === 'string' ? finding.explanation : '',
                ai_explanation_pack: allowSourceExplanation ? (aiExplanationPack || null) : null,
                highlights: [],
                suggestions: [],
                id: checkId,
                name: checkId,
                type: 'semantic'
            };
        }
        const check = checks[checkId];
        const modelExplanation = allowSourceExplanation
            ? (typeof finding.explanation === 'string' ? finding.explanation : check.explanation)
            : '';
        const findingExplanation = guardrailDecision.adjusted
            ? (
                guardrailDecision.kind === 'semantic_structure'
                    ? buildSemanticStructureGuardrailExplanation(checkId, guardrailDecision.reason)
                    : guardrailDecision.kind === 'semantic_temporal'
                        ? buildTemporalClaimGuardrailExplanation(guardrailDecision.reason)
                    : buildQuestionAnchorGuardrailExplanation(checkId, guardrailDecision.reason)
            )
            : modelExplanation;
        const modelExplanationNormalized = String(modelExplanation || '').trim();
        const modelExplanationSummary = modelExplanationNormalized
            ? modelExplanationNormalized.slice(0, 220)
            : '';
        const normalizedConfidence = typeof finding.confidence === 'number' ? finding.confidence : check.confidence;
        const existingInstanceCount = Number(check.instance_count || 0);
        const currentVerdictPriority = existingInstanceCount > 0 ? verdictPriority(check.verdict) : -1;
        const nextVerdictPriority = verdictPriority(verdict);
        const shouldPromoteSummary = existingInstanceCount === 0
            || nextVerdictPriority > currentVerdictPriority
            || (nextVerdictPriority === currentVerdictPriority && normalizedConfidence > Number(check.confidence || 0));

        check.instance_count = existingInstanceCount + 1;
        if (shouldPromoteSummary) {
            check.verdict = verdict;
            check.confidence = normalizedConfidence;
            check.explanation = findingExplanation;
            check.ai_explanation_pack = (!guardrailDecision.adjusted && allowSourceExplanation) ? (aiExplanationPack || null) : null;
            if (!guardrailDecision.adjusted && !isSynthetic && isOrphanHeadingsCheck) {
                const shouldRewriteOrphanExplanation = looksAggregateOrphanExplanation(check.explanation);
                if (shouldRewriteOrphanExplanation) {
                    check.explanation = buildOrphanHeadingInstanceExplanation(exact, check.explanation);
                }
            }
            if (guardrailDecision.adjusted) {
                check.guardrail_adjusted = true;
                check.guardrail_reason = guardrailDecision.reason || 'question_anchor_guardrail';
                check.guardrail_kind = guardrailDecision.kind || 'question_anchor';
                check.guardrail_source_verdict = sourceVerdict;
                check.guardrail_source_confidence = normalizedConfidence;
                check.guardrail_source_explanation = allowSourceExplanation ? (modelExplanationSummary || null) : null;
            } else {
                delete check.guardrail_adjusted;
                delete check.guardrail_reason;
                delete check.guardrail_kind;
                delete check.guardrail_source_verdict;
                delete check.guardrail_source_confidence;
                delete check.guardrail_source_explanation;
            }
        }

        if (isSynthetic) {
            check.provenance = 'synthetic';
            check.synthetic_generated = true;
            check.synthetic_reason = finding._synthetic_reason || 'synthetic_fallback';
            check.diagnostic_only = true;
            check.non_inline = true;
            check.non_inline_reason = 'synthetic_fallback';
        }

        if (!isSynthetic && (verdict === 'fail' || verdict === 'partial')) {
            const candidateExplanation = guardrailDecision.adjusted
                ? findingExplanation
                : modelExplanation;
            const candidateMessage = isOrphanHeadingsCheck
                ? buildOrphanHeadingInstanceExplanation(exact, candidateExplanation)
                : candidateExplanation;
            const candidate = {
                scope,
                snippet: exact,
                quote: { exact, prefix, suffix },
                message: candidateMessage
            };
            if (aiExplanationPack) {
                candidate.explanation_pack = aiExplanationPack;
            }
            if (match) {
                candidate.node_ref = match.node_ref;
                if (match.signature) candidate.signature = match.signature;
                candidate.start = match.start;
                candidate.end = match.end;
                if (match.strategy) candidate.strategy = match.strategy;
            } else if (Number.isFinite(position.start) && Number.isFinite(position.end)) {
                candidate.start = position.start;
                candidate.end = position.end;
                if (isOrphanHeadingsCheck) {
                    check.non_inline_reason = 'orphan_heading_no_anchor';
                }
            } else if (isOrphanHeadingsCheck) {
                check.non_inline_reason = 'orphan_heading_no_anchor';
            }
            if (!Array.isArray(check.candidate_highlights)) check.candidate_highlights = [];
            candidate.instance_index = check.candidate_highlights.length;
            check.candidate_highlights.push(candidate);
        }
    });

    const ellipsisRate = findings.length > 0 ? Number((aggregate.ellipsis_count / findings.length).toFixed(4)) : 0;
    const avgSnippetLength = findings.length > 0 ? Number((aggregate.snippet_length_total / findings.length).toFixed(2)) : 0;
    const anchorSuccessRate = findings.length > 0 ? Number((aggregate.anchor_success_total / findings.length).toFixed(4)) : 0;
    const fallbackRate = findings.length > 0 ? Number((aggregate.fallback_total / findings.length).toFixed(4)) : 0;

    return {
        checks,
        telemetry: {
            findings: telemetryFindings,
            aggregate: {
                ellipsis_rate: ellipsisRate,
                avg_snippet_length: avgSnippetLength,
                anchor_success_rate: anchorSuccessRate,
                fallback_rate: fallbackRate,
                skipped_non_ai_findings: aggregate.skipped_non_ai_findings,
                question_anchor_count: strictQuestionAnchors.length,
                question_anchor_guardrail_adjustments_total: aggregate.question_anchor_guardrail_adjustments_total,
                question_anchor_guardrail_adjustments_by_check: aggregate.question_anchor_guardrail_adjustments_by_check,
                question_anchor_guardrail_adjustments_by_reason: aggregate.question_anchor_guardrail_adjustments_by_reason,
                question_anchor_guardrail_fallback_explanations_total: aggregate.question_anchor_guardrail_fallback_explanations_total,
                question_anchor_guardrail_fallback_explanations_by_check: aggregate.question_anchor_guardrail_fallback_explanations_by_check,
                semantic_structure_guardrail_adjustments_total: aggregate.semantic_structure_guardrail_adjustments_total,
                semantic_structure_guardrail_adjustments_by_check: aggregate.semantic_structure_guardrail_adjustments_by_check,
                semantic_structure_guardrail_adjustments_by_reason: aggregate.semantic_structure_guardrail_adjustments_by_reason,
                semantic_temporal_guardrail_adjustments_total: aggregate.semantic_temporal_guardrail_adjustments_total,
                semantic_temporal_guardrail_adjustments_by_check: aggregate.semantic_temporal_guardrail_adjustments_by_check,
                semantic_temporal_guardrail_adjustments_by_reason: aggregate.semantic_temporal_guardrail_adjustments_by_reason
            },
            question_anchor_guardrail: {
                strict_mode: true,
                question_anchor_count: strictQuestionAnchors.length,
                adjustments_total: aggregate.question_anchor_guardrail_adjustments_total,
                adjustments_by_check: aggregate.question_anchor_guardrail_adjustments_by_check,
                adjustments_by_reason: aggregate.question_anchor_guardrail_adjustments_by_reason,
                fallback_explanations_total: aggregate.question_anchor_guardrail_fallback_explanations_total,
                fallback_explanations_by_check: aggregate.question_anchor_guardrail_fallback_explanations_by_check
            },
            semantic_structure_guardrail: {
                adjustments_total: aggregate.semantic_structure_guardrail_adjustments_total,
                adjustments_by_check: aggregate.semantic_structure_guardrail_adjustments_by_check,
                adjustments_by_reason: aggregate.semantic_structure_guardrail_adjustments_by_reason
            },
            semantic_temporal_guardrail: {
                adjustments_total: aggregate.semantic_temporal_guardrail_adjustments_total,
                adjustments_by_check: aggregate.semantic_temporal_guardrail_adjustments_by_check,
                adjustments_by_reason: aggregate.semantic_temporal_guardrail_adjustments_by_reason
            }
        }
    };
};

/**
 * Load Checks Definitions and Prompt Template
 */
const loadAssets = () => {
    if (cachedDefinitions && cachedPromptTemplate && cachedScoringConfig !== undefined) return;

    try {
        // Load definitions
        const defPath = resolveDefinitionsPath();
        cachedDefinitions = readJsonFile(defPath);

        const runtimeContractPath = resolveRuntimeContractPath();
        if (runtimeContractPath) {
            cachedRuntimeContract = readJsonFile(runtimeContractPath);
        } else {
            cachedRuntimeContract = null;
            log('WARN', 'Runtime contract not found; falling back to check type inference');
        }

        // Load prompt template
        const promptPath = path.join(__dirname, 'prompts', 'analysis-system-v1.txt');
        cachedPromptTemplate = fs.readFileSync(promptPath, 'utf8');

        // Remove the Input Content section as we construct it dynamically
        cachedPromptTemplate = cachedPromptTemplate.replace(/## 5\. Input Content[\s\S]*$/, '').trim();
        assertPromptTemplateTokens(cachedPromptTemplate);

        const scoringPath = resolveScoringConfigPath();
        if (scoringPath) {
            try {
                cachedScoringConfig = readJsonFile(scoringPath);
            } catch (scoringError) {
                cachedScoringConfig = null;
                log('WARN', 'Failed to load scoring config; using fallback scoring', {
                    error: scoringError.message
                });
            }
        } else {
            cachedScoringConfig = null;
            log('WARN', 'Scoring config not found; using fallback scoring');
        }

    } catch (error) {
        log('ERROR', 'Failed to load assets', { error: error.message });
        throw error;
    }
};

// Helper to get Mistral API key from secret
// Helper to get Mistral API key from secret
const getMistralApiKey = async () => {
    const secretName = getEnv('SECRET_NAME', 'AVI_MISTRAL_API_KEY');
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);

    try {
        const secret = JSON.parse(response.SecretString);
        console.log("DEBUG_SECRET_KEYS: " + JSON.stringify(Object.keys(secret))); // Force plain stdout log

        const apiKey = secret.MISTRAL_API_KEY;
        if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
            console.log("DEBUG_MISTRAL_KEY_MISSING: Key MISTRAL_API_KEY not found. Available: " + Object.keys(secret).join(','));
            throw new Error(`MISTRAL_API_KEY not found or invalid. Available keys: ${Object.keys(secret).join(', ')}`);
        }
        return apiKey;
    } catch (e) {
        console.log("DEBUG_SECRET_PARSE_ERROR: " + e.message);
        throw e;
    }
};

/**
 * Atomically transition run from queued → running
 * Returns true if transition succeeded, false if already running/success
 */
const atomicTransitionToRunning = async (runId) => {
    const now = new Date().toISOString();

    try {
        await ddbDoc.send(new UpdateCommand({
            TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
            Key: { run_id: runId },
            UpdateExpression: 'SET #status = :running, started_at = :started_at, updated_at = :updated_at',
            ConditionExpression: '#status = :queued',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':running': 'running',
                ':queued': 'queued',
                ':started_at': now,
                ':updated_at': now
            }
        }));

        log('INFO', 'Atomically transitioned to running', { run_id: runId });
        return true;

    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            log('INFO', 'Run already processed or running', { run_id: runId });
            return false;
        }
        throw error;
    }
};

/**
 * Update run status in DynamoDB
 */
const updateRunStatus = async (runId, status, additionalFields = {}) => {
    const now = new Date().toISOString();

    const updateExpressions = ['#status = :status', 'updated_at = :updated_at'];
    const expressionAttributeValues = {
        ':status': status,
        ':updated_at': now,
        ':success': 'success'
    };
    const expressionAttributeNames = { '#status': 'status' };

    Object.entries(additionalFields).forEach(([key, value]) => {
        const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
        const nameToken = `#f_${safeKey}`;
        const valueToken = `:f_${safeKey}`;
        expressionAttributeNames[nameToken] = key;
        updateExpressions.push(`${nameToken} = ${valueToken}`);
        expressionAttributeValues[valueToken] = value;
    });

    await ddbDoc.send(new UpdateCommand({
        TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
        Key: { run_id: runId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ConditionExpression: '#status <> :success',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));

    log('INFO', 'Updated run status', { run_id: runId, status });
};

const getRunRecord = async (runId) => {
    const response = await ddbDoc.send(new GetCommand({
        TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
        Key: { run_id: runId }
    }));
    return response?.Item || null;
};

const normalizeCreditReservation = (candidate = {}, fallbackSiteId = '') => {
    if (!candidate || typeof candidate !== 'object') return null;
    const accountId = String(candidate.account_id || candidate.accountId || '').trim();
    if (!accountId) return null;
    return {
        reservation_status: String(candidate.reservation_status || candidate.reservationStatus || '').trim() || 'reserved',
        event_id: String(candidate.event_id || candidate.eventId || '').trim(),
        idempotency_key: String(candidate.idempotency_key || candidate.idempotencyKey || '').trim(),
        account_id: accountId,
        site_id: String(candidate.site_id || candidate.siteId || fallbackSiteId || '').trim(),
        reserved_credits: normalizeNonNegativeInt(candidate.reserved_credits ?? candidate.reservedCredits),
        balance_before: normalizeNullableInt(candidate.balance_before ?? candidate.balanceBefore),
        balance_after: normalizeNullableInt(candidate.balance_after ?? candidate.balanceAfter),
        token_estimate: normalizeNonNegativeInt(candidate.token_estimate ?? candidate.tokenEstimate),
        pricing_snapshot: candidate.pricing_snapshot && typeof candidate.pricing_snapshot === 'object'
            ? candidate.pricing_snapshot
            : (candidate.pricingSnapshot && typeof candidate.pricingSnapshot === 'object' ? candidate.pricingSnapshot : null),
        created_at: String(candidate.created_at || candidate.createdAt || '').trim()
    };
};

const MAX_FINDINGS_PER_CHECK = 3;

const getFindingDedupKey = (finding) => {
    const checkId = String(finding?.check_id || '').trim();
    const verdict = normalizeVerdict(finding?.verdict, 'fail');
    const scope = typeof finding?.scope === 'string' ? finding.scope.trim() : 'span';
    const selector = finding?.text_quote_selector && typeof finding.text_quote_selector === 'object'
        ? finding.text_quote_selector
        : {};
    const exact = String(selector.exact || finding?.snippet || finding?.text || '').trim().toLowerCase();
    return `${checkId}::${verdict}::${scope}::${exact}`;
};

const addNormalizedFindingToMap = (findingsByCheck, finding) => {
    const checkId = String(finding?.check_id || '').trim();
    if (!checkId) return;
    const existing = Array.isArray(findingsByCheck.get(checkId))
        ? findingsByCheck.get(checkId)
        : [];
    const verdict = normalizeVerdict(finding?.verdict, 'fail');
    const isPassingFinding = verdict === 'pass';
    const hasNonPassFinding = existing.some((item) => normalizeVerdict(item?.verdict, 'fail') !== 'pass');
    const nextDedupKey = getFindingDedupKey(finding);

    if (existing.some((item) => getFindingDedupKey(item) === nextDedupKey)) {
        return;
    }

    if (isPassingFinding) {
        if (hasNonPassFinding || existing.length > 0) {
            return;
        }
        findingsByCheck.set(checkId, [finding]);
        return;
    }

    const nonPassOnly = existing.filter((item) => normalizeVerdict(item?.verdict, 'fail') !== 'pass');
    if (nonPassOnly.length >= MAX_FINDINGS_PER_CHECK) {
        findingsByCheck.set(checkId, nonPassOnly);
        return;
    }
    findingsByCheck.set(checkId, [...nonPassOnly, finding]);
};

const verdictPriority = (verdict) => {
    const normalized = normalizeVerdict(verdict, 'fail');
    if (normalized === 'fail') return 3;
    if (normalized === 'partial') return 2;
    return 1;
};

const finalizeCreditSettlement = async ({
    runId,
    siteId,
    finalStatus,
    reservation,
    usage,
    model,
    reasonCode
} = {}) => {
    const normalizedReservation = normalizeCreditReservation(reservation, siteId);
    if (!normalizedReservation || normalizedReservation.reservation_status !== 'reserved') {
        return null;
    }

    const reservationBalanceBefore = normalizedReservation.balance_before;
    const reservationBalanceAfter = normalizedReservation.balance_after;
    const reservedCredits = normalizedReservation.reserved_credits;

    if (['failed', 'failed_schema', 'failed_too_long', 'aborted'].includes(finalStatus)) {
        const refundEvent = await persistLedgerEvent(createRefundEvent({
            account_id: normalizedReservation.account_id,
            site_id: normalizedReservation.site_id || siteId || 'unknown',
            run_id: runId,
            reason_code: reasonCode || 'analysis_failed',
            external_ref: finalStatus,
            pricing_snapshot: normalizedReservation.pricing_snapshot || {},
            amounts: {
                reserved_credits: reservedCredits,
                refunded_credits: reservedCredits,
                balance_before: reservationBalanceAfter,
                balance_after: reservationBalanceBefore
            }
        }));

        try {
            const accountStateStore = createAccountBillingStateStore();
            const existingState = await accountStateStore.getAccountState(normalizedReservation.account_id);
            if (existingState) {
                await accountStateStore.putAccountState(applyLedgerEventToState(existingState, refundEvent));
            }
        } catch (error) {
            log('WARN', 'Failed to apply refund to authoritative billing state', {
                account_id: normalizedReservation.account_id,
                run_id: runId,
                error: error.message
            });
        }

        return {
            billing_status: 'refunded',
            credits_used: 0,
            reserved_credits: reservedCredits,
            refunded_credits: reservedCredits,
            previous_balance: refundEvent.amounts.balance_before,
            current_balance: refundEvent.amounts.balance_after
        };
    }

    const preview = buildUsageSettlementPreview({
        model: model || normalizedReservation.pricing_snapshot?.requested_model || normalizedReservation.pricing_snapshot?.billable_model || getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
        usage: usage || { input_tokens: 0, output_tokens: 0 },
        creditMultiplier: normalizedReservation.pricing_snapshot?.credit_multiplier
    });
    const settledCredits = preview.usage_snapshot.credits_used;
    const refundedCredits = Math.max(reservedCredits - settledCredits, 0);
    const balanceAfter = reservationBalanceBefore === null
        ? null
        : Math.max(reservationBalanceBefore - settledCredits, 0);

    const settlementEvent = await persistLedgerEvent(createSettlementEvent({
        account_id: normalizedReservation.account_id,
        site_id: normalizedReservation.site_id || siteId || 'unknown',
        run_id: runId,
        reason_code: reasonCode || (finalStatus === 'success_partial' ? 'analysis_completed_partial' : 'analysis_completed'),
        external_ref: finalStatus,
        pricing_snapshot: preview.pricing_snapshot,
        usage_snapshot: preview.usage_snapshot,
        amounts: {
            reserved_credits: reservedCredits,
            settled_credits: settledCredits,
            refunded_credits: refundedCredits,
            balance_before: reservationBalanceBefore,
            balance_after: balanceAfter
        }
    }));

    try {
        const accountStateStore = createAccountBillingStateStore();
        const existingState = await accountStateStore.getAccountState(normalizedReservation.account_id);
        if (existingState) {
            await accountStateStore.putAccountState(applyLedgerEventToState(existingState, settlementEvent));
        }
    } catch (error) {
        log('WARN', 'Failed to apply settlement to authoritative billing state', {
            account_id: normalizedReservation.account_id,
            run_id: runId,
            error: error.message
        });
    }

    return {
        billing_status: settledCredits === 0 && refundedCredits > 0 ? 'zero_charge' : 'settled',
        credits_used: settledCredits,
        reserved_credits: reservedCredits,
        refunded_credits: refundedCredits,
        previous_balance: settlementEvent.amounts.balance_before,
        current_balance: settlementEvent.amounts.balance_after,
        billable_model: settlementEvent.pricing_snapshot.billable_model || null
    };
};

/**
 * Download manifest from S3
 */
const downloadManifest = async (manifestS3Key) => {
    let bucket, key;
    if (manifestS3Key.startsWith('s3://')) {
        const parts = manifestS3Key.replace('s3://', '').split('/');
        bucket = parts[0];
        key = parts.slice(1).join('/');
    } else {
        bucket = getEnv('ARTIFACTS_BUCKET', 'aivi-artifacts-aivi-dev');
        key = manifestS3Key;
    }

    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body.transformToString();
    return JSON.parse(body);
};

/**
 * Store result to S3 and return presigned URL
 */
const storeResult = async (runId, result, filename = 'aggregator.json') => {
    const bucket = getEnv('ARTIFACTS_BUCKET', 'aivi-artifacts-aivi-dev');
    const key = `runs/${runId}/${filename}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(result, null, 2),
        ContentType: 'application/json'
    }));

    const presignedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: bucket,
        Key: key
    }), { expiresIn: 3600 });

    return {
        s3Uri: `s3://${bucket}/${key}`,
        presignedUrl: presignedUrl
    };
};

/**
 * Robust JSON extraction
 */
const extractJsonFromResponse = (text) => {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        const candidate = findFirstCompleteJson(cleaned);
        if (candidate) {
            try {
                return JSON.parse(candidate);
            } catch (e2) {
                const first = cleaned.indexOf('{');
                const last = cleaned.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                    const fallbackCandidate = cleaned.substring(first, last + 1);
                    return JSON.parse(fallbackCandidate);
                }
                throw e;
            }
        }
        throw e;
    }
};

const findFirstCompleteJson = (text) => {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (start === -1) {
            if (ch === '{') {
                start = i;
                depth = 1;
            }
            continue;
        }
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        if (depth === 0) {
            return text.substring(start, i + 1);
        }
    }
    return null;
};

const findMatchingBrace = (text, start) => {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        if (depth === 0) {
            return i;
        }
    }
    return -1;
};

const parseJsonStringAt = (text, start) => {
    let i = start + 1;
    let value = '';
    let escape = false;
    for (; i < text.length; i++) {
        const ch = text[i];
        if (escape) {
            value += ch;
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            value += ch;
            continue;
        }
        if (ch === '"') {
            return { value, end: i };
        }
        value += ch;
    }
    return null;
};

const extractObjectForKey = (text, key) => {
    const idx = text.indexOf(`"${key}"`);
    if (idx === -1) return null;
    const start = text.indexOf('{', idx);
    if (start === -1) return null;
    const end = findMatchingBrace(text, start);
    if (end === -1) return null;
    return text.substring(start, end + 1);
};

const extractChecksObject = (text) => {
    const idx = text.indexOf('"checks"');
    if (idx === -1) return {};
    const start = text.indexOf('{', idx);
    if (start === -1) return {};
    const checks = {};
    let i = start + 1;
    while (i < text.length) {
        while (i < text.length && /[\s,]/.test(text[i])) i += 1;
        if (i >= text.length || text[i] === '}') break;
        if (text[i] !== '"') break;
        const keyInfo = parseJsonStringAt(text, i);
        if (!keyInfo) break;
        const key = keyInfo.value;
        i = keyInfo.end + 1;
        while (i < text.length && /\s/.test(text[i])) i += 1;
        if (text[i] !== ':') break;
        i += 1;
        while (i < text.length && /\s/.test(text[i])) i += 1;
        if (text[i] !== '{') break;
        const end = findMatchingBrace(text, i);
        if (end === -1) break;
        const valueText = text.substring(i, end + 1);
        try {
            checks[key] = JSON.parse(valueText);
        } catch (e) { }
        i = end + 1;
    }
    return checks;
};

const extractPartialResult = (text, manifest) => {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const checks = extractChecksObject(cleaned);
    if (!checks || Object.keys(checks).length === 0) return null;
    let classification = null;
    const classificationText = extractObjectForKey(cleaned, 'classification');
    if (classificationText) {
        try {
            classification = JSON.parse(classificationText);
        } catch (e) { }
    }
    if (!classification || typeof classification !== 'object') {
        classification = {
            primary_type: manifest?.content_type || manifest?.classification?.primary_type || 'article',
            confidence: 0.01
        };
    }
    return { classification, checks };
};

const sanitizeSelectorField = (value) => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!normalized || normalized === '[object Object]') return '';
    return normalized;
};

const pickFirstText = (...values) => {
    for (const value of values) {
        if (typeof value === 'string') {
            const normalized = value.trim();
            if (normalized && normalized !== '[object Object]') {
                return normalized;
            }
        }
    }
    return '';
};

const coerceLegacyCheckToFinding = (checkId, checkData, manifest) => {
    const normalizedCheckId = typeof checkId === 'string' ? checkId.trim() : '';
    if (!normalizedCheckId || !checkData || typeof checkData !== 'object') return null;

    const highlight = (Array.isArray(checkData.highlights) && checkData.highlights[0] && typeof checkData.highlights[0] === 'object')
        ? checkData.highlights[0]
        : ((Array.isArray(checkData.candidate_highlights) && checkData.candidate_highlights[0] && typeof checkData.candidate_highlights[0] === 'object')
            ? checkData.candidate_highlights[0]
            : {});
    const highlightSelector = highlight.text_quote_selector && typeof highlight.text_quote_selector === 'object'
        ? highlight.text_quote_selector
        : (highlight.quote && typeof highlight.quote === 'object'
            ? highlight.quote
            : {});
    const fallbackSelector = buildSyntheticSelector(manifest);
    const exact = pickFirstText(
        sanitizeSelectorField(highlightSelector.exact),
        pickFirstText(highlight.snippet, highlight.text, checkData.snippet, checkData.text),
        sanitizeSelectorField(fallbackSelector.exact)
    );
    if (!exact) return null;
    const selector = {
        exact,
        prefix: pickFirstText(
            sanitizeSelectorField(highlightSelector.prefix),
            sanitizeSelectorField(fallbackSelector.prefix)
        ),
        suffix: pickFirstText(
            sanitizeSelectorField(highlightSelector.suffix),
            sanitizeSelectorField(fallbackSelector.suffix)
        )
    };

    const scopeCandidate = String(highlight.scope || checkData.scope || 'block').toLowerCase().trim();
    const scope = scopeCandidate === 'sentence' || scopeCandidate === 'span' || scopeCandidate === 'block'
        ? scopeCandidate
        : 'block';
    const confidenceNumber = Number(checkData.confidence);
    const confidence = Number.isFinite(confidenceNumber)
        ? Math.max(0, Math.min(1, confidenceNumber))
        : 0.45;
    const verdict = normalizeVerdict(checkData.verdict, 'partial');
    const explanation = pickFirstText(
        checkData.explanation,
        highlight.message,
        checkData.reason
    ) || `Recovered partial output for ${normalizedCheckId}.`;

    return {
        check_id: normalizedCheckId,
        verdict,
        confidence,
        scope,
        text_quote_selector: selector,
        explanation,
        _recovered_partial: true
    };
};

const extractPartialFindingsFromRaw = (text, manifest) => {
    const partial = extractPartialResult(text, manifest);
    if (!partial || !partial.checks || typeof partial.checks !== 'object') {
        return [];
    }
    return Object.entries(partial.checks)
        .map(([checkId, checkData]) => coerceLegacyCheckToFinding(checkId, checkData, manifest))
        .filter(Boolean);
};

const callMistralChunked = async (manifest, promptVersion, runId, options = {}) => {
    loadAssets();
    ensureManifestPreflightStructure(manifest, options.runMetadata || {}, {
        contentHtml: typeof manifest?.content_html === 'string' ? manifest.content_html : ''
    });

    const apiKey = await getMistralApiKey();
    if (!apiKey || apiKey.length < 8) {
        throw new Error('API key not properly loaded from secret');
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://api.mistral.ai/v1"
    });
    const primaryModel = getEnv('MISTRAL_MODEL', DEFAULT_MISTRAL_MODEL);
    const fallbackModel = getEnv('MISTRAL_FALLBACK_MODEL', DEFAULT_MISTRAL_FALLBACK_MODEL);
    const extraFallbackModels = getEnv('MISTRAL_FALLBACK_MODELS', '');
    const modelCandidates = buildModelCandidates(primaryModel, fallbackModel, extraFallbackModels);
    const modelsUsed = new Set();
    const featureFlags = options && options.featureFlags ? options.featureFlags : {};
    const compactPromptEnabled = parseBooleanFlag(featureFlags.compact_prompt_enabled);
    log('INFO', 'Configured model candidates', {
        run_id: runId,
        primary_model: primaryModel,
        fallback_model: fallbackModel,
        extra_fallback_models: extraFallbackModels,
        model_candidates: modelCandidates
    });

    const aiEligibleCheckIds = getAiEligibleCheckIds(cachedDefinitions, cachedRuntimeContract);
    const flatDefs = flattenDefinitionsForPrompt(cachedDefinitions, aiEligibleCheckIds);
    const allAiCheckIds = Object.keys(flatDefs);
    const questionAnchorPayload = buildQuestionAnchorPayload(manifest);
    const questionAnchorsJson = JSON.stringify(questionAnchorPayload, null, 2);
    log('INFO', 'Resolved AI check scope for analyzer call', {
        run_id: runId,
        ai_check_count: allAiCheckIds.length,
        ai_check_ids: allAiCheckIds,
        question_anchor_count: questionAnchorPayload.anchor_count || 0,
        section_intent_cue_count: questionAnchorPayload.section_intent_cue_count || 0,
        runtime_contract_loaded: !!cachedRuntimeContract,
        runtime_contract_version: cachedRuntimeContract?.version || null
    });
    const chunkSize = clampPositiveInt(
        getEnv('AI_CHECK_CHUNK_SIZE', compactPromptEnabled ? DEFAULT_AI_COMPACT_CHUNK_SIZE : DEFAULT_AI_CHUNK_SIZE),
        compactPromptEnabled ? DEFAULT_AI_COMPACT_CHUNK_SIZE : DEFAULT_AI_CHUNK_SIZE,
        1,
        25
    );
    const chunkMaxTokens = clampPositiveInt(
        getEnv('AI_CHUNK_MAX_TOKENS', compactPromptEnabled ? DEFAULT_AI_COMPACT_CHUNK_MAX_TOKENS : DEFAULT_AI_CHUNK_MAX_TOKENS),
        compactPromptEnabled ? DEFAULT_AI_COMPACT_CHUNK_MAX_TOKENS : DEFAULT_AI_CHUNK_MAX_TOKENS,
        256,
        8000
    );
    const chunkRetryMaxTokens = clampPositiveInt(
        getEnv('AI_CHUNK_RETRY_MAX_TOKENS', compactPromptEnabled ? DEFAULT_AI_COMPACT_CHUNK_RETRY_MAX_TOKENS : DEFAULT_AI_CHUNK_RETRY_MAX_TOKENS),
        Math.max(
            chunkMaxTokens,
            compactPromptEnabled ? DEFAULT_AI_COMPACT_CHUNK_RETRY_MAX_TOKENS : DEFAULT_AI_CHUNK_RETRY_MAX_TOKENS
        ),
        chunkMaxTokens,
        8000
    );
    const chunkRequestMaxAttempts = clampPositiveInt(
        getEnv('AI_CHUNK_REQUEST_MAX_ATTEMPTS', DEFAULT_AI_CHUNK_REQUEST_MAX_ATTEMPTS),
        DEFAULT_AI_CHUNK_REQUEST_MAX_ATTEMPTS,
        1,
        6
    );
    const chunkRetryBaseDelayMs = clampPositiveInt(
        getEnv('AI_CHUNK_RETRY_BASE_DELAY_MS', DEFAULT_AI_CHUNK_RETRY_BASE_DELAY_MS),
        DEFAULT_AI_CHUNK_RETRY_BASE_DELAY_MS,
        100,
        10000
    );
    const malformedChunkCaptureLimit = clampPositiveInt(
        getEnv('AI_MALFORMED_CHUNK_CAPTURE_LIMIT', DEFAULT_AI_MALFORMED_CHUNK_CAPTURE_LIMIT),
        DEFAULT_AI_MALFORMED_CHUNK_CAPTURE_LIMIT,
        0,
        10
    );
    const configuredMaxAnalysisLatencyMs = clampPositiveInt(
        getEnv('AI_MAX_ANALYSIS_LATENCY_MS', DEFAULT_AI_MAX_ANALYSIS_LATENCY_MS),
        DEFAULT_AI_MAX_ANALYSIS_LATENCY_MS,
        30000,
        600000
    );
    const completionFirstEnabled = parseBooleanFlag(
        getEnv('AI_COMPLETION_FIRST_ENABLED', String(DEFAULT_AI_COMPLETION_FIRST_ENABLED))
    );
    const lambdaReserveMs = clampPositiveInt(
        getEnv('AI_LAMBDA_RESERVE_MS', DEFAULT_AI_LAMBDA_RESERVE_MS),
        DEFAULT_AI_LAMBDA_RESERVE_MS,
        5000,
        120000
    );
    const lambdaRemainingTimeMs = Number.isFinite(Number(options?.lambdaRemainingTimeMs))
        ? Math.floor(Number(options.lambdaRemainingTimeMs))
        : null;
    const lambdaSafeBudgetMs = Number.isFinite(lambdaRemainingTimeMs)
        ? Math.max(30000, Math.min(600000, lambdaRemainingTimeMs - lambdaReserveMs))
        : null;
    let maxAnalysisLatencyMs = configuredMaxAnalysisLatencyMs;
    if (Number.isFinite(lambdaSafeBudgetMs)) {
        maxAnalysisLatencyMs = completionFirstEnabled
            ? lambdaSafeBudgetMs
            : Math.min(configuredMaxAnalysisLatencyMs, lambdaSafeBudgetMs);
    }
    const softAnalysisTargetMs = clampPositiveInt(
        getEnv('AI_SOFT_ANALYSIS_TARGET_MS', DEFAULT_AI_SOFT_ANALYSIS_TARGET_MS),
        DEFAULT_AI_SOFT_ANALYSIS_TARGET_MS,
        30000,
        maxAnalysisLatencyMs
    );
    const minChunkHeadroomMs = clampPositiveInt(
        getEnv('AI_CHUNK_MIN_HEADROOM_MS', 12000),
        12000,
        2000,
        120000
    );
    const minChunkRequestTimeoutMs = clampPositiveInt(
        getEnv('AI_CHUNK_MIN_REQUEST_TIMEOUT_MS', 12000),
        12000,
        2000,
        60000
    );
    const maxChunkRequestTimeoutMs = clampPositiveInt(
        getEnv('AI_CHUNK_MAX_REQUEST_TIMEOUT_MS', 45000),
        45000,
        minChunkRequestTimeoutMs,
        120000
    );
    const chunkTimeoutSlackMs = clampPositiveInt(
        getEnv('AI_CHUNK_TIMEOUT_SLACK_MS', 3000),
        3000,
        0,
        15000
    );
    const minReturnedCheckRate = clampRatio(
        getEnv('AI_MIN_RETURNED_CHECK_RATE', DEFAULT_AI_MIN_RETURNED_CHECK_RATE),
        DEFAULT_AI_MIN_RETURNED_CHECK_RATE,
        0,
        1
    );
    const maxSyntheticCheckRate = clampRatio(
        getEnv('AI_MAX_SYNTHETIC_CHECK_RATE', DEFAULT_AI_MAX_SYNTHETIC_CHECK_RATE),
        DEFAULT_AI_MAX_SYNTHETIC_CHECK_RATE,
        0,
        1
    );
    log('INFO', 'Resolved analyzer runtime config', {
        run_id: runId,
        primary_model: primaryModel,
        fallback_model: fallbackModel,
        extra_fallback_models: extraFallbackModels,
        model_candidates: modelCandidates,
        compact_prompt_enabled: compactPromptEnabled,
        chunk_size: chunkSize,
        chunk_max_tokens: chunkMaxTokens,
        chunk_retry_max_tokens: chunkRetryMaxTokens,
        chunk_request_max_attempts: chunkRequestMaxAttempts,
        malformed_chunk_capture_limit: malformedChunkCaptureLimit,
        completion_first_enabled: completionFirstEnabled,
        configured_max_analysis_latency_ms: configuredMaxAnalysisLatencyMs,
        lambda_remaining_time_ms: lambdaRemainingTimeMs,
        lambda_reserve_ms: lambdaReserveMs,
        lambda_safe_budget_ms: lambdaSafeBudgetMs,
        soft_analysis_target_ms: softAnalysisTargetMs,
        max_analysis_latency_ms: maxAnalysisLatencyMs
    });
    const checkIdChunks = chunkArray(allAiCheckIds, chunkSize);

    const coercePromptString = (value) => {
        if (typeof value === 'string') return value;
        if (value === null || value === undefined) return '';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) {
            return value.map((item) => coercePromptString(item)).filter(Boolean).join('\n');
        }
        if (typeof value === 'object') {
            const candidateKeys = ['html', 'content_html', 'content', 'text', 'plain_text', 'value'];
            for (const key of candidateKeys) {
                if (typeof value[key] === 'string' && value[key].trim()) {
                    return value[key];
                }
            }
            try {
                return JSON.stringify(value, null, 2);
            } catch (error) {
                return '';
            }
        }
        return '';
    };

    const blockMapForPrompt = Array.isArray(manifest.block_map)
        ? manifest.block_map.map((b, i) => ({
            node_ref: b.node_ref || `block-${i}`,
            signature: b.signature || null,
            type: b.block_type || 'unknown',
            text_preview: coercePromptString(b.text || b.text_content || '').slice(0, 100)
        }))
        : [];
    const blockMapSection = blockMapForPrompt.length > 0
        ? `\n\nBlock Map (use for text_quote_selector context):\n${JSON.stringify(blockMapForPrompt, null, 2)}`
        : '';
    const plainText = coercePromptString(manifest.plain_text);
    const plainTextSection = plainText ? `\n\nPlain Text:\n${plainText}` : '';
    const title = coercePromptString(manifest.title) || 'Untitled';
    const metaDescription = coercePromptString(manifest.meta_description) || 'Not provided';
    const contentHtml = coercePromptString(manifest.content_html);
    const contentFallback = coercePromptString(manifest.content);
    const rawPromptContent = contentHtml || contentFallback;
    const promptContent = compactPromptEnabled && rawPromptContent.length > 60000
        ? rawPromptContent.slice(0, 60000)
        : rawPromptContent;

    const baseUserPrompt = `Analyze this content:

Title: ${title}
Meta Description: ${metaDescription}
${blockMapSection}
${plainTextSection}

Content:
${promptContent}`;

    const buildChunkUserPrompt = (checkIds, mode = 'normal') => {
        const checkList = checkIds.join(', ');
        const compactRules = mode === 'compact'
            ? `

Output compression rules:
- Keep each explanation to one short sentence where possible, maximum 140 characters.
- For block/span scope, choose the shortest exact proof span that still proves the finding (roughly 32-160 characters).
- Keep prefix/suffix between 32 and 64 characters where possible.
- Do not emit optional advisory prose or duplicate the same point in multiple fields.`
            : '';
        return `${baseUserPrompt}

Required check_ids for this chunk: ${checkList}
Return findings ONLY for these check_ids.${compactRules}`;
    };

    const buildSystemPromptForChecks = (checkIds) => {
        const defs = {};
        checkIds.forEach((checkId) => {
            if (flatDefs[checkId]) defs[checkId] = flatDefs[checkId];
        });
        let prompt = cachedPromptTemplate;
        prompt = replacePromptToken(prompt, '{{CHECKS_DEFINITIONS}}', JSON.stringify(defs, null, 2));
        prompt = replacePromptToken(prompt, '{{AI_CHECK_COUNT}}', checkIds.length);
        prompt = replacePromptToken(prompt, '{{QUESTION_ANCHORS_JSON}}', questionAnchorsJson);
        const unresolvedTokens = REQUIRED_PROMPT_TOKENS.filter((token) => prompt.includes(token));
        if (unresolvedTokens.length > 0) {
            const err = new Error(`prompt_template_invalid: Unresolved tokens ${unresolvedTokens.join(', ')}`);
            err.details = {
                unresolved_tokens: unresolvedTokens,
                check_ids: checkIds
            };
            throw err;
        }
        return prompt;
    };

    const parseFindingsFromRaw = (rawText) => {
        const parsed = extractJsonFromResponse(rawText);
        const findings = validateFindingsContract(parsed);
        return { parsed, findings };
    };

    const usageFromResponse = (response) => ({
        input_tokens: response?.usage?.input_tokens ?? response?.usage?.prompt_tokens ?? 0,
        output_tokens: response?.usage?.output_tokens ?? response?.usage?.completion_tokens ?? 0
    });
    const mistralChunkResponseFormat = buildMistralChunkResponseFormat();

    let chunkApiRetryCount = 0;
    let modelSwitchCount = 0;
    const parseErrorCounts = {};
    const malformedChunkSamples = [];
    const trackParseErrorClass = (error) => {
        if (error?._parseClassTracked) return;
        const klass = classifyParseErrorClass(error);
        if (!klass) return;
        parseErrorCounts[klass] = Number(parseErrorCounts[klass] || 0) + 1;
        try {
            error._parseClassTracked = true;
        } catch (trackingError) {
            // best-effort marker only
        }
    };

    const executeChunkRequest = async ({ checkIds, userPrompt, maxTokens, temperature, chunkIndex, attemptLabel }) => {
        const systemPrompt = buildSystemPromptForChecks(checkIds);
        const chunkTag = `${chunkIndex + 1}/${checkIdChunks.length}`;
        let lastError = null;
        for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
            const activeModel = modelCandidates[modelIndex];
            for (let attempt = 1; attempt <= chunkRequestMaxAttempts; attempt += 1) {
                try {
                    const remainingBudgetMs = maxAnalysisLatencyMs - (Date.now() - startTime);
                    const budgetWindow = computeChunkBudgetWindow({
                        remainingBudgetMs,
                        minChunkHeadroomMs,
                        minChunkRequestTimeoutMs,
                        maxChunkRequestTimeoutMs,
                        chunkTimeoutSlackMs
                    });
                    if (budgetWindow.exhausted) {
                        throw createTimeBudgetExceededError('time_budget_exceeded: insufficient headroom before chunk request', {
                            chunk: chunkTag,
                            model: activeModel,
                            attempt,
                            attempt_label: attemptLabel,
                            remaining_budget_ms: budgetWindow.remainingBudgetMs,
                            min_chunk_headroom_ms: minChunkHeadroomMs
                        });
                    }
                    const response = await withTimeout(
                        () => openai.chat.completions.create({
                            model: activeModel,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userPrompt }
                            ],
                            temperature,
                            max_tokens: maxTokens,
                            response_format: mistralChunkResponseFormat
                        }),
                        budgetWindow.requestTimeoutMs,
                        () => createTimeBudgetExceededError('time_budget_exceeded: chunk_request_timeout', {
                            chunk: chunkTag,
                            model: activeModel,
                            attempt,
                            attempt_label: attemptLabel,
                            timeout_ms: budgetWindow.requestTimeoutMs,
                            remaining_budget_ms: budgetWindow.remainingBudgetMs
                        })
                    );
                    const finishReason = response?.choices?.[0]?.finish_reason || null;
                    const rawText = response?.choices?.[0]?.message?.content || '';
                    let parsed = null;
                    let recoveredPartial = false;
                    try {
                        parsed = parseFindingsFromRaw(rawText);
                    } catch (parseError) {
                        trackParseErrorClass(parseError);
                        captureMalformedChunkEntry(malformedChunkSamples, {
                            chunkIndex,
                            chunkTag,
                            attemptLabel,
                            model: activeModel,
                            finishReason,
                            parseError,
                            rawText
                        }, malformedChunkCaptureLimit);
                        const recoveredFindings = extractPartialFindingsFromRaw(rawText, manifest);
                        if (recoveredFindings.length > 0) {
                            recoveredPartial = true;
                            parsed = { parsed: null, findings: recoveredFindings };
                            log('WARN', 'Recovered partial findings from malformed chunk response', {
                                run_id: runId,
                                chunk: chunkTag,
                                model: activeModel,
                                finish_reason: finishReason,
                                parse_error_class: classifyParseErrorClass(parseError) || 'unknown',
                                recovered_count: recoveredFindings.length,
                                error: parseError.message
                            });
                        } else {
                            log('WARN', 'Chunk response failed structured parse and could not be partially recovered', {
                                run_id: runId,
                                chunk: chunkTag,
                                model: activeModel,
                                finish_reason: finishReason,
                                parse_error_class: classifyParseErrorClass(parseError) || 'unknown',
                                attempt_label: attemptLabel,
                                error: parseError.message
                            });
                            throw parseError;
                        }
                    }
                    return {
                        rawText,
                        findings: parsed.findings,
                        finishReason,
                        wasTruncated: finishReason === 'length',
                        recovered_partial: recoveredPartial,
                        usage: usageFromResponse(response),
                        chunkIndex,
                        attemptLabel,
                        model_used: activeModel
                    };
                } catch (error) {
                    lastError = error;
                    if (isTimeBudgetExceededError(error)) {
                        throw error;
                    }
                    const retryable = isRetryableMistralError(error);
                    const hasNextModel = modelIndex < modelCandidates.length - 1;
                    if (retryable && attempt < chunkRequestMaxAttempts) {
                        chunkApiRetryCount += 1;
                        const statusCode = getErrorStatusCode(error);
                        const backoffMs = Math.min(20000, chunkRetryBaseDelayMs * Math.pow(2, attempt - 1));
                        const jitterMs = Math.floor(Math.random() * 200);
                        const waitMs = backoffMs + jitterMs;
                        const remainingAfterErrorMs = maxAnalysisLatencyMs - (Date.now() - startTime);
                        if (remainingAfterErrorMs <= (minChunkHeadroomMs + waitMs)) {
                            throw createTimeBudgetExceededError('time_budget_exceeded: insufficient headroom for retry', {
                                chunk: chunkTag,
                                model: activeModel,
                                attempt,
                                wait_ms: waitMs,
                                remaining_budget_ms: Math.max(0, remainingAfterErrorMs),
                                min_chunk_headroom_ms: minChunkHeadroomMs
                            });
                        }
                        log('WARN', 'Retrying chunk API call after transient error', {
                            run_id: runId,
                            chunk: chunkTag,
                            attempt,
                            max_attempts: chunkRequestMaxAttempts,
                            status_code: statusCode,
                            wait_ms: waitMs,
                            model: activeModel,
                            error: error.message
                        });
                        await sleep(waitMs);
                        continue;
                    }
                    // Schema-like output errors are handled by compact retry in the same chunk path.
                    // Keep model switching for transport/rate-limit failures to reduce latency churn.
                    const shouldFallbackModel = hasNextModel && retryable;
                    if (shouldFallbackModel) {
                        modelSwitchCount += 1;
                        log('WARN', 'Switching to fallback model for chunk', {
                            run_id: runId,
                            chunk: chunkTag,
                            from_model: activeModel,
                            to_model: modelCandidates[modelIndex + 1],
                            attempt,
                            error: error.message
                        });
                        break;
                    }
                    throw error;
                }
            }
        }
        throw lastError || new Error(`failed_schema: chunk request exhausted retries (${attemptLabel})`);
    };

    const startTime = Date.now();
    const aggregatedFindings = [];
    const chunkDiagnostics = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalChunkRetries = 0;
    let syntheticFindingCount = 0;
    let failedChunkCount = 0;
    let chunkMissingTotal = 0;
    let parseRecoveryCount = 0;
    let wasTruncated = false;
    let budgetHit = false;
    let softTargetExceeded = false;
    let budgetElapsedMs = 0;
    let budgetHitAtChunk = null;
    const shortCircuitRemainingChunksForBudget = (fromChunkIndex, chunkTag, trigger, errorMessage = null) => {
        const elapsedMs = Date.now() - startTime;
        budgetHit = true;
        budgetElapsedMs = elapsedMs;
        budgetHitAtChunk = fromChunkIndex + 1;
        const remainingChunks = checkIdChunks.slice(fromChunkIndex);
        const remainingCheckIds = remainingChunks.flat();
        if (remainingCheckIds.length === 0) return;

        const syntheticBudgetFindings = remainingCheckIds.map((checkId) =>
            buildSyntheticPartialFinding(checkId, manifest, 'time_budget_exceeded')
        );
        syntheticFindingCount += syntheticBudgetFindings.length;
        chunkMissingTotal += syntheticBudgetFindings.length;
        aggregatedFindings.push(...syntheticBudgetFindings);
        remainingChunks.forEach((ids, offset) => {
            const isFirstBudgetChunk = offset === 0;
            chunkDiagnostics.push({
                chunk_index: fromChunkIndex + offset + 1,
                check_ids: ids,
                retries: 0,
                used_compact_retry: false,
                status: isFirstBudgetChunk && trigger === 'in_chunk' ? 'budget_in_chunk_timeout' : 'budget_short_circuit',
                missing_after_retries: ids.length,
                synthetic_injected: ids.length,
                ...(isFirstBudgetChunk && errorMessage ? { error: errorMessage } : {})
            });
        });
        log('WARN', 'AI analysis budget exceeded; short-circuiting remaining chunks', {
            run_id: runId,
            chunk: chunkTag,
            elapsed_ms: elapsedMs,
            budget_ms: maxAnalysisLatencyMs,
            remaining_chunks: remainingChunks.length,
            synthetic_injected: syntheticBudgetFindings.length,
            trigger,
            error: errorMessage
        });
    };

    for (let chunkIndex = 0; chunkIndex < checkIdChunks.length; chunkIndex += 1) {
        const chunkCheckIds = checkIdChunks[chunkIndex];
        const chunkTag = `${chunkIndex + 1}/${checkIdChunks.length}`;
        const elapsedBeforeChunk = Date.now() - startTime;
        if (!softTargetExceeded && elapsedBeforeChunk >= softAnalysisTargetMs) {
            softTargetExceeded = true;
            log('WARN', 'AI analysis soft target exceeded; continuing until hard budget or completion', {
                run_id: runId,
                chunk: chunkTag,
                elapsed_ms: elapsedBeforeChunk,
                soft_target_ms: softAnalysisTargetMs,
                hard_budget_ms: maxAnalysisLatencyMs
            });
        }
        if (elapsedBeforeChunk >= maxAnalysisLatencyMs) {
            shortCircuitRemainingChunksForBudget(chunkIndex, chunkTag, 'pre_chunk');
            break;
        }
        let chunkRetries = 0;
        const runChunkAndNormalize = async (checkIds, mode, maxTokens, temperature, missingReason, synthesizeMissing) => {
            const attemptLabel = `${mode}${chunkRetries > 0 ? `-retry-${chunkRetries}` : ''}`;
            const response = await executeChunkRequest({
                checkIds,
                userPrompt: buildChunkUserPrompt(checkIds, mode),
                maxTokens,
                temperature,
                chunkIndex,
                attemptLabel
            });
            if (response.model_used) {
                modelsUsed.add(response.model_used);
            }
            if (response.recovered_partial) {
                parseRecoveryCount += 1;
            }
            totalInputTokens += response.usage.input_tokens;
            totalOutputTokens += response.usage.output_tokens;
            if (response.wasTruncated) {
                wasTruncated = true;
                log('WARN', 'Mistral chunk response was truncated', { run_id: runId, chunk: chunkTag, attempt: attemptLabel });
            }
            const normalized = normalizeChunkFindings(response.findings, checkIds, manifest, missingReason, { synthesizeMissing });
            return { response, normalized };
        };

        try {
            const primary = await runChunkAndNormalize(
                chunkCheckIds,
                'normal',
                chunkMaxTokens,
                0,
                'missing_primary_chunk_output',
                false
            );

            let mergedFindings = primary.normalized.findings;
            let missingCheckIds = primary.normalized.missingCheckIds;
            let usedCompactRetry = false;

            if (primary.response.wasTruncated || missingCheckIds.length > 0) {
                chunkRetries += 1;
                const retryCheckIds = missingCheckIds.length > 0 ? missingCheckIds : chunkCheckIds;
                const compactRetry = await runChunkAndNormalize(
                    retryCheckIds,
                    'compact',
                    chunkRetryMaxTokens,
                    0,
                    'missing_after_compact_retry',
                    false
                );
                usedCompactRetry = true;
                const retrySet = new Set(retryCheckIds);
                mergedFindings = [
                    ...mergedFindings.filter((finding) => !retrySet.has(String(finding?.check_id || '').trim())),
                    ...compactRetry.normalized.findings
                ];
            }

            const finalized = normalizeChunkFindings(
                mergedFindings,
                chunkCheckIds,
                manifest,
                'missing_after_chunk_retries'
            );
            syntheticFindingCount += finalized.syntheticCount;
            chunkMissingTotal += finalized.missingCheckIds.length;
            if (finalized.syntheticCount > 0) failedChunkCount += 1;
            aggregatedFindings.push(...finalized.findings);
            chunkDiagnostics.push({
                chunk_index: chunkIndex + 1,
                check_ids: chunkCheckIds,
                retries: chunkRetries,
                used_compact_retry: usedCompactRetry,
                missing_after_retries: finalized.missingCheckIds.length,
                synthetic_injected: finalized.syntheticCount
            });
        } catch (primaryError) {
            if (isTimeBudgetExceededError(primaryError)) {
                shortCircuitRemainingChunksForBudget(chunkIndex, chunkTag, 'in_chunk', primaryError.message);
                break;
            }
            trackParseErrorClass(primaryError);
            chunkRetries += 1;
            log('WARN', 'Chunk parse/validation failed, retrying compact full chunk', {
                run_id: runId,
                chunk: chunkTag,
                error: primaryError.message
            });

            try {
                const compactFallback = await runChunkAndNormalize(
                    chunkCheckIds,
                    'compact',
                    chunkRetryMaxTokens,
                    0,
                    'missing_compact_fallback_output',
                    false
                );
                const finalized = normalizeChunkFindings(
                    compactFallback.normalized.findings,
                    chunkCheckIds,
                    manifest,
                    'missing_after_compact_fallback'
                );
                syntheticFindingCount += finalized.syntheticCount;
                chunkMissingTotal += finalized.missingCheckIds.length;
                if (finalized.syntheticCount > 0) failedChunkCount += 1;
                aggregatedFindings.push(...finalized.findings);
                chunkDiagnostics.push({
                    chunk_index: chunkIndex + 1,
                    check_ids: chunkCheckIds,
                    retries: chunkRetries,
                    used_compact_retry: true,
                    missing_after_retries: finalized.missingCheckIds.length,
                    synthetic_injected: finalized.syntheticCount
                });
            } catch (fallbackError) {
                if (isTimeBudgetExceededError(fallbackError)) {
                    shortCircuitRemainingChunksForBudget(chunkIndex, chunkTag, 'in_chunk', fallbackError.message);
                    break;
                }
                trackParseErrorClass(fallbackError);
                const salvageRecovered = new Map();
                let salvageAttempts = 0;
                let salvageBudgetStop = false;
                if (chunkCheckIds.length > 1) {
                    log('WARN', 'Attempting per-check compact salvage for irrecoverable chunk', {
                        run_id: runId,
                        chunk: chunkTag,
                        check_count: chunkCheckIds.length
                    });
                    for (const checkId of chunkCheckIds) {
                        const elapsed = Date.now() - startTime;
                        const remainingBudgetMs = maxAnalysisLatencyMs - elapsed;
                        if (remainingBudgetMs <= Math.max(minChunkHeadroomMs, 8000)) {
                            salvageBudgetStop = true;
                            break;
                        }
                        try {
                            chunkRetries += 1;
                            salvageAttempts += 1;
                            const salvageResult = await runChunkAndNormalize(
                                [checkId],
                                'compact',
                                Math.min(chunkRetryMaxTokens, 1400),
                                0.1,
                                'missing_single_check_retry',
                                false
                            );
                            const finalizedSingle = normalizeChunkFindings(
                                salvageResult.normalized.findings,
                                [checkId],
                                manifest,
                                'missing_after_single_check_retry',
                                { synthesizeMissing: false }
                            );
                            if (finalizedSingle.findings.length > 0) {
                                salvageRecovered.set(checkId, finalizedSingle.findings);
                            }
                        } catch (singleCheckError) {
                            if (isTimeBudgetExceededError(singleCheckError)) {
                                salvageBudgetStop = true;
                                break;
                            }
                            trackParseErrorClass(singleCheckError);
                        }
                    }
                }

                if (salvageRecovered.size > 0) {
                    const recoveredFindings = chunkCheckIds
                        .filter((checkId) => salvageRecovered.has(checkId))
                        .flatMap((checkId) => salvageRecovered.get(checkId));
                    const missingCheckIds = chunkCheckIds.filter((checkId) => !salvageRecovered.has(checkId));
                    const syntheticReason = salvageBudgetStop ? 'time_budget_exceeded' : 'chunk_parse_failure';
                    const syntheticFindings = missingCheckIds.map((checkId) =>
                        buildSyntheticPartialFinding(checkId, manifest, syntheticReason)
                    );
                    syntheticFindingCount += syntheticFindings.length;
                    chunkMissingTotal += syntheticFindings.length;
                    if (syntheticFindings.length > 0) {
                        failedChunkCount += 1;
                    }
                    aggregatedFindings.push(...recoveredFindings, ...syntheticFindings);
                    chunkDiagnostics.push({
                        chunk_index: chunkIndex + 1,
                        check_ids: chunkCheckIds,
                        retries: chunkRetries,
                        used_compact_retry: true,
                        status: 'salvage_split',
                        error: fallbackError.message,
                        primary_error: primaryError.message,
                        salvage_attempts: salvageAttempts,
                        salvage_recovered: recoveredFindings.length,
                        synthetic_injected: syntheticFindings.length
                    });
                    log('WARN', 'Chunk salvage recovered subset of findings', {
                        run_id: runId,
                        chunk: chunkTag,
                        recovered_count: recoveredFindings.length,
                        synthetic_count: syntheticFindings.length,
                        salvage_budget_stop: salvageBudgetStop
                    });
                } else {
                    failedChunkCount += 1;
                    const syntheticFindings = chunkCheckIds.map((checkId) =>
                        buildSyntheticPartialFinding(checkId, manifest, 'chunk_parse_failure')
                    );
                    syntheticFindingCount += syntheticFindings.length;
                    chunkMissingTotal += syntheticFindings.length;
                    aggregatedFindings.push(...syntheticFindings);
                    chunkDiagnostics.push({
                        chunk_index: chunkIndex + 1,
                        check_ids: chunkCheckIds,
                        retries: chunkRetries,
                        used_compact_retry: true,
                        status: 'synthetic_all',
                        error: fallbackError.message,
                        primary_error: primaryError.message,
                        synthetic_injected: syntheticFindings.length
                    });
                    log('ERROR', 'Chunk irrecoverable; injected synthetic partial findings', {
                        run_id: runId,
                        chunk: chunkTag,
                        synthetic_count: syntheticFindings.length,
                        error: fallbackError.message
                    });
                }
            }
        }

        totalChunkRetries += chunkRetries;
    }

    const latency = Date.now() - startTime;
    const findings = aggregatedFindings;
    const converted = convertFindingsToChecks(
        findings,
        cachedDefinitions,
        manifest,
        aiEligibleCheckIds,
        { questionAnchorPayload }
    );
    applyNoInternalLinksNeutrality(converted.checks, manifest);
    const computedScores = scoreChecksForSidebar(converted.checks, manifest, runId);
    const result = {
        classification: {
            primary_type: manifest?.content_type || manifest?.classification?.primary_type || 'article',
            confidence: 0.01
        },
        checks: converted.checks,
        telemetry: converted.telemetry,
        scores: computedScores
    };

    const expectedSemanticCheckIds = Array.from(aiEligibleCheckIds);
    const returnedFindingCheckIds = Array.from(new Set(
        findings
            .filter((finding) => !finding?._synthetic)
            .map((finding) => String(finding?.check_id || '').trim())
            .filter((checkId) => aiEligibleCheckIds.has(checkId))
    ));
    const returnedFindingSet = new Set(returnedFindingCheckIds);
    const missingChecks = expectedSemanticCheckIds.filter((id) => !returnedFindingSet.has(id));

    const provenance = {
        source: 'file',
        key: path.join('prompts', 'analysis-system-v1.txt'),
        version: promptVersion || 'v1',
        variant: 0,
        length: cachedPromptTemplate ? cachedPromptTemplate.length : 0,
        chunking: {
            enabled: true,
            chunk_count: checkIdChunks.length,
            chunk_size: chunkSize
        }
    };
    const rawResponse = JSON.stringify({ findings, chunk_diagnostics: chunkDiagnostics });
    const partialContext = {
        was_truncated: wasTruncated,
        expected_ai_checks: expectedSemanticCheckIds.length,
        returned_ai_checks: returnedFindingCheckIds.length,
        missing_ai_checks: missingChecks.length,
        missing_ai_check_ids: missingChecks,
        filtered_invalid_checks: 0,
        chunk_count: checkIdChunks.length,
        failed_chunk_count: failedChunkCount,
        synthetic_findings_count: syntheticFindingCount,
        chunk_missing_total: chunkMissingTotal,
        chunk_retry_count: totalChunkRetries,
        budget_hit: budgetHit,
        soft_target_exceeded: softTargetExceeded,
        soft_target_ms: softAnalysisTargetMs,
        budget_ms: maxAnalysisLatencyMs,
        budget_elapsed_ms: budgetHit ? budgetElapsedMs : latency,
        budget_hit_at_chunk: budgetHitAtChunk
    };
    partialContext.question_anchor_count = questionAnchorPayload.anchor_count || 0;

    const expectedCheckCount = expectedSemanticCheckIds.length;
    const guardrail = evaluateCoverageGuardrail({
        expectedCheckCount,
        returnedAiChecks: returnedFindingCheckIds.length,
        syntheticFindingCount,
        failedChunkCount,
        chunkCount: checkIdChunks.length,
        minReturnedCheckRate,
        maxSyntheticCheckRate
    });
    partialContext.returned_check_rate = Number(guardrail.returnedCheckRate.toFixed(4));
    partialContext.synthetic_check_rate = Number(guardrail.syntheticCheckRate.toFixed(4));
    partialContext.models_used = Array.from(modelsUsed);
    partialContext.model_fallback_used = partialContext.models_used.length > 1;
    partialContext.api_retry_count = chunkApiRetryCount;
    partialContext.model_switch_count = modelSwitchCount;
    partialContext.parse_error_counts = parseErrorCounts;
    partialContext.parse_error_total = Object.values(parseErrorCounts).reduce((sum, value) => sum + Number(value || 0), 0);
    partialContext.parse_recovery_count = parseRecoveryCount;
    partialContext.malformed_chunk_capture_limit = malformedChunkCaptureLimit;
    partialContext.malformed_chunk_capture_count = malformedChunkSamples.length;

    if (malformedChunkSamples.length > 0) {
        try {
            const malformedChunkArtifact = await storeResult(runId, {
                run_id: runId,
                captured_at: new Date().toISOString(),
                capture_limit: malformedChunkCaptureLimit,
                captures: malformedChunkSamples
            }, 'malformed_chunks.json');
            partialContext.malformed_chunk_capture_s3_key = malformedChunkArtifact.s3Uri;
        } catch (captureError) {
            log('WARN', 'Failed to persist malformed chunk capture artifact', {
                run_id: runId,
                capture_count: malformedChunkSamples.length,
                error: captureError.message
            });
        }
    }

    log('INFO', 'AI chunk telemetry summary', {
        run_id: runId,
        chunk_count: checkIdChunks.length,
        failed_chunk_count: failedChunkCount,
        chunk_retry_count: totalChunkRetries,
        api_retry_count: chunkApiRetryCount,
        model_switch_count: modelSwitchCount,
        parse_error_total: partialContext.parse_error_total,
        parse_recovery_count: parseRecoveryCount,
        parse_error_counts: parseErrorCounts,
        malformed_chunk_capture_count: malformedChunkSamples.length,
        returned_check_rate: partialContext.returned_check_rate,
        synthetic_check_rate: partialContext.synthetic_check_rate,
        budget_hit: budgetHit,
        soft_target_exceeded: softTargetExceeded,
        soft_target_ms: softAnalysisTargetMs,
        budget_ms: maxAnalysisLatencyMs,
        budget_elapsed_ms: partialContext.budget_elapsed_ms,
        budget_hit_at_chunk: budgetHitAtChunk
    });

    const allChunksFailed = guardrail.allChunksFailed;
    const hasSemanticCoverage = guardrail.hasSemanticCoverage;
    const coverageTooLow = guardrail.coverageTooLow;

    if (coverageTooLow && !budgetHit) {
        const coverageContext = {
            run_id: runId,
            expected_ai_checks: expectedCheckCount,
            returned_ai_checks: returnedFindingCheckIds.length,
            failed_chunk_count: failedChunkCount,
            chunk_count: checkIdChunks.length,
            synthetic_findings_count: syntheticFindingCount,
            returned_check_rate: partialContext.returned_check_rate,
            synthetic_check_rate: partialContext.synthetic_check_rate,
            min_returned_check_rate: minReturnedCheckRate,
            max_synthetic_check_rate: maxSyntheticCheckRate,
            all_chunks_failed: allChunksFailed
        };
        const unrecoverableCoverage = guardrail.unrecoverableCoverage;
        partialContext.coverage_guardrail_triggered = true;
        partialContext.coverage_guardrail_mode = unrecoverableCoverage ? 'hard_fail' : 'soft_partial';

        if (unrecoverableCoverage) {
            log('ERROR', 'AI semantic coverage below threshold; forcing deterministic fallback', coverageContext);
            const err = new Error('ai_unavailable: semantic coverage below threshold');
            err.details = {
                reason: 'semantic_coverage_below_threshold',
                thresholds: {
                    min_returned_check_rate: minReturnedCheckRate,
                    max_synthetic_check_rate: maxSyntheticCheckRate
                },
                context: partialContext
            };
            throw err;
        }

        log('WARN', 'AI semantic coverage below threshold; continuing with partial semantic result', coverageContext);
    } else if (coverageTooLow && budgetHit) {
        partialContext.coverage_guardrail_triggered = true;
        partialContext.coverage_guardrail_mode = 'budget_short_circuit';
        log('WARN', 'Coverage guardrail suppressed due to explicit time budget short-circuit', {
            run_id: runId,
            expected_ai_checks: expectedCheckCount,
            returned_ai_checks: returnedFindingCheckIds.length,
            budget_ms: maxAnalysisLatencyMs,
            budget_elapsed_ms: partialContext.budget_elapsed_ms
        });
    }

    const modelsUsedList = Array.from(modelsUsed);
    const effectiveModel = modelsUsedList.length === 0
        ? primaryModel
        : (modelsUsedList.length === 1 ? modelsUsedList[0] : modelsUsedList.join('->'));

    return {
        result,
        rawResponse,
        usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens
        },
        model: effectiveModel,
        latency_ms: latency,
        provenance,
        partial_context: partialContext
    };
};

/**
 * Call Mistral for analysis
 */
const callMistral = async (manifest, promptVersion, runId, options = {}) => {
    return callMistralChunked(manifest, promptVersion, runId, options);

    // 1. Ensure assets are loaded
    loadAssets();

    // 4. Initialize OpenAI client (pointing to Mistral)
    const apiKey = await getMistralApiKey();

    // Debug: Log API key (first 4 chars) to verify it's loaded
    if (apiKey && apiKey.length > 4) {
        log('INFO', 'API key loaded successfully', {
            key_prefix: apiKey.substring(0, 4) + '***',
            key_length: apiKey.length
        });
    } else {
        log('ERROR', 'Failed to load API key', {
            api_key_defined: !!apiKey,
            api_key_length: apiKey ? apiKey.length : 0
        });
        throw new Error('API key not properly loaded from secret');
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://api.mistral.ai/v1"
    });

    // Explicit model selection - no defaults, no aliases
    const model = getEnv('MISTRAL_MODEL', DEFAULT_MISTRAL_MODEL);

    log('INFO', 'Using explicit model', { model: model });

    // 5. Prepare System Prompt (inject FLATTENED definitions - P1 fix)
    const aiEligibleCheckIds = getAiEligibleCheckIds(cachedDefinitions, cachedRuntimeContract);
    const flatDefs = flattenDefinitionsForPrompt(cachedDefinitions, aiEligibleCheckIds);
    const questionAnchorPayload = buildQuestionAnchorPayload(manifest);
    const questionAnchorsJson = JSON.stringify(questionAnchorPayload, null, 2);
    const totalDefinedChecks = cachedDefinitions?.categories
        ? Object.values(cachedDefinitions.categories).reduce((count, category) => {
            return count + Object.keys(category?.checks || {}).length;
        }, 0)
        : 0;
    log('INFO', 'Prepared flattened definitions for prompt', {
        ai_check_count: Object.keys(flatDefs).length,
        total_defined_checks: totalDefinedChecks
    });

    let systemPrompt = replacePromptToken(
        cachedPromptTemplate,
        '{{CHECKS_DEFINITIONS}}',
        JSON.stringify(flatDefs, null, 2)
    );
    systemPrompt = replacePromptToken(systemPrompt, '{{AI_CHECK_COUNT}}', Object.keys(flatDefs).length);
    systemPrompt = replacePromptToken(systemPrompt, '{{QUESTION_ANCHORS_JSON}}', questionAnchorsJson);
    const unresolvedTokens = REQUIRED_PROMPT_TOKENS.filter((token) => systemPrompt.includes(token));
    if (unresolvedTokens.length > 0) {
        const err = new Error(`prompt_template_invalid: Unresolved tokens ${unresolvedTokens.join(', ')}`);
        err.details = { unresolved_tokens: unresolvedTokens };
        throw err;
    }
    const provenance = {
        source: 'file',
        key: path.join('prompts', 'analysis-system-v1.txt'),
        version: promptVersion || 'v1',
        variant: 0,
        length: typeof systemPrompt === 'string' ? systemPrompt.length : 0
    };

    // 6. Prepare User Prompt with Block Map for accurate anchoring
    const coercePromptString = (value) => {
        if (typeof value === 'string') return value;
        if (value === null || value === undefined) return '';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) {
            return value.map((item) => coercePromptString(item)).filter(Boolean).join('\n');
        }
        if (typeof value === 'object') {
            const candidateKeys = ['html', 'content_html', 'content', 'text', 'plain_text', 'value'];
            for (const key of candidateKeys) {
                if (typeof value[key] === 'string' && value[key].trim()) {
                    return value[key];
                }
            }
            try {
                return JSON.stringify(value, null, 2);
            } catch (error) {
                return '';
            }
        }
        return '';
    };

    const blockMapForPrompt = Array.isArray(manifest.block_map)
        ? manifest.block_map.map((b, i) => ({
            node_ref: b.node_ref || `block-${i}`,
            signature: b.signature || null,
            type: b.block_type || 'unknown',
            text_preview: coercePromptString(b.text || b.text_content || '').slice(0, 100)
        }))
        : [];

    const blockMapSection = blockMapForPrompt.length > 0
        ? `\n\nBlock Map (use for text_quote_selector context):\n${JSON.stringify(blockMapForPrompt, null, 2)}`
        : '';

    const plainText = coercePromptString(manifest.plain_text);
    const plainTextSection = plainText ? `\n\nPlain Text:\n${plainText}` : '';
    const title = coercePromptString(manifest.title) || 'Untitled';
    const metaDescription = coercePromptString(manifest.meta_description) || 'Not provided';
    const contentHtml = coercePromptString(manifest.content_html);
    const contentFallback = coercePromptString(manifest.content);
    const promptContent = contentHtml || contentFallback;
    const userPrompt = `Analyze this content:

Title: ${title}
Meta Description: ${metaDescription}
${blockMapSection}
${plainTextSection}

Content:
${promptContent}`;

    log('INFO', 'Calling Mistral API', { model, content_length: userPrompt.length });
    const startTime = Date.now();

    // 7. Call API - Minimum viable request first
    const requestPayload = {
        model: model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 8000
    };

    requestPayload.response_format = buildMistralChunkResponseFormat();

    log('INFO', 'API request payload', {
        model: requestPayload.model,
        message_count: requestPayload.messages.length,
        has_system_prompt: !!requestPayload.messages[0],
        has_response_format: !!requestPayload.response_format
    });

    const response = await openai.chat.completions.create(requestPayload);

    const latency = Date.now() - startTime;
    log('INFO', 'Mistral response received', { latency_ms: latency, model });

    let rawText = response.choices[0].message.content || '';
    let effectiveResponse = response;
    let wasTruncated = false;

    // Check stop reason if available
    if (response.choices[0].finish_reason === 'length') {
        log('WARN', 'Mistral response was truncated', { finish_reason: 'length' });
        wasTruncated = true;
    }

    // 8. Parse JSON
    let result;
    try {
        result = extractJsonFromResponse(rawText);
    } catch (parseError) {
        log('WARN', 'Primary parse failed, retrying with compact prompt', { error: parseError.message });
        const contentText = manifest.content_html || manifest.content || '';
        const truncatedContent = typeof contentText === 'string' ? contentText.slice(0, 12000) : '';
        const fallbackUserPrompt = `Return compact JSON only. Omit long explanations if needed. Keep findings array and required fields (check_id, verdict, confidence, scope, text_quote_selector, explanation). For pass verdicts, set explanation to an empty string.

Title: ${manifest.title || 'Untitled'}
Meta Description: ${manifest.meta_description || 'Not provided'}
${blockMapSection}

Content:
${truncatedContent}`;
        const fallbackPayload = {
            ...requestPayload,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: fallbackUserPrompt }
            ],
            temperature: 0,
            max_tokens: 4000
        };
        const fallbackResponse = await openai.chat.completions.create(fallbackPayload);
        effectiveResponse = fallbackResponse;
        rawText = fallbackResponse.choices[0].message.content || '';
        if (fallbackResponse.choices[0].finish_reason === 'length') {
            log('WARN', 'Mistral fallback response was truncated', { finish_reason: 'length' });
            wasTruncated = true;
        }
        try {
            result = extractJsonFromResponse(rawText);
        } catch (fallbackError) {
            log('ERROR', 'Failed to parse Mistral response', {
                error: fallbackError.message,
                raw_preview: rawText.substring(0, 500),
                primary_error: parseError.message
            });
            await storeResult(runId, { raw_response: rawText, parse_error: fallbackError.message, primary_error: parseError.message }, 'raw_response.json');

            const err = new Error('failed_schema: Invalid JSON in Mistral response');
            err.details = { raw_preview: rawText.substring(0, 2000), primary_error: parseError.message };
            throw err;
        }
    }

    const rawScores = result?.scores && typeof result.scores === 'object' ? result.scores : null;
    let findings;
    try {
        findings = validateFindingsContract(result);
    } catch (validationError) {
        if (getEnv('CAPTURE_RAW_RESPONSE', '') === '1') {
            try {
                const finishReason = effectiveResponse?.choices?.[0]?.finish_reason || null;
                await storeResult(runId, {
                    raw_response: rawText,
                    parsed_result: result,
                    validation_details: validationError.details || null,
                    finish_reason: finishReason
                }, 'raw_response.json');
            } catch (storeError) {
                log('ERROR', 'Failed to store raw response', { run_id: runId, error: storeError.message });
            }
        }
        throw validationError;
    }
    const converted = convertFindingsToChecks(
        findings,
        cachedDefinitions,
        manifest,
        aiEligibleCheckIds,
        { questionAnchorPayload }
    );
    applyNoInternalLinksNeutrality(converted.checks, manifest);
    const computedScores = scoreChecksForSidebar(converted.checks, manifest, runId);
    result = {
        classification: result.classification || {
            primary_type: manifest?.content_type || manifest?.classification?.primary_type || 'article',
            confidence: 0.01
        },
        checks: converted.checks,
        telemetry: converted.telemetry,
        scores: computedScores
    };
    if (rawScores && runId) {
        log('DEBUG', 'Ignoring model-supplied scores in favor of computed scoring', {
            run_id: runId
        });
    }
    const flattenedChecks = flattenChecks(result.checks);
    log('INFO', 'Converted findings to checks', { findings_count: findings.length, checks_count: Object.keys(flattenedChecks).length });
    if (result.telemetry?.findings?.length) {
        result.telemetry.findings.forEach((item) => {
            log('INFO', 'Finding telemetry', {
                run_id: runId,
                check_id: item.check_id,
                scope: item.scope,
                snippet_length_chars: item.snippet_length_chars,
                snippet_tokens_est: item.snippet_tokens_est,
                has_ellipsis: item.has_ellipsis,
                anchoring_strategy_used: item.anchoring_strategy_used,
                anchor_success: item.anchor_success,
                wrap_errors: item.wrap_errors
            });
        });
    }
    if (result.telemetry?.aggregate) {
        log('INFO', 'Telemetry aggregate', {
            run_id: runId,
            ellipsis_rate: result.telemetry.aggregate.ellipsis_rate,
            avg_snippet_length: result.telemetry.aggregate.avg_snippet_length,
            anchor_success_rate: result.telemetry.aggregate.anchor_success_rate,
            fallback_rate: result.telemetry.aggregate.fallback_rate
        });
    }

    // Validate AI returned expected number of AI-eligible checks
    const expectedSemanticCheckIds = Array.from(aiEligibleCheckIds);
    const returnedFindingCheckIds = Array.from(new Set(
        findings
            .map((finding) => String(finding?.check_id || '').trim())
            .filter((checkId) => aiEligibleCheckIds.has(checkId))
    ));
    const returnedFindingSet = new Set(returnedFindingCheckIds);
    const missingChecks = expectedSemanticCheckIds.filter(id => !returnedFindingSet.has(id));
    if (missingChecks.length > 0) {
        log('WARN', 'AI did not return all expected semantic checks', {
            expected_count: expectedSemanticCheckIds.length,
            returned_count: returnedFindingCheckIds.length,
            missing_checks: missingChecks
        });
    } else {
        log('INFO', 'AI returned all expected semantic checks', {
            expected_count: expectedSemanticCheckIds.length,
            returned_count: returnedFindingCheckIds.length
        });
    }

    // Validate verdicts and inject category metadata (P1)
    const validChecks = {};
    const invalidChecks = [];

    Object.entries(flattenedChecks).forEach(([id, check]) => {
        // Skip if check is not an object (safety)
        if (!check || typeof check !== 'object') {
            invalidChecks.push({ id, reason: 'Check is not an object', original: check });
            return;
        }

        // Auto-fix verdict casing and normalize variants
        if (check.verdict && typeof check.verdict === 'string') {
            check.verdict = normalizeVerdict(check.verdict, '');
        }

        // Auto-fix confidence string
        if (typeof check.confidence === 'string') {
            check.confidence = parseFloat(check.confidence);
        }
        // Default confidence if missing
        if (typeof check.confidence !== 'number' || isNaN(check.confidence)) {
            check.confidence = 0.8; // Default to high confidence
        }

        // Validate verdict
        let isValid = CANONICAL_VERDICTS.includes(check.verdict);
        let reason = '';

        if (!isValid) {
            reason = `Invalid verdict: ${check.verdict}`;
        }

        if (isValid) {
            // P1: Inject category and subcategory from mapping
            const mapping = CHECK_CATEGORY_MAP[id];
            if (mapping) {
                check.category = mapping.category;        // 'AEO' or 'GEO'
                check.subcategory = mapping.subcategory;  // e.g., 'Answer Extractability'
            } else {
                // Unknown check ID - default to GEO
                check.category = 'GEO';
                check.subcategory = 'Other';
                log('WARN', 'Unknown check ID, defaulting to GEO', { id });
            }

            // Ensure provenance
            if (!check.provenance) check.provenance = 'ai';

            // Ensure id is in check object (for sidebar)
            check.id = id;

            validChecks[id] = check;
        } else {
            invalidChecks.push({ id, reason, original: check });
        }
    });

    // Replace result with validated + enriched checks
    result.checks = validChecks;

    // Log warnings but proceed if at least some checks are valid (Partial Success)
    if (invalidChecks.length > 0) {
        log('WARN', 'Some checks failed validation and were filtered out', {
            valid_count: Object.keys(validChecks).length,
            invalid_count: invalidChecks.length,
            invalidChecks
        });
        result._validation_warnings = invalidChecks;
    }

    // Only fail if NO checks are valid
    if (Object.keys(validChecks).length === 0) {
        log('ERROR', 'Schema validation failed: 0 valid checks found after flattening + validation');
        await storeResult(runId, { raw_response: rawText, result, invalid_checks: invalidChecks }, 'raw_response.json');

        const err = new Error('failed_schema: No valid checks found in response');
        err.details = {
            invalid_checks: invalidChecks,
            raw_keys: Object.keys(result.checks || {})
        };
        throw err;
    }

    log('INFO', 'Validation complete', {
        valid_checks: Object.keys(validChecks).length,
        aeo_checks: Object.values(validChecks).filter(c => c.category === 'AEO').length,
        geo_checks: Object.values(validChecks).filter(c => c.category === 'GEO').length
    });

    const partialContext = {
        was_truncated: wasTruncated,
        expected_ai_checks: expectedSemanticCheckIds.length,
        returned_ai_checks: returnedFindingCheckIds.length,
        missing_ai_checks: missingChecks.length,
        missing_ai_check_ids: missingChecks,
        filtered_invalid_checks: invalidChecks.length
    };

    // P0: Removed duplicate validation block that was causing failed_schema even with valid checks

    return {
        result,
        rawResponse: rawText,
        usage: {
            input_tokens: effectiveResponse.usage?.input_tokens || 0,
            output_tokens: effectiveResponse.usage?.output_tokens || 0
        },
        model,
        latency_ms: latency,
        provenance,
        partial_context: partialContext
    };
};

/**
 * Process a single SQS message
 */
const processJob = async (message, lambdaContext = null) => {
    let job;
    try {
        job = parseMessageBody(message.body);
    } catch (error) {
        log('ERROR', 'Failed to parse SQS message body', { error: error.message });
        return { success: false, error: 'invalid_json' };
    }
    if (!job) {
        log('ERROR', 'Missing SQS message body');
        return { success: false, error: 'missing_body' };
    }
    const { run_id: runId, manifest_s3_key: manifestS3Key, site_id: siteId, prompt_version: promptVersion } = job;
    const featureFlags = getEffectiveFeatureFlags(job);
    const enableWebLookups = parseBooleanFlag(job.enable_web_lookups);
    let manifest = null;
    let deterministicChecks = null;
    let creditReservation = normalizeCreditReservation(job.credit_reservation, siteId);

    log('INFO', 'Processing job', {
        run_id: runId,
        site_id: siteId,
        enable_web_lookups: enableWebLookups,
        feature_flags: featureFlags
    });

    try {
        // P5: Force run for simulation removed
        const transitioned = await atomicTransitionToRunning(runId);
        // const transitioned = true;

        if (!transitioned) {
            log('INFO', 'Skipping job - already running or complete', { run_id: runId });
            return { success: true, skipped: true, reason: 'already_processed' };
        }

        if (!creditReservation) {
            try {
                const runRecord = await getRunRecord(runId);
                creditReservation = normalizeCreditReservation(runRecord?.credit_reservation, siteId);
            } catch (reservationLookupError) {
                log('WARN', 'Unable to load credit reservation from run record', {
                    run_id: runId,
                    error: reservationLookupError.message
                });
            }
        }

        // Support direct manifest injection for testing (bypassing S3)
        if (job.manifest_content) {
            log('INFO', 'Using directly injected manifest_content', { title: job.manifest_content.title });
            manifest = job.manifest_content;
        } else {
            manifest = await downloadManifest(manifestS3Key);
        }

        // --- Scoring Engine Integration (Naive for now, or call the orchestrator's scoring logic?) ---
        // Since scoring-engine.js is in orchestrator, we can't easily require it here without copying.
        // For now, we rely on Mistral's scores OR we implement a simple scoring function here.
        // Requirement: "Pass raw results to scoring-engine.js (already present)."
        // Limitation: scoring-engine.js is in a different Lambda.
        // Solution: We TRUST Mistral's scores for now, or we copy scoring-engine.js to worker.
        // Given user request "do not stray away", copying logic is better than complex cross-lambda calls.
        // However, I will rely on Mistral's provided scores as the prompt asks for them.

        const lambdaRemainingTimeMs = lambdaContext && typeof lambdaContext.getRemainingTimeInMillis === 'function'
            ? Number(lambdaContext.getRemainingTimeInMillis())
            : null;
        const { result, usage, model, latency_ms, provenance, partial_context: aiPartialContext } = await callMistral(
            manifest,
            promptVersion,
            runId,
            {
                featureFlags,
                lambdaRemainingTimeMs,
                runMetadata: job
            }
        );

        // C1 FIX: Run deterministic checks and merge with AI result
        log('INFO', 'Running deterministic checks', { run_id: runId });
        deterministicChecks = await performDeterministicChecks(manifest, job, {
            enableIntroFocusFactuality: isIntroFocusFactualityEnabled(),
            contentHtml: manifest?.content_html || ''
        });
        const deterministicCheckIds = Object.keys(deterministicChecks);
        log('INFO', 'Deterministic checks complete', {
            run_id: runId,
            check_count: deterministicCheckIds.length,
            checks: deterministicCheckIds
        });

        // Merge: Deterministic checks own only deterministic/hybrid intro verdicts.
        // AI-owned checks must remain AI-authored and are never overwritten here.
        const mergedChecks = { ...(result.checks || {}) };
        let deterministicAppliedCount = 0;
        for (const [checkId, deterministicCheck] of Object.entries(deterministicChecks)) {
            const aiCheck = mergedChecks[checkId];
            const contractEngine = getAnalysisEngineForCheck(
                checkId,
                null,
                cachedRuntimeContract
            );
            const introDeterministicOwned = INTRO_DETERMINISTIC_CHECK_IDS.has(checkId);

            if (contractEngine === 'ai' && !introDeterministicOwned) {
                if (!aiCheck) {
                    log('WARN', 'AI-owned check missing during deterministic merge; leaving unresolved for partial handling', {
                        run_id: runId,
                        check_id: checkId
                    });
                }
                continue;
            }

            mergedChecks[checkId] = deterministicCheck;
            deterministicAppliedCount += 1;
        }
        result.checks = mergedChecks;
        result.scores = scoreChecksForSidebar(result.checks, manifest, runId);
        log('INFO', 'Merged deterministic and AI checks', {
            run_id: runId,
            total_checks: Object.keys(mergedChecks).length,
            deterministic_count: deterministicAppliedCount,
            ai_count: Object.keys(mergedChecks).length - deterministicAppliedCount,
            scores: result.scores
        });

        const normalizedResult = normalizeHighlightsWithManifest(result, manifest);

        // Result Contract Lock: Enrich with ui_verdict before storage
        const enrichedResult = enrichWithUiVerdict(normalizedResult);
        log('INFO', 'Enriched result with ui_verdict', { run_id: runId, check_count: Object.keys(enrichedResult.checks || {}).length });

        let overlayContent;
        try {
            overlayContent = buildHighlightedHtml(manifest, enrichedResult);
        } catch (overlayError) {
            log('WARN', 'Overlay generation failed; continuing with summary/details only', {
                run_id: runId,
                error: overlayError.message
            });
            overlayContent = {
                schema_version: '2.0.0',
                generated_at: new Date().toISOString(),
                run_id: runId,
                highlighted_html: null,
                content_hash: null,
                highlight_count: 0,
                recommendations: [],
                unhighlightable_issues: [],
                v2_findings: [],
                overlay_error: 'overlay_generation_failed'
            };
        }

        // PII Scrubbing: Redact sensitive data before persistence
        const { scrubbed: scrubbedResult, piiDetected, detections } = scrubAnalysisResult(enrichedResult, runId);
        if (piiDetected) {
            log('WARN', 'PII detected and scrubbed before storage', {
                run_id: runId,
                detection_count: detections.length,
                types: [...new Set(detections.map(d => d.type))]
            });
        }

        scrubbedResult.overlay_content = overlayContent;

        const { s3Uri, presignedUrl } = await storeResult(runId, scrubbedResult);
        let deferredDetailsS3Uri = null;
        try {
            const deferredDetailsPayload = buildDeferredDetailsPayload(scrubbedResult, runId);
            const detailsStore = await storeResult(runId, deferredDetailsPayload, 'details.json');
            deferredDetailsS3Uri = detailsStore.s3Uri;
        } catch (detailsError) {
            log('WARN', 'Failed to persist deferred details artifact', {
                run_id: runId,
                error: detailsError.message
            });
        }

        const scores = result.scores || { AEO: 0, GEO: 0, GLOBAL: 0 };
        const partialState = derivePartialRunState(aiPartialContext);
        const partialContext = partialState.partialContext;
        const missingAiChecks = partialState.missingAiChecks;
        const filteredInvalidChecks = partialState.filteredInvalidChecks;
        const failedChunkCount = partialState.failedChunkCount;
        const syntheticFindingsCount = partialState.syntheticFindingsCount;
        const partialReason = partialState.partialReason;
        const isPartialRun = partialState.isPartialRun;
        const budgetHit = partialState.budgetHit;

        if (isPartialRun && !featureFlags.partial_results_enabled) {
            log('INFO', 'Partial run status forced by analyzer integrity safeguards', {
                run_id: runId,
                reason: partialReason
            });
        }

        const statusPayload = {
            completed_at: new Date().toISOString(),
            result_s3: s3Uri,
            result_url: presignedUrl,
            scores: scores,
            feature_flags: featureFlags,
            audit: {
                model,
                tokens_used: usage.input_tokens + usage.output_tokens,
                prompt_version: promptVersion || 'v1',
                latency_ms,
                prompt_provenance: provenance,
                anchor_verification: normalizedResult.anchor_verification || null,
                ai_chunking: {
                    chunk_count: Number(partialContext.chunk_count || 0),
                    failed_chunk_count: failedChunkCount,
                    chunk_retry_count: Number(partialContext.chunk_retry_count || 0),
                    api_retry_count: Number(partialContext.api_retry_count || 0),
                    model_switch_count: Number(partialContext.model_switch_count || 0),
                    parse_error_total: Number(partialContext.parse_error_total || 0),
                    parse_recovery_count: Number(partialContext.parse_recovery_count || 0),
                    parse_error_counts: partialContext.parse_error_counts || {},
                    returned_check_rate: Number(partialContext.returned_check_rate || 0),
                    synthetic_check_rate: Number(partialContext.synthetic_check_rate || 0),
                    coverage_guardrail_triggered: !!partialContext.coverage_guardrail_triggered,
                    coverage_guardrail_mode: partialContext.coverage_guardrail_mode || null,
                    budget_hit: budgetHit,
                    budget_ms: Number(partialContext.budget_ms || 0),
                    budget_elapsed_ms: Number(partialContext.budget_elapsed_ms || 0),
                    budget_hit_at_chunk: Number(partialContext.budget_hit_at_chunk || 0)
                },
                feature_flags: featureFlags
            }
        };

        if (isPartialRun) {
            statusPayload.partial = {
                mode: 'mixed',
                reason: partialReason,
                expected_ai_checks: Number(partialContext.expected_ai_checks || 0),
                returned_ai_checks: Number(partialContext.returned_ai_checks || 0),
                missing_ai_checks: missingAiChecks,
                filtered_invalid_checks: filteredInvalidChecks,
                failed_chunk_count: failedChunkCount,
                synthetic_findings_count: syntheticFindingsCount,
                chunk_retry_count: Number(partialContext.chunk_retry_count || 0),
                api_retry_count: Number(partialContext.api_retry_count || 0),
                model_switch_count: Number(partialContext.model_switch_count || 0),
                parse_error_total: Number(partialContext.parse_error_total || 0),
                parse_recovery_count: Number(partialContext.parse_recovery_count || 0),
                parse_error_counts: partialContext.parse_error_counts || {},
                returned_check_rate: Number(partialContext.returned_check_rate || 0),
                synthetic_check_rate: Number(partialContext.synthetic_check_rate || 0),
                coverage_guardrail_triggered: !!partialContext.coverage_guardrail_triggered,
                coverage_guardrail_mode: partialContext.coverage_guardrail_mode || null,
                budget_hit: budgetHit,
                budget_ms: Number(partialContext.budget_ms || 0),
                budget_elapsed_ms: Number(partialContext.budget_elapsed_ms || 0),
                budget_hit_at_chunk: Number(partialContext.budget_hit_at_chunk || 0),
                completed_checks: Object.keys(enrichedResult.checks || {}).length
            };
        }

        if (deferredDetailsS3Uri) {
            statusPayload.details_s3 = deferredDetailsS3Uri;
        }

        const runStatus = partialState.runStatus;
        let billingSummary = null;
        try {
            billingSummary = await finalizeCreditSettlement({
                runId,
                siteId,
                finalStatus: runStatus,
                reservation: creditReservation,
                usage,
                model,
                reasonCode: runStatus === 'success_partial' ? 'analysis_completed_partial' : 'analysis_completed'
            });
        } catch (billingError) {
            log('WARN', 'Failed to finalize credit settlement for completed run', {
                run_id: runId,
                error: billingError.message
            });
        }
        if (billingSummary) {
            statusPayload.billing_summary = billingSummary;
        }
        await updateRunStatus(runId, runStatus, statusPayload);

        log('INFO', 'Job completed successfully', {
            run_id: runId,
            status: runStatus,
            scores,
            partial_reason: partialReason
        });
        return { success: true, run_id: runId, status: runStatus, scores };

    } catch (error) {
        log('ERROR', 'Job failed', { run_id: runId, error: error.message, stack: error.stack });
        const isSchemaError = error.message.startsWith('failed_schema');
        const errorType = isSchemaError ? 'failed_schema' : 'ai_unavailable';
        const partialEnabled = !!featureFlags.partial_results_enabled;

        if (partialEnabled && manifest) {
            try {
                if (!deterministicChecks) {
                    deterministicChecks = await performDeterministicChecks(manifest, job, {
                        enableIntroFocusFactuality: isIntroFocusFactualityEnabled(),
                        contentHtml: manifest?.content_html || ''
                    });
                }

                const fallbackChecks = { ...(deterministicChecks || {}) };
                const aiEligibleCheckIds = Array.from(getAiEligibleCheckIds(cachedDefinitions, cachedRuntimeContract));
                const missingAiCheckIds = aiEligibleCheckIds.filter(
                    (checkId) => !Object.prototype.hasOwnProperty.call(fallbackChecks, checkId)
                );
                missingAiCheckIds.forEach((checkId) => {
                    fallbackChecks[checkId] = buildSemanticFallbackCheck(checkId, cachedDefinitions);
                });

                const fallbackCheckIds = Object.keys(fallbackChecks);
                if (fallbackCheckIds.length > 0) {
                    const fallbackScores = scoreChecksForSidebar(fallbackChecks, manifest, runId);
                    const fallbackResult = {
                        classification: {
                            primary_type: manifest?.content_type || manifest?.classification?.primary_type || 'article',
                            confidence: 0.25
                        },
                        checks: fallbackChecks,
                        scores: fallbackScores
                    };

                    const normalizedFallback = normalizeHighlightsWithManifest(fallbackResult, manifest);
                    const enrichedFallback = enrichWithUiVerdict(normalizedFallback);

                    let overlayContent;
                    try {
                        overlayContent = buildHighlightedHtml(manifest, enrichedFallback);
                    } catch (overlayError) {
                        log('WARN', 'Overlay generation failed for partial fallback', {
                            run_id: runId,
                            error: overlayError.message
                        });
                        overlayContent = {
                            schema_version: '2.0.0',
                            generated_at: new Date().toISOString(),
                            run_id: runId,
                            highlighted_html: null,
                            content_hash: null,
                            highlight_count: 0,
                            recommendations: [],
                            unhighlightable_issues: [],
                            v2_findings: [],
                            overlay_error: 'overlay_generation_failed'
                        };
                    }

                    const { scrubbed: scrubbedFallback } = scrubAnalysisResult(enrichedFallback, runId);
                    scrubbedFallback.overlay_content = overlayContent;

                    const { s3Uri, presignedUrl } = await storeResult(runId, scrubbedFallback);
                    let deferredDetailsS3Uri = null;
                    try {
                        const deferredDetailsPayload = buildDeferredDetailsPayload(scrubbedFallback, runId);
                        const detailsStore = await storeResult(runId, deferredDetailsPayload, 'details.json');
                        deferredDetailsS3Uri = detailsStore.s3Uri;
                    } catch (detailsError) {
                        log('WARN', 'Failed to persist deferred details artifact (partial fallback)', {
                            run_id: runId,
                            error: detailsError.message
                        });
                    }

                    const statusPayload = {
                        completed_at: new Date().toISOString(),
                        result_s3: s3Uri,
                        result_url: presignedUrl,
                        scores: fallbackScores,
                        feature_flags: featureFlags,
                        partial: {
                            mode: 'deterministic_fallback',
                            reason: isSchemaError ? 'schema_validation_failed' : 'ai_unavailable',
                            completed_checks: fallbackCheckIds.length,
                            missing_ai_checks: missingAiCheckIds.length,
                            filtered_invalid_checks: null
                        },
                        audit: {
                            model: null,
                            tokens_used: 0,
                            prompt_version: promptVersion || 'v1',
                            latency_ms: null,
                            prompt_provenance: null,
                            anchor_verification: normalizedFallback.anchor_verification || null,
                            ai_chunking: error?.details?.context ? {
                                chunk_count: Number(error.details.context.chunk_count || 0),
                                failed_chunk_count: Number(error.details.context.failed_chunk_count || 0),
                                chunk_retry_count: Number(error.details.context.chunk_retry_count || 0),
                                api_retry_count: Number(error.details.context.api_retry_count || 0),
                                model_switch_count: Number(error.details.context.model_switch_count || 0),
                                parse_error_total: Number(error.details.context.parse_error_total || 0),
                                parse_error_counts: error.details.context.parse_error_counts || {},
                                returned_check_rate: Number(error.details.context.returned_check_rate || 0),
                                synthetic_check_rate: Number(error.details.context.synthetic_check_rate || 0),
                                coverage_guardrail_triggered: !!error.details.context.coverage_guardrail_triggered,
                                coverage_guardrail_mode: error.details.context.coverage_guardrail_mode || null
                            } : null,
                            feature_flags: featureFlags,
                            fallback: true,
                            original_error: error.message
                        }
                    };

                    if (deferredDetailsS3Uri) {
                        statusPayload.details_s3 = deferredDetailsS3Uri;
                    }

                    let billingSummary = null;
                    try {
                        billingSummary = await finalizeCreditSettlement({
                            runId,
                            siteId,
                            finalStatus: 'success_partial',
                            reservation: creditReservation,
                            usage: { input_tokens: 0, output_tokens: 0 },
                            model: null,
                            reasonCode: 'deterministic_fallback'
                        });
                    } catch (billingError) {
                        log('WARN', 'Failed to finalize credit settlement for fallback partial run', {
                            run_id: runId,
                            error: billingError.message
                        });
                    }
                    if (billingSummary) {
                        statusPayload.billing_summary = billingSummary;
                    }
                    await updateRunStatus(runId, 'success_partial', statusPayload);

                    log('WARN', 'Job recovered with deterministic-only partial result', {
                        run_id: runId,
                        check_count: fallbackCheckIds.length,
                        synthesized_semantic_partial_count: missingAiCheckIds.length,
                        reason: statusPayload.partial.reason
                    });
                    return {
                        success: true,
                        run_id: runId,
                        status: 'success_partial',
                        partial: true,
                        fallback: true
                    };
                }
            } catch (partialError) {
                log('ERROR', 'Partial fallback failed', {
                    run_id: runId,
                    error: partialError.message
                });
            }
        }

        try {
            await storeResult(runId, { error: error.message, stack: error.stack }, 'error.json');
        } catch (storeError) { }

        const failureStatus = isSchemaError ? 'failed_schema' : 'failed';
        let failureBillingSummary = null;
        try {
            failureBillingSummary = await finalizeCreditSettlement({
                runId,
                siteId,
                finalStatus: failureStatus,
                reservation: creditReservation,
                usage: { input_tokens: 0, output_tokens: 0 },
                model: null,
                reasonCode: failureStatus
            });
        } catch (billingError) {
            log('WARN', 'Failed to finalize credit settlement for failed run', {
                run_id: runId,
                error: billingError.message
            });
        }

        await updateRunStatus(runId, failureStatus, {
            completed_at: new Date().toISOString(),
            error: errorType,
            error_message: error.message,
            feature_flags: featureFlags,
            billing_summary: failureBillingSummary
        });

        if (isSchemaError) {
            return {
                success: false,
                run_id: runId,
                error: errorType,
                message: error.message,
                _debug_details: error.details
            };
        }
        throw error;
    }
};

/**
 * Main Lambda handler
 */
exports.normalizeHighlightsWithManifest = normalizeHighlightsWithManifest;
exports.__testHooks = {
    isSchemaLikeError,
    classifyParseErrorClass,
    isTimeBudgetExceededError,
    computeChunkBudgetWindow,
    evaluateCoverageGuardrail,
    derivePartialRunState,
    extractPartialFindingsFromRaw,
    scoreChecksForSidebar,
    getAiEligibleCheckIds,
    buildSemanticFallbackCheck,
    convertFindingsToChecks,
    isStrictQuestionAnchorText,
    buildQuestionAnchorPayload,
    evaluateQuestionAnchorGuardrail,
    applyNoInternalLinksNeutrality,
    buildQuestionAnchorGuardrailExplanation,
    normalizeChunkFindings,
    normalizeCreditReservation,
    finalizeCreditSettlement,
    buildMistralChunkResponseFormat,
    DEFAULT_AI_CHUNK_SIZE,
    DEFAULT_AI_COMPACT_CHUNK_SIZE,
    buildMalformedChunkCaptureEntry,
    captureMalformedChunkEntry,
    DEFAULT_AI_MALFORMED_CHUNK_CAPTURE_LIMIT,
    validateFindingsContract
};

exports.handler = async (event, context) => {
    log('INFO', 'Worker invoked', {
        records: event.Records?.length || 0,
        remaining_time_ms: context.getRemainingTimeInMillis()
    });

    const results = { batchItemFailures: [] };
    const debugResults = [];

    for (const record of event.Records || []) {
        try {
            const res = await processJob(record, context);
            debugResults.push(res);
        } catch (error) {
            log('ERROR', 'Record processing failed', { messageId: record.messageId, error: error.message });
            results.batchItemFailures.push({ itemIdentifier: record.messageId });
            debugResults.push({ error: error.message });
        }
    }

    // P5: Temporary debug return removed
    // results._debug_output = debugResults;

    log('INFO', 'Worker batch complete', {
        total: event.Records?.length || 0,
        failures: results.batchItemFailures.length
    });

    return results;
};
