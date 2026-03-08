const mockAssertSuperAdminAccess = jest.fn();
const mockAssertPermission = jest.fn();
const mockGetAccountState = jest.fn();
const mockListSubscriptionRecordsByAccount = jest.fn();
const mockListTopupOrdersByAccount = jest.fn();
const mockListCheckoutIntentsByAccount = jest.fn();
const mockListRecentWebhookEvents = jest.fn();
const mockListRunIssuesBySite = jest.fn();
const mockFindSiteBindingConflicts = jest.fn();
const mockGetCheckoutIntent = jest.fn();
const mockGetWebhookEvent = jest.fn();
const mockMarkWebhookProcessed = jest.fn();
const mockPutAuditEvent = jest.fn();
const mockMarkAuditEventCompleted = jest.fn();
const mockProcessVerifiedPayPalWebhook = jest.fn();

jest.mock('./super-admin-auth', () => ({
    assertSuperAdminAccess: (...args) => mockAssertSuperAdminAccess(...args),
    assertPermission: (...args) => mockAssertPermission(...args)
}));

jest.mock('./super-admin-store', () => ({
    createSuperAdminStore: () => ({
        getAccountState: (...args) => mockGetAccountState(...args),
        listSubscriptionRecordsByAccount: (...args) => mockListSubscriptionRecordsByAccount(...args),
        listTopupOrdersByAccount: (...args) => mockListTopupOrdersByAccount(...args),
        listCheckoutIntentsByAccount: (...args) => mockListCheckoutIntentsByAccount(...args),
        listRecentWebhookEvents: (...args) => mockListRecentWebhookEvents(...args),
        listRunIssuesBySite: (...args) => mockListRunIssuesBySite(...args),
        findSiteBindingConflicts: (...args) => mockFindSiteBindingConflicts(...args)
    })
}));

jest.mock('./billing-store', () => ({
    createBillingStore: () => ({
        getCheckoutIntent: (...args) => mockGetCheckoutIntent(...args),
        getWebhookEvent: (...args) => mockGetWebhookEvent(...args),
        markWebhookProcessed: (...args) => mockMarkWebhookProcessed(...args)
    })
}));

jest.mock('./super-admin-audit-store', () => ({
    createSuperAdminAuditStore: () => ({
        putAuditEvent: (...args) => mockPutAuditEvent(...args),
        markAuditEventCompleted: (...args) => mockMarkAuditEventCompleted(...args)
    })
}));

jest.mock('./paypal-webhook-processing', () => ({
    processVerifiedPayPalWebhook: (...args) => mockProcessVerifiedPayPalWebhook(...args)
}));

jest.mock('../shared/billing-account-state', () => ({
    createAccountBillingStateStore: jest.fn(() => ({})),
    computeTotalRemaining: jest.fn((state) => state?.credits?.total_remaining || 0)
}));

const { superAdminDiagnosticsHandler } = require('./super-admin-diagnostics-handler');

const baseState = {
    account_id: 'acct_123',
    plan_code: 'growth',
    subscription_status: 'active',
    trial_status: 'none',
    credits: {
        total_remaining: 12000
    },
    entitlements: {
        analysis_allowed: true,
        site_limit_reached: false
    },
    site: {
        site_id: 'site_123',
        connected_domain: 'example.com'
    }
};

const buildGetEvent = (queryStringParameters = {}) => ({
    requestContext: {
        requestId: 'req_123',
        http: {
            method: 'GET',
            path: '/aivi/v1/admin/accounts/acct_123/diagnostics'
        }
    },
    routeKey: 'GET /aivi/v1/admin/accounts/{account_id}/diagnostics',
    pathParameters: {
        account_id: 'acct_123'
    },
    queryStringParameters,
    headers: {
        'x-aivi-admin-token': 'bootstrap-token'
    }
});

const buildRecoveryEvent = (body, actorRole = 'support_operator') => ({
    requestContext: {
        requestId: 'req_456',
        http: {
            method: 'POST',
            path: '/aivi/v1/admin/accounts/acct_123/diagnostics/recovery'
        }
    },
    routeKey: 'POST /aivi/v1/admin/accounts/{account_id}/diagnostics/recovery',
    pathParameters: {
        account_id: 'acct_123'
    },
    headers: {
        'x-aivi-admin-token': 'bootstrap-token'
    },
    body: JSON.stringify(body),
    __actorRole: actorRole
});

describe('superAdminDiagnosticsHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAssertSuperAdminAccess.mockImplementation((event) => ({
            actorId: 'operator_1',
            actorEmail: 'ops@example.com',
            actorRole: event.__actorRole || 'super_admin',
            permissions: ['accounts.read', 'billing.read', 'billing.reconcile', 'webhooks.read', 'webhooks.replay', 'audit.read'],
            authMode: 'bootstrap_token'
        }));
        mockAssertPermission.mockImplementation(() => undefined);
        mockGetAccountState.mockResolvedValue(baseState);
        mockListSubscriptionRecordsByAccount.mockResolvedValue([{
            provider_subscription_id: 'I-SUB123',
            status: 'active'
        }]);
        mockListTopupOrdersByAccount.mockResolvedValue([]);
        mockListCheckoutIntentsByAccount.mockResolvedValue([{
            intent_id: 'intent_123',
            lookup_key: 'subscription#I-SUB123',
            intent_type: 'subscription',
            status: 'created'
        }]);
        mockListRecentWebhookEvents.mockResolvedValue([{
            event_id: 'wh_123',
            provider_event_id: 'WH-123',
            event_type: 'BILLING.SUBSCRIPTION.UPDATED',
            verification_status: 'verified',
            processed: false,
            raw_event: {
                resource: {
                    id: 'I-SUB123'
                }
            },
            reconciliation_summary: {
                provider_subscription_id: 'I-SUB123'
            },
            created_at: '2026-03-07T10:00:00.000Z'
        }]);
        mockListRunIssuesBySite.mockResolvedValue([{
            run_id: 'run_123',
            status: 'failed_schema',
            site_id: 'site_123',
            created_at: '2026-03-07T10:10:00.000Z',
            updated_at: '2026-03-07T10:10:05.000Z',
            source: 'editor-sidebar'
        }]);
        mockFindSiteBindingConflicts.mockResolvedValue([{
            account_id: 'acct_456',
            account_label: 'Conflict Media',
            site: {
                site_id: 'site_123',
                connected_domain: 'example.com'
            },
            subscription_status: 'active',
            updated_at: '2026-03-07T10:05:00.000Z'
        }]);
        mockGetCheckoutIntent.mockResolvedValue({
            intent_id: 'intent_123',
            lookup_key: 'subscription#I-SUB123',
            intent_type: 'subscription',
            status: 'created'
        });
        mockPutAuditEvent.mockResolvedValue({
            duplicate: false,
            item: { event_id: 'audit_123' }
        });
        mockMarkAuditEventCompleted.mockResolvedValue({});
        mockGetWebhookEvent.mockResolvedValue({
            event_id: 'wh_123',
            verification_status: 'verified',
            processed: false,
            raw_event: {
                id: 'WH-123',
                event_type: 'BILLING.SUBSCRIPTION.UPDATED',
                resource: { id: 'I-SUB123' }
            }
        });
        mockMarkWebhookProcessed.mockResolvedValue({});
        mockProcessVerifiedPayPalWebhook.mockResolvedValue({
            resourceType: 'subscription',
            reconciliationSummary: {
                provider_subscription_id: 'I-SUB123'
            }
        });
        console.log = jest.fn();
    });

    test('returns diagnostics summary with webhook health, run issues, and conflicts', async () => {
        const response = await superAdminDiagnosticsHandler(buildGetEvent({
            provider_subscription_id: 'I-SUB123'
        }));

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.ok).toBe(true);
        expect(body.item).toMatchObject({
            account_id: 'acct_123',
            webhook_health: {
                replay_eligible_count: 0
            },
            checkout_lookup: {
                lookup_key: 'subscription#I-SUB123'
            },
            recent_failures: {
                run_issues: [
                    expect.objectContaining({
                        run_id: 'run_123',
                        status: 'failed_schema'
                    })
                ]
            },
            site_binding_conflicts: [
                expect.objectContaining({
                    account_id: 'acct_456'
                })
            ]
        });
        expect(body.item.webhook_delivery_history[0]).toMatchObject({
            processed: true,
            processing_state: 'reconciled',
            replay_eligible: false
        });
        expect(JSON.stringify(body.item)).not.toContain('raw_event');
    });

    test('replays an eligible stored webhook through the recovery route and audits the action', async () => {
        mockListSubscriptionRecordsByAccount.mockResolvedValue([]);
        const response = await superAdminDiagnosticsHandler(buildRecoveryEvent({
            action: 'replay_failed_webhook',
            reason: 'Retry after reconciliation fix.',
            webhook_event_id: 'wh_123',
            idempotency_key: 'idem_123'
        }));

        expect(response.statusCode).toBe(200);
        expect(mockProcessVerifiedPayPalWebhook).toHaveBeenCalled();
        expect(mockMarkWebhookProcessed).toHaveBeenCalledWith('wh_123', expect.objectContaining({
            verification_status: 'verified'
        }));
        expect(mockMarkAuditEventCompleted).toHaveBeenCalledWith('audit_123', expect.objectContaining({
            status: 'completed'
        }));
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            action: 'replay_failed_webhook',
            effect: {
                webhook_event_id: 'wh_123',
                resource_type: 'subscription'
            }
        });
    });

    test('forbids replay recovery for finance operators', async () => {
        mockListSubscriptionRecordsByAccount.mockResolvedValue([]);
        const response = await superAdminDiagnosticsHandler(buildRecoveryEvent({
            action: 'replay_failed_webhook',
            reason: 'Retry replay.',
            webhook_event_id: 'wh_123'
        }, 'finance_operator'));

        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'admin_recovery_forbidden'
        });
        expect(mockPutAuditEvent).not.toHaveBeenCalled();
    });
});
