const mockAssertSuperAdminAccess = jest.fn();
const mockAssertPermission = jest.fn();
const mockPutAuditEvent = jest.fn();
const mockMarkAuditEventCompleted = jest.fn();
const mockGetAccountState = jest.fn();
const mockPutAccountState = jest.fn();
const mockCreateAdjustmentEvent = jest.fn((payload) => ({ ...payload, event_type: 'adjustment' }));
const mockPersistLedgerEvent = jest.fn();
const mockNormalizeAccountBillingState = jest.fn((state) => state);
const mockBuildRemoteAccountPayload = jest.fn((state) => ({ account_state: state }));
const mockApplyLedgerEventToState = jest.fn();
const mockComputeTotalRemaining = jest.fn((state) => state?.credits?.total_remaining ?? 0);
const mockGetPlanDefinition = jest.fn((code) => {
    if (code === 'free_trial') return { code: 'free_trial', label: 'Free Trial', included_credits: 5000, site_limit: 1, duration_days: 7 };
    if (code === 'starter') return { code: 'starter', label: 'Starter', site_limit: 1 };
    if (code === 'growth') return { code: 'growth', label: 'Growth', site_limit: 3 };
    if (code === 'pro') return { code: 'pro', label: 'Pro', site_limit: 10 };
    return null;
});
const mockIssueConnectionToken = jest.fn();
const mockGetPayPalConfig = jest.fn(() => ({
    apiBase: 'https://api-m.sandbox.paypal.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    returnUrl: 'https://example.com/paypal/return',
    cancelUrl: 'https://example.com/paypal/cancel'
}));
const mockGetSubscriptionDetails = jest.fn();

jest.mock('./super-admin-auth', () => ({
    assertSuperAdminAccess: (...args) => mockAssertSuperAdminAccess(...args),
    assertPermission: (...args) => mockAssertPermission(...args)
}));

jest.mock('./super-admin-audit-store', () => ({
    createSuperAdminAuditStore: () => ({
        putAuditEvent: (...args) => mockPutAuditEvent(...args),
        markAuditEventCompleted: (...args) => mockMarkAuditEventCompleted(...args)
    })
}));

jest.mock('./billing-account-state', () => ({
    createAccountBillingStateStore: () => ({
        getAccountState: (...args) => mockGetAccountState(...args),
        putAccountState: (...args) => mockPutAccountState(...args)
    }),
    normalizeAccountBillingState: (...args) => mockNormalizeAccountBillingState(...args),
    buildRemoteAccountPayload: (...args) => mockBuildRemoteAccountPayload(...args),
    applyLedgerEventToState: (...args) => mockApplyLedgerEventToState(...args),
    computeTotalRemaining: (...args) => mockComputeTotalRemaining(...args),
    getPlanDefinition: (...args) => mockGetPlanDefinition(...args)
}));

jest.mock('./credit-ledger', () => ({
    createAdjustmentEvent: (...args) => mockCreateAdjustmentEvent(...args),
    persistLedgerEvent: (...args) => mockPersistLedgerEvent(...args)
}));

jest.mock('./connection-token', () => ({
    issueConnectionToken: (...args) => mockIssueConnectionToken(...args)
}));

jest.mock('./paypal-config', () => ({
    getPayPalConfig: (...args) => mockGetPayPalConfig(...args)
}));

jest.mock('./paypal-client', () => ({
    getSubscriptionDetails: (...args) => mockGetSubscriptionDetails(...args)
}));

const { superAdminMutationHandler } = require('./super-admin-mutation-handler');

const buildEvent = (overrides = {}) => ({
    requestContext: {
        requestId: 'req_123',
        http: {
            method: 'POST',
            path: '/aivi/v1/admin/accounts/acct_123/actions'
        }
    },
    routeKey: 'POST /aivi/v1/admin/accounts/{account_id}/actions',
    pathParameters: {
        account_id: 'acct_123'
    },
    body: JSON.stringify({
        action: 'manual_credit_adjustment',
        credits_delta: 5000,
        reason: 'Support grant',
        idempotency_key: 'idem_123'
    }),
    ...overrides
});

describe('superAdminMutationHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockAssertSuperAdminAccess.mockReturnValue({
            actorId: 'operator_1',
            actorEmail: 'ops@example.com',
            actorRole: 'super_admin',
            permissions: ['accounts.write', 'sites.write', 'credits.adjust', 'billing.reconcile'],
            authMode: 'bootstrap_token'
        });
        mockAssertPermission.mockImplementation(() => undefined);

        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'starter',
            plan_name: 'Starter',
            subscription_status: 'active',
            trial_status: 'none',
            trial_expires_at: null,
            credits: {
                total_remaining: 12000,
                included_remaining: 12000,
                topup_remaining: 0
            },
            entitlements: {
                max_sites: 1,
                analysis_allowed: true
            },
            site: {
                site_id: 'site_123'
            },
            sites: [
                {
                    site_id: 'site_123',
                    connected_domain: 'example.com',
                    binding_status: 'connected'
                }
            ],
            site_binding_status: 'connected'
        });
        mockPutAuditEvent.mockResolvedValue({
            duplicate: false,
            item: {
                event_id: 'audit_123'
            }
        });
        mockCreateAdjustmentEvent.mockImplementation((payload) => ({
            ...payload,
            event_id: 'ledger_123',
            event_type: 'adjustment',
            amounts: payload.amounts
        }));
        mockPersistLedgerEvent.mockResolvedValue({
            event_id: 'ledger_123',
            amounts: {
                granted_credits: 5000,
                settled_credits: 0,
                refunded_credits: 0,
                reserved_credits: 0
            }
        });
        mockApplyLedgerEventToState.mockReturnValue({
            account_id: 'acct_123',
            plan_code: 'starter',
            plan_name: 'Starter',
            subscription_status: 'active',
            trial_status: 'none',
            trial_expires_at: null,
            credits: {
                total_remaining: 17000,
                included_remaining: 12000,
                topup_remaining: 5000
            },
            entitlements: {
                max_sites: 1,
                analysis_allowed: true
            },
            site: {
                site_id: 'site_123'
            },
            site_binding_status: 'connected'
        });
        mockPutAccountState.mockResolvedValue({});
        mockMarkAuditEventCompleted.mockResolvedValue({});
        mockIssueConnectionToken.mockResolvedValue({
            token: 'issued.connection.token',
            expires_at: '2026-03-24T00:00:00.000Z'
        });
        mockGetSubscriptionDetails.mockResolvedValue({
            providerSubscriptionId: 'I-SUB123',
            status: 'APPROVAL_PENDING',
            statusUpdateTime: '2026-03-24T00:00:00.000Z'
        });
    });

    test('applies manual credit adjustment, updates state, and completes audit event', async () => {
        const response = await superAdminMutationHandler(buildEvent());

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toMatchObject({
            ok: true,
            action: 'manual_credit_adjustment',
            audit_event_id: 'audit_123',
            effect: {
                credits_delta: 5000,
                ledger_event_id: 'ledger_123'
            }
        });
        expect(mockPersistLedgerEvent).toHaveBeenCalled();
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            account_id: 'acct_123'
        }));
        expect(mockMarkAuditEventCompleted).toHaveBeenCalledWith('audit_123', expect.objectContaining({
            status: 'completed'
        }));
    });

    test('rejects forbidden admin actions for the current operator role', async () => {
        mockAssertSuperAdminAccess.mockReturnValue({
            actorId: 'operator_2',
            actorEmail: 'support@example.com',
            actorRole: 'support_operator',
            authMode: 'bootstrap_token'
        });

        const response = await superAdminMutationHandler(buildEvent());

        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'admin_action_forbidden'
        });
        expect(mockPutAuditEvent).not.toHaveBeenCalled();
        expect(mockPutAccountState).not.toHaveBeenCalled();
    });

    test('returns duplicate without mutating account state when the audit event already exists', async () => {
        mockPutAuditEvent.mockResolvedValue({
            duplicate: true,
            item: {
                event_id: 'audit_duplicate'
            }
        });

        const response = await superAdminMutationHandler(buildEvent());

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            duplicate: true,
            action: 'manual_credit_adjustment',
            audit_event_id: 'audit_duplicate'
        });
        expect(mockPersistLedgerEvent).not.toHaveBeenCalled();
        expect(mockPutAccountState).not.toHaveBeenCalled();
    });

    test('marks the audit event failed when a credit deduction exceeds the current balance', async () => {
        const response = await superAdminMutationHandler(buildEvent({
            body: JSON.stringify({
                action: 'manual_credit_adjustment',
                credits_delta: -13000,
                reason: 'Recovery correction',
                idempotency_key: 'idem_456'
            })
        }));

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'insufficient_credits_for_adjustment'
        });
        expect(mockMarkAuditEventCompleted).toHaveBeenCalledWith('audit_123', expect.objectContaining({
            status: 'failed'
        }));
        expect(mockPutAccountState).not.toHaveBeenCalled();
    });

    test('extend_trial defaults to the canonical seven-day trial window', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

        try {
            const response = await superAdminMutationHandler(buildEvent({
                body: JSON.stringify({
                    action: 'extend_trial',
                    reason: 'Support extension after onboarding issue.'
                })
            }));

            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body)).toMatchObject({
                ok: true,
                action: 'extend_trial',
                effect: {
                    trial_status: 'active',
                    trial_expires_at: '2026-03-23T00:00:00.000Z'
                }
            });
            expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
                trial_status: 'active',
                trial_expires_at: '2026-03-23T00:00:00.000Z'
            }));
        } finally {
            jest.useRealTimers();
        }
    });

    test('site_unbind clears all bound sites and records the unbound count', async () => {
        const response = await superAdminMutationHandler(buildEvent({
            body: JSON.stringify({
                action: 'site_unbind',
                reason: 'Detach stale site ownership before reconnect.'
            })
        }));

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toMatchObject({
            ok: true,
            action: 'site_unbind',
            effect: {
                site_binding_status: 'unbound',
                unbound_site_count: 1
            }
        });
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            connected: false,
            site_binding_status: 'unbound',
            sites: []
        }));
    });

    test('issue_connection_token returns a token payload with the expected operator guidance fields', async () => {
        const response = await superAdminMutationHandler(buildEvent({
            body: JSON.stringify({
                action: 'issue_connection_token',
                reason: 'Prepare reconnect for second Growth site.',
                connection_label: 'Growth second site',
                connection_days: 5
            })
        }));

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            action: 'issue_connection_token',
            effect: {
                connection_token: 'issued.connection.token',
                expires_at: '2026-03-24T00:00:00.000Z',
                max_sites: 1
            }
        });
        expect(mockIssueConnectionToken).toHaveBeenCalledWith(expect.objectContaining({
            accountId: 'acct_123',
            accountLabel: 'Growth second site',
            expiresInDays: 5,
            siteLimit: 1
        }));
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            account_id: 'acct_123',
            latest_connection_token: expect.objectContaining({
                token: 'issued.connection.token',
                expires_at: '2026-03-24T00:00:00.000Z'
            })
        }));
    });

    test('subscription_resync clears stale trial activation holds when PayPal reports a terminal status', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                max_sites: 1,
                analysis_allowed: true
            },
            site: {
                site_id: 'site_123'
            },
            subscription: {
                provider_subscription_id: 'I-SUB123',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });
        mockGetSubscriptionDetails.mockResolvedValue({
            providerSubscriptionId: 'I-SUB123',
            status: 'CANCELLED',
            statusUpdateTime: '2026-03-24T00:00:00.000Z'
        });

        const response = await superAdminMutationHandler(buildEvent({
            body: JSON.stringify({
                action: 'subscription_resync',
                reason: 'Recheck PayPal activation after cancellation.'
            })
        }));

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            action: 'subscription_resync',
            effect: {
                resync_requested: true,
                reconciled: true,
                recovery: 'retry_ready',
                provider_status: 'cancelled',
                subscription_status: 'trial'
            }
        });
        expect(mockGetSubscriptionDetails).toHaveBeenCalledWith(expect.objectContaining({
            providerSubscriptionId: 'I-SUB123'
        }));
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            subscription_status: 'trial',
            subscription: expect.objectContaining({
                provider_subscription_id: '',
                last_event_type: 'ADMIN.RECOVERY.CANCELLED'
            })
        }));
    });

    test('clear_activation_hold manually clears stale created trial holds', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                max_sites: 1,
                analysis_allowed: true
            },
            site: {
                site_id: 'site_123'
            },
            subscription: {
                provider_subscription_id: 'I-SUB123',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });

        const response = await superAdminMutationHandler(buildEvent({
            body: JSON.stringify({
                action: 'clear_activation_hold',
                reason: 'Clear stale activation hold after failed checkout.'
            })
        }));

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            action: 'clear_activation_hold',
            effect: {
                activation_hold_cleared: true,
                subscription_status: 'trial'
            }
        });
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            subscription_status: 'trial',
            subscription: expect.objectContaining({
                provider_subscription_id: '',
                last_event_type: 'ADMIN.RECOVERY.CLEAR_ACTIVATION_HOLD'
            })
        }));
    });

    test('end_trial rejects stale activation holds and directs operators to recovery actions', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                max_sites: 1,
                analysis_allowed: true
            },
            site: {
                site_id: 'site_123'
            },
            subscription: {
                provider_subscription_id: 'I-SUB123',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });

        const response = await superAdminMutationHandler(buildEvent({
            body: JSON.stringify({
                action: 'end_trial',
                reason: 'Attempted manual cleanup on a stale activation hold.'
            })
        }));

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'activation_hold_requires_recovery_action'
        });
        expect(mockPutAccountState).not.toHaveBeenCalled();
    });
});
