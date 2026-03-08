jest.mock('./paypal-client', () => ({
    createHttpError: (statusCode, code, message) => {
        const error = new Error(message);
        error.statusCode = statusCode;
        error.code = code;
        return error;
    },
    captureTopupOrder: jest.fn(),
    createSubscriptionCheckoutSession: jest.fn(),
    createTopupCheckoutSession: jest.fn(),
    getManageBillingRedirect: jest.fn()
}));

const mockPutCheckoutIntent = jest.fn();
const mockGetCheckoutIntent = jest.fn();
const mockUpdateCheckoutIntent = jest.fn();
const mockUpsertTopupOrderRecord = jest.fn();
jest.mock('./billing-store', () => ({
    createBillingStore: jest.fn(() => ({
        putCheckoutIntent: mockPutCheckoutIntent,
        getCheckoutIntent: mockGetCheckoutIntent,
        updateCheckoutIntent: mockUpdateCheckoutIntent,
        upsertTopupOrderRecord: mockUpsertTopupOrderRecord
    }))
}));

const { billingCheckoutHandler } = require('./billing-checkout-handler');
const {
    captureTopupOrder,
    createSubscriptionCheckoutSession,
    createTopupCheckoutSession,
    getManageBillingRedirect
} = require('./paypal-client');

describe('billing-checkout-handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        mockPutCheckoutIntent.mockResolvedValue(undefined);
        mockGetCheckoutIntent.mockResolvedValue(null);
        mockUpdateCheckoutIntent.mockResolvedValue(undefined);
        mockUpsertTopupOrderRecord.mockResolvedValue(undefined);
        process.env.PAYPAL_RETURN_URL = 'https://example.com/return';
    });

    test('returns a safe hosted subscription checkout payload', async () => {
        createSubscriptionCheckoutSession.mockResolvedValue({
            requestId: 'req_sub_123',
            intentType: 'subscription',
            provider: 'paypal',
            planCode: 'starter',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUB123',
            returnUrl: 'https://example.com/return',
            cancelUrl: 'https://example.com/cancel',
            providerSubscriptionId: 'I-SUB123'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_sub_123' },
            body: JSON.stringify({
                plan_code: 'starter',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toEqual({
            ok: true,
            provider: 'paypal',
            request_id: 'req_sub_123',
            checkout: {
                intent_type: 'subscription',
                approval_url: 'https://www.paypal.com/checkoutnow?token=SUB123',
                return_url: 'https://example.com/return',
                cancel_url: 'https://example.com/cancel',
                plan_code: 'starter'
            }
        });
        expect(JSON.stringify(body)).not.toContain('providerSubscriptionId');
        expect(mockPutCheckoutIntent).toHaveBeenCalledTimes(1);
    });

    test('returns a safe hosted top-up checkout payload', async () => {
        createTopupCheckoutSession.mockResolvedValue({
            requestId: 'req_topup_123',
            intentType: 'topup',
            provider: 'paypal',
            packCode: 'topup_100k',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=ORDER123',
            returnUrl: 'https://example.com/return',
            cancelUrl: 'https://example.com/cancel',
            credits: 100000,
            priceUsd: 25,
            providerOrderId: 'ORDER123'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/topup',
            requestContext: { requestId: 'req_topup_123' },
            body: JSON.stringify({
                topup_pack_code: 'topup_100k',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.checkout).toMatchObject({
            intent_type: 'topup',
            topup_pack_code: 'topup_100k',
            credits: 100000,
            price_usd: 25
        });
        expect(JSON.stringify(body)).not.toContain('providerOrderId');
        expect(mockPutCheckoutIntent).toHaveBeenCalledTimes(1);
        expect(mockPutCheckoutIntent).toHaveBeenCalledWith(expect.objectContaining({
            lookup_key: 'topup#ORDER123',
            credits: 100000,
            price_usd: 25,
            topup_pack_code: 'topup_100k'
        }));
    });

    test('blocks billing actions without a connected account binding', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_missing_account' },
            body: JSON.stringify({
                plan_code: 'starter',
                account: { account_id: '' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'account_not_connected'
        });
    });

    test('rejects invalid subscription plan codes', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_invalid_plan' },
            body: JSON.stringify({
                plan_code: 'enterprise',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'invalid_plan_code'
        });
    });

    test('rejects invalid top-up pack codes', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/topup',
            requestContext: { requestId: 'req_invalid_topup' },
            body: JSON.stringify({
                topup_pack_code: 'topup_999k',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'invalid_topup_pack_code'
        });
    });

    test('returns unsupported manage billing response until provider management is wired', async () => {
        const error = new Error('Hosted billing management will be enabled after subscription reconciliation is in place.');
        error.statusCode = 501;
        error.code = 'billing_management_unsupported';
        getManageBillingRedirect.mockRejectedValue(error);

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/manage',
            requestContext: { requestId: 'req_manage_123' },
            body: JSON.stringify({
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(501);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'billing_management_unsupported'
        });
    });

    test('captures approved top-up orders from the PayPal return route and redirects back to billing status', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'topup#ORDER123',
            intent_id: 'req_topup_123',
            account_id: 'acct_123',
            site_id: 'site_123',
            topup_pack_code: 'topup_100k',
            credits: 100000,
            created_at: '2026-03-08T10:00:00.000Z'
        });
        captureTopupOrder.mockResolvedValue({
            orderId: 'ORDER123',
            captureId: 'CAPTURE123',
            status: 'COMPLETED'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_return_123' },
            queryStringParameters: {
                token: 'ORDER123',
                PayerID: 'PAYER123'
            }
        });

        expect(response.statusCode).toBe(302);
        expect(captureTopupOrder).toHaveBeenCalledWith(expect.objectContaining({
            orderId: 'ORDER123',
            requestId: 'req_return_123'
        }));
        expect(mockUpdateCheckoutIntent).toHaveBeenCalledWith('topup#ORDER123', expect.objectContaining({
            status: 'captured_pending_webhook',
            provider_capture_id: 'CAPTURE123',
            reconciliation_state: 'pending_webhook',
            grant_pending: true
        }));
        expect(mockUpsertTopupOrderRecord).toHaveBeenCalledWith(expect.objectContaining({
            order_id: 'req_topup_123',
            provider_order_id: 'ORDER123',
            pack_code: 'topup_100k',
            credits: 100000,
            status: 'captured_pending_webhook',
            capture_id: 'CAPTURE123',
            grant_pending: true
        }));
        expect(response.headers.Location).toContain('aivi_billing_return=topup_capture_pending_credit');
        expect(response.headers.Location).toContain('provider_order_id=ORDER123');
    });

    test('reuses captured top-up returns without attempting a second capture', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'topup#ORDER123',
            status: 'captured_pending_webhook'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_return_repeat' },
            queryStringParameters: {
                token: 'ORDER123'
            }
        });

        expect(captureTopupOrder).not.toHaveBeenCalled();
        expect(mockUpdateCheckoutIntent).not.toHaveBeenCalled();
        expect(response.statusCode).toBe(302);
        expect(response.headers.Location).toContain('aivi_billing_return=topup_capture_pending_credit');
    });

    test('redirects subscription returns without attempting top-up capture', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_sub_return' },
            queryStringParameters: {
                ba_token: 'BA-123'
            }
        });

        expect(captureTopupOrder).not.toHaveBeenCalled();
        expect(response.statusCode).toBe(302);
        expect(response.headers.Location).toContain('aivi_billing_return=subscription_pending');
        expect(response.headers.Location).toContain('subscription_ref=BA-123');
    });
});
