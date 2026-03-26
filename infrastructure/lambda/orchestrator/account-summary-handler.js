/**
 * Account Summary Handler - GET /aivi/v1/account/summary
 *
 * Returns a canonical, read-only dashboard summary payload.
 * This is intentionally fallback-safe until the full account control plane
 * and subscription persistence are live.
 */

const {
    buildDefaultAccountBillingState,
    buildRemoteAccountPayload,
    createAccountBillingStateStore
} = require('./billing-account-state');

const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const normalizeNullableInt = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const sanitizeString = (value) => String(value || '').trim();
const sanitizeEmail = (value) => {
    const candidate = sanitizeString(value).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : '';
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

const buildSupportLinks = () => {
    const provider = sanitizeString(getEnv('AIVI_SUPPORT_PROVIDER', ''));
    const widgetSnippetUrl = sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_SNIPPET_URL', ''));
    const departmentId = sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_DEPARTMENT_ID', ''));
    const layoutId = sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_LAYOUT_ID', ''));
    const ticketTitle = sanitizeString(getEnv('AIVI_SUPPORT_ZOHO_TICKET_TITLE', 'AiVI Support'));
    const fieldMap = sanitizeSupportFieldMap(getEnv('AIVI_SUPPORT_ZOHO_FIELD_MAP', ''));
    const normalizedProvider = provider || (widgetSnippetUrl && departmentId && layoutId ? 'zoho_desk_asap' : '');

    return {
        docs_url: sanitizeString(getEnv('AIVI_DOCS_URL', '')),
        billing_url: sanitizeString(getEnv('AIVI_BILLING_URL', '')),
        support_url: sanitizeString(getEnv('AIVI_SUPPORT_URL', '')),
        help_label: 'AiVI Support',
        provider: normalizedProvider,
        zoho_asap: {
            widget_snippet_url: widgetSnippetUrl,
            department_id: departmentId,
            layout_id: layoutId,
            ticket_title: ticketTitle,
            field_map: fieldMap
        }
    };
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

const buildDefaultDashboardSummary = ({ siteId, blogId, homeUrl, pluginVersion }) => {
    return buildRemoteAccountPayload(
        buildDefaultAccountBillingState({ siteId, blogId, homeUrl, pluginVersion }),
        { siteId, blogId, homeUrl, pluginVersion },
        buildSupportLinks()
    ).dashboard_summary;
};

const accountSummaryHandler = async (event = {}) => {
    const query = event.queryStringParameters || {};
    const headers = event.headers || {};
    const accountId = sanitizeString(query.account_id || headers['X-AIVI-Account-Id'] || headers['x-aivi-account-id']);
    const siteId = sanitizeString(query.site_id || headers['X-AIVI-Site-Id'] || headers['x-aivi-site-id']);
    const blogId = normalizeNullableInt(query.blog_id || headers['X-AIVI-Blog-Id'] || headers['x-aivi-blog-id']) || 0;
    const homeUrl = sanitizeString(query.home_url || headers['X-AIVI-Home-Url'] || headers['x-aivi-home-url']);
    const pluginVersion = sanitizeString(headers['X-AIVI-Plugin-Version'] || headers['x-aivi-plugin-version']);
    const adminEmail = sanitizeEmail(query.admin_email || headers['X-AIVI-Admin-Email'] || headers['x-aivi-admin-email']);
    const supportLinks = buildSupportLinks();

    let remotePayload;
    if (accountId) {
        try {
            const store = createAccountBillingStateStore();
            let state = await store.getAccountState(accountId);
            if (state && !sanitizeString(state.contact_email) && adminEmail) {
                state = await store.putAccountState({
                    ...state,
                    contact_email: adminEmail
                });
                log('INFO', 'Backfilled missing contact email from site identity during account summary refresh', {
                    account_id: accountId,
                    site_id: siteId || null,
                    contact_email: adminEmail
                });
            }
            if (state) {
                remotePayload = buildRemoteAccountPayload(state, {
                    siteId,
                    blogId,
                    homeUrl,
                    pluginVersion
                }, supportLinks);
            }
        } catch (error) {
            log('WARN', 'Failed to resolve remote billing state for account summary', {
                account_id: accountId || null,
                error: error.message
            });
        }
    }

    if (!remotePayload) {
        const fallbackDashboardSummary = buildDefaultDashboardSummary({
            siteId,
            blogId,
            homeUrl,
            pluginVersion
        });
        remotePayload = {
            schema_version: 'v1',
            account_state: buildDefaultAccountBillingState({ accountId, siteId, blogId, homeUrl, pluginVersion }),
            dashboard_summary: fallbackDashboardSummary
        };
    }

    log('INFO', 'Returning canonical account dashboard summary', {
        account_id: accountId || null,
        site_id: siteId || null,
        blog_id: blogId || null,
        connected_domain: remotePayload.dashboard_summary.site.connected_domain || null
    });

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ok: true,
            source: 'remote',
            account_state: remotePayload.account_state,
            dashboard_summary: remotePayload.dashboard_summary
        })
    };
};

module.exports = { accountSummaryHandler, buildDefaultDashboardSummary };
