(function () {
    const mockAccounts = [
        {
            account_id: 'acct_1001',
            account_label: 'Acme Media',
            contact_email: 'ops@acmemedia.com',
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
            contact_email: 'founder@northstar.shop',
            plan_code: 'starter',
            plan_name: 'Starter',
            subscription_status: 'trial',
            trial_status: 'active',
            credits_remaining: 2900,
            site_count: 1,
            connected_domain: 'northstar.shop',
            updated_at: '2026-03-06T09:18:00.000Z'
        },
        {
            account_id: 'acct_1003',
            account_label: 'Helix Health',
            contact_email: 'billing@helixhealth.io',
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
            contact_email: 'ops@acmemedia.com',
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
                included_remaining: 17000,
                topup_remaining: 17600,
                total_remaining: 34600,
                reserved_credits: 800,
                last_run_debit: 1184,
                monthly_included: 100000,
                monthly_used: 83000
            },
            usage: {
                analyses_this_month: 94,
                credits_used_this_month: 83000,
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
                            granted_credits: 100000,
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
            contact_email: 'founder@northstar.shop',
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
                included_remaining: 2900,
                topup_remaining: 0,
                total_remaining: 2900,
                reserved_credits: 0,
                last_run_debit: 0,
                monthly_included: 5000,
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
            contact_email: 'billing@helixhealth.io',
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
                included_remaining: 230000,
                topup_remaining: 78000,
                total_remaining: 308000,
                reserved_credits: 0,
                last_run_debit: 0,
                monthly_included: 250000,
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
                included_remaining: 230000,
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

    const mockFinancialOverview = {
        financials_version: 'v1',
        generated_at: '2026-03-16T18:00:00.000Z',
        currency: 'USD',
        snapshot: {
            total_accounts: 3,
            paid_accounts: 1,
            active_trials: 1,
            suspended_paid_accounts: 1
        },
        projected_recurring: {
            mrr_usd: 22,
            active_paid_accounts: 1
        },
        observed_checkout_revenue: {
            last_7d_usd: 36,
            last_30d_usd: 36,
            last_365d_usd: 36,
            counted_events: 2
        },
        plan_mix: [
            {
                plan_code: 'growth',
                plan_label: 'Growth',
                active_accounts: 1,
                projected_mrr_usd: 22,
                share_of_paid_accounts: 100
            }
        ],
        recent_monetized_events: [
            {
                event_kind: 'subscription_checkout',
                account_id: 'acct_1001',
                account_label: 'Acme Media',
                summary: 'Growth subscription checkout',
                amount_usd: 11,
                observed_at: '2026-03-01T00:02:11.000Z'
            },
            {
                event_kind: 'topup_purchase',
                account_id: 'acct_1001',
                account_label: 'Acme Media',
                summary: 'Top-up 25k purchase',
                amount_usd: 25,
                observed_at: '2026-03-04T09:22:00.000Z'
            }
        ],
        watchlist: {
            suspended_paid_accounts: 1,
            near_trial_expiry_accounts: 1,
            low_credit_paid_accounts: 0,
            high_usage_paid_accounts: 1,
            payment_failure_accounts: 0,
            items: [
                {
                    key: 'suspended_paid_accounts',
                    label: 'Suspended paid accounts',
                    count: 1,
                    description: 'One paid account is paused for finance review and likely needs follow-up before the next billing cycle.'
                },
                {
                    key: 'near_trial_expiry_accounts',
                    label: 'Trials expiring soon',
                    count: 1,
                    description: 'One active free-trial account is close enough to expiry to deserve conversion follow-up.'
                },
                {
                    key: 'payment_failure_accounts',
                    label: 'Payment failures detected',
                    count: 0,
                    description: 'No failed recurring payment events are recorded in preview data right now.'
                }
            ]
        },
        operator_views: {
            payment_failures: [],
            recent_credit_adjustments: [
                {
                    event_id: 'audit_adj_preview_1',
                    account_id: 'acct_1001',
                    account_label: 'Acme Media',
                    actor_email: 'finance@example.com',
                    actor_role: 'finance_operator',
                    reason: 'Courtesy launch credit top-up',
                    status: 'completed',
                    credits_delta: 5000,
                    created_at: '2026-03-06T10:30:00.000Z',
                    updated_at: '2026-03-06T10:35:00.000Z'
                }
            ],
            watch_accounts: {
                active_trials: [
                    {
                        account_id: 'acct_1002',
                        account_label: 'Northstar Commerce',
                        plan_code: 'starter',
                        plan_label: 'Starter',
                        subscription_status: 'trial',
                        trial_status: 'active',
                        credits_remaining: 2900,
                        connected_domain: 'northstar.shop',
                        updated_at: '2026-03-06T09:18:00.000Z',
                        trial_expires_at: '2026-03-17T09:00:00.000Z'
                    }
                ],
                suspended_paid: [
                    {
                        account_id: 'acct_1003',
                        account_label: 'Helix Health',
                        plan_code: 'pro',
                        plan_label: 'Pro',
                        subscription_status: 'suspended',
                        trial_status: 'none',
                        credits_remaining: 508000,
                        connected_domain: 'helixhealth.io',
                        updated_at: '2026-03-05T18:05:00.000Z'
                    }
                ],
                near_trial_expiry: [
                    {
                        account_id: 'acct_1002',
                        account_label: 'Northstar Commerce',
                        plan_code: 'starter',
                        plan_label: 'Starter',
                        subscription_status: 'trial',
                        trial_status: 'active',
                        credits_remaining: 2900,
                        connected_domain: 'northstar.shop',
                        updated_at: '2026-03-06T09:18:00.000Z',
                        trial_expires_at: '2026-03-17T09:00:00.000Z'
                    }
                ],
                low_credit_paid: [],
                high_usage_paid: [
                    {
                        account_id: 'acct_1001',
                        account_label: 'Acme Media',
                        plan_code: 'growth',
                        plan_label: 'Growth',
                        subscription_status: 'active',
                        trial_status: 'none',
                        credits_remaining: 34600,
                        connected_domain: 'acmemedia.com',
                        updated_at: '2026-03-06T11:42:00.000Z',
                        monthly_included: 100000,
                        credits_used_this_month: 83000,
                        usage_ratio: 83.0
                    }
                ]
            }
        },
        truth_boundary: {
            projected_recurring_scope: 'Projected MRR is derived from currently active paid subscriptions priced against the plan catalog.',
            observed_revenue_scope: 'Observed checkout revenue counts stored subscription checkouts and captured top-up purchases only.',
            recurring_renewals_included: false,
            plan_change_collections_included: false
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
        financialOverview: mockFinancialOverview,
        accounts: mockAccounts,
        accountDetails: mockAccountDetails
    };
})();
