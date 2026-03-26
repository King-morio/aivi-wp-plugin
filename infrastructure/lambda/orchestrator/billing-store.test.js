jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({ send: jest.fn() }))
    },
    GetCommand: jest.fn((input) => ({ input })),
    PutCommand: jest.fn((input) => ({ input })),
    UpdateCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

const { createBillingStore } = require('./billing-store');

describe('billing-store webhook marker updates', () => {
    test('aliases the reserved processed attribute when marking a webhook as processed', async () => {
        const send = jest.fn().mockResolvedValue({});
        const store = createBillingStore({
            ddbDoc: { send },
            env: {
                PAYPAL_WEBHOOK_EVENTS_TABLE: 'paypal-webhook-events-dev'
            }
        });

        await store.markWebhookProcessed('wh_123', {
            processed_at: '2026-03-22T10:00:00.000Z',
            verification_status: 'verified',
            reconciliation_summary: { resource_type: 'subscription' }
        });

        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            input: expect.objectContaining({
                TableName: 'paypal-webhook-events-dev',
                UpdateExpression: 'SET #processed = :processed, processed_at = :processedAt, verification_status = :verificationStatus, reconciliation_summary = :reconciliationSummary, error_summary = :errorSummary',
                ExpressionAttributeNames: {
                    '#processed': 'processed'
                },
                ExpressionAttributeValues: expect.objectContaining({
                    ':processed': true,
                    ':verificationStatus': 'verified'
                })
            })
        }));
    });

    test('aliases the reserved processed attribute when marking a webhook as failed', async () => {
        const send = jest.fn().mockResolvedValue({});
        const store = createBillingStore({
            ddbDoc: { send },
            env: {
                PAYPAL_WEBHOOK_EVENTS_TABLE: 'paypal-webhook-events-dev'
            }
        });

        await store.markWebhookFailed('wh_456', {
            processed_at: '2026-03-22T10:05:00.000Z',
            verification_status: 'verified',
            error_summary: { code: 'marker_sync_failed' }
        });

        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            input: expect.objectContaining({
                TableName: 'paypal-webhook-events-dev',
                UpdateExpression: 'SET #processed = :processed, processed_at = :processedAt, verification_status = :verificationStatus, reconciliation_summary = :reconciliationSummary, error_summary = :errorSummary',
                ExpressionAttributeNames: {
                    '#processed': 'processed'
                },
                ExpressionAttributeValues: expect.objectContaining({
                    ':processed': false,
                    ':verificationStatus': 'verified',
                    ':errorSummary': { code: 'marker_sync_failed' }
                })
            })
        }));
    });
});
