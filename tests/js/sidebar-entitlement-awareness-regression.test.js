/**
 * Sidebar entitlement awareness regression tests
 *
 * Covers Phase 5 Milestone 1 Step 4:
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

function buildAccountStatusSummary(rawState, backendConfigured) {
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
    const activeMeta = [accountState.subscriptionStatus, accountState.trialStatus, syncLabel].filter(Boolean);

    if (isConnected && accountState.entitlements.analysisAllowed !== true) {
        let message = 'This site is connected, but analysis is not available for the current account state. Add credits or update the plan in your AiVI account.';
        if (accountState.entitlements.siteLimitReached || accountState.siteBindingStatus === 'limit_reached') {
            message = 'This site has reached the plan site limit. Remove another connected site or upgrade the plan in your AiVI account.';
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
            badge: accountState.trialStatus ? 'Trial active' : 'Plan active',
            title: planLabel,
            message: creditLabel || `${accountLabel} is connected and analysis is enabled for this site.`,
            detail: accountState.site.connectedDomain || accountLabel,
            meta: activeMeta
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
    test('disconnected state stays in fallback mode and does not block analysis', () => {
        const summary = buildAccountStatusSummary({
            connected: false,
            connectionStatus: 'disconnected'
        }, true);

        expect(summary.kind).toBe('fallback');
        expect(summary.shouldBlockAnalysis).toBe(false);
        expect(summary.badge).toBe('Local mode');
        expect(summary.detail).toBe('Backend configured');
    });

    test('pending connection state stays non-blocking during rollout', () => {
        const summary = buildAccountStatusSummary({
            connected: false,
            connectionStatus: 'pending'
        }, true);

        expect(summary.kind).toBe('fallback');
        expect(summary.shouldBlockAnalysis).toBe(false);
        expect(summary.badge).toBe('Connection pending');
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
        expect(summary.message).toContain('125,000 credits remaining');
        expect(summary.detail).toBe('example.com');
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
});
