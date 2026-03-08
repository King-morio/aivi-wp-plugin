jest.mock('./paypal-reconciliation', () => ({
    reconcilePayPalWebhookEvent: jest.fn(),
    buildTopupLookupKey: (providerOrderId) => `topup#${providerOrderId}`
}));

jest.mock('./credit-ledger', () => ({
    createAdjustmentEvent: jest.fn((event) => event),
    persistLedgerEvent: jest.fn().mockResolvedValue({
        updated_at: '2026-03-08T12:30:00.000Z'
    })
}));

const { reconcilePayPalWebhookEvent } = require('./paypal-reconciliation');
const { processVerifiedPayPalWebhook } = require('./paypal-webhook-processing');
const { buildDefaultAccountBillingState } = require('./billing-account-state');

describe('paypal-webhook-processing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('syncs captured top-up completion back into the checkout intent after credit grant', async () => {
        reconcilePayPalWebhookEvent.mockResolvedValue({
            resourceType: 'order',
            reconciliationSummary: {
                provider_order_id: 'ORDER123'
            },
            topupOrderRecord: {
                order_id: 'req_topup_123',
                account_id: 'acct_123',
                provider: 'paypal',
                provider_order_id: 'ORDER123',
                pack_code: 'topup_25k',
                credits: 25000,
                status: 'captured',
                created_at: '2026-03-08T12:00:00.000Z',
                updated_at: '2026-03-08T12:20:00.000Z',
                last_event_type: 'PAYMENT.CAPTURE.COMPLETED',
                capture_id: 'CAPTURE123',
                capture_status: 'completed',
                grant_pending: true
            }
        });

        const store = {
            upsertTopupOrderRecord: jest.fn().mockResolvedValue(undefined),
            updateCheckoutIntent: jest.fn().mockResolvedValue(undefined)
        };
        const accountStateStore = {
            getAccountState: jest.fn().mockResolvedValue(buildDefaultAccountBillingState({
                accountId: 'acct_123'
            })),
            putAccountState: jest.fn().mockResolvedValue(undefined)
        };

        const result = await processVerifiedPayPalWebhook({
            webhookEvent: {
                id: 'WH_123',
                event_type: 'PAYMENT.CAPTURE.COMPLETED'
            },
            store,
            accountStateStore,
            config: {}
        });

        expect(result.topupOrderRecord).toMatchObject({
            provider_order_id: 'ORDER123',
            status: 'credited',
            grant_pending: false
        });
        expect(store.upsertTopupOrderRecord).toHaveBeenCalledWith(expect.objectContaining({
            provider_order_id: 'ORDER123',
            status: 'credited',
            grant_pending: false
        }));
        expect(store.updateCheckoutIntent).toHaveBeenCalledWith('topup#ORDER123', expect.objectContaining({
            status: 'credited',
            provider_capture_id: 'CAPTURE123',
            grant_pending: false,
            reconciliation_state: 'granted'
        }));
        expect(accountStateStore.putAccountState).toHaveBeenCalledTimes(1);
    });
});
