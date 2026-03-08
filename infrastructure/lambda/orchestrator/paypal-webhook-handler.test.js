jest.mock('./paypal-client', () => ({
    verifyWebhookSignature: jest.fn()
}));

jest.mock('./billing-store', () => ({
    createBillingStore: jest.fn()
}));

jest.mock('./paypal-webhook-processing', () => ({
    processVerifiedPayPalWebhook: jest.fn()
}));

jest.mock('../shared/billing-account-state', () => ({
    createAccountBillingStateStore: jest.fn(() => ({}))
}));

const { verifyWebhookSignature } = require('./paypal-client');
const { createBillingStore } = require('./billing-store');
const { processVerifiedPayPalWebhook } = require('./paypal-webhook-processing');
const { paypalWebhookHandler } = require('./paypal-webhook-handler');

describe('paypal-webhook-handler', () => {
    const store = {
        putWebhookEvent: jest.fn(),
        getWebhookEvent: jest.fn(),
        markWebhookProcessed: jest.fn(),
        markWebhookFailed: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        createBillingStore.mockReturnValue(store);
        console.log = jest.fn();
        processVerifiedPayPalWebhook.mockResolvedValue({
            resourceType: 'subscription',
            reconciliationSummary: {
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            }
        });
        store.getWebhookEvent.mockResolvedValue(null);
    });

    test('processes a verified subscription webhook and persists normalized records', async () => {
        verifyWebhookSignature.mockResolvedValue({ verificationStatus: 'SUCCESS' });
        store.putWebhookEvent.mockResolvedValue({ duplicate: false });

        const response = await paypalWebhookHandler({
            requestContext: { requestId: 'req_webhook_123' },
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            body: JSON.stringify({
                id: 'WH-EVENT-123',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            })
        });

        expect(response.statusCode).toBe(200);
        expect(processVerifiedPayPalWebhook).toHaveBeenCalledTimes(1);
        expect(store.markWebhookProcessed).toHaveBeenCalledTimes(1);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            processed: true,
            resource_type: 'subscription'
        });
    });

    test('returns success for duplicate webhook deliveries without reprocessing', async () => {
        verifyWebhookSignature.mockResolvedValue({ verificationStatus: 'SUCCESS' });
        store.putWebhookEvent.mockResolvedValue({ duplicate: true });
        store.getWebhookEvent.mockResolvedValue({
            event_id: 'WH-EVENT-123',
            provider_event_id: 'WH-EVENT-123',
            event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
            verification_status: 'verified',
            processed: true
        });

        const response = await paypalWebhookHandler({
            requestContext: { requestId: 'req_webhook_123' },
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            body: JSON.stringify({
                id: 'WH-EVENT-123',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            })
        });

        expect(response.statusCode).toBe(200);
        expect(processVerifiedPayPalWebhook).not.toHaveBeenCalled();
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            duplicate: true,
            processed: true
        });
    });

    test('reprocesses a duplicate verified webhook when stored processed marker is stale', async () => {
        verifyWebhookSignature.mockResolvedValue({ verificationStatus: 'SUCCESS' });
        store.putWebhookEvent.mockResolvedValue({ duplicate: true });
        store.getWebhookEvent.mockResolvedValue({
            event_id: 'WH-EVENT-125',
            provider_event_id: 'WH-EVENT-125',
            event_type: 'BILLING.SUBSCRIPTION.CREATED',
            verification_status: 'verified',
            processed: false,
            raw_event: {
                id: 'WH-EVENT-125',
                event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });

        const response = await paypalWebhookHandler({
            requestContext: { requestId: 'req_webhook_125' },
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            body: JSON.stringify({
                id: 'WH-EVENT-125',
                event_type: 'BILLING.SUBSCRIPTION.CREATED'
            })
        });

        expect(response.statusCode).toBe(200);
        expect(processVerifiedPayPalWebhook).toHaveBeenCalledTimes(1);
        expect(store.markWebhookProcessed).toHaveBeenCalledTimes(1);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            duplicate: true,
            processed: true,
            resource_type: 'subscription'
        });
    });

    test('rejects invalid webhook signatures', async () => {
        verifyWebhookSignature.mockResolvedValue({ verificationStatus: 'FAILURE' });
        store.putWebhookEvent.mockResolvedValue({ duplicate: false });

        const response = await paypalWebhookHandler({
            requestContext: { requestId: 'req_webhook_123' },
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            body: JSON.stringify({
                id: 'WH-EVENT-123',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            })
        });

        expect(response.statusCode).toBe(400);
        expect(processVerifiedPayPalWebhook).not.toHaveBeenCalled();
        expect(store.markWebhookFailed).toHaveBeenCalledTimes(1);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'paypal_webhook_invalid'
        });
    });

    test('marks stored webhook failed when verified processing throws', async () => {
        verifyWebhookSignature.mockResolvedValue({ verificationStatus: 'SUCCESS' });
        store.putWebhookEvent.mockResolvedValue({ duplicate: false });
        processVerifiedPayPalWebhook.mockRejectedValue(new Error('reconciliation exploded'));

        const response = await paypalWebhookHandler({
            requestContext: { requestId: 'req_webhook_123' },
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            body: JSON.stringify({
                id: 'WH-EVENT-124',
                event_type: 'PAYMENT.CAPTURE.COMPLETED'
            })
        });

        expect(response.statusCode).toBe(500);
        expect(store.markWebhookFailed).toHaveBeenCalledTimes(1);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'paypal_webhook_failed'
        });
    });

    test('does not downgrade a reconciled webhook to failed when processed-state sync write fails', async () => {
        verifyWebhookSignature.mockResolvedValue({ verificationStatus: 'SUCCESS' });
        store.putWebhookEvent.mockResolvedValue({ duplicate: false });
        store.markWebhookProcessed.mockRejectedValue(new Error('ddb marker write failed'));

        const response = await paypalWebhookHandler({
            requestContext: { requestId: 'req_webhook_126' },
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            body: JSON.stringify({
                id: 'WH-EVENT-126',
                event_type: 'PAYMENT.CAPTURE.COMPLETED'
            })
        });

        expect(response.statusCode).toBe(200);
        expect(store.markWebhookFailed).not.toHaveBeenCalled();
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            processed: true,
            marker_sync_failed: true
        });
    });
});
