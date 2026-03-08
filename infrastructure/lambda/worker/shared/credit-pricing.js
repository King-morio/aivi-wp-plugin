/**
 * Credit pricing helpers
 *
 * Centralizes model pricing lookup and token-to-credit conversion so billing
 * math is deterministic before ledger persistence is wired in.
 */

const PRICING_VERSION = 'mistral-public-2026-03-06';
const DEFAULT_CREDIT_MULTIPLIER = 30000;
const DEFAULT_BILLABLE_MODEL = 'mistral-large-2512';
const DEFAULT_RESERVATION_INPUT_MULTIPLIER = 5;
const DEFAULT_RESERVATION_INPUT_OVERHEAD = 18000;
const DEFAULT_MIN_INPUT_RESERVATION_TOKENS = 24000;
const DEFAULT_MAX_INPUT_RESERVATION_TOKENS = 120000;
const DEFAULT_OUTPUT_RESERVATION_RATIO = 0.12;
const DEFAULT_MIN_OUTPUT_RESERVATION_TOKENS = 2500;
const DEFAULT_MAX_OUTPUT_RESERVATION_TOKENS = 8000;

const MODEL_ALIAS_MAP = Object.freeze({
    'mistral-large-latest': 'mistral-large-2512',
    'mistral-large-2512': 'mistral-large-2512',
    'magistral-small-latest': 'magistral-small-2509',
    'magistral-small-2509': 'magistral-small-2509'
});

const MODEL_RATE_CARD = Object.freeze({
    'mistral-large-2512': Object.freeze({
        display_name: 'Mistral Large 2',
        input_rate_usd_per_million: 0.5,
        output_rate_usd_per_million: 1.5,
        context_window: 128000
    }),
    'magistral-small-2509': Object.freeze({
        display_name: 'Magistral Small 1.2',
        input_rate_usd_per_million: 0.5,
        output_rate_usd_per_million: 1.5,
        context_window: 40000
    })
});

function normalizeNonNegativeInt(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
}

function normalizeTokenUsage(usage = {}) {
    const inputTokens = normalizeNonNegativeInt(usage.input_tokens);
    const outputTokens = normalizeNonNegativeInt(usage.output_tokens);

    return {
        input_tokens: inputTokens,
        output_tokens: outputTokens
    };
}

function normalizeRequestedModel(modelName) {
    return String(modelName || '').trim().toLowerCase();
}

function resolveModelPricing(modelName, options = {}) {
    const aliasMap = options.aliasMap || MODEL_ALIAS_MAP;
    const rateCard = options.rateCard || MODEL_RATE_CARD;
    const fallbackModel = options.fallbackModel || DEFAULT_BILLABLE_MODEL;
    const requestedModel = normalizeRequestedModel(modelName);
    const billableModel = aliasMap[requestedModel] || fallbackModel;
    const rate = rateCard[billableModel] || rateCard[fallbackModel];

    if (!rate) {
        throw new Error(`credit_pricing_unconfigured: Missing pricing entry for "${billableModel}"`);
    }

    return {
        pricing_version: options.pricingVersion || PRICING_VERSION,
        requested_model: requestedModel || fallbackModel,
        billable_model: billableModel,
        rate_source: aliasMap[requestedModel] ? 'catalog' : 'default_fallback',
        input_rate_usd_per_million: Number(rate.input_rate_usd_per_million),
        output_rate_usd_per_million: Number(rate.output_rate_usd_per_million),
        context_window: Number.isFinite(rate.context_window) ? Number(rate.context_window) : null,
        credit_multiplier: normalizeNonNegativeInt(options.creditMultiplier || DEFAULT_CREDIT_MULTIPLIER) || DEFAULT_CREDIT_MULTIPLIER
    };
}

function calculateWeightedTokens(usage = {}) {
    const normalized = normalizeTokenUsage(usage);
    return normalized.input_tokens + (normalized.output_tokens * 3);
}

function calculateRawCostMicros(usage = {}, pricing = {}) {
    const normalized = normalizeTokenUsage(usage);
    const inputRate = Number(pricing.input_rate_usd_per_million || 0);
    const outputRate = Number(pricing.output_rate_usd_per_million || 0);
    const inputMicros = normalized.input_tokens * inputRate;
    const outputMicros = normalized.output_tokens * outputRate;
    return Math.round(inputMicros + outputMicros);
}

function microsToUsd(micros) {
    const normalizedMicros = normalizeNonNegativeInt(micros);
    return Number((normalizedMicros / 1000000).toFixed(6));
}

function calculateCreditsUsed(rawCostMicros, creditMultiplier = DEFAULT_CREDIT_MULTIPLIER) {
    const normalizedMicros = normalizeNonNegativeInt(rawCostMicros);
    const multiplier = normalizeNonNegativeInt(creditMultiplier) || DEFAULT_CREDIT_MULTIPLIER;
    if (normalizedMicros <= 0) return 0;
    return Math.ceil((normalizedMicros * multiplier) / 1000000);
}

function buildUsageSettlementPreview({ model, usage, creditMultiplier } = {}) {
    const normalizedUsage = normalizeTokenUsage(usage);
    const pricing = resolveModelPricing(model, { creditMultiplier });
    const rawCostMicros = calculateRawCostMicros(normalizedUsage, pricing);

    return {
        pricing_snapshot: pricing,
        usage_snapshot: {
            input_tokens: normalizedUsage.input_tokens,
            output_tokens: normalizedUsage.output_tokens,
            weighted_tokens: calculateWeightedTokens(normalizedUsage),
            raw_cost_micros: rawCostMicros,
            raw_cost_usd: microsToUsd(rawCostMicros),
            credits_used: calculateCreditsUsed(rawCostMicros, pricing.credit_multiplier)
        }
    };
}

function estimateReservationInputTokens({ tokenEstimate, manifest } = {}) {
    const directEstimate = normalizeNonNegativeInt(tokenEstimate);
    const manifestWordEstimate = normalizeNonNegativeInt(manifest?.wordEstimate);
    const plainTextLength = normalizeNonNegativeInt(manifest?.plain_text ? String(manifest.plain_text).length : 0);
    const fallbackBase = manifestWordEstimate > 0
        ? Math.ceil(manifestWordEstimate * 1.35)
        : Math.ceil(plainTextLength / 4);
    const baseTokens = directEstimate || fallbackBase;
    const estimated = Math.ceil((baseTokens * DEFAULT_RESERVATION_INPUT_MULTIPLIER) + DEFAULT_RESERVATION_INPUT_OVERHEAD);
    return Math.min(
        DEFAULT_MAX_INPUT_RESERVATION_TOKENS,
        Math.max(DEFAULT_MIN_INPUT_RESERVATION_TOKENS, estimated)
    );
}

function estimateReservationOutputTokens(estimatedInputTokens) {
    const base = normalizeNonNegativeInt(estimatedInputTokens);
    const estimated = Math.ceil(base * DEFAULT_OUTPUT_RESERVATION_RATIO);
    return Math.min(
        DEFAULT_MAX_OUTPUT_RESERVATION_TOKENS,
        Math.max(DEFAULT_MIN_OUTPUT_RESERVATION_TOKENS, estimated)
    );
}

function buildReservationPreview({ model, tokenEstimate, manifest, creditMultiplier } = {}) {
    const estimatedInputTokens = estimateReservationInputTokens({ tokenEstimate, manifest });
    const estimatedOutputTokens = estimateReservationOutputTokens(estimatedInputTokens);
    return buildUsageSettlementPreview({
        model,
        creditMultiplier,
        usage: {
            input_tokens: estimatedInputTokens,
            output_tokens: estimatedOutputTokens
        }
    });
}

module.exports = {
    PRICING_VERSION,
    DEFAULT_CREDIT_MULTIPLIER,
    DEFAULT_BILLABLE_MODEL,
    DEFAULT_RESERVATION_INPUT_MULTIPLIER,
    DEFAULT_RESERVATION_INPUT_OVERHEAD,
    DEFAULT_MIN_INPUT_RESERVATION_TOKENS,
    DEFAULT_MAX_INPUT_RESERVATION_TOKENS,
    DEFAULT_OUTPUT_RESERVATION_RATIO,
    DEFAULT_MIN_OUTPUT_RESERVATION_TOKENS,
    DEFAULT_MAX_OUTPUT_RESERVATION_TOKENS,
    MODEL_ALIAS_MAP,
    MODEL_RATE_CARD,
    normalizeTokenUsage,
    resolveModelPricing,
    calculateWeightedTokens,
    calculateRawCostMicros,
    microsToUsd,
    calculateCreditsUsed,
    buildUsageSettlementPreview,
    estimateReservationInputTokens,
    estimateReservationOutputTokens,
    buildReservationPreview
};
