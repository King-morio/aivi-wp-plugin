const { randomUUID, createHash } = require('crypto');
const { resolvePlanCatalogEntry, resolveTopupPackEntry } = require('./paypal-config');

const sanitizeString = (value) => String(value || '').trim();

const createHttpError = (statusCode, code, message, details = {}) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
};

const ensureFetch = (fetchImpl = global.fetch) => {
    if (typeof fetchImpl !== 'function') {
        throw createHttpError(503, 'paypal_fetch_unavailable', 'PayPal client fetch runtime is unavailable.');
    }
    return fetchImpl;
};

const ensureHttpsUrl = (value, fieldName) => {
    const candidate = sanitizeString(value);
    if (!candidate) {
        throw createHttpError(503, 'paypal_not_configured', `${fieldName} is not configured.`);
    }

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch (error) {
        throw createHttpError(503, 'paypal_not_configured', `${fieldName} is invalid.`);
    }

    if (parsed.protocol !== 'https:') {
        throw createHttpError(503, 'paypal_not_configured', `${fieldName} must use https.`);
    }

    return parsed.toString().replace(/\/$/, '');
};

const formatUsd = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw createHttpError(500, 'paypal_invalid_amount', 'A positive USD amount is required for PayPal checkout.');
    }
    return numeric.toFixed(2);
};

const buildCustomId = ({ kind, accountId, siteId, refCode }) => {
    const digest = createHash('sha256')
        .update([sanitizeString(kind), sanitizeString(accountId), sanitizeString(siteId), sanitizeString(refCode)].join('|'))
        .digest('hex')
        .slice(0, 24);
    return `aivi|${sanitizeString(kind)}|${digest}`;
};

const extractApprovalUrl = (payload) => {
    const links = Array.isArray(payload?.links) ? payload.links : [];
    const approved = links.find((link) => link && typeof link.href === 'string' && (link.rel === 'approve' || link.rel === 'payer-action'));
    if (!approved || !approved.href) {
        throw createHttpError(502, 'paypal_missing_approval_url', 'PayPal did not return a hosted approval URL.');
    }
    return approved.href;
};

const ensureBaseConfig = (config) => {
    const apiBase = ensureHttpsUrl(config?.apiBase, 'PAYPAL_API_BASE');
    const returnUrl = ensureHttpsUrl(config?.returnUrl, 'PAYPAL_RETURN_URL');
    const cancelUrl = ensureHttpsUrl(config?.cancelUrl, 'PAYPAL_CANCEL_URL');
    const clientId = sanitizeString(config?.clientId);
    const clientSecret = sanitizeString(config?.clientSecret);
    if (!clientId || !clientSecret) {
        throw createHttpError(503, 'paypal_not_configured', 'PayPal client credentials are not configured.');
    }
    return {
        apiBase,
        returnUrl,
        cancelUrl,
        brandName: sanitizeString(config?.brandName || 'AiVI'),
        clientId,
        clientSecret,
        planIds: config?.planIds || {}
    };
};

const paypalJsonRequest = async ({ config, path, method, body, requestId, fetchImpl = global.fetch }) => {
    const runtime = ensureBaseConfig(config);
    const fetcher = ensureFetch(fetchImpl);

    const credentials = Buffer.from(`${runtime.clientId}:${runtime.clientSecret}`).toString('base64');
    const tokenResponse = await fetcher(`${runtime.apiBase}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !sanitizeString(tokenPayload.access_token)) {
        throw createHttpError(502, 'paypal_auth_failed', 'Failed to obtain a PayPal access token.', {
            status: tokenResponse.status,
            body: tokenPayload
        });
    }

    const response = await fetcher(`${runtime.apiBase}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': sanitizeString(requestId) || randomUUID(),
            Prefer: 'return=representation'
        },
        body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw createHttpError(502, 'paypal_checkout_failed', 'PayPal checkout creation failed.', {
            status: response.status,
            body: payload
        });
    }

    return {
        runtime,
        payload
    };
};

const verifyWebhookSignature = async ({
    config,
    headers,
    webhookEvent,
    requestId,
    fetchImpl = global.fetch
}) => {
    const runtime = ensureBaseConfig(config);
    const webhookId = sanitizeString(config?.webhookId || runtime.webhookId);
    if (!webhookId) {
        throw createHttpError(503, 'paypal_not_configured', 'PAYPAL_WEBHOOK_ID is not configured.');
    }

    const transmissionId = sanitizeString(headers?.['paypal-transmission-id'] || headers?.['PayPal-Transmission-Id']);
    const transmissionTime = sanitizeString(headers?.['paypal-transmission-time'] || headers?.['PayPal-Transmission-Time']);
    const certUrl = sanitizeString(headers?.['paypal-cert-url'] || headers?.['PayPal-Cert-Url']);
    const authAlgo = sanitizeString(headers?.['paypal-auth-algo'] || headers?.['PayPal-Auth-Algo']);
    const transmissionSig = sanitizeString(headers?.['paypal-transmission-sig'] || headers?.['PayPal-Transmission-Sig']);

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
        throw createHttpError(400, 'paypal_webhook_headers_missing', 'Required PayPal webhook headers are missing.');
    }

    const { payload } = await paypalJsonRequest({
        config: runtime,
        path: '/v1/notifications/verify-webhook-signature',
        method: 'POST',
        requestId,
        fetchImpl,
        body: {
            transmission_id: transmissionId,
            transmission_time: transmissionTime,
            cert_url: certUrl,
            auth_algo: authAlgo,
            transmission_sig: transmissionSig,
            webhook_id: webhookId,
            webhook_event: webhookEvent
        }
    });

    return {
        verificationStatus: sanitizeString(payload?.verification_status).toUpperCase(),
        payload
    };
};

const createSubscriptionCheckoutSession = async ({
    config,
    planCode,
    accountId,
    siteId,
    requestId,
    fetchImpl = global.fetch
}) => {
    const runtime = ensureBaseConfig(config);
    const plan = resolvePlanCatalogEntry(planCode);
    if (!plan) {
        throw createHttpError(400, 'invalid_plan_code', 'Unknown subscription plan code.');
    }

    const providerPlanId = sanitizeString(runtime.planIds?.[plan.code]);
    if (!providerPlanId) {
        throw createHttpError(503, 'paypal_plan_not_configured', `PayPal plan ID is not configured for ${plan.code}.`);
    }

    const customId = buildCustomId({
        kind: 'subscription',
        accountId,
        siteId,
        refCode: plan.code
    });

    const { payload } = await paypalJsonRequest({
        config: runtime,
        path: '/v1/billing/subscriptions',
        method: 'POST',
        requestId,
        fetchImpl,
        body: {
            plan_id: providerPlanId,
            custom_id: customId,
            application_context: {
                brand_name: runtime.brandName,
                user_action: 'SUBSCRIBE_NOW',
                return_url: runtime.returnUrl,
                cancel_url: runtime.cancelUrl,
                shipping_preference: 'NO_SHIPPING'
            }
        }
    });

    return {
        requestId: sanitizeString(requestId) || randomUUID(),
        intentType: 'subscription',
        provider: 'paypal',
        planCode: plan.code,
        approvalUrl: extractApprovalUrl(payload),
        returnUrl: runtime.returnUrl,
        cancelUrl: runtime.cancelUrl,
        providerSubscriptionId: sanitizeString(payload?.id),
        expiresAt: null
    };
};

const createTopupCheckoutSession = async ({
    config,
    packCode,
    accountId,
    siteId,
    requestId,
    fetchImpl = global.fetch
}) => {
    const runtime = ensureBaseConfig(config);
    const pack = resolveTopupPackEntry(packCode);
    if (!pack) {
        throw createHttpError(400, 'invalid_topup_pack_code', 'Unknown top-up pack code.');
    }

    const customId = buildCustomId({
        kind: 'topup',
        accountId,
        siteId,
        refCode: pack.code
    });

    const { payload } = await paypalJsonRequest({
        config: runtime,
        path: '/v2/checkout/orders',
        method: 'POST',
        requestId,
        fetchImpl,
        body: {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    reference_id: pack.code,
                    custom_id: customId,
                    description: `AiVI credit top-up: ${pack.label}`,
                    amount: {
                        currency_code: 'USD',
                        value: formatUsd(pack.price_usd)
                    }
                }
            ],
            payment_source: {
                paypal: {
                    experience_context: {
                        brand_name: runtime.brandName,
                        user_action: 'PAY_NOW',
                        return_url: runtime.returnUrl,
                        cancel_url: runtime.cancelUrl,
                        shipping_preference: 'NO_SHIPPING'
                    }
                }
            }
        }
    });

    return {
        requestId: sanitizeString(requestId) || randomUUID(),
        intentType: 'topup',
        provider: 'paypal',
        packCode: pack.code,
        approvalUrl: extractApprovalUrl(payload),
        returnUrl: runtime.returnUrl,
        cancelUrl: runtime.cancelUrl,
        credits: pack.credits,
        priceUsd: pack.price_usd,
        providerOrderId: sanitizeString(payload?.id),
        expiresAt: null
    };
};

const captureTopupOrder = async ({
    config,
    orderId,
    requestId,
    fetchImpl = global.fetch
}) => {
    const runtime = ensureBaseConfig(config);
    const normalizedOrderId = sanitizeString(orderId);
    if (!normalizedOrderId) {
        throw createHttpError(400, 'missing_order_id', 'A PayPal order ID is required to capture a top-up order.');
    }

    const { payload } = await paypalJsonRequest({
        config: runtime,
        path: `/v2/checkout/orders/${encodeURIComponent(normalizedOrderId)}/capture`,
        method: 'POST',
        requestId,
        fetchImpl,
        body: {}
    });

    return {
        orderId: normalizedOrderId,
        captureId: sanitizeString(payload?.purchase_units?.[0]?.payments?.captures?.[0]?.id),
        status: sanitizeString(payload?.status),
        payload
    };
};

const getManageBillingRedirect = async () => {
    throw createHttpError(
        501,
        'billing_management_unsupported',
        'Hosted billing management will be enabled after subscription reconciliation is in place.'
    );
};

module.exports = {
    createHttpError,
    createSubscriptionCheckoutSession,
    createTopupCheckoutSession,
    captureTopupOrder,
    getManageBillingRedirect,
    verifyWebhookSignature
};
