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

const getSupportLinks = () => ({
    docs_url: sanitizeString(getEnv('AIVI_DOCS_URL')),
    billing_url: sanitizeString(getEnv('AIVI_BILLING_URL')),
    support_url: sanitizeString(getEnv('AIVI_SUPPORT_URL'))
});

const buildSiteContext = (site) => ({
    siteId: site.site_id,
    blogId: site.blog_id,
    homeUrl: site.home_url,
    pluginVersion: site.plugin_version
});

const applyConnectionToState = ({ currentState, verifiedPayload, site }) => {
    const nowIso = toIso();
    return normalizeAccountBillingState({
        ...currentState,
        account_id: sanitizeString(verifiedPayload.account_id || currentState.account_id),
        account_label: sanitizeString(verifiedPayload.account_label || currentState.account_label),
        connected: true,
        connection_status: 'connected',
        site_binding_status: 'connected',
        entitlements: {
            ...currentState.entitlements,
            max_sites: verifiedPayload.max_sites || currentState.entitlements?.max_sites || null
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

const clearConnectionFromState = (currentState, site) => {
    const nowIso = toIso();
    return normalizeAccountBillingState({
        ...currentState,
        connected: false,
        connection_status: 'disconnected',
        site_binding_status: 'unbound',
        site: {
            ...currentState.site,
            site_id: '',
            blog_id: 0,
            home_url: '',
            connected_domain: '',
            plugin_version: sanitizeString(site.plugin_version)
        },
        updated_at: nowIso
    });
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

        if (existingSiteId && existingSiteId !== site.site_id) {
            return jsonResponse(409, {
                ok: false,
                error: 'site_binding_conflict',
                message: maxSites > 1
                    ? 'This account already has a different site binding. Multi-site account bindings are not enabled in this staging build yet.'
                    : 'This account is already bound to a different site.'
            });
        }

        const nextState = applyConnectionToState({
            currentState,
            verifiedPayload: verified.payload,
            site
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

        if (site.site_id && sanitizeString(currentState.site?.site_id) && sanitizeString(currentState.site.site_id) !== site.site_id) {
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
