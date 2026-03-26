(function () {
    const mockRoot = window.AIVI_ADMIN_MOCK || { accounts: [], accountDetails: {} };

    const sanitize = (value) => String(value || '').trim();
    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const normalizeInt = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    };
    const toIso = () => new Date().toISOString();
    const titleCase = (value, fallback) => {
        const raw = sanitize(value);
        if (!raw) return fallback || 'Unknown';
        return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    };
    const encodeCursor = (payload = {}) => btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    const decodeCursor = (cursor) => {
        const normalized = sanitize(cursor);
        if (!normalized) return { offset: 0 };
        try {
            const padded = normalized.replace(/-/g, '+').replace(/_/g, '/');
            const padLength = (4 - (padded.length % 4)) % 4;
            const parsed = JSON.parse(atob(`${padded}${'='.repeat(padLength)}`));
            return {
                offset: Math.max(0, normalizeInt(parsed && parsed.offset, 0))
            };
        } catch (error) {
            return { offset: 0 };
        }
    };
    const isVerifiedWebhookStatus = (value) => ['verified', 'success'].includes(sanitize(value).toLowerCase());
    const buildTopupLookupKey = (providerOrderId) => {
        const normalized = sanitize(providerOrderId);
        return normalized ? `topup#${normalized}` : '';
    };
    const buildSubscriptionLookupKey = (providerSubscriptionId) => {
        const normalized = sanitize(providerSubscriptionId);
        return normalized ? `subscription#${normalized}` : '';
    };

    const resolvePreviewWebhookStatus = (eventRecord = {}, recentSubscriptions = [], recentTopups = [], recentCheckoutIntents = []) => {
        const summary = eventRecord.reconciliation_summary || {};
        const resource = eventRecord.raw_event?.resource || {};
        const providerSubscriptionId = sanitize(summary.provider_subscription_id || resource.id);
        const providerOrderId = sanitize(summary.provider_order_id || resource.supplementary_data?.related_ids?.order_id);
        const lookupKey = providerOrderId
            ? buildTopupLookupKey(providerOrderId)
            : buildSubscriptionLookupKey(providerSubscriptionId);
        const matchedIntent = lookupKey
            ? recentCheckoutIntents.find((item) => sanitize(item.lookup_key) === lookupKey)
            : null;
        const hasSubscriptionEvidence = !!providerSubscriptionId
            && recentSubscriptions.some((item) => sanitize(item.provider_subscription_id) === providerSubscriptionId);
        const hasTopupEvidence = !!providerOrderId
            && recentTopups.some((item) => sanitize(item.provider_order_id) === providerOrderId);
        const hasCapturedIntentEvidence = matchedIntent
            && ['captured_pending_webhook', 'captured', 'credited'].includes(sanitize(matchedIntent.status).toLowerCase());

        if (eventRecord.processed === true) {
            return {
                processed: true,
                processing_state: 'processed',
                replay_eligible: false
            };
        }

        if (hasSubscriptionEvidence || hasTopupEvidence || hasCapturedIntentEvidence) {
            return {
                processed: true,
                processing_state: 'reconciled',
                replay_eligible: false
            };
        }

        if (eventRecord.error_summary) {
            return {
                processed: false,
                processing_state: 'failed',
                replay_eligible: isVerifiedWebhookStatus(eventRecord.verification_status)
            };
        }

        if (!isVerifiedWebhookStatus(eventRecord.verification_status)) {
            return {
                processed: false,
                processing_state: 'verification_failed',
                replay_eligible: false
            };
        }

        return {
            processed: false,
            processing_state: 'pending',
            replay_eligible: true
        };
    };

    const applyFilters = (items, filters) => {
        const query = sanitize(filters.query).toLowerCase();
        const planCode = sanitize(filters.planCode).toLowerCase();
        const subscriptionStatus = sanitize(filters.subscriptionStatus).toLowerCase();

        return items.filter((item) => {
            if (planCode && sanitize(item.plan_code).toLowerCase() !== planCode) return false;
            if (subscriptionStatus && sanitize(item.subscription_status).toLowerCase() !== subscriptionStatus) return false;
            if (query) {
                const haystack = [
                    item.account_label,
                    item.account_id,
                    item.connected_domain,
                    item.contact_email
                ].map((part) => sanitize(part).toLowerCase()).join(' ');
                if (!haystack.includes(query)) return false;
            }
            return true;
        });
    };

    const ensureAuditTrail = (detail) => {
        if (!detail.audit) detail.audit = {};
        if (!Array.isArray(detail.audit.recent_events)) detail.audit.recent_events = [];
        if (!detail.audit.source) detail.audit.source = 'preview_mode';
    };

    const syncSummaryFromDetail = (detail) => ({
        account_id: detail.account_id,
        account_label: detail.account_label,
        contact_email: detail.contact_email || '',
        plan_code: detail.plan?.plan_code || '',
        plan_name: detail.plan?.plan_name || '',
        subscription_status: detail.plan?.subscription_status || 'unknown',
        trial_status: detail.plan?.trial_status || 'none',
        credits_remaining: normalizeInt(detail.credits?.total_remaining),
        site_count: Array.isArray(detail.sites) ? detail.sites.length : 0,
        connected_domain: detail.sites?.[0]?.connected_domain || '',
        updated_at: detail.audit?.generated_at || toIso()
    });

    const appendPreviewAuditEvent = (detail, payload, effect) => {
        ensureAuditTrail(detail);
        detail.audit.generated_at = toIso();
        detail.audit.recent_events.unshift({
            event_id: `audit_${Date.now()}`,
            actor_id: 'preview-admin',
            actor_role: 'super_admin',
            action: sanitize(payload.action),
            target_type: 'account',
            target_id: detail.account_id,
            reason: sanitize(payload.reason),
            status: 'completed',
            created_at: detail.audit.generated_at,
            updated_at: detail.audit.generated_at,
            metadata: effect || {}
        });
        detail.audit.recent_events = detail.audit.recent_events.slice(0, 10);
    };

    const buildPreviewDiagnostics = (accountId, filters = {}) => {
        const detail = mockRoot.accountDetails ? mockRoot.accountDetails[accountId] : null;
        if (!detail) {
            const error = new Error('Account not found in preview data.');
            error.statusCode = 404;
            throw error;
        }
        const lookupKey = sanitize(filters.checkoutLookupKey || filters.lookupKey);
        const site = detail.sites?.[0] || {};
        const sameDomainConflicts = (mockRoot.accountDetails ? Object.values(mockRoot.accountDetails) : [])
            .filter((item) => sanitize(item.account_id) !== sanitize(accountId))
            .filter((item) => {
                const otherSite = item.sites?.[0] || {};
                return sanitize(site.site_id) && sanitize(otherSite.site_id) === sanitize(site.site_id)
                    || (sanitize(site.connected_domain) && sanitize(otherSite.connected_domain).toLowerCase() === sanitize(site.connected_domain).toLowerCase());
            })
            .map((item) => ({
                account_id: item.account_id,
                account_label: item.account_label,
                site_id: item.sites?.[0]?.site_id || '',
                connected_domain: item.sites?.[0]?.connected_domain || '',
                subscription_status: item.plan?.subscription_status || 'unknown',
                updated_at: item.audit?.generated_at || toIso()
            }));

        const recentSubscriptions = detail.billing_health?.recent_subscriptions || [];
        const recentTopups = detail.billing_health?.recent_topups || [];
        const recentCheckoutIntents = detail.billing_health?.recent_checkout_intents || [];
        const webhooks = (detail.billing_health?.recent_webhooks || []).map((eventRecord) => ({
            ...eventRecord,
            ...resolvePreviewWebhookStatus(eventRecord, recentSubscriptions, recentTopups, recentCheckoutIntents),
            relevant: true
        }));

        const matchedIntent = lookupKey
            ? (detail.billing_health?.recent_checkout_intents || []).find((item) => sanitize(item.lookup_key) === lookupKey) || null
            : null;

        const blocked = [];
        if (sanitize(detail.plan?.subscription_status).toLowerCase() === 'suspended') blocked.push('analysis_not_allowed');
        if (normalizeInt(detail.credits?.total_remaining) <= 0) blocked.push('insufficient_credits');

        const runIssues = [];
        if (sanitize(detail.usage?.last_run_status).toLowerCase() && !['success', 'success_partial', 'pass'].includes(sanitize(detail.usage.last_run_status).toLowerCase())) {
            runIssues.push({
                run_id: `preview_${accountId}`,
                status: sanitize(detail.usage.last_run_status).toLowerCase(),
                created_at: sanitize(detail.usage.last_analysis_at) || toIso(),
                updated_at: sanitize(detail.usage.last_analysis_at) || toIso(),
                source: 'preview_console',
                content_type: 'article',
                billing_summary: null
            });
        }

        return {
            item: {
                account_id: accountId,
                generated_at: toIso(),
                actor_role: 'super_admin',
                webhook_delivery_history: webhooks,
                webhook_health: {
                    replay_eligible_count: webhooks.filter((item) => item.replay_eligible).length,
                    failed_count: webhooks.filter((item) => !!item.error_summary).length
                },
                checkout_lookup: {
                    lookup_key: lookupKey,
                    recent_intents: detail.billing_health?.recent_checkout_intents || [],
                    matched_intent: matchedIntent
                },
                subscription_state: {
                    recent_subscriptions: recentSubscriptions,
                    recent_topups: recentTopups,
                    reconciliation_status: webhooks.some((item) => ['failed', 'verification_failed', 'pending'].includes(sanitize(item.processing_state))) ? 'attention' : 'healthy'
                },
                recent_failures: {
                    run_issues: runIssues,
                    blocked_admission: {
                        blocked: blocked.length > 0,
                        blockers: blocked
                    }
                },
                site_binding_conflicts: sameDomainConflicts
            }
        };
    };

    const runPreviewRecovery = (accountId, payload = {}) => {
        const detail = mockRoot.accountDetails ? mockRoot.accountDetails[accountId] : null;
        if (!detail) {
            const error = new Error('Account not found in preview data.');
            error.statusCode = 404;
            throw error;
        }
        const action = sanitize(payload.action);
        const reason = sanitize(payload.reason);
        const webhookEventId = sanitize(payload.webhook_event_id);
        if (!action || !reason || !webhookEventId) {
            throw new Error('Recovery action, reason, and webhook event ID are required.');
        }
        const target = (detail.billing_health?.recent_webhooks || []).find((item) => sanitize(item.event_id) === webhookEventId);
        if (!target) {
            const error = new Error('No matching webhook event was found for this account.');
            error.statusCode = 404;
            throw error;
        }
        if (target.replay_eligible !== true) {
            const error = new Error('This webhook event is not eligible for replay.');
            error.statusCode = 409;
            throw error;
        }
        target.processed = true;
        target.processed_at = toIso();
        target.processing_state = 'processed';
        target.replay_eligible = false;
        target.error_summary = null;
        target.reconciliation_summary = target.reconciliation_summary || {};
        appendPreviewAuditEvent(detail, {
            action,
            reason
        }, {
            webhook_event_id: webhookEventId,
            resource_type: target.event_type || 'other'
        });
        mockRoot.accountDetails[accountId] = detail;
        mockRoot.accounts = (mockRoot.accounts || []).map((item) => (
            sanitize(item.account_id) === sanitize(accountId)
                ? syncSummaryFromDetail(detail)
                : item
        ));
        return {
            ok: true,
            action,
            audit_event_id: detail.audit?.recent_events?.[0]?.event_id || '',
            effect: {
                webhook_event_id: webhookEventId,
                resource_type: target.event_type || 'other'
            }
        };
    };

    const mutatePreviewDetail = (detail, payload) => {
        const action = sanitize(payload.action);
        const reason = sanitize(payload.reason);
        if (!action) throw new Error('Action is required.');
        if (!reason) throw new Error('Reason is required.');

        const next = JSON.parse(JSON.stringify(detail));
        if (!next.plan) next.plan = {};
        if (!next.credits) next.credits = {};
        if (!next.usage) next.usage = {};
        if (!Array.isArray(next.sites)) next.sites = [];
        ensureAuditTrail(next);

        let effect = {};

        if (action === 'manual_credit_adjustment') {
            const delta = normalizeInt(payload.credits_delta);
            if (!delta) throw new Error('A non-zero credits delta is required.');
            const currentTotal = normalizeInt(next.credits.total_remaining);
            if (delta < 0 && Math.abs(delta) > currentTotal) {
                throw new Error('The requested credit deduction exceeds the current remaining balance.');
            }
            if (delta > 0) {
                next.credits.topup_remaining = normalizeInt(next.credits.topup_remaining) + delta;
            } else {
                let remainingDebit = Math.abs(delta);
                const topupDebit = Math.min(normalizeInt(next.credits.topup_remaining), remainingDebit);
                next.credits.topup_remaining = Math.max(normalizeInt(next.credits.topup_remaining) - topupDebit, 0);
                remainingDebit -= topupDebit;
                if (remainingDebit > 0) {
                    const includedDebit = Math.min(normalizeInt(next.credits.included_remaining), remainingDebit);
                    next.credits.included_remaining = Math.max(normalizeInt(next.credits.included_remaining) - includedDebit, 0);
                    remainingDebit -= includedDebit;
                }
            }
            next.credits.total_remaining = normalizeInt(next.credits.included_remaining) + normalizeInt(next.credits.topup_remaining);
            if (!Array.isArray(next.credit_ledger_summary?.recent_events)) {
                next.credit_ledger_summary = next.credit_ledger_summary || {};
                next.credit_ledger_summary.recent_events = [];
            }
            next.credit_ledger_summary.recent_events.unshift({
                event_id: `ledger_${Date.now()}`,
                event_type: 'adjustment',
                status: 'settled',
                reason_code: 'manual_credit_adjustment',
                amounts: {
                    granted_credits: delta > 0 ? delta : 0,
                    reserved_credits: 0,
                    settled_credits: delta < 0 ? Math.abs(delta) : 0,
                    refunded_credits: 0
                },
                created_at: toIso(),
                updated_at: toIso()
            });
            next.credit_ledger_summary.recent_events = next.credit_ledger_summary.recent_events.slice(0, 10);
            effect = {
                credits_delta: delta,
                balance_after: next.credits.total_remaining
            };
        } else if (action === 'extend_trial') {
            const trialDays = Math.max(1, Math.min(90, normalizeInt(payload.trial_days, 7) || 7));
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + trialDays);
            next.plan.trial_status = 'active';
            next.plan.subscription_status = next.plan.subscription_status || 'trial';
            next.plan.trial_expires_at = expiresAt.toISOString();
            effect = {
                trial_status: 'active',
                trial_expires_at: next.plan.trial_expires_at
            };
        } else if (action === 'end_trial') {
            if (sanitize(next.plan.subscription_status).toLowerCase() === 'created'
                && (sanitize(next.plan.trial_status).toLowerCase() === 'active' || sanitize(next.plan.plan_code).toLowerCase() === 'free_trial')) {
                throw new Error('This account is waiting for subscription activation. Use Recheck activation or Clear activation hold instead of ending the trial.');
            }
            next.plan.trial_status = 'ended';
            next.plan.trial_expires_at = toIso();
            effect = {
                trial_status: 'ended'
            };
        } else if (action === 'plan_override') {
            const targetPlanCode = sanitize(payload.target_plan_code).toLowerCase();
            const catalog = {
                starter: { code: 'starter', label: 'Starter', max_sites: 1 },
                growth: { code: 'growth', label: 'Growth', max_sites: 3 },
                pro: { code: 'pro', label: 'Pro', max_sites: 10 }
            };
            const target = catalog[targetPlanCode];
            if (!target) throw new Error('A valid paid target plan is required.');
            next.plan.plan_code = target.code;
            next.plan.plan_name = target.label;
            next.plan.subscription_status = 'active';
            next.plan.max_sites = target.max_sites;
            effect = {
                plan_code: target.code,
                max_sites: target.max_sites
            };
        } else if (action === 'issue_connection_token') {
            const connectionDays = Math.max(1, Math.min(30, normalizeInt(payload.connection_days, 7) || 7));
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + connectionDays);
            effect = {
                connection_token: `preview.token.${sanitize(detail.account_id || 'account')}.${Date.now()}`,
                expires_at: expiresAt.toISOString(),
                max_sites: normalizeInt(next.plan?.max_sites, 1) || 1
            };
        } else if (action === 'subscription_resync') {
            if (sanitize(next.plan.subscription_status).toLowerCase() === 'created'
                && (sanitize(next.plan.trial_status).toLowerCase() === 'active' || sanitize(next.plan.plan_code).toLowerCase() === 'free_trial')) {
                next.plan.subscription_status = 'trial';
                effect = {
                    resync_requested: true,
                    reconciled: true,
                    subscription_status: 'trial'
                };
            } else {
                effect = {
                    resync_requested: true,
                    reconciled: false
                };
            }
        } else if (action === 'clear_activation_hold') {
            if (sanitize(next.plan.subscription_status).toLowerCase() !== 'created') {
                throw new Error('Only stale activation holds can be cleared manually.');
            }
            next.plan.subscription_status = sanitize(next.plan.trial_status).toLowerCase() === 'active' || sanitize(next.plan.plan_code).toLowerCase() === 'free_trial'
                ? 'trial'
                : next.plan.subscription_status;
            effect = {
                activation_hold_cleared: true,
                subscription_status: next.plan.subscription_status
            };
        } else if (action === 'site_unbind') {
            const targetSiteId = sanitize(payload.site_id);
            next.sites = targetSiteId
                ? (next.sites || []).filter((site) => sanitize(site.site_id) !== targetSiteId)
                : [];
            effect = {
                site_binding_status: next.sites.length ? 'connected' : 'unbound',
                remaining_site_count: (next.sites || []).length
            };
        } else if (action === 'account_pause') {
            next.plan.subscription_status = 'paused';
            effect = {
                subscription_status: 'paused'
            };
        } else if (action === 'account_restore') {
            next.plan.subscription_status = next.plan.plan_code ? 'active' : (next.plan.subscription_status || 'active');
            effect = {
                subscription_status: next.plan.subscription_status
            };
        } else {
            throw new Error('Unsupported action.');
        }

        appendPreviewAuditEvent(next, payload, effect);
        return { detail: next, effect };
    };

    const createPreviewClient = () => ({
        async listAccounts(filters = {}) {
            await delay(120);
            const items = applyFilters(mockRoot.accounts || [], filters);
            const limit = Math.max(1, normalizeInt(filters.limit, 25) || 25);
            const offset = decodeCursor(filters.cursor).offset;
            const pageItems = items.slice(offset, offset + limit);
            const nextOffset = offset + pageItems.length;
            return {
                items: pageItems,
                page: {
                    count: pageItems.length,
                    limit,
                    total_count: items.length,
                    page_start: pageItems.length > 0 ? offset + 1 : 0,
                    page_end: offset + pageItems.length,
                    next_cursor: nextOffset < items.length ? encodeCursor({ offset: nextOffset }) : null
                }
            };
        },
        async getAccountDetail(accountId) {
            await delay(120);
            const item = mockRoot.accountDetails ? mockRoot.accountDetails[accountId] : null;
            if (!item) {
                const error = new Error('Account not found in preview data.');
                error.statusCode = 404;
                throw error;
            }
            return { item };
        },
        async getFinancialOverview() {
            await delay(120);
            return {
                item: mockRoot.financialOverview || null
            };
        },
        async mutateAccount(accountId, payload = {}) {
            await delay(160);
            const detail = mockRoot.accountDetails ? mockRoot.accountDetails[accountId] : null;
            if (!detail) {
                const error = new Error('Account not found in preview data.');
                error.statusCode = 404;
                throw error;
            }
            const { detail: nextDetail, effect } = mutatePreviewDetail(detail, payload);
            mockRoot.accountDetails[accountId] = nextDetail;
            mockRoot.accounts = (mockRoot.accounts || []).map((item) => (
                sanitize(item.account_id) === sanitize(accountId)
                    ? syncSummaryFromDetail(nextDetail)
                    : item
            ));
            return {
                ok: true,
                action: sanitize(payload.action),
                audit_event_id: nextDetail.audit?.recent_events?.[0]?.event_id || '',
                effect,
                item: nextDetail
            };
        },
        async getAccountDiagnostics(accountId, filters = {}) {
            await delay(140);
            return buildPreviewDiagnostics(accountId, filters);
        },
        async runRecoveryAction(accountId, payload = {}) {
            await delay(160);
            return runPreviewRecovery(accountId, payload);
        }
    });

    const buildQueryString = (filters = {}) => {
        const params = new URLSearchParams();
        if (sanitize(filters.query)) params.set('q', sanitize(filters.query));
        if (sanitize(filters.planCode)) params.set('plan_code', sanitize(filters.planCode));
        if (sanitize(filters.subscriptionStatus)) params.set('subscription_status', sanitize(filters.subscriptionStatus));
        if (sanitize(filters.cursor)) params.set('cursor', sanitize(filters.cursor));
        if (normalizeInt(filters.limit, 0) > 0) params.set('limit', String(normalizeInt(filters.limit, 0)));
        if (sanitize(filters.checkoutLookupKey)) params.set('checkout_lookup_key', sanitize(filters.checkoutLookupKey));
        return params.toString();
    };

    const createApiClient = ({ baseUrl, bootstrapToken, accessToken, idToken }) => {
        const normalizedBase = sanitize(baseUrl).replace(/\/$/, '');
        const baseHeaders = {};
        const bearerToken = sanitize(idToken) || sanitize(accessToken);
        if (bearerToken) {
            baseHeaders.Authorization = `Bearer ${bearerToken}`;
        } else if (sanitize(bootstrapToken)) {
            baseHeaders['x-aivi-admin-token'] = sanitize(bootstrapToken);
        }

        const request = async (method, path, body) => {
            const headers = { ...baseHeaders };
            if (body !== undefined) {
                headers['Content-Type'] = 'application/json';
            }
            const response = await fetch(`${normalizedBase}${path}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(payload.message || 'Admin API request failed.');
                error.statusCode = response.status;
                error.payload = payload;
                throw error;
            }
            return payload;
        };

        return {
            async listAccounts(filters = {}) {
                const query = buildQueryString(filters);
                return request('GET', `/aivi/v1/admin/accounts${query ? `?${query}` : ''}`);
            },
            async getAccountDetail(accountId) {
                return request('GET', `/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}`);
            },
            async getFinancialOverview() {
                return request('GET', '/aivi/v1/admin/financials/overview');
            },
            async mutateAccount(accountId, payload = {}) {
                return request('POST', `/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}/actions`, payload);
            },
            async getAccountDiagnostics(accountId, filters = {}) {
                const query = buildQueryString(filters);
                return request('GET', `/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}/diagnostics${query ? `?${query}` : ''}`);
            },
            async runRecoveryAction(accountId, payload = {}) {
                return request('POST', `/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}/diagnostics/recovery`, payload);
            }
        };
    };

    window.AiviAdminApi = {
        createPreviewClient,
        createApiClient
    };
})();
