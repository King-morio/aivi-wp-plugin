const { createAdjustmentEvent, persistLedgerEvent } = require('./credit-ledger');
const { reconcilePayPalWebhookEvent, buildTopupLookupKey } = require('./paypal-reconciliation');
const {
    buildDefaultAccountBillingState,
    applySubscriptionRecordToState,
    applyTopupGrantToState,
    computeTotalRemaining
} = require('./billing-account-state');

const sanitizeString = (value) => String(value || '').trim();
const lower = (value) => sanitizeString(value).toLowerCase();

const buildPreservedSubscriptionState = (state, subscriptionRecord, { nextSubscriptionStatus = '', clearSubscriptionLink = false } = {}) => {
    const current = buildDefaultAccountBillingState({
        accountId: sanitizeString(state?.account_id)
    });
    const base = state || current;
    return {
        ...base,
        connected: true,
        connection_status: 'connected',
        subscription_status: sanitizeString(nextSubscriptionStatus || base.subscription_status).toLowerCase(),
        subscription: {
            ...(base.subscription || {}),
            provider_subscription_id: clearSubscriptionLink
                ? ''
                : (sanitizeString(subscriptionRecord.provider_subscription_id) || sanitizeString(base.subscription?.provider_subscription_id)),
            current_period_start: clearSubscriptionLink
                ? null
                : (subscriptionRecord.current_period_start || base.subscription?.current_period_start || null),
            current_period_end: clearSubscriptionLink
                ? null
                : (subscriptionRecord.current_period_end || base.subscription?.current_period_end || null),
            last_event_type: sanitizeString(subscriptionRecord.last_event_type),
            cancel_at_period_end: clearSubscriptionLink ? false : subscriptionRecord.cancel_at_period_end === true,
            credit_cycle_key: clearSubscriptionLink ? '' : sanitizeString(base.subscription?.credit_cycle_key)
        },
        updated_at: sanitizeString(subscriptionRecord.updated_at) || new Date().toISOString()
    };
};

const isRetryReadyTerminalStatus = (status) => ['cancelled', 'canceled', 'expired', 'error', 'payment_failed', 'suspended'].includes(lower(status));

const resolveRetryReadySubscriptionStatus = (state = {}) => {
    const planCode = lower(state.plan_code);
    const trialStatus = lower(state.trial_status);
    if (trialStatus === 'active' || planCode === 'free_trial') {
        return 'trial';
    }
    return '';
};

const processVerifiedPayPalWebhook = async ({
    webhookEvent,
    store,
    accountStateStore,
    config
}) => {
    const reconciliation = await reconcilePayPalWebhookEvent({
        webhookEvent,
        store,
        config
    });

    if (reconciliation.subscriptionRecord) {
        await store.upsertSubscriptionRecord(reconciliation.subscriptionRecord);
        if (reconciliation.subscriptionRecord.account_id) {
            const currentState = await accountStateStore.getAccountState(reconciliation.subscriptionRecord.account_id)
                || buildDefaultAccountBillingState({
                    accountId: reconciliation.subscriptionRecord.account_id
                });
            const totalBefore = computeTotalRemaining(currentState);
            const intentVariant = lower(reconciliation.checkoutIntent?.intent_variant || reconciliation.subscriptionRecord.intent_variant);
            const isRevision = intentVariant === 'revise';
            const normalizedStatus = lower(reconciliation.subscriptionRecord.status);
            const isInitialPendingState = !isRevision && (
                !sanitizeString(currentState?.plan_code)
                || lower(currentState?.plan_code) === 'free_trial'
                || lower(currentState?.trial_status) === 'active'
            );
            const shouldPreserveCurrentEntitlements = normalizedStatus !== 'active' && (isRevision || isInitialPendingState);
            const shouldResetToRetryReadyState = isInitialPendingState && isRetryReadyTerminalStatus(normalizedStatus);
            const applied = shouldPreserveCurrentEntitlements
                ? {
                    state: buildPreservedSubscriptionState(currentState, reconciliation.subscriptionRecord, {
                        nextSubscriptionStatus: shouldResetToRetryReadyState
                            ? resolveRetryReadySubscriptionStatus(currentState)
                            : (isRevision ? sanitizeString(currentState?.subscription_status) : normalizedStatus),
                        clearSubscriptionLink: shouldResetToRetryReadyState
                    }),
                    granted_cycle_credits: 0,
                    granted_upgrade_credits: 0,
                    cycle_key: sanitizeString(currentState?.subscription?.credit_cycle_key)
                }
                : applySubscriptionRecordToState(currentState, reconciliation.subscriptionRecord);
            let nextState = applied.state;

            if (applied.granted_cycle_credits > 0) {
                const grantEvent = await persistLedgerEvent(createAdjustmentEvent({
                    account_id: reconciliation.subscriptionRecord.account_id,
                    site_id: sanitizeString(nextState.site?.site_id),
                    run_id: null,
                    reason_code: 'monthly_grant',
                    external_ref: applied.cycle_key,
                    pricing_snapshot: {},
                    amounts: {
                        granted_credits: applied.granted_cycle_credits,
                        balance_before: totalBefore,
                        balance_after: computeTotalRemaining(nextState)
                    }
                }));
                nextState.updated_at = grantEvent.updated_at || nextState.updated_at;
            }
            if (applied.granted_upgrade_credits > 0) {
                const grantEvent = await persistLedgerEvent(createAdjustmentEvent({
                    account_id: reconciliation.subscriptionRecord.account_id,
                    site_id: sanitizeString(nextState.site?.site_id),
                    run_id: null,
                    reason_code: 'plan_upgrade_delta',
                    external_ref: sanitizeString(reconciliation.subscriptionRecord.provider_subscription_id || applied.cycle_key),
                    pricing_snapshot: {},
                    amounts: {
                        granted_credits: applied.granted_upgrade_credits,
                        balance_before: totalBefore,
                        balance_after: computeTotalRemaining(nextState)
                    }
                }));
                nextState.updated_at = grantEvent.updated_at || nextState.updated_at;
            }

            await accountStateStore.putAccountState(nextState);
        }

        if (typeof store.updateCheckoutIntent === 'function' && sanitizeString(reconciliation.subscriptionRecord.provider_subscription_id)) {
            const intentVariant = lower(reconciliation.checkoutIntent?.intent_variant || reconciliation.subscriptionRecord.intent_variant);
            const isRevision = intentVariant === 'revise';
            const normalizedStatus = lower(reconciliation.subscriptionRecord.status);
            await store.updateCheckoutIntent(`subscription#${sanitizeString(reconciliation.subscriptionRecord.provider_subscription_id)}`, {
                status: isRevision
                    ? (normalizedStatus === 'active' ? 'plan_change_completed' : 'plan_change_pending')
                    : (normalizedStatus || 'created'),
                updated_at: sanitizeString(reconciliation.subscriptionRecord.updated_at) || new Date().toISOString(),
                last_event_type: sanitizeString(reconciliation.subscriptionRecord.last_event_type),
                reconciliation_state: isRevision
                    ? (normalizedStatus === 'active' ? 'plan_change_applied' : 'plan_change_pending')
                    : (normalizedStatus === 'active' ? 'activated' : 'pending'),
                plan_transition: sanitizeString(reconciliation.checkoutIntent?.plan_transition || reconciliation.subscriptionRecord.plan_transition),
                source_plan_code: sanitizeString(reconciliation.checkoutIntent?.source_plan_code || reconciliation.subscriptionRecord.source_plan_code)
            });
        }
    }

    let finalTopupRecord = reconciliation.topupOrderRecord || null;
    if (reconciliation.topupOrderRecord) {
        if (reconciliation.topupOrderRecord.account_id) {
            const currentState = await accountStateStore.getAccountState(reconciliation.topupOrderRecord.account_id)
                || buildDefaultAccountBillingState({
                    accountId: reconciliation.topupOrderRecord.account_id
                });
            const totalBefore = computeTotalRemaining(currentState);
            const applied = applyTopupGrantToState(currentState, reconciliation.topupOrderRecord);
            if (applied.granted_topup_credits > 0) {
                const grantEvent = await persistLedgerEvent(createAdjustmentEvent({
                    account_id: reconciliation.topupOrderRecord.account_id,
                    site_id: sanitizeString(applied.state.site?.site_id),
                    run_id: null,
                    reason_code: 'topup_purchase',
                    external_ref: sanitizeString(reconciliation.topupOrderRecord.provider_order_id),
                    pricing_snapshot: {},
                    amounts: {
                        granted_credits: applied.granted_topup_credits,
                        balance_before: totalBefore,
                        balance_after: computeTotalRemaining(applied.state)
                    }
                }));
                applied.state.updated_at = grantEvent.updated_at || applied.state.updated_at;
                await accountStateStore.putAccountState(applied.state);
                finalTopupRecord = {
                    ...reconciliation.topupOrderRecord,
                    status: 'credited',
                    grant_pending: false,
                    grant_applied_at: applied.state.updated_at
                };
            }
        }

        await store.upsertTopupOrderRecord(finalTopupRecord);
        if (typeof store.updateCheckoutIntent === 'function' && sanitizeString(finalTopupRecord?.provider_order_id)) {
            await store.updateCheckoutIntent(buildTopupLookupKey(finalTopupRecord.provider_order_id), {
                status: finalTopupRecord.status === 'credited' ? 'credited' : 'captured',
                updated_at: sanitizeString(finalTopupRecord.updated_at) || new Date().toISOString(),
                last_event_type: sanitizeString(finalTopupRecord.last_event_type),
                provider_capture_id: sanitizeString(finalTopupRecord.capture_id),
                capture_status: sanitizeString(finalTopupRecord.capture_status || (finalTopupRecord.status === 'credited' ? 'completed' : 'captured')),
                grant_pending: finalTopupRecord.grant_pending === true,
                grant_applied_at: sanitizeString(finalTopupRecord.grant_applied_at),
                reconciliation_state: finalTopupRecord.status === 'credited' ? 'granted' : 'captured'
            });
        }
    }

    return {
        resourceType: reconciliation.resourceType || 'other',
        reconciliationSummary: reconciliation.reconciliationSummary || null,
        subscriptionRecord: reconciliation.subscriptionRecord || null,
        topupOrderRecord: finalTopupRecord,
        webhookEvent
    };
};

module.exports = {
    processVerifiedPayPalWebhook
};
