const {
    captureTopupOrder,
    createSubscriptionCheckoutSession,
    createSubscriptionRevisionSession,
    createTopupCheckoutSession,
    getSubscriptionDetails,
    getManageBillingRedirect,
    verifyWebhookSignature
} = require('./paypal-client');

describe('paypal-client', () => {
    const config = {
        apiBase: 'https://api-m.sandbox.paypal.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        brandName: 'AiVI',
        returnUrl: 'https://example.com/paypal/return',
        cancelUrl: 'https://example.com/paypal/cancel',
        planIds: {
            starter: 'P-STARTER',
            growth: 'P-GROWTH',
            growth_intro: 'P-GROWTH-INTRO',
            pro: 'P-PRO'
        }
    };

    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    test('creates a hosted subscription checkout session', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'I-SUB123',
                    links: [
                        { rel: 'self', href: 'https://api-m.sandbox.paypal.com/subscriptions/I-SUB123' },
                        { rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=SUB123' }
                    ]
                })
            });

        const session = await createSubscriptionCheckoutSession({
            config,
            planCode: 'growth',
            accountId: 'acct_123',
            siteId: 'site_123',
            requestId: 'req_sub_123'
        });

        expect(session).toMatchObject({
            requestId: 'req_sub_123',
            intentType: 'subscription',
            provider: 'paypal',
            planCode: 'growth',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUB123'
        });

        const subscriptionCall = global.fetch.mock.calls[1];
        expect(subscriptionCall[0]).toContain('/v1/billing/subscriptions');
        const body = JSON.parse(subscriptionCall[1].body);
        expect(body).toMatchObject({
            plan_id: 'P-GROWTH',
            application_context: {
                brand_name: 'AiVI',
                user_action: 'SUBSCRIBE_NOW',
                return_url: 'https://example.com/paypal/return',
                cancel_url: 'https://example.com/paypal/cancel'
            }
        });
    });

    test('creates a hosted introductory Growth checkout session against the dedicated intro plan', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'I-SUB-INTRO-123',
                    links: [
                        { rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=SUBINTRO123' }
                    ]
                })
            });

        const session = await createSubscriptionCheckoutSession({
            config,
            planCode: 'growth',
            providerPlanId: 'P-GROWTH-INTRO',
            intentVariant: 'intro_offer',
            introOfferApplied: true,
            accountId: 'acct_123',
            siteId: 'site_123',
            requestId: 'req_sub_intro_123'
        });

        expect(session).toMatchObject({
            requestId: 'req_sub_intro_123',
            intentType: 'subscription',
            intentVariant: 'intro_offer',
            provider: 'paypal',
            planCode: 'growth',
            providerPlanId: 'P-GROWTH-INTRO',
            priceUsd: 11,
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUBINTRO123'
        });

        const subscriptionCall = global.fetch.mock.calls[1];
        expect(subscriptionCall[0]).toContain('/v1/billing/subscriptions');
        const body = JSON.parse(subscriptionCall[1].body);
        expect(body).toMatchObject({
            plan_id: 'P-GROWTH-INTRO',
            application_context: {
                brand_name: 'AiVI',
                user_action: 'SUBSCRIBE_NOW',
                return_url: 'https://example.com/paypal/return',
                cancel_url: 'https://example.com/paypal/cancel'
            }
        });
    });

    test('creates a hosted top-up checkout session', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'ORDER123',
                    links: [
                        { rel: 'payer-action', href: 'https://www.paypal.com/checkoutnow?token=ORDER123' }
                    ]
                })
            });

        const session = await createTopupCheckoutSession({
            config,
            packCode: 'topup_25k',
            accountId: 'acct_123',
            siteId: 'site_123',
            requestId: 'req_topup_123'
        });

        expect(session).toMatchObject({
            requestId: 'req_topup_123',
            intentType: 'topup',
            provider: 'paypal',
            packCode: 'topup_25k',
            credits: 25000,
            priceUsd: 7,
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=ORDER123'
        });

        const orderCall = global.fetch.mock.calls[1];
        expect(orderCall[0]).toContain('/v2/checkout/orders');
        const body = JSON.parse(orderCall[1].body);
        expect(body.purchase_units[0]).toMatchObject({
            reference_id: 'topup_25k',
            amount: {
                currency_code: 'USD',
                value: '7.00'
            }
        });
    });

    test('creates a hosted subscription revision session for active upgrades', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'I-STARTER1',
                    links: [
                        { rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=SUBUP123' }
                    ]
                })
            });

        const session = await createSubscriptionRevisionSession({
            config,
            providerSubscriptionId: 'I-STARTER1',
            planCode: 'growth',
            accountId: 'acct_123',
            siteId: 'site_123',
            requestId: 'req_sub_upgrade_123'
        });

        expect(session).toMatchObject({
            requestId: 'req_sub_upgrade_123',
            intentType: 'subscription',
            intentVariant: 'revise',
            provider: 'paypal',
            planCode: 'growth',
            providerSubscriptionId: 'I-STARTER1',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUBUP123'
        });

        const reviseCall = global.fetch.mock.calls[1];
        expect(reviseCall[0]).toContain('/v1/billing/subscriptions/I-STARTER1/revise');
        const body = JSON.parse(reviseCall[1].body);
        expect(body).toMatchObject({
            plan_id: 'P-GROWTH',
            application_context: {
                brand_name: 'AiVI',
                user_action: 'SUBSCRIBE_NOW',
                return_url: 'https://example.com/paypal/return',
                cancel_url: 'https://example.com/paypal/cancel'
            }
        });
    });

    test('reads the latest PayPal subscription status', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'I-SUB123',
                    status: 'CANCELLED',
                    status_update_time: '2026-03-24T16:20:00Z'
                })
            });

        const details = await getSubscriptionDetails({
            config,
            providerSubscriptionId: 'I-SUB123',
            requestId: 'req_sub_status_123'
        });

        expect(details).toMatchObject({
            providerSubscriptionId: 'I-SUB123',
            status: 'CANCELLED',
            statusUpdateTime: '2026-03-24T16:20:00Z'
        });

        const detailsCall = global.fetch.mock.calls[1];
        expect(detailsCall[0]).toContain('/v1/billing/subscriptions/I-SUB123');
        expect(detailsCall[1].method).toBe('GET');
    });

    test('maps missing PayPal subscriptions to a dedicated lookup error', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({
                    name: 'RESOURCE_NOT_FOUND'
                })
            });

        await expect(getSubscriptionDetails({
            config,
            providerSubscriptionId: 'I-MISSING',
            requestId: 'req_sub_missing'
        })).rejects.toMatchObject({
            code: 'paypal_subscription_not_found',
            details: expect.objectContaining({
                status: 404,
                provider_state: 'not_found'
            })
        });
    });

    test('maps invalid PayPal subscription lookups to a dedicated lookup error', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 422,
                json: async () => ({
                    name: 'UNPROCESSABLE_ENTITY'
                })
            });

        await expect(getSubscriptionDetails({
            config,
            providerSubscriptionId: 'I-INVALID',
            requestId: 'req_sub_invalid'
        })).rejects.toMatchObject({
            code: 'paypal_subscription_invalid',
            details: expect.objectContaining({
                status: 422,
                provider_state: 'invalid'
            })
        });
    });

    test('captures an approved top-up order', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: 'COMPLETED',
                    purchase_units: [
                        {
                            payments: {
                                captures: [
                                    { id: 'CAPTURE123' }
                                ]
                            }
                        }
                    ]
                })
            });

        const capture = await captureTopupOrder({
            config,
            orderId: 'ORDER123',
            requestId: 'req_capture_123'
        });

        expect(capture).toMatchObject({
            orderId: 'ORDER123',
            captureId: 'CAPTURE123',
            status: 'COMPLETED'
        });

        const captureCall = global.fetch.mock.calls[1];
        expect(captureCall[0]).toContain('/v2/checkout/orders/ORDER123/capture');
        expect(captureCall[1].method).toBe('POST');
    });

    test('returns unsupported for manage billing until reconciliation exists', async () => {
        await expect(getManageBillingRedirect()).rejects.toMatchObject({
            statusCode: 501,
            code: 'billing_management_unsupported'
        });
    });

    test('verifies PayPal webhook signatures through the provider endpoint', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'access-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ verification_status: 'SUCCESS' })
            });

        const result = await verifyWebhookSignature({
            config: {
                ...config,
                webhookId: 'WH-123'
            },
            requestId: 'req_webhook_123',
            headers: {
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-03-06T10:00:00Z',
                'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            },
            webhookEvent: {
                id: 'WH-EVENT-123',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            }
        });

        expect(result).toMatchObject({
            verificationStatus: 'SUCCESS'
        });

        const verificationCall = global.fetch.mock.calls[1];
        expect(verificationCall[0]).toContain('/v1/notifications/verify-webhook-signature');
    });
});
