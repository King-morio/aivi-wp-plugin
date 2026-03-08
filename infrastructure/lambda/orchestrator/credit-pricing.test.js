const {
    PRICING_VERSION,
    DEFAULT_CREDIT_MULTIPLIER,
    DEFAULT_BILLABLE_MODEL,
    DEFAULT_MIN_INPUT_RESERVATION_TOKENS,
    DEFAULT_MAX_OUTPUT_RESERVATION_TOKENS,
    resolveModelPricing,
    calculateWeightedTokens,
    calculateRawCostMicros,
    microsToUsd,
    calculateCreditsUsed,
    buildUsageSettlementPreview,
    estimateReservationInputTokens,
    estimateReservationOutputTokens,
    buildReservationPreview
} = require('./credit-pricing');

describe('credit-pricing', () => {
    test('resolves latest aliases to stable billable models', () => {
        const large = resolveModelPricing('mistral-large-latest');
        const small = resolveModelPricing('magistral-small-latest');

        expect(large.pricing_version).toBe(PRICING_VERSION);
        expect(large.billable_model).toBe('mistral-large-2512');
        expect(large.rate_source).toBe('catalog');

        expect(small.billable_model).toBe('magistral-small-2509');
        expect(small.rate_source).toBe('catalog');
    });

    test('falls back to default billable model when requested model is unknown', () => {
        const pricing = resolveModelPricing('unknown-model');

        expect(pricing.billable_model).toBe(DEFAULT_BILLABLE_MODEL);
        expect(pricing.rate_source).toBe('default_fallback');
    });

    test('calculates weighted tokens with 3x output weighting', () => {
        const result = calculateWeightedTokens({
            input_tokens: 42000,
            output_tokens: 12000
        });

        expect(result).toBe(78000);
    });

    test('calculates raw cost in micros from actual model rates', () => {
        const pricing = resolveModelPricing('mistral-large-latest');
        const micros = calculateRawCostMicros({
            input_tokens: 35000,
            output_tokens: 5000
        }, pricing);

        expect(micros).toBe(25000);
        expect(microsToUsd(micros)).toBe(0.025);
    });

    test('converts raw cost to large visible credit balances', () => {
        const credits = calculateCreditsUsed(25000, DEFAULT_CREDIT_MULTIPLIER);
        expect(credits).toBe(750);
    });

    test('builds a full settlement preview snapshot', () => {
        const preview = buildUsageSettlementPreview({
            model: 'mistral-large-latest',
            usage: {
                input_tokens: 80000,
                output_tokens: 15000
            }
        });

        expect(preview.pricing_snapshot.billable_model).toBe('mistral-large-2512');
        expect(preview.pricing_snapshot.credit_multiplier).toBe(DEFAULT_CREDIT_MULTIPLIER);
        expect(preview.usage_snapshot.weighted_tokens).toBe(125000);
        expect(preview.usage_snapshot.raw_cost_micros).toBe(62500);
        expect(preview.usage_snapshot.raw_cost_usd).toBe(0.0625);
        expect(preview.usage_snapshot.credits_used).toBe(1875);
    });

    test('normalizes invalid usage to zero instead of producing negative costs', () => {
        const preview = buildUsageSettlementPreview({
            model: 'mistral-large-latest',
            usage: {
                input_tokens: -10,
                output_tokens: 'not-a-number'
            }
        });

        expect(preview.usage_snapshot.input_tokens).toBe(0);
        expect(preview.usage_snapshot.output_tokens).toBe(0);
        expect(preview.usage_snapshot.raw_cost_micros).toBe(0);
        expect(preview.usage_snapshot.credits_used).toBe(0);
    });

    test('builds a bounded reservation estimate from preflight token estimate', () => {
        const estimatedInput = estimateReservationInputTokens({ tokenEstimate: 3200 });
        const estimatedOutput = estimateReservationOutputTokens(estimatedInput);
        const preview = buildReservationPreview({
            model: 'mistral-large-latest',
            tokenEstimate: 3200
        });

        expect(estimatedInput).toBeGreaterThanOrEqual(DEFAULT_MIN_INPUT_RESERVATION_TOKENS);
        expect(estimatedOutput).toBeLessThanOrEqual(DEFAULT_MAX_OUTPUT_RESERVATION_TOKENS);
        expect(preview.usage_snapshot.input_tokens).toBe(estimatedInput);
        expect(preview.usage_snapshot.output_tokens).toBe(estimatedOutput);
        expect(preview.usage_snapshot.credits_used).toBeGreaterThan(0);
    });
});
