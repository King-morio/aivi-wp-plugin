const { assertSuperAdminAccess, assertPermission } = require('./super-admin-auth');
const { createSuperAdminAuditStore } = require('./super-admin-audit-store');
const { createAccountBillingStateStore } = require('./billing-account-state');
const {
    normalizeAccountBillingState,
    buildRemoteAccountPayload,
    applyLedgerEventToState,
    computeTotalRemaining,
    getPlanDefinition
} = require('./billing-account-state');
const { createAdjustmentEvent, persistLedgerEvent } = require('./credit-ledger');
const { issueConnectionToken } = require('./connection-token');

const sanitizeString = (value) => String(value || '').trim();
const toIso = (value = new Date()) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const parseBody = (event = {}) => {
    if (!event.body) return {};
    if (typeof event.body === 'object') return event.body;
    if (typeof event.body === 'string') return JSON.parse(event.body);
    return {};
};
const normalizeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

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

const extractAccountId = (event = {}) => {
    const direct = sanitizeString(event?.pathParameters?.account_id);
    if (direct) return direct;
    const path = sanitizeString(event?.rawPath || event?.path || event?.requestContext?.http?.path);
    const match = path.match(/\/aivi\/v1\/admin\/accounts\/([^/]+)\/actions$/);
    return match ? sanitizeString(match[1]) : '';
};

const createHttpError = (statusCode, code, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const ALLOWED_ACTIONS = [
    'manual_credit_adjustment',
    'issue_connection_token',
    'extend_trial',
    'end_trial',
    'plan_override',
    'subscription_resync',
    'site_unbind',
    'account_pause',
    'account_restore'
];

const ACTION_ROLE_ALLOWLIST = Object.freeze({
    manual_credit_adjustment: ['super_admin', 'finance_operator'],
    issue_connection_token: ['super_admin', 'support_operator'],
    extend_trial: ['super_admin', 'support_operator'],
    end_trial: ['super_admin', 'support_operator'],
    plan_override: ['super_admin'],
    subscription_resync: ['super_admin', 'support_operator'],
    site_unbind: ['super_admin', 'support_operator'],
    account_pause: ['super_admin', 'support_operator'],
    account_restore: ['super_admin', 'support_operator']
});

const ACTION_PERMISSION_MAP = Object.freeze({
    manual_credit_adjustment: 'credits.adjust',
    issue_connection_token: 'sites.write',
    extend_trial: 'accounts.write',
    end_trial: 'accounts.write',
    plan_override: 'accounts.write',
    subscription_resync: 'billing.reconcile',
    site_unbind: 'sites.write',
    account_pause: 'accounts.write',
    account_restore: 'accounts.write'
});

const assertActionAllowed = (actorRole, action) => {
    const allowedRoles = ACTION_ROLE_ALLOWLIST[action] || [];
    if (allowedRoles.includes(sanitizeString(actorRole))) {
        return;
    }
    throw createHttpError(403, 'admin_action_forbidden', 'The authenticated operator cannot perform this admin action.');
};

const applyManualCreditAdjustment = async ({ state, accountId, actionInput }) => {
    const creditsDelta = normalizeInt(actionInput.credits_delta);
    if (!Number.isFinite(creditsDelta) || creditsDelta === 0) {
        throw createHttpError(400, 'invalid_credits_delta', 'A non-zero credits_delta is required for manual credit adjustment.');
    }

    const balanceBefore = computeTotalRemaining(state);
    if (creditsDelta < 0 && balanceBefore !== null && Math.abs(creditsDelta) > balanceBefore) {
        throw createHttpError(400, 'insufficient_credits_for_adjustment', 'The requested credit deduction exceeds the current remaining balance.');
    }
    const ledgerEvent = await persistLedgerEvent(createAdjustmentEvent({
        account_id: accountId,
        site_id: sanitizeString(state.site?.site_id),
        run_id: null,
        reason_code: 'manual_credit_adjustment',
        external_ref: sanitizeString(actionInput.idempotency_key || actionInput.request_id || Date.now()),
        pricing_snapshot: {},
        amounts: {
            granted_credits: creditsDelta > 0 ? creditsDelta : 0,
            settled_credits: creditsDelta < 0 ? Math.abs(creditsDelta) : 0,
            refunded_credits: 0,
            reserved_credits: 0,
            balance_before: balanceBefore,
            balance_after: balanceBefore === null ? null : balanceBefore + creditsDelta
        }
    }));

    const nextState = applyLedgerEventToState(state, ledgerEvent);
    return {
        nextState,
        effectSummary: {
            credits_delta: creditsDelta,
            balance_before: balanceBefore,
            balance_after: computeTotalRemaining(nextState),
            ledger_event_id: ledgerEvent.event_id
        }
    };
};

const applyExtendTrial = ({ state, actionInput, nowIso }) => {
    const days = Math.max(1, Math.min(90, normalizeInt(actionInput.trial_days, 14) || 14));
    const expiresAt = new Date(nowIso);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + days);

    const nextState = normalizeAccountBillingState({
        ...state,
        connected: true,
        connection_status: 'connected',
        plan_code: sanitizeString(state.plan_code || 'free_trial'),
        plan_name: sanitizeString(state.plan_name || 'Free Trial'),
        trial_status: 'active',
        trial_expires_at: expiresAt.toISOString(),
        entitlements: {
            ...state.entitlements,
            analysis_allowed: true,
            max_sites: state.entitlements?.max_sites || 1
        },
        updated_at: nowIso
    }, state.site);

    return {
        nextState,
        effectSummary: {
            trial_status: nextState.trial_status,
            trial_expires_at: nextState.trial_expires_at
        }
    };
};

const applyIssueConnectionToken = async ({ state, accountId, actionInput }) => {
    const expiresInDays = Math.max(1, Math.min(30, normalizeInt(actionInput.connection_days, 7) || 7));
    const issued = await issueConnectionToken({
        accountId,
        accountLabel: sanitizeString(actionInput.connection_label || state.account_label),
        expiresInDays,
        siteLimit: state.entitlements?.max_sites
    });

    return {
        nextState: state,
        effectSummary: {
            connection_token: issued.token,
            expires_at: issued.expires_at,
            max_sites: state.entitlements?.max_sites || null
        }
    };
};

const applyEndTrial = ({ state, nowIso }) => {
    const subscriptionActive = sanitizeString(state.subscription_status).toLowerCase() === 'active';
    const nextState = normalizeAccountBillingState({
        ...state,
        trial_status: 'ended',
        trial_expires_at: nowIso,
        entitlements: {
            ...state.entitlements,
            analysis_allowed: subscriptionActive
        },
        updated_at: nowIso
    }, state.site);

    return {
        nextState,
        effectSummary: {
            trial_status: nextState.trial_status,
            trial_expires_at: nextState.trial_expires_at,
            analysis_allowed: nextState.entitlements.analysis_allowed
        }
    };
};

const applyPlanOverride = ({ state, actionInput, nowIso }) => {
    const targetPlanCode = sanitizeString(actionInput.target_plan_code).toLowerCase();
    const plan = getPlanDefinition(targetPlanCode);
    if (!plan || targetPlanCode === 'free_trial') {
        throw createHttpError(400, 'invalid_target_plan_code', 'A valid paid target_plan_code is required for plan override.');
    }

    const nextState = normalizeAccountBillingState({
        ...state,
        connected: true,
        connection_status: 'connected',
        plan_code: plan.code,
        plan_name: plan.label,
        subscription_status: 'active',
        trial_status: sanitizeString(state.trial_status) === 'active' ? 'converted' : sanitizeString(state.trial_status),
        entitlements: {
            ...state.entitlements,
            analysis_allowed: true,
            max_sites: plan.site_limit
        },
        updated_at: nowIso
    }, state.site);

    return {
        nextState,
        effectSummary: {
            plan_code: nextState.plan_code,
            max_sites: nextState.entitlements.max_sites,
            subscription_status: nextState.subscription_status
        }
    };
};

const applySubscriptionResync = ({ state, nowIso }) => {
    const nextState = normalizeAccountBillingState({
        ...state,
        subscription: {
            ...state.subscription,
            last_event_type: 'admin_resync_requested'
        },
        updated_at: nowIso
    }, state.site);

    return {
        nextState,
        effectSummary: {
            resync_requested: true,
            subscription_status: nextState.subscription_status
        }
    };
};

const applySiteUnbind = ({ state, nowIso }) => {
    const nextState = normalizeAccountBillingState({
        ...state,
        site_binding_status: 'unbound',
        site: {
            ...state.site,
            site_id: '',
            blog_id: 0,
            home_url: '',
            connected_domain: ''
        },
        entitlements: {
            ...state.entitlements,
            site_limit_reached: false
        },
        updated_at: nowIso
    });

    return {
        nextState,
        effectSummary: {
            site_binding_status: nextState.site_binding_status,
            site_id: nextState.site.site_id
        }
    };
};

const applyAccountPause = ({ state, nowIso }) => {
    const nextState = normalizeAccountBillingState({
        ...state,
        subscription_status: 'paused',
        entitlements: {
            ...state.entitlements,
            analysis_allowed: false
        },
        updated_at: nowIso
    }, state.site);

    return {
        nextState,
        effectSummary: {
            subscription_status: nextState.subscription_status,
            analysis_allowed: nextState.entitlements.analysis_allowed
        }
    };
};

const applyAccountRestore = ({ state, nowIso }) => {
    const trialActive = sanitizeString(state.trial_status).toLowerCase() === 'active';
    const hasPlan = !!sanitizeString(state.plan_code);
    const nextState = normalizeAccountBillingState({
        ...state,
        subscription_status: hasPlan ? 'active' : sanitizeString(state.subscription_status),
        entitlements: {
            ...state.entitlements,
            analysis_allowed: hasPlan || trialActive
        },
        updated_at: nowIso
    }, state.site);

    return {
        nextState,
        effectSummary: {
            subscription_status: nextState.subscription_status,
            analysis_allowed: nextState.entitlements.analysis_allowed
        }
    };
};

const applyAdminMutation = async ({ state, accountId, action, actionInput, nowIso }) => {
    switch (action) {
        case 'manual_credit_adjustment':
            return applyManualCreditAdjustment({ state, accountId, actionInput });
        case 'issue_connection_token':
            return applyIssueConnectionToken({ state, accountId, actionInput });
        case 'extend_trial':
            return applyExtendTrial({ state, actionInput, nowIso });
        case 'end_trial':
            return applyEndTrial({ state, nowIso });
        case 'plan_override':
            return applyPlanOverride({ state, actionInput, nowIso });
        case 'subscription_resync':
            return applySubscriptionResync({ state, nowIso });
        case 'site_unbind':
            return applySiteUnbind({ state, nowIso });
        case 'account_pause':
            return applyAccountPause({ state, nowIso });
        case 'account_restore':
            return applyAccountRestore({ state, nowIso });
        default:
            throw createHttpError(400, 'invalid_admin_action', 'Unsupported admin action.');
    }
};

const superAdminMutationHandler = async (event = {}) => {
    let auditStore = null;
    let auditEventId = '';
    try {
        const actor = assertSuperAdminAccess(event, process.env);
        const accountId = extractAccountId(event);
        if (!accountId) {
            return jsonResponse(400, {
                ok: false,
                error: 'missing_account_id',
                message: 'An account ID is required.'
            });
        }

        const body = parseBody(event);
        const action = sanitizeString(body.action).toLowerCase();
        const reason = sanitizeString(body.reason);
        const idempotencyKey = sanitizeString(body.idempotency_key || event.requestContext?.requestId);
        const nowIso = toIso();

        if (!ALLOWED_ACTIONS.includes(action)) {
            return jsonResponse(400, {
                ok: false,
                error: 'invalid_admin_action',
                message: 'A supported admin action is required.'
            });
        }
        assertPermission(actor, ACTION_PERMISSION_MAP[action] || 'accounts.write');
        assertActionAllowed(actor.actorRole, action);
        if (!reason) {
            return jsonResponse(400, {
                ok: false,
                error: 'missing_reason',
                message: 'A human-readable reason is required for admin actions.'
            });
        }

        const accountStateStore = createAccountBillingStateStore();
        const currentState = await accountStateStore.getAccountState(accountId);
        if (!currentState) {
            return jsonResponse(404, {
                ok: false,
                error: 'account_not_found',
                message: 'No billing account state was found for this account.'
            });
        }

        auditStore = createSuperAdminAuditStore();
        const auditAttempt = await auditStore.putAuditEvent({
            account_id: accountId,
            site_id: sanitizeString(currentState.site?.site_id),
            actor_id: actor.actorId,
            actor_email: actor.actorEmail,
            actor_role: actor.actorRole,
            action,
            target_type: 'account',
            target_id: accountId,
            reason,
            idempotency_key: idempotencyKey,
            status: 'accepted',
            metadata: {
                requested_action: action,
                request_payload: {
                    credits_delta: body.credits_delta ?? null,
                    trial_days: body.trial_days ?? null,
                    target_plan_code: body.target_plan_code ?? null
                }
            },
            created_at: nowIso,
            updated_at: nowIso
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

        const { nextState, effectSummary } = await applyAdminMutation({
            state: currentState,
            accountId,
            action,
            actionInput: {
                ...body,
                idempotency_key: idempotencyKey,
                request_id: event.requestContext?.requestId
            },
            nowIso
        });

        await accountStateStore.putAccountState(nextState);
        await auditStore.markAuditEventCompleted(auditEventId, {
            status: 'completed',
            updated_at: toIso(),
            metadata: {
                mutation_effect: effectSummary,
                account_snapshot: {
                    plan_code: nextState.plan_code,
                    subscription_status: nextState.subscription_status,
                    trial_status: nextState.trial_status,
                    trial_expires_at: nextState.trial_expires_at,
                    credits_remaining: computeTotalRemaining(nextState),
                    site_binding_status: nextState.site_binding_status
                }
            }
        });

        log('INFO', 'Completed super-admin mutation', {
            actor_role: actor.actorRole,
            account_id: accountId,
            action,
            audit_event_id: auditEventId
        });

        return jsonResponse(200, {
            ok: true,
            action,
            audit_event_id: auditEventId,
            effect: effectSummary,
            account_state: buildRemoteAccountPayload(nextState, nextState.site, {}).account_state
        });
    } catch (error) {
        if (auditStore && auditEventId) {
            try {
                await auditStore.markAuditEventCompleted(auditEventId, {
                    status: 'failed',
                    updated_at: toIso(),
                    metadata: {
                        error_code: sanitizeString(error?.code || 'super_admin_mutation_failed'),
                        message: sanitizeString(error?.message || 'Super-admin mutation failed.')
                    }
                });
            } catch (markError) {
                log('WARN', 'Failed to mark admin audit event as failed', {
                    audit_event_id: auditEventId,
                    error: markError.message
                });
            }
        }

        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        const code = sanitizeString(error?.code || 'super_admin_mutation_failed');
        const message = sanitizeString(error?.message || 'Super-admin mutation failed.');

        log(statusCode >= 500 ? 'ERROR' : 'WARN', 'Super-admin mutation handler failed', {
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
    ALLOWED_ACTIONS,
    ACTION_ROLE_ALLOWLIST,
    applyAdminMutation,
    assertActionAllowed,
    superAdminMutationHandler
};
