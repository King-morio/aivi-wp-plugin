const { reconcilePayPalWebhookEvent } = require('./paypal-reconciliation');

describe('paypal-reconciliation', () => {
    test('maps subscription activation into a canonical subscription record', async () => {
        const store = {
            getCheckoutIntent: jest.fn().mockResolvedValue({
                intent_id: 'req_sub_123',
                account_id: 'acct_123',
                plan_code: 'growth',
                created_at: '2026-03-06T10:00:00.000Z'
            })
        };

        const result = await reconcilePayPalWebhookEvent({
            webhookEvent: {
                id: 'WH-EVENT-1',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
                create_time: '2026-03-06T11:00:00Z',
                resource: {
                    id: 'I-SUB123',
                    plan_id: 'P-GROWTH',
                    status: 'ACTIVE',
                    billing_info: {
                        next_billing_time: '2026-04-06T11:00:00Z'
                    }
                }
            },
            store,
            config: {
                planIds: {
                    growth: 'P-GROWTH'
                }
            }
        });

        expect(result.subscriptionRecord).toMatchObject({
            subscription_id: 'req_sub_123',
            account_id: 'acct_123',
            provider_subscription_id: 'I-SUB123',
            plan_code: 'growth',
            status: 'active'
        });
    });

    test('maps captured top-up payments into a pending credit grant order record', async () => {
        const store = {
            getCheckoutIntent: jest.fn().mockResolvedValue({
                intent_id: 'req_topup_123',
                account_id: 'acct_123',
                topup_pack_code: 'topup_100k',
                credits: 100000,
                created_at: '2026-03-06T10:00:00.000Z'
            }),
            getTopupOrderRecord: jest.fn().mockResolvedValue({
                order_id: 'req_topup_123',
                provider_order_id: 'ORDER123',
                pack_code: 'topup_100k',
                credits: 100000,
                status: 'captured_pending_webhook',
                capture_id: 'CAPTURE_OLD',
                created_at: '2026-03-06T10:00:00.000Z'
            })
        };

        const result = await reconcilePayPalWebhookEvent({
            webhookEvent: {
                id: 'WH-EVENT-2',
                event_type: 'PAYMENT.CAPTURE.COMPLETED',
                create_time: '2026-03-06T11:00:00Z',
                resource: {
                    id: 'CAPTURE123',
                    supplementary_data: {
                        related_ids: {
                            order_id: 'ORDER123'
                        }
                    }
                }
            },
            store
        });

        expect(result.topupOrderRecord).toMatchObject({
            order_id: 'req_topup_123',
            account_id: 'acct_123',
            provider_order_id: 'ORDER123',
            pack_code: 'topup_100k',
            credits: 100000,
            status: 'captured',
            grant_pending: true,
            capture_id: 'CAPTURE123',
            capture_status: 'completed'
        });
    });

    test('maps Growth intro plan ids back to the canonical growth plan code when no checkout lookup exists', async () => {
        const store = {
            getCheckoutIntent: jest.fn().mockResolvedValue(null)
        };

        const result = await reconcilePayPalWebhookEvent({
            webhookEvent: {
                id: 'WH-EVENT-INTRO',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
                create_time: '2026-03-06T11:00:00Z',
                resource: {
                    id: 'I-SUB-INTRO-123',
                    plan_id: 'P-GROWTH-INTRO',
                    status: 'ACTIVE',
                    billing_info: {
                        next_billing_time: '2026-04-06T11:00:00Z'
                    }
                }
            },
            store,
            config: {
                planIds: {
                    growth: 'P-GROWTH',
                    growth_intro: 'P-GROWTH-INTRO'
                }
            }
        });

        expect(result.subscriptionRecord).toMatchObject({
            provider_subscription_id: 'I-SUB-INTRO-123',
            plan_code: 'growth',
            status: 'active'
        });
    });
});
