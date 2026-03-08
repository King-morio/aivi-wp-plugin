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
    computeTotalRemaining
} = require('./billing-account-state');

describe('billing-account-state', () => {
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

        expect(result.granted_cycle_credits).toBe(150000);
        expect(result.state).toMatchObject({
            plan_code: 'growth',
            subscription_status: 'active',
            credits: {
                included_remaining: 150000,
                monthly_included: 150000,
                monthly_used: 0
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
});
