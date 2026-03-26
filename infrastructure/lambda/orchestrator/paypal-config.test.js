const {
    PAYPAL_ENV_KEYS,
    TRIAL_CATALOG,
    PLAN_CATALOG,
    TOPUP_PACK_CATALOG,
    getPayPalConfig,
    getPublicBillingCatalog,
    resolvePlanCatalogEntry,
    resolvePlanCodeByProviderPlanId,
    resolveTopupPackEntry
} = require('./paypal-config');

describe('paypal-config', () => {
    test('exposes the agreed subscription plan catalog', () => {
        expect(PLAN_CATALOG.starter).toMatchObject({
            code: 'starter',
            price_usd: 10,
            included_credits: 60000,
            site_limit: 1
        });
        expect(PLAN_CATALOG.growth).toMatchObject({
            code: 'growth',
            price_usd: 22,
            included_credits: 100000,
            site_limit: 3,
            paypal_intro_plan_env_key: 'PAYPAL_PLAN_ID_GROWTH_INTRO',
            intro_offer: {
                type: 'percent_off_first_cycle',
                percent_off: 50
            }
        });
        expect(PLAN_CATALOG.pro).toMatchObject({
            code: 'pro',
            price_usd: 59,
            included_credits: 250000,
            site_limit: 10
        });
        expect(TRIAL_CATALOG).toMatchObject({
            code: 'free_trial',
            included_credits: 5000,
            duration_days: 7
        });
    });

    test('exposes the agreed top-up catalog', () => {
        expect(TOPUP_PACK_CATALOG.topup_25k).toMatchObject({ code: 'topup_25k', credits: 25000, price_usd: 7 });
        expect(TOPUP_PACK_CATALOG.topup_100k).toMatchObject({ code: 'topup_100k', credits: 100000, price_usd: 25 });
        expect(TOPUP_PACK_CATALOG.topup_300k).toMatchObject({ code: 'topup_300k', credits: 300000, price_usd: 69 });
    });

    test('resolves safe environment variable names and runtime config values', () => {
        expect(PAYPAL_ENV_KEYS).toMatchObject({
            API_BASE: 'PAYPAL_API_BASE',
            CLIENT_ID: 'PAYPAL_CLIENT_ID',
            CLIENT_SECRET: 'PAYPAL_CLIENT_SECRET',
            WEBHOOK_ID: 'PAYPAL_WEBHOOK_ID'
        });

        const config = getPayPalConfig({
            PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
            PAYPAL_CLIENT_ID: 'client-id',
            PAYPAL_CLIENT_SECRET: 'secret',
            PAYPAL_WEBHOOK_ID: 'wh_123',
            PAYPAL_BRAND_NAME: 'AiVI',
            PAYPAL_RETURN_URL: 'https://example.com/return',
            PAYPAL_CANCEL_URL: 'https://example.com/cancel',
            PAYPAL_PLAN_ID_STARTER: 'P-STARTER',
            PAYPAL_PLAN_ID_GROWTH: 'P-GROWTH',
            PAYPAL_PLAN_ID_GROWTH_INTRO: 'P-GROWTH-INTRO',
            PAYPAL_PLAN_ID_PRO: 'P-PRO'
        });

        expect(config).toMatchObject({
            provider: 'paypal',
            apiBase: 'https://api-m.sandbox.paypal.com',
            clientId: 'client-id',
            clientSecret: 'secret',
            webhookId: 'wh_123',
            brandName: 'AiVI',
            returnUrl: 'https://example.com/return',
            cancelUrl: 'https://example.com/cancel',
            planIds: {
                starter: 'P-STARTER',
                growth: 'P-GROWTH',
                growth_intro: 'P-GROWTH-INTRO',
                pro: 'P-PRO'
            }
        });
    });

    test('returns a public catalog without provider secrets or raw plan ids', () => {
        const catalog = getPublicBillingCatalog();

        expect(catalog.provider).toBe('paypal');
        expect(Array.isArray(catalog.plans)).toBe(true);
        expect(Array.isArray(catalog.topups)).toBe(true);
        expect(JSON.stringify(catalog)).not.toContain('PAYPAL_CLIENT_SECRET');
        expect(JSON.stringify(catalog)).not.toContain('PAYPAL_PLAN_ID_');
    });

    test('resolves plan and top-up entries by code', () => {
        expect(resolvePlanCatalogEntry('growth')).toEqual(PLAN_CATALOG.growth);
        expect(resolvePlanCatalogEntry('GROWTH')).toEqual(PLAN_CATALOG.growth);
        expect(resolveTopupPackEntry('topup_100k')).toEqual(TOPUP_PACK_CATALOG.topup_100k);
        expect(resolveTopupPackEntry('missing')).toBeNull();
    });

    test('maps growth intro provider plans back to the canonical growth plan code', () => {
        expect(resolvePlanCodeByProviderPlanId({
            planIds: {
                growth: 'P-GROWTH',
                growth_intro: 'P-GROWTH-INTRO'
            }
        }, 'P-GROWTH-INTRO')).toBe('growth');
    });
});
