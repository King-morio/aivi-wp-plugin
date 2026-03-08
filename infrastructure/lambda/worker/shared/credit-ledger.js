const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);

const DEFAULT_CREDIT_LEDGER_TABLE = 'aivi-credit-ledger-dev';

const normalizeNonNegativeInt = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
};

const normalizeNullableInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
};

const normalizeIsoTimestamp = (value) => {
    const parsed = value ? new Date(value) : new Date();
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString();
    }
    return parsed.toISOString();
};

const getEnv = (key, fallback = undefined) => process.env[key] || fallback;

const defaultStatusForEventType = (eventType) => {
    switch (String(eventType || '').toLowerCase()) {
        case 'reservation':
            return 'pending';
        case 'settlement':
            return 'settled';
        case 'refund':
            return 'refunded';
        case 'adjustment':
            return 'settled';
        default:
            return 'pending';
    }
};

const buildIdempotencyKey = ({
    account_id,
    site_id,
    run_id,
    event_type,
    reason_code,
    external_ref
} = {}) => {
    return [
        String(account_id || '').trim() || 'unknown-account',
        String(site_id || '').trim() || 'unknown-site',
        String(run_id || '').trim() || 'no-run',
        String(event_type || '').trim() || 'event',
        String(reason_code || '').trim() || 'default',
        String(external_ref || '').trim() || 'v1'
    ].join(':');
};

const buildDeterministicEventId = (idempotencyKey) => {
    const normalized = String(idempotencyKey || '').trim() || 'aivi-ledger-event';
    return `ledger_${crypto.createHash('sha1').update(normalized).digest('hex')}`;
};

const createLedgerDependencies = (overrides = {}) => ({
    ddbDoc: overrides.ddbDoc || ddbDoc,
    tableName: overrides.tableName || getEnv('CREDIT_LEDGER_TABLE', DEFAULT_CREDIT_LEDGER_TABLE),
    now: typeof overrides.now === 'function' ? overrides.now : (() => new Date().toISOString()),
    eventIdFactory: typeof overrides.eventIdFactory === 'function' ? overrides.eventIdFactory : ((idempotencyKey) => buildDeterministicEventId(idempotencyKey))
});

const normalizePricingSnapshot = (pricing = {}) => ({
    pricing_version: String(pricing.pricing_version || '').trim(),
    requested_model: String(pricing.requested_model || '').trim(),
    billable_model: String(pricing.billable_model || '').trim(),
    rate_source: String(pricing.rate_source || '').trim(),
    input_rate_usd_per_million: Number(pricing.input_rate_usd_per_million || 0),
    output_rate_usd_per_million: Number(pricing.output_rate_usd_per_million || 0),
    credit_multiplier: normalizeNonNegativeInt(pricing.credit_multiplier),
    context_window: normalizeNullableInt(pricing.context_window)
});

const normalizeUsageSnapshot = (usage) => {
    if (!usage || typeof usage !== 'object') return null;
    return {
        input_tokens: normalizeNonNegativeInt(usage.input_tokens),
        output_tokens: normalizeNonNegativeInt(usage.output_tokens),
        weighted_tokens: normalizeNonNegativeInt(usage.weighted_tokens),
        raw_cost_micros: normalizeNonNegativeInt(usage.raw_cost_micros),
        raw_cost_usd: Number(usage.raw_cost_usd || 0),
        credits_used: normalizeNonNegativeInt(usage.credits_used)
    };
};

const normalizeAmounts = (amounts = {}) => ({
    granted_credits: normalizeNonNegativeInt(amounts.granted_credits),
    reserved_credits: normalizeNonNegativeInt(amounts.reserved_credits),
    settled_credits: normalizeNonNegativeInt(amounts.settled_credits),
    refunded_credits: normalizeNonNegativeInt(amounts.refunded_credits),
    balance_before: normalizeNullableInt(amounts.balance_before),
    balance_after: normalizeNullableInt(amounts.balance_after)
});

const buildLedgerEvent = (payload = {}, options = {}) => {
    const dependencies = createLedgerDependencies(options);
    const eventType = String(payload.event_type || '').trim().toLowerCase();
    const timestamp = normalizeIsoTimestamp(payload.created_at || dependencies.now());
    const updatedAt = normalizeIsoTimestamp(payload.updated_at || timestamp);
    const idempotencyKey = String(payload.idempotency_key || '').trim() || buildIdempotencyKey(payload);

    return {
        event_id: String(payload.event_id || '').trim() || dependencies.eventIdFactory(idempotencyKey),
        idempotency_key: idempotencyKey,
        account_id: String(payload.account_id || '').trim(),
        site_id: String(payload.site_id || '').trim(),
        run_id: payload.run_id ? String(payload.run_id).trim() : null,
        event_type: eventType,
        status: String(payload.status || '').trim() || defaultStatusForEventType(eventType),
        reason_code: String(payload.reason_code || '').trim() || 'unspecified',
        pricing_snapshot: normalizePricingSnapshot(payload.pricing_snapshot || {}),
        usage_snapshot: normalizeUsageSnapshot(payload.usage_snapshot),
        amounts: normalizeAmounts(payload.amounts || {}),
        created_at: timestamp,
        updated_at: updatedAt
    };
};

const createReservationEvent = (payload = {}, options = {}) => buildLedgerEvent({
    ...payload,
    event_type: 'reservation',
    status: payload.status || 'pending',
    usage_snapshot: null
}, options);

const createSettlementEvent = (payload = {}, options = {}) => buildLedgerEvent({
    ...payload,
    event_type: 'settlement',
    status: payload.status || 'settled'
}, options);

const createRefundEvent = (payload = {}, options = {}) => buildLedgerEvent({
    ...payload,
    event_type: 'refund',
    status: payload.status || 'refunded'
}, options);

const createAdjustmentEvent = (payload = {}, options = {}) => buildLedgerEvent({
    ...payload,
    event_type: 'adjustment',
    status: payload.status || 'settled'
}, options);

const persistLedgerEvent = async (eventPayload, options = {}) => {
    const dependencies = createLedgerDependencies(options);
    const event = buildLedgerEvent(eventPayload, options);
    const command = new PutCommand({
        TableName: dependencies.tableName,
        Item: event,
        ConditionExpression: 'attribute_not_exists(event_id)'
    });

    try {
        await dependencies.ddbDoc.send(command);
    } catch (error) {
        if (error && error.name === 'ConditionalCheckFailedException') {
            return event;
        }
        throw error;
    }
    return event;
};

module.exports = {
    DEFAULT_CREDIT_LEDGER_TABLE,
    buildIdempotencyKey,
    buildDeterministicEventId,
    createLedgerDependencies,
    buildLedgerEvent,
    createReservationEvent,
    createSettlementEvent,
    createRefundEvent,
    createAdjustmentEvent,
    persistLedgerEvent
};
