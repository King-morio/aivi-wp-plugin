const sanitizeString = (value) => String(value || '').trim();

const PAYPAL_ENV_KEYS = Object.freeze({
    API_BASE: 'PAYPAL_API_BASE',
    CLIENT_ID: 'PAYPAL_CLIENT_ID',
    CLIENT_SECRET: 'PAYPAL_CLIENT_SECRET',
    WEBHOOK_ID: 'PAYPAL_WEBHOOK_ID',
    BRAND_NAME: 'PAYPAL_BRAND_NAME',
    RETURN_URL: 'PAYPAL_RETURN_URL',
    CANCEL_URL: 'PAYPAL_CANCEL_URL',
    PLAN_IDS: Object.freeze({
        starter: 'PAYPAL_PLAN_ID_STARTER',
        growth: 'PAYPAL_PLAN_ID_GROWTH',
        growth_intro: 'PAYPAL_PLAN_ID_GROWTH_INTRO',
        pro: 'PAYPAL_PLAN_ID_PRO'
    })
});

const TRIAL_CATALOG = Object.freeze({
    code: 'free_trial',
    label: 'Free Trial',
    billing_type: 'trial',
    price_usd: 0,
    included_credits: 5000,
    site_limit: 1,
    duration_days: 7
});

const PLAN_CATALOG = Object.freeze({
    starter: Object.freeze({
        code: 'starter',
        label: 'Starter',
        billing_type: 'subscription',
        price_usd: 10,
        included_credits: 60000,
        site_limit: 1,
        history_days: 30,
        paypal_plan_env_key: PAYPAL_ENV_KEYS.PLAN_IDS.starter
    }),
    growth: Object.freeze({
        code: 'growth',
        label: 'Growth',
        billing_type: 'subscription',
        price_usd: 22,
        included_credits: 100000,
        site_limit: 3,
        history_days: 90,
        intro_offer: Object.freeze({
            type: 'percent_off_first_cycle',
            percent_off: 50
        }),
        paypal_intro_plan_env_key: PAYPAL_ENV_KEYS.PLAN_IDS.growth_intro,
        paypal_plan_env_key: PAYPAL_ENV_KEYS.PLAN_IDS.growth
    }),
    pro: Object.freeze({
        code: 'pro',
        label: 'Pro',
        billing_type: 'subscription',
        price_usd: 59,
        included_credits: 250000,
        site_limit: 10,
        history_days: 365,
        paypal_plan_env_key: PAYPAL_ENV_KEYS.PLAN_IDS.pro
    })
});

const TOPUP_PACK_CATALOG = Object.freeze({
    topup_25k: Object.freeze({
        code: 'topup_25k',
        label: '25,000 Credits',
        billing_type: 'topup',
        credits: 25000,
        price_usd: 7
    }),
    topup_100k: Object.freeze({
        code: 'topup_100k',
        label: '100,000 Credits',
        billing_type: 'topup',
        credits: 100000,
        price_usd: 25
    }),
    topup_300k: Object.freeze({
        code: 'topup_300k',
        label: '300,000 Credits',
        billing_type: 'topup',
        credits: 300000,
        price_usd: 69
    })
});

const getPayPalConfig = (env = process.env) => ({
    provider: 'paypal',
    apiBase: sanitizeString(env[PAYPAL_ENV_KEYS.API_BASE]),
    clientId: sanitizeString(env[PAYPAL_ENV_KEYS.CLIENT_ID]),
    clientSecret: sanitizeString(env[PAYPAL_ENV_KEYS.CLIENT_SECRET]),
    webhookId: sanitizeString(env[PAYPAL_ENV_KEYS.WEBHOOK_ID]),
    brandName: sanitizeString(env[PAYPAL_ENV_KEYS.BRAND_NAME] || 'AiVI'),
    returnUrl: sanitizeString(env[PAYPAL_ENV_KEYS.RETURN_URL]),
    cancelUrl: sanitizeString(env[PAYPAL_ENV_KEYS.CANCEL_URL]),
    planIds: Object.freeze({
        starter: sanitizeString(env[PAYPAL_ENV_KEYS.PLAN_IDS.starter]),
        growth: sanitizeString(env[PAYPAL_ENV_KEYS.PLAN_IDS.growth]),
        growth_intro: sanitizeString(env[PAYPAL_ENV_KEYS.PLAN_IDS.growth_intro]),
        pro: sanitizeString(env[PAYPAL_ENV_KEYS.PLAN_IDS.pro])
    })
});

const getPublicBillingCatalog = () => ({
    provider: 'paypal',
    trial: TRIAL_CATALOG,
    plans: Object.values(PLAN_CATALOG).map((plan) => ({
        code: plan.code,
        label: plan.label,
        billing_type: plan.billing_type,
        price_usd: plan.price_usd,
        included_credits: plan.included_credits,
        site_limit: plan.site_limit,
        history_days: plan.history_days,
        ...(plan.intro_offer ? { intro_offer: plan.intro_offer } : {})
    })),
    topups: Object.values(TOPUP_PACK_CATALOG).map((pack) => ({
        code: pack.code,
        label: pack.label,
        billing_type: pack.billing_type,
        credits: pack.credits,
        price_usd: pack.price_usd
    }))
});

const resolvePlanCatalogEntry = (planCode) => {
    const normalized = sanitizeString(planCode).toLowerCase();
    return PLAN_CATALOG[normalized] || null;
};

const resolvePlanCodeByProviderPlanId = (config, providerPlanId) => {
    const target = sanitizeString(providerPlanId);
    if (!target) {
        return null;
    }

    const planIds = config?.planIds || {};
    if (sanitizeString(planIds.growth_intro) === target) {
        return 'growth';
    }
    return Object.keys(PLAN_CATALOG).find((code) => sanitizeString(planIds[code]) === target) || null;
};

const resolveTopupPackEntry = (packCode) => {
    const normalized = sanitizeString(packCode).toLowerCase();
    return TOPUP_PACK_CATALOG[normalized] || null;
};

module.exports = {
    PAYPAL_ENV_KEYS,
    TRIAL_CATALOG,
    PLAN_CATALOG,
    TOPUP_PACK_CATALOG,
    getPayPalConfig,
    getPublicBillingCatalog,
    resolvePlanCatalogEntry,
    resolvePlanCodeByProviderPlanId,
    resolveTopupPackEntry
};
