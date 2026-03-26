const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const defaultDdbDoc = DynamoDBDocumentClient.from(ddbClient);

const DEFAULT_ACCOUNT_BILLING_STATE_TABLE = 'aivi-account-billing-state-dev';

const PLAN_DEFINITIONS = Object.freeze({
    free_trial: Object.freeze({ code: 'free_trial', label: 'Free Trial', included_credits: 5000, site_limit: 1, duration_days: 7 }),
    starter: Object.freeze({ code: 'starter', label: 'Starter', included_credits: 60000, site_limit: 1 }),
    growth: Object.freeze({ code: 'growth', label: 'Growth', included_credits: 100000, site_limit: 3 }),
    pro: Object.freeze({ code: 'pro', label: 'Pro', included_credits: 250000, site_limit: 10 })
});
const PLAN_RANK = Object.freeze({
    free_trial: 0,
    starter: 1,
    growth: 2,
    pro: 3
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
const normalizeOptionalIso = (value) => {
    const parsed = value ? new Date(value) : null;
    return !parsed || Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const getEnv = (env, key, fallback = '') => sanitizeString((env || process.env || {})[key] || fallback);

const getTableName = (env) => getEnv(env, 'ACCOUNT_BILLING_STATE_TABLE') || getEnv(env, 'BILLING_ACCOUNT_STATE_TABLE') || DEFAULT_ACCOUNT_BILLING_STATE_TABLE;

const getPlanDefinition = (planCode) => PLAN_DEFINITIONS[sanitizeString(planCode).toLowerCase()] || null;
const getPlanRank = (planCode) => PLAN_RANK[sanitizeString(planCode).toLowerCase()] || 0;
const resolveTrialStatus = (trialStatus, trialExpiresAt, now = Date.now()) => {
    const normalizedStatus = sanitizeString(trialStatus).toLowerCase();
    if (normalizedStatus !== 'active' || !trialExpiresAt) {
        return normalizedStatus;
    }
    const expiresAt = new Date(trialExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
        return normalizedStatus;
    }
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const comparisonMs = Number.isNaN(nowMs) ? Date.now() : nowMs;
    return expiresAt.getTime() <= comparisonMs ? 'ended' : normalizedStatus;
};

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

const normalizeSiteRecord = (site = {}, defaults = {}) => {
    const siteId = sanitizeString(site.site_id || defaults.siteId);
    const homeUrl = sanitizeString(site.home_url || defaults.homeUrl);
    const connectedDomain = sanitizeString(site.connected_domain || extractDomain(homeUrl || defaults.homeUrl));
    if (!siteId && !homeUrl && !connectedDomain) {
        return null;
    }
    return {
        site_id: siteId,
        blog_id: normalizeNullableInt(site.blog_id) || normalizeNullableInt(defaults.blogId) || 0,
        home_url: homeUrl,
        connected_domain: connectedDomain,
        plugin_version: sanitizeString(site.plugin_version || defaults.pluginVersion),
        binding_status: sanitizeString(site.binding_status || 'connected') || 'connected'
    };
};

const normalizeSites = (sites, legacySite = null, defaults = {}) => {
    const normalized = [];
    const seen = new Set();
    const pushSite = (value) => {
        const record = normalizeSiteRecord(value, defaults);
        if (!record) return;
        const key = record.site_id
            ? `id:${record.site_id}`
            : record.connected_domain
                ? `domain:${record.connected_domain.toLowerCase()}`
                : record.home_url
                    ? `url:${record.home_url}`
                    : '';
        if (!key || seen.has(key)) return;
        seen.add(key);
        normalized.push(record);
    };

    if (Array.isArray(sites)) {
        sites.forEach(pushSite);
    }
    if (legacySite) {
        pushSite(legacySite);
    }

    return normalized;
};

const getEmptyConnectionTokenRecord = () => ({
    token: '',
    masked_token: '',
    issued_at: null,
    expires_at: null,
    status: 'none'
});

const maskConnectionToken = (token) => {
    const normalized = sanitizeString(token);
    if (!normalized) return '';
    if (normalized.length <= 10) {
        return `${normalized.slice(0, 2)}••••${normalized.slice(-2)}`;
    }
    return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
};

const normalizeConnectionTokenRecord = (value = {}) => {
    const token = sanitizeString(value.token);
    const issuedAt = normalizeOptionalIso(value.issued_at);
    const expiresAt = normalizeOptionalIso(value.expires_at);
    const now = Date.now();
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    const isExpired = Number.isFinite(expiresAtMs) ? expiresAtMs <= now : false;

    if (!token || isExpired) {
        return getEmptyConnectionTokenRecord();
    }

    return {
        token,
        masked_token: maskConnectionToken(token),
        issued_at: issuedAt,
        expires_at: expiresAt,
        status: 'active'
    };
};

const selectPrimarySite = ({ baseSite = {}, defaults = {}, normalizedSites = [] }) => {
    const preferredSiteId = sanitizeString(baseSite.site_id || defaults.siteId);
    const preferredDomain = sanitizeString(baseSite.connected_domain || extractDomain(baseSite.home_url || defaults.homeUrl)).toLowerCase();
    if (preferredSiteId) {
        const siteById = normalizedSites.find((site) => sanitizeString(site.site_id) === preferredSiteId);
        if (siteById) return siteById;
    }
    if (preferredDomain) {
        const siteByDomain = normalizedSites.find((site) => sanitizeString(site.connected_domain).toLowerCase() === preferredDomain);
        if (siteByDomain) return siteByDomain;
    }
    if (normalizedSites.length > 0) {
        return normalizedSites[0];
    }
    return normalizeSiteRecord({
        site_id: defaults.siteId,
        blog_id: defaults.blogId,
        home_url: defaults.homeUrl,
        plugin_version: defaults.pluginVersion,
        binding_status: sanitizeString(defaults.siteId || defaults.homeUrl) ? 'connected' : 'unbound'
    }, defaults) || {
        site_id: '',
        blog_id: 0,
        home_url: '',
        connected_domain: '',
        plugin_version: '',
        binding_status: 'unbound'
    };
};

const listStateSites = (state = {}) => {
    if (Array.isArray(state.sites) && state.sites.length > 0) {
        return state.sites
            .map((site) => normalizeSiteRecord(site))
            .filter((site) => site && (site.site_id || site.connected_domain));
    }
    const legacySite = normalizeSiteRecord({
        ...(state.site || {}),
        binding_status: state.site_binding_status || 'connected'
    });
    return legacySite ? [legacySite] : [];
};

const hasActiveSiteBinding = (state = {}) => {
    if (normalizeBool(state.connected, false)) return true;
    if (sanitizeString(state.connection_status).toLowerCase() === 'connected') return true;
    const bindingStatus = sanitizeString(state.site_binding_status).toLowerCase();
    if (bindingStatus === 'connected' || bindingStatus === 'limit_reached') return true;
    return listStateSites(state).some((site) => {
        const siteBindingStatus = sanitizeString(site.binding_status).toLowerCase();
        return siteBindingStatus === 'connected' || siteBindingStatus === 'limit_reached';
    });
};

const scanAccountStates = async ({ ddbDoc, tableName, limit = 25 }) => {
    const response = await ddbDoc.send(new ScanCommand({
        TableName: tableName,
        Limit: Math.max(limit * 4, 25)
    }));
    return Array.isArray(response?.Items) ? response.Items : [];
};

const buildDefaultAccountBillingState = ({ accountId = '', siteId = '', blogId = 0, homeUrl = '', pluginVersion = '' } = {}) => ({
    schema_version: 'v1',
    account_id: sanitizeString(accountId),
    account_label: '',
    contact_email: '',
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
    sites: sanitizeString(siteId) || sanitizeString(homeUrl) ? [{
        site_id: sanitizeString(siteId),
        blog_id: normalizeNullableInt(blogId) || 0,
        home_url: sanitizeString(homeUrl),
        connected_domain: extractDomain(homeUrl),
        plugin_version: sanitizeString(pluginVersion),
        binding_status: 'connected'
    }] : [],
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
    latest_connection_token: getEmptyConnectionTokenRecord(),
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
    const legacySite = normalizeSiteRecord({
        ...(base.site || {}),
        binding_status: base.site_binding_status || 'connected'
    }, defaults);
    const normalizedSites = normalizeSites(base.sites, legacySite, defaults);
    const primarySite = selectPrimarySite({
        baseSite: base.site,
        defaults,
        normalizedSites
    });
    const includedRemaining = normalizeNonNegativeInt(base?.credits?.included_remaining);
    const topupRemaining = normalizeNonNegativeInt(base?.credits?.topup_remaining);
    const reservedCredits = normalizeNonNegativeInt(base?.credits?.reserved_credits);
    const monthlyIncluded = normalizeNonNegativeInt(base?.credits?.monthly_included);
    const monthlyUsed = normalizeNonNegativeInt(base?.credits?.monthly_used);
    const totalRemaining = includedRemaining + topupRemaining;
    const subscriptionStatus = sanitizeString(base.subscription_status).toLowerCase();
    const trialExpiresAt = normalizeOptionalIso(base.trial_expires_at);
    const trialStatus = resolveTrialStatus(base.trial_status, trialExpiresAt, defaults.now);
    const trialActive = trialStatus === 'active';
    const subscriptionActive = subscriptionStatus === 'active';
    const analysisAllowed = trialActive || subscriptionActive;
    const resolvedMaxSites = normalizeNullableInt(base?.entitlements?.max_sites) ?? normalizeNullableInt(plan?.site_limit);
    const siteLimitReached = resolvedMaxSites !== null ? normalizedSites.length >= resolvedMaxSites : false;
    const siteBindingStatus = normalizedSites.length > 0
        ? sanitizeString(primarySite.binding_status || base.site_binding_status || 'connected') || 'connected'
        : 'unbound';

    return {
        schema_version: 'v1',
        account_id: sanitizeString(base.account_id),
        account_label: sanitizeString(base.account_label),
        contact_email: sanitizeString(base.contact_email || base?.site?.admin_email || defaults.adminEmail),
        connected: normalizeBool(base.connected, !!sanitizeString(base.account_id)),
        connection_status: sanitizeString(base.connection_status || 'connected') || 'connected',
        plan_code: sanitizeString(base.plan_code),
        plan_name: sanitizeString(base.plan_name || plan?.label || ''),
        subscription_status: subscriptionStatus,
        trial_status: trialStatus,
        trial_expires_at: trialExpiresAt,
        site_binding_status: siteBindingStatus,
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
            analysis_allowed: analysisAllowed,
            web_lookups_allowed: normalizeBool(base?.entitlements?.web_lookups_allowed, true),
            max_sites: resolvedMaxSites,
            site_limit_reached: normalizeBool(base?.entitlements?.site_limit_reached, siteLimitReached)
        },
        usage: {
            analyses_this_month: normalizeNonNegativeInt(base?.usage?.analyses_this_month),
            credits_used_this_month: normalizeNonNegativeInt(base?.usage?.credits_used_this_month),
            last_analysis_at: base?.usage?.last_analysis_at ? normalizeIso(base.usage.last_analysis_at) : null,
            last_run_status: sanitizeString(base?.usage?.last_run_status)
        },
        site: {
            site_id: sanitizeString(primarySite.site_id),
            blog_id: normalizeNullableInt(primarySite.blog_id) || 0,
            home_url: sanitizeString(primarySite.home_url),
            connected_domain: sanitizeString(primarySite.connected_domain),
            plugin_version: sanitizeString(primarySite.plugin_version)
        },
        sites: normalizedSites,
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
        latest_connection_token: normalizeConnectionTokenRecord(base?.latest_connection_token),
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
    const currentPlan = getPlanDefinition(current.plan_code);
    const cycleKey = buildCycleKey(subscriptionRecord);
    const previousCycleKey = sanitizeString(current.subscription.credit_cycle_key);
    const normalizedStatus = sanitizeString(subscriptionRecord.status).toLowerCase();
    const sameCycle = !!cycleKey && !!previousCycleKey && cycleKey === previousCycleKey;
    const isActiveSubscription = normalizedStatus === 'active';
    const isPlanUpgrade = !!plan && !!currentPlan && getPlanRank(subscriptionRecord.plan_code) > getPlanRank(current.plan_code);
    const shouldGrantCycleCredits = !!plan && isActiveSubscription && cycleKey && cycleKey !== previousCycleKey;
    const currentCycleCredits = normalizeNonNegativeInt(current.credits.monthly_included || currentPlan?.included_credits);
    const upgradeCreditDelta = !!plan && isActiveSubscription && sameCycle && isPlanUpgrade
        ? Math.max(normalizeNonNegativeInt(plan.included_credits) - currentCycleCredits, 0)
        : 0;
    const next = normalizeAccountBillingState({
        ...current,
        connected: true,
        connection_status: 'connected',
        plan_code: sanitizeString(subscriptionRecord.plan_code),
        plan_name: plan?.label || current.plan_name,
        subscription_status: normalizedStatus,
        trial_status: current.trial_status === 'active' ? 'converted' : current.trial_status,
        entitlements: {
            ...current.entitlements,
            analysis_allowed: isActiveSubscription,
            max_sites: plan?.site_limit ?? current.entitlements.max_sites
        },
        credits: shouldGrantCycleCredits ? {
            ...current.credits,
            included_remaining: normalizeNonNegativeInt(plan.included_credits),
            monthly_included: normalizeNonNegativeInt(plan.included_credits),
            monthly_used: 0
        } : upgradeCreditDelta > 0 ? {
            ...current.credits,
            included_remaining: current.credits.included_remaining + upgradeCreditDelta,
            monthly_included: normalizeNonNegativeInt(plan.included_credits)
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
        granted_upgrade_credits: upgradeCreditDelta,
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
    const scopedSiteId = sanitizeString(siteContext.siteId);
    const scopedDomain = sanitizeString(extractDomain(siteContext.homeUrl)).toLowerCase();
    const hasScopedSite = !!scopedSiteId || !!sanitizeString(siteContext.homeUrl);
    const matchedSite = normalized.sites.find((site) => (
        (scopedSiteId && sanitizeString(site.site_id) === scopedSiteId)
        || (scopedDomain && sanitizeString(site.connected_domain).toLowerCase() === scopedDomain)
    )) || null;
    const effectiveSite = matchedSite || normalizeSiteRecord({
        site_id: siteContext.siteId,
        blog_id: siteContext.blogId,
        home_url: siteContext.homeUrl,
        plugin_version: siteContext.pluginVersion,
        binding_status: hasScopedSite ? 'unbound' : normalized.site_binding_status
    }, siteContext) || {
        ...normalized.site,
        binding_status: normalized.site_binding_status
    };
    const scopedConnected = hasScopedSite ? !!matchedSite : normalized.connected;
    const scopedConnectionStatus = hasScopedSite
        ? (matchedSite ? 'connected' : 'disconnected')
        : normalized.connection_status;
    const scopedBindingStatus = hasScopedSite
        ? (matchedSite ? sanitizeString(matchedSite.binding_status || 'connected') : 'unbound')
        : normalized.site_binding_status;
    const scopedAnalysisAllowed = hasScopedSite
        ? (scopedConnected && normalized.entitlements.analysis_allowed)
        : normalized.entitlements.analysis_allowed;
    const trialActive = normalized.trial_status === 'active';
    return {
        schema_version: 'v1',
        account_state: {
            connected: scopedConnected,
            connection_status: scopedConnectionStatus,
            account_id: normalized.account_id,
            account_label: normalized.account_label,
            contact_email: normalized.contact_email,
            plan_code: normalized.plan_code,
            plan_name: normalized.plan_name,
            subscription_status: normalized.subscription_status,
            trial_status: normalized.trial_status,
            trial_expires_at: normalized.trial_expires_at,
            site_binding_status: scopedBindingStatus,
            credits: {
                included_remaining: normalized.credits.included_remaining,
                topup_remaining: normalized.credits.topup_remaining,
                last_run_debit: normalized.credits.last_run_debit
            },
            entitlements: {
                analysis_allowed: scopedAnalysisAllowed,
                web_lookups_allowed: normalized.entitlements.web_lookups_allowed,
                max_sites: normalized.entitlements.max_sites,
                site_limit_reached: normalized.entitlements.site_limit_reached
            },
            site: {
                site_id: sanitizeString(effectiveSite.site_id),
                blog_id: normalizeNullableInt(effectiveSite.blog_id) || 0,
                home_url: sanitizeString(effectiveSite.home_url),
                connected_domain: sanitizeString(effectiveSite.connected_domain),
                plugin_version: sanitizeString(effectiveSite.plugin_version)
            },
            sites: normalized.sites.map((site) => ({
                site_id: sanitizeString(site.site_id),
                blog_id: normalizeNullableInt(site.blog_id) || 0,
                home_url: sanitizeString(site.home_url),
                connected_domain: sanitizeString(site.connected_domain),
                plugin_version: sanitizeString(site.plugin_version),
                binding_status: sanitizeString(site.binding_status || 'connected') || 'connected'
            })),
            latest_connection_token: normalized.latest_connection_token,
            updated_at: normalized.updated_at
        },
        dashboard_summary: {
            schema_version: 'v1',
            account: {
                connected: scopedConnected,
                connection_status: scopedConnectionStatus,
                display_state: scopedConnected ? 'connected' : 'disconnected',
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
                site_id: sanitizeString(effectiveSite.site_id),
                blog_id: normalizeNullableInt(effectiveSite.blog_id) || 0,
                connected_domain: sanitizeString(effectiveSite.connected_domain),
                plugin_version: sanitizeString(effectiveSite.plugin_version),
                binding_status: scopedBindingStatus
            },
            connection: {
                connected_sites: normalized.sites.map((site) => ({
                    site_id: sanitizeString(site.site_id),
                    blog_id: normalizeNullableInt(site.blog_id) || 0,
                    home_url: sanitizeString(site.home_url),
                    connected_domain: sanitizeString(site.connected_domain),
                    binding_status: sanitizeString(site.binding_status || 'connected') || 'connected'
                })),
                site_slots_used: normalized.sites.length,
                site_slots_total: normalized.entitlements.max_sites,
                latest_connection_token: normalized.latest_connection_token
            },
            support: {
                docs_url: sanitizeString(supportLinks.docs_url),
                billing_url: sanitizeString(supportLinks.billing_url),
                support_url: sanitizeString(supportLinks.support_url),
                help_label: sanitizeString(supportLinks.help_label || 'AiVI Support'),
                provider: sanitizeString(supportLinks.provider),
                zoho_asap: {
                    widget_snippet_url: sanitizeString(supportLinks.zoho_asap?.widget_snippet_url),
                    department_id: sanitizeString(supportLinks.zoho_asap?.department_id),
                    layout_id: sanitizeString(supportLinks.zoho_asap?.layout_id),
                    ticket_title: sanitizeString(supportLinks.zoho_asap?.ticket_title),
                    field_map: Object.entries(supportLinks.zoho_asap?.field_map || {}).reduce((accumulator, [key, value]) => {
                        const normalizedKey = sanitizeString(key);
                        const normalizedValue = sanitizeString(value);
                        if (normalizedKey && normalizedValue) {
                            accumulator[normalizedKey] = normalizedValue;
                        }
                        return accumulator;
                    }, {})
                }
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
        },
        async findSiteOwnershipConflicts({ accountId, siteId, connectedDomain, limit = 10 } = {}) {
            const normalizedAccountId = sanitizeString(accountId);
            const normalizedSiteId = sanitizeString(siteId);
            const normalizedDomain = sanitizeString(connectedDomain).toLowerCase();
            if (!normalizedSiteId && !normalizedDomain) {
                return [];
            }

            const items = (await scanAccountStates({
                ddbDoc,
                tableName,
                limit
            })).map((item) => normalizeAccountBillingState(item));

            return items
                .filter((item) => sanitizeString(item.account_id) !== normalizedAccountId)
                .filter((item) => hasActiveSiteBinding(item))
                .filter((item) => listStateSites(item).some((site) => {
                    const itemSiteId = sanitizeString(site.site_id);
                    const itemDomain = sanitizeString(site.connected_domain).toLowerCase();
                    return (normalizedSiteId && itemSiteId === normalizedSiteId)
                        || (normalizedDomain && itemDomain && itemDomain === normalizedDomain);
                }))
                .slice(0, Math.max(1, Math.trunc(Number(limit) || 10)));
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
