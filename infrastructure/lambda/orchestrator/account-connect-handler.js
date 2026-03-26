const {
    buildDefaultAccountBillingState,
    buildRemoteAccountPayload,
    createAccountBillingStateStore,
    normalizeAccountBillingState
} = require('./billing-account-state');
const { verifyConnectionToken } = require('./connection-token');

const sanitizeString = (value) => String(value || '').trim();
const toIso = (value = new Date()) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const getEnv = (key, fallback = '') => process.env[key] || fallback;

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
});

const createHttpError = (statusCode, code, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

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

const normalizeBoundSite = (site = {}) => ({
    site_id: sanitizeString(site.site_id),
    blog_id: Number.isFinite(Number(site.blog_id)) ? Math.max(0, Math.trunc(Number(site.blog_id))) : 0,
    home_url: sanitizeString(site.home_url),
    connected_domain: sanitizeString(site.connected_domain || extractDomain(site.home_url)),
    plugin_version: sanitizeString(site.plugin_version),
    binding_status: sanitizeString(site.binding_status || 'connected') || 'connected'
});

const listBoundSites = (state = {}) => {
    const explicitSites = Array.isArray(state.sites) ? state.sites.map(normalizeBoundSite).filter((site) => site.site_id || site.connected_domain) : [];
    if (explicitSites.length) return explicitSites;
    const legacySite = normalizeBoundSite({
        ...(state.site || {}),
        binding_status: state.site_binding_status || 'connected'
    });
    return legacySite.site_id || legacySite.connected_domain ? [legacySite] : [];
};

const matchSiteIndex = (sites = [], site = {}) => {
    const siteId = sanitizeString(site.site_id);
    const connectedDomain = sanitizeString(extractDomain(site.home_url)).toLowerCase();
    return sites.findIndex((entry) => (
        (siteId && sanitizeString(entry.site_id) === siteId)
        || (connectedDomain && sanitizeString(entry.connected_domain).toLowerCase() === connectedDomain)
    ));
};

const applyConnectionToState = ({ currentState, verifiedPayload, site, maxSites }) => {
    const nowIso = toIso();
    const incomingSite = normalizeBoundSite({
        site_id: site.site_id,
        blog_id: site.blog_id,
        home_url: site.home_url,
        plugin_version: site.plugin_version,
        binding_status: 'connected'
    });
    const boundSites = listBoundSites(currentState);
    const existingIndex = matchSiteIndex(boundSites, site);
    const nextSites = [...boundSites];
    if (existingIndex >= 0) {
        nextSites[existingIndex] = incomingSite;
    } else {
        nextSites.push(incomingSite);
    }
    const currentPrimaryId = sanitizeString(currentState.site?.site_id);
    const primarySite = nextSites.find((entry) => sanitizeString(entry.site_id) === currentPrimaryId) || nextSites[0] || incomingSite;
    return normalizeAccountBillingState({
        ...currentState,
        account_id: sanitizeString(verifiedPayload.account_id || currentState.account_id),
        account_label: sanitizeString(verifiedPayload.account_label || currentState.account_label),
        contact_email: sanitizeString(currentState.contact_email || site.admin_email),
        connected: true,
        connection_status: 'connected',
        site_binding_status: 'connected',
        entitlements: {
            ...currentState.entitlements,
            max_sites: maxSites,
            site_limit_reached: Number.isFinite(Number(maxSites)) ? nextSites.length >= Number(maxSites) : false
        },
        site: {
            ...currentState.site,
            site_id: primarySite.site_id,
            blog_id: primarySite.blog_id,
            home_url: primarySite.home_url,
            connected_domain: primarySite.connected_domain,
            plugin_version: primarySite.plugin_version
        },
        sites: nextSites,
        updated_at: nowIso
    }, buildSiteContext(primarySite));
};

const clearConnectionFromState = (currentState, site) => {
    const nowIso = toIso();
    const boundSites = listBoundSites(currentState);
    const requestedIndex = matchSiteIndex(boundSites, site);
    const nextSites = requestedIndex >= 0
        ? boundSites.filter((_, index) => index !== requestedIndex)
        : [];
    const nextPrimarySite = nextSites[0] || {
        site_id: '',
        blog_id: 0,
        home_url: '',
        connected_domain: '',
        plugin_version: sanitizeString(site.plugin_version)
    };
    const maxSites = Number.isFinite(Number(currentState.entitlements?.max_sites))
        ? Math.max(1, Math.trunc(Number(currentState.entitlements.max_sites)))
        : null;
    return normalizeAccountBillingState({
        ...currentState,
        connected: nextSites.length > 0,
        connection_status: nextSites.length > 0 ? 'connected' : 'disconnected',
        site_binding_status: nextSites.length > 0 ? 'connected' : 'unbound',
        site: {
            ...currentState.site,
            site_id: nextPrimarySite.site_id,
            blog_id: nextPrimarySite.blog_id,
            home_url: nextPrimarySite.home_url,
            connected_domain: nextPrimarySite.connected_domain,
            plugin_version: nextPrimarySite.plugin_version
        },
        sites: nextSites,
        entitlements: {
            ...currentState.entitlements,
            site_limit_reached: maxSites !== null ? nextSites.length >= maxSites : false
        },
        updated_at: nowIso
    }, buildSiteContext(nextPrimarySite));
};

const accountConnectHandler = async (event = {}) => {
    try {
        const body = parseBody(event);
        const token = sanitizeString(body.connection_token);
        const site = normalizeSiteIdentity(body.site || {});
        if (!token) {
            return jsonResponse(400, {
                ok: false,
                error: 'missing_connection_token',
                message: 'A connection token is required.'
            });
        }
        if (!site.site_id) {
            return jsonResponse(400, {
                ok: false,
                error: 'missing_site_id',
                message: 'A site_id is required to connect this site.'
            });
        }

        const verified = await verifyConnectionToken(token);
        if (!verified.valid) {
            return jsonResponse(401, {
                ok: false,
                error: verified.error || 'invalid_connection_token',
                message: 'The connection token is invalid or expired.'
            });
        }

        const accountStateStore = createAccountBillingStateStore();
        const currentState = await accountStateStore.getAccountState(verified.payload.account_id)
            || buildDefaultAccountBillingState({
                accountId: verified.payload.account_id,
                siteId: site.site_id,
                blogId: site.blog_id,
                homeUrl: site.home_url,
                pluginVersion: site.plugin_version
            });

        const existingSiteId = sanitizeString(currentState.site?.site_id);
        const maxSites = Number.isFinite(Number(currentState.entitlements?.max_sites))
            ? Math.max(1, Math.trunc(Number(currentState.entitlements.max_sites)))
            : (verified.payload.max_sites || 1);
        const boundSites = listBoundSites(currentState);
        const hasExistingMatch = matchSiteIndex(boundSites, site) >= 0;
        const ownershipConflicts = typeof accountStateStore.findSiteOwnershipConflicts === 'function'
            ? await accountStateStore.findSiteOwnershipConflicts({
                accountId: verified.payload.account_id,
                siteId: site.site_id,
                connectedDomain: extractDomain(site.home_url),
                limit: 5
            })
            : [];

        if (existingSiteId && existingSiteId !== site.site_id && maxSites <= 1) {
            return jsonResponse(409, {
                ok: false,
                error: 'site_binding_conflict',
                message: 'This account is already bound to a different site.'
            });
        }
        if (ownershipConflicts.length > 0) {
            return jsonResponse(409, {
                ok: false,
                error: 'site_reassignment_required',
                message: 'This site is already connected to another AiVI account. Ask an operator to unbind or reassign it before connecting here.'
            });
        }
        if (!hasExistingMatch && boundSites.length >= maxSites) {
            return jsonResponse(409, {
                ok: false,
                error: 'site_limit_reached',
                message: `This account is already using its ${maxSites}-site limit. Unbind a site before connecting another one.`
            });
        }

        const nextState = applyConnectionToState({
            currentState,
            verifiedPayload: verified.payload,
            site,
            maxSites
        });
        await accountStateStore.putAccountState(nextState);

        return jsonResponse(200, {
            ok: true,
            message: 'Site connected successfully.',
            ...buildRemoteAccountPayload(nextState, buildSiteContext(site), getSupportLinks())
        });
    } catch (error) {
        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        return jsonResponse(statusCode, {
            ok: false,
            error: sanitizeString(error?.code || 'account_connect_failed'),
            message: sanitizeString(error?.message || 'AiVI site connection failed.')
        });
    }
};

const accountDisconnectHandler = async (event = {}) => {
    try {
        const body = parseBody(event);
        const accountId = sanitizeString(body.account_id);
        const site = normalizeSiteIdentity(body.site || {});
        if (!accountId) {
            return jsonResponse(400, {
                ok: false,
                error: 'missing_account_id',
                message: 'An account_id is required to disconnect this site.'
            });
        }

        const accountStateStore = createAccountBillingStateStore();
        const currentState = await accountStateStore.getAccountState(accountId);
        if (!currentState) {
            return jsonResponse(200, {
                ok: true,
                message: 'Site disconnect acknowledged.'
            });
        }

        if (site.site_id && matchSiteIndex(listBoundSites(currentState), site) < 0) {
            return jsonResponse(409, {
                ok: false,
                error: 'site_binding_mismatch',
                message: 'The provided site does not match the current account binding.'
            });
        }

        const nextState = clearConnectionFromState(currentState, site);
        await accountStateStore.putAccountState(nextState);

        return jsonResponse(200, {
            ok: true,
            message: 'Site disconnected successfully.',
            ...buildRemoteAccountPayload(nextState, buildSiteContext(site), getSupportLinks())
        });
    } catch (error) {
        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        return jsonResponse(statusCode, {
            ok: false,
            error: sanitizeString(error?.code || 'account_disconnect_failed'),
            message: sanitizeString(error?.message || 'AiVI site disconnect failed.')
        });
    }
};

module.exports = {
    accountConnectHandler,
    accountDisconnectHandler
};
