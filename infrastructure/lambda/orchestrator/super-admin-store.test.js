jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({ send: jest.fn() }))
    },
    GetCommand: jest.fn((input) => ({ input })),
    PutCommand: jest.fn((input) => ({ input })),
    ScanCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

const { createSuperAdminStore } = require('./super-admin-store');

describe('super-admin-store', () => {
    test('filters site binding conflicts to active bindings owned by other accounts', async () => {
        const send = jest.fn().mockResolvedValue({
            Items: [
                {
                    account_id: 'acct_target',
                    connected: true,
                    connection_status: 'connected',
                    site_binding_status: 'connected',
                    updated_at: '2026-03-16T09:00:00.000Z',
                    sites: [
                        {
                            site_id: 'site_123',
                            connected_domain: 'example.com',
                            binding_status: 'connected'
                        }
                    ]
                },
                {
                    account_id: 'acct_conflict',
                    account_label: 'Conflict Media',
                    connected: true,
                    connection_status: 'connected',
                    site_binding_status: 'connected',
                    updated_at: '2026-03-16T08:00:00.000Z',
                    sites: [
                        {
                            site_id: 'site_123',
                            connected_domain: 'example.com',
                            binding_status: 'connected'
                        }
                    ]
                },
                {
                    account_id: 'acct_stale',
                    account_label: 'Stale Media',
                    connected: false,
                    connection_status: 'disconnected',
                    site_binding_status: 'unbound',
                    updated_at: '2026-03-16T07:00:00.000Z',
                    sites: [
                        {
                            site_id: 'site_123',
                            connected_domain: 'example.com',
                            binding_status: 'unbound'
                        }
                    ]
                }
            ]
        });
        const store = createSuperAdminStore({
            ddbDoc: { send },
            env: {
                ACCOUNT_BILLING_STATE_TABLE: 'account-state-table'
            }
        });

        const conflicts = await store.findSiteBindingConflicts({
            accountId: 'acct_target',
            siteId: 'site_123',
            connectedDomain: 'example.com',
            limit: 10
        });

        expect(send).toHaveBeenCalled();
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
            account_id: 'acct_conflict',
            account_label: 'Conflict Media'
        });
    });

    test('matches active site conflicts by connected domain when site ids differ', async () => {
        const send = jest.fn().mockResolvedValue({
            Items: [
                {
                    account_id: 'acct_domain_conflict',
                    account_label: 'Domain Conflict Media',
                    connected: true,
                    connection_status: 'connected',
                    site_binding_status: 'connected',
                    updated_at: '2026-03-16T08:00:00.000Z',
                    sites: [
                        {
                            site_id: 'site_other',
                            connected_domain: 'example.com',
                            binding_status: 'connected'
                        }
                    ]
                }
            ]
        });
        const store = createSuperAdminStore({
            ddbDoc: { send },
            env: {
                ACCOUNT_BILLING_STATE_TABLE: 'account-state-table'
            }
        });

        const conflicts = await store.findSiteBindingConflicts({
            accountId: 'acct_target',
            siteId: 'site_new',
            connectedDomain: 'example.com',
            limit: 10
        });

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
            account_id: 'acct_domain_conflict'
        });
    });

    test('paginates account states and matches contact email in the search haystack', async () => {
        const send = jest.fn().mockResolvedValue({
            Items: [
                {
                    account_id: 'acct_newest',
                    account_label: 'Newest Media',
                    contact_email: 'team@newest.example',
                    subscription_status: 'active',
                    updated_at: '2026-03-17T08:00:00.000Z'
                },
                {
                    account_id: 'acct_middle',
                    account_label: 'Middle Media',
                    contact_email: 'owner@example.com',
                    subscription_status: 'active',
                    updated_at: '2026-03-16T08:00:00.000Z'
                },
                {
                    account_id: 'acct_oldest',
                    account_label: 'Oldest Media',
                    contact_email: 'billing@oldest.example',
                    subscription_status: 'trial',
                    updated_at: '2026-03-15T08:00:00.000Z'
                }
            ]
        });
        const store = createSuperAdminStore({
            ddbDoc: { send },
            env: {
                ACCOUNT_BILLING_STATE_TABLE: 'account-state-table'
            }
        });

        const firstPage = await store.listAccountStatePage({
            limit: 1
        });

        expect(firstPage.items).toHaveLength(1);
        expect(firstPage.items[0]).toMatchObject({
            account_id: 'acct_newest'
        });
        expect(firstPage.page).toMatchObject({
            count: 1,
            total_count: 3,
            page_start: 1,
            page_end: 1
        });
        expect(firstPage.page.next_cursor).toBeTruthy();

        const secondPage = await store.listAccountStatePage({
            limit: 1,
            cursor: firstPage.page.next_cursor
        });

        expect(secondPage.items).toHaveLength(1);
        expect(secondPage.items[0]).toMatchObject({
            account_id: 'acct_middle'
        });

        const emailSearch = await store.listAccountStatePage({
            limit: 10,
            query: 'owner@example.com'
        });

        expect(emailSearch.items).toHaveLength(1);
        expect(emailSearch.items[0]).toMatchObject({
            account_id: 'acct_middle',
            contact_email: 'owner@example.com'
        });
    });

    test('builds a truthful financial overview from paid state and monetized records', async () => {
        const send = jest.fn()
            .mockResolvedValueOnce({
                Items: [
                    {
                        account_id: 'acct_growth',
                        account_label: 'Growth Demo',
                        plan_code: 'growth',
                        plan_name: 'Growth',
                        subscription_status: 'active',
                        trial_status: 'none',
                        credits: {
                            total_remaining: 120000,
                            monthly_included: 100000
                        },
                        usage: {
                            credits_used_this_month: 125000
                        },
                        updated_at: '2026-03-16T09:00:00.000Z'
                    },
                    {
                        account_id: 'acct_starter',
                        account_label: 'Starter Demo',
                        plan_code: 'starter',
                        plan_name: 'Starter',
                        subscription_status: 'suspended',
                        trial_status: 'converted',
                        credits: {
                            total_remaining: 4000,
                            monthly_included: 60000
                        },
                        updated_at: '2026-03-16T08:00:00.000Z'
                    },
                    {
                        account_id: 'acct_trial',
                        account_label: 'Trial Demo',
                        plan_code: 'free_trial',
                        trial_status: 'active',
                        trial_expires_at: '2026-03-17T09:00:00.000Z',
                        credits: {
                            total_remaining: 5000,
                            monthly_included: 5000
                        },
                        updated_at: '2026-03-16T07:00:00.000Z'
                    }
                ]
            })
            .mockResolvedValueOnce({
                Items: [
                    {
                        subscription_id: 'sub_failed',
                        account_id: 'acct_starter',
                        status: 'error',
                        last_payment_status: 'failed',
                        last_event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
                        updated_at: '2026-03-16T10:00:00.000Z'
                    }
                ]
            })
            .mockResolvedValueOnce({
                Items: [
                    {
                        order_id: 'ord_1',
                        account_id: 'acct_growth',
                        pack_code: 'topup_25k',
                        credits: 25000,
                        status: 'credited',
                        updated_at: '2026-03-15T10:00:00.000Z'
                    }
                ]
            })
            .mockResolvedValueOnce({
                Items: [
                    {
                        intent_id: 'intent_1',
                        intent_type: 'subscription',
                        intent_variant: 'intro_offer',
                        account_id: 'acct_growth',
                        plan_code: 'growth',
                        price_usd: 11,
                        status: 'active',
                        updated_at: '2026-03-16T11:00:00.000Z'
                    },
                    {
                        intent_id: 'intent_revise',
                        intent_type: 'subscription',
                        intent_variant: 'revise',
                        account_id: 'acct_growth',
                        plan_code: 'growth',
                        price_usd: 22,
                        status: 'plan_change_completed',
                        updated_at: '2026-03-16T12:00:00.000Z'
                    }
                ]
            });

        const store = createSuperAdminStore({
            ddbDoc: { send },
            env: {
                ACCOUNT_BILLING_STATE_TABLE: 'account-state-table',
                BILLING_SUBSCRIPTIONS_TABLE: 'subscriptions-table',
                BILLING_TOPUP_ORDERS_TABLE: 'topups-table',
                BILLING_CHECKOUT_INTENTS_TABLE: 'checkout-intents-table'
            }
        });

        const overview = await store.getFinancialOverview({
            recentEventsLimit: 5,
            now: '2026-03-16T12:00:00.000Z'
        });

        expect(overview).toMatchObject({
            currency: 'USD',
            snapshot: {
                total_accounts: 3,
                paid_accounts: 1,
                active_trials: 1,
                suspended_paid_accounts: 1
            },
            projected_recurring: {
                mrr_usd: 22
            },
            observed_checkout_revenue: {
                last_7d_usd: 18,
                last_30d_usd: 18,
                counted_events: 2
            },
            watchlist: {
                near_trial_expiry_accounts: 1,
                payment_failure_accounts: 1
            },
            truth_boundary: {
                recurring_renewals_included: false,
                plan_change_collections_included: false
            }
        });
        expect(overview.operator_views.payment_failures).toEqual([
            expect.objectContaining({
                account_id: 'acct_starter',
                account_label: 'Starter Demo',
                last_payment_status: 'failed'
            })
        ]);
        expect(overview.operator_views.watch_accounts.near_trial_expiry).toEqual([
            expect.objectContaining({
                account_id: 'acct_trial',
                trial_expires_at: '2026-03-17T09:00:00.000Z'
            })
        ]);
        expect(overview.operator_views.watch_accounts.high_usage_paid).toEqual([
            expect.objectContaining({
                account_id: 'acct_growth',
                usage_ratio: 125
            })
        ]);
        expect(overview.plan_mix).toEqual([
            expect.objectContaining({
                plan_code: 'growth',
                active_accounts: 1,
                projected_mrr_usd: 22
            })
        ]);
        expect(overview.recent_monetized_events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                event_kind: 'subscription_checkout',
                amount_usd: 11
            }),
            expect.objectContaining({
                event_kind: 'topup_purchase',
                amount_usd: 7
            })
        ]));
    });
});
