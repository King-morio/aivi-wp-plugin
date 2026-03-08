(function () {
    const mockAccounts = [
        {
            account_id: 'acct_1001',
            account_label: 'Acme Media',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            trial_status: 'none',
            credits_remaining: 142600,
            site_count: 2,
            connected_domain: 'acmemedia.com',
            updated_at: '2026-03-06T11:42:00.000Z'
        },
        {
            account_id: 'acct_1002',
            account_label: 'Northstar Commerce',
            plan_code: 'starter',
            plan_name: 'Starter',
            subscription_status: 'trial',
            trial_status: 'active',
            credits_remaining: 12900,
            site_count: 1,
            connected_domain: 'northstar.shop',
            updated_at: '2026-03-06T09:18:00.000Z'
        },
        {
            account_id: 'acct_1003',
            account_label: 'Helix Health',
            plan_code: 'pro',
            plan_name: 'Pro',
            subscription_status: 'suspended',
            trial_status: 'none',
            credits_remaining: 508000,
            site_count: 4,
            connected_domain: 'helixhealth.io',
            updated_at: '2026-03-05T18:05:00.000Z'
        }
    ];

    const mockAccountDetails = {
        acct_1001: {
            account_id: 'acct_1001',
            account_label: 'Acme Media',
            plan: {
                plan_code: 'growth',
                plan_name: 'Growth',
                subscription_status: 'active',
                trial_status: 'none',
                max_sites: 3,
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z',
                cancel_at_period_end: false
            },
            credits: {
                included_remaining: 125000,
                topup_remaining: 17600,
                total_remaining: 142600,
                reserved_credits: 800,
                last_run_debit: 1184,
                monthly_included: 150000,
                monthly_used: 25000
            },
            usage: {
                analyses_this_month: 28,
                credits_used_this_month: 25000,
                last_analysis_at: '2026-03-06T11:42:00.000Z',
                last_run_status: 'success_partial'
            },
            sites: [
                {
                    site_id: 'site_210',
                    blog_id: 7,
                    connected_domain: 'acmemedia.com',
                    binding_status: 'connected',
                    plugin_version: '1.0.8',
                    connected: true
                },
                {
                    site_id: 'site_211',
                    blog_id: 11,
                    connected_domain: 'insights.acmemedia.com',
                    binding_status: 'connected',
                    plugin_version: '1.0.8',
                    connected: true
                }
            ],
            billing_health: {
                recent_checkout_intents: [
                    {
                        intent_id: 'intent_sub_1',
                        intent_type: 'subscription',
                        plan_code: 'growth',
                        topup_pack_code: '',
                        status: 'created',
                        created_at: '2026-03-01T00:02:11.000Z',
                        updated_at: '2026-03-01T00:02:11.000Z'
                    }
                ],
                recent_subscriptions: [
                    {
                        subscription_id: 'sub_1',
                        provider_subscription_id: 'I-SUB123',
                        plan_code: 'growth',
                        status: 'active',
                        current_period_start: '2026-03-01T00:00:00.000Z',
                        current_period_end: '2026-04-01T00:00:00.000Z',
                        last_event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
                        updated_at: '2026-03-01T00:04:00.000Z'
                    }
                ],
                recent_topups: [
                    {
                        order_id: 'order_1',
                        provider_order_id: 'ORDER123',
                        pack_code: 'topup_25k',
                        credits: 25000,
                        status: 'credited',
                        grant_pending: false,
                        updated_at: '2026-03-04T09:22:00.000Z'
                    }
                ],
                recent_webhooks: [
                    {
                        event_id: 'wh_1',
                        provider_event_id: 'WH-EVENT-1',
                        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
                        verification_status: 'verified',
                        processed: false,
                        processed_at: '',
                        created_at: '2026-03-01T00:03:50.000Z',
                        reconciliation_summary: {
                            provider_subscription_id: 'I-SUB123'
                        },
                        error_summary: {
                            code: 'reconciliation_pending',
                            message: 'Provider event stored but reconciliation was not completed.'
                        }
                    }
                ]
            },
            credit_ledger_summary: {
                included_remaining: 125000,
                topup_remaining: 17600,
                reserved_credits: 800,
                last_run_debit: 1184,
                credits_used_this_month: 25000,
                recent_events: [
                    {
                        event_id: 'ledger_1',
                        event_type: 'settlement',
                        status: 'settled',
                        reason_code: 'analysis_run',
                        amounts: {
                            granted_credits: 0,
                            reserved_credits: 1184,
                            settled_credits: 1184,
                            refunded_credits: 0
                        },
                        created_at: '2026-03-06T11:42:00.000Z',
                        updated_at: '2026-03-06T11:42:00.000Z'
                    },
                    {
                        event_id: 'ledger_2',
                        event_type: 'adjustment',
                        status: 'settled',
                        reason_code: 'monthly_grant',
                        amounts: {
                            granted_credits: 150000,
                            reserved_credits: 0,
                            settled_credits: 0,
                            refunded_credits: 0
                        },
                        created_at: '2026-03-01T00:04:10.000Z',
                        updated_at: '2026-03-01T00:04:10.000Z'
                    }
                ]
            },
            audit: {
                source: 'authoritative_backend',
                actor_role: 'super_admin',
                auth_mode: 'preview',
                generated_at: '2026-03-06T12:05:00.000Z',
                recent_events: [
                    {
                        event_id: 'audit_1',
                        actor_id: 'bootstrap-admin',
                        actor_role: 'super_admin',
                        action: 'manual_credit_adjustment',
                        target_type: 'account',
                        target_id: 'acct_1001',
                        reason: 'Applied launch courtesy credits.',
                        status: 'completed',
                        created_at: '2026-03-05T16:10:00.000Z',
                        updated_at: '2026-03-05T16:10:00.000Z'
                    }
                ]
            }
        },
        acct_1002: {
            account_id: 'acct_1002',
            account_label: 'Northstar Commerce',
            plan: {
                plan_code: 'starter',
                plan_name: 'Starter',
                subscription_status: 'trial',
                trial_status: 'active',
                max_sites: 1,
                current_period_start: '',
                current_period_end: '',
                cancel_at_period_end: false
            },
            credits: {
                included_remaining: 12900,
                topup_remaining: 0,
                total_remaining: 12900,
                reserved_credits: 0,
                last_run_debit: 0,
                monthly_included: 15000,
                monthly_used: 2100
            },
            usage: {
                analyses_this_month: 3,
                credits_used_this_month: 2100,
                last_analysis_at: '2026-03-06T09:18:00.000Z',
                last_run_status: 'success'
            },
            sites: [
                {
                    site_id: 'site_305',
                    blog_id: 14,
                    connected_domain: 'northstar.shop',
                    binding_status: 'connected',
                    plugin_version: '1.0.8',
                    connected: true
                }
            ],
            billing_health: {
                recent_checkout_intents: [],
                recent_subscriptions: [],
                recent_topups: [],
                recent_webhooks: []
            },
            credit_ledger_summary: {
                included_remaining: 12900,
                topup_remaining: 0,
                reserved_credits: 0,
                last_run_debit: 0,
                credits_used_this_month: 2100,
                recent_events: []
            },
            audit: {
                source: 'preview_mode',
                actor_role: 'support_operator',
                auth_mode: 'preview',
                generated_at: '2026-03-06T12:05:00.000Z',
                recent_events: [
                    {
                        event_id: 'audit_2',
                        actor_id: 'support-operator',
                        actor_role: 'support_operator',
                        action: 'extend_trial',
                        target_type: 'account',
                        target_id: 'acct_1002',
                        reason: 'Extended trial after onboarding call.',
                        status: 'completed',
                        created_at: '2026-03-06T08:14:00.000Z',
                        updated_at: '2026-03-06T08:14:00.000Z'
                    }
                ]
            }
        },
        acct_1003: {
            account_id: 'acct_1003',
            account_label: 'Helix Health',
            plan: {
                plan_code: 'pro',
                plan_name: 'Pro',
                subscription_status: 'suspended',
                trial_status: 'none',
                max_sites: 10,
                current_period_start: '2026-03-01T00:00:00.000Z',
                current_period_end: '2026-04-01T00:00:00.000Z',
                cancel_at_period_end: false
            },
            credits: {
                included_remaining: 430000,
                topup_remaining: 78000,
                total_remaining: 508000,
                reserved_credits: 0,
                last_run_debit: 0,
                monthly_included: 450000,
                monthly_used: 20000
            },
            usage: {
                analyses_this_month: 21,
                credits_used_this_month: 20000,
                last_analysis_at: '2026-03-05T18:05:00.000Z',
                last_run_status: 'blocked'
            },
            sites: [
                {
                    site_id: 'site_411',
                    blog_id: 23,
                    connected_domain: 'helixhealth.io',
                    binding_status: 'connected',
                    plugin_version: '1.0.8',
                    connected: true
                }
            ],
            billing_health: {
                recent_checkout_intents: [],
                recent_subscriptions: [
                    {
                        subscription_id: 'sub_9',
                        provider_subscription_id: 'I-SUB999',
                        plan_code: 'pro',
                        status: 'suspended',
                        current_period_start: '2026-03-01T00:00:00.000Z',
                        current_period_end: '2026-04-01T00:00:00.000Z',
                        last_event_type: 'BILLING.SUBSCRIPTION.SUSPENDED',
                        updated_at: '2026-03-05T17:59:00.000Z'
                    }
                ],
                recent_topups: [],
                recent_webhooks: [
                    {
                        event_id: 'wh_44',
                        provider_event_id: 'WH-EVENT-44',
                        event_type: 'BILLING.SUBSCRIPTION.SUSPENDED',
                        verification_status: 'success',
                        processed: true,
                        processed_at: '2026-03-05T18:00:00.000Z',
                        created_at: '2026-03-05T17:59:50.000Z',
                        reconciliation_summary: {
                            provider_subscription_id: 'I-SUB999'
                        },
                        error_summary: null
                    }
                ]
            },
            credit_ledger_summary: {
                included_remaining: 430000,
                topup_remaining: 78000,
                reserved_credits: 0,
                last_run_debit: 0,
                credits_used_this_month: 20000,
                recent_events: []
            },
            audit: {
                source: 'preview_mode',
                actor_role: 'finance_operator',
                auth_mode: 'preview',
                generated_at: '2026-03-06T12:05:00.000Z',
                recent_events: [
                    {
                        event_id: 'audit_3',
                        actor_id: 'finance-operator',
                        actor_role: 'finance_operator',
                        action: 'account_pause',
                        target_type: 'account',
                        target_id: 'acct_1003',
                        reason: 'Paused during payment review.',
                        status: 'completed',
                        created_at: '2026-03-05T18:02:00.000Z',
                        updated_at: '2026-03-05T18:02:00.000Z'
                    }
                ]
            }
        }
    };

    window.AIVI_ADMIN_MOCK = {
        auth: {
            provider: 'AWS Cognito',
            mode: 'Hosted UI + PKCE',
            mfaRequired: true,
            allowedGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
        },
        operator: {
            name: 'Internal Operator',
            role: 'Super Admin',
            environment: 'Staging'
        },
        accounts: mockAccounts,
        accountDetails: mockAccountDetails
    };
})();
