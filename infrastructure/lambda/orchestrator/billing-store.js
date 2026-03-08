const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const defaultDdbDoc = DynamoDBDocumentClient.from(ddbClient);

const sanitizeString = (value) => String(value || '').trim();
const toIso = (value = new Date()) => (value instanceof Date ? value : new Date(value)).toISOString();

const getEnv = (env, key) => sanitizeString((env || process.env || {})[key]);

const createStoreError = (message, code = 'billing_store_error', statusCode = 500) => {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    return error;
};

const ensureTable = (env, key) => {
    const tableName = getEnv(env, key);
    if (!tableName) {
        throw createStoreError(`${key} is not configured.`, 'billing_store_not_configured', 503);
    }
    return tableName;
};

const isConditionalFailure = (error) => {
    const name = sanitizeString(error?.name);
    return name === 'ConditionalCheckFailedException';
};

const createBillingStore = ({ ddbDoc = defaultDdbDoc, env = process.env } = {}) => {
    const getCheckoutIntentTable = () => ensureTable(env, 'BILLING_CHECKOUT_INTENTS_TABLE');
    const getWebhookEventsTable = () => ensureTable(env, 'PAYPAL_WEBHOOK_EVENTS_TABLE');
    const getSubscriptionsTable = () => ensureTable(env, 'BILLING_SUBSCRIPTIONS_TABLE');
    const getTopupOrdersTable = () => ensureTable(env, 'BILLING_TOPUP_ORDERS_TABLE');

    return {
        async putCheckoutIntent(intent) {
            const tableName = getCheckoutIntentTable();
            const item = {
                ...intent,
                created_at: sanitizeString(intent.created_at) || toIso(),
                updated_at: sanitizeString(intent.updated_at) || toIso()
            };

            await ddbDoc.send(new PutCommand({
                TableName: tableName,
                Item: item
            }));

            return item;
        },

        async updateCheckoutIntent(lookupKey, update = {}) {
            const tableName = getCheckoutIntentTable();
            const existing = await this.getCheckoutIntent(lookupKey);
            if (!existing) {
                return null;
            }

            const item = {
                ...existing,
                ...update,
                lookup_key: sanitizeString(existing.lookup_key || lookupKey),
                created_at: sanitizeString(existing.created_at) || toIso(),
                updated_at: sanitizeString(update.updated_at) || toIso()
            };

            await ddbDoc.send(new PutCommand({
                TableName: tableName,
                Item: item
            }));

            return item;
        },

        async getCheckoutIntent(lookupKey) {
            const tableName = getCheckoutIntentTable();
            const response = await ddbDoc.send(new GetCommand({
                TableName: tableName,
                Key: {
                    lookup_key: sanitizeString(lookupKey)
                }
            }));
            return response?.Item || null;
        },

        async getTopupOrderRecord(orderId) {
            const tableName = getTopupOrdersTable();
            const response = await ddbDoc.send(new GetCommand({
                TableName: tableName,
                Key: {
                    order_id: sanitizeString(orderId)
                }
            }));
            return response?.Item || null;
        },

        async putWebhookEvent(eventRecord) {
            const tableName = getWebhookEventsTable();
            const item = {
                ...eventRecord,
                created_at: sanitizeString(eventRecord.created_at) || toIso(),
                processed: !!eventRecord.processed,
                processed_at: sanitizeString(eventRecord.processed_at),
                verification_status: sanitizeString(eventRecord.verification_status),
                reconciliation_summary: eventRecord.reconciliation_summary || null,
                error_summary: eventRecord.error_summary || null
            };

            try {
                await ddbDoc.send(new PutCommand({
                    TableName: tableName,
                    Item: item,
                    ConditionExpression: 'attribute_not_exists(event_id)'
                }));
                return { duplicate: false, item };
            } catch (error) {
                if (isConditionalFailure(error)) {
                    return { duplicate: true, item: null };
                }
                throw error;
            }
        },

        async getWebhookEvent(eventId) {
            const tableName = getWebhookEventsTable();
            const response = await ddbDoc.send(new GetCommand({
                TableName: tableName,
                Key: {
                    event_id: sanitizeString(eventId)
                }
            }));
            return response?.Item || null;
        },

        async markWebhookProcessed(eventId, update = {}) {
            const tableName = getWebhookEventsTable();
            const processedAt = sanitizeString(update.processed_at) || toIso();
            const verificationStatus = sanitizeString(update.verification_status || '');
            const reconciliationSummary = update.reconciliation_summary || null;

            await ddbDoc.send(new UpdateCommand({
                TableName: tableName,
                Key: {
                    event_id: sanitizeString(eventId)
                },
                UpdateExpression: 'SET processed = :processed, processed_at = :processedAt, verification_status = :verificationStatus, reconciliation_summary = :reconciliationSummary, error_summary = :errorSummary',
                ExpressionAttributeValues: {
                    ':processed': true,
                    ':processedAt': processedAt,
                    ':verificationStatus': verificationStatus || null,
                    ':reconciliationSummary': reconciliationSummary,
                    ':errorSummary': null
                }
            }));
        },

        async markWebhookFailed(eventId, update = {}) {
            const tableName = getWebhookEventsTable();
            await ddbDoc.send(new UpdateCommand({
                TableName: tableName,
                Key: {
                    event_id: sanitizeString(eventId)
                },
                UpdateExpression: 'SET processed = :processed, processed_at = :processedAt, verification_status = :verificationStatus, reconciliation_summary = :reconciliationSummary, error_summary = :errorSummary',
                ExpressionAttributeValues: {
                    ':processed': false,
                    ':processedAt': sanitizeString(update.processed_at) || toIso(),
                    ':verificationStatus': sanitizeString(update.verification_status || '') || null,
                    ':reconciliationSummary': update.reconciliation_summary || null,
                    ':errorSummary': update.error_summary || null
                }
            }));
        },

        async upsertSubscriptionRecord(record) {
            const tableName = getSubscriptionsTable();
            const item = {
                ...record,
                created_at: sanitizeString(record.created_at) || toIso(),
                updated_at: sanitizeString(record.updated_at) || toIso()
            };

            await ddbDoc.send(new PutCommand({
                TableName: tableName,
                Item: item
            }));

            return item;
        },

        async upsertTopupOrderRecord(record) {
            const tableName = getTopupOrdersTable();
            const item = {
                ...record,
                created_at: sanitizeString(record.created_at) || toIso(),
                updated_at: sanitizeString(record.updated_at) || toIso()
            };

            await ddbDoc.send(new PutCommand({
                TableName: tableName,
                Item: item
            }));

            return item;
        }
    };
};

module.exports = {
    createBillingStore
};
