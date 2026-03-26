const { randomUUID } = require('crypto');
const { getPayPalConfig, resolvePlanCatalogEntry, resolveTopupPackEntry } = require('./paypal-config');
const { createBillingStore } = require('./billing-store');
const { createAccountBillingStateStore } = require('./billing-account-state');
const {
    createHttpError,
    createSubscriptionCheckoutSession,
    createSubscriptionRevisionSession,
    createTopupCheckoutSession,
    captureTopupOrder,
    getSubscriptionDetails,
    getManageBillingRedirect
} = require('./paypal-client');

const jsonHeaders = {
    'Content-Type': 'application/json'
};

const sanitizeString = (value) => String(value || '').trim();
const PAID_PLAN_CODES = new Set(['starter', 'growth', 'pro']);
const PLAN_ORDER = Object.freeze({
    starter: 1,
    growth: 2,
    pro: 3
});

const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const buildSiteBillingReturnUrl = (homeUrl, fallbackUrl, options = {}) => {
    const fallback = sanitizeString(fallbackUrl);
    const normalizedHomeUrl = sanitizeString(homeUrl);
    const requireHttps = options && options.requireHttps === true;
    if (!normalizedHomeUrl) {
        return requireHttps ? '' : fallback;
    }

    try {
        const parsed = new URL(normalizedHomeUrl);
        if (parsed.protocol !== 'https:') {
            return requireHttps ? '' : fallback;
        }
        parsed.search = '';
        parsed.hash = '';
        parsed.pathname = '/wp-json/aivi/v1/backend/billing_return';
        return parsed.toString();
    } catch (error) {
        return requireHttps ? '' : fallback;
    }
};

const ensureHostedBillingReturnUrl = (homeUrl, fallbackUrl) => {
    const resolved = buildSiteBillingReturnUrl(homeUrl, fallbackUrl, { requireHttps: true });
    if (!resolved) {
        throw createHttpError(
            409,
            'billing_https_required',
            'Hosted billing requires this site to use HTTPS. Enable SSL and update the WordPress Address/Site Address to https before choosing a plan or buying credits.'
        );
    }
    return resolved;
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
        ...(session.intentVariant ? { intent_variant: session.intentVariant } : {}),
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
    intent_variant: sanitizeString(session.intentVariant),
    provider: session.provider,
    provider_reference_id: sanitizeString(session.providerSubscriptionId || session.providerOrderId),
    account_id: sanitizeString(binding.accountId),
    site_id: sanitizeString(binding.siteId),
    blog_id: sanitizeString(binding.blogId),
    home_url: sanitizeString(binding.homeUrl),
    plan_code: sanitizeString(session.planCode),
    source_plan_code: sanitizeString(session.sourcePlanCode),
    provider_plan_id: sanitizeString(session.providerPlanId),
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

const getPlanRank = (planCode) => PLAN_ORDER[sanitizeString(planCode).toLowerCase()] || 0;

const classifyPlanTransition = (currentPlanCode, targetPlanCode) => {
    const current = sanitizeString(currentPlanCode).toLowerCase();
    const target = sanitizeString(targetPlanCode).toLowerCase();

    if (!target || current === target) {
        return 'same';
    }
    if (!current || !PAID_PLAN_CODES.has(current) || !PAID_PLAN_CODES.has(target)) {
        return 'initial';
    }
    return getPlanRank(target) > getPlanRank(current) ? 'upgrade' : 'downgrade';
};

const canApplyIntroOfferToInitialSubscription = ({ planEntry, currentPlanCode, currentHasActivePaidPlan, currentHasPendingSubscription, planTransition }) => {
    if (!planEntry || sanitizeString(planEntry.code).toLowerCase() !== 'growth') {
        return false;
    }
    if (planTransition !== 'initial' || currentHasActivePaidPlan || currentHasPendingSubscription) {
        return false;
    }
    const introType = sanitizeString(planEntry?.intro_offer?.type);
    const percentOff = Number(planEntry?.intro_offer?.percent_off);
    if (introType !== 'percent_off_first_cycle' || !Number.isFinite(percentOff) || percentOff <= 0 || percentOff >= 100) {
        return false;
    }

    const normalizedCurrentPlanCode = sanitizeString(currentPlanCode).toLowerCase();
    return !normalizedCurrentPlanCode || normalizedCurrentPlanCode === 'free_trial';
};

const normalizeProviderSubscriptionStatus = (status) => {
    const normalized = sanitizeString(status).toLowerCase();
    if (!normalized) return '';
    if (normalized === 'approval_pending' || normalized === 'approved') {
        return 'created';
    }
    if (normalized === 'canceled') {
        return 'cancelled';
    }
    return normalized;
};

const isRetryReadyTerminalSubscriptionStatus = (status) => ['cancelled', 'canceled', 'expired', 'error', 'payment_failed', 'suspended'].includes(sanitizeString(status).toLowerCase());

const resolveRetryReadySubscriptionStatus = (state = {}) => {
    const planCode = sanitizeString(state?.plan_code).toLowerCase();
    const trialStatus = sanitizeString(state?.trial_status).toLowerCase();
    if (trialStatus === 'active' || planCode === 'free_trial') {
        return 'trial';
    }
    return '';
};

const isRetryReadyTrialState = (state = {}) => {
    if (sanitizeString(state?.subscription_status).toLowerCase() !== 'created') {
        return false;
    }
    return !!resolveRetryReadySubscriptionStatus(state);
};

const buildRetryReadySubscriptionEventType = (status) => {
    const normalized = sanitizeString(status).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return normalized ? `PAYPAL.RETURN.${normalized}` : 'PAYPAL.RETURN.RETRY_READY';
};

const classifySubscriptionLookupFailure = (error) => {
    const code = sanitizeString(error?.code).toLowerCase();
    const providerStatus = Number(error?.details?.status || error?.status || 0);

    if (code === 'paypal_subscription_not_found' || providerStatus === 404) {
        return 'not_found';
    }
    if (code === 'paypal_subscription_invalid' || providerStatus === 422) {
        return 'invalid';
    }
    if (code === 'paypal_subscription_lookup_unauthorized' || providerStatus === 401 || providerStatus === 403) {
        return 'unauthorized';
    }
    return '';
};

const isRetryReadyLookupFailure = (lookupFailure) => ['not_found', 'invalid'].includes(sanitizeString(lookupFailure).toLowerCase());

const resolveRetryReadyLookupFailureStatus = (lookupFailure) => (
    sanitizeString(lookupFailure).toLowerCase() === 'not_found'
        ? 'cancelled'
        : 'error'
);

const buildRetryReadyAccountState = (state = {}, status, updatedAt) => {
    const nextSubscriptionStatus = resolveRetryReadySubscriptionStatus(state);
    return {
        ...state,
        connected: true,
        connection_status: 'connected',
        subscription_status: nextSubscriptionStatus,
        subscription: {
            ...(state.subscription || {}),
            provider_subscription_id: '',
            current_period_start: null,
            current_period_end: null,
            cancel_at_period_end: false,
            credit_cycle_key: '',
            last_event_type: buildRetryReadySubscriptionEventType(status)
        },
        updated_at: sanitizeString(updatedAt) || new Date().toISOString()
    };
};

const reconcilePendingSubscriptionReturn = async ({
    billingStore,
    accountStateStore,
    config,
    requestId,
    subscriptionIntent,
    subscriptionRef
}) => {
    const providerSubscriptionId = sanitizeString(subscriptionRef || subscriptionIntent?.provider_reference_id);
    const accountId = sanitizeString(subscriptionIntent?.account_id);
    const currentState = accountId && typeof accountStateStore.getAccountState === 'function'
        ? await accountStateStore.getAccountState(accountId)
        : null;
    if (!providerSubscriptionId) {
        return { returnStatus: 'subscription_pending' };
    }

    try {
        const details = await getSubscriptionDetails({
            config,
            providerSubscriptionId,
            requestId
        });
        const normalizedStatus = normalizeProviderSubscriptionStatus(details.status);
        const updatedAt = sanitizeString(details.statusUpdateTime) || new Date().toISOString();

        if (!normalizedStatus || normalizedStatus === 'created') {
            return { returnStatus: 'subscription_pending' };
        }

        if (typeof billingStore.updateCheckoutIntent === 'function') {
            await billingStore.updateCheckoutIntent(`subscription#${providerSubscriptionId}`, {
                status: normalizedStatus,
                updated_at: updatedAt,
                last_event_type: buildRetryReadySubscriptionEventType(normalizedStatus),
                reconciliation_state: isRetryReadyTerminalSubscriptionStatus(normalizedStatus) ? 'retry_ready' : 'provider_state_checked'
            });
        }

        if (currentState && isRetryReadyTerminalSubscriptionStatus(normalizedStatus) && isRetryReadyTrialState(currentState) && typeof accountStateStore.putAccountState === 'function') {
            const nextState = buildRetryReadyAccountState(currentState, normalizedStatus, updatedAt);
            await accountStateStore.putAccountState(nextState);

            log('INFO', 'Reset pending PayPal subscription to retry-ready state from return callback', {
                request_id: requestId,
                account_id: accountId,
                site_id: sanitizeString(subscriptionIntent?.site_id),
                provider_subscription_id: providerSubscriptionId,
                provider_status: normalizedStatus
            });

            return { returnStatus: 'subscription_retry_ready' };
        }
    } catch (error) {
        const lookupFailure = classifySubscriptionLookupFailure(error);
        if (currentState && isRetryReadyTrialState(currentState) && isRetryReadyLookupFailure(lookupFailure) && typeof accountStateStore.putAccountState === 'function') {
            const derivedStatus = resolveRetryReadyLookupFailureStatus(lookupFailure);
            const updatedAt = new Date().toISOString();

            if (typeof billingStore.updateCheckoutIntent === 'function') {
                await billingStore.updateCheckoutIntent(`subscription#${providerSubscriptionId}`, {
                    status: derivedStatus,
                    updated_at: updatedAt,
                    last_event_type: buildRetryReadySubscriptionEventType(`${lookupFailure}_lookup`),
                    reconciliation_state: 'retry_ready_lookup_failure',
                    lookup_failure: lookupFailure
                });
            }

            const nextState = buildRetryReadyAccountState(currentState, derivedStatus, updatedAt);
            await accountStateStore.putAccountState(nextState);

            log('INFO', 'Reset pending PayPal subscription to retry-ready state after terminal lookup failure', {
                request_id: requestId,
                account_id: accountId,
                site_id: sanitizeString(subscriptionIntent?.site_id),
                provider_subscription_id: providerSubscriptionId,
                lookup_failure: lookupFailure,
                provider_error_code: sanitizeString(error?.code),
                provider_http_status: Number(error?.details?.status || error?.status || 0) || null
            });

            return { returnStatus: 'subscription_retry_ready' };
        }

        log('WARN', 'PayPal subscription return reconciliation lookup failed', {
            request_id: requestId,
            account_id: accountId,
            site_id: sanitizeString(subscriptionIntent?.site_id),
            provider_subscription_id: providerSubscriptionId,
            error_code: sanitizeString(error?.code || 'paypal_subscription_lookup_failed'),
            lookup_failure: lookupFailure,
            provider_http_status: Number(error?.details?.status || error?.status || 0) || null
        });
    }

    return { returnStatus: 'subscription_pending' };
};

const billingCheckoutHandler = async (event = {}) => {
    try {
        const route = sanitizeString(event.aiviResolvedRoute || event.routeKey || `${event.httpMethod || event.requestContext?.http?.method} ${event.path || event.requestContext?.http?.path}`);
        const requestId = sanitizeString(event.requestContext?.requestId || event.requestContext?.requestContext?.requestId || randomUUID());
        const config = getPayPalConfig(process.env);
        const billingStore = createBillingStore();
        const accountStateStore = createAccountBillingStateStore();

        if (route === 'GET /aivi/v1/billing/return/paypal') {
            const fallbackReturnUrl = sanitizeString(config.returnUrl);
            if (!fallbackReturnUrl) {
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
                    const returnUrl = buildSiteBillingReturnUrl(topupIntent.return_url, fallbackReturnUrl);
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
                const subscriptionIntent = await billingStore.getCheckoutIntent(`subscription#${subscriptionRef}`);
                const returnUrl = buildSiteBillingReturnUrl(subscriptionIntent?.return_url, fallbackReturnUrl);
                const returnState = await reconcilePendingSubscriptionReturn({
                    billingStore,
                    accountStateStore,
                    config,
                    requestId,
                    subscriptionIntent,
                    subscriptionRef
                });
                return buildBillingReturnRedirect(returnUrl, returnState.returnStatus, {
                    subscription_ref: subscriptionRef
                });
            }

            return buildBillingReturnRedirect(fallbackReturnUrl, 'unknown');
        }

        const body = parseBody(event);
        const binding = extractAccountBinding(body);
        ensureBoundAccount(binding);

        if (route === 'POST /aivi/v1/billing/checkout/subscription') {
            const planCode = sanitizeString(body.plan_code).toLowerCase();
            const planEntry = resolvePlanCatalogEntry(planCode);
            if (!planEntry) {
                throw createHttpError(400, 'invalid_plan_code', 'A valid plan_code is required.');
            }

            const currentAccountState = await accountStateStore.getAccountState(binding.accountId);
            const currentPlanCode = sanitizeString(currentAccountState?.plan_code).toLowerCase();
            const currentSubscriptionStatus = sanitizeString(currentAccountState?.subscription_status).toLowerCase();
            const currentProviderSubscriptionId = sanitizeString(
                currentAccountState?.subscription?.provider_subscription_id
                || currentAccountState?.provider_subscription_id
            );
            const currentHasActivePaidPlan = PAID_PLAN_CODES.has(currentPlanCode) && currentSubscriptionStatus === 'active';
            const currentHasPendingSubscription = currentSubscriptionStatus === 'created' && !!currentProviderSubscriptionId;
            const planTransition = classifyPlanTransition(currentPlanCode, planCode);
            const applyIntroOffer = canApplyIntroOfferToInitialSubscription({
                planEntry,
                currentPlanCode,
                currentHasActivePaidPlan,
                currentHasPendingSubscription,
                planTransition
            });
            const introProviderPlanId = applyIntroOffer ? sanitizeString(config.planIds?.growth_intro) : '';

            if (currentHasPendingSubscription && planTransition !== 'same') {
                throw createHttpError(409, 'subscription_pending_activation', 'Wait for the current subscription activation to finish before changing plans.');
            }

            if (currentHasActivePaidPlan && planTransition === 'downgrade') {
                throw createHttpError(409, 'downgrade_at_renewal', 'Downgrades take effect at your next billing renewal. Contact support to schedule the lower plan without an immediate charge.');
            }
            if (applyIntroOffer && !introProviderPlanId) {
                throw createHttpError(
                    503,
                    'paypal_intro_plan_not_configured',
                    'Growth introductory pricing is not configured yet. Contact support before subscribing so you receive the correct first-cycle discount.'
                );
            }

            const hostedReturnUrl = ensureHostedBillingReturnUrl(binding.homeUrl, config.returnUrl);

            if (currentHasActivePaidPlan && planTransition === 'upgrade') {
                const providerSubscriptionId = sanitizeString(
                    currentAccountState?.subscription?.provider_subscription_id
                    || currentAccountState?.provider_subscription_id
                );
                if (!providerSubscriptionId) {
                    throw createHttpError(409, 'missing_provider_subscription_id', 'The current subscription reference is missing. Refresh the page and try the upgrade again.');
                }

                const session = await createSubscriptionRevisionSession({
                    config: {
                        ...config,
                        returnUrl: hostedReturnUrl,
                        cancelUrl: hostedReturnUrl
                    },
                    providerSubscriptionId,
                    planCode,
                    accountId: binding.accountId,
                    siteId: binding.siteId,
                    requestId
                });

                await billingStore.putCheckoutIntent({
                    ...buildCheckoutIntentRecord({
                        ...session,
                        sourcePlanCode: currentPlanCode
                    }, binding),
                    status: 'plan_change_pending',
                    plan_transition: planTransition
                });

                log('INFO', 'Created PayPal subscription revise intent', {
                    request_id: requestId,
                    account_id: binding.accountId,
                    site_id: binding.siteId,
                    blog_id: binding.blogId || null,
                    home_url: binding.homeUrl || null,
                    provider_subscription_id: providerSubscriptionId,
                    source_plan_code: currentPlanCode,
                    target_plan_code: planCode
                });

                return jsonResponse(200, buildSafeCheckoutResponse(session));
            }

            const session = await createSubscriptionCheckoutSession({
                config: {
                    ...config,
                    returnUrl: hostedReturnUrl,
                    cancelUrl: hostedReturnUrl
                },
                planCode,
                providerPlanId: applyIntroOffer ? introProviderPlanId : '',
                intentVariant: applyIntroOffer ? 'intro_offer' : '',
                introOfferApplied: applyIntroOffer,
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
                plan_code: planCode,
                provider_plan_id: sanitizeString(session.providerPlanId) || null,
                intro_offer_applied: applyIntroOffer
            });

            return jsonResponse(200, buildSafeCheckoutResponse(session));
        }

        if (route === 'POST /aivi/v1/billing/checkout/topup') {
            const packCode = sanitizeString(body.topup_pack_code).toLowerCase();
            if (!resolveTopupPackEntry(packCode)) {
                throw createHttpError(400, 'invalid_topup_pack_code', 'A valid topup_pack_code is required.');
            }

            const hostedReturnUrl = ensureHostedBillingReturnUrl(binding.homeUrl, config.returnUrl);

            const session = await createTopupCheckoutSession({
                config: {
                    ...config,
                    returnUrl: hostedReturnUrl,
                    cancelUrl: hostedReturnUrl
                },
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
