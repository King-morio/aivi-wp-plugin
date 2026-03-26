const { getPayPalConfig, resolvePlanCodeByProviderPlanId } = require('./paypal-config');

const sanitizeString = (value) => String(value || '').trim();
const normalizeIntOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};
const toIso = (value) => {
    const candidate = value ? new Date(value) : new Date();
    return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
};

const normalizeSubscriptionStatus = (eventType, resourceStatus) => {
    const status = sanitizeString(resourceStatus).toLowerCase();
    if (status === 'active' || status === 'suspended' || status === 'cancelled' || status === 'expired') {
        return status;
    }

    const map = {
        'BILLING.SUBSCRIPTION.CREATED': 'created',
        'BILLING.SUBSCRIPTION.ACTIVATED': 'active',
        'BILLING.SUBSCRIPTION.UPDATED': 'active',
        'BILLING.SUBSCRIPTION.SUSPENDED': 'suspended',
        'BILLING.SUBSCRIPTION.CANCELLED': 'cancelled',
        'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
        'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'error'
    };
    return map[eventType] || 'created';
};

const normalizeResourceType = (eventType) => {
    if (eventType.startsWith('BILLING.SUBSCRIPTION.')) {
        return 'subscription';
    }
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        return 'capture';
    }
    return 'other';
};

const buildSubscriptionLookupKey = (providerSubscriptionId) => `subscription#${sanitizeString(providerSubscriptionId)}`;
const buildTopupLookupKey = (providerOrderId) => `topup#${sanitizeString(providerOrderId)}`;

const reconcilePayPalWebhookEvent = async ({ webhookEvent, store, config = getPayPalConfig(process.env) }) => {
    const eventType = sanitizeString(webhookEvent?.event_type);
    const resource = webhookEvent?.resource || {};
    const eventCreatedAt = toIso(webhookEvent?.create_time);
    const providerEventId = sanitizeString(webhookEvent?.id);
    const resourceType = normalizeResourceType(eventType);

    const baseSummary = {
        provider_event_id: providerEventId,
        event_type: eventType,
        resource_type: resourceType
    };

    if (resourceType === 'subscription') {
        const providerSubscriptionId = sanitizeString(resource?.id);
        const lookup = providerSubscriptionId ? await store.getCheckoutIntent(buildSubscriptionLookupKey(providerSubscriptionId)) : null;
        const planCode = sanitizeString(lookup?.plan_code) || resolvePlanCodeByProviderPlanId(config, resource?.plan_id) || '';
        const intentVariant = sanitizeString(lookup?.intent_variant);
        const sourcePlanCode = sanitizeString(lookup?.source_plan_code);
        const planTransition = sanitizeString(lookup?.plan_transition);
        const record = {
            subscription_id: sanitizeString(lookup?.intent_id) || providerSubscriptionId || providerEventId,
            account_id: sanitizeString(lookup?.account_id),
            provider: 'paypal',
            provider_subscription_id: providerSubscriptionId,
            plan_code: planCode,
            intent_variant: intentVariant,
            source_plan_code: sourcePlanCode,
            plan_transition: planTransition,
            status: normalizeSubscriptionStatus(eventType, resource?.status),
            current_period_start: sanitizeString(resource?.billing_info?.last_payment?.time || ''),
            current_period_end: sanitizeString(resource?.billing_info?.next_billing_time || ''),
            cancel_at_period_end: eventType === 'BILLING.SUBSCRIPTION.CANCELLED',
            created_at: sanitizeString(lookup?.created_at) || eventCreatedAt,
            updated_at: eventCreatedAt,
            last_event_type: eventType,
            last_payment_status: eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' ? 'failed' : ''
        };

        return {
            resourceType,
            checkoutIntent: lookup || null,
            subscriptionRecord: record,
            reconciliationSummary: {
                ...baseSummary,
                plan_code: planCode,
                provider_subscription_id: providerSubscriptionId,
                intent_variant: intentVariant,
                source_plan_code: sourcePlanCode,
                plan_transition: planTransition
            }
        };
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const providerOrderId = sanitizeString(resource?.supplementary_data?.related_ids?.order_id || resource?.invoice_id || resource?.id);
        const lookup = providerOrderId ? await store.getCheckoutIntent(buildTopupLookupKey(providerOrderId)) : null;
        const existingTopupOrder = providerOrderId && typeof store.getTopupOrderRecord === 'function'
            ? await store.getTopupOrderRecord(sanitizeString(lookup?.intent_id) || providerOrderId)
            : null;
        const packCode = sanitizeString(existingTopupOrder?.pack_code || lookup?.topup_pack_code);
        const credits = normalizeIntOrNull(existingTopupOrder?.credits ?? lookup?.credits);
        const record = {
            ...(existingTopupOrder || {}),
            order_id: sanitizeString(existingTopupOrder?.order_id || lookup?.intent_id) || providerOrderId || providerEventId,
            account_id: sanitizeString(existingTopupOrder?.account_id || lookup?.account_id),
            provider: 'paypal',
            provider_order_id: providerOrderId,
            pack_code: packCode,
            credits,
            status: 'captured',
            created_at: sanitizeString(existingTopupOrder?.created_at || lookup?.created_at) || eventCreatedAt,
            updated_at: eventCreatedAt,
            last_event_type: eventType,
            capture_id: sanitizeString(resource?.id || existingTopupOrder?.capture_id),
            capture_status: 'completed',
            grant_pending: true
        };

        return {
            resourceType: 'order',
            topupOrderRecord: record,
            reconciliationSummary: {
                ...baseSummary,
                provider_order_id: providerOrderId,
                pack_code: packCode,
                capture_id: sanitizeString(resource?.id),
                grant_pending: true
            }
        };
    }

    return {
        resourceType: 'other',
        reconciliationSummary: baseSummary
    };
};

module.exports = {
    reconcilePayPalWebhookEvent,
    buildSubscriptionLookupKey,
    buildTopupLookupKey
};
