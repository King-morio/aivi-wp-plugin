const { assertSuperAdminAccess, assertPermission } = require('./super-admin-auth');
const { createSuperAdminStore } = require('./super-admin-store');
const { createSuperAdminAuditStore } = require('./super-admin-audit-store');

const sanitizeString = (value) => String(value || '').trim();
const normalizeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
};

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
});

const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const extractAccountId = (event = {}) => {
    const direct = sanitizeString(event?.pathParameters?.account_id);
    if (direct) return direct;
    const path = sanitizeString(event?.rawPath || event?.path || event?.requestContext?.http?.path);
    const match = path.match(/\/aivi\/v1\/admin\/accounts\/([^/]+)$/);
    return match ? sanitizeString(match[1]) : '';
};

const buildAccountListRow = (state = {}) => ({
    account_id: sanitizeString(state.account_id),
    account_label: sanitizeString(state.account_label || state.account_id || 'Unknown account'),
    plan_code: sanitizeString(state.plan_code),
    plan_name: sanitizeString(state.plan_name || state.plan_code || 'No plan'),
    subscription_status: sanitizeString(state.subscription_status || 'unknown'),
    trial_status: sanitizeString(state.trial_status || 'none'),
    credits_remaining: normalizeInt(state.credits?.total_remaining),
    site_count: sanitizeString(state.site?.site_id) ? 1 : 0,
    connected_domain: sanitizeString(state.site?.connected_domain),
    updated_at: sanitizeString(state.updated_at)
});

const sanitizeLedgerEvent = (event = {}) => ({
    event_id: sanitizeString(event.event_id),
    event_type: sanitizeString(event.event_type),
    status: sanitizeString(event.status),
    reason_code: sanitizeString(event.reason_code),
    amounts: {
        granted_credits: normalizeInt(event.amounts?.granted_credits),
        reserved_credits: normalizeInt(event.amounts?.reserved_credits),
        settled_credits: normalizeInt(event.amounts?.settled_credits),
        refunded_credits: normalizeInt(event.amounts?.refunded_credits)
    },
    created_at: sanitizeString(event.created_at),
    updated_at: sanitizeString(event.updated_at)
});

const sanitizeSubscriptionRecord = (record = {}) => ({
    subscription_id: sanitizeString(record.subscription_id),
    provider_subscription_id: sanitizeString(record.provider_subscription_id),
    plan_code: sanitizeString(record.plan_code),
    status: sanitizeString(record.status),
    current_period_start: sanitizeString(record.current_period_start),
    current_period_end: sanitizeString(record.current_period_end),
    last_event_type: sanitizeString(record.last_event_type),
    updated_at: sanitizeString(record.updated_at)
});

const sanitizeTopupRecord = (record = {}) => ({
    order_id: sanitizeString(record.order_id),
    provider_order_id: sanitizeString(record.provider_order_id),
    pack_code: sanitizeString(record.pack_code),
    credits: normalizeInt(record.credits),
    status: sanitizeString(record.status),
    grant_pending: record.grant_pending === true,
    updated_at: sanitizeString(record.updated_at)
});

const sanitizeCheckoutIntent = (record = {}) => ({
    intent_id: sanitizeString(record.intent_id),
    intent_type: sanitizeString(record.intent_type),
    plan_code: sanitizeString(record.plan_code),
    topup_pack_code: sanitizeString(record.topup_pack_code),
    status: sanitizeString(record.status),
    created_at: sanitizeString(record.created_at),
    updated_at: sanitizeString(record.updated_at)
});

const sanitizeWebhookEvent = (record = {}) => ({
    event_id: sanitizeString(record.event_id),
    provider_event_id: sanitizeString(record.provider_event_id),
    event_type: sanitizeString(record.event_type),
    verification_status: sanitizeString(record.verification_status),
    processed: record.processed === true,
    processed_at: sanitizeString(record.processed_at),
    created_at: sanitizeString(record.created_at)
});

const sanitizeAuditEvent = (record = {}) => ({
    event_id: sanitizeString(record.event_id),
    actor_id: sanitizeString(record.actor_id),
    actor_role: sanitizeString(record.actor_role),
    action: sanitizeString(record.action),
    target_type: sanitizeString(record.target_type),
    target_id: sanitizeString(record.target_id),
    reason: sanitizeString(record.reason),
    status: sanitizeString(record.status),
    created_at: sanitizeString(record.created_at),
    updated_at: sanitizeString(record.updated_at)
});

const buildAccountDetail = ({
    state,
    subscriptions,
    topups,
    checkoutIntents,
    ledgerEvents,
    webhookEvents,
    auditEvents,
    actor
}) => ({
    account_id: sanitizeString(state.account_id),
    account_label: sanitizeString(state.account_label || state.account_id || 'Unknown account'),
    plan: {
        plan_code: sanitizeString(state.plan_code),
        plan_name: sanitizeString(state.plan_name || state.plan_code || 'No plan'),
        subscription_status: sanitizeString(state.subscription_status || 'unknown'),
        trial_status: sanitizeString(state.trial_status || 'none'),
        max_sites: normalizeInt(state.entitlements?.max_sites),
        current_period_start: sanitizeString(state.subscription?.current_period_start),
        current_period_end: sanitizeString(state.subscription?.current_period_end),
        cancel_at_period_end: state.subscription?.cancel_at_period_end === true
    },
    credits: {
        included_remaining: normalizeInt(state.credits?.included_remaining),
        topup_remaining: normalizeInt(state.credits?.topup_remaining),
        total_remaining: normalizeInt(state.credits?.total_remaining),
        reserved_credits: normalizeInt(state.credits?.reserved_credits),
        last_run_debit: normalizeInt(state.credits?.last_run_debit),
        monthly_included: normalizeInt(state.credits?.monthly_included),
        monthly_used: normalizeInt(state.credits?.monthly_used)
    },
    usage: {
        analyses_this_month: normalizeInt(state.usage?.analyses_this_month),
        credits_used_this_month: normalizeInt(state.usage?.credits_used_this_month),
        last_analysis_at: sanitizeString(state.usage?.last_analysis_at),
        last_run_status: sanitizeString(state.usage?.last_run_status)
    },
    sites: sanitizeString(state.site?.site_id) ? [{
        site_id: sanitizeString(state.site.site_id),
        blog_id: normalizeInt(state.site.blog_id),
        connected_domain: sanitizeString(state.site.connected_domain),
        binding_status: sanitizeString(state.site_binding_status),
        plugin_version: sanitizeString(state.site.plugin_version),
        connected: state.connected === true
    }] : [],
    billing_health: {
        recent_checkout_intents: checkoutIntents.map(sanitizeCheckoutIntent),
        recent_subscriptions: subscriptions.map(sanitizeSubscriptionRecord),
        recent_topups: topups.map(sanitizeTopupRecord),
        recent_webhooks: webhookEvents.map(sanitizeWebhookEvent)
    },
    credit_ledger_summary: {
        included_remaining: normalizeInt(state.credits?.included_remaining),
        topup_remaining: normalizeInt(state.credits?.topup_remaining),
        reserved_credits: normalizeInt(state.credits?.reserved_credits),
        last_run_debit: normalizeInt(state.credits?.last_run_debit),
        credits_used_this_month: normalizeInt(state.usage?.credits_used_this_month),
        recent_events: ledgerEvents.map(sanitizeLedgerEvent)
    },
    audit: {
        source: 'authoritative_backend',
        actor_role: sanitizeString(actor.actorRole),
        auth_mode: sanitizeString(actor.authMode),
        generated_at: new Date().toISOString(),
        recent_events: auditEvents.map(sanitizeAuditEvent)
    }
});

const superAdminReadHandler = async (event = {}) => {
    try {
        const actor = assertSuperAdminAccess(event, process.env);
        assertPermission(actor, 'accounts.read');
        const route = sanitizeString(event.aiviResolvedRoute || event.routeKey || `${event.httpMethod || event?.requestContext?.http?.method} ${event.path || event?.requestContext?.http?.path}`);
        const query = event.queryStringParameters || {};
        const limit = Math.max(1, Math.min(100, normalizeInt(query.limit, 25) || 25));
        const store = createSuperAdminStore();

        if (route === 'GET /aivi/v1/admin/accounts') {
            const items = await store.listAccountStates({
                limit,
                query: query.q || query.query,
                site_id: query.site_id,
                plan_code: query.plan_code,
                subscription_status: query.subscription_status
            });

            const rows = items.map(buildAccountListRow);
            log('INFO', 'Returned super-admin account list', {
                actor_role: actor.actorRole,
                result_count: rows.length
            });

            return jsonResponse(200, {
                ok: true,
                items: rows,
                page: {
                    count: rows.length,
                    limit,
                    next_cursor: null
                }
            });
        }

        if (route === 'GET /aivi/v1/admin/accounts/{account_id}') {
            const accountId = extractAccountId(event);
            if (!accountId) {
                return jsonResponse(400, {
                    ok: false,
                    error: 'missing_account_id',
                    message: 'An account ID is required.'
                });
            }

            const state = await store.getAccountState(accountId);
            if (!state) {
                return jsonResponse(404, {
                    ok: false,
                    error: 'account_not_found',
                    message: 'No billing account state was found for this account.'
                });
            }

            const [subscriptions, topups, checkoutIntents, ledgerEvents, webhookEvents] = await Promise.all([
                store.listSubscriptionRecordsByAccount(accountId, 10),
                store.listTopupOrdersByAccount(accountId, 10),
                store.listCheckoutIntentsByAccount(accountId, 10),
                store.listLedgerEventsByAccount(accountId, 10),
                store.listRecentWebhookEvents(10)
            ]);
            let auditEvents = [];
            try {
                const auditStore = createSuperAdminAuditStore();
                auditEvents = await auditStore.listAuditEventsByAccount(accountId, 10);
            } catch (error) {
                auditEvents = [];
            }

            const item = buildAccountDetail({
                state,
                subscriptions,
                topups,
                checkoutIntents,
                ledgerEvents,
                webhookEvents,
                auditEvents,
                actor
            });

            log('INFO', 'Returned super-admin account detail', {
                actor_role: actor.actorRole,
                account_id: accountId
            });

            return jsonResponse(200, {
                ok: true,
                item
            });
        }

        return jsonResponse(404, {
            ok: false,
            error: 'not_found',
            message: `Route ${route} not found`
        });
    } catch (error) {
        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        const code = sanitizeString(error?.code || 'super_admin_read_failed');
        const message = sanitizeString(error?.message || 'Super-admin read request failed.');

        log(statusCode >= 500 ? 'ERROR' : 'WARN', 'Super-admin read handler failed', {
            status_code: statusCode,
            error_code: code,
            message
        });

        return jsonResponse(statusCode, {
            ok: false,
            error: code,
            message
        });
    }
};

module.exports = {
    superAdminReadHandler,
    buildAccountListRow,
    buildAccountDetail
};
