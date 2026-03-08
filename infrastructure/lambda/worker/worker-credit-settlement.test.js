global.Request = global.Request || function Request() {};
global.Response = global.Response || function Response() {};
global.Headers = global.Headers || function Headers() {};
global.fetch = global.fetch || jest.fn();

const mockBuildUsageSettlementPreview = jest.fn();
jest.mock('../shared/credit-pricing', () => ({
    buildUsageSettlementPreview: (...args) => mockBuildUsageSettlementPreview(...args)
}));

const mockCreateSettlementEvent = jest.fn((payload) => ({
    ...payload,
    event_id: 'settlement-event-1'
}));
const mockCreateRefundEvent = jest.fn((payload) => ({
    ...payload,
    event_id: 'refund-event-1'
}));
const mockPersistLedgerEvent = jest.fn((payload) => Promise.resolve(payload));

jest.mock('../shared/credit-ledger', () => ({
    createSettlementEvent: (...args) => mockCreateSettlementEvent(...args),
    createRefundEvent: (...args) => mockCreateRefundEvent(...args),
    persistLedgerEvent: (...args) => mockPersistLedgerEvent(...args)
}));

const mockGetAccountState = jest.fn();
const mockPutAccountState = jest.fn();
const mockApplyLedgerEventToState = jest.fn((state) => state);
jest.mock('../shared/billing-account-state', () => ({
    createAccountBillingStateStore: jest.fn(() => ({
        getAccountState: mockGetAccountState,
        putAccountState: mockPutAccountState
    })),
    applyLedgerEventToState: (...args) => mockApplyLedgerEventToState(...args)
}));

const {
    __testHooks: {
        normalizeCreditReservation,
        finalizeCreditSettlement
    }
} = require('./index');

describe('worker credit settlement helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MISTRAL_MODEL = 'mistral-large-latest';
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_1',
            credits: {
                included_remaining: 5000,
                topup_remaining: 0,
                reserved_credits: 900,
                monthly_used: 0,
                last_run_debit: 0,
                total_remaining: 5000
            }
        });
        mockPutAccountState.mockResolvedValue(undefined);
    });

    test('normalizes reservation payload into canonical shape', () => {
        const normalized = normalizeCreditReservation({
            reservationStatus: 'reserved',
            eventId: 'reservation-1',
            idempotencyKey: 'acct_1:site_1:run_1:reservation',
            accountId: 'acct_1',
            siteId: 'site_1',
            reservedCredits: 900,
            balanceBefore: 5000,
            balanceAfter: 4100,
            tokenEstimate: 3200,
            pricingSnapshot: {
                requested_model: 'mistral-large-latest'
            },
            createdAt: '2026-03-06T14:00:00.000Z'
        });

        expect(normalized).toEqual(expect.objectContaining({
            reservation_status: 'reserved',
            event_id: 'reservation-1',
            idempotency_key: 'acct_1:site_1:run_1:reservation',
            account_id: 'acct_1',
            site_id: 'site_1',
            reserved_credits: 900,
            balance_before: 5000,
            balance_after: 4100,
            token_estimate: 3200,
            created_at: '2026-03-06T14:00:00.000Z'
        }));
    });

    test('refunds full reservation for failed runs', async () => {
        mockPersistLedgerEvent.mockImplementation(async (payload) => payload);

        const result = await finalizeCreditSettlement({
            runId: 'run-1',
            siteId: 'site_1',
            finalStatus: 'failed',
            reservation: {
                reservation_status: 'reserved',
                account_id: 'acct_1',
                site_id: 'site_1',
                reserved_credits: 900,
                balance_before: 5000,
                balance_after: 4100,
                pricing_snapshot: {
                    requested_model: 'mistral-large-latest'
                }
            },
            usage: {
                input_tokens: 0,
                output_tokens: 0
            }
        });

        expect(mockCreateRefundEvent).toHaveBeenCalledWith(expect.objectContaining({
            account_id: 'acct_1',
            site_id: 'site_1',
            run_id: 'run-1',
            reason_code: 'analysis_failed',
            external_ref: 'failed',
            amounts: expect.objectContaining({
                reserved_credits: 900,
                refunded_credits: 900,
                balance_before: 4100,
                balance_after: 5000
            })
        }));
        expect(result).toEqual({
            billing_status: 'refunded',
            credits_used: 0,
            reserved_credits: 900,
            refunded_credits: 900,
            previous_balance: 4100,
            current_balance: 5000
        });
        expect(mockApplyLedgerEventToState).toHaveBeenCalledTimes(1);
        expect(mockPutAccountState).toHaveBeenCalledTimes(1);
    });

    test('settles successful runs against actual token usage', async () => {
        mockBuildUsageSettlementPreview.mockReturnValue({
            pricing_snapshot: {
                pricing_version: 'mistral-public-2026-03-06',
                requested_model: 'mistral-large-latest',
                billable_model: 'mistral-large-2512',
                credit_multiplier: 30000
            },
            usage_snapshot: {
                input_tokens: 42000,
                output_tokens: 10000,
                weighted_tokens: 72000,
                raw_cost_micros: 36000,
                raw_cost_usd: 0.036,
                credits_used: 1080
            }
        });
        mockPersistLedgerEvent.mockImplementation(async (payload) => payload);

        const result = await finalizeCreditSettlement({
            runId: 'run-2',
            siteId: 'site_1',
            finalStatus: 'success',
            reservation: {
                reservation_status: 'reserved',
                account_id: 'acct_1',
                site_id: 'site_1',
                reserved_credits: 1500,
                balance_before: 5000,
                balance_after: 3500,
                pricing_snapshot: {
                    requested_model: 'mistral-large-latest',
                    credit_multiplier: 30000
                }
            },
            usage: {
                input_tokens: 42000,
                output_tokens: 10000
            },
            model: 'mistral-large-latest'
        });

        expect(mockBuildUsageSettlementPreview).toHaveBeenCalledWith({
            model: 'mistral-large-latest',
            usage: {
                input_tokens: 42000,
                output_tokens: 10000
            },
            creditMultiplier: 30000
        });
        expect(mockCreateSettlementEvent).toHaveBeenCalledWith(expect.objectContaining({
            account_id: 'acct_1',
            site_id: 'site_1',
            run_id: 'run-2',
            reason_code: 'analysis_completed',
            external_ref: 'success',
            pricing_snapshot: expect.objectContaining({
                billable_model: 'mistral-large-2512'
            }),
            usage_snapshot: expect.objectContaining({
                credits_used: 1080
            }),
            amounts: expect.objectContaining({
                reserved_credits: 1500,
                settled_credits: 1080,
                refunded_credits: 420,
                balance_before: 5000,
                balance_after: 3920
            })
        }));
        expect(result).toEqual({
            billing_status: 'settled',
            credits_used: 1080,
            reserved_credits: 1500,
            refunded_credits: 420,
            previous_balance: 5000,
            current_balance: 3920,
            billable_model: 'mistral-large-2512'
        });
        expect(mockApplyLedgerEventToState).toHaveBeenCalledTimes(1);
        expect(mockPutAccountState).toHaveBeenCalledTimes(1);
    });

    test('marks zero-charge partial runs when no billable usage is returned', async () => {
        mockBuildUsageSettlementPreview.mockReturnValue({
            pricing_snapshot: {
                pricing_version: 'mistral-public-2026-03-06',
                requested_model: 'mistral-large-latest',
                billable_model: 'mistral-large-2512',
                credit_multiplier: 30000
            },
            usage_snapshot: {
                input_tokens: 0,
                output_tokens: 0,
                weighted_tokens: 0,
                raw_cost_micros: 0,
                raw_cost_usd: 0,
                credits_used: 0
            }
        });
        mockPersistLedgerEvent.mockImplementation(async (payload) => payload);

        const result = await finalizeCreditSettlement({
            runId: 'run-3',
            siteId: 'site_1',
            finalStatus: 'success_partial',
            reservation: {
                reservation_status: 'reserved',
                account_id: 'acct_1',
                site_id: 'site_1',
                reserved_credits: 900,
                balance_before: 5000,
                balance_after: 4100,
                pricing_snapshot: {
                    requested_model: 'mistral-large-latest',
                    credit_multiplier: 30000
                }
            },
            usage: {
                input_tokens: 0,
                output_tokens: 0
            }
        });

        expect(result).toEqual({
            billing_status: 'zero_charge',
            credits_used: 0,
            reserved_credits: 900,
            refunded_credits: 900,
            previous_balance: 5000,
            current_balance: 5000,
            billable_model: 'mistral-large-2512'
        });
    });
});
