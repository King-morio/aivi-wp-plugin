const mockStore = {
    listAccountStates: jest.fn(),
    getAccountState: jest.fn(),
    listSubscriptionRecordsByAccount: jest.fn(),
    listTopupOrdersByAccount: jest.fn(),
    listCheckoutIntentsByAccount: jest.fn(),
    listLedgerEventsByAccount: jest.fn(),
    listRecentWebhookEvents: jest.fn()
};

jest.mock('./super-admin-store', () => ({
    createSuperAdminStore: jest.fn(() => mockStore)
}));

const { superAdminReadHandler } = require('./super-admin-read-handler');

describe('super-admin-read-handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        delete process.env.AIVI_ADMIN_BOOTSTRAP_TOKEN;
        mockStore.listAccountStates.mockResolvedValue([]);
        mockStore.getAccountState.mockResolvedValue(null);
        mockStore.listSubscriptionRecordsByAccount.mockResolvedValue([]);
        mockStore.listTopupOrdersByAccount.mockResolvedValue([]);
        mockStore.listCheckoutIntentsByAccount.mockResolvedValue([]);
        mockStore.listLedgerEventsByAccount.mockResolvedValue([]);
        mockStore.listRecentWebhookEvents.mockResolvedValue([]);
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
        mockStore.listAccountStates.mockResolvedValue([
            {
                account_id: 'acct_123',
                account_label: 'Acme Media',
                plan_code: 'growth',
                plan_name: 'Growth',
                subscription_status: 'active',
                trial_status: 'none',
                site: {
                    site_id: 'site_123',
                    connected_domain: 'example.com'
                },
                credits: {
                    total_remaining: 145000
                },
                updated_at: '2026-03-06T12:00:00.000Z'
            }
        ]);

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
                plan_code: 'growth'
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.items).toEqual([
            expect.objectContaining({
                account_id: 'acct_123',
                account_label: 'Acme Media',
                plan_code: 'growth',
                credits_remaining: 145000,
                site_count: 1
            })
        ]);
        expect(body.page).toMatchObject({
            count: 1,
            limit: 10,
            next_cursor: null
        });
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
            }
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
        expect(body.item.sites).toEqual([
            expect.objectContaining({
                site_id: 'site_123',
                connected_domain: 'example.com'
            })
        ]);
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
