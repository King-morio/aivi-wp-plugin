/**
 * Sidebar entitlement awareness regression tests
 *
 * Covers sidebar entitlement-awareness gating:
 * - disconnected sites remain on fallback/backend mode
 * - connected sites with no entitlement are blocked
 * - connected entitled sites remain actionable
 */

function normalizeAccountState(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const credits = input.credits && typeof input.credits === 'object' ? input.credits : {};
    const entitlements = input.entitlements && typeof input.entitlements === 'object' ? input.entitlements : {};
    const site = input.site && typeof input.site === 'object' ? input.site : {};
    const normalizeInt = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    return {
        connected: input.connected === true,
        connectionStatus: ['disconnected', 'pending', 'connected', 'revoked', 'error'].includes(String(input.connectionStatus || '').toLowerCase())
            ? String(input.connectionStatus || '').toLowerCase()
            : 'disconnected',
        accountLabel: String(input.accountLabel || '').trim(),
        planCode: String(input.planCode || '').trim(),
        planName: String(input.planName || '').trim(),
        subscriptionStatus: String(input.subscriptionStatus || '').trim(),
        trialStatus: String(input.trialStatus || '').trim(),
        siteBindingStatus: String(input.siteBindingStatus || '').trim(),
        updatedAt: String(input.updatedAt || '').trim(),
        credits: {
            includedRemaining: normalizeInt(credits.includedRemaining),
            topupRemaining: normalizeInt(credits.topupRemaining),
            lastRunDebit: normalizeInt(credits.lastRunDebit)
        },
        entitlements: {
            analysisAllowed: entitlements.analysisAllowed === true,
            webLookupsAllowed: entitlements.webLookupsAllowed === true,
            maxSites: normalizeInt(entitlements.maxSites),
            siteLimitReached: entitlements.siteLimitReached === true
        },
        site: {
            siteId: String(site.siteId || '').trim(),
            blogId: normalizeInt(site.blogId),
            connectedDomain: String(site.connectedDomain || '').trim(),
            pluginVersion: String(site.pluginVersion || '').trim()
        }
    };
}

function formatCreditCount(value) {
    return new Intl.NumberFormat().format(value);
}

function formatAccountSyncLabel(value) {
    const parsed = new Date(String(value || '').trim());
    if (Number.isNaN(parsed.getTime())) return '';
    return `Last sync ${parsed.toLocaleString()}`;
}

function humanizeAccountStateLabel(value, fallback) {
    const input = String(value || '').trim();
    if (!input) return String(fallback || '').trim();
    if (input.toLowerCase() === 'success_partial') return 'Success';
    return input
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildAccountStatusSummary(rawState, backendConfigured, allowUnboundAnalysis = false, uiConfig = {}) {
    const accountState = normalizeAccountState(rawState);
    const isConnected = accountState.connected && accountState.connectionStatus === 'connected';
    const totalCredits = [accountState.credits.includedRemaining, accountState.credits.topupRemaining]
        .filter((value) => Number.isFinite(value))
        .reduce((sum, value) => sum + value, 0);
    const hasCreditBalance = [accountState.credits.includedRemaining, accountState.credits.topupRemaining].some((value) => Number.isFinite(value));
    const creditLabel = hasCreditBalance ? `${formatCreditCount(totalCredits)} credits remaining` : '';
    const planLabel = accountState.planName || accountState.planCode || 'Connected plan';
    const accountLabel = accountState.accountLabel || 'AiVI account';
    const syncLabel = formatAccountSyncLabel(accountState.updatedAt);
    const verificationMeta = uiConfig.webLookupsEnabled === true && accountState.entitlements.webLookupsAllowed === true
        ? 'External verification enabled (may take longer)'
        : '';
    const normalizedSubscriptionStatus = String(accountState.subscriptionStatus || '').trim().toLowerCase();
    const normalizedTrialStatus = String(accountState.trialStatus || '').trim().toLowerCase();
    const isTrialActive = normalizedTrialStatus === 'active' && normalizedSubscriptionStatus === 'trial';
    const stateLabel = isTrialActive
        ? 'Trial active'
        : normalizedSubscriptionStatus
            ? humanizeAccountStateLabel(normalizedSubscriptionStatus, 'Active')
            : 'Active';
    const activeMeta = [syncLabel, verificationMeta].filter(Boolean);

    if (isConnected && accountState.entitlements.analysisAllowed !== true) {
        let message = 'This site is connected, but analysis is not available for the current account state. Add credits or update the plan in your AiVI account.';
        if (accountState.entitlements.siteLimitReached || accountState.siteBindingStatus === 'limit_reached') {
            message = 'This site has reached the plan site limit. Remove another connected site or upgrade the plan in your AiVI account.';
        } else if (normalizedSubscriptionStatus === 'paused') {
            message = 'This connected AiVI account is paused. Resume the plan or change it in your AiVI account before running analysis.';
        } else if (normalizedSubscriptionStatus === 'suspended' || normalizedSubscriptionStatus === 'payment_failed') {
            message = 'This connected AiVI account needs billing attention. Update the plan in your AiVI account to restore analysis.';
        } else if (normalizedSubscriptionStatus === 'expired' || normalizedTrialStatus === 'expired') {
            message = 'This AiVI trial or plan has ended. Choose a paid plan in your AiVI account to restore analysis on this site.';
        } else if (hasCreditBalance && totalCredits <= 0) {
            message = 'This connected account has no analysis credits remaining. Add credits or move to a plan with capacity before running analysis.';
        }
        return {
            kind: 'blocked',
            shouldBlockAnalysis: true,
            badge: 'Access required',
            title: 'Analysis unavailable for this site',
            message,
            detail: planLabel,
            meta: [accountLabel, ...activeMeta].filter(Boolean)
        };
    }

    if (isConnected) {
        return {
            kind: 'connected',
            shouldBlockAnalysis: false,
            badge: isTrialActive ? 'Trial active' : 'Plan active',
            title: planLabel,
            message: creditLabel || `${accountLabel} is connected and analysis is enabled for this site.`,
            detail: accountState.site.connectedDomain || accountLabel,
            meta: activeMeta,
            planState: stateLabel
        };
    }

    if (!allowUnboundAnalysis && accountState.connectionStatus === 'pending') {
        return {
            kind: 'blocked',
            shouldBlockAnalysis: true,
            badge: 'Connection pending',
            title: 'Finish connecting this site',
            message: 'AiVI is waiting for this site connection to complete before analysis can start.',
            detail: 'Open AiVI settings to continue onboarding',
            meta: [syncLabel].filter(Boolean)
        };
    }

    if (!allowUnboundAnalysis && (accountState.connectionStatus === 'revoked' || accountState.connectionStatus === 'error')) {
        return {
            kind: 'blocked',
            shouldBlockAnalysis: true,
            badge: 'Connection required',
            title: 'Reconnect this site to AiVI',
            message: 'This site needs an active AiVI account connection before analysis can continue.',
            detail: 'Open AiVI settings to resolve the account connection',
            meta: [syncLabel].filter(Boolean)
        };
    }

    if (!allowUnboundAnalysis) {
        return {
            kind: 'blocked',
            shouldBlockAnalysis: true,
            badge: 'Connection required',
            title: 'Connect this site to AiVI',
            message: 'Connect this site to an AiVI account, then start a trial or choose a plan before running analysis.',
            detail: 'Billing and analysis unlock after connection',
            meta: [syncLabel].filter(Boolean)
        };
    }

    if (accountState.connectionStatus === 'pending') {
        return {
            kind: 'fallback',
            shouldBlockAnalysis: false,
            badge: 'Connection pending',
            title: 'Direct backend mode active',
            message: 'Site connection is not complete yet. Analysis still uses the configured backend while account linking rolls out.',
            detail: backendConfigured === true ? 'Backend configured' : 'Backend setup required',
            meta: [syncLabel].filter(Boolean)
        };
    }

    if (accountState.connectionStatus === 'revoked' || accountState.connectionStatus === 'error') {
        return {
            kind: 'fallback',
            shouldBlockAnalysis: false,
            badge: 'Connection needs attention',
            title: 'Direct backend mode active',
            message: 'The stored account connection needs attention. Analysis continues through the configured backend until account control is fully active.',
            detail: backendConfigured === true ? 'Backend configured' : 'Backend setup required',
            meta: [syncLabel].filter(Boolean)
        };
    }

    return {
        kind: 'fallback',
        shouldBlockAnalysis: false,
        badge: 'Local mode',
        title: 'Direct backend mode active',
        message: backendConfigured === true
            ? 'This site is not connected to an AiVI account yet. Analysis still runs through the configured backend during migration.'
            : 'Connect an AiVI account or configure a backend URL before running analysis on this site.',
        detail: backendConfigured === true ? 'Backend configured' : 'Backend setup required',
        meta: [syncLabel].filter(Boolean)
    };
}

describe('Sidebar entitlement awareness', () => {
    test('disconnected state blocks analysis by default', () => {
        const summary = buildAccountStatusSummary({
            connected: false,
            connectionStatus: 'disconnected'
        }, true);

        expect(summary.kind).toBe('blocked');
        expect(summary.shouldBlockAnalysis).toBe(true);
        expect(summary.badge).toBe('Connection required');
        expect(summary.title).toBe('Connect this site to AiVI');
    });

    test('pending connection state blocks analysis by default', () => {
        const summary = buildAccountStatusSummary({
            connected: false,
            connectionStatus: 'pending'
        }, true);

        expect(summary.kind).toBe('blocked');
        expect(summary.shouldBlockAnalysis).toBe(true);
        expect(summary.badge).toBe('Connection pending');
    });

    test('dev/staging override keeps disconnected state non-blocking', () => {
        const summary = buildAccountStatusSummary({
            connected: false,
            connectionStatus: 'disconnected'
        }, true, true);

        expect(summary.kind).toBe('fallback');
        expect(summary.shouldBlockAnalysis).toBe(false);
        expect(summary.badge).toBe('Local mode');
    });

    test('connected entitled account remains actionable and shows credit balance', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            planName: 'Growth',
            accountLabel: 'AiVI Workspace',
            credits: { includedRemaining: 120000, topupRemaining: 5000 },
            entitlements: { analysisAllowed: true },
            site: { connectedDomain: 'example.com' }
        }, true);

        expect(summary.kind).toBe('connected');
        expect(summary.shouldBlockAnalysis).toBe(false);
        expect(summary.title).toBe('Growth');
        expect(summary.badge).toBe('Plan active');
        expect(summary.message).toContain('125,000 credits remaining');
        expect(summary.detail).toBe('example.com');
    });

    test('connected paid account does not keep stale trial-active labeling after conversion', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            planName: 'Growth',
            subscriptionStatus: 'active',
            trialStatus: 'converted',
            entitlements: { analysisAllowed: true }
        }, true);

        expect(summary.badge).toBe('Plan active');
        expect(summary.planState).toBe('Active');
    });

    test('connected entitled account shows web verification note only when enabled and allowed', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            planName: 'Growth',
            entitlements: { analysisAllowed: true, webLookupsAllowed: true }
        }, true, false, { webLookupsEnabled: true });

        expect(summary.meta).toContain('External verification enabled (may take longer)');

        const disabledSummary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            planName: 'Growth',
            entitlements: { analysisAllowed: true, webLookupsAllowed: true }
        }, true, false, { webLookupsEnabled: false });

        expect(disabledSummary.meta).not.toContain('External verification enabled (may take longer)');
    });

    test('connected account with analysis disabled is blocked', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            planName: 'Starter',
            entitlements: { analysisAllowed: false }
        }, true);

        expect(summary.kind).toBe('blocked');
        expect(summary.shouldBlockAnalysis).toBe(true);
        expect(summary.title).toBe('Analysis unavailable for this site');
        expect(summary.detail).toBe('Starter');
    });

    test('site limit reached yields specific blocking copy', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            siteBindingStatus: 'limit_reached',
            entitlements: { analysisAllowed: false, siteLimitReached: true }
        }, true);

        expect(summary.shouldBlockAnalysis).toBe(true);
        expect(summary.message).toContain('plan site limit');
    });

    test('zero-credit connected account yields credit-specific blocking copy', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            credits: { includedRemaining: 0, topupRemaining: 0 },
            entitlements: { analysisAllowed: false }
        }, true);

        expect(summary.shouldBlockAnalysis).toBe(true);
        expect(summary.message).toContain('no analysis credits remaining');
    });

    test('paused connected account gets pause-specific blocking copy', () => {
        const summary = buildAccountStatusSummary({
            connected: true,
            connectionStatus: 'connected',
            subscriptionStatus: 'paused',
            entitlements: { analysisAllowed: false }
        }, true);

        expect(summary.shouldBlockAnalysis).toBe(true);
        expect(summary.message).toContain('paused');
        expect(summary.message).toContain('Resume the plan');
    });
});
