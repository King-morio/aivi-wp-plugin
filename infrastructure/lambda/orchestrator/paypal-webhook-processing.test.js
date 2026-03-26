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
const { createAdjustmentEvent, persistLedgerEvent } = require('./credit-ledger');

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

    test('persists an upgrade-delta adjustment when the subscription changes within the same billing cycle', async () => {
        reconcilePayPalWebhookEvent.mockResolvedValue({
            resourceType: 'subscription',
            checkoutIntent: {
                intent_variant: 'revise',
                source_plan_code: 'starter',
                plan_transition: 'upgrade'
            },
            reconciliationSummary: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH1'
            },
            subscriptionRecord: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH1',
                plan_code: 'growth',
                intent_variant: 'revise',
                source_plan_code: 'starter',
                plan_transition: 'upgrade',
                status: 'active',
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            }
        });

        const store = {
            upsertSubscriptionRecord: jest.fn().mockResolvedValue(undefined),
            updateCheckoutIntent: jest.fn().mockResolvedValue(undefined)
        };
        const accountStateStore = {
            getAccountState: jest.fn().mockResolvedValue({
                ...buildDefaultAccountBillingState({ accountId: 'acct_123' }),
                plan_code: 'starter',
                subscription_status: 'active',
                credits: {
                    included_remaining: 54000,
                    topup_remaining: 0,
                    reserved_credits: 0,
                    total_remaining: 54000,
                    monthly_included: 60000,
                    monthly_used: 6000,
                    last_run_debit: 0
                },
                entitlements: {
                    analysis_allowed: true,
                    web_lookups_allowed: true,
                    max_sites: 1,
                    site_limit_reached: false
                },
                subscription: {
                    provider_subscription_id: 'I-STARTER1',
                    current_period_start: '2026-03-01T00:00:00.000Z',
                    current_period_end: '2026-04-01T00:00:00.000Z',
                    credit_cycle_key: '2026-03-01T00:00:00.000Z|2026-04-01T00:00:00.000Z'
                }
            }),
            putAccountState: jest.fn().mockResolvedValue(undefined)
        };

        const result = await processVerifiedPayPalWebhook({
            webhookEvent: {
                id: 'WH_UPGRADE',
                event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            },
            store,
            accountStateStore,
            config: {}
        });

        expect(result.subscriptionRecord).toMatchObject({
            plan_code: 'growth',
            status: 'active'
        });
        expect(createAdjustmentEvent).toHaveBeenCalledWith(expect.objectContaining({
            reason_code: 'plan_upgrade_delta',
            amounts: expect.objectContaining({
                granted_credits: 40000
            })
        }));
        expect(persistLedgerEvent).toHaveBeenCalledTimes(1);
        expect(accountStateStore.putAccountState).toHaveBeenCalledTimes(1);
        expect(store.updateCheckoutIntent).toHaveBeenCalledWith('subscription#I-GROWTH1', expect.objectContaining({
            status: 'plan_change_completed',
            reconciliation_state: 'plan_change_applied',
            source_plan_code: 'starter',
            plan_transition: 'upgrade'
        }));
    });

    test('keeps current entitlements intact while a revised plan change is still pending provider activation', async () => {
        reconcilePayPalWebhookEvent.mockResolvedValue({
            resourceType: 'subscription',
            checkoutIntent: {
                intent_variant: 'revise',
                source_plan_code: 'starter',
                plan_transition: 'upgrade'
            },
            reconciliationSummary: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-STARTER1'
            },
            subscriptionRecord: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-STARTER1',
                plan_code: 'growth',
                intent_variant: 'revise',
                source_plan_code: 'starter',
                plan_transition: 'upgrade',
                status: 'created',
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });

        const store = {
            upsertSubscriptionRecord: jest.fn().mockResolvedValue(undefined),
            updateCheckoutIntent: jest.fn().mockResolvedValue(undefined)
        };
        const currentState = {
            ...buildDefaultAccountBillingState({ accountId: 'acct_123' }),
            plan_code: 'starter',
            plan_name: 'Starter',
            subscription_status: 'active',
            credits: {
                included_remaining: 54000,
                topup_remaining: 25000,
                reserved_credits: 0,
                total_remaining: 79000,
                monthly_included: 60000,
                monthly_used: 6000,
                last_run_debit: 0
            },
            entitlements: {
                analysis_allowed: true,
                web_lookups_allowed: true,
                max_sites: 1,
                site_limit_reached: false
            },
            subscription: {
                provider_subscription_id: 'I-STARTER1',
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z',
                credit_cycle_key: '2026-03-01T00:00:00.000Z|2026-04-01T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
            }
        };
        const accountStateStore = {
            getAccountState: jest.fn().mockResolvedValue(currentState),
            putAccountState: jest.fn().mockResolvedValue(undefined)
        };

        await processVerifiedPayPalWebhook({
            webhookEvent: {
                id: 'WH_PENDING_UPGRADE',
                event_type: 'BILLING.SUBSCRIPTION.CREATED'
            },
            store,
            accountStateStore,
            config: {}
        });

        expect(persistLedgerEvent).not.toHaveBeenCalled();
        expect(accountStateStore.putAccountState).toHaveBeenCalledWith(expect.objectContaining({
            plan_code: 'starter',
            subscription_status: 'active',
            entitlements: expect.objectContaining({
                analysis_allowed: true,
                max_sites: 1
            }),
            subscription: expect.objectContaining({
                provider_subscription_id: 'I-STARTER1',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            })
        }));
        expect(store.updateCheckoutIntent).toHaveBeenCalledWith('subscription#I-STARTER1', expect.objectContaining({
            status: 'plan_change_pending',
            reconciliation_state: 'plan_change_pending'
        }));
    });

    test('keeps the free trial state intact while an initial paid subscription is still pending provider activation', async () => {
        reconcilePayPalWebhookEvent.mockResolvedValue({
            resourceType: 'subscription',
            checkoutIntent: {
                intent_variant: 'intro_offer'
            },
            reconciliationSummary: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH-INTRO'
            },
            subscriptionRecord: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH-INTRO',
                plan_code: 'growth',
                intent_variant: 'intro_offer',
                status: 'created',
                current_period_start: '2026-03-22T00:00:00.000Z',
                current_period_end: '2026-04-22T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });

        const store = {
            upsertSubscriptionRecord: jest.fn().mockResolvedValue(undefined),
            updateCheckoutIntent: jest.fn().mockResolvedValue(undefined)
        };
        const currentState = {
            ...buildDefaultAccountBillingState({ accountId: 'acct_123' }),
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'trial',
            trial_status: 'active',
            entitlements: {
                analysis_allowed: true,
                web_lookups_allowed: true,
                max_sites: 1,
                site_limit_reached: false
            },
            credits: {
                included_remaining: 4200,
                topup_remaining: 0,
                reserved_credits: 0,
                total_remaining: 4200,
                monthly_included: 5000,
                monthly_used: 800,
                last_run_debit: 0
            }
        };
        const accountStateStore = {
            getAccountState: jest.fn().mockResolvedValue(currentState),
            putAccountState: jest.fn().mockResolvedValue(undefined)
        };

        await processVerifiedPayPalWebhook({
            webhookEvent: {
                id: 'WH_PENDING_INITIAL',
                event_type: 'BILLING.SUBSCRIPTION.CREATED'
            },
            store,
            accountStateStore,
            config: {}
        });

        expect(persistLedgerEvent).not.toHaveBeenCalled();
        expect(accountStateStore.putAccountState).toHaveBeenCalledWith(expect.objectContaining({
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: expect.objectContaining({
                analysis_allowed: true,
                max_sites: 1
            }),
            credits: expect.objectContaining({
                included_remaining: 4200,
                monthly_included: 5000
            }),
            subscription: expect.objectContaining({
                provider_subscription_id: 'I-GROWTH-INTRO',
                current_period_start: '2026-03-22T00:00:00.000Z',
                current_period_end: '2026-04-22T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            })
        }));
        expect(store.updateCheckoutIntent).toHaveBeenCalledWith('subscription#I-GROWTH-INTRO', expect.objectContaining({
            status: 'created',
            reconciliation_state: 'pending'
        }));
    });

    test('returns an initial failed subscription attempt to a retry-ready free trial state', async () => {
        reconcilePayPalWebhookEvent.mockResolvedValue({
            resourceType: 'subscription',
            checkoutIntent: {
                intent_variant: 'intro_offer'
            },
            reconciliationSummary: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH-INTRO'
            },
            subscriptionRecord: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH-INTRO',
                plan_code: 'growth',
                intent_variant: 'intro_offer',
                status: 'error',
                current_period_start: '2026-03-22T00:00:00.000Z',
                current_period_end: '2026-04-22T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
                last_payment_status: 'failed'
            }
        });

        const store = {
            upsertSubscriptionRecord: jest.fn().mockResolvedValue(undefined),
            updateCheckoutIntent: jest.fn().mockResolvedValue(undefined)
        };
        const currentState = {
            ...buildDefaultAccountBillingState({ accountId: 'acct_123' }),
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                analysis_allowed: true,
                web_lookups_allowed: true,
                max_sites: 1,
                site_limit_reached: false
            },
            credits: {
                included_remaining: 4200,
                topup_remaining: 0,
                reserved_credits: 0,
                total_remaining: 4200,
                monthly_included: 5000,
                monthly_used: 800,
                last_run_debit: 0
            },
            subscription: {
                provider_subscription_id: 'I-GROWTH-INTRO',
                current_period_start: '2026-03-22T00:00:00.000Z',
                current_period_end: '2026-04-22T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED',
                credit_cycle_key: '2026-03-22T00:00:00.000Z|2026-04-22T00:00:00.000Z'
            }
        };
        const accountStateStore = {
            getAccountState: jest.fn().mockResolvedValue(currentState),
            putAccountState: jest.fn().mockResolvedValue(undefined)
        };

        await processVerifiedPayPalWebhook({
            webhookEvent: {
                id: 'WH_FAILED_INITIAL',
                event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
            },
            store,
            accountStateStore,
            config: {}
        });

        expect(persistLedgerEvent).not.toHaveBeenCalled();
        expect(accountStateStore.putAccountState).toHaveBeenCalledWith(expect.objectContaining({
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'trial',
            trial_status: 'active',
            entitlements: expect.objectContaining({
                analysis_allowed: true,
                max_sites: 1
            }),
            subscription: expect.objectContaining({
                provider_subscription_id: '',
                current_period_start: null,
                current_period_end: null,
                credit_cycle_key: '',
                last_event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
            })
        }));
        expect(store.updateCheckoutIntent).toHaveBeenCalledWith('subscription#I-GROWTH-INTRO', expect.objectContaining({
            status: 'error',
            reconciliation_state: 'pending'
        }));
    });

    test('returns an initial cancelled subscription attempt to a retry-ready free trial state', async () => {
        reconcilePayPalWebhookEvent.mockResolvedValue({
            resourceType: 'subscription',
            checkoutIntent: {
                intent_variant: 'intro_offer'
            },
            reconciliationSummary: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH-INTRO'
            },
            subscriptionRecord: {
                account_id: 'acct_123',
                provider_subscription_id: 'I-GROWTH-INTRO',
                plan_code: 'growth',
                intent_variant: 'intro_offer',
                status: 'cancelled',
                current_period_start: '2026-03-22T00:00:00.000Z',
                current_period_end: '2026-04-22T00:00:00.000Z',
                cancel_at_period_end: true,
                last_event_type: 'BILLING.SUBSCRIPTION.CANCELLED'
            }
        });

        const store = {
            upsertSubscriptionRecord: jest.fn().mockResolvedValue(undefined),
            updateCheckoutIntent: jest.fn().mockResolvedValue(undefined)
        };
        const currentState = {
            ...buildDefaultAccountBillingState({ accountId: 'acct_123' }),
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                analysis_allowed: true,
                web_lookups_allowed: true,
                max_sites: 1,
                site_limit_reached: false
            },
            credits: {
                included_remaining: 4200,
                topup_remaining: 0,
                reserved_credits: 0,
                total_remaining: 4200,
                monthly_included: 5000,
                monthly_used: 800,
                last_run_debit: 0
            },
            subscription: {
                provider_subscription_id: 'I-GROWTH-INTRO',
                current_period_start: '2026-03-22T00:00:00.000Z',
                current_period_end: '2026-04-22T00:00:00.000Z',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED',
                credit_cycle_key: '2026-03-22T00:00:00.000Z|2026-04-22T00:00:00.000Z'
            }
        };
        const accountStateStore = {
            getAccountState: jest.fn().mockResolvedValue(currentState),
            putAccountState: jest.fn().mockResolvedValue(undefined)
        };

        await processVerifiedPayPalWebhook({
            webhookEvent: {
                id: 'WH_CANCELLED_INITIAL',
                event_type: 'BILLING.SUBSCRIPTION.CANCELLED'
            },
            store,
            accountStateStore,
            config: {}
        });

        expect(accountStateStore.putAccountState).toHaveBeenCalledWith(expect.objectContaining({
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active',
            subscription: expect.objectContaining({
                provider_subscription_id: '',
                current_period_start: null,
                current_period_end: null,
                credit_cycle_key: '',
                cancel_at_period_end: false,
                last_event_type: 'BILLING.SUBSCRIPTION.CANCELLED'
            })
        }));
        expect(store.updateCheckoutIntent).toHaveBeenCalledWith('subscription#I-GROWTH-INTRO', expect.objectContaining({
            status: 'cancelled',
            reconciliation_state: 'pending'
        }));
    });
});
