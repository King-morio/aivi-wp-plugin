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
        {
            docs_url: sanitizeString(getEnv('AIVI_DOCS_URL', '')),
            billing_url: sanitizeString(getEnv('AIVI_BILLING_URL', '')),
            support_url: sanitizeString(getEnv('AIVI_SUPPORT_URL', '')),
            help_label: 'AiVI Help'
        }
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
    const supportLinks = {
        docs_url: sanitizeString(getEnv('AIVI_DOCS_URL', '')),
        billing_url: sanitizeString(getEnv('AIVI_BILLING_URL', '')),
        support_url: sanitizeString(getEnv('AIVI_SUPPORT_URL', '')),
        help_label: 'AiVI Help'
    };

    let remotePayload;
    if (accountId) {
        try {
            const store = createAccountBillingStateStore();
            const state = await store.getAccountState(accountId);
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
