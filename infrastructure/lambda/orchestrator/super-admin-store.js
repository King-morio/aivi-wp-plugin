const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const {
    DEFAULT_ACCOUNT_BILLING_STATE_TABLE,
    normalizeAccountBillingState
} = require('./billing-account-state');
const { DEFAULT_CREDIT_LEDGER_TABLE } = require('./credit-ledger');

const ddbClient = new DynamoDBClient({});
const defaultDdbDoc = DynamoDBDocumentClient.from(ddbClient);

const sanitizeString = (value) => String(value || '').trim();
const toInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : fallback;
};

const ensureTableName = (env, primaryKey, fallback = '') => {
    const direct = sanitizeString((env || process.env || {})[primaryKey]);
    if (direct) return direct;
    return sanitizeString(fallback);
};

const sortByTimestampDesc = (items = [], keys = ['updated_at', 'created_at']) => {
    return [...items].sort((left, right) => {
        const leftTs = Date.parse(keys.map((key) => left?.[key]).find(Boolean) || 0);
        const rightTs = Date.parse(keys.map((key) => right?.[key]).find(Boolean) || 0);
        return rightTs - leftTs;
    });
};

const scanAll = async ({ ddbDoc, tableName, limit = 25 }) => {
    const response = await ddbDoc.send(new ScanCommand({
        TableName: tableName,
        Limit: Math.max(limit * 4, 25)
    }));
    return Array.isArray(response?.Items) ? response.Items : [];
};

const createSuperAdminStore = ({ ddbDoc = defaultDdbDoc, env = process.env } = {}) => {
    const accountStateTable = ensureTableName(env, 'ACCOUNT_BILLING_STATE_TABLE', sanitizeString(env.BILLING_ACCOUNT_STATE_TABLE) || DEFAULT_ACCOUNT_BILLING_STATE_TABLE);
    const subscriptionsTable = ensureTableName(env, 'BILLING_SUBSCRIPTIONS_TABLE');
    const topupOrdersTable = ensureTableName(env, 'BILLING_TOPUP_ORDERS_TABLE');
    const checkoutIntentsTable = ensureTableName(env, 'BILLING_CHECKOUT_INTENTS_TABLE');
    const webhookEventsTable = ensureTableName(env, 'PAYPAL_WEBHOOK_EVENTS_TABLE');
    const creditLedgerTable = ensureTableName(env, 'CREDIT_LEDGER_TABLE', DEFAULT_CREDIT_LEDGER_TABLE);
    const runsTable = ensureTableName(env, 'RUNS_TABLE');

    return {
        async getAccountState(accountId) {
            const normalized = sanitizeString(accountId);
            if (!normalized) return null;
            const response = await ddbDoc.send(new GetCommand({
                TableName: accountStateTable,
                Key: { account_id: normalized }
            }));
            return response?.Item ? normalizeAccountBillingState(response.Item) : null;
        },

        async listAccountStates(filters = {}) {
            const items = (await scanAll({
                ddbDoc,
                tableName: accountStateTable,
                limit: toInt(filters.limit, 25)
            })).map((item) => normalizeAccountBillingState(item));

            const query = sanitizeString(filters.query).toLowerCase();
            const siteId = sanitizeString(filters.site_id);
            const planCode = sanitizeString(filters.plan_code).toLowerCase();
            const subscriptionStatus = sanitizeString(filters.subscription_status).toLowerCase();

            const filtered = items.filter((item) => {
                if (siteId && sanitizeString(item.site?.site_id) !== siteId) return false;
                if (planCode && sanitizeString(item.plan_code).toLowerCase() !== planCode) return false;
                if (subscriptionStatus && sanitizeString(item.subscription_status).toLowerCase() !== subscriptionStatus) return false;
                if (query) {
                    const haystack = [
                        item.account_id,
                        item.account_label,
                        item.site?.connected_domain,
                        item.site?.site_id
                    ].map((value) => sanitizeString(value).toLowerCase()).join(' ');
                    if (!haystack.includes(query)) return false;
                }
                return true;
            });

            return sortByTimestampDesc(filtered).slice(0, toInt(filters.limit, 25));
        },

        async listSubscriptionRecordsByAccount(accountId, limit = 10) {
            if (!subscriptionsTable) return [];
            const items = await scanAll({ ddbDoc, tableName: subscriptionsTable, limit: toInt(limit, 10) });
            return sortByTimestampDesc(items)
                .filter((item) => sanitizeString(item.account_id) === sanitizeString(accountId))
                .slice(0, toInt(limit, 10));
        },

        async listTopupOrdersByAccount(accountId, limit = 10) {
            if (!topupOrdersTable) return [];
            const items = await scanAll({ ddbDoc, tableName: topupOrdersTable, limit: toInt(limit, 10) });
            return sortByTimestampDesc(items)
                .filter((item) => sanitizeString(item.account_id) === sanitizeString(accountId))
                .slice(0, toInt(limit, 10));
        },

        async listCheckoutIntentsByAccount(accountId, limit = 10) {
            if (!checkoutIntentsTable) return [];
            const items = await scanAll({ ddbDoc, tableName: checkoutIntentsTable, limit: toInt(limit, 10) });
            return sortByTimestampDesc(items)
                .filter((item) => sanitizeString(item.account_id) === sanitizeString(accountId))
                .slice(0, toInt(limit, 10));
        },

        async listLedgerEventsByAccount(accountId, limit = 10) {
            if (!creditLedgerTable) return [];
            const items = await scanAll({ ddbDoc, tableName: creditLedgerTable, limit: toInt(limit, 10) });
            return sortByTimestampDesc(items)
                .filter((item) => sanitizeString(item.account_id) === sanitizeString(accountId))
                .slice(0, toInt(limit, 10));
        },

        async listRecentWebhookEvents(limit = 10) {
            if (!webhookEventsTable) return [];
            const items = await scanAll({ ddbDoc, tableName: webhookEventsTable, limit: toInt(limit, 10) });
            return sortByTimestampDesc(items).slice(0, toInt(limit, 10));
        },

        async findSiteBindingConflicts({ accountId, siteId, connectedDomain, limit = 10 } = {}) {
            const normalizedSiteId = sanitizeString(siteId);
            const normalizedDomain = sanitizeString(connectedDomain).toLowerCase();
            if (!normalizedSiteId && !normalizedDomain) return [];

            const items = (await scanAll({
                ddbDoc,
                tableName: accountStateTable,
                limit: toInt(limit, 10)
            })).map((item) => normalizeAccountBillingState(item));

            return sortByTimestampDesc(items)
                .filter((item) => sanitizeString(item.account_id) !== sanitizeString(accountId))
                .filter((item) => {
                    const itemSiteId = sanitizeString(item.site?.site_id);
                    const itemDomain = sanitizeString(item.site?.connected_domain).toLowerCase();
                    return (normalizedSiteId && itemSiteId === normalizedSiteId)
                        || (normalizedDomain && itemDomain && itemDomain === normalizedDomain);
                })
                .slice(0, toInt(limit, 10));
        },

        async listRunIssuesBySite(siteId, limit = 10) {
            const normalizedSiteId = sanitizeString(siteId);
            if (!runsTable || !normalizedSiteId) return [];
            const failingStatuses = ['failed', 'failed_schema', 'failed_too_long', 'aborted'];
            const items = await scanAll({ ddbDoc, tableName: runsTable, limit: toInt(limit, 10) });
            return sortByTimestampDesc(items)
                .filter((item) => sanitizeString(item.site_id) === normalizedSiteId)
                .filter((item) => failingStatuses.includes(sanitizeString(item.status).toLowerCase()))
                .slice(0, toInt(limit, 10));
        }
    };
};

module.exports = {
    createSuperAdminStore
};
