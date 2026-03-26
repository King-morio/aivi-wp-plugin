jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({ send: jest.fn() }))
    },
    GetCommand: jest.fn((input) => ({ input })),
    PutCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

const {
    buildDefaultAccountBillingState,
    normalizeAccountBillingState,
    applySubscriptionRecordToState,
    applyTopupGrantToState,
    applyLedgerEventToState,
    computeTotalRemaining,
    buildRemoteAccountPayload,
    getPlanDefinition
} = require('./billing-account-state');

describe('billing-account-state', () => {
    test('exposes the free trial canonical duration alongside credits and site limit', () => {
        expect(getPlanDefinition('free_trial')).toMatchObject({
            code: 'free_trial',
            included_credits: 5000,
            site_limit: 1,
            duration_days: 7
        });
    });

    test('grants monthly included credits when an active subscription enters a new cycle', () => {
        const current = buildDefaultAccountBillingState({ accountId: 'acct_123', siteId: 'site_123' });
        const result = applySubscriptionRecordToState(current, {
            account_id: 'acct_123',
            plan_code: 'growth',
            status: 'active',
            current_period_start: '2026-03-01T00:00:00.000Z',
            current_period_end: '2026-04-01T00:00:00.000Z',
            provider_subscription_id: 'I-SUB123',
            last_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
        });

        expect(result.granted_cycle_credits).toBe(100000);
        expect(result.state).toMatchObject({
            plan_code: 'growth',
            subscription_status: 'active',
            credits: {
                included_remaining: 100000,
                monthly_included: 100000,
                monthly_used: 0
            },
            entitlements: {
                analysis_allowed: true,
                max_sites: 3
            }
        });
    });

    test('grants only the credit delta when an active paid plan upgrades within the same cycle', () => {
        const current = normalizeAccountBillingState({
            account_id: 'acct_123',
            plan_code: 'starter',
            subscription_status: 'active',
            credits: {
                included_remaining: 54000,
                topup_remaining: 25000,
                reserved_credits: 0,
                total_remaining: 79000,
                monthly_included: 60000,
                monthly_used: 6000,
                last_run_debit: 900
            },
            entitlements: {
                analysis_allowed: true,
                max_sites: 1
            },
            subscription: {
                provider_subscription_id: 'I-STARTER1',
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z',
                credit_cycle_key: '2026-03-01T00:00:00.000Z|2026-04-01T00:00:00.000Z'
            }
        });

        const result = applySubscriptionRecordToState(current, {
            account_id: 'acct_123',
            plan_code: 'growth',
            status: 'active',
            current_period_start: '2026-03-01T00:00:00.000Z',
            current_period_end: '2026-04-01T00:00:00.000Z',
            provider_subscription_id: 'I-GROWTH1',
            last_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
        });

        expect(result.granted_cycle_credits).toBe(0);
        expect(result.granted_upgrade_credits).toBe(40000);
        expect(result.state).toMatchObject({
            plan_code: 'growth',
            subscription_status: 'active',
            credits: {
                included_remaining: 94000,
                topup_remaining: 25000,
                monthly_included: 100000,
                monthly_used: 6000
            },
            entitlements: {
                analysis_allowed: true,
                max_sites: 3
            }
        });
    });

    test('grants top-up credits only once per captured order', () => {
        const current = normalizeAccountBillingState({
            account_id: 'acct_123',
            topup: {
                granted_order_ids: ['ORDER100']
            }
        });

        const first = applyTopupGrantToState(current, {
            provider_order_id: 'ORDER123',
            credits: 100000,
            status: 'captured'
        });

        expect(first.granted_topup_credits).toBe(100000);
        expect(first.state.credits.topup_remaining).toBe(100000);

        const second = applyTopupGrantToState(first.state, {
            provider_order_id: 'ORDER123',
            credits: 100000,
            status: 'captured'
        });

        expect(second.granted_topup_credits).toBe(0);
        expect(second.state.credits.topup_remaining).toBe(100000);
    });

    test('disables analysis when the subscription is suspended', () => {
        const current = normalizeAccountBillingState({
            account_id: 'acct_123',
            plan_code: 'growth',
            subscription_status: 'active',
            credits: {
                included_remaining: 120000,
                topup_remaining: 50000,
                reserved_credits: 0
            },
            entitlements: {
                analysis_allowed: true,
                max_sites: 3
            }
        });

        const result = applySubscriptionRecordToState(current, {
            account_id: 'acct_123',
            plan_code: 'growth',
            status: 'suspended',
            current_period_start: '2026-03-01T00:00:00.000Z',
            current_period_end: '2026-04-01T00:00:00.000Z',
            provider_subscription_id: 'I-SUB123',
            last_event_type: 'BILLING.SUBSCRIPTION.SUSPENDED'
        });

        expect(result.granted_cycle_credits).toBe(0);
        expect(result.state.subscription_status).toBe('suspended');
        expect(result.state.entitlements.analysis_allowed).toBe(false);
        expect(result.state.credits.included_remaining).toBe(120000);
        expect(result.state.credits.topup_remaining).toBe(50000);
    });

    test('does not auto-enable analysis for created subscriptions without explicit entitlement state', () => {
        const normalized = normalizeAccountBillingState({
            account_id: 'acct_123',
            plan_code: 'starter',
            subscription_status: 'created'
        });

        expect(normalized.entitlements.analysis_allowed).toBe(false);
    });

    test('applies reservation and settlement events to authoritative balances', () => {
        const current = normalizeAccountBillingState({
            account_id: 'acct_123',
            plan_code: 'starter',
            subscription_status: 'active',
            credits: {
                included_remaining: 60000,
                topup_remaining: 25000,
                reserved_credits: 0
            }
        });

        const reserved = applyLedgerEventToState(current, {
            event_type: 'reservation',
            amounts: {
                reserved_credits: 1200
            }
        });

        expect(reserved.credits.reserved_credits).toBe(1200);

        const settled = applyLedgerEventToState(reserved, {
            event_type: 'settlement',
            amounts: {
                reserved_credits: 1200,
                settled_credits: 900,
                refunded_credits: 300
            },
            updated_at: '2026-03-06T10:00:00.000Z'
        });

        expect(settled.credits).toMatchObject({
            included_remaining: 59100,
            topup_remaining: 25000,
            reserved_credits: 0,
            last_run_debit: 900,
            monthly_used: 900
        });
        expect(settled.usage).toMatchObject({
            analyses_this_month: 1,
            credits_used_this_month: 900
        });
        expect(computeTotalRemaining(settled)).toBe(84100);
    });

    test('keeps free-trial access active before the expiry timestamp', () => {
        const normalized = normalizeAccountBillingState({
            account_id: 'acct_trial_active',
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active',
            trial_expires_at: '2099-03-20T00:00:00.000Z',
            credits: {
                included_remaining: 5000,
                topup_remaining: 0,
                reserved_credits: 0
            }
        });

        expect(normalized.trial_status).toBe('active');
        expect(normalized.entitlements.analysis_allowed).toBe(true);
    });

    test('ends expired trials automatically in normalized entitlements and dashboard payloads', () => {
        const normalized = normalizeAccountBillingState({
            account_id: 'acct_trial_expired',
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active',
            trial_expires_at: '2026-03-01T00:00:00.000Z',
            credits: {
                included_remaining: 1800,
                topup_remaining: 0,
                reserved_credits: 0
            }
        });
        const payload = buildRemoteAccountPayload(normalized);

        expect(normalized.trial_status).toBe('ended');
        expect(normalized.entitlements.analysis_allowed).toBe(false);
        expect(payload.dashboard_summary.plan).toMatchObject({
            trial_status: 'ended',
            trial_active: false
        });
    });

    test('keeps paid access active even when the previous trial has expired', () => {
        const normalized = normalizeAccountBillingState({
            account_id: 'acct_paid_after_trial',
            plan_code: 'starter',
            subscription_status: 'active',
            trial_status: 'active',
            trial_expires_at: '2026-03-01T00:00:00.000Z',
            credits: {
                included_remaining: 60000,
                topup_remaining: 0,
                reserved_credits: 0
            },
            entitlements: {
                analysis_allowed: false
            }
        });

        expect(normalized.trial_status).toBe('ended');
        expect(normalized.entitlements.analysis_allowed).toBe(true);
    });

    test('projects the requested bound site when an account has multiple connected sites', () => {
        const payload = buildRemoteAccountPayload({
            account_id: 'acct_multi',
            account_label: 'Acme Media',
            connected: true,
            connection_status: 'connected',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            entitlements: {
                analysis_allowed: true,
                max_sites: 3
            },
            site_binding_status: 'connected',
            site: {
                site_id: 'site_primary',
                blog_id: 7,
                home_url: 'https://primary.example.com/',
                connected_domain: 'primary.example.com',
                plugin_version: '1.0.8'
            },
            sites: [
                {
                    site_id: 'site_primary',
                    blog_id: 7,
                    home_url: 'https://primary.example.com/',
                    connected_domain: 'primary.example.com',
                    plugin_version: '1.0.8',
                    binding_status: 'connected'
                },
                {
                    site_id: 'site_secondary',
                    blog_id: 11,
                    home_url: 'https://secondary.example.com/',
                    connected_domain: 'secondary.example.com',
                    plugin_version: '1.0.8',
                    binding_status: 'connected'
                }
            ]
        }, {
            siteId: 'site_secondary',
            blogId: 11,
            homeUrl: 'https://secondary.example.com/',
            pluginVersion: '1.0.8'
        });

        expect(payload.account_state).toMatchObject({
            connected: true,
            connection_status: 'connected',
            site_binding_status: 'connected',
            site: {
                site_id: 'site_secondary',
                connected_domain: 'secondary.example.com'
            },
            entitlements: {
                analysis_allowed: true
            }
        });
    });

    test('projects an unbound site view when the requested site is no longer attached to the account', () => {
        const payload = buildRemoteAccountPayload({
            account_id: 'acct_multi',
            account_label: 'Acme Media',
            connected: true,
            connection_status: 'connected',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            entitlements: {
                analysis_allowed: true,
                max_sites: 3
            },
            site_binding_status: 'connected',
            site: {
                site_id: 'site_remaining',
                blog_id: 7,
                home_url: 'https://remaining.example.com/',
                connected_domain: 'remaining.example.com',
                plugin_version: '1.0.8'
            },
            sites: [
                {
                    site_id: 'site_remaining',
                    blog_id: 7,
                    home_url: 'https://remaining.example.com/',
                    connected_domain: 'remaining.example.com',
                    plugin_version: '1.0.8',
                    binding_status: 'connected'
                }
            ]
        }, {
            siteId: 'site_removed',
            blogId: 9,
            homeUrl: 'https://removed.example.com/',
            pluginVersion: '1.0.8'
        });

        expect(payload.account_state).toMatchObject({
            connected: false,
            connection_status: 'disconnected',
            site_binding_status: 'unbound',
            site: {
                site_id: 'site_removed',
                connected_domain: 'removed.example.com'
            },
            entitlements: {
                analysis_allowed: false
            }
        });
    });

    test('sanitizes Zoho Desk support configuration into the remote dashboard summary', () => {
        const payload = buildRemoteAccountPayload({
            account_id: 'acct_support',
            connected: true,
            connection_status: 'connected',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active'
        }, {
            siteId: 'site_support',
            homeUrl: 'https://support.example.com/'
        }, {
            docs_url: 'https://docs.aivi.example',
            support_url: 'https://desk.zoho.com/portal/aivi/en/newticket',
            help_label: 'AiVI Support',
            provider: 'zoho_desk_asap',
            zoho_asap: {
                widget_snippet_url: 'https://desk.zoho.com/portal/aivi/asap/app.js',
                department_id: '123456789',
                layout_id: '987654321',
                ticket_title: 'AiVI Support',
                field_map: {
                    category: 'cf_category',
                    site_id: 'cf_site_id',
                    empty_field: ''
                }
            }
        });

        expect(payload.dashboard_summary.support).toMatchObject({
            docs_url: 'https://docs.aivi.example',
            support_url: 'https://desk.zoho.com/portal/aivi/en/newticket',
            help_label: 'AiVI Support',
            provider: 'zoho_desk_asap',
            zoho_asap: {
                widget_snippet_url: 'https://desk.zoho.com/portal/aivi/asap/app.js',
                department_id: '123456789',
                layout_id: '987654321',
                ticket_title: 'AiVI Support',
                field_map: {
                    category: 'cf_category',
                    site_id: 'cf_site_id'
                }
            }
        });
    });

    test('persists a masked active connection token in remote payloads for customer reveal/copy flows', () => {
        const payload = buildRemoteAccountPayload({
            account_id: 'acct_multi',
            connected: true,
            connection_status: 'connected',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            entitlements: {
                analysis_allowed: true,
                max_sites: 3
            },
            sites: [
                {
                    site_id: 'site_primary',
                    blog_id: 7,
                    home_url: 'https://primary.example.com/',
                    connected_domain: 'primary.example.com',
                    binding_status: 'connected'
                }
            ],
            latest_connection_token: {
                token: 'issued.connection.token',
                issued_at: '2026-03-17T09:00:00.000Z',
                expires_at: '2099-03-24T00:00:00.000Z'
            }
        });

        expect(payload.account_state.latest_connection_token).toMatchObject({
            token: 'issued.connection.token',
            masked_token: 'issu••••oken',
            status: 'active'
        });
        expect(payload.dashboard_summary.connection).toMatchObject({
            site_slots_used: 1,
            latest_connection_token: {
                token: 'issued.connection.token',
                masked_token: 'issu••••oken',
                status: 'active'
            }
        });
    });

    test('drops expired connection tokens from normalized account state', () => {
        const normalized = normalizeAccountBillingState({
            account_id: 'acct_expired_token',
            latest_connection_token: {
                token: 'expired.connection.token',
                issued_at: '2026-03-01T00:00:00.000Z',
                expires_at: '2026-03-02T00:00:00.000Z'
            }
        });

        expect(normalized.latest_connection_token).toMatchObject({
            token: '',
            masked_token: '',
            status: 'none'
        });
    });
});
