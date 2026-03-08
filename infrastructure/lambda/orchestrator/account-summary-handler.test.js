const mockGetAccountState = jest.fn();

jest.mock('../shared/billing-account-state', () => ({
    buildDefaultAccountBillingState: jest.fn(({ accountId = '', siteId = '', blogId = 0, homeUrl = '', pluginVersion = '' } = {}) => ({
        account_id: accountId,
        connected: !!accountId,
        connection_status: accountId ? 'connected' : 'disconnected',
        account_label: '',
        plan_code: '',
        plan_name: '',
        subscription_status: '',
        trial_status: '',
        site_binding_status: siteId ? 'pending' : 'unbound',
        credits: {
            included_remaining: 0,
            topup_remaining: 0,
            reserved_credits: 0,
            total_remaining: 0,
            monthly_included: 0,
            monthly_used: 0,
            last_run_debit: 0
        },
        entitlements: {
            analysis_allowed: false,
            web_lookups_allowed: true,
            max_sites: null,
            site_limit_reached: false
        },
        usage: {
            analyses_this_month: 0,
            credits_used_this_month: 0,
            last_analysis_at: null,
            last_run_status: null
        },
        site: {
            site_id: siteId,
            blog_id: blogId,
            home_url: homeUrl,
            connected_domain: 'example.com',
            plugin_version: pluginVersion
        },
        subscription: {
            current_period_end: null,
            cancel_at_period_end: false
        },
        updated_at: '2026-03-06T10:00:00.000Z'
    })),
    buildRemoteAccountPayload: jest.fn((state, siteContext = {}, supportLinks = {}) => ({
        account_state: state,
        dashboard_summary: {
            schema_version: 'v1',
            account: {
                connected: !!state.account_id,
                connection_status: state.connection_status || 'disconnected',
                display_state: !!state.account_id ? 'connected' : 'disconnected',
                account_label: state.account_label || '',
                last_sync_at: state.updated_at || '2026-03-06T10:00:00.000Z'
            },
            plan: {
                plan_code: state.plan_code || '',
                plan_name: state.plan_name || '',
                subscription_status: state.subscription_status || '',
                trial_status: state.trial_status || '',
                trial_active: state.trial_status === 'active',
                renewal_date: state.subscription?.current_period_end || null,
                cancel_at: null,
                max_sites: state.entitlements?.max_sites ?? null
            },
            credits: {
                included_remaining: state.credits?.included_remaining ?? 0,
                topup_remaining: state.credits?.topup_remaining ?? 0,
                total_remaining: state.credits?.total_remaining ?? 0,
                reserved_credits: state.credits?.reserved_credits ?? 0,
                last_run_debit: state.credits?.last_run_debit ?? 0,
                monthly_included: state.credits?.monthly_included ?? 0,
                monthly_used: state.credits?.monthly_used ?? 0
            },
            usage: state.usage || {},
            site: {
                site_id: siteContext.siteId || '',
                blog_id: siteContext.blogId || 0,
                connected_domain: 'example.com',
                plugin_version: siteContext.pluginVersion || '',
                binding_status: siteContext.siteId ? 'pending' : 'unbound'
            },
            support: {
                docs_url: supportLinks.docs_url || '',
                billing_url: supportLinks.billing_url || '',
                support_url: supportLinks.support_url || '',
                help_label: supportLinks.help_label || 'AiVI Help'
            }
        }
    })),
    createAccountBillingStateStore: jest.fn(() => ({
        getAccountState: mockGetAccountState
    }))
}));

const { accountSummaryHandler, buildDefaultDashboardSummary } = require('./account-summary-handler');

describe('accountSummaryHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.AIVI_DOCS_URL;
        delete process.env.AIVI_BILLING_URL;
        delete process.env.AIVI_SUPPORT_URL;
        mockGetAccountState.mockResolvedValue(null);
    });

    test('builds canonical dashboard summary defaults', () => {
        const summary = buildDefaultDashboardSummary({
            siteId: 'site-123',
            blogId: 42,
            homeUrl: 'https://example.com/article',
            pluginVersion: '1.0.8'
        });

        expect(summary).toMatchObject({
            schema_version: 'v1',
            account: {
                connected: false,
                connection_status: 'disconnected',
                display_state: 'disconnected'
            },
            site: {
                site_id: 'site-123',
                blog_id: 42,
                connected_domain: 'example.com',
                plugin_version: '1.0.8',
                binding_status: 'pending'
            }
        });
    });

    test('returns canonical dashboard summary response', async () => {
        const response = await accountSummaryHandler({
            queryStringParameters: {
                site_id: 'site-123',
                blog_id: '7',
                home_url: 'https://example.com/'
            },
            headers: {
                'x-aivi-plugin-version': '1.0.8'
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.ok).toBe(true);
        expect(body.source).toBe('remote');
        expect(body.dashboard_summary).toMatchObject({
            schema_version: 'v1',
            site: {
                site_id: 'site-123',
                blog_id: 7,
                connected_domain: 'example.com',
                plugin_version: '1.0.8'
            }
        });
    });

    test('returns authoritative remote account state when billing state exists', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            connection_status: 'connected',
            account_label: 'Acme Editorial',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            trial_status: '',
            credits: {
                included_remaining: 149000,
                topup_remaining: 25000,
                reserved_credits: 900,
                total_remaining: 174000,
                monthly_included: 150000,
                monthly_used: 1000,
                last_run_debit: 1000
            },
            entitlements: {
                max_sites: 3
            },
            usage: {
                analyses_this_month: 2,
                credits_used_this_month: 1400
            },
            subscription: {
                current_period_end: '2026-04-06T10:00:00.000Z'
            },
            updated_at: '2026-03-06T10:00:00.000Z'
        });

        const response = await accountSummaryHandler({
            queryStringParameters: {
                account_id: 'acct_123',
                site_id: 'site-123',
                blog_id: '7',
                home_url: 'https://example.com/'
            },
            headers: {
                'x-aivi-plugin-version': '1.0.8'
            }
        });

        const body = JSON.parse(response.body);
        expect(body.account_state).toMatchObject({
            account_id: 'acct_123',
            plan_code: 'growth',
            subscription_status: 'active'
        });
        expect(body.dashboard_summary.plan).toMatchObject({
            plan_code: 'growth',
            plan_name: 'Growth'
        });
    });
});
