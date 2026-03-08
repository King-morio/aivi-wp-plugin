const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const defaultDdbDoc = DynamoDBDocumentClient.from(ddbClient);

const DEFAULT_ACCOUNT_BILLING_STATE_TABLE = 'aivi-account-billing-state-dev';

const PLAN_DEFINITIONS = Object.freeze({
    free_trial: Object.freeze({ code: 'free_trial', label: 'Free Trial', included_credits: 15000, site_limit: 1 }),
    starter: Object.freeze({ code: 'starter', label: 'Starter', included_credits: 60000, site_limit: 1 }),
    growth: Object.freeze({ code: 'growth', label: 'Growth', included_credits: 150000, site_limit: 3 }),
    pro: Object.freeze({ code: 'pro', label: 'Pro', included_credits: 450000, site_limit: 10 })
});

const sanitizeString = (value) => String(value || '').trim();
const normalizeNullableInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};
const normalizeNonNegativeInt = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
};
const normalizeBool = (value, fallback = false) => (value === true || value === 'true' ? true : value === false || value === 'false' ? false : fallback);
const normalizeIso = (value) => {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};
const getEnv = (env, key, fallback = '') => sanitizeString((env || process.env || {})[key] || fallback);

const getTableName = (env) => getEnv(env, 'ACCOUNT_BILLING_STATE_TABLE') || getEnv(env, 'BILLING_ACCOUNT_STATE_TABLE') || DEFAULT_ACCOUNT_BILLING_STATE_TABLE;

const getPlanDefinition = (planCode) => PLAN_DEFINITIONS[sanitizeString(planCode).toLowerCase()] || null;

const computeTotalRemaining = (state) => {
    const included = normalizeNullableInt(state?.credits?.included_remaining);
    const topup = normalizeNullableInt(state?.credits?.topup_remaining);
    if (included === null && topup === null) return null;
    return (included || 0) + (topup || 0);
};

const extractDomain = (rawUrl) => {
    const candidate = sanitizeString(rawUrl);
    if (!candidate) return '';
    try {
        return new URL(candidate).hostname || '';
    } catch (error) {
        return '';
    }
};

const buildDefaultAccountBillingState = ({ accountId = '', siteId = '', blogId = 0, homeUrl = '', pluginVersion = '' } = {}) => ({
    schema_version: 'v1',
    account_id: sanitizeString(accountId),
    account_label: '',
    connected: !!sanitizeString(accountId),
    connection_status: sanitizeString(accountId) ? 'connected' : 'disconnected',
    plan_code: '',
    plan_name: '',
    subscription_status: '',
    trial_status: '',
    trial_expires_at: null,
    site_binding_status: sanitizeString(siteId) ? 'connected' : 'unbound',
    credits: {
        included_remaining: 0,
        topup_remaining: 0,
        reserved_credits: 0,
        total_remaining: 0,
        monthly_included: 0,
        monthly_used: 0,
        last_run_debit: 0
    },
    entitlements: {
        analysis_allowed: false,
        web_lookups_allowed: true,
        max_sites: null,
        site_limit_reached: false
    },
    usage: {
        analyses_this_month: 0,
        credits_used_this_month: 0,
        last_analysis_at: null,
        last_run_status: null
    },
    site: {
        site_id: sanitizeString(siteId),
        blog_id: normalizeNullableInt(blogId) || 0,
        home_url: sanitizeString(homeUrl),
        connected_domain: extractDomain(homeUrl),
        plugin_version: sanitizeString(pluginVersion)
    },
    subscription: {
        provider_subscription_id: '',
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        credit_cycle_key: '',
        last_event_type: ''
    },
    topup: {
        granted_order_ids: []
    },
    updated_at: new Date().toISOString()
});

const normalizeGrantedOrderIds = (value) => {
    const items = Array.isArray(value) ? value : [];
    return items.map((item) => sanitizeString(item)).filter(Boolean).slice(-50);
};

const normalizeAccountBillingState = (state = {}, defaults = {}) => {
    const base = {
        ...buildDefaultAccountBillingState(defaults),
        ...(state && typeof state === 'object' ? state : {})
    };
    const plan = getPlanDefinition(base.plan_code);
    const includedRemaining = normalizeNonNegativeInt(base?.credits?.included_remaining);
    const topupRemaining = normalizeNonNegativeInt(base?.credits?.topup_remaining);
    const reservedCredits = normalizeNonNegativeInt(base?.credits?.reserved_credits);
    const monthlyIncluded = normalizeNonNegativeInt(base?.credits?.monthly_included);
    const monthlyUsed = normalizeNonNegativeInt(base?.credits?.monthly_used);
    const totalRemaining = includedRemaining + topupRemaining;
    const subscriptionStatus = sanitizeString(base.subscription_status).toLowerCase();
    const trialStatus = sanitizeString(base.trial_status).toLowerCase();
    const trialActive = trialStatus === 'active';
    const subscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'created';
    const analysisAllowed = trialActive || subscriptionActive;

    return {
        schema_version: 'v1',
        account_id: sanitizeString(base.account_id),
        account_label: sanitizeString(base.account_label),
        connected: normalizeBool(base.connected, !!sanitizeString(base.account_id)),
        connection_status: sanitizeString(base.connection_status || 'connected') || 'connected',
        plan_code: sanitizeString(base.plan_code),
        plan_name: sanitizeString(base.plan_name || plan?.label || ''),
        subscription_status: subscriptionStatus,
        trial_status: trialStatus,
        trial_expires_at: base.trial_expires_at ? normalizeIso(base.trial_expires_at) : null,
        site_binding_status: sanitizeString(base.site_binding_status || 'connected'),
        credits: {
            included_remaining: includedRemaining,
            topup_remaining: topupRemaining,
            reserved_credits: reservedCredits,
            total_remaining: totalRemaining,
            monthly_included: monthlyIncluded,
            monthly_used: monthlyUsed,
            last_run_debit: normalizeNonNegativeInt(base?.credits?.last_run_debit)
        },
        entitlements: {
            analysis_allowed: normalizeBool(base?.entitlements?.analysis_allowed, analysisAllowed),
            web_lookups_allowed: normalizeBool(base?.entitlements?.web_lookups_allowed, true),
            max_sites: normalizeNullableInt(base?.entitlements?.max_sites) ?? normalizeNullableInt(plan?.site_limit),
            site_limit_reached: normalizeBool(base?.entitlements?.site_limit_reached, false)
        },
        usage: {
            analyses_this_month: normalizeNonNegativeInt(base?.usage?.analyses_this_month),
            credits_used_this_month: normalizeNonNegativeInt(base?.usage?.credits_used_this_month),
            last_analysis_at: base?.usage?.last_analysis_at ? normalizeIso(base.usage.last_analysis_at) : null,
            last_run_status: sanitizeString(base?.usage?.last_run_status)
        },
        site: {
            site_id: sanitizeString(base?.site?.site_id || defaults.siteId),
            blog_id: normalizeNullableInt(base?.site?.blog_id) || normalizeNullableInt(defaults.blogId) || 0,
            home_url: sanitizeString(base?.site?.home_url || defaults.homeUrl),
            connected_domain: sanitizeString(base?.site?.connected_domain || extractDomain(base?.site?.home_url || defaults.homeUrl)),
            plugin_version: sanitizeString(base?.site?.plugin_version || defaults.pluginVersion)
        },
        subscription: {
            provider_subscription_id: sanitizeString(base?.subscription?.provider_subscription_id),
            current_period_start: base?.subscription?.current_period_start ? normalizeIso(base.subscription.current_period_start) : null,
            current_period_end: base?.subscription?.current_period_end ? normalizeIso(base.subscription.current_period_end) : null,
            cancel_at_period_end: normalizeBool(base?.subscription?.cancel_at_period_end, false),
            credit_cycle_key: sanitizeString(base?.subscription?.credit_cycle_key),
            last_event_type: sanitizeString(base?.subscription?.last_event_type)
        },
        topup: {
            granted_order_ids: normalizeGrantedOrderIds(base?.topup?.granted_order_ids)
        },
        updated_at: normalizeIso(base.updated_at)
    };
};

const buildCycleKey = (subscriptionRecord = {}) => {
    const start = sanitizeString(subscriptionRecord.current_period_start);
    const end = sanitizeString(subscriptionRecord.current_period_end);
    if (start && end) return `${start}|${end}`;
    return start || end || sanitizeString(subscriptionRecord.provider_subscription_id);
};

const applySubscriptionRecordToState = (state, subscriptionRecord) => {
    const current = normalizeAccountBillingState(state);
    const plan = getPlanDefinition(subscriptionRecord.plan_code);
    const cycleKey = buildCycleKey(subscriptionRecord);
    const previousCycleKey = sanitizeString(current.subscription.credit_cycle_key);
    const shouldGrantCycleCredits = !!plan && sanitizeString(subscriptionRecord.status).toLowerCase() === 'active' && cycleKey && cycleKey !== previousCycleKey;
    const next = normalizeAccountBillingState({
        ...current,
        connected: true,
        connection_status: 'connected',
        plan_code: sanitizeString(subscriptionRecord.plan_code),
        plan_name: plan?.label || current.plan_name,
        subscription_status: sanitizeString(subscriptionRecord.status).toLowerCase(),
        trial_status: current.trial_status === 'active' ? 'converted' : current.trial_status,
        entitlements: {
            ...current.entitlements,
            analysis_allowed: sanitizeString(subscriptionRecord.status).toLowerCase() === 'active',
            max_sites: plan?.site_limit ?? current.entitlements.max_sites
        },
        credits: shouldGrantCycleCredits ? {
            ...current.credits,
            included_remaining: normalizeNonNegativeInt(plan.included_credits),
            monthly_included: normalizeNonNegativeInt(plan.included_credits),
            monthly_used: 0
        } : current.credits,
        subscription: {
            provider_subscription_id: sanitizeString(subscriptionRecord.provider_subscription_id),
            current_period_start: subscriptionRecord.current_period_start || null,
            current_period_end: subscriptionRecord.current_period_end || null,
            cancel_at_period_end: normalizeBool(subscriptionRecord.cancel_at_period_end, false),
            credit_cycle_key: cycleKey || previousCycleKey,
            last_event_type: sanitizeString(subscriptionRecord.last_event_type)
        },
        updated_at: subscriptionRecord.updated_at || new Date().toISOString()
    }, current.site);

    return {
        state: next,
        granted_cycle_credits: shouldGrantCycleCredits ? normalizeNonNegativeInt(plan.included_credits) : 0,
        cycle_key: cycleKey
    };
};

const applyTopupGrantToState = (state, topupOrderRecord) => {
    const current = normalizeAccountBillingState(state);
    const orderId = sanitizeString(topupOrderRecord.provider_order_id);
    const alreadyGranted = current.topup.granted_order_ids.includes(orderId);
    if (!orderId || alreadyGranted || sanitizeString(topupOrderRecord.status).toLowerCase() !== 'captured') {
        return {
            state: current,
            granted_topup_credits: 0
        };
    }

    const grantedCredits = normalizeNonNegativeInt(topupOrderRecord.credits);
    const next = normalizeAccountBillingState({
        ...current,
        credits: {
            ...current.credits,
            topup_remaining: current.credits.topup_remaining + grantedCredits
        },
        topup: {
            granted_order_ids: [...current.topup.granted_order_ids, orderId]
        },
        updated_at: topupOrderRecord.updated_at || new Date().toISOString()
    }, current.site);

    return {
        state: next,
        granted_topup_credits: grantedCredits
    };
};

const applyLedgerEventToState = (state, ledgerEvent) => {
    const current = normalizeAccountBillingState(state);
    const eventType = sanitizeString(ledgerEvent?.event_type).toLowerCase();
    const amounts = ledgerEvent?.amounts || {};
    const reservedCredits = normalizeNonNegativeInt(amounts.reserved_credits);
    const settledCredits = normalizeNonNegativeInt(amounts.settled_credits);
    const refundedCredits = normalizeNonNegativeInt(amounts.refunded_credits);

    const next = JSON.parse(JSON.stringify(current));
    next.updated_at = ledgerEvent?.updated_at || ledgerEvent?.created_at || new Date().toISOString();

    if (eventType === 'reservation') {
        next.credits.reserved_credits += reservedCredits;
        return normalizeAccountBillingState(next, current.site);
    }

    if (eventType === 'refund') {
        next.credits.reserved_credits = Math.max(next.credits.reserved_credits - refundedCredits, 0);
        return normalizeAccountBillingState(next, current.site);
    }

    if (eventType === 'settlement') {
        next.credits.reserved_credits = Math.max(next.credits.reserved_credits - reservedCredits, 0);
        let remainingDebit = settledCredits;
        const includedDebit = Math.min(next.credits.included_remaining, remainingDebit);
        next.credits.included_remaining -= includedDebit;
        remainingDebit -= includedDebit;
        if (remainingDebit > 0) {
            const topupDebit = Math.min(next.credits.topup_remaining, remainingDebit);
            next.credits.topup_remaining -= topupDebit;
            remainingDebit -= topupDebit;
        }
        next.credits.last_run_debit = settledCredits;
        next.credits.monthly_used += settledCredits;
        next.usage.credits_used_this_month += settledCredits;
        next.usage.analyses_this_month += 1;
        next.usage.last_analysis_at = next.updated_at;
        next.usage.last_run_status = settledCredits === 0 && refundedCredits > 0 ? 'zero_charge' : 'success';
        return normalizeAccountBillingState(next, current.site);
    }

    if (eventType === 'adjustment') {
        const grantedCredits = normalizeNonNegativeInt(amounts.granted_credits);
        let remainingDebit = settledCredits;
        if (grantedCredits > 0) {
            next.credits.topup_remaining += grantedCredits;
        }
        if (remainingDebit > 0) {
            const topupDebit = Math.min(next.credits.topup_remaining, remainingDebit);
            next.credits.topup_remaining -= topupDebit;
            remainingDebit -= topupDebit;
        }
        if (remainingDebit > 0) {
            const includedDebit = Math.min(next.credits.included_remaining, remainingDebit);
            next.credits.included_remaining -= includedDebit;
            remainingDebit -= includedDebit;
        }
        return normalizeAccountBillingState(next, current.site);
    }

    return normalizeAccountBillingState(next, current.site);
};

const buildRemoteAccountPayload = (state, siteContext = {}, supportLinks = {}) => {
    const normalized = normalizeAccountBillingState(state, siteContext);
    const trialActive = normalized.trial_status === 'active';
    return {
        schema_version: 'v1',
        account_state: {
            connected: normalized.connected,
            connection_status: normalized.connection_status,
            account_id: normalized.account_id,
            account_label: normalized.account_label,
            plan_code: normalized.plan_code,
            plan_name: normalized.plan_name,
            subscription_status: normalized.subscription_status,
            trial_status: normalized.trial_status,
            trial_expires_at: normalized.trial_expires_at,
            site_binding_status: normalized.site_binding_status,
            credits: {
                included_remaining: normalized.credits.included_remaining,
                topup_remaining: normalized.credits.topup_remaining,
                last_run_debit: normalized.credits.last_run_debit
            },
            entitlements: {
                analysis_allowed: normalized.entitlements.analysis_allowed,
                web_lookups_allowed: normalized.entitlements.web_lookups_allowed,
                max_sites: normalized.entitlements.max_sites,
                site_limit_reached: normalized.entitlements.site_limit_reached
            },
            site: normalized.site,
            updated_at: normalized.updated_at
        },
        dashboard_summary: {
            schema_version: 'v1',
            account: {
                connected: normalized.connected,
                connection_status: normalized.connection_status,
                display_state: normalized.connected ? 'connected' : 'disconnected',
                account_label: normalized.account_label,
                last_sync_at: normalized.updated_at
            },
            plan: {
                plan_code: normalized.plan_code,
                plan_name: normalized.plan_name,
                subscription_status: normalized.subscription_status,
                trial_status: normalized.trial_status,
                trial_active: trialActive,
                trial_expires_at: normalized.trial_expires_at,
                renewal_date: normalized.subscription.current_period_end,
                cancel_at: normalized.subscription.cancel_at_period_end ? normalized.subscription.current_period_end : null,
                max_sites: normalized.entitlements.max_sites
            },
            credits: {
                included_remaining: normalized.credits.included_remaining,
                topup_remaining: normalized.credits.topup_remaining,
                total_remaining: normalized.credits.total_remaining,
                reserved_credits: normalized.credits.reserved_credits,
                last_run_debit: normalized.credits.last_run_debit,
                monthly_included: normalized.credits.monthly_included,
                monthly_used: normalized.credits.monthly_used
            },
            usage: normalized.usage,
            site: {
                site_id: normalized.site.site_id,
                blog_id: normalized.site.blog_id,
                connected_domain: normalized.site.connected_domain,
                plugin_version: normalized.site.plugin_version,
                binding_status: normalized.site_binding_status
            },
            support: {
                docs_url: sanitizeString(supportLinks.docs_url),
                billing_url: sanitizeString(supportLinks.billing_url),
                support_url: sanitizeString(supportLinks.support_url),
                help_label: sanitizeString(supportLinks.help_label || 'AiVI Help')
            }
        }
    };
};

const createAccountBillingStateStore = ({ ddbDoc = defaultDdbDoc, env = process.env } = {}) => {
    const tableName = getTableName(env);
    return {
        async getAccountState(accountId) {
            const normalized = sanitizeString(accountId);
            if (!normalized) return null;
            const response = await ddbDoc.send(new GetCommand({
                TableName: tableName,
                Key: { account_id: normalized }
            }));
            return response?.Item ? normalizeAccountBillingState(response.Item) : null;
        },
        async putAccountState(state) {
            const normalized = normalizeAccountBillingState(state);
            if (!normalized.account_id) {
                throw new Error('billing_account_state_requires_account_id');
            }
            await ddbDoc.send(new PutCommand({
                TableName: tableName,
                Item: normalized
            }));
            return normalized;
        }
    };
};

module.exports = {
    DEFAULT_ACCOUNT_BILLING_STATE_TABLE,
    buildDefaultAccountBillingState,
    normalizeAccountBillingState,
    getPlanDefinition,
    computeTotalRemaining,
    applySubscriptionRecordToState,
    applyTopupGrantToState,
    applyLedgerEventToState,
    buildRemoteAccountPayload,
    createAccountBillingStateStore
};
