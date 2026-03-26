const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const defaultDdbDoc = DynamoDBDocumentClient.from(ddbClient);

const sanitizeString = (value) => String(value || '').trim();
const toIso = (value = new Date()) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

const ensureTableName = (env = process.env) => {
    const tableName = sanitizeString(env.ADMIN_AUDIT_LOG_TABLE || env.AIVI_ADMIN_AUDIT_LOG_TABLE);
    if (!tableName) {
        const error = new Error('ADMIN_AUDIT_LOG_TABLE is not configured.');
        error.code = 'admin_audit_not_configured';
        error.statusCode = 503;
        throw error;
    }
    return tableName;
};

const buildAuditIdempotencyKey = ({
    account_id,
    operator_id,
    action,
    target_id,
    idempotency_key
} = {}) => sanitizeString(idempotency_key) || [
    sanitizeString(account_id) || 'unknown-account',
    sanitizeString(operator_id) || 'unknown-operator',
    sanitizeString(action) || 'action',
    sanitizeString(target_id) || 'target'
].join(':');

const buildAuditEventId = (idempotencyKey) => `audit_${crypto.createHash('sha1').update(sanitizeString(idempotencyKey) || 'aivi-admin-audit').digest('hex')}`;

const buildAdminAuditEvent = (payload = {}) => {
    const idempotencyKey = buildAuditIdempotencyKey(payload);
    return {
        event_id: sanitizeString(payload.event_id) || buildAuditEventId(idempotencyKey),
        idempotency_key: idempotencyKey,
        actor_id: sanitizeString(payload.actor_id),
        actor_email: sanitizeString(payload.actor_email),
        actor_role: sanitizeString(payload.actor_role),
        action: sanitizeString(payload.action),
        target_type: sanitizeString(payload.target_type || 'account'),
        target_id: sanitizeString(payload.target_id || payload.account_id),
        account_id: sanitizeString(payload.account_id),
        site_id: sanitizeString(payload.site_id),
        reason: sanitizeString(payload.reason),
        status: sanitizeString(payload.status || 'accepted'),
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        created_at: sanitizeString(payload.created_at) || toIso(),
        updated_at: sanitizeString(payload.updated_at) || toIso()
    };
};

const sortByUpdatedAtDesc = (items = []) => [...items].sort((left, right) => {
    const leftTs = Date.parse(left?.updated_at || left?.created_at || 0);
    const rightTs = Date.parse(right?.updated_at || right?.created_at || 0);
    return rightTs - leftTs;
});

const createSuperAdminAuditStore = ({ ddbDoc = defaultDdbDoc, env = process.env } = {}) => {
    const tableName = ensureTableName(env);

    return {
        async putAuditEvent(payload) {
            const item = buildAdminAuditEvent(payload);
            try {
                await ddbDoc.send(new PutCommand({
                    TableName: tableName,
                    Item: item,
                    ConditionExpression: 'attribute_not_exists(event_id)'
                }));
                return { duplicate: false, item };
            } catch (error) {
                if (sanitizeString(error?.name) === 'ConditionalCheckFailedException') {
                    return { duplicate: true, item };
                }
                throw error;
            }
        },

        async markAuditEventCompleted(eventId, patch = {}) {
            await ddbDoc.send(new UpdateCommand({
                TableName: tableName,
                Key: { event_id: sanitizeString(eventId) },
                UpdateExpression: 'SET #status = :status, updated_at = :updatedAt, metadata = :metadata',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': sanitizeString(patch.status || 'completed'),
                    ':updatedAt': sanitizeString(patch.updated_at) || toIso(),
                    ':metadata': patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : {}
                }
            }));
        },

        async listAuditEventsByAccount(accountId, limit = 10) {
            const response = await ddbDoc.send(new ScanCommand({
                TableName: tableName,
                Limit: Math.max(limit * 4, 25)
            }));
            const items = Array.isArray(response?.Items) ? response.Items : [];
            return sortByUpdatedAtDesc(items)
                .filter((item) => sanitizeString(item.account_id) === sanitizeString(accountId))
                .slice(0, Math.max(1, Math.trunc(limit)));
        },

        async listRecentAuditEvents({ limit = 10, action = '', status = '' } = {}) {
            const response = await ddbDoc.send(new ScanCommand({
                TableName: tableName,
                Limit: Math.max(Number(limit || 10) * 4, 25)
            }));
            const items = Array.isArray(response?.Items) ? response.Items : [];
            return sortByUpdatedAtDesc(items)
                .filter((item) => !sanitizeString(action) || sanitizeString(item.action) === sanitizeString(action))
                .filter((item) => !sanitizeString(status) || sanitizeString(item.status) === sanitizeString(status))
                .slice(0, Math.max(1, Math.trunc(Number(limit) || 10)));
        }
    };
};

module.exports = {
    buildAuditEventId,
    buildAuditIdempotencyKey,
    buildAdminAuditEvent,
    createSuperAdminAuditStore
};
