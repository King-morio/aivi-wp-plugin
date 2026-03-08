const mockGetAccountState = jest.fn();
const mockPutAccountState = jest.fn();
const mockVerifyConnectionToken = jest.fn();

jest.mock('./billing-account-state', () => ({
    buildDefaultAccountBillingState: jest.fn((defaults = {}) => ({
        account_id: defaults.accountId || '',
        account_label: '',
        connected: false,
        connection_status: 'disconnected',
        site_binding_status: 'unbound',
        credits: {
            included_remaining: 0,
            topup_remaining: 0,
            last_run_debit: 0,
            total_remaining: 0,
            reserved_credits: 0,
            monthly_included: 0,
            monthly_used: 0
        },
        entitlements: {
            analysis_allowed: false,
            web_lookups_allowed: true,
            max_sites: 1,
            site_limit_reached: false
        },
        site: {
            site_id: defaults.siteId || '',
            blog_id: defaults.blogId || 0,
            home_url: defaults.homeUrl || '',
            connected_domain: '',
            plugin_version: defaults.pluginVersion || ''
        },
        subscription: {},
        usage: {},
        updated_at: new Date().toISOString()
    })),
    buildRemoteAccountPayload: jest.fn((state) => ({
        account_state: state,
        dashboard_summary: {
            schema_version: 'v1',
            account: { connected: state.connected }
        }
    })),
    createAccountBillingStateStore: jest.fn(() => ({
        getAccountState: mockGetAccountState,
        putAccountState: mockPutAccountState
    })),
    normalizeAccountBillingState: jest.fn((state = {}, siteContext = {}) => ({
        ...state,
        connected: state.connected === true,
        connection_status: state.connection_status || 'disconnected',
        site_binding_status: state.site_binding_status || 'unbound',
        entitlements: {
            analysis_allowed: state.entitlements?.analysis_allowed ?? false,
            web_lookups_allowed: state.entitlements?.web_lookups_allowed ?? true,
            max_sites: state.entitlements?.max_sites ?? 1,
            site_limit_reached: state.entitlements?.site_limit_reached ?? false
        },
        credits: {
            included_remaining: state.credits?.included_remaining ?? 0,
            topup_remaining: state.credits?.topup_remaining ?? 0,
            last_run_debit: state.credits?.last_run_debit ?? 0,
            total_remaining: state.credits?.total_remaining ?? 0,
            reserved_credits: state.credits?.reserved_credits ?? 0,
            monthly_included: state.credits?.monthly_included ?? 0,
            monthly_used: state.credits?.monthly_used ?? 0
        },
        site: {
            site_id: state.site?.site_id ?? siteContext.siteId ?? '',
            blog_id: state.site?.blog_id ?? siteContext.blogId ?? 0,
            home_url: state.site?.home_url ?? siteContext.homeUrl ?? '',
            connected_domain: state.site?.connected_domain ?? '',
            plugin_version: state.site?.plugin_version ?? siteContext.pluginVersion ?? ''
        },
        account_id: state.account_id || siteContext.accountId || '',
        account_label: state.account_label || '',
        updated_at: state.updated_at || new Date().toISOString()
    }))
}));

jest.mock('./connection-token', () => ({
    verifyConnectionToken: mockVerifyConnectionToken
}));

const { accountConnectHandler, accountDisconnectHandler } = require('./account-connect-handler');

describe('account-connect-handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.AIVI_DOCS_URL = 'https://docs.example.com';
        process.env.AIVI_BILLING_URL = 'https://billing.example.com';
        process.env.AIVI_SUPPORT_URL = 'https://support.example.com';
    });

    test('connects a site with a valid token', async () => {
        mockVerifyConnectionToken.mockResolvedValue({
            valid: true,
            payload: {
                account_id: 'acct_123',
                account_label: 'Acme Media',
                max_sites: 1,
                exp: '2026-03-10T00:00:00.000Z'
            }
        });
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            account_label: 'Acme Media',
            connected: false,
            connection_status: 'disconnected',
            site_binding_status: 'unbound',
            entitlements: { analysis_allowed: true, max_sites: 1 },
            credits: {},
            site: { site_id: '', blog_id: 0, home_url: '', connected_domain: '', plugin_version: '' }
        });
        mockPutAccountState.mockResolvedValue({});

        const response = await accountConnectHandler({
            body: JSON.stringify({
                connection_token: 'signed-token',
                site: {
                    site_id: 'site_123',
                    blog_id: 9,
                    home_url: 'https://example.com/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        expect(mockPutAccountState).toHaveBeenCalled();
        const body = JSON.parse(response.body);
        expect(body.ok).toBe(true);
        expect(body.account_state.account_id).toBe('acct_123');
        expect(body.account_state.site.site_id).toBe('site_123');
    });

    test('rejects conflicting site binding', async () => {
        mockVerifyConnectionToken.mockResolvedValue({
            valid: true,
            payload: {
                account_id: 'acct_123',
                account_label: 'Acme Media',
                max_sites: 1,
                exp: '2026-03-10T00:00:00.000Z'
            }
        });
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            account_label: 'Acme Media',
            connected: true,
            connection_status: 'connected',
            site_binding_status: 'connected',
            entitlements: { analysis_allowed: true, max_sites: 1 },
            credits: {},
            site: { site_id: 'site_existing', blog_id: 4, home_url: 'https://old.example.com/', connected_domain: 'old.example.com', plugin_version: '1.0.8' }
        });

        const response = await accountConnectHandler({
            body: JSON.stringify({
                connection_token: 'signed-token',
                site: {
                    site_id: 'site_123',
                    blog_id: 9,
                    home_url: 'https://example.com/'
                }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(mockPutAccountState).not.toHaveBeenCalled();
        expect(JSON.parse(response.body).error).toBe('site_binding_conflict');
    });

    test('disconnects a matching site binding', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            account_label: 'Acme Media',
            connected: true,
            connection_status: 'connected',
            site_binding_status: 'connected',
            entitlements: { analysis_allowed: true, max_sites: 1 },
            credits: {},
            site: { site_id: 'site_123', blog_id: 9, home_url: 'https://example.com/', connected_domain: 'example.com', plugin_version: '1.0.8' }
        });
        mockPutAccountState.mockResolvedValue({});

        const response = await accountDisconnectHandler({
            body: JSON.stringify({
                account_id: 'acct_123',
                site: {
                    site_id: 'site_123',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        expect(mockPutAccountState).toHaveBeenCalled();
        const body = JSON.parse(response.body);
        expect(body.ok).toBe(true);
        expect(body.account_state.connection_status).toBe('disconnected');
    });
});
