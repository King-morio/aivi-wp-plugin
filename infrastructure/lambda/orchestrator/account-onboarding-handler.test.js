const mockGetAccountState = jest.fn();
const mockPutAccountState = jest.fn();
const mockFindTrialAdmissionConflicts = jest.fn();

jest.mock('./billing-account-state', () => ({
    buildDefaultAccountBillingState: jest.fn(({ accountId = '', siteId = '', blogId = 0, homeUrl = '', pluginVersion = '' } = {}) => ({
        account_id: accountId,
        account_label: '',
        connected: false,
        connection_status: 'disconnected',
        plan_code: '',
        plan_name: '',
        subscription_status: '',
        trial_status: '',
        trial_expires_at: null,
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
            last_run_status: ''
        },
        site: {
            site_id: siteId,
            blog_id: blogId,
            home_url: homeUrl,
            connected_domain: 'example.com',
            plugin_version: pluginVersion
        },
        subscription: {
            provider_subscription_id: '',
            current_period_start: null,
            current_period_end: null,
            cancel_at_period_end: false,
            credit_cycle_key: '',
            last_event_type: ''
        },
        topup: {
            granted_order_ids: []
        },
        updated_at: '2026-03-09T10:00:00.000Z'
    })),
    buildRemoteAccountPayload: jest.fn((state) => ({
        account_state: state,
        dashboard_summary: {
            account: {
                connected: !!state.connected,
                account_label: state.account_label || ''
            },
            plan: {
                plan_code: state.plan_code || '',
                subscription_status: state.subscription_status || '',
                trial_status: state.trial_status || ''
            },
            credits: {
                total_remaining: state.credits?.total_remaining ?? 0,
                included_remaining: state.credits?.included_remaining ?? 0,
                topup_remaining: state.credits?.topup_remaining ?? 0
            },
            site: {
                site_id: state.site?.site_id || '',
                binding_status: state.site_binding_status || ''
            }
        }
    })),
    createAccountBillingStateStore: jest.fn(() => ({
        getAccountState: mockGetAccountState,
        putAccountState: mockPutAccountState,
        findTrialAdmissionConflicts: mockFindTrialAdmissionConflicts
    })),
    getPlanDefinition: jest.fn((planCode) => {
        if (planCode === 'free_trial') {
            return { code: 'free_trial', label: 'Free Trial', included_credits: 5000, site_limit: 1, duration_days: 7 };
        }
        return null;
    }),
    normalizeAccountBillingState: jest.fn((state = {}) => {
        const included = Number(state.credits?.included_remaining || 0);
        const topup = Number(state.credits?.topup_remaining || 0);
        const subscriptionStatus = String(state.subscription_status || '').trim().toLowerCase();
        const trialStatus = String(state.trial_status || '').trim().toLowerCase();
        return {
            ...state,
            account_id: String(state.account_id || '').trim(),
            account_label: String(state.account_label || '').trim(),
            connected: state.connected === true,
            connection_status: String(state.connection_status || '').trim() || 'disconnected',
            plan_code: String(state.plan_code || '').trim(),
            plan_name: String(state.plan_name || '').trim(),
            subscription_status: subscriptionStatus,
            trial_status: trialStatus,
            site_binding_status: String(state.site_binding_status || '').trim() || 'unbound',
            credits: {
                included_remaining: included,
                topup_remaining: topup,
                reserved_credits: Number(state.credits?.reserved_credits || 0),
                total_remaining: included + topup,
                monthly_included: Number(state.credits?.monthly_included || 0),
                monthly_used: Number(state.credits?.monthly_used || 0),
                last_run_debit: Number(state.credits?.last_run_debit || 0)
            },
            entitlements: {
                analysis_allowed: state.entitlements?.analysis_allowed === true,
                web_lookups_allowed: state.entitlements?.web_lookups_allowed !== false,
                max_sites: state.entitlements?.max_sites ?? null,
                site_limit_reached: state.entitlements?.site_limit_reached === true
            },
            usage: state.usage || {},
            site: {
                site_id: String(state.site?.site_id || '').trim(),
                blog_id: Number(state.site?.blog_id || 0),
                home_url: String(state.site?.home_url || '').trim(),
                connected_domain: String(state.site?.connected_domain || '').trim(),
                plugin_version: String(state.site?.plugin_version || '').trim()
            },
            subscription: state.subscription || {},
            topup: state.topup || { granted_order_ids: [] },
            updated_at: state.updated_at || '2026-03-09T10:00:00.000Z'
        };
    })
}));

const {
    accountBootstrapHandler,
    accountStartTrialHandler,
    buildDeterministicAccountId,
    isPublicSiteUrl
} = require('./account-onboarding-handler');

describe('account onboarding handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.AIVI_ALLOW_PRIVATE_TRIAL_START;
        mockGetAccountState.mockResolvedValue(null);
        mockPutAccountState.mockImplementation(async (state) => state);
        mockFindTrialAdmissionConflicts.mockResolvedValue([]);
    });

    test('derives deterministic account ids from site id', () => {
        const first = buildDeterministicAccountId({ site_id: 'abc123' });
        const second = buildDeterministicAccountId({ site_id: 'abc123' });
        expect(first).toBe(second);
        expect(first).toMatch(/^acct_site_/);
    });

    test('rejects local/private site urls for self-serve onboarding', async () => {
        expect(isPublicSiteUrl('https://example.com')).toBe(true);
        expect(isPublicSiteUrl('http://localhost:8080')).toBe(false);

        const response = await accountStartTrialHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_local',
                    home_url: 'http://localhost:8080/'
                }
            })
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toBe('invalid_site_home_url');
    });

    test('allows local/private site urls when private trial start bypass is enabled', async () => {
        process.env.AIVI_ALLOW_PRIVATE_TRIAL_START = 'true';

        const response = await accountStartTrialHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_local',
                    blog_id: 1,
                    home_url: 'http://localhost:8080/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.body);
        expect(payload.ok).toBe(true);
        expect(payload.account_state.plan_code).toBe('free_trial');
    });

    test('bootstraps a connected account record for a public site', async () => {
        const response = await accountBootstrapHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_prod_123',
                    blog_id: 7,
                    home_url: 'https://example.com/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        expect(mockPutAccountState).toHaveBeenCalled();
        const payload = JSON.parse(response.body);
        expect(payload.ok).toBe(true);
        expect(payload.account_state).toMatchObject({
            connected: true,
            connection_status: 'connected',
            site_binding_status: 'connected'
        });
    });

    test('starts a free trial and enables analysis', async () => {
        const response = await accountStartTrialHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_prod_trial',
                    blog_id: 7,
                    home_url: 'https://trial.example.com/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.body);
        expect(payload.account_state).toMatchObject({
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active'
        });
        expect(payload.account_state.entitlements.analysis_allowed).toBe(true);
        expect(payload.account_state.credits.included_remaining).toBe(5000);
        expect(payload.account_state.trial_admissions).toEqual([
            expect.objectContaining({
                source: 'self_serve',
                site_id: 'site_prod_trial',
                connected_domain: 'trial.example.com'
            })
        ]);
    });

    test('starts a free trial with a seven-day expiry window', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

        try {
            const response = await accountStartTrialHandler({
                body: JSON.stringify({
                    site: {
                        site_id: 'site_prod_trial_expiry',
                        blog_id: 9,
                        home_url: 'https://expiry.example.com/',
                        plugin_version: '1.0.8'
                    }
                })
            });

            expect(response.statusCode).toBe(200);
            const payload = JSON.parse(response.body);
            expect(payload.account_state.trial_expires_at).toBe('2026-03-23T00:00:00.000Z');
        } finally {
            jest.useRealTimers();
        }
    });

    test('returns current state when a trial is already active', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_site_existing',
            account_label: 'example.com',
            connected: true,
            connection_status: 'connected',
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'trial',
            trial_status: 'active',
            site_binding_status: 'connected',
            credits: {
                included_remaining: 5000,
                topup_remaining: 0,
                reserved_credits: 0,
                total_remaining: 5000,
                monthly_included: 5000,
                monthly_used: 0,
                last_run_debit: 0
            },
            entitlements: {
                analysis_allowed: true,
                web_lookups_allowed: true,
                max_sites: 1,
                site_limit_reached: false
            },
            site: {
                site_id: 'site_prod_trial',
                blog_id: 7,
                home_url: 'https://trial.example.com/',
                connected_domain: 'trial.example.com',
                plugin_version: '1.0.8'
            },
            updated_at: '2026-03-09T10:00:00.000Z'
        });

        const response = await accountStartTrialHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_prod_trial',
                    blog_id: 7,
                    home_url: 'https://trial.example.com/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        expect(mockPutAccountState).not.toHaveBeenCalled();
        expect(JSON.parse(response.body).message).toContain('already active');
    });

    test('blocks trial restart for converted or paid accounts', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_site_existing',
            connected: true,
            connection_status: 'connected',
            plan_code: 'starter',
            plan_name: 'Starter',
            subscription_status: 'active',
            trial_status: 'converted',
            site_binding_status: 'connected',
            credits: {
                included_remaining: 60000,
                topup_remaining: 0,
                reserved_credits: 0,
                total_remaining: 60000,
                monthly_included: 60000,
                monthly_used: 0,
                last_run_debit: 0
            },
            entitlements: {
                analysis_allowed: true,
                web_lookups_allowed: true,
                max_sites: 1,
                site_limit_reached: false
            },
            site: {
                site_id: 'site_prod_paid',
                blog_id: 7,
                home_url: 'https://paid.example.com/',
                connected_domain: 'paid.example.com',
                plugin_version: '1.0.8'
            },
            updated_at: '2026-03-09T10:00:00.000Z'
        });

        const response = await accountStartTrialHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_prod_paid',
                    blog_id: 7,
                    home_url: 'https://paid.example.com/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body).error).toBe('trial_unavailable');
    });

    test('blocks self-serve trial start when the exact public domain already has trial history on another account', async () => {
        mockFindTrialAdmissionConflicts.mockResolvedValue([
            {
                account_id: 'acct_other',
                connected_domain: 'trial.example.com',
                trial_status: 'ended',
                subscription_status: 'trial'
            }
        ]);

        const response = await accountStartTrialHandler({
            body: JSON.stringify({
                site: {
                    site_id: 'site_new_trial',
                    blog_id: 11,
                    home_url: 'https://trial.example.com/',
                    plugin_version: '1.0.8'
                }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'trial_review_required'
        });
        expect(mockPutAccountState).not.toHaveBeenCalled();
    });
});
