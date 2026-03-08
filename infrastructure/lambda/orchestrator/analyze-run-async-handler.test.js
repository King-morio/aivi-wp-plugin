const mockDdbDoc = { send: jest.fn() };
const mockSqs = { send: jest.fn() };
const mockS3 = { send: jest.fn() };

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => mockDdbDoc)
    },
    GetCommand: jest.fn((input) => ({ input })),
    PutCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

jest.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: jest.fn(() => mockSqs),
    SendMessageCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => mockS3),
    PutObjectCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'run-test-123')
}));

const mockReservationPreview = jest.fn();
jest.mock('./credit-pricing', () => ({
    buildReservationPreview: (...args) => mockReservationPreview(...args)
}));

const mockCreateReservationEvent = jest.fn((payload) => ({ ...payload, event_id: 'reservation-event-1' }));
const mockPersistLedgerEvent = jest.fn();
jest.mock('./credit-ledger', () => ({
    createReservationEvent: (...args) => mockCreateReservationEvent(...args),
    persistLedgerEvent: (...args) => mockPersistLedgerEvent(...args)
}));

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { analyzeRunAsyncHandler } = require('./analyze-run-async-handler');

describe('analyze-run-async-handler credit admission', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RUNS_TABLE = 'test-runs';
        process.env.ARTIFACTS_BUCKET = 'test-bucket';
        process.env.TASKS_QUEUE_URL = 'https://example.com/test-queue';
        process.env.MISTRAL_MODEL = 'mistral-large-latest';

        mockDdbDoc.send.mockResolvedValue({});
        mockSqs.send.mockResolvedValue({});
        mockS3.send.mockResolvedValue({});
        mockPersistLedgerEvent.mockResolvedValue({
            event_id: 'reservation-event-1',
            idempotency_key: 'acct_1:site_1:run-test-123:reservation:analysis_admission:v1',
            pricing_snapshot: {
                pricing_version: 'mistral-public-2026-03-06',
                billable_model: 'mistral-large-2512',
                credit_multiplier: 30000
            },
            amounts: {
                balance_before: 5000,
                balance_after: 4100
            },
            created_at: '2026-03-06T12:00:00.000Z'
        });
        mockReservationPreview.mockReturnValue({
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
                input_tokens: 30000,
                output_tokens: 3500,
                weighted_tokens: 40500,
                raw_cost_micros: 30000,
                raw_cost_usd: 0.03,
                credits_used: 900
            }
        });
    });

    function buildEvent(overrides = {}) {
        return {
            body: JSON.stringify({
                manifest: {
                    title: 'Test article',
                    content_html: '<p>Hello world</p>',
                    plain_text: 'Hello world'
                },
                token_estimate: 3200,
                run_metadata: {
                    site_id: 'site_1',
                    user_id: 'user_1',
                    content_type: 'article',
                    source: 'editor-sidebar',
                    prompt_version: 'v1',
                    ...(overrides.run_metadata || {})
                },
                ...overrides.body
            })
        };
    }

    test('skips reservation and queues normally for disconnected/local mode', async () => {
        const response = await analyzeRunAsyncHandler(buildEvent({
            run_metadata: {
                account_state: {
                    connected: false,
                    connection_status: 'disconnected'
                }
            }
        }));

        expect(response.statusCode).toBe(202);
        expect(mockPersistLedgerEvent).not.toHaveBeenCalled();
        expect(PutObjectCommand).toHaveBeenCalledTimes(1);
        expect(PutCommand).toHaveBeenCalledWith(expect.objectContaining({
            TableName: 'test-runs',
            Item: expect.objectContaining({
                run_id: 'run-test-123',
                credit_reservation: null
            })
        }));
        expect(SendMessageCommand).toHaveBeenCalledTimes(1);
    });

    test('blocks admission when connected account has insufficient credits', async () => {
        const response = await analyzeRunAsyncHandler(buildEvent({
            run_metadata: {
                account_state: {
                    connected: true,
                    connection_status: 'connected',
                    account_id: 'acct_1',
                    plan_name: 'Starter',
                    credits: {
                        included_remaining: 300,
                        topup_remaining: 0
                    },
                    entitlements: {
                        analysis_allowed: true
                    }
                }
            }
        }));

        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(402);
        expect(body.error).toBe('insufficient_credits');
        expect(mockPersistLedgerEvent).not.toHaveBeenCalled();
        expect(PutObjectCommand).not.toHaveBeenCalled();
        expect(SendMessageCommand).not.toHaveBeenCalled();
    });

    test('persists reservation metadata on admitted connected runs', async () => {
        const response = await analyzeRunAsyncHandler(buildEvent({
            run_metadata: {
                account_state: {
                    connected: true,
                    connection_status: 'connected',
                    account_id: 'acct_1',
                    plan_name: 'Growth',
                    credits: {
                        included_remaining: 5000,
                        topup_remaining: 0
                    },
                    entitlements: {
                        analysis_allowed: true
                    }
                }
            }
        }));

        expect(response.statusCode).toBe(202);
        expect(mockCreateReservationEvent).toHaveBeenCalledTimes(1);
        expect(mockPersistLedgerEvent).toHaveBeenCalledTimes(1);
        expect(PutCommand).toHaveBeenCalledWith(expect.objectContaining({
            TableName: 'test-runs',
            Item: expect.objectContaining({
                credit_reservation: expect.objectContaining({
                    reservation_status: 'reserved',
                    event_id: 'reservation-event-1',
                    reserved_credits: 900,
                    token_estimate: 3200
                })
            })
        }));
        expect(SendMessageCommand).toHaveBeenCalledTimes(1);
    });

    test('blocks admission when analysis entitlement is disabled even before balance check', async () => {
        const response = await analyzeRunAsyncHandler(buildEvent({
            run_metadata: {
                account_state: {
                    connected: true,
                    connection_status: 'connected',
                    account_id: 'acct_1',
                    entitlements: {
                        analysis_allowed: false
                    }
                }
            }
        }));

        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(402);
        expect(body.error).toBe('analysis_not_allowed');
        expect(mockReservationPreview).not.toHaveBeenCalled();
        expect(mockPersistLedgerEvent).not.toHaveBeenCalled();
    });
});
