const { createAdjustmentEvent, persistLedgerEvent } = require('./credit-ledger');
const { reconcilePayPalWebhookEvent, buildTopupLookupKey } = require('./paypal-reconciliation');
const {
    buildDefaultAccountBillingState,
    applySubscriptionRecordToState,
    applyTopupGrantToState,
    computeTotalRemaining
} = require('./billing-account-state');

const sanitizeString = (value) => String(value || '').trim();

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
            const applied = applySubscriptionRecordToState(currentState, reconciliation.subscriptionRecord);
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

            await accountStateStore.putAccountState(nextState);
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
