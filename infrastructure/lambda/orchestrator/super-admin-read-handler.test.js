const mockStore = {
    listAccountStates: jest.fn(),
    listAccountStatePage: jest.fn(),
    getAccountState: jest.fn(),
    getFinancialOverview: jest.fn(),
    listSubscriptionRecordsByAccount: jest.fn(),
    listTopupOrdersByAccount: jest.fn(),
    listCheckoutIntentsByAccount: jest.fn(),
    listLedgerEventsByAccount: jest.fn(),
    listRecentWebhookEvents: jest.fn()
};
const mockAuditStore = {
    listRecentAuditEvents: jest.fn()
};

jest.mock('./super-admin-store', () => ({
    createSuperAdminStore: jest.fn(() => mockStore)
}));

jest.mock('./super-admin-audit-store', () => ({
    createSuperAdminAuditStore: jest.fn(() => mockAuditStore)
}));

const { superAdminReadHandler } = require('./super-admin-read-handler');

describe('super-admin-read-handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        delete process.env.AIVI_ADMIN_BOOTSTRAP_TOKEN;
        mockStore.listAccountStates.mockResolvedValue([]);
        mockStore.listAccountStatePage.mockResolvedValue({
            items: [],
            page: {
                count: 0,
                limit: 25,
                total_count: 0,
                page_start: 0,
                page_end: 0,
                next_cursor: null
            }
        });
        mockStore.getAccountState.mockResolvedValue(null);
        mockStore.getFinancialOverview.mockResolvedValue({
            financials_version: 'v1',
            generated_at: '2026-03-16T18:00:00.000Z',
            currency: 'USD',
            snapshot: {
                total_accounts: 0,
                paid_accounts: 0,
                active_trials: 0,
                suspended_paid_accounts: 0
            },
            projected_recurring: {
                mrr_usd: 0,
                active_paid_accounts: 0
            },
            observed_checkout_revenue: {
                last_7d_usd: 0,
                last_30d_usd: 0,
                last_365d_usd: 0,
                counted_events: 0
            },
            plan_mix: [],
            recent_monetized_events: [],
            watchlist: {
                suspended_paid_accounts: 0,
                near_trial_expiry_accounts: 0,
                low_credit_paid_accounts: 0,
                high_usage_paid_accounts: 0,
                payment_failure_accounts: 0,
                items: []
            },
            operator_views: {
                payment_failures: [],
                watch_accounts: {},
                recent_credit_adjustments: []
            },
            truth_boundary: {
                recurring_renewals_included: false
            }
        });
        mockStore.listSubscriptionRecordsByAccount.mockResolvedValue([]);
        mockStore.listTopupOrdersByAccount.mockResolvedValue([]);
        mockStore.listCheckoutIntentsByAccount.mockResolvedValue([]);
        mockStore.listLedgerEventsByAccount.mockResolvedValue([]);
        mockStore.listRecentWebhookEvents.mockResolvedValue([]);
        mockAuditStore.listRecentAuditEvents.mockResolvedValue([]);
    });

    test('requires authenticated admin access', async () => {
        const response = await superAdminReadHandler({
            routeKey: 'GET /aivi/v1/admin/accounts',
            requestContext: { requestId: 'req_123' }
        });

        expect(response.statusCode).toBe(401);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'admin_auth_required'
        });
    });

    test('returns paginated account rows for authorized operators', async () => {
        mockStore.listAccountStatePage.mockResolvedValue({
            items: [
                {
                    account_id: 'acct_123',
                    account_label: 'Acme Media',
                    contact_email: 'owner@example.com',
                    plan_code: 'growth',
                    plan_name: 'Growth',
                    subscription_status: 'active',
                    trial_status: 'none',
                    sites: [
                        {
                            site_id: 'site_123',
                            connected_domain: 'example.com'
                        },
                        {
                            site_id: 'site_456',
                            connected_domain: 'insights.example.com'
                        }
                    ],
                    site: {
                        site_id: 'site_123',
                        connected_domain: 'example.com'
                    },
                    credits: {
                        total_remaining: 145000
                    },
                    updated_at: '2026-03-06T12:00:00.000Z'
                }
            ],
            page: {
                count: 1,
                limit: 10,
                total_count: 27,
                page_start: 11,
                page_end: 11,
                next_cursor: 'cursor_2'
            }
        });

        const response = await superAdminReadHandler({
            routeKey: 'GET /aivi/v1/admin/accounts',
            requestContext: {
                requestId: 'req_123',
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'operator_1',
                            email: 'ops@example.com',
                            'cognito:groups': 'aivi-support',
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            },
            queryStringParameters: {
                limit: '10',
                cursor: 'cursor_1',
                plan_code: 'growth'
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.items).toEqual([
            expect.objectContaining({
                account_id: 'acct_123',
                account_label: 'Acme Media',
                contact_email: 'owner@example.com',
                plan_code: 'growth',
                credits_remaining: 145000,
                site_count: 2
            })
        ]);
        expect(body.page).toMatchObject({
            count: 1,
            limit: 10,
            total_count: 27,
            page_start: 11,
            page_end: 11,
            next_cursor: 'cursor_2'
        });
        expect(mockStore.listAccountStatePage).toHaveBeenCalledWith(expect.objectContaining({
            limit: 10,
            cursor: 'cursor_1',
            plan_code: 'growth'
        }));
    });

    test('returns financial overview for operators with billing visibility', async () => {
        mockStore.getFinancialOverview.mockResolvedValue({
            financials_version: 'v1',
            generated_at: '2026-03-16T18:00:00.000Z',
            currency: 'USD',
            snapshot: {
                total_accounts: 7,
                paid_accounts: 6,
                active_trials: 1,
                suspended_paid_accounts: 1
            },
            projected_recurring: {
                mrr_usd: 145,
                active_paid_accounts: 6
            },
            observed_checkout_revenue: {
                last_7d_usd: 36,
                last_30d_usd: 83,
                last_365d_usd: 147,
                counted_events: 4
            },
            plan_mix: [
                {
                    plan_code: 'starter',
                    plan_label: 'Starter',
                    active_accounts: 3,
                    projected_mrr_usd: 30,
                    share_of_paid_accounts: 50
                }
            ],
            recent_monetized_events: [
                {
                    event_kind: 'subscription_checkout',
                    account_id: 'acct_paid_1',
                    account_label: 'Lawyer Demo',
                    summary: 'Growth intro checkout',
                    amount_usd: 11,
                    observed_at: '2026-03-16T10:00:00.000Z'
                }
            ],
            watchlist: {
                suspended_paid_accounts: 1,
                near_trial_expiry_accounts: 1,
                low_credit_paid_accounts: 0,
                high_usage_paid_accounts: 0,
                payment_failure_accounts: 1,
                items: [
                    {
                        key: 'payment_failure_accounts',
                        count: 1
                    }
                ]
            },
            operator_views: {
                payment_failures: [
                    {
                        account_id: 'acct_paid_2',
                        account_label: 'Suspended Demo',
                        last_payment_status: 'failed'
                    }
                ],
                watch_accounts: {
                    near_trial_expiry: [
                        {
                            account_id: 'acct_trial_1',
                            account_label: 'Trial Demo'
                        }
                    ]
                }
            },
            truth_boundary: {
                recurring_renewals_included: false,
                plan_change_collections_included: false
            }
        });
        mockStore.listAccountStates.mockResolvedValue([
            {
                account_id: 'acct_paid_1',
                account_label: 'Lawyer Demo'
            }
        ]);
        mockAuditStore.listRecentAuditEvents.mockResolvedValue([
            {
                event_id: 'audit_adj_1',
                account_id: 'acct_paid_1',
                actor_email: 'finance@example.com',
                actor_role: 'finance_operator',
                reason: 'Courtesy credit top-up',
                status: 'completed',
                metadata: {
                    request_payload: {
                        credits_delta: 5000
                    }
                },
                created_at: '2026-03-16T09:00:00.000Z',
                updated_at: '2026-03-16T09:05:00.000Z'
            }
        ]);

        const response = await superAdminReadHandler({
            routeKey: 'GET /aivi/v1/admin/financials/overview',
            requestContext: {
                requestId: 'req_123',
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'operator_finance',
                            email: 'finance@example.com',
                            'cognito:groups': 'aivi-finance',
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            },
            queryStringParameters: {
                recent_limit: '5'
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.item).toMatchObject({
            currency: 'USD',
            snapshot: {
                paid_accounts: 6
            },
            projected_recurring: {
                mrr_usd: 145
            },
            observed_checkout_revenue: {
                last_30d_usd: 83
            },
            watchlist: {
                payment_failure_accounts: 1
            },
            operator_views: {
                payment_failures: [
                    expect.objectContaining({
                        account_id: 'acct_paid_2'
                    })
                ],
                recent_credit_adjustments: [
                    expect.objectContaining({
                        account_id: 'acct_paid_1',
                        account_label: 'Lawyer Demo',
                        credits_delta: 5000
                    })
                ]
            }
        });
        expect(mockStore.getFinancialOverview).toHaveBeenCalledWith(expect.objectContaining({
            recentEventsLimit: 5
        }));
        expect(mockAuditStore.listRecentAuditEvents).toHaveBeenCalledWith(expect.objectContaining({
            action: 'manual_credit_adjustment'
        }));
    });

    test('returns account detail with connected site, billing health, and ledger summary', async () => {
        mockStore.getAccountState.mockResolvedValue({
            account_id: 'acct_123',
            account_label: 'Acme Media',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            trial_status: 'none',
            connected: true,
            site_binding_status: 'connected',
            entitlements: {
                max_sites: 3
            },
            subscription: {
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z'
            },
            credits: {
                included_remaining: 120000,
                topup_remaining: 25000,
                total_remaining: 145000,
                reserved_credits: 500,
                last_run_debit: 1200
            },
            usage: {
                analyses_this_month: 5,
                credits_used_this_month: 4300,
                last_analysis_at: '2026-03-06T11:42:00.000Z',
                last_run_status: 'success'
            },
            site: {
                site_id: 'site_123',
                blog_id: 7,
                connected_domain: 'example.com',
                plugin_version: '1.0.8'
            },
            sites: [
                {
                    site_id: 'site_123',
                    blog_id: 7,
                    connected_domain: 'example.com',
                    plugin_version: '1.0.8',
                    binding_status: 'connected'
                },
                {
                    site_id: 'site_456',
                    blog_id: 11,
                    connected_domain: 'insights.example.com',
                    plugin_version: '1.0.8',
                    binding_status: 'connected'
                }
            ]
        });
        mockStore.listSubscriptionRecordsByAccount.mockResolvedValue([{ subscription_id: 'sub_1', provider_subscription_id: 'I-SUB1', plan_code: 'growth', status: 'active' }]);
        mockStore.listTopupOrdersByAccount.mockResolvedValue([{ order_id: 'ord_1', provider_order_id: 'ORDER1', pack_code: 'topup_100k', credits: 100000, status: 'credited' }]);
        mockStore.listCheckoutIntentsByAccount.mockResolvedValue([{ intent_id: 'intent_1', intent_type: 'subscription', plan_code: 'growth', status: 'created' }]);
        mockStore.listLedgerEventsByAccount.mockResolvedValue([{ event_id: 'ledger_1', event_type: 'settlement', status: 'settled', reason_code: 'analysis_run', amounts: { settled_credits: 1200 } }]);
        mockStore.listRecentWebhookEvents.mockResolvedValue([{ event_id: 'wh_1', provider_event_id: 'WH-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', verification_status: 'success', processed: true }]);

        const response = await superAdminReadHandler({
            routeKey: 'GET /aivi/v1/admin/accounts/{account_id}',
            pathParameters: { account_id: 'acct_123' },
            requestContext: {
                requestId: 'req_123',
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'operator_1',
                            email: 'admin@example.com',
                            'cognito:groups': 'aivi-super-admin',
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.item).toMatchObject({
            account_id: 'acct_123',
            plan: {
                plan_code: 'growth',
                subscription_status: 'active',
                max_sites: 3
            },
            credits: {
                total_remaining: 145000,
                reserved_credits: 500
            },
            usage: {
                analyses_this_month: 5
            }
        });
        expect(body.item.sites).toEqual(expect.arrayContaining([
            expect.objectContaining({
                site_id: 'site_123',
                connected_domain: 'example.com'
            }),
            expect.objectContaining({
                site_id: 'site_456',
                connected_domain: 'insights.example.com'
            })
        ]));
        expect(body.item.sites).toHaveLength(2);
        expect(body.item.credit_ledger_summary.recent_events).toHaveLength(1);
        expect(body.item.billing_health.recent_subscriptions).toHaveLength(1);
    });

    test('returns 404 when the requested account does not exist', async () => {
        const response = await superAdminReadHandler({
            routeKey: 'GET /aivi/v1/admin/accounts/{account_id}',
            pathParameters: { account_id: 'acct_missing' },
            requestContext: {
                requestId: 'req_123',
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'operator_1',
                            email: 'finance@example.com',
                            'cognito:groups': 'aivi-finance',
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            }
        });

        expect(response.statusCode).toBe(404);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'account_not_found'
        });
    });
});
