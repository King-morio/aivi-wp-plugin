const crypto = require('crypto');
const {
    buildDefaultAccountBillingState,
    buildRemoteAccountPayload,
    createAccountBillingStateStore,
    getPlanDefinition,
    normalizeAccountBillingState
} = require('./billing-account-state');

const sanitizeString = (value) => String(value || '').trim();
const toIso = (value = new Date()) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const getEnv = (key, fallback = '') => process.env[key] || fallback;
const isTruthyEnv = (key) => {
    const value = sanitizeString(getEnv(key)).toLowerCase();
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
};

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
});

const parseBody = (event = {}) => {
    if (!event.body) return {};
    if (typeof event.body === 'object') return event.body;
    if (typeof event.body === 'string') return JSON.parse(event.body);
    return {};
};

const normalizeSiteIdentity = (site = {}) => ({
    site_id: sanitizeString(site.site_id),
    blog_id: Number.isFinite(Number(site.blog_id)) ? Math.max(0, Math.trunc(Number(site.blog_id))) : 0,
    home_url: sanitizeString(site.home_url),
    admin_email: sanitizeString(site.admin_email),
    plugin_version: sanitizeString(site.plugin_version),
    wp_version: sanitizeString(site.wp_version)
});

const extractDomain = (rawUrl) => {
    const normalized = sanitizeString(rawUrl);
    if (!normalized) return '';
    try {
        return new URL(normalized).hostname || '';
    } catch (error) {
        return '';
    }
};

const isPrivateIpv4 = (host) => {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!match) return false;
    const octets = match.slice(1).map((part) => Number(part));
    if (octets.some((part) => part < 0 || part > 255)) return false;
    return (
        octets[0] === 10
        || octets[0] === 127
        || (octets[0] === 169 && octets[1] === 254)
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168)
    );
};

const isPublicSiteUrl = (rawUrl) => {
    const candidate = sanitizeString(rawUrl);
    if (!candidate) return false;
    try {
        const parsed = new URL(candidate);
        const protocol = sanitizeString(parsed.protocol).toLowerCase();
        const host = sanitizeString(parsed.hostname).toLowerCase();
        if (protocol !== 'http:' && protocol !== 'https:') {
            return false;
        }
        if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.test') || host === '::1') {
            return false;
        }
        if (!host.includes('.') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
            return false;
        }
        return !isPrivateIpv4(host);
    } catch (error) {
        return false;
    }
};

const sanitizeSupportFieldMap = (rawValue) => {
    let parsed = rawValue;
    if (typeof rawValue === 'string') {
        const candidate = rawValue.trim();
        if (!candidate) {
            return {};
        }
        try {
            parsed = JSON.parse(candidate);
        } catch (error) {
            return {};
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
    }
    return Object.entries(parsed).reduce((accumulator, [key, value]) => {
        const normalizedKey = sanitizeString(key);
        const normalizedValue = sanitizeString(value);
        if (normalizedKey && normalizedValue) {
            accumulator[normalizedKey] = normalizedValue;
        }
        return accumulator;
    }, {});
};

const getSupportLinks = () => ({
    docs_url: sanitizeString(getEnv('AIVI_DOCS_URL')),
    billing_url: sanitizeString(getEnv('AIVI_BILLING_URL')),
    support_url: sanitizeString(getEnv('AIVI_SUPPORT_URL')),
    help_label: 'AiVI Support',
    provider: sanitizeString(getEnv('AIVI_SUPPORT_PROVIDER')) || (
        sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_SNIPPET_URL')) &&
        sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_DEPARTMENT_ID')) &&
        sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_LAYOUT_ID'))
            ? 'zoho_desk_asap'
            : ''
    ),
    zoho_asap: {
        widget_snippet_url: sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_SNIPPET_URL')),
        department_id: sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_DEPARTMENT_ID')),
        layout_id: sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_LAYOUT_ID')),
        ticket_title: sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_TICKET_TITLE')) || 'AiVI Support',
        field_map: sanitizeSupportFieldMap(getEnv('AIVI_SUPPORT_ZOHO_FIELD_MAP'))
    }
});

const buildSiteContext = (site) => ({
    siteId: site.site_id,
    blogId: site.blog_id,
    homeUrl: site.home_url,
    pluginVersion: site.plugin_version,
    adminEmail: site.admin_email
});

const deriveAccountLabel = (site = {}) => {
    const domain = extractDomain(site.home_url);
    if (!domain) {
        return 'AiVI Account';
    }
    return domain.replace(/^www\./i, '');
};

const buildDeterministicAccountId = (site = {}) => {
    const seed = sanitizeString(site.site_id);
    const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
    return `acct_site_${digest}`;
};

const ensurePublicOnboardingSite = (site) => {
    if (!site.site_id) {
        return {
            ok: false,
            response: jsonResponse(400, {
                ok: false,
                error: 'missing_site_id',
                message: 'A site_id is required to start onboarding.'
            })
        };
    }
    if (isTruthyEnv('AIVI_ALLOW_PRIVATE_TRIAL_START')) {
        return { ok: true };
    }
    if (!isPublicSiteUrl(site.home_url)) {
        return {
            ok: false,
            response: jsonResponse(400, {
                ok: false,
                error: 'invalid_site_home_url',
                message: 'AiVI onboarding requires a public site URL. Local or private staging hosts are not supported for self-serve trial start.'
            })
        };
    }
    return { ok: true };
};

const applyBootstrapState = ({ currentState, accountId, site, nowIso }) => normalizeAccountBillingState({
    ...currentState,
    account_id: accountId,
    account_label: sanitizeString(currentState.account_label || deriveAccountLabel(site)),
    contact_email: sanitizeString(currentState.contact_email || site.admin_email),
    connected: true,
    connection_status: 'connected',
    site_binding_status: 'connected',
    entitlements: {
        ...currentState.entitlements,
        max_sites: currentState.entitlements?.max_sites || 1
    },
    site: {
        ...currentState.site,
        site_id: site.site_id,
        blog_id: site.blog_id,
        home_url: site.home_url,
        connected_domain: extractDomain(site.home_url),
        plugin_version: site.plugin_version
    },
    updated_at: nowIso
}, buildSiteContext(site));

const applyFreeTrialState = ({ currentState, site, nowIso }) => {
    const trialPlan = getPlanDefinition('free_trial');
    const trialDays = Number.isFinite(Number(trialPlan?.duration_days))
        ? Math.max(1, Math.trunc(Number(trialPlan.duration_days)))
        : 7;
    const expiresAt = new Date(nowIso);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + trialDays);

    return normalizeAccountBillingState({
        ...currentState,
        account_label: sanitizeString(currentState.account_label || deriveAccountLabel(site)),
        contact_email: sanitizeString(currentState.contact_email || site.admin_email),
        connected: true,
        connection_status: 'connected',
        site_binding_status: 'connected',
        plan_code: 'free_trial',
        plan_name: trialPlan?.label || 'Free Trial',
        subscription_status: 'trial',
        trial_status: 'active',
        trial_expires_at: expiresAt.toISOString(),
        credits: {
            ...currentState.credits,
            included_remaining: Math.max(Number(currentState.credits?.included_remaining || 0), Number(trialPlan?.included_credits || 5000)),
            monthly_included: Number(trialPlan?.included_credits || 5000),
            monthly_used: 0
        },
        entitlements: {
            ...currentState.entitlements,
            analysis_allowed: true,
            max_sites: Number(trialPlan?.site_limit || 1),
            site_limit_reached: false
        },
        site: {
            ...currentState.site,
            site_id: site.site_id,
            blog_id: site.blog_id,
            home_url: site.home_url,
            connected_domain: extractDomain(site.home_url),
            plugin_version: site.plugin_version
        },
        updated_at: nowIso
    }, buildSiteContext(site));
};

const appendSelfServeTrialAdmission = ({ currentState, site, nowIso }) => normalizeAccountBillingState({
    ...currentState,
    trial_admissions: [
        ...(Array.isArray(currentState.trial_admissions) ? currentState.trial_admissions : []),
        {
            source: 'self_serve',
            site_id: site.site_id,
            home_url: site.home_url,
            connected_domain: extractDomain(site.home_url),
            admitted_at: nowIso
        }
    ],
    updated_at: nowIso
}, buildSiteContext(site));

const buildPayload = (state, site) => buildRemoteAccountPayload(state, buildSiteContext(site), getSupportLinks());

const accountBootstrapHandler = async (event = {}) => {
    try {
        const body = parseBody(event);
        const site = normalizeSiteIdentity(body.site || {});
        const validation = ensurePublicOnboardingSite(site);
        if (!validation.ok) {
            return validation.response;
        }

        const accountId = buildDeterministicAccountId(site);
        const store = createAccountBillingStateStore();
        const existingState = await store.getAccountState(accountId)
            || buildDefaultAccountBillingState({
                accountId,
                siteId: site.site_id,
                blogId: site.blog_id,
                homeUrl: site.home_url,
                pluginVersion: site.plugin_version
            });

        const nextState = applyBootstrapState({
            currentState: existingState,
            accountId,
            site,
            nowIso: toIso()
        });
        await store.putAccountState(nextState);

        return jsonResponse(200, {
            ok: true,
            message: 'AiVI account is ready for this site.',
            ...buildPayload(nextState, site)
        });
    } catch (error) {
        return jsonResponse(500, {
            ok: false,
            error: sanitizeString(error?.code || 'account_bootstrap_failed'),
            message: sanitizeString(error?.message || 'AiVI could not prepare account onboarding for this site.')
        });
    }
};

const accountStartTrialHandler = async (event = {}) => {
    try {
        const body = parseBody(event);
        const site = normalizeSiteIdentity(body.site || {});
        const validation = ensurePublicOnboardingSite(site);
        if (!validation.ok) {
            return validation.response;
        }

        const accountId = buildDeterministicAccountId(site);
        const store = createAccountBillingStateStore();
        const existingState = await store.getAccountState(accountId)
            || buildDefaultAccountBillingState({
                accountId,
                siteId: site.site_id,
                blogId: site.blog_id,
                homeUrl: site.home_url,
                pluginVersion: site.plugin_version
            });

        const nowIso = toIso();
        const currentState = applyBootstrapState({
            currentState: existingState,
            accountId,
            site,
            nowIso
        });
        const trialStatus = sanitizeString(currentState.trial_status).toLowerCase();
        const subscriptionStatus = sanitizeString(currentState.subscription_status).toLowerCase();
        const hasPaidPlan = sanitizeString(currentState.plan_code) !== '' && sanitizeString(currentState.plan_code) !== 'free_trial';
        const connectedDomain = extractDomain(site.home_url);
        const trialAdmissionConflicts = connectedDomain && typeof store.findTrialAdmissionConflicts === 'function'
            ? await store.findTrialAdmissionConflicts({
                accountId,
                connectedDomain,
                limit: 5
            })
            : [];

        if (trialStatus === 'active') {
            return jsonResponse(200, {
                ok: true,
                message: 'Free trial is already active for this site.',
                ...buildPayload(currentState, site)
            });
        }

        if (trialAdmissionConflicts.length > 0) {
            return jsonResponse(409, {
                ok: false,
                error: 'trial_review_required',
                message: 'This domain already has AiVI trial history. Contact support or choose a plan to continue.',
                ...buildPayload(currentState, site)
            });
        }

        if (trialStatus === 'ended' || trialStatus === 'converted' || hasPaidPlan || subscriptionStatus === 'active' || subscriptionStatus === 'created') {
            return jsonResponse(409, {
                ok: false,
                error: 'trial_unavailable',
                message: 'This site already has an AiVI trial or paid plan history. Choose a plan to continue.',
                ...buildPayload(currentState, site)
            });
        }

        const nextState = appendSelfServeTrialAdmission({
            currentState: applyFreeTrialState({
                currentState,
                site,
                nowIso
            }),
            site,
            nowIso
        });
        await store.putAccountState(nextState);

        return jsonResponse(200, {
            ok: true,
            message: 'Free trial started. Analysis is now enabled for this site.',
            ...buildPayload(nextState, site)
        });
    } catch (error) {
        return jsonResponse(500, {
            ok: false,
            error: sanitizeString(error?.code || 'account_start_trial_failed'),
            message: sanitizeString(error?.message || 'AiVI could not start the free trial for this site.')
        });
    }
};

module.exports = {
    accountBootstrapHandler,
    accountStartTrialHandler,
    buildDeterministicAccountId,
    isPublicSiteUrl
};
