const { randomUUID } = require('crypto');
const { getPayPalConfig, resolvePlanCatalogEntry, resolveTopupPackEntry } = require('./paypal-config');
const { createBillingStore } = require('./billing-store');
const {
    createHttpError,
    createSubscriptionCheckoutSession,
    createTopupCheckoutSession,
    captureTopupOrder,
    getManageBillingRedirect
} = require('./paypal-client');

const jsonHeaders = {
    'Content-Type': 'application/json'
};

const sanitizeString = (value) => String(value || '').trim();

const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const parseBody = (event = {}) => {
    if (!event.body) {
        return {};
    }
    if (typeof event.body === 'object') {
        return event.body;
    }
    if (typeof event.body === 'string') {
        return JSON.parse(event.body);
    }
    return {};
};

const parseQuery = (event = {}) => {
    const query = event?.queryStringParameters;
    return query && typeof query === 'object' ? query : {};
};

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
});

const appendQueryParams = (url, params = {}) => {
    const target = new URL(sanitizeString(url));
    Object.entries(params).forEach(([key, value]) => {
        const normalized = sanitizeString(value);
        if (normalized) {
            target.searchParams.set(key, normalized);
        }
    });
    return target.toString();
};

const redirectResponse = (location) => ({
    statusCode: 302,
    headers: {
        Location: location,
        'Cache-Control': 'no-store'
    },
    body: ''
});

const buildBillingReturnRedirect = (baseUrl, status, params = {}) => redirectResponse(appendQueryParams(baseUrl, {
    aivi_billing_return: status,
    ...params
}));

const buildSafeCheckoutResponse = (session) => ({
    ok: true,
    provider: 'paypal',
    request_id: session.requestId,
    checkout: {
        intent_type: session.intentType,
        approval_url: session.approvalUrl,
        return_url: session.returnUrl,
        cancel_url: session.cancelUrl,
        ...(session.planCode ? { plan_code: session.planCode } : {}),
        ...(session.packCode ? { topup_pack_code: session.packCode } : {}),
        ...(Number.isFinite(session.credits) ? { credits: session.credits } : {}),
        ...(Number.isFinite(session.priceUsd) ? { price_usd: session.priceUsd } : {}),
        ...(session.expiresAt ? { expires_at: session.expiresAt } : {})
    }
});

const buildCheckoutIntentRecord = (session, binding) => ({
    lookup_key: `${session.intentType}#${sanitizeString(session.providerSubscriptionId || session.providerOrderId)}`,
    intent_id: session.requestId,
    intent_type: session.intentType,
    provider: session.provider,
    provider_reference_id: sanitizeString(session.providerSubscriptionId || session.providerOrderId),
    account_id: sanitizeString(binding.accountId),
    site_id: sanitizeString(binding.siteId),
    blog_id: sanitizeString(binding.blogId),
    home_url: sanitizeString(binding.homeUrl),
    plan_code: sanitizeString(session.planCode),
    topup_pack_code: sanitizeString(session.packCode),
    approval_url: sanitizeString(session.approvalUrl),
    return_url: sanitizeString(session.returnUrl),
    cancel_url: sanitizeString(session.cancelUrl),
    ...(Number.isFinite(Number(session.credits)) ? { credits: Math.trunc(Number(session.credits)) } : {}),
    ...(Number.isFinite(Number(session.priceUsd)) ? { price_usd: Number(session.priceUsd) } : {}),
    status: 'created',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
});

const extractAccountBinding = (body) => ({
    accountId: sanitizeString(body?.account?.account_id || body?.account_id),
    siteId: sanitizeString(body?.site?.site_id || body?.site_id),
    blogId: sanitizeString(body?.site?.blog_id || body?.blog_id),
    homeUrl: sanitizeString(body?.site?.home_url || body?.home_url)
});

const ensureBoundAccount = (binding) => {
    if (!binding.accountId) {
        throw createHttpError(409, 'account_not_connected', 'A connected AiVI account is required for billing actions.');
    }
    if (!binding.siteId) {
        throw createHttpError(400, 'missing_site_id', 'A site binding is required for billing actions.');
    }
};

const billingCheckoutHandler = async (event = {}) => {
    try {
        const route = sanitizeString(event.aiviResolvedRoute || event.routeKey || `${event.httpMethod || event.requestContext?.http?.method} ${event.path || event.requestContext?.http?.path}`);
        const requestId = sanitizeString(event.requestContext?.requestId || event.requestContext?.requestContext?.requestId || randomUUID());
        const config = getPayPalConfig(process.env);
        const billingStore = createBillingStore();

        if (route === 'GET /aivi/v1/billing/return/paypal') {
            const returnUrl = sanitizeString(config.returnUrl);
            if (!returnUrl) {
                throw createHttpError(503, 'paypal_not_configured', 'PAYPAL_RETURN_URL is not configured.');
            }

            const query = parseQuery(event);
            const orderToken = sanitizeString(query.token);
            const payerId = sanitizeString(query.PayerID || query.payer_id);
            const subscriptionId = sanitizeString(query.subscription_id || query.subscriptionId);
            const billingAgreementToken = sanitizeString(query.ba_token || query.baToken);

            if (orderToken) {
                const topupIntent = await billingStore.getCheckoutIntent(`topup#${orderToken}`);
                if (topupIntent) {
                    const intentStatus = sanitizeString(topupIntent.status).toLowerCase();
                    if (intentStatus === 'captured_pending_webhook' || intentStatus === 'captured') {
                        return buildBillingReturnRedirect(returnUrl, 'topup_capture_pending_credit', {
                            provider_order_id: orderToken
                        });
                    }
                    if (intentStatus === 'credited') {
                        return buildBillingReturnRedirect(returnUrl, 'topup_credited', {
                            provider_order_id: orderToken
                        });
                    }

                    try {
                        const capture = await captureTopupOrder({
                            config,
                            orderId: orderToken,
                            requestId
                        });
                        const capturedAt = new Date().toISOString();
                        const captureStatus = sanitizeString(capture?.status).toLowerCase();
                        const normalizedIntentStatus = captureStatus === 'completed'
                            ? 'captured_pending_webhook'
                            : `capture_${captureStatus || 'received'}`;
                        const pendingOrderRecord = {
                            order_id: sanitizeString(topupIntent.intent_id) || orderToken,
                            account_id: sanitizeString(topupIntent.account_id),
                            provider: 'paypal',
                            provider_order_id: orderToken,
                            pack_code: sanitizeString(topupIntent.topup_pack_code),
                            credits: Number.isFinite(Number(topupIntent.credits)) ? Math.trunc(Number(topupIntent.credits)) : null,
                            status: normalizedIntentStatus,
                            created_at: sanitizeString(topupIntent.created_at) || capturedAt,
                            updated_at: capturedAt,
                            last_event_type: 'PAYPAL.RETURN.CAPTURE',
                            capture_id: sanitizeString(capture?.captureId),
                            capture_status: captureStatus || 'completed',
                            payer_id: payerId,
                            grant_pending: captureStatus === 'completed'
                        };

                        await billingStore.updateCheckoutIntent(`topup#${orderToken}`, {
                            status: normalizedIntentStatus,
                            updated_at: capturedAt,
                            last_event_type: 'PAYPAL.RETURN.CAPTURE',
                            provider_capture_id: sanitizeString(capture?.captureId),
                            capture_status: captureStatus || 'completed',
                            payer_id: payerId,
                            grant_pending: captureStatus === 'completed',
                            reconciliation_state: captureStatus === 'completed' ? 'pending_webhook' : normalizedIntentStatus
                        });
                        await billingStore.upsertTopupOrderRecord(pendingOrderRecord);

                        log('INFO', 'Captured PayPal top-up order from return callback', {
                            request_id: requestId,
                            account_id: sanitizeString(topupIntent.account_id),
                            site_id: sanitizeString(topupIntent.site_id),
                            provider_order_id: orderToken,
                            capture_id: sanitizeString(capture?.captureId) || null,
                            capture_status: captureStatus || null
                        });

                        return buildBillingReturnRedirect(returnUrl, captureStatus === 'completed' ? 'topup_capture_pending_credit' : 'topup_capture_received', {
                            provider_order_id: orderToken,
                            payer_id: payerId
                        });
                    } catch (captureError) {
                        await billingStore.updateCheckoutIntent(`topup#${orderToken}`, {
                            status: 'capture_failed',
                            updated_at: new Date().toISOString(),
                            last_event_type: 'PAYPAL.RETURN.CAPTURE_FAILED',
                            reconciliation_state: 'capture_failed',
                            capture_error_code: sanitizeString(captureError?.code || 'paypal_capture_failed')
                        });

                        log('WARN', 'PayPal top-up capture from return callback failed', {
                            request_id: requestId,
                            account_id: sanitizeString(topupIntent.account_id),
                            site_id: sanitizeString(topupIntent.site_id),
                            provider_order_id: orderToken,
                            error_code: sanitizeString(captureError?.code || 'paypal_capture_failed')
                        });

                        return buildBillingReturnRedirect(returnUrl, 'topup_capture_failed', {
                            provider_order_id: orderToken
                        });
                    }
                }
            }

            const subscriptionRef = subscriptionId || billingAgreementToken || orderToken;
            if (subscriptionRef) {
                return buildBillingReturnRedirect(returnUrl, 'subscription_pending', {
                    subscription_ref: subscriptionRef
                });
            }

            return buildBillingReturnRedirect(returnUrl, 'unknown');
        }

        const body = parseBody(event);
        const binding = extractAccountBinding(body);
        ensureBoundAccount(binding);

        if (route === 'POST /aivi/v1/billing/checkout/subscription') {
            const planCode = sanitizeString(body.plan_code).toLowerCase();
            if (!resolvePlanCatalogEntry(planCode)) {
                throw createHttpError(400, 'invalid_plan_code', 'A valid plan_code is required.');
            }

            const session = await createSubscriptionCheckoutSession({
                config,
                planCode,
                accountId: binding.accountId,
                siteId: binding.siteId,
                requestId
            });

            await billingStore.putCheckoutIntent(buildCheckoutIntentRecord(session, binding));

            log('INFO', 'Created PayPal subscription checkout intent', {
                request_id: requestId,
                account_id: binding.accountId,
                site_id: binding.siteId,
                blog_id: binding.blogId || null,
                home_url: binding.homeUrl || null,
                plan_code: planCode
            });

            return jsonResponse(200, buildSafeCheckoutResponse(session));
        }

        if (route === 'POST /aivi/v1/billing/checkout/topup') {
            const packCode = sanitizeString(body.topup_pack_code).toLowerCase();
            if (!resolveTopupPackEntry(packCode)) {
                throw createHttpError(400, 'invalid_topup_pack_code', 'A valid topup_pack_code is required.');
            }

            const session = await createTopupCheckoutSession({
                config,
                packCode,
                accountId: binding.accountId,
                siteId: binding.siteId,
                requestId
            });

            await billingStore.putCheckoutIntent(buildCheckoutIntentRecord(session, binding));

            log('INFO', 'Created PayPal top-up checkout intent', {
                request_id: requestId,
                account_id: binding.accountId,
                site_id: binding.siteId,
                blog_id: binding.blogId || null,
                home_url: binding.homeUrl || null,
                topup_pack_code: packCode
            });

            return jsonResponse(200, buildSafeCheckoutResponse(session));
        }

        if (route === 'POST /aivi/v1/billing/manage') {
            await getManageBillingRedirect({
                config,
                accountId: binding.accountId,
                siteId: binding.siteId,
                requestId
            });
        }

        return jsonResponse(404, {
            ok: false,
            error: 'not_found',
            message: `Route ${route} not found`
        });
    } catch (error) {
        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        const code = sanitizeString(error?.code || 'billing_checkout_failed');
        const message = sanitizeString(error?.message || 'Billing checkout could not be created.');

        log(statusCode >= 500 ? 'ERROR' : 'WARN', 'Billing checkout handler failed', {
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

module.exports = { billingCheckoutHandler };
