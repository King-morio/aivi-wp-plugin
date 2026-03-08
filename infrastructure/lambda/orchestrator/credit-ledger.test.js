const mockDdbDoc = { send: jest.fn() };

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => mockDdbDoc)
    },
    PutCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const {
    DEFAULT_CREDIT_LEDGER_TABLE,
    buildIdempotencyKey,
    buildLedgerEvent,
    createReservationEvent,
    createSettlementEvent,
    createRefundEvent,
    createAdjustmentEvent,
    persistLedgerEvent
} = require('./credit-ledger');

describe('credit-ledger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CREDIT_LEDGER_TABLE = 'test-credit-ledger';
        mockDdbDoc.send.mockResolvedValue({});
    });

    test('builds deterministic idempotency keys', () => {
        const key = buildIdempotencyKey({
            account_id: 'acct_1',
            site_id: 'site_1',
            run_id: 'run_1',
            event_type: 'reservation',
            reason_code: 'analysis_admission',
            external_ref: 'attempt_1'
        });

        expect(key).toBe('acct_1:site_1:run_1:reservation:analysis_admission:attempt_1');
    });

    test('creates reservation events with pending status and no usage snapshot', () => {
        const event = createReservationEvent({
            account_id: 'acct_1',
            site_id: 'site_1',
            run_id: 'run_1',
            reason_code: 'analysis_admission',
            amounts: {
                reserved_credits: 1500,
                balance_before: 60000,
                balance_after: 58500
            }
        }, {
            now: () => '2026-03-06T10:00:00.000Z',
            eventIdFactory: () => 'evt-reservation-1'
        });

        expect(event.event_id).toBe('evt-reservation-1');
        expect(event.event_type).toBe('reservation');
        expect(event.status).toBe('pending');
        expect(event.usage_snapshot).toBeNull();
        expect(event.amounts.reserved_credits).toBe(1500);
        expect(event.created_at).toBe('2026-03-06T10:00:00.000Z');
    });

    test('creates settlement events with usage snapshot intact', () => {
        const event = createSettlementEvent({
            account_id: 'acct_1',
            site_id: 'site_1',
            run_id: 'run_1',
            reason_code: 'analysis_completed',
            pricing_snapshot: {
                pricing_version: 'mistral-public-2026-03-06',
                requested_model: 'mistral-large-latest',
                billable_model: 'mistral-large-2512',
                rate_source: 'catalog',
                input_rate_usd_per_million: 0.5,
                output_rate_usd_per_million: 1.5,
                credit_multiplier: 30000
            },
            usage_snapshot: {
                input_tokens: 42000,
                output_tokens: 10000,
                weighted_tokens: 72000,
                raw_cost_micros: 36000,
                raw_cost_usd: 0.036,
                credits_used: 1080
            },
            amounts: {
                reserved_credits: 1500,
                settled_credits: 1080,
                refunded_credits: 420,
                balance_before: 60000,
                balance_after: 58920
            }
        }, {
            eventIdFactory: () => 'evt-settlement-1'
        });

        expect(event.event_type).toBe('settlement');
        expect(event.status).toBe('settled');
        expect(event.usage_snapshot.credits_used).toBe(1080);
        expect(event.amounts.refunded_credits).toBe(420);
    });

    test('creates refund and adjustment events with correct statuses', () => {
        const refund = createRefundEvent({
            account_id: 'acct_1',
            site_id: 'site_1',
            reason_code: 'analysis_failed'
        }, { eventIdFactory: () => 'evt-refund-1' });
        const adjustment = createAdjustmentEvent({
            account_id: 'acct_1',
            site_id: 'site_1',
            reason_code: 'manual_credit_grant'
        }, { eventIdFactory: () => 'evt-adjustment-1' });

        expect(refund.status).toBe('refunded');
        expect(refund.event_type).toBe('refund');
        expect(adjustment.status).toBe('settled');
        expect(adjustment.event_type).toBe('adjustment');
    });

    test('persistLedgerEvent writes canonical event to configured table', async () => {
        const payload = {
            account_id: 'acct_1',
            site_id: 'site_1',
            run_id: 'run_1',
            event_type: 'reservation',
            reason_code: 'analysis_admission',
            amounts: {
                reserved_credits: 900
            }
        };

        const event = await persistLedgerEvent(payload, {
            now: () => '2026-03-06T11:00:00.000Z',
            eventIdFactory: () => 'evt-persist-1'
        });

        expect(event.event_id).toBe('evt-persist-1');
        expect(PutCommand).toHaveBeenCalledTimes(1);
        expect(PutCommand).toHaveBeenCalledWith(expect.objectContaining({
            TableName: 'test-credit-ledger',
            ConditionExpression: 'attribute_not_exists(event_id)',
            Item: expect.objectContaining({
                event_id: 'evt-persist-1',
                event_type: 'reservation',
                status: 'pending'
            })
        }));
        expect(mockDdbDoc.send).toHaveBeenCalledTimes(1);
    });

    test('falls back to default table name when env is missing', async () => {
        delete process.env.CREDIT_LEDGER_TABLE;

        await persistLedgerEvent({
            account_id: 'acct_1',
            site_id: 'site_1',
            event_type: 'adjustment',
            reason_code: 'manual_credit_grant'
        }, {
            eventIdFactory: () => 'evt-default-table'
        });

        expect(PutCommand).toHaveBeenCalledWith(expect.objectContaining({
            TableName: DEFAULT_CREDIT_LEDGER_TABLE
        }));
    });

    test('buildLedgerEvent normalizes invalid numeric fields instead of passing through garbage', () => {
        const event = buildLedgerEvent({
            account_id: 'acct_1',
            site_id: 'site_1',
            event_type: 'settlement',
            reason_code: 'analysis_completed',
            pricing_snapshot: {
                input_rate_usd_per_million: 0.5,
                output_rate_usd_per_million: 1.5,
                credit_multiplier: 'bad-value'
            },
            usage_snapshot: {
                input_tokens: -5,
                output_tokens: 'oops',
                weighted_tokens: null,
                raw_cost_micros: -100,
                raw_cost_usd: '0.0',
                credits_used: undefined
            },
            amounts: {
                reserved_credits: -1,
                settled_credits: 'not-a-number',
                refunded_credits: 12.9,
                balance_before: '',
                balance_after: '300'
            }
        }, {
            eventIdFactory: () => 'evt-normalize-1'
        });

        expect(event.pricing_snapshot.credit_multiplier).toBe(0);
        expect(event.usage_snapshot.input_tokens).toBe(0);
        expect(event.usage_snapshot.output_tokens).toBe(0);
        expect(event.usage_snapshot.raw_cost_micros).toBe(0);
        expect(event.amounts.refunded_credits).toBe(12);
        expect(event.amounts.balance_before).toBeNull();
        expect(event.amounts.balance_after).toBe(300);
    });
});
