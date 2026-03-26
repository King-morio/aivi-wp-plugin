const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const {
    DEFAULT_ACCOUNT_BILLING_STATE_TABLE,
    normalizeAccountBillingState
} = require('./billing-account-state');
const { DEFAULT_CREDIT_LEDGER_TABLE } = require('./credit-ledger');
const {
    PLAN_CATALOG,
    resolvePlanCatalogEntry,
    resolveTopupPackEntry
} = require('./paypal-config');

const ddbClient = new DynamoDBClient({});
const defaultDdbDoc = DynamoDBDocumentClient.from(ddbClient);

const sanitizeString = (value) => String(value || '').trim();
const lower = (value) => sanitizeString(value).toLowerCase();
const toInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : fallback;
};
const toNonNegativeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
};
const toAmount = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const createHttpError = (statusCode, code, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};
const encodeCursor = (payload = {}) => Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
const decodeCursor = (cursor) => {
    const normalized = sanitizeString(cursor);
    if (!normalized) {
        return { offset: 0 };
    }
    try {
        const padded = normalized.replace(/-/g, '+').replace(/_/g, '/');
        const padLength = (4 - (padded.length % 4)) % 4;
        const raw = Buffer.from(`${padded}${'='.repeat(padLength)}`, 'base64').toString('utf8');
        const parsed = JSON.parse(raw);
        return {
            offset: toNonNegativeInt(parsed?.offset, 0)
        };
    } catch (error) {
        throw createHttpError(400, 'invalid_cursor', 'The account list cursor is invalid.');
    }
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

const listStateSites = (state = {}) => {
    if (Array.isArray(state.sites) && state.sites.length > 0) {
        return state.sites;
    }
    const legacySiteId = sanitizeString(state.site?.site_id);
    const legacyDomain = sanitizeString(state.site?.connected_domain);
    if (!legacySiteId && !legacyDomain) {
        return [];
    }
    return [{
        site_id: legacySiteId,
        connected_domain: legacyDomain
    }];
};

const hasActiveSiteBinding = (state = {}) => {
    if (state?.connected === true) return true;
    if (sanitizeString(state?.connection_status).toLowerCase() === 'connected') return true;
    const bindingStatus = sanitizeString(state?.site_binding_status).toLowerCase();
    if (bindingStatus === 'connected' || bindingStatus === 'limit_reached') return true;
    return listStateSites(state).some((site) => {
        const siteBindingStatus = sanitizeString(site?.binding_status).toLowerCase();
        return siteBindingStatus === 'connected' || siteBindingStatus === 'limit_reached';
    });
};

const scanAll = async ({ ddbDoc, tableName, limit = 25 }) => {
    const items = [];
    const pageSize = Math.max(toInt(limit, 25) * 4, 25);
    let lastEvaluatedKey;
    let guard = 0;

    do {
        const response = await ddbDoc.send(new ScanCommand({
            TableName: tableName,
            Limit: pageSize,
            ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
        }));
        if (Array.isArray(response?.Items)) {
            items.push(...response.Items);
        }
        lastEvaluatedKey = response?.LastEvaluatedKey;
        guard += 1;
    } while (lastEvaluatedKey && guard < 250);

    return items;
};

const getPlanPriceUsd = (planCode) => toAmount(resolvePlanCatalogEntry(planCode)?.price_usd);
const isPaidPlanCode = (planCode) => !!resolvePlanCatalogEntry(planCode);
const getObservedEventTime = (...candidates) => {
    const match = candidates.map((value) => sanitizeString(value)).find(Boolean);
    return match || '';
};
const parseTimestampMs = (value) => {
    const parsed = Date.parse(sanitizeString(value));
    return Number.isFinite(parsed) ? parsed : null;
};
const isWithinTrailingDays = (timestamp, days, nowMs) => {
    const ts = parseTimestampMs(timestamp);
    if (!Number.isFinite(ts)) return false;
    const windowMs = Math.max(1, Number(days) || 1) * 24 * 60 * 60 * 1000;
    return ts >= (nowMs - windowMs) && ts <= nowMs;
};
const isActivePaidState = (state = {}) => isPaidPlanCode(state.plan_code) && lower(state.subscription_status) === 'active';
const isSuspendedPaidState = (state = {}) => isPaidPlanCode(state.plan_code) && lower(state.subscription_status) === 'suspended';
const isActiveTrialState = (state = {}) => lower(state.trial_status) === 'active';
const getMonthlyIncludedCredits = (state = {}) => {
    const explicit = Number(state?.credits?.monthly_included);
    if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
    }
    return toAmount(resolvePlanCatalogEntry(state.plan_code)?.included_credits);
};
const isLowCreditPaidState = (state = {}) => {
    if (!isActivePaidState(state)) return false;
    const monthlyIncluded = getMonthlyIncludedCredits(state);
    if (!Number.isFinite(monthlyIncluded) || monthlyIncluded <= 0) return false;
    const remaining = toAmount(state?.credits?.total_remaining);
    return remaining <= Math.floor(monthlyIncluded * 0.1);
};
const isNearTrialExpiryState = (state = {}, nowMs, windowDays = 2) => {
    if (!isActiveTrialState(state)) return false;
    const expiryMs = parseTimestampMs(state.trial_expires_at);
    if (!Number.isFinite(expiryMs)) return false;
    const windowMs = Math.max(1, Number(windowDays) || 1) * 24 * 60 * 60 * 1000;
    return expiryMs >= nowMs && expiryMs <= nowMs + windowMs;
};
const isObservedSubscriptionCheckout = (record = {}) => {
    if (lower(record.intent_type) !== 'subscription') return false;
    if (lower(record.intent_variant) === 'revise') return false;
    if (!Number.isFinite(Number(record.price_usd))) return false;
    const status = lower(record.status);
    return status === 'active' || status === 'cancelled' || status === 'suspended' || status === 'expired';
};
const isPaymentFailureRecord = (record = {}) => {
    return lower(record.last_payment_status) === 'failed'
        || lower(record.status) === 'error'
        || lower(record.last_event_type) === 'billing.subscription.payment.failed';
};
const isObservedTopupOrder = (record = {}) => {
    const status = lower(record.status);
    return (status === 'captured' || status === 'credited')
        && !!resolveTopupPackEntry(record.pack_code);
};
const sumEventAmountsInWindow = (events = [], days, nowMs) => events.reduce((sum, event) => (
    isWithinTrailingDays(event.observed_at, days, nowMs) ? sum + toAmount(event.amount_usd) : sum
), 0);
const buildFinancialAccountRow = (state = {}, extra = {}) => {
    const connectedSite = listStateSites(state)[0] || {};
    return {
        account_id: sanitizeString(state.account_id),
        account_label: sanitizeString(state.account_label || state.account_id || 'Unknown account'),
        plan_code: sanitizeString(state.plan_code),
        plan_label: sanitizeString(state.plan_name || resolvePlanCatalogEntry(state.plan_code)?.label || state.plan_code || 'No plan'),
        subscription_status: sanitizeString(state.subscription_status || 'unknown'),
        trial_status: sanitizeString(state.trial_status || 'none'),
        credits_remaining: toAmount(state?.credits?.total_remaining),
        connected_domain: sanitizeString(connectedSite.connected_domain || state?.site?.connected_domain),
        updated_at: sanitizeString(state.updated_at),
        ...extra
    };
};
const getUsageRatio = (state = {}) => {
    const monthlyIncluded = getMonthlyIncludedCredits(state);
    if (!Number.isFinite(monthlyIncluded) || monthlyIncluded <= 0) return 0;
    const monthlyUsed = toAmount(state?.usage?.credits_used_this_month ?? state?.credits?.monthly_used);
    return monthlyUsed > 0 ? monthlyUsed / monthlyIncluded : 0;
};
const isHighUsagePaidState = (state = {}) => isActivePaidState(state) && getUsageRatio(state) >= 0.8;
const buildAccountSearchHaystack = (item = {}) => {
    const sites = listStateSites(item);
    return [
        item.account_id,
        item.account_label,
        item.contact_email,
        ...sites.map((site) => sanitizeString(site.connected_domain)),
        ...sites.map((site) => sanitizeString(site.site_id))
    ].map((value) => sanitizeString(value).toLowerCase()).join(' ');
};
const filterAccountStates = (items = [], filters = {}) => {
    const query = sanitizeString(filters.query).toLowerCase();
    const siteId = sanitizeString(filters.site_id);
    const planCode = sanitizeString(filters.plan_code).toLowerCase();
    const subscriptionStatus = sanitizeString(filters.subscription_status).toLowerCase();

    return items.filter((item) => {
        const sites = listStateSites(item);
        if (siteId && !sites.some((site) => sanitizeString(site.site_id) === siteId)) return false;
        if (planCode && sanitizeString(item.plan_code).toLowerCase() !== planCode) return false;
        if (subscriptionStatus && sanitizeString(item.subscription_status).toLowerCase() !== subscriptionStatus) return false;
        if (query && !buildAccountSearchHaystack(item).includes(query)) return false;
        return true;
    });
};
const paginateAccountStates = (items = [], filters = {}) => {
    const limit = toInt(filters.limit, 25);
    const sorted = sortByTimestampDesc(items);
    const totalCount = sorted.length;
    const { offset } = decodeCursor(filters.cursor);
    const safeOffset = Math.min(offset, totalCount);
    const pageItems = sorted.slice(safeOffset, safeOffset + limit);
    const nextOffset = safeOffset + pageItems.length;
    const nextCursor = nextOffset < totalCount ? encodeCursor({ offset: nextOffset }) : null;

    return {
        items: pageItems,
        page: {
            count: pageItems.length,
            limit,
            total_count: totalCount,
            page_start: pageItems.length > 0 ? safeOffset + 1 : 0,
            page_end: safeOffset + pageItems.length,
            next_cursor: nextCursor
        }
    };
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
            const page = await this.listAccountStatePage(filters);
            return page.items;
        },

        async listAccountStatePage(filters = {}) {
            const items = (await scanAll({
                ddbDoc,
                tableName: accountStateTable,
                limit: toInt(filters.limit, 25)
            })).map((item) => normalizeAccountBillingState(item));
            return paginateAccountStates(filterAccountStates(items, filters), filters);
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
                .filter((item) => hasActiveSiteBinding(item))
                .filter((item) => {
                    const sites = listStateSites(item);
                    return sites.some((site) => {
                        const itemSiteId = sanitizeString(site.site_id);
                        const itemDomain = sanitizeString(site.connected_domain).toLowerCase();
                        return (normalizedSiteId && itemSiteId === normalizedSiteId)
                            || (normalizedDomain && itemDomain && itemDomain === normalizedDomain);
                    });
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
        },

        async getFinancialOverview({ recentEventsLimit = 8, trialExpiryWindowDays = 2, now = new Date() } = {}) {
            const nowDate = now instanceof Date ? now : new Date(now);
            const nowMs = Number.isNaN(nowDate.getTime()) ? Date.now() : nowDate.getTime();
            const [accountStatesRaw, subscriptionRecords, topupOrders, checkoutIntents] = await Promise.all([
                scanAll({ ddbDoc, tableName: accountStateTable, limit: 100 }),
                subscriptionsTable ? scanAll({ ddbDoc, tableName: subscriptionsTable, limit: 100 }) : Promise.resolve([]),
                topupOrdersTable ? scanAll({ ddbDoc, tableName: topupOrdersTable, limit: 100 }) : Promise.resolve([]),
                checkoutIntentsTable ? scanAll({ ddbDoc, tableName: checkoutIntentsTable, limit: 100 }) : Promise.resolve([])
            ]);

            const accountStates = accountStatesRaw.map((item) => normalizeAccountBillingState(item, {
                now: nowDate
            }));
            const stateByAccountId = new Map(
                accountStates.map((state) => [sanitizeString(state.account_id), state])
            );
            const labelByAccountId = new Map(
                accountStates.map((state) => [
                    sanitizeString(state.account_id),
                    sanitizeString(state.account_label || state.account_id || 'Unknown account')
                ])
            );

            const activePaidStates = accountStates.filter(isActivePaidState);
            const activeTrials = accountStates.filter(isActiveTrialState);
            const suspendedPaidStates = accountStates.filter(isSuspendedPaidState);
            const nearTrialExpiryStates = activeTrials.filter((state) => isNearTrialExpiryState(state, nowMs, trialExpiryWindowDays));
            const lowCreditPaidStates = activePaidStates.filter(isLowCreditPaidState);
            const highUsagePaidStates = activePaidStates.filter(isHighUsagePaidState);
            const paymentFailureAccountIds = new Set(
                subscriptionRecords
                    .filter(isPaymentFailureRecord)
                    .map((record) => sanitizeString(record.account_id))
                    .filter(Boolean)
            );

            const projectedMrrUsd = activePaidStates.reduce((sum, state) => (
                sum + getPlanPriceUsd(state.plan_code)
            ), 0);

            const planMix = Object.values(PLAN_CATALOG)
                .map((plan) => {
                    const matchingStates = activePaidStates.filter((state) => lower(state.plan_code) === lower(plan.code));
                    const activeAccounts = matchingStates.length;
                    return {
                        plan_code: plan.code,
                        plan_label: plan.label,
                        active_accounts: activeAccounts,
                        projected_mrr_usd: activeAccounts * toAmount(plan.price_usd),
                        share_of_paid_accounts: activePaidStates.length > 0
                            ? Number(((activeAccounts / activePaidStates.length) * 100).toFixed(1))
                            : 0
                    };
                })
                .filter((entry) => entry.active_accounts > 0);

            const subscriptionRevenueEvents = checkoutIntents
                .filter(isObservedSubscriptionCheckout)
                .map((record) => {
                    const plan = resolvePlanCatalogEntry(record.plan_code) || {};
                    const variant = lower(record.intent_variant);
                    const observedAt = getObservedEventTime(record.updated_at, record.created_at);
                    return {
                        event_kind: 'subscription_checkout',
                        account_id: sanitizeString(record.account_id),
                        account_label: labelByAccountId.get(sanitizeString(record.account_id)) || sanitizeString(record.account_id || 'Unknown account'),
                        summary: variant === 'intro_offer'
                            ? `${sanitizeString(plan.label || record.plan_code || 'Subscription')} intro checkout`
                            : `${sanitizeString(plan.label || record.plan_code || 'Subscription')} subscription checkout`,
                        plan_code: sanitizeString(record.plan_code),
                        intent_variant: sanitizeString(record.intent_variant),
                        amount_usd: toAmount(record.price_usd),
                        observed_at: observedAt,
                        status: sanitizeString(record.status),
                        source: 'checkout_intent'
                    };
                });

            const topupRevenueEvents = topupOrders
                .filter(isObservedTopupOrder)
                .map((record) => {
                    const pack = resolveTopupPackEntry(record.pack_code) || {};
                    return {
                        event_kind: 'topup_purchase',
                        account_id: sanitizeString(record.account_id),
                        account_label: labelByAccountId.get(sanitizeString(record.account_id)) || sanitizeString(record.account_id || 'Unknown account'),
                        summary: `${sanitizeString(pack.label || record.pack_code || 'Top-up')} purchase`,
                        topup_pack_code: sanitizeString(record.pack_code),
                        credits: toAmount(record.credits),
                        amount_usd: toAmount(pack.price_usd),
                        observed_at: getObservedEventTime(record.updated_at, record.created_at),
                        status: sanitizeString(record.status),
                        source: 'topup_order'
                    };
                });

            const monetizedEvents = sortByTimestampDesc([
                ...subscriptionRevenueEvents,
                ...topupRevenueEvents
            ], ['observed_at', 'updated_at', 'created_at']);

            const paymentFailures = [];
            const seenFailureKeys = new Set();
            sortByTimestampDesc(subscriptionRecords).forEach((record) => {
                if (!isPaymentFailureRecord(record)) return;
                const accountId = sanitizeString(record.account_id);
                const dedupeKey = `${accountId}:${sanitizeString(record.provider_subscription_id || record.subscription_id || record.last_event_type)}`;
                if (seenFailureKeys.has(dedupeKey)) return;
                seenFailureKeys.add(dedupeKey);
                const state = stateByAccountId.get(accountId) || {};
                paymentFailures.push({
                    ...buildFinancialAccountRow(state, {
                        account_id: accountId,
                        account_label: labelByAccountId.get(accountId) || accountId || 'Unknown account'
                    }),
                    provider_subscription_id: sanitizeString(record.provider_subscription_id),
                    last_payment_status: sanitizeString(record.last_payment_status || record.status),
                    last_event_type: sanitizeString(record.last_event_type),
                    failure_record_status: sanitizeString(record.status),
                    updated_at: sanitizeString(record.updated_at || record.created_at)
                });
            });

            return {
                financials_version: 'v1',
                generated_at: new Date(nowMs).toISOString(),
                currency: 'USD',
                snapshot: {
                    total_accounts: accountStates.length,
                    paid_accounts: activePaidStates.length,
                    active_trials: activeTrials.length,
                    suspended_paid_accounts: suspendedPaidStates.length
                },
                projected_recurring: {
                    mrr_usd: projectedMrrUsd,
                    active_paid_accounts: activePaidStates.length
                },
                observed_checkout_revenue: {
                    last_7d_usd: sumEventAmountsInWindow(monetizedEvents, 7, nowMs),
                    last_30d_usd: sumEventAmountsInWindow(monetizedEvents, 30, nowMs),
                    last_365d_usd: sumEventAmountsInWindow(monetizedEvents, 365, nowMs),
                    counted_events: monetizedEvents.length
                },
                plan_mix: planMix,
                recent_monetized_events: monetizedEvents.slice(0, toInt(recentEventsLimit, 8)),
                watchlist: {
                    suspended_paid_accounts: suspendedPaidStates.length,
                    near_trial_expiry_accounts: nearTrialExpiryStates.length,
                    low_credit_paid_accounts: lowCreditPaidStates.length,
                    high_usage_paid_accounts: highUsagePaidStates.length,
                    payment_failure_accounts: paymentFailureAccountIds.size,
                    items: [
                        {
                            key: 'suspended_paid_accounts',
                            label: 'Suspended paid accounts',
                            count: suspendedPaidStates.length,
                            description: 'Paid accounts currently suspended and likely to need finance or support intervention.'
                        },
                        {
                            key: 'near_trial_expiry_accounts',
                            label: 'Trials expiring soon',
                            count: nearTrialExpiryStates.length,
                            description: `Active trials expiring within ${Math.max(1, Number(trialExpiryWindowDays) || 1)} days.`
                        },
                        {
                            key: 'low_credit_paid_accounts',
                            label: 'Low-credit paid accounts',
                            count: lowCreditPaidStates.length,
                            description: 'Active paid accounts with 10% or less of included monthly credits remaining.'
                        },
                        {
                            key: 'high_usage_paid_accounts',
                            label: 'High-usage paid accounts',
                            count: highUsagePaidStates.length,
                            description: 'Active paid accounts already using 80% or more of included monthly credits.'
                        },
                        {
                            key: 'payment_failure_accounts',
                            label: 'Payment failures detected',
                            count: paymentFailureAccountIds.size,
                            description: 'Accounts with at least one failed recurring payment event recorded in subscription history.'
                        }
                    ]
                },
                truth_boundary: {
                    projected_recurring_scope: 'Projected MRR is derived from active paid account state priced against the current plan catalog.',
                    observed_revenue_scope: 'Observed checkout revenue counts activated non-revision subscription checkouts with recorded price_usd, plus captured or credited top-up orders priced from the top-up catalog.',
                    recurring_renewals_included: false,
                    plan_change_collections_included: false
                },
                operator_views: {
                    payment_failures: paymentFailures.slice(0, 8),
                    watch_accounts: {
                        active_trials: activeTrials.slice(0, 8).map((state) => buildFinancialAccountRow(state, {
                            trial_expires_at: sanitizeString(state.trial_expires_at)
                        })),
                        suspended_paid: suspendedPaidStates.slice(0, 8).map((state) => buildFinancialAccountRow(state)),
                        near_trial_expiry: nearTrialExpiryStates.slice(0, 8).map((state) => buildFinancialAccountRow(state, {
                            trial_expires_at: sanitizeString(state.trial_expires_at)
                        })),
                        low_credit_paid: lowCreditPaidStates.slice(0, 8).map((state) => buildFinancialAccountRow(state, {
                            monthly_included: getMonthlyIncludedCredits(state)
                        })),
                        high_usage_paid: highUsagePaidStates.slice(0, 8).map((state) => buildFinancialAccountRow(state, {
                            monthly_included: getMonthlyIncludedCredits(state),
                            credits_used_this_month: toAmount(state?.usage?.credits_used_this_month ?? state?.credits?.monthly_used),
                            usage_ratio: Number((getUsageRatio(state) * 100).toFixed(1))
                        }))
                    }
                }
            };
        }
    };
};

module.exports = {
    createSuperAdminStore
};
