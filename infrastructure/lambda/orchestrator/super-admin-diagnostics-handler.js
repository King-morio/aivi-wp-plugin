const { assertSuperAdminAccess, assertPermission } = require('./super-admin-auth');
const { createSuperAdminStore } = require('./super-admin-store');
const { createSuperAdminAuditStore } = require('./super-admin-audit-store');
const { createBillingStore } = require('./billing-store');
const { processVerifiedPayPalWebhook } = require('./paypal-webhook-processing');
const { createAccountBillingStateStore, computeTotalRemaining } = require('./billing-account-state');
const { buildSubscriptionLookupKey, buildTopupLookupKey } = require('./paypal-reconciliation');

const sanitizeString = (value) => String(value || '').trim();
const normalizeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
};
const toIso = (value = new Date()) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const isVerifiedWebhookStatus = (value) => ['verified', 'success'].includes(sanitizeString(value).toLowerCase());

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
});

const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const createHttpError = (statusCode, code, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const extractAccountId = (event = {}) => {
    const direct = sanitizeString(event?.pathParameters?.account_id);
    if (direct) return direct;
    const path = sanitizeString(event?.rawPath || event?.path || event?.requestContext?.http?.path);
    const match = path.match(/\/aivi\/v1\/admin\/accounts\/([^/]+)\/diagnostics(?:\/recovery)?$/);
    return match ? sanitizeString(match[1]) : '';
};

const parseBody = (event = {}) => {
    if (!event.body) return {};
    if (typeof event.body === 'object') return event.body;
    if (typeof event.body === 'string') return JSON.parse(event.body);
    return {};
};

const sanitizeCheckoutIntent = (record = {}) => ({
    intent_id: sanitizeString(record.intent_id),
    lookup_key: sanitizeString(record.lookup_key),
    intent_type: sanitizeString(record.intent_type),
    plan_code: sanitizeString(record.plan_code),
    topup_pack_code: sanitizeString(record.topup_pack_code),
    status: sanitizeString(record.status),
    provider_plan_id: sanitizeString(record.provider_plan_id),
    provider_order_id: sanitizeString(record.provider_order_id),
    provider_subscription_id: sanitizeString(record.provider_subscription_id),
    created_at: sanitizeString(record.created_at),
    updated_at: sanitizeString(record.updated_at)
});

const resolveWebhookReferences = (record = {}) => {
    const summary = record.reconciliation_summary || {};
    const rawResource = record.raw_event?.resource || {};
    const providerSubscriptionId = sanitizeString(summary.provider_subscription_id || rawResource.id);
    const providerOrderId = sanitizeString(summary.provider_order_id || rawResource.supplementary_data?.related_ids?.order_id);
    const checkoutLookupKey = providerOrderId
        ? buildTopupLookupKey(providerOrderId)
        : providerSubscriptionId
            ? buildSubscriptionLookupKey(providerSubscriptionId)
            : '';

    return {
        providerSubscriptionId,
        providerOrderId,
        checkoutLookupKey
    };
};

const resolveWebhookDisplayState = (record = {}, { subscriptions = [], topups = [], checkoutIntents = [] } = {}) => {
    const verification = sanitizeString(record.verification_status).toLowerCase();
    const refs = resolveWebhookReferences(record);
    const hasSubscriptionEvidence = !!refs.providerSubscriptionId
        && subscriptions.some((item) => sanitizeString(item.provider_subscription_id) === refs.providerSubscriptionId);
    const hasTopupEvidence = !!refs.providerOrderId
        && topups.some((item) => sanitizeString(item.provider_order_id) === refs.providerOrderId);
    const matchedIntent = refs.checkoutLookupKey
        ? checkoutIntents.find((item) => sanitizeString(item.lookup_key) === refs.checkoutLookupKey)
        : null;
    const hasCapturedIntentEvidence = matchedIntent
        && ['captured_pending_webhook', 'captured', 'credited'].includes(sanitizeString(matchedIntent.status).toLowerCase());
    const effectPresent = hasSubscriptionEvidence || hasTopupEvidence || !!hasCapturedIntentEvidence;

    if (record.processed === true) {
        return {
            processingState: 'processed',
            processed: true,
            replayEligible: false
        };
    }

    if (effectPresent) {
        return {
            processingState: 'reconciled',
            processed: true,
            replayEligible: false
        };
    }

    if (record.error_summary) {
        return {
            processingState: 'failed',
            processed: false,
            replayEligible: !!record.raw_event && isVerifiedWebhookStatus(verification)
        };
    }

    if (!isVerifiedWebhookStatus(verification)) {
        return {
            processingState: 'verification_failed',
            processed: false,
            replayEligible: false
        };
    }

    return {
        processingState: 'pending',
        processed: false,
        replayEligible: !!record.raw_event
    };
};

const isReplayEligible = (record = {}, context = {}) => resolveWebhookDisplayState(record, context).replayEligible;

const sanitizeWebhookEvent = (record = {}, relevant = false, context = {}) => {
    const status = resolveWebhookDisplayState(record, context);
    return {
    event_id: sanitizeString(record.event_id),
    provider_event_id: sanitizeString(record.provider_event_id),
    event_type: sanitizeString(record.event_type),
    verification_status: sanitizeString(record.verification_status),
    processing_state: status.processingState,
    processed: status.processed,
    processed_at: sanitizeString(record.processed_at),
    created_at: sanitizeString(record.created_at),
    relevant,
    replay_eligible: status.replayEligible,
    reconciliation_summary: record.reconciliation_summary || null,
    error_summary: record.error_summary || null
    };
};

const sanitizeRunIssue = (record = {}) => ({
    run_id: sanitizeString(record.run_id),
    status: sanitizeString(record.status),
    created_at: sanitizeString(record.created_at),
    updated_at: sanitizeString(record.updated_at),
    source: sanitizeString(record.source),
    content_type: sanitizeString(record.content_type),
    billing_summary: record.billing_summary && typeof record.billing_summary === 'object'
        ? {
            settlement_status: sanitizeString(record.billing_summary.settlement_status),
            credits_used: normalizeInt(record.billing_summary.credits_used),
            refunded_credits: normalizeInt(record.billing_summary.refunded_credits)
        }
        : null
});

const sanitizeSiteConflict = (record = {}) => ({
    account_id: sanitizeString(record.account_id),
    account_label: sanitizeString(record.account_label || record.account_id),
    site_id: sanitizeString(record.site?.site_id),
    connected_domain: sanitizeString(record.site?.connected_domain),
    subscription_status: sanitizeString(record.subscription_status),
    updated_at: sanitizeString(record.updated_at)
});

const buildBlockedAdmissionState = (state = {}) => {
    const blockers = [];
    if (state.entitlements?.analysis_allowed === false) blockers.push('analysis_not_allowed');
    if (state.entitlements?.site_limit_reached === true) blockers.push('site_limit_reached');
    if ((computeTotalRemaining(state) || 0) <= 0) blockers.push('insufficient_credits');

    return {
        blocked: blockers.length > 0,
        blockers
    };
};

const buildCheckoutLookupKey = (query = {}) => {
    const direct = sanitizeString(query.checkout_lookup_key || query.lookup_key);
    if (direct) return direct;
    const providerSubscriptionId = sanitizeString(query.provider_subscription_id);
    if (providerSubscriptionId) return buildSubscriptionLookupKey(providerSubscriptionId);
    const providerOrderId = sanitizeString(query.provider_order_id);
    if (providerOrderId) return buildTopupLookupKey(providerOrderId);
    return '';
};

const isWebhookRelevantToAccount = (record = {}, subscriptions = [], topups = [], checkoutIntents = []) => {
    const refs = resolveWebhookReferences(record);
    const subscriptionIds = new Set(subscriptions.map((item) => sanitizeString(item.provider_subscription_id)).filter(Boolean));
    const orderIds = new Set(topups.map((item) => sanitizeString(item.provider_order_id)).filter(Boolean));
    const lookupKeys = new Set(checkoutIntents.map((item) => sanitizeString(item.lookup_key)).filter(Boolean));

    return subscriptionIds.has(refs.providerSubscriptionId)
        || orderIds.has(refs.providerOrderId)
        || lookupKeys.has(refs.checkoutLookupKey);
};

const RECOVERY_ROLE_ALLOWLIST = Object.freeze({
    retry_reconciliation: ['super_admin', 'support_operator', 'finance_operator'],
    replay_failed_webhook: ['super_admin', 'support_operator']
});

const assertRecoveryAllowed = (actorRole, action) => {
    const allowed = RECOVERY_ROLE_ALLOWLIST[action] || [];
    if (allowed.includes(sanitizeString(actorRole))) return;
    throw createHttpError(403, 'admin_recovery_forbidden', 'The authenticated operator cannot perform this recovery action.');
};

const buildDiagnosticsSummary = async ({ accountId, query = {}, actor }) => {
    const store = createSuperAdminStore();
    const billingStore = createBillingStore();
    const state = await store.getAccountState(accountId);
    if (!state) {
        throw createHttpError(404, 'account_not_found', 'No billing account state was found for this account.');
    }

    const [subscriptions, topups, checkoutIntents, webhookEvents, runIssues, conflicts] = await Promise.all([
        store.listSubscriptionRecordsByAccount(accountId, 10),
        store.listTopupOrdersByAccount(accountId, 10),
        store.listCheckoutIntentsByAccount(accountId, 10),
        store.listRecentWebhookEvents(25),
        store.listRunIssuesBySite(sanitizeString(state.site?.site_id), 10),
        store.findSiteBindingConflicts({
            accountId,
            siteId: sanitizeString(state.site?.site_id),
            connectedDomain: sanitizeString(state.site?.connected_domain),
            limit: 10
        })
    ]);

    const checkoutLookupKey = buildCheckoutLookupKey(query);
    const checkoutLookup = checkoutLookupKey ? await billingStore.getCheckoutIntent(checkoutLookupKey) : null;
    const relevantWebhooks = webhookEvents.filter((item) => isWebhookRelevantToAccount(item, subscriptions, topups, checkoutIntents));
    const sanitizedWebhooks = relevantWebhooks.map((item) => sanitizeWebhookEvent(item, true, {
        subscriptions,
        topups,
        checkoutIntents
    }));
    const needsAttention = sanitizedWebhooks.some((item) => ['failed', 'verification_failed', 'pending'].includes(sanitizeString(item.processing_state)));

    return {
        account_id: accountId,
        generated_at: new Date().toISOString(),
        actor_role: sanitizeString(actor.actorRole),
        webhook_delivery_history: sanitizedWebhooks,
        webhook_health: {
            replay_eligible_count: sanitizedWebhooks.filter((item) => item.replay_eligible).length,
            failed_count: sanitizedWebhooks.filter((item) => ['failed', 'verification_failed'].includes(sanitizeString(item.processing_state))).length
        },
        checkout_lookup: {
            lookup_key: checkoutLookupKey,
            recent_intents: checkoutIntents.map(sanitizeCheckoutIntent),
            matched_intent: checkoutLookup ? sanitizeCheckoutIntent(checkoutLookup) : null
        },
        subscription_state: {
            recent_subscriptions: subscriptions,
            recent_topups: topups,
            reconciliation_status: needsAttention ? 'attention' : 'healthy'
        },
        recent_failures: {
            run_issues: runIssues.map(sanitizeRunIssue),
            blocked_admission: buildBlockedAdmissionState(state)
        },
        site_binding_conflicts: conflicts.map(sanitizeSiteConflict)
    };
};

const superAdminDiagnosticsHandler = async (event = {}) => {
    let auditStore = null;
    let auditEventId = '';
    try {
        const actor = assertSuperAdminAccess(event, process.env);
        const route = sanitizeString(event.aiviResolvedRoute || event.routeKey || `${event.httpMethod || event?.requestContext?.http?.method} ${event.path || event?.requestContext?.http?.path}`);
        const accountId = extractAccountId(event);
        if (!accountId) {
            return jsonResponse(400, {
                ok: false,
                error: 'missing_account_id',
                message: 'An account ID is required.'
            });
        }

        if (route === 'GET /aivi/v1/admin/accounts/{account_id}/diagnostics') {
            assertPermission(actor, 'billing.read');
            const diagnostics = await buildDiagnosticsSummary({
                accountId,
                query: event.queryStringParameters || {},
                actor
            });

            return jsonResponse(200, {
                ok: true,
                item: diagnostics
            });
        }

        if (route === 'POST /aivi/v1/admin/accounts/{account_id}/diagnostics/recovery') {
            const body = parseBody(event);
            const action = sanitizeString(body.action).toLowerCase();
            const reason = sanitizeString(body.reason);
            const webhookEventId = sanitizeString(body.webhook_event_id);
            const idempotencyKey = sanitizeString(body.idempotency_key || event.requestContext?.requestId);

            if (!action || !['retry_reconciliation', 'replay_failed_webhook'].includes(action)) {
                return jsonResponse(400, {
                    ok: false,
                    error: 'invalid_recovery_action',
                    message: 'A supported recovery action is required.'
                });
            }
            assertPermission(actor, action === 'replay_failed_webhook' ? 'webhooks.replay' : 'billing.reconcile');
            assertRecoveryAllowed(actor.actorRole, action);
            if (!reason) {
                return jsonResponse(400, {
                    ok: false,
                    error: 'missing_reason',
                    message: 'A human-readable reason is required for recovery actions.'
                });
            }
            if (!webhookEventId) {
                return jsonResponse(400, {
                    ok: false,
                    error: 'missing_webhook_event_id',
                    message: 'A webhook_event_id is required for this recovery action.'
                });
            }

            const diagnostics = await buildDiagnosticsSummary({ accountId, query: {}, actor });
            const relevantWebhookIds = new Set((diagnostics.webhook_delivery_history || []).map((item) => sanitizeString(item.event_id)));
            if (!relevantWebhookIds.has(webhookEventId)) {
                throw createHttpError(404, 'webhook_event_not_found', 'No matching webhook event was found for this account.');
            }

            const billingStore = createBillingStore();
            const webhookRecord = await billingStore.getWebhookEvent(webhookEventId);
            if (!webhookRecord || !webhookRecord.raw_event) {
                throw createHttpError(404, 'stored_webhook_payload_missing', 'The stored webhook payload is not available for replay.');
            }

            const replayEligible = isReplayEligible(webhookRecord, {
                subscriptions: diagnostics.subscription_state?.recent_subscriptions || [],
                topups: diagnostics.subscription_state?.recent_topups || [],
                checkoutIntents: diagnostics.checkout_lookup?.recent_intents || []
            });
            if (!replayEligible) {
                throw createHttpError(409, 'webhook_not_replay_eligible', 'This webhook event is not eligible for replay.');
            }

            auditStore = createSuperAdminAuditStore();
            const auditAttempt = await auditStore.putAuditEvent({
                account_id: accountId,
                site_id: '',
                actor_id: actor.actorId,
                actor_email: actor.actorEmail,
                actor_role: actor.actorRole,
                action,
                target_type: 'webhook_event',
                target_id: webhookEventId,
                reason,
                idempotency_key: idempotencyKey,
                status: 'accepted',
                metadata: {
                    requested_action: action,
                    webhook_event_id: webhookEventId
                },
                created_at: toIso(),
                updated_at: toIso()
            });
            auditEventId = auditAttempt.item?.event_id || '';

            if (auditAttempt.duplicate) {
                return jsonResponse(200, {
                    ok: true,
                    duplicate: true,
                    action,
                    audit_event_id: auditEventId
                });
            }

            const processing = await processVerifiedPayPalWebhook({
                webhookEvent: webhookRecord.raw_event,
                store: billingStore,
                accountStateStore: createAccountBillingStateStore()
            });

            await billingStore.markWebhookProcessed(webhookEventId, {
                processed_at: new Date().toISOString(),
                verification_status: sanitizeString(webhookRecord.verification_status || 'verified'),
                reconciliation_summary: processing.reconciliationSummary || null
            });

            await auditStore.markAuditEventCompleted(auditEventId, {
                status: 'completed',
                updated_at: toIso(),
                metadata: {
                    mutation_effect: {
                        webhook_event_id: webhookEventId,
                        resource_type: processing.resourceType || 'other'
                    }
                }
            });

            return jsonResponse(200, {
                ok: true,
                action,
                audit_event_id: auditEventId,
                effect: {
                    webhook_event_id: webhookEventId,
                    resource_type: processing.resourceType || 'other'
                }
            });
        }

        return jsonResponse(404, {
            ok: false,
            error: 'not_found',
            message: `Route ${route} not found`
        });
    } catch (error) {
        if (auditStore && auditEventId) {
            try {
                await auditStore.markAuditEventCompleted(auditEventId, {
                    status: 'failed',
                    updated_at: toIso(),
                    metadata: {
                        error_code: sanitizeString(error?.code || 'super_admin_diagnostics_failed'),
                        message: sanitizeString(error?.message || 'Diagnostics request failed.')
                    }
                });
            } catch (markError) {
                log('WARN', 'Failed to mark diagnostics audit event as failed', {
                    audit_event_id: auditEventId,
                    error: markError.message
                });
            }
        }

        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        const code = sanitizeString(error?.code || 'super_admin_diagnostics_failed');
        const message = sanitizeString(error?.message || 'Super-admin diagnostics request failed.');

        log(statusCode >= 500 ? 'ERROR' : 'WARN', 'Super-admin diagnostics handler failed', {
            status_code: statusCode,
            error_code: code,
            message,
            audit_event_id: auditEventId || null
        });

        return jsonResponse(statusCode, {
            ok: false,
            error: code,
            message
        });
    }
};

module.exports = {
    buildDiagnosticsSummary,
    superAdminDiagnosticsHandler
};
