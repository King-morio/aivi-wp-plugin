(function () {
    const runtime = window.AIVI_ADMIN_RUNTIME || {};
    const runtimeAuth = runtime.auth || {};
    const previewClient = window.AiviAdminApi.createPreviewClient();
    const STORAGE_KEYS = Object.freeze({
        pkceVerifier: 'aiviAdminPkceVerifier',
        pkceState: 'aiviAdminPkceState',
        authSession: 'aiviAdminAuthSession'
    });

    const state = {
        session: {
            mode: runtime.allowPreview === false ? 'api' : 'preview',
            baseUrl: runtime.apiBaseUrl || '',
            bootstrapToken: '',
            accessToken: '',
            idToken: '',
            tokenExpiry: 0,
            connected: runtime.allowPreview !== false
        },
        loading: false,
        error: '',
        filters: {
            query: '',
            planCode: '',
            subscriptionStatus: ''
        },
        accountListPage: {
            cursor: '',
            nextCursor: '',
            history: [],
            totalCount: 0,
            pageStart: 0,
            pageEnd: 0,
            limit: 25
        },
        browserFiltersOpen: false,
        accounts: [],
        selectedAccountId: '',
        accountDetail: null,
        financials: {
            overlayOpen: false,
            loading: false,
            item: null,
            error: ''
        },
        currentView: 'accounts',
        actionDraft: {
            action: 'manual_credit_adjustment',
            reason: '',
            creditsDelta: '5000',
            trialDays: '7',
            targetPlanCode: 'starter',
            connectionDays: '7',
            connectionLabel: ''
        },
        actionResult: null,
        lifecycleNotice: '',
        accountDiagnostics: null,
        diagnosticDraft: {
            checkoutLookupKey: ''
        },
        recoveryDraft: {
            action: 'replay_failed_webhook',
            webhookEventId: '',
            reason: ''
        },
        recoveryResult: null
    };

    const ACTION_OPTIONS = [
        { value: 'manual_credit_adjustment', label: 'Manual credit adjustment', context: 'Credits' },
        { value: 'extend_trial', label: 'Extend trial', context: 'Trial' },
        { value: 'end_trial', label: 'End trial', context: 'Trial' },
        { value: 'plan_override', label: 'Plan override', context: 'Plan' },
        { value: 'subscription_resync', label: 'Recheck activation', context: 'Support' },
        { value: 'clear_activation_hold', label: 'Clear activation hold', context: 'Support' },
        { value: 'issue_connection_token', label: 'Issue connection token', context: 'Sites' },
        { value: 'site_unbind', label: 'Site unbind', context: 'Sites' },
        { value: 'account_pause', label: 'Pause account', context: 'Support' },
        { value: 'account_restore', label: 'Restore account', context: 'Support' }
    ];

    const ACTION_HELP = {
        manual_credit_adjustment: 'Adds or deducts credits without changing the customer plan.',
        extend_trial: 'Moves the trial window forward without changing the paid subscription state.',
        end_trial: 'Ends the trial immediately. It does not clear stale activation holds; use Recheck activation or Clear activation hold for those.',
        plan_override: 'Switches the effective plan state for support or recovery purposes.',
        subscription_resync: 'Rechecks the provider subscription state and clears stale trial activation holds when PayPal confirms the activation did not continue.',
        clear_activation_hold: 'Clears a stale trial activation hold when provider reconciliation cannot resolve it safely on its own.',
        issue_connection_token: 'Issues a fresh operator-side connection token so the next site can bind to this account intentionally.',
        site_unbind: 'Removes the current site bindings so the customer can reconnect cleanly.',
        account_pause: 'Blocks analysis while preserving current credit and billing history.',
        account_restore: 'Restores access after a support or billing hold.'
    };

    const STATUS_TONES = {
        active: 'success',
        success: 'success',
        trial: 'warning',
        suspended: 'danger',
        blocked: 'danger',
        expired: 'danger',
        credited: 'success',
        connected: 'success'
    };

    const NAV_ITEMS = [
        { view: 'overview', label: 'Overview', hint: 'Session and auth', sectionId: 'section-overview' },
        { view: 'accounts', label: 'Accounts', hint: 'Customer state', sectionId: 'section-accounts' },
        { view: 'operations', label: 'Actions', hint: 'Mutations and recovery', sectionId: 'section-operations' },
        { view: 'diagnostics', label: 'Diagnostics', hint: 'Webhook and run health', sectionId: 'section-diagnostics' },
        { view: 'billing', label: 'Billing', hint: 'Credits and subscriptions', sectionId: 'section-billing' },
        { view: 'audit', label: 'Audit', hint: 'Operator history', sectionId: 'section-audit' }
    ];

    const formatNumber = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '0';
        return new Intl.NumberFormat().format(numeric);
    };

    const formatCurrencyUsd = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '—';
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(numeric);
    };

    const formatDate = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return 'Not available';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return raw;
        return date.toLocaleString();
    };

    const titleCase = (value, fallback) => {
        const raw = String(value || '').trim();
        if (!raw) return fallback || 'Not available';
        return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (typeof text === 'string') node.textContent = text;
        return node;
    };

    const clear = (node) => {
        while (node.firstChild) node.removeChild(node.firstChild);
    };

    const getClient = () => {
        if (state.session.mode === 'preview') {
            return previewClient;
        }
        if (state.session.mode === 'api' && state.session.connected && state.session.baseUrl) {
            return window.AiviAdminApi.createApiClient({
                baseUrl: state.session.baseUrl,
                bootstrapToken: state.session.bootstrapToken,
                accessToken: state.session.accessToken,
                idToken: state.session.idToken
            });
        }
        return null;
    };

    const requireClient = () => {
        const client = getClient();
        if (client) return client;
        if (state.session.mode !== 'api') {
            throw new Error('Admin API mode is not active.');
        }
        if (!state.session.baseUrl) {
            throw new Error('Admin API base URL is missing.');
        }
        if (isCognitoMode() && !state.session.accessToken) {
            throw new Error('Sign in with Cognito before using API mode.');
        }
        if (!state.session.connected) {
            throw new Error('Connect to the admin API before refreshing this view.');
        }
        throw new Error('Admin API session is not ready yet.');
    };

    const setError = (message) => {
        state.error = String(message || '').trim();
        render();
    };

    const setLoading = (value) => {
        state.loading = value === true;
        render();
    };

    const resolveSelectedAccount = () => state.accounts.find((item) => item.account_id === state.selectedAccountId) || null;
    const getSelectedActionOption = () => ACTION_OPTIONS.find((item) => item.value === state.actionDraft.action) || ACTION_OPTIONS[0];
    const actionNeedsCredits = () => state.actionDraft.action === 'manual_credit_adjustment';
    const actionNeedsTrialDays = () => state.actionDraft.action === 'extend_trial';
    const actionNeedsPlanCode = () => state.actionDraft.action === 'plan_override';
    const actionNeedsConnectionTokenOptions = () => state.actionDraft.action === 'issue_connection_token';
    const getActiveBrowserFilterCount = () => ['planCode', 'subscriptionStatus']
        .filter((key) => String(state.filters[key] || '').trim() !== '').length;
    const getAccountListSummary = () => {
        const page = state.accountListPage || {};
        const totalCount = Number(page.totalCount || 0);
        const pageStart = Number(page.pageStart || 0);
        const pageEnd = Number(page.pageEnd || 0);
        if (totalCount <= 0) {
            return 'No accounts match the current filters.';
        }
        if (pageStart > 0 && pageEnd > 0) {
            return `Showing ${pageStart}-${pageEnd} of ${totalCount} accounts`;
        }
        return `${totalCount} account${totalCount === 1 ? '' : 's'} loaded`;
    };

    const buildMutationPayload = () => {
        const payload = {
            action: state.actionDraft.action,
            reason: state.actionDraft.reason
        };
        if (actionNeedsCredits()) payload.credits_delta = Number(state.actionDraft.creditsDelta || 0);
        if (actionNeedsTrialDays()) payload.trial_days = Number(state.actionDraft.trialDays || 7);
        if (actionNeedsPlanCode()) payload.target_plan_code = state.actionDraft.targetPlanCode;
        if (actionNeedsConnectionTokenOptions()) {
            payload.connection_days = Number(state.actionDraft.connectionDays || 7);
            payload.connection_label = state.actionDraft.connectionLabel;
        }
        return payload;
    };
    const buildDiagnosticsQuery = () => ({
        checkoutLookupKey: state.diagnosticDraft.checkoutLookupKey
    });
    const buildRecoveryPayload = () => ({
        action: state.recoveryDraft.action,
        webhook_event_id: state.recoveryDraft.webhookEventId,
        reason: state.recoveryDraft.reason
    });

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    const isCognitoMode = () => runtimeAuth.mode === 'cognito_hosted_ui_pkce';
    const isBootstrapMode = () => runtimeAuth.mode === 'bootstrap_token_staging';
    const normalizeScopes = () => Array.isArray(runtimeAuth.scopes) && runtimeAuth.scopes.length
        ? runtimeAuth.scopes.join(' ')
        : 'openid email profile';
    const base64UrlEncode = (buffer) => btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    const createRandomString = (length = 64) => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const bytes = new Uint8Array(length);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
    };
    const sha256 = async (value) => window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const persistAuthSession = () => {
        if (!isCognitoMode()) return;
        window.sessionStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({
            accessToken: state.session.accessToken,
            idToken: state.session.idToken,
            tokenExpiry: state.session.tokenExpiry
        }));
    };
    const clearAuthSession = () => {
        window.sessionStorage.removeItem(STORAGE_KEYS.authSession);
        window.sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier);
        window.sessionStorage.removeItem(STORAGE_KEYS.pkceState);
        state.session.accessToken = '';
        state.session.idToken = '';
        state.session.tokenExpiry = 0;
        state.session.connected = false;
    };
    const restoreAuthSession = () => {
        if (!isCognitoMode()) return false;
        const raw = window.sessionStorage.getItem(STORAGE_KEYS.authSession);
        if (!raw) return false;
        try {
            const parsed = JSON.parse(raw);
            const tokenExpiry = Number(parsed.tokenExpiry || 0);
            if (!parsed.accessToken || !tokenExpiry || tokenExpiry <= Date.now() + 30000) {
                clearAuthSession();
                return false;
            }
            state.session.accessToken = String(parsed.accessToken || '');
            state.session.idToken = String(parsed.idToken || '');
            state.session.tokenExpiry = tokenExpiry;
            state.session.connected = true;
            return true;
        } catch (error) {
            clearAuthSession();
            return false;
        }
    };
    const buildAuthorizeUrl = async () => {
        const verifier = createRandomString(96);
        const stateToken = createRandomString(48);
        const challenge = base64UrlEncode(await sha256(verifier));
        window.sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier);
        window.sessionStorage.setItem(STORAGE_KEYS.pkceState, stateToken);
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: String(runtimeAuth.userPoolClientId || ''),
            redirect_uri: String(runtimeAuth.redirectUri || window.location.origin + window.location.pathname),
            scope: normalizeScopes(),
            state: stateToken,
            code_challenge_method: 'S256',
            code_challenge: challenge
        });
        if (runtimeAuth.audience && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(runtimeAuth.audience))) {
            params.set('resource', String(runtimeAuth.audience));
        }
        return `${String(runtimeAuth.cognitoDomain || '').replace(/\/$/, '')}/oauth2/authorize?${params.toString()}`;
    };
    const exchangeAuthorizationCode = async (code) => {
        const verifier = window.sessionStorage.getItem(STORAGE_KEYS.pkceVerifier);
        if (!verifier) {
            throw new Error('Missing PKCE verifier for the Cognito sign-in flow.');
        }
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: String(runtimeAuth.userPoolClientId || ''),
            code,
            redirect_uri: String(runtimeAuth.redirectUri || window.location.origin + window.location.pathname),
            code_verifier: verifier
        });
        const response = await fetch(`${String(runtimeAuth.cognitoDomain || '').replace(/\/$/, '')}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.access_token) {
            throw new Error(payload.error_description || payload.error || 'Failed to complete the Cognito sign-in flow.');
        }
        state.session.accessToken = String(payload.access_token || '');
        state.session.idToken = String(payload.id_token || '');
        state.session.tokenExpiry = Date.now() + (Number(payload.expires_in || 3600) * 1000);
        state.session.connected = true;
        persistAuthSession();
        window.sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier);
        window.sessionStorage.removeItem(STORAGE_KEYS.pkceState);
    };
    const handleAuthRedirect = async () => {
        if (!isCognitoMode()) return;
        const params = new URLSearchParams(window.location.search);
        const code = String(params.get('code') || '').trim();
        const returnedState = String(params.get('state') || '').trim();
        const authError = String(params.get('error') || '').trim();
        if (authError) {
            setError(params.get('error_description') || authError);
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        if (!code) {
            restoreAuthSession();
            return;
        }
        const expectedState = String(window.sessionStorage.getItem(STORAGE_KEYS.pkceState) || '').trim();
        if (!expectedState || expectedState !== returnedState) {
            clearAuthSession();
            setError('Cognito sign-in state validation failed.');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        try {
            await exchangeAuthorizationCode(code);
            state.error = '';
        } catch (error) {
            clearAuthSession();
            setError(error.message || 'Cognito sign-in failed.');
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    };
    const beginCognitoLogin = async () => {
        const authorizeUrl = await buildAuthorizeUrl();
        window.location.assign(authorizeUrl);
    };
    const beginCognitoLogout = () => {
        const logoutBase = String(runtimeAuth.logoutUrl || `${String(runtimeAuth.cognitoDomain || '').replace(/\/$/, '')}/logout`).replace(/\/$/, '');
        const params = new URLSearchParams({
            client_id: String(runtimeAuth.userPoolClientId || ''),
            logout_uri: String(runtimeAuth.postLogoutRedirectUri || runtimeAuth.redirectUri || window.location.origin + window.location.pathname)
        });
        clearAuthSession();
        render();
        window.location.assign(`${logoutBase}?${params.toString()}`);
    };

    const getAuthDirectionCopy = () => {
        const environment = runtime.environment || 'local';
        if (runtimeAuth.mode === 'bootstrap_token_staging') {
            return `Staging bootstrap-token access is active for this environment. Cognito Hosted UI + PKCE, MFA, and operator groups remain the long-term admin auth path. Runtime environment: ${environment}.`;
        }
        if (state.session.connected && state.session.accessToken) {
            return `AWS Cognito Hosted UI + PKCE is active for this session. MFA and operator groups are enforced by the admin API. Runtime environment: ${environment}.`;
        }
        return `AWS Cognito Hosted UI + PKCE, MFA, and operator groups are required for this environment. Runtime environment: ${environment}.`;
    };

    const getAccountRollup = () => {
        const accounts = Array.isArray(state.accounts) ? state.accounts : [];
        const financialOverview = state.financials.item;
        const snapshot = financialOverview?.snapshot || {};
        return {
            totalAccounts: Number(state.accountListPage.totalCount || snapshot.total_accounts || accounts.length || 0),
            activeAccounts: Number(snapshot.paid_accounts || accounts.filter((account) => String(account.subscription_status || '').toLowerCase() === 'active').length),
            trialAccounts: Number(snapshot.active_trials || accounts.filter((account) => String(account.subscription_status || '').toLowerCase() === 'trial').length),
            suspendedAccounts: Number(snapshot.suspended_paid_accounts || accounts.filter((account) => String(account.subscription_status || '').toLowerCase() === 'suspended').length),
            totalCredits: accounts.reduce((sum, account) => sum + (Number(account.credits_remaining) || 0), 0),
            projectedMrr: financialOverview ? formatCurrencyUsd(financialOverview.projected_recurring?.mrr_usd) : 'Open',
            alertCount: state.accountDiagnostics
                ? Number(state.accountDiagnostics.webhook_health?.failed_count || 0) + Number((state.accountDiagnostics.site_binding_conflicts || []).length)
                : 0
        };
    };

    const invalidateFinancialOverview = () => {
        state.financials.item = null;
        state.financials.loading = false;
        state.financials.error = '';
    };

    const loadFinancialOverview = async ({ rerender = true, suppressDisconnectedError = false } = {}) => {
        const client = getClient();
        if (!client || typeof client.getFinancialOverview !== 'function') {
            state.financials.item = null;
            state.financials.loading = false;
            if (!suppressDisconnectedError) {
                state.financials.error = state.session.mode === 'api' && !state.session.connected
                    ? 'Sign in with Cognito to load business-wide financials.'
                    : 'Financial overview is not available in this session.';
            }
            if (rerender) render();
            return null;
        }

        state.financials.loading = true;
        if (rerender) render();

        try {
            const response = await client.getFinancialOverview();
            state.financials.item = response.item || null;
            state.financials.error = '';
            return state.financials.item;
        } catch (error) {
            state.financials.item = null;
            state.financials.error = error.message || 'Could not load financial overview.';
            return null;
        } finally {
            state.financials.loading = false;
            if (rerender) render();
        }
    };

    const openFinancialsOverlay = async () => {
        state.financials.overlayOpen = true;
        render();
        window.requestAnimationFrame(() => {
            const closeButton = document.querySelector('.financials-overlay__close');
            if (closeButton && typeof closeButton.focus === 'function') {
                closeButton.focus({ preventScroll: true });
            }
        });
        await loadFinancialOverview({ rerender: true });
    };

    const closeFinancialsOverlay = () => {
        state.financials.overlayOpen = false;
        render();
        window.requestAnimationFrame(() => {
            const trigger = document.querySelector('.metric-card--button');
            if (trigger && typeof trigger.focus === 'function') {
                trigger.focus({ preventScroll: true });
            }
        });
    };

    const focusScrollablePane = (selector, { resetScroll = false } = {}) => {
        window.requestAnimationFrame(() => {
            const node = document.querySelector(selector);
            if (!node) return;
            if (resetScroll && typeof node.scrollTo === 'function') {
                node.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (typeof node.focus === 'function') {
                node.focus({ preventScroll: true });
            }
        });
    };

    const setCurrentView = (viewId) => {
        state.currentView = viewId;
        render();
        focusScrollablePane('.panel-scroll--workspace', { resetScroll: true });
    };

    const loadAccounts = async ({
        cursor,
        history,
        resetPaging = false,
        focusAccountList = false
    } = {}) => {
        setLoading(true);
        const requestedCursor = resetPaging
            ? ''
            : String(cursor !== undefined ? cursor : state.accountListPage.cursor || '').trim();
        const requestedHistory = resetPaging
            ? []
            : (Array.isArray(history) ? [...history] : [...(state.accountListPage.history || [])]);
        try {
            const client = requireClient();
            const response = await client.listAccounts({
                ...state.filters,
                cursor: requestedCursor,
                limit: state.accountListPage.limit || 25
            });
            state.accounts = Array.isArray(response.items) ? response.items : [];
            state.accountListPage = {
                ...state.accountListPage,
                cursor: requestedCursor,
                history: requestedHistory,
                nextCursor: String(response?.page?.next_cursor || '').trim(),
                totalCount: Number(response?.page?.total_count || state.accounts.length || 0),
                pageStart: Number(response?.page?.page_start || (state.accounts.length ? 1 : 0)),
                pageEnd: Number(response?.page?.page_end || state.accounts.length || 0),
                limit: Number(response?.page?.limit || state.accountListPage.limit || 25) || 25
            };
            invalidateFinancialOverview();
            if (!state.selectedAccountId || !state.accounts.some((item) => item.account_id === state.selectedAccountId)) {
                state.selectedAccountId = state.accounts[0] ? state.accounts[0].account_id : '';
            }
            state.error = '';
            await Promise.all([
                state.selectedAccountId
                    ? loadAccountDetail(state.selectedAccountId, false)
                    : Promise.resolve().then(() => {
                        state.accountDetail = null;
                    }),
                loadFinancialOverview({ rerender: false, suppressDisconnectedError: true })
            ]);
        } catch (error) {
            state.error = error.message || 'Could not load accounts.';
        } finally {
            state.loading = false;
            render();
            if (focusAccountList) {
                focusScrollablePane('.panel-scroll--account-list', { resetScroll: true });
            }
        }
    };

    const loadNextAccountPage = async () => {
        const nextCursor = String(state.accountListPage.nextCursor || '').trim();
        if (!nextCursor) return;
        await loadAccounts({
            cursor: nextCursor,
            history: [...(state.accountListPage.history || []), String(state.accountListPage.cursor || '').trim()],
            focusAccountList: true
        });
    };

    const loadPreviousAccountPage = async () => {
        const history = [...(state.accountListPage.history || [])];
        if (!history.length) return;
        const previousCursor = String(history.pop() || '').trim();
        await loadAccounts({
            cursor: previousCursor,
            history,
            focusAccountList: true
        });
    };

    const loadAccountDetail = async (accountId, rerender = true) => {
        if (!accountId) {
            state.accountDetail = null;
            state.accountDiagnostics = null;
            state.actionResult = null;
            state.recoveryResult = null;
            if (rerender) render();
            return;
        }
        try {
            const client = requireClient();
            const response = await client.getAccountDetail(accountId);
            if (state.selectedAccountId && state.selectedAccountId !== accountId) {
                state.actionResult = null;
                state.recoveryResult = null;
                state.lifecycleNotice = '';
            }
            state.accountDetail = response.item || null;
            state.selectedAccountId = accountId;
            await loadAccountDiagnostics(accountId, false);
            state.error = '';
        } catch (error) {
            state.accountDetail = null;
            state.accountDiagnostics = null;
            state.error = error.message || 'Could not load account detail.';
        }
        if (rerender) {
            render();
            focusScrollablePane('.panel-scroll--workspace', { resetScroll: true });
        }
    };

    const loadAccountDiagnostics = async (accountId, rerender = true) => {
        if (!accountId) {
            state.accountDiagnostics = null;
            if (rerender) render();
            return;
        }
        try {
            const client = requireClient();
            const response = await client.getAccountDiagnostics(accountId, buildDiagnosticsQuery());
            state.accountDiagnostics = response.item || null;
            const replayCandidate = (state.accountDiagnostics?.webhook_delivery_history || []).find((item) => item.replay_eligible);
            if (replayCandidate && !state.recoveryDraft.webhookEventId) {
                state.recoveryDraft.webhookEventId = replayCandidate.event_id;
            }
            state.error = '';
        } catch (error) {
            state.accountDiagnostics = null;
            state.error = error.message || 'Could not load support diagnostics.';
        }
        if (rerender) render();
    };

    const setActionDraftAction = (action) => {
        state.actionDraft.action = action;
        state.actionResult = null;
        state.lifecycleNotice = '';
        render();
    };

    const focusOperationsWorkspace = () => {
        setCurrentView('operations');
        window.requestAnimationFrame(() => {
            const field = document.querySelector('.action-panel [data-site-lifecycle-focus="true"], .action-panel .field-input, .action-panel textarea');
            if (field && typeof field.focus === 'function') {
                field.focus({ preventScroll: true });
            }
        });
    };

    const prepareLifecycleAction = (action) => {
        setActionDraftAction(action);
        focusOperationsWorkspace();
    };

    const copyLifecycleToken = async (token) => {
        const normalized = String(token || '').trim();
        if (!normalized) return;
        try {
            await navigator.clipboard.writeText(normalized);
            state.lifecycleNotice = 'Connection token copied to clipboard.';
        } catch (error) {
            state.lifecycleNotice = 'Copy failed in this browser. Select and copy the token manually.';
        }
        render();
    };

    const submitAdminAction = async () => {
        if (!state.accountDetail || !state.selectedAccountId) return;
        setLoading(true);
        state.lifecycleNotice = '';
        try {
            const client = requireClient();
            const response = await client.mutateAccount(state.selectedAccountId, buildMutationPayload());
            state.actionResult = {
                tone: 'success',
                action: response.action || state.actionDraft.action,
                auditEventId: response.audit_event_id || '',
                effect: response.effect || {},
                message: 'Operator action applied successfully.'
            };
            state.error = '';
            await loadAccounts();
        } catch (error) {
            state.actionResult = {
                tone: 'danger',
                action: state.actionDraft.action,
                auditEventId: '',
                effect: {},
                message: error.message || 'The operator action failed.'
            };
            state.error = '';
        } finally {
            state.loading = false;
            render();
        }
    };

    const submitRecoveryAction = async () => {
        if (!state.accountDetail || !state.selectedAccountId) return;
        setLoading(true);
        try {
            const client = requireClient();
            const response = await client.runRecoveryAction(state.selectedAccountId, buildRecoveryPayload());
            state.recoveryResult = {
                tone: 'success',
                action: response.action || state.recoveryDraft.action,
                auditEventId: response.audit_event_id || '',
                effect: response.effect || {},
                message: 'Recovery action completed successfully.'
            };
            state.error = '';
            await loadAccounts();
        } catch (error) {
            state.recoveryResult = {
                tone: 'danger',
                action: state.recoveryDraft.action,
                auditEventId: '',
                effect: {},
                message: error.message || 'The recovery action failed.'
            };
            state.error = '';
        } finally {
            state.loading = false;
            render();
        }
    };

    const renderStatusPill = (value) => {
        const label = titleCase(value, 'Unknown');
        const tone = STATUS_TONES[String(value || '').toLowerCase()] || 'neutral';
        const pill = el('span', `status-pill status-pill--${tone}`, label);
        return pill;
    };

    const renderMetricCard = (label, value, detail) => {
        const card = el('div', 'metric-card');
        card.appendChild(el('div', 'metric-label', label));
        card.appendChild(el('div', 'metric-value', value));
        if (detail) card.appendChild(el('div', 'metric-detail', detail));
        return card;
    };

    const renderMetricButton = ({ label, value, detail, onClick, active = false }) => {
        const button = el('button', `metric-card metric-card--button${active ? ' metric-card--button-active' : ''}`);
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', active ? 'true' : 'false');
        button.addEventListener('click', onClick);
        button.appendChild(el('div', 'metric-label', label));
        button.appendChild(el('div', 'metric-value', value));
        if (detail) button.appendChild(el('div', 'metric-detail', detail));
        return button;
    };

    const renderQuickStat = (label, value) => {
        const card = el('div', 'quick-stat');
        card.appendChild(el('div', 'quick-stat__value', value));
        card.appendChild(el('div', 'quick-stat__label', label));
        return card;
    };

    const renderFinancialMiniMetric = (label, value, copy) => {
        const card = el('div', 'financials-mini');
        card.appendChild(el('div', 'metric-label', label));
        card.appendChild(el('div', 'financials-mini__value', value));
        if (copy) card.appendChild(el('div', 'financials-mini__copy', copy));
        return card;
    };

    const renderFinancialAccountBadge = (item, metaCopy) => {
        const row = el('div', 'financials-list__item');
        const copy = el('div', 'financials-list__copy');
        copy.appendChild(el('strong', '', item.account_label || item.account_id || 'Unknown account'));
        const fragments = [
            item.connected_domain || '',
            item.plan_label || titleCase(item.plan_code, 'No plan'),
            metaCopy || ''
        ].filter(Boolean);
        copy.appendChild(el('div', 'panel-text', fragments.join(' · ')));
        row.appendChild(copy);
        return row;
    };

    const renderFinancialList = (items, emptyCopy, renderer) => {
        if (!Array.isArray(items) || items.length === 0) {
            return el('div', 'financials-empty', emptyCopy);
        }
        const list = el('div', 'financials-list');
        items.forEach((item) => list.appendChild(renderer(item)));
        return list;
    };

    const renderFinancialsOverlay = () => {
        if (!state.financials.overlayOpen) return null;

        const overlay = el('div', 'financials-overlay');
        overlay.addEventListener('click', closeFinancialsOverlay);

        const dialog = el('section', 'financials-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'financialsTitle');
        dialog.addEventListener('click', (event) => event.stopPropagation());

        const top = el('div', 'financials-overlay__top');
        const heading = el('div', 'financials-overlay__heading');
        heading.appendChild(el('div', 'panel-label', 'Financials overlay'));
        heading.appendChild(el('h2', 'panel-title', 'Revenue health, paid accounts, and commercial signals'));
        heading.appendChild(el('p', 'panel-text', 'See projected recurring value beside observed checkout revenue, current plan mix, and the watchlist that deserves finance or support attention.'));
        top.appendChild(heading);
        const closeButton = el('button', 'secondary-button financials-overlay__close', 'Close');
        closeButton.type = 'button';
        closeButton.addEventListener('click', closeFinancialsOverlay);
        top.appendChild(closeButton);
        dialog.appendChild(top);

        const body = el('div', 'financials-overlay__body');
        const overview = state.financials.item;

        if (state.financials.loading) {
            body.appendChild(el('div', 'financials-state-card', 'Loading financial overview…'));
        } else if (state.financials.error) {
            const card = el('div', 'financials-state-card');
            card.appendChild(el('div', 'panel-title', 'Financials are not ready yet'));
            card.appendChild(el('p', 'panel-text', state.financials.error));
            const actions = el('div', 'panel-actions');
            const retry = el('button', 'primary-button', 'Retry');
            retry.type = 'button';
            retry.addEventListener('click', () => loadFinancialOverview({ rerender: true }));
            actions.appendChild(retry);
            if (state.session.mode === 'api' && !state.session.connected && isCognitoMode()) {
                const signIn = el('button', 'secondary-button', 'Sign in with Cognito');
                signIn.type = 'button';
                signIn.addEventListener('click', beginCognitoLogin);
                actions.appendChild(signIn);
            }
            card.appendChild(actions);
            body.appendChild(card);
        } else if (!overview) {
            body.appendChild(el('div', 'financials-state-card', 'No financial overview is available yet.'));
        } else {
            const left = el('div', 'financials-overlay__stack');
            const right = el('div', 'financials-overlay__stack');
            const operatorViews = overview.operator_views || {};
            const watchAccounts = operatorViews.watch_accounts || {};

            const topline = el('section', 'panel financials-panel');
            topline.appendChild(el('div', 'panel-label', 'Topline'));
            topline.appendChild(el('h3', 'panel-title', 'Financial health at a glance'));
            const toplineGrid = el('div', 'financials-grid');
            toplineGrid.appendChild(renderFinancialMiniMetric(
                'Projected MRR',
                formatCurrencyUsd(overview.projected_recurring?.mrr_usd),
                'Based on currently active paid subscriptions.'
            ));
            toplineGrid.appendChild(renderFinancialMiniMetric(
                'Paid accounts',
                formatNumber(overview.snapshot?.paid_accounts),
                'Currently active paid customers.'
            ));
            toplineGrid.appendChild(renderFinancialMiniMetric(
                'Trials active',
                formatNumber(overview.snapshot?.active_trials),
                'Still inside the 7-day free-trial policy.'
            ));
            toplineGrid.appendChild(renderFinancialMiniMetric(
                'At risk',
                formatNumber(overview.snapshot?.suspended_paid_accounts),
                'Paid accounts suspended and likely to need intervention.'
            ));
            topline.appendChild(toplineGrid);
            left.appendChild(topline);

            const revenue = el('section', 'panel financials-panel');
            revenue.appendChild(el('div', 'panel-label', 'Revenue windows'));
            revenue.appendChild(el('h3', 'panel-title', 'Observed checkout revenue'));
            const revenueGrid = el('div', 'financials-grid financials-grid--three');
            revenueGrid.appendChild(renderFinancialMiniMetric(
                'Last 7 days',
                formatCurrencyUsd(overview.observed_checkout_revenue?.last_7d_usd),
                'New subscriptions and top-ups captured this week.'
            ));
            revenueGrid.appendChild(renderFinancialMiniMetric(
                'Last 30 days',
                formatCurrencyUsd(overview.observed_checkout_revenue?.last_30d_usd),
                'Observed monetized checkout activity this month.'
            ));
            revenueGrid.appendChild(renderFinancialMiniMetric(
                'Last 365 days',
                formatCurrencyUsd(overview.observed_checkout_revenue?.last_365d_usd),
                'Observed checkout activity recorded this year.'
            ));
            revenue.appendChild(revenueGrid);
            const truthNote = el('div', 'financials-note');
            truthNote.appendChild(el('strong', '', 'Truthfulness guard: '));
            truthNote.appendChild(document.createTextNode('Projected recurring value sits beside observed checkout revenue, but it does not silently replace true collected revenue.'));
            revenue.appendChild(truthNote);
            left.appendChild(revenue);

            const planMix = el('section', 'panel financials-panel');
            planMix.appendChild(el('div', 'panel-label', 'Plan mix'));
            planMix.appendChild(el('h3', 'panel-title', 'Who is currently paying'));
            planMix.appendChild(renderFinancialList(
                overview.plan_mix,
                'No active paid plan mix is available yet.',
                (item) => {
                    const row = el('div', 'financials-list__item');
                    const copy = el('div', 'financials-list__copy');
                    copy.appendChild(el('strong', '', item.plan_label || titleCase(item.plan_code, 'Plan')));
                    copy.appendChild(el('div', 'panel-text', `${formatNumber(item.active_accounts)} active accounts · ${item.share_of_paid_accounts}% of paid base`));
                    row.appendChild(copy);
                    row.appendChild(el('div', 'financials-list__value', formatCurrencyUsd(item.projected_mrr_usd)));
                    return row;
                }
            ));
            left.appendChild(planMix);

            const watchAccountsPanel = el('section', 'panel financials-panel');
            watchAccountsPanel.appendChild(el('div', 'panel-label', 'Operational watchlists'));
            watchAccountsPanel.appendChild(el('h3', 'panel-title', 'Accounts that need financial attention'));
            const watchGrid = el('div', 'financials-watch-grid');
            const watchSections = [
                ['Trials expiring soon', watchAccounts.near_trial_expiry, (item) => `Expires ${formatDate(item.trial_expires_at)}`],
                ['Suspended paid', watchAccounts.suspended_paid, () => 'Support or billing recovery may be needed'],
                ['Low-credit paid', watchAccounts.low_credit_paid, (item) => `${formatNumber(item.credits_remaining)} credits left`],
                ['High-usage paid', watchAccounts.high_usage_paid, (item) => `${item.usage_ratio || 0}% of monthly credits used`]
            ];
            watchSections.forEach(([title, entries, copyBuilder]) => {
                const miniPanel = el('div', 'financials-watch-card');
                miniPanel.appendChild(el('div', 'metric-label', title));
                miniPanel.appendChild(renderFinancialList(
                    entries,
                    'No accounts currently fall into this watchlist.',
                    (item) => renderFinancialAccountBadge(item, copyBuilder(item))
                ));
                watchGrid.appendChild(miniPanel);
            });
            watchAccountsPanel.appendChild(watchGrid);
            left.appendChild(watchAccountsPanel);

            const events = el('section', 'panel financials-panel');
            events.appendChild(el('div', 'panel-label', 'Latest monetized events'));
            events.appendChild(el('h3', 'panel-title', 'Recent checkout activity'));
            events.appendChild(renderFinancialList(
                overview.recent_monetized_events,
                'No recent monetized events are recorded yet.',
                (item) => {
                    const row = el('div', 'financials-list__item');
                    const copy = el('div', 'financials-list__copy');
                    copy.appendChild(el('strong', '', item.account_label || item.account_id || 'Unknown account'));
                    copy.appendChild(el('div', 'panel-text', `${item.summary || titleCase(item.event_kind, 'Event')} · ${formatDate(item.observed_at)}`));
                    row.appendChild(copy);
                    row.appendChild(el('div', 'financials-list__value', formatCurrencyUsd(item.amount_usd)));
                    return row;
                }
            ));
            right.appendChild(events);

            const failures = el('section', 'panel financials-panel');
            failures.appendChild(el('div', 'panel-label', 'Payment failures'));
            failures.appendChild(el('h3', 'panel-title', 'Accounts with recurring payment trouble'));
            failures.appendChild(renderFinancialList(
                operatorViews.payment_failures,
                'No recurring payment failures are recorded right now.',
                (item) => {
                    const row = el('div', 'financials-list__item');
                    const copy = el('div', 'financials-list__copy');
                    copy.appendChild(el('strong', '', item.account_label || item.account_id || 'Unknown account'));
                    copy.appendChild(el('div', 'panel-text', [
                        item.connected_domain || '',
                        item.last_event_type || item.last_payment_status || 'Payment issue',
                        formatDate(item.updated_at)
                    ].filter(Boolean).join(' · ')));
                    row.appendChild(copy);
                    row.appendChild(el('div', 'financials-list__value', titleCase(item.last_payment_status || item.failure_record_status, 'Issue')));
                    return row;
                }
            ));
            right.appendChild(failures);

            const adjustments = el('section', 'panel financials-panel');
            adjustments.appendChild(el('div', 'panel-label', 'Credit adjustments'));
            adjustments.appendChild(el('h3', 'panel-title', 'Recent business-wide manual credit changes'));
            adjustments.appendChild(renderFinancialList(
                operatorViews.recent_credit_adjustments,
                'No recent manual credit adjustments are recorded yet.',
                (item) => {
                    const row = el('div', 'financials-list__item');
                    const copy = el('div', 'financials-list__copy');
                    copy.appendChild(el('strong', '', item.account_label || item.account_id || 'Unknown account'));
                    copy.appendChild(el('div', 'panel-text', [
                        item.reason || 'Manual credit adjustment',
                        item.actor_role ? titleCase(item.actor_role) : '',
                        formatDate(item.updated_at || item.created_at)
                    ].filter(Boolean).join(' · ')));
                    row.appendChild(copy);
                    row.appendChild(el('div', 'financials-list__value', `${item.credits_delta >= 0 ? '+' : ''}${formatNumber(item.credits_delta)}`));
                    return row;
                }
            ));
            right.appendChild(adjustments);

            const watchlist = el('section', 'panel financials-panel');
            watchlist.appendChild(el('div', 'panel-label', 'Watchlist'));
            watchlist.appendChild(el('h3', 'panel-title', 'Financial attention points'));
            watchlist.appendChild(renderFinancialList(
                overview.watchlist?.items,
                'No financial watchlist items are flagged right now.',
                (item) => {
                    const row = el('div', 'financials-list__item');
                    const copy = el('div', 'financials-list__copy');
                    copy.appendChild(el('strong', '', `${formatNumber(item.count)} · ${item.label || titleCase(item.key, 'Watch item')}`));
                    copy.appendChild(el('div', 'panel-text', item.description || 'Watch item available.'));
                    row.appendChild(copy);
                    return row;
                }
            ));
            watchlist.appendChild(el('div', 'panel-text financials-panel__footer', `Counted events: ${formatNumber(overview.observed_checkout_revenue?.counted_events)} · Currency: ${overview.currency || 'USD'}`));
            right.appendChild(watchlist);

            const truth = el('section', 'panel financials-panel');
            truth.appendChild(el('div', 'panel-label', 'Truth boundary'));
            truth.appendChild(el('h3', 'panel-title', 'What this surface does and does not claim'));
            const truthList = el('div', 'financials-truth-list');
            [
                overview.truth_boundary?.projected_recurring_scope,
                overview.truth_boundary?.observed_revenue_scope,
                overview.truth_boundary?.recurring_renewals_included === false
                    ? 'Recurring renewals are not included in observed revenue yet.'
                    : '',
                overview.truth_boundary?.plan_change_collections_included === false
                    ? 'Plan-change collections are not included in observed revenue yet.'
                    : ''
            ].filter(Boolean).forEach((entry) => {
                truthList.appendChild(el('div', 'financials-truth-list__item', entry));
            });
            truth.appendChild(truthList);
            right.appendChild(truth);

            body.appendChild(left);
            body.appendChild(right);
        }

        dialog.appendChild(body);
        overlay.appendChild(dialog);
        return overlay;
    };

    const renderRail = () => {
        const aside = el('aside', 'app-rail');

        const brand = el('div', 'rail-brand');
        const badge = el('div', 'rail-brand__badge');
        badge.appendChild(el('span', 'rail-brand__spark'));
        brand.appendChild(badge);
        const brandCopy = el('div', 'rail-brand__copy');
        brandCopy.appendChild(el('div', 'rail-brand__title', 'AiVI'));
        brandCopy.appendChild(el('div', 'rail-brand__subtitle', 'Operator console'));
        brand.appendChild(brandCopy);
        aside.appendChild(brand);

        const nav = el('nav', 'rail-nav');
        nav.appendChild(el('div', 'rail-nav__label', 'Workspace'));
        NAV_ITEMS.forEach((item) => {
            const button = el('button', `rail-nav__item${state.currentView === item.view ? ' rail-nav__item--active' : ''}`);
            button.type = 'button';
            button.addEventListener('click', () => setCurrentView(item.view));

            const icon = el('span', 'rail-nav__icon');
            icon.textContent = item.label.charAt(0);
            button.appendChild(icon);

            const copy = el('span', 'rail-nav__copy');
            copy.appendChild(el('span', 'rail-nav__title', item.label));
            copy.appendChild(el('span', 'rail-nav__hint', item.hint));
            button.appendChild(copy);
            nav.appendChild(button);
        });
        aside.appendChild(nav);

        const operatorCard = el('div', 'rail-operator');
        operatorCard.appendChild(el('div', 'rail-nav__label', 'Operator'));
        operatorCard.appendChild(el('div', 'rail-operator__name', window.AIVI_ADMIN_MOCK.operator.role || 'Super admin'));
        operatorCard.appendChild(el('div', 'rail-operator__meta', runtime.environment || 'local'));
        const operatorChips = el('div', 'rail-operator__chips');
        operatorChips.appendChild(renderStatusPill(runtimeAuth.requireMfa ? 'mfa' : 'bootstrap'));
        operatorChips.appendChild(renderStatusPill(state.session.mode));
        operatorCard.appendChild(operatorChips);
        aside.appendChild(operatorCard);

        return aside;
    };

    const renderTopbar = () => {
        const header = el('header', 'workspace-topbar');

        const copy = el('div', 'workspace-topbar__copy');
        copy.appendChild(el('div', 'workspace-topbar__eyebrow', 'Minimal SaaS direction'));
        copy.appendChild(el('h1', 'workspace-topbar__title', 'Compact operations board'));
        copy.appendChild(el('div', 'workspace-topbar__meta', state.accountDetail
            ? `Focused on ${state.accountDetail.account_label || state.accountDetail.account_id}. Keep one customer and one task in view at a time.`
            : 'Review accounts, credits, billing, and recovery from a calmer single workspace.'));
        header.appendChild(copy);

        const actions = el('div', 'workspace-topbar__actions');
        [
            ['accounts', 'Accounts'],
            ['operations', 'Actions'],
            ['diagnostics', 'Diagnostics'],
            ['billing', 'Billing'],
            ['audit', 'Audit']
        ].forEach(([view, label]) => {
            const button = el('button', state.currentView === view ? 'primary-button workspace-nav-button' : 'secondary-button workspace-nav-button', label);
            button.type = 'button';
            button.addEventListener('click', () => setCurrentView(view));
            actions.appendChild(button);
        });

        const envPill = el('span', 'workspace-chip', titleCase(runtime.environment, 'Local'));
        actions.appendChild(envPill);
        const modePill = el('span', 'workspace-chip workspace-chip--accent', state.session.mode === 'preview' ? 'Preview data' : 'API mode');
        actions.appendChild(modePill);

        const refreshButton = el('button', 'secondary-button workspace-refresh', state.loading ? 'Refreshing...' : 'Refresh');
        refreshButton.type = 'button';
        refreshButton.disabled = state.loading;
        refreshButton.addEventListener('click', loadAccounts);
        actions.appendChild(refreshButton);
        header.appendChild(actions);

        return header;
    };

    const renderLoginGate = () => {
        const section = el('section', 'panel gate-panel');
        section.appendChild(el('div', 'panel-label', 'Operator Gate'));
        section.appendChild(el('h2', 'panel-title', isCognitoMode() ? 'Authenticate with Cognito or use preview mode' : 'Choose preview or API mode'));
        section.appendChild(el('p', 'panel-text', runtime.allowPreview === false
            ? (isCognitoMode()
                ? 'This environment is configured for Cognito-backed API access only.'
                : 'This environment is configured for API mode only. Use staged admin access against the deployed control plane.')
            : (isCognitoMode()
                ? 'Preview mode uses bundled mock data. API mode uses Cognito Hosted UI against the deployed control plane.'
                : 'Preview mode uses bundled mock data. API mode will call the new super-admin routes once your admin domain and auth are live.')));

        const modeRow = el('div', 'mode-toggle');
        const modeOptions = runtime.allowPreview === false
            ? [['api', 'API mode']]
            : [['preview', 'Preview mode'], ['api', 'API mode']];
        modeOptions.forEach(([value, label]) => {
            const button = el('button', `mode-button${state.session.mode === value ? ' mode-button--active' : ''}`, label);
            button.type = 'button';
            button.addEventListener('click', () => {
                state.session.mode = value;
                state.session.connected = value === 'preview';
                state.error = '';
                state.accountListPage = {
                    cursor: '',
                    nextCursor: '',
                    history: [],
                    totalCount: 0,
                    pageStart: 0,
                    pageEnd: 0,
                    limit: state.accountListPage.limit || 25
                };
                render();
            });
            modeRow.appendChild(button);
        });
        section.appendChild(modeRow);

        const fieldGrid = el('div', 'field-grid');
        const baseField = el('label', 'field');
        baseField.appendChild(el('span', 'field-label', 'API base URL'));
        const baseInput = el('input', 'field-input');
        baseInput.type = 'text';
        baseInput.placeholder = 'https://admin-api.aivi.example.com';
        baseInput.value = state.session.baseUrl;
        baseInput.disabled = state.session.mode !== 'api';
        baseInput.addEventListener('input', (event) => {
            state.session.baseUrl = event.target.value;
        });
        baseField.appendChild(baseInput);
        fieldGrid.appendChild(baseField);

        if (isBootstrapMode()) {
            const tokenField = el('label', 'field');
            tokenField.appendChild(el('span', 'field-label', 'Bootstrap token (optional during scaffold)'));
            const tokenInput = el('input', 'field-input');
            tokenInput.type = 'password';
            tokenInput.placeholder = 'x-aivi-admin-token';
            tokenInput.value = state.session.bootstrapToken;
            tokenInput.disabled = state.session.mode !== 'api';
            tokenInput.addEventListener('input', (event) => {
                state.session.bootstrapToken = event.target.value;
            });
            tokenField.appendChild(tokenInput);
            fieldGrid.appendChild(tokenField);
        } else if (isCognitoMode()) {
            const authField = el('div', 'field');
            authField.appendChild(el('span', 'field-label', 'Cognito session'));
            authField.appendChild(el('div', 'field-input field-input--static', state.session.accessToken ? 'Authenticated' : 'Not signed in'));
            fieldGrid.appendChild(authField);
        }
        section.appendChild(fieldGrid);

        const actions = el('div', 'panel-actions');
        const connectLabel = state.session.mode === 'preview'
            ? 'Enter preview console'
            : (isCognitoMode()
                ? (state.session.accessToken ? 'Connect to admin API' : 'Sign in with Cognito')
                : 'Connect to admin API');
        const connectButton = el('button', 'primary-button', connectLabel);
        connectButton.type = 'button';
        connectButton.addEventListener('click', async () => {
            if (state.session.mode === 'api' && isCognitoMode() && !state.session.accessToken) {
                await beginCognitoLogin();
                return;
            }
            state.session.connected = true;
            await loadAccounts({ resetPaging: true });
        });
        actions.appendChild(connectButton);
        if (state.session.mode === 'api' && isCognitoMode() && state.session.accessToken) {
            const signOutButton = el('button', 'secondary-button', 'Sign out');
            signOutButton.type = 'button';
            signOutButton.addEventListener('click', beginCognitoLogout);
            actions.appendChild(signOutButton);
        }
        section.appendChild(actions);

        const note = el('div', 'note-box');
        note.appendChild(el('strong', '', 'Current auth direction: '));
        note.appendChild(document.createTextNode(getAuthDirectionCopy()));
        section.appendChild(note);
        return section;
    };

    const renderOperatorSummary = () => {
        const panel = el('section', 'panel summary-panel');
        panel.appendChild(el('div', 'panel-label', 'Session Summary'));
        panel.appendChild(el('h2', 'panel-title', state.session.mode === 'preview' ? 'Preview session active' : 'Admin API session'));
        panel.appendChild(el('p', 'panel-text', state.session.mode === 'preview'
            ? 'You are viewing the console with mock data. The layout and flows are real, but the data is bundled locally.'
            : (isCognitoMode()
                ? (state.session.accessToken
                    ? 'This session is authenticated with Cognito Hosted UI and ready for JWT-backed admin APIs.'
                    : 'This session is configured for Cognito Hosted UI. Sign in before loading operator data.')
                : 'This session is prepared to use the backend super-admin read APIs. Live auth will replace the bootstrap token once Cognito is wired.')));

        const metrics = el('div', 'mini-metrics');
        metrics.appendChild(renderMetricCard('Mode', titleCase(state.session.mode, 'Preview')));
        metrics.appendChild(renderMetricCard('Accounts loaded', formatNumber(state.accounts.length || 0)));
        metrics.appendChild(renderMetricCard('Selected account', resolveSelectedAccount() ? resolveSelectedAccount().account_label : 'None'));
        if (state.session.mode === 'api') {
            metrics.appendChild(renderMetricCard('Auth session', isCognitoMode()
                ? (state.session.accessToken ? 'Cognito active' : 'Sign-in required')
                : (state.session.bootstrapToken ? 'Bootstrap token' : 'API only')));
        }
        panel.appendChild(metrics);
        return panel;
    };

    const asEmbeddedPanel = (panel) => {
        panel.classList.add('panel--embedded');
        return panel;
    };

    const renderFilterBar = () => {
        const bar = el('section', 'panel filter-panel filter-panel--compact');
        bar.appendChild(el('div', 'panel-label', 'Search and Filters'));

        const queryField = el('label', 'field');
        queryField.appendChild(el('span', 'field-label', 'Search accounts'));
        const queryInput = el('input', 'field-input');
        queryInput.type = 'text';
        queryInput.placeholder = 'Account, domain, email, site ID, or account ID';
        queryInput.value = state.filters.query;
        queryInput.addEventListener('input', (event) => {
            state.filters.query = event.target.value;
        });
        queryInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                loadAccounts({ resetPaging: true, focusAccountList: true });
            }
        });
        queryField.appendChild(queryInput);
        bar.appendChild(queryField);

        const toolbar = el('div', 'browser-toolbar');
        const actions = el('div', 'browser-toolbar__actions');

        const applyButton = el('button', 'primary-button', 'Apply filters');
        applyButton.type = 'button';
        applyButton.addEventListener('click', () => loadAccounts({ resetPaging: true, focusAccountList: true }));
        actions.appendChild(applyButton);

        const activeAdvancedFilterCount = getActiveBrowserFilterCount();
        const filterToggleLabel = activeAdvancedFilterCount > 0
            ? `Advanced filters · ${activeAdvancedFilterCount} active`
            : (state.browserFiltersOpen ? 'Hide advanced filters' : 'Advanced filters');
        const filterToggle = el('button', state.browserFiltersOpen ? 'secondary-button secondary-button--active' : 'secondary-button', filterToggleLabel);
        filterToggle.type = 'button';
        filterToggle.setAttribute('aria-expanded', state.browserFiltersOpen ? 'true' : 'false');
        filterToggle.addEventListener('click', () => {
            state.browserFiltersOpen = !state.browserFiltersOpen;
            render();
            focusScrollablePane('.panel-scroll--account-list');
        });
        actions.appendChild(filterToggle);

        const resetButton = el('button', 'secondary-button', 'Reset');
        resetButton.type = 'button';
        resetButton.addEventListener('click', () => {
            state.filters = { query: '', planCode: '', subscriptionStatus: '' };
            state.browserFiltersOpen = false;
            loadAccounts({ resetPaging: true, focusAccountList: true });
        });
        actions.appendChild(resetButton);
        toolbar.appendChild(actions);

        if (activeAdvancedFilterCount > 0) {
            toolbar.appendChild(el('div', 'browser-toolbar__hint', `${activeAdvancedFilterCount} advanced filter${activeAdvancedFilterCount === 1 ? '' : 's'} applied`));
        }

        bar.appendChild(toolbar);

        if (state.browserFiltersOpen || activeAdvancedFilterCount > 0) {
            const drawer = el('div', 'filter-drawer');
            const fields = el('div', 'filter-grid filter-grid--browser');
            const planField = el('label', 'field');
            planField.appendChild(el('span', 'field-label', 'Plan'));
            const planSelect = el('select', 'field-input');
            ['', 'starter', 'growth', 'pro'].forEach((value) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value ? titleCase(value) : 'All plans';
                option.selected = state.filters.planCode === value;
                planSelect.appendChild(option);
            });
            planSelect.addEventListener('change', (event) => {
                state.filters.planCode = event.target.value;
            });
            planField.appendChild(planSelect);
            fields.appendChild(planField);

            const statusField = el('label', 'field');
            statusField.appendChild(el('span', 'field-label', 'Subscription'));
            const statusSelect = el('select', 'field-input');
            ['', 'active', 'trial', 'suspended'].forEach((value) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value ? titleCase(value) : 'All states';
                option.selected = state.filters.subscriptionStatus === value;
                statusSelect.appendChild(option);
            });
            statusSelect.addEventListener('change', (event) => {
                state.filters.subscriptionStatus = event.target.value;
            });
            statusField.appendChild(statusSelect);
            fields.appendChild(statusField);
            drawer.appendChild(fields);
            bar.appendChild(drawer);
        }

        return bar;
    };

    const renderAccountList = () => {
        const panel = el('section', 'panel panel--account-list panel--scroll-shell');
        panel.appendChild(el('div', 'panel-label', 'Account List'));
        panel.appendChild(el('h2', 'panel-title', 'Authoritative customer state'));

        if (!state.accounts.length) {
            const empty = el('div', 'empty-state', state.loading ? 'Loading accounts...' : 'No accounts match the current filters.');
            panel.appendChild(empty);
            return panel;
        }

        const list = el('div', 'account-list');
        state.accounts.forEach((account) => {
            const row = el('button', `account-entry${state.selectedAccountId === account.account_id ? ' account-entry--active' : ''}`);
            row.type = 'button';
            row.addEventListener('click', () => {
                loadAccountDetail(account.account_id);
            });

            const top = el('div', 'account-entry__top');
            top.appendChild(el('div', 'account-name', account.account_label));
            top.appendChild(el('div', 'account-entry__updated', formatDate(account.updated_at)));
            row.appendChild(top);

            row.appendChild(el('div', 'account-subtle', account.account_id));
            if (account.contact_email) {
                row.appendChild(el('div', 'account-subtle account-subtle--secondary', account.contact_email));
            }

            const statusRow = el('div', 'account-entry__status');
            statusRow.appendChild(el('span', 'account-plan-pill', account.plan_name || titleCase(account.plan_code, 'No plan')));
            statusRow.appendChild(renderStatusPill(account.subscription_status));
            row.appendChild(statusRow);

            const meta = el('div', 'account-entry__meta');
            const credits = el('div', 'account-entry__metric');
            credits.appendChild(el('span', 'account-entry__metric-label', 'Credits'));
            credits.appendChild(el('strong', 'account-entry__metric-value', formatNumber(account.credits_remaining)));
            meta.appendChild(credits);

            const sites = el('div', 'account-entry__metric');
            sites.appendChild(el('span', 'account-entry__metric-label', 'Sites'));
            sites.appendChild(el('strong', 'account-entry__metric-value', String(account.site_count || 0)));
            meta.appendChild(sites);
            row.appendChild(meta);

            list.appendChild(row);
        });

        const scroll = el('div', 'panel-scroll panel-scroll--account-list');
        scroll.tabIndex = 0;
        scroll.appendChild(list);
        panel.appendChild(scroll);

        const footer = el('div', 'account-list-footer');
        footer.appendChild(el('div', 'account-list-footer__summary', getAccountListSummary()));

        if ((state.accountListPage.history || []).length > 0 || state.accountListPage.nextCursor) {
            const actions = el('div', 'account-list-footer__actions');

            const previousButton = el('button', 'secondary-button', 'Previous');
            previousButton.type = 'button';
            previousButton.disabled = !((state.accountListPage.history || []).length > 0);
            previousButton.addEventListener('click', loadPreviousAccountPage);
            actions.appendChild(previousButton);

            const nextButton = el('button', 'secondary-button', 'Next');
            nextButton.type = 'button';
            nextButton.disabled = !state.accountListPage.nextCursor;
            nextButton.addEventListener('click', loadNextAccountPage);
            actions.appendChild(nextButton);

            footer.appendChild(actions);
        }

        panel.appendChild(footer);
        return panel;
    };

    const renderAccountBrowserPanel = () => {
        const panel = el('section', 'panel account-browser-panel');
        panel.appendChild(el('div', 'panel-label', 'Account list'));
        panel.appendChild(el('h2', 'panel-title', 'Authoritative customer state'));
        panel.appendChild(el('p', 'panel-text', 'Search quickly, collapse advanced filters when you do not need them, and keep the list in view.'));

        panel.appendChild(asEmbeddedPanel(renderFilterBar()));
        panel.appendChild(asEmbeddedPanel(renderAccountList()));
        return panel;
    };

    const renderOverviewPanel = (detail) => {
        const panel = el('section', 'panel');
        panel.appendChild(el('div', 'panel-label', 'Account Detail'));
        panel.appendChild(el('h2', 'panel-title', detail.account_label || detail.account_id));
        panel.appendChild(el('p', 'panel-text', 'This panel is sourced from the backend admin-read contract, not from a customer WordPress site.'));

        const metrics = el('div', 'mini-metrics');
        metrics.appendChild(renderMetricCard('Plan', detail.plan.plan_name || titleCase(detail.plan.plan_code, 'No plan')));
        metrics.appendChild(renderMetricCard('Credits remaining', formatNumber(detail.credits.total_remaining)));
        metrics.appendChild(renderMetricCard('Last debit', formatNumber(detail.credits.last_run_debit)));
        metrics.appendChild(renderMetricCard('Sites', String((detail.sites || []).length)));
        panel.appendChild(metrics);

        const pills = el('div', 'status-group');
        pills.appendChild(renderStatusPill(detail.plan.subscription_status));
        pills.appendChild(renderStatusPill(detail.plan.trial_status));
        panel.appendChild(pills);
        return panel;
    };

    const renderSiteDetailPanel = (detail) => {
        const panel = el('section', 'panel');
        panel.appendChild(el('div', 'panel-label', 'Site Detail'));
        panel.appendChild(el('h2', 'panel-title', 'Connected site context'));

        const sites = Array.isArray(detail.sites) ? detail.sites : [];
        if (!sites.length) {
            panel.appendChild(el('div', 'empty-state empty-state--compact', 'No connected sites are currently bound to this account.'));
            return panel;
        }

        const stack = el('div', 'timeline');
        sites.forEach((site, index) => {
            const item = el('div', 'timeline-item');
            item.appendChild(renderStatusPill(site.binding_status || 'connected'));
            item.appendChild(el('div', 'timeline-title', `${site.connected_domain || site.site_id || 'Unknown site'}${index === 0 ? ' - Primary' : ''}`));
            item.appendChild(el('div', 'timeline-copy', `Site ID ${site.site_id || 'n/a'} - Blog ${site.blog_id || 'n/a'} - Plugin ${site.plugin_version || 'Unknown'} - Last analysis ${formatDate(site.last_analysis_at || detail.usage.last_analysis_at)}`));
            stack.appendChild(item);
        });
        panel.appendChild(stack);
        return panel;
    };

    const renderBillingPanel = (detail) => {
        const panel = el('section', 'panel panel--span-two');
        panel.appendChild(el('div', 'panel-label', 'Billing and Credits'));
        panel.appendChild(el('h2', 'panel-title', 'Credit and billing health summary'));

        const metrics = el('div', 'mini-metrics mini-metrics--wide');
        metrics.appendChild(renderMetricCard('Included remaining', formatNumber(detail.credits.included_remaining)));
        metrics.appendChild(renderMetricCard('Top-up remaining', formatNumber(detail.credits.topup_remaining)));
        metrics.appendChild(renderMetricCard('Reserved credits', formatNumber(detail.credits.reserved_credits)));
        metrics.appendChild(renderMetricCard('Used this month', formatNumber(detail.credit_ledger_summary.credits_used_this_month)));
        panel.appendChild(metrics);

        const split = el('div', 'split-grid');

        const ledgerBlock = el('div', 'subpanel');
        ledgerBlock.appendChild(el('h3', 'subpanel-title', 'Recent ledger activity'));
        if ((detail.credit_ledger_summary.recent_events || []).length === 0) {
            ledgerBlock.appendChild(el('div', 'empty-state empty-state--compact', 'No recent ledger events.'));
        } else {
            const list = el('div', 'timeline');
            detail.credit_ledger_summary.recent_events.forEach((event) => {
                const item = el('div', 'timeline-item');
                item.appendChild(renderStatusPill(event.event_type));
                item.appendChild(el('div', 'timeline-title', `${titleCase(event.reason_code, 'Activity')} - ${formatDate(event.created_at)}`));
                item.appendChild(el('div', 'timeline-copy', `Granted ${formatNumber(event.amounts.granted_credits)} - Settled ${formatNumber(event.amounts.settled_credits)} - Refunded ${formatNumber(event.amounts.refunded_credits)}`));
                list.appendChild(item);
            });
            ledgerBlock.appendChild(list);
        }
        split.appendChild(ledgerBlock);

        const healthBlock = el('div', 'subpanel');
        healthBlock.appendChild(el('h3', 'subpanel-title', 'Billing health snapshot'));
        const healthList = el('div', 'key-list');
        [
            ['Subscription records', String((detail.billing_health.recent_subscriptions || []).length)],
            ['Top-up orders', String((detail.billing_health.recent_topups || []).length)],
            ['Checkout intents', String((detail.billing_health.recent_checkout_intents || []).length)],
            ['Webhook events', String((detail.billing_health.recent_webhooks || []).length)],
            ['Audit source', detail.audit.source || 'Unknown'],
            ['Generated', formatDate(detail.audit.generated_at)]
        ].forEach(([label, value]) => {
            const row = el('div', 'key-row');
            row.appendChild(el('div', 'key-label', label));
            row.appendChild(el('div', 'key-value', value));
            healthList.appendChild(row);
        });
        healthBlock.appendChild(healthList);
        split.appendChild(healthBlock);

        panel.appendChild(split);
        return panel;
    };

    const renderActionResult = () => {
        if (!state.actionResult) return null;
        const tone = state.actionResult.tone === 'danger' ? 'danger' : 'success';
        const box = el('div', `result-box result-box--${tone}`);
        box.appendChild(el('strong', '', state.actionResult.message));

        const actionLabel = titleCase(state.actionResult.action, 'Action');
        const copy = [];
        if (actionLabel) copy.push(actionLabel);
        if (state.actionResult.auditEventId) copy.push(`Audit ${state.actionResult.auditEventId}`);
        if (copy.length) {
            box.appendChild(el('div', 'result-copy', copy.join(' - ')));
        }

        const effectEntries = Object.entries(state.actionResult.effect || {}).filter(([label, value]) => {
            if (label === 'connection_token') return false;
            return value !== null && value !== undefined && value !== '';
        });
        if (effectEntries.length) {
            const list = el('div', 'key-list');
            effectEntries.forEach(([label, value]) => {
                const row = el('div', 'key-row');
                row.appendChild(el('div', 'key-label', titleCase(label)));
                row.appendChild(el('div', 'key-value', String(value)));
                list.appendChild(row);
            });
            box.appendChild(list);
        }

        if (state.actionResult.action === 'issue_connection_token' && state.actionResult.effect?.connection_token) {
            const tokenBox = el('div', 'token-box');
            tokenBox.appendChild(el('div', 'token-box__label', 'Operator connection token'));
            const tokenValue = document.createElement('textarea');
            tokenValue.className = 'field-input field-textarea token-box__value';
            tokenValue.readOnly = true;
            tokenValue.value = String(state.actionResult.effect.connection_token || '');
            tokenBox.appendChild(tokenValue);

            const actions = el('div', 'panel-actions');
            const copyButton = el('button', 'secondary-button', 'Copy token');
            copyButton.type = 'button';
            copyButton.addEventListener('click', () => copyLifecycleToken(state.actionResult.effect.connection_token));
            actions.appendChild(copyButton);
            tokenBox.appendChild(actions);
            box.appendChild(tokenBox);
        }

        return box;
    };

    const renderLifecycleNotice = () => {
        if (!state.lifecycleNotice) return null;
        return el('div', 'result-copy', state.lifecycleNotice);
    };

    const renderSiteLifecyclePanel = (detail, diagnostics) => {
        const panel = el('section', 'panel');
        panel.appendChild(el('div', 'panel-label', 'Site Lifecycle'));
        panel.appendChild(el('h2', 'panel-title', 'Issue token, unbind, and reassign cleanly'));
        panel.appendChild(el('p', 'panel-text', 'Keep ownership changes deliberate: unbind the old owner first, then issue a fresh token for the destination account and paste it into the WordPress Connection tab on the target site.'));

        const primarySite = (detail.sites || [])[0] || null;
        const summary = el('div', 'key-list');
        [
            ['Bound sites', String((detail.sites || []).length)],
            ['Max sites', String(detail.plan?.max_sites || detail.plan?.maxSites || '1')],
            ['Primary site', primarySite?.connected_domain || primarySite?.site_id || 'No site bound'],
            ['Conflict count', String((diagnostics?.site_binding_conflicts || []).length)]
        ].forEach(([label, value]) => {
            const row = el('div', 'key-row');
            row.appendChild(el('div', 'key-label', label));
            row.appendChild(el('div', 'key-value', value));
            summary.appendChild(row);
        });
        panel.appendChild(summary);

        const actions = el('div', 'panel-actions');
        const issueButton = el('button', state.actionDraft.action === 'issue_connection_token' ? 'primary-button' : 'secondary-button', 'Issue connection token');
        issueButton.type = 'button';
        issueButton.addEventListener('click', () => prepareLifecycleAction('issue_connection_token'));
        actions.appendChild(issueButton);

        const unbindButton = el('button', state.actionDraft.action === 'site_unbind' ? 'primary-button' : 'secondary-button', 'Prepare site unbind');
        unbindButton.type = 'button';
        unbindButton.addEventListener('click', () => prepareLifecycleAction('site_unbind'));
        actions.appendChild(unbindButton);
        panel.appendChild(actions);

        const steps = el('div', 'timeline');
        [
            'If the site is still owned elsewhere, unbind it from the current account first.',
            'Issue a fresh connection token from the destination account.',
            'Paste the token into the WordPress Connection tab on the target site.',
            'Reconnect and then verify the new site shows under Connected sites.'
        ].forEach((copy, index) => {
            const item = el('div', 'timeline-item');
            item.appendChild(renderStatusPill(`step_${index + 1}`));
            item.appendChild(el('div', 'timeline-copy', copy));
            steps.appendChild(item);
        });
        panel.appendChild(steps);

        if ((diagnostics?.site_binding_conflicts || []).length > 0) {
            const warning = el('div', 'note-box note-box--warning');
            warning.appendChild(el('strong', '', 'Reassignment attention: '));
            warning.appendChild(document.createTextNode('This account still sees site ownership conflicts. Resolve the current owner first to avoid a failed reconnect.'));
            panel.appendChild(warning);
        }

        const lifecycleResult = renderLifecycleNotice();
        if (lifecycleResult) panel.appendChild(lifecycleResult);
        if (state.actionResult && ['issue_connection_token', 'site_unbind'].includes(state.actionResult.action)) {
            panel.appendChild(renderActionResult());
        }
        return panel;
    };

    const renderActionPanel = (detail) => {
        const panel = el('section', 'panel action-panel');
        panel.appendChild(el('div', 'panel-label', 'Operator Actions'));
        panel.appendChild(el('h2', 'panel-title', 'Apply controlled account mutations'));
        panel.appendChild(el('p', 'panel-text', ACTION_HELP[state.actionDraft.action] || 'All write actions require a reason and are persisted to the audit trail.'));

        const fields = el('div', 'field-grid');

        const actionField = el('label', 'field');
        actionField.appendChild(el('span', 'field-label', 'Action'));
        const actionSelect = el('select', 'field-input');
        ACTION_OPTIONS.forEach((optionDef) => {
            const option = document.createElement('option');
            option.value = optionDef.value;
            option.textContent = `${optionDef.context} - ${optionDef.label}`;
            option.selected = state.actionDraft.action === optionDef.value;
            actionSelect.appendChild(option);
        });
        actionSelect.addEventListener('change', (event) => {
            setActionDraftAction(event.target.value);
        });
        actionField.appendChild(actionSelect);
        fields.appendChild(actionField);

        const reasonField = el('label', 'field');
        reasonField.appendChild(el('span', 'field-label', 'Reason'));
        const reasonInput = document.createElement('textarea');
        reasonInput.className = 'field-input field-textarea';
        reasonInput.placeholder = 'Explain why this action is necessary.';
        reasonInput.value = state.actionDraft.reason;
        reasonInput.addEventListener('input', (event) => {
            state.actionDraft.reason = event.target.value;
        });
        reasonField.appendChild(reasonInput);
        fields.appendChild(reasonField);

        if (actionNeedsCredits()) {
            const creditsField = el('label', 'field');
            creditsField.appendChild(el('span', 'field-label', 'Credits delta'));
            const creditsInput = el('input', 'field-input');
            creditsInput.type = 'number';
            creditsInput.step = '1';
            creditsInput.placeholder = '5000 or -5000';
            creditsInput.value = state.actionDraft.creditsDelta;
            creditsInput.addEventListener('input', (event) => {
                state.actionDraft.creditsDelta = event.target.value;
            });
            creditsField.appendChild(creditsInput);
            fields.appendChild(creditsField);
        }

        if (actionNeedsTrialDays()) {
            const trialField = el('label', 'field');
            trialField.appendChild(el('span', 'field-label', 'Trial days'));
            const trialInput = el('input', 'field-input');
            trialInput.type = 'number';
            trialInput.min = '1';
            trialInput.max = '90';
            trialInput.value = state.actionDraft.trialDays;
            trialInput.addEventListener('input', (event) => {
                state.actionDraft.trialDays = event.target.value;
            });
            trialField.appendChild(trialInput);
            fields.appendChild(trialField);
        }

        if (actionNeedsPlanCode()) {
            const planField = el('label', 'field');
            planField.appendChild(el('span', 'field-label', 'Target plan'));
            const planSelect = el('select', 'field-input');
            ['starter', 'growth', 'pro'].forEach((value) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = titleCase(value);
                option.selected = state.actionDraft.targetPlanCode === value;
                planSelect.appendChild(option);
            });
            planSelect.addEventListener('change', (event) => {
                state.actionDraft.targetPlanCode = event.target.value;
            });
            planField.appendChild(planSelect);
            fields.appendChild(planField);
        }

        if (actionNeedsConnectionTokenOptions()) {
            const labelField = el('label', 'field');
            labelField.appendChild(el('span', 'field-label', 'Token label'));
            const labelInput = el('input', 'field-input');
            labelInput.type = 'text';
            labelInput.placeholder = 'Growth reconnect for second site';
            labelInput.value = state.actionDraft.connectionLabel;
            labelInput.dataset.siteLifecycleFocus = 'true';
            labelInput.addEventListener('input', (event) => {
                state.actionDraft.connectionLabel = event.target.value;
            });
            labelField.appendChild(labelInput);
            fields.appendChild(labelField);

            const daysField = el('label', 'field');
            daysField.appendChild(el('span', 'field-label', 'Token valid for days'));
            const daysInput = el('input', 'field-input');
            daysInput.type = 'number';
            daysInput.min = '1';
            daysInput.max = '30';
            daysInput.value = state.actionDraft.connectionDays;
            daysInput.addEventListener('input', (event) => {
                state.actionDraft.connectionDays = event.target.value;
            });
            daysField.appendChild(daysInput);
            fields.appendChild(daysField);
        }

        panel.appendChild(fields);

        const note = el('div', 'note-box');
        note.appendChild(el('strong', '', 'Selected account: '));
        note.appendChild(document.createTextNode(`${detail.account_label || detail.account_id} - ${titleCase(getSelectedActionOption().context)}`));
        panel.appendChild(note);

        const actions = el('div', 'panel-actions');
        const applyButton = el('button', 'primary-button', state.loading ? 'Applying...' : 'Apply action');
        applyButton.type = 'button';
        applyButton.disabled = state.loading;
        applyButton.addEventListener('click', submitAdminAction);
        actions.appendChild(applyButton);
        panel.appendChild(actions);

        const result = renderActionResult();
        if (result && !['issue_connection_token', 'site_unbind'].includes(state.actionResult?.action)) {
            panel.appendChild(result);
        }

        return panel;
    };

    const renderAuditPanel = (detail) => {
        const panel = el('section', 'panel');
        panel.appendChild(el('div', 'panel-label', 'Audit Trail'));
        panel.appendChild(el('h2', 'panel-title', 'Recent operator actions'));

        const events = Array.isArray(detail.audit?.recent_events) ? detail.audit.recent_events : [];
        if (!events.length) {
            panel.appendChild(el('div', 'empty-state', 'No admin audit events have been recorded yet.'));
            return panel;
        }

        const list = el('div', 'timeline');
        events.forEach((event) => {
            const item = el('div', 'timeline-item');
            item.appendChild(renderStatusPill(event.status || event.action));
            item.appendChild(el('div', 'timeline-title', `${titleCase(event.action, 'Action')} - ${formatDate(event.updated_at || event.created_at)}`));
            item.appendChild(el('div', 'timeline-copy', event.reason || 'No reason captured.'));
            list.appendChild(item);
        });
        panel.appendChild(list);
        return panel;
    };

    const renderRecoveryResult = () => {
        if (!state.recoveryResult) return null;
        const tone = state.recoveryResult.tone === 'danger' ? 'danger' : 'success';
        const box = el('div', `result-box result-box--${tone}`);
        box.appendChild(el('strong', '', state.recoveryResult.message));
        const actionLabel = titleCase(state.recoveryResult.action, 'Recovery');
        const copy = [];
        if (actionLabel) copy.push(actionLabel);
        if (state.recoveryResult.auditEventId) copy.push(`Audit ${state.recoveryResult.auditEventId}`);
        if (copy.length) {
            box.appendChild(el('div', 'result-copy', copy.join(' - ')));
        }
        return box;
    };

    const renderDiagnosticsPanel = (diagnostics) => {
        const panel = el('section', 'panel panel--span-two');
        panel.appendChild(el('div', 'panel-label', 'Support Diagnostics'));
        panel.appendChild(el('h2', 'panel-title', 'Webhook, checkout, and run health'));

        const metrics = el('div', 'mini-metrics mini-metrics--wide');
        metrics.appendChild(renderMetricCard('Replay eligible', formatNumber(diagnostics.webhook_health?.replay_eligible_count || 0)));
        metrics.appendChild(renderMetricCard('Webhook failures', formatNumber(diagnostics.webhook_health?.failed_count || 0)));
        metrics.appendChild(renderMetricCard('Run issues', formatNumber((diagnostics.recent_failures?.run_issues || []).length)));
        metrics.appendChild(renderMetricCard('Site conflicts', formatNumber((diagnostics.site_binding_conflicts || []).length)));
        panel.appendChild(metrics);

        const lookupBox = el('div', 'note-box');
        lookupBox.appendChild(el('strong', '', 'Checkout lookup'));
        const lookupFields = el('div', 'panel-actions');
        const lookupInput = el('input', 'field-input');
        lookupInput.type = 'text';
        lookupInput.placeholder = 'subscription#... or topup#...';
        lookupInput.value = state.diagnosticDraft.checkoutLookupKey;
        lookupInput.addEventListener('input', (event) => {
            state.diagnosticDraft.checkoutLookupKey = event.target.value;
        });
        lookupFields.appendChild(lookupInput);
        const lookupButton = el('button', 'secondary-button', 'Lookup');
        lookupButton.type = 'button';
        lookupButton.addEventListener('click', async () => {
            setLoading(true);
            try {
                await loadAccountDiagnostics(state.selectedAccountId, false);
            } finally {
                state.loading = false;
                render();
            }
        });
        lookupFields.appendChild(lookupButton);
        lookupBox.appendChild(lookupFields);
        const matchedIntent = diagnostics.checkout_lookup?.matched_intent;
        lookupBox.appendChild(el('div', 'result-copy', matchedIntent
            ? `Matched intent ${matchedIntent.intent_id || 'unknown'} - ${titleCase(matchedIntent.intent_type, 'Intent')}`
            : 'Use a checkout lookup key to inspect a specific billing intent.'));
        panel.appendChild(lookupBox);

        const split = el('div', 'split-grid');

        const webhookBlock = el('div', 'subpanel');
        webhookBlock.appendChild(el('h3', 'subpanel-title', 'Webhook delivery history'));
        if (!(diagnostics.webhook_delivery_history || []).length) {
            webhookBlock.appendChild(el('div', 'empty-state empty-state--compact', 'No relevant webhook events were found.'));
        } else {
            const list = el('div', 'timeline');
            (diagnostics.webhook_delivery_history || []).forEach((event) => {
                const item = el('div', 'timeline-item');
                const processingState = event.processing_state || (event.processed ? 'processed' : event.verification_status || 'pending');
                const statusCopy = event.error_summary?.message
                    || (processingState === 'reconciled'
                        ? 'Reconciled from related billing records.'
                        : event.replay_eligible
                            ? 'Replay eligible from stored payload.'
                            : processingState === 'pending'
                                ? 'Awaiting confirmed reconciliation.'
                                : 'Processed successfully.');
                item.appendChild(renderStatusPill(processingState));
                item.appendChild(el('div', 'timeline-title', `${titleCase(event.event_type, 'Webhook')} - ${formatDate(event.created_at)}`));
                item.appendChild(el('div', 'timeline-copy', statusCopy));
                list.appendChild(item);
            });
            webhookBlock.appendChild(list);
        }
        split.appendChild(webhookBlock);

        const issueBlock = el('div', 'subpanel');
        issueBlock.appendChild(el('h3', 'subpanel-title', 'Run issues and admission blockers'));
        const issueList = el('div', 'timeline');
        const blocked = diagnostics.recent_failures?.blocked_admission;
        if (blocked?.blocked) {
            const blockedItem = el('div', 'timeline-item');
            blockedItem.appendChild(renderStatusPill('blocked'));
            blockedItem.appendChild(el('div', 'timeline-title', 'Current admission blockers'));
            blockedItem.appendChild(el('div', 'timeline-copy', (blocked.blockers || []).map((item) => titleCase(item)).join(' - ')));
            issueList.appendChild(blockedItem);
        }
        (diagnostics.recent_failures?.run_issues || []).forEach((runIssue) => {
            const item = el('div', 'timeline-item');
            item.appendChild(renderStatusPill(runIssue.status));
            item.appendChild(el('div', 'timeline-title', `${runIssue.run_id} - ${formatDate(runIssue.updated_at || runIssue.created_at)}`));
            item.appendChild(el('div', 'timeline-copy', `Source ${titleCase(runIssue.source || 'unknown')} - ${titleCase(runIssue.content_type || 'article')}`));
            issueList.appendChild(item);
        });
        if (!issueList.childNodes.length) {
            issueBlock.appendChild(el('div', 'empty-state empty-state--compact', 'No recent run failures or active admission blockers.'));
        } else {
            issueBlock.appendChild(issueList);
        }
        split.appendChild(issueBlock);

        panel.appendChild(split);

        const conflictBlock = el('div', 'subpanel');
        conflictBlock.appendChild(el('h3', 'subpanel-title', 'Site binding conflicts'));
        if (!(diagnostics.site_binding_conflicts || []).length) {
            conflictBlock.appendChild(el('div', 'empty-state empty-state--compact', 'No site binding conflicts detected.'));
        } else {
            const list = el('div', 'key-list');
            (diagnostics.site_binding_conflicts || []).forEach((conflict) => {
                const row = el('div', 'key-row');
                row.appendChild(el('div', 'key-label', conflict.account_label || conflict.account_id));
                row.appendChild(el('div', 'key-value', `${conflict.connected_domain || conflict.site_id} - ${titleCase(conflict.subscription_status, 'Unknown')}`));
                list.appendChild(row);
            });
            conflictBlock.appendChild(list);
        }
        panel.appendChild(conflictBlock);

        return panel;
    };

    const renderRecoveryPanel = (diagnostics) => {
        const panel = el('section', 'panel');
        panel.appendChild(el('div', 'panel-label', 'Recovery Actions'));
        panel.appendChild(el('h2', 'panel-title', 'Retry reconciliation from stored events'));
        panel.appendChild(el('p', 'panel-text', 'Use this surface for webhook replay and reconciliation recovery. Subscription resync remains available in the operator actions panel.'));

        const fields = el('div', 'field-grid');

        const actionField = el('label', 'field');
        actionField.appendChild(el('span', 'field-label', 'Recovery action'));
        const actionSelect = el('select', 'field-input');
        [
            ['replay_failed_webhook', 'Replay failed webhook'],
            ['retry_reconciliation', 'Retry reconciliation']
        ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            option.selected = state.recoveryDraft.action === value;
            actionSelect.appendChild(option);
        });
        actionSelect.addEventListener('change', (event) => {
            state.recoveryDraft.action = event.target.value;
            state.recoveryResult = null;
        });
        actionField.appendChild(actionSelect);
        fields.appendChild(actionField);

        const eventField = el('label', 'field');
        eventField.appendChild(el('span', 'field-label', 'Webhook event ID'));
        const eventSelect = el('select', 'field-input');
        const recoveryCandidates = (diagnostics.webhook_delivery_history || []).filter((item) => item.replay_eligible);
        if (!recoveryCandidates.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No replay-eligible events';
            eventSelect.appendChild(option);
        } else {
            recoveryCandidates.forEach((item) => {
                const option = document.createElement('option');
                option.value = item.event_id;
                option.textContent = `${item.event_id} - ${titleCase(item.event_type, 'Webhook')}`;
                option.selected = state.recoveryDraft.webhookEventId === item.event_id;
                eventSelect.appendChild(option);
            });
        }
        eventSelect.addEventListener('change', (event) => {
            state.recoveryDraft.webhookEventId = event.target.value;
        });
        eventField.appendChild(eventSelect);
        fields.appendChild(eventField);

        const reasonField = el('label', 'field');
        reasonField.appendChild(el('span', 'field-label', 'Reason'));
        const reasonInput = document.createElement('textarea');
        reasonInput.className = 'field-input field-textarea';
        reasonInput.placeholder = 'Document why the webhook or reconciliation needs manual recovery.';
        reasonInput.value = state.recoveryDraft.reason;
        reasonInput.addEventListener('input', (event) => {
            state.recoveryDraft.reason = event.target.value;
        });
        reasonField.appendChild(reasonInput);
        fields.appendChild(reasonField);

        panel.appendChild(fields);

        const actions = el('div', 'panel-actions');
        const applyButton = el('button', 'primary-button', state.loading ? 'Applying...' : 'Run recovery action');
        applyButton.type = 'button';
        applyButton.disabled = state.loading || !recoveryCandidates.length;
        applyButton.addEventListener('click', submitRecoveryAction);
        actions.appendChild(applyButton);
        panel.appendChild(actions);

        const result = renderRecoveryResult();
        if (result) panel.appendChild(result);

        return panel;
    };

    const renderAuthModelPanel = () => {
        const panel = el('section', 'panel panel--span-two');
        panel.appendChild(el('div', 'panel-label', 'Admin Auth Model'));
        panel.appendChild(el('h2', 'panel-title', 'Cognito groups and MFA gate the control plane'));
        panel.appendChild(el('p', 'panel-text', 'The console boundary is ready for Cognito-hosted authentication. During scaffold mode, preview data or a bootstrap token can be used for local iteration.'));
        const pills = el('div', 'status-group');
        (window.AIVI_ADMIN_MOCK.auth.allowedGroups || []).forEach((group) => {
            pills.appendChild(renderStatusPill(group));
        });
        panel.appendChild(pills);
        return panel;
    };

    const getFocusViewMeta = () => {
        const selected = resolveSelectedAccount();
        const fallbackName = selected?.account_label || selected?.account_id || 'selected account';
        const views = {
            overview: {
                eyebrow: 'Overview',
                title: 'Workspace overview',
                copy: 'Keep session state, auth posture, and the selected account in view without the rest of the console competing for attention.'
            },
            accounts: {
                eyebrow: 'Account workspace',
                title: `Account and site detail for ${fallbackName}`,
                copy: 'Focus on one customer at a time, with account state and connected sites in a single scrollable reading area.'
            },
            operations: {
                eyebrow: 'Operator actions',
                title: `Controlled actions for ${fallbackName}`,
                copy: 'All write actions stay grouped here so intervention work does not overwhelm billing or diagnostics.'
            },
            diagnostics: {
                eyebrow: 'Diagnostics',
                title: `Support diagnostics for ${fallbackName}`,
                copy: 'Inspect webhook health, checkout lookups, recent run issues, and site conflicts in one place.'
            },
            billing: {
                eyebrow: 'Billing',
                title: `Billing and credits for ${fallbackName}`,
                copy: 'Review credits, included usage, top-ups, and subscription health without leaving the selected account.'
            },
            audit: {
                eyebrow: 'Audit',
                title: `Operator audit trail for ${fallbackName}`,
                copy: 'See the most recent super-admin actions without stacking them below unrelated panels.'
            }
        };
        return views[state.currentView] || views.accounts;
    };

    const renderSectionPill = (label, tone = 'neutral') => {
        const pill = el('span', `workspace-section__pill workspace-section__pill--${tone}`, label);
        return pill;
    };

    const renderWorkspaceSection = ({ title, badge, badgeTone = 'neutral', panel, open = false }) => {
        const section = document.createElement('details');
        section.className = 'workspace-section';
        section.open = open;

        const summary = document.createElement('summary');
        summary.className = 'workspace-section__summary';
        summary.appendChild(el('span', 'workspace-section__title', title));
        if (badge) {
            summary.appendChild(renderSectionPill(badge, badgeTone));
        }
        section.appendChild(summary);

        const body = el('div', 'workspace-section__body');
        body.appendChild(asEmbeddedPanel(panel));
        section.appendChild(body);
        return section;
    };

    const renderFocusedWorkspace = (detail, diagnostics) => {
        const panel = el('section', 'panel workspace-focus-panel');
        const meta = getFocusViewMeta();

        panel.id = (NAV_ITEMS.find((item) => item.view === state.currentView) || {}).sectionId || 'section-accounts';
        panel.appendChild(el('div', 'panel-label', meta.eyebrow));
        panel.appendChild(el('h2', 'panel-title', meta.title));
        panel.appendChild(el('p', 'panel-text workspace-focus-copy', meta.copy));

        const scroll = el('div', 'panel-scroll panel-scroll--workspace');
        scroll.tabIndex = 0;

        const stack = el('div', 'workspace-focus-stack');
        if (!detail) {
            stack.appendChild(el('div', 'empty-state', 'Choose an account from the list to focus the workspace.'));
            scroll.appendChild(stack);
            panel.appendChild(scroll);
            return panel;
        }

        if (state.currentView === 'overview') {
            const overviewBundle = el('div', 'workspace-focus-stack');
            overviewBundle.appendChild(asEmbeddedPanel(renderOperatorSummary()));
            overviewBundle.appendChild(asEmbeddedPanel(renderAuthModelPanel()));
            stack.appendChild(renderWorkspaceSection({
                title: 'Session and auth',
                badge: state.session.mode === 'preview' ? 'Preview' : 'API mode',
                badgeTone: state.session.mode === 'preview' ? 'warning' : 'neutral',
                panel: overviewBundle,
                open: true
            }));
        }

        stack.appendChild(renderWorkspaceSection({
            title: 'Account summary',
            badge: titleCase(detail.plan.subscription_status, 'Unknown'),
            badgeTone: STATUS_TONES[String(detail.plan.subscription_status || '').toLowerCase()] || 'neutral',
            panel: renderOverviewPanel(detail),
            open: state.currentView === 'overview' || state.currentView === 'accounts'
        }));

        stack.appendChild(renderWorkspaceSection({
            title: 'Connected sites',
            badge: `${(detail.sites || []).length} items`,
            panel: renderSiteDetailPanel(detail),
            open: state.currentView === 'accounts'
        }));

        stack.appendChild(renderWorkspaceSection({
            title: 'Site lifecycle',
            badge: state.actionDraft.action === 'issue_connection_token' ? 'Token flow' : 'Operator guided',
            badgeTone: (diagnostics?.site_binding_conflicts || []).length > 0 ? 'warning' : 'neutral',
            panel: renderSiteLifecyclePanel(detail, diagnostics),
            open: state.currentView === 'accounts' || state.currentView === 'operations'
        }));

        stack.appendChild(renderWorkspaceSection({
            title: 'Billing and discounts',
            badge: detail.plan.plan_name || titleCase(detail.plan.plan_code, 'Plan'),
            panel: renderBillingPanel(detail),
            open: state.currentView === 'billing'
        }));

        stack.appendChild(renderWorkspaceSection({
            title: 'Actions and recovery',
            badge: 'Operator tools',
            panel: (() => {
                const bundle = el('div', 'workspace-focus-stack');
                bundle.appendChild(asEmbeddedPanel(renderActionPanel(detail)));
                if (diagnostics) {
                    bundle.appendChild(asEmbeddedPanel(renderRecoveryPanel(diagnostics)));
                }
                return bundle;
            })(),
            open: state.currentView === 'operations'
        }));

        stack.appendChild(renderWorkspaceSection({
            title: 'Diagnostics and run health',
            badge: diagnostics ? `${Number(diagnostics.webhook_health?.failed_count || 0)} webhook issues` : 'Unavailable',
            badgeTone: diagnostics && Number(diagnostics.webhook_health?.failed_count || 0) > 0 ? 'danger' : 'neutral',
            panel: diagnostics ? renderDiagnosticsPanel(diagnostics) : el('div', 'empty-state', 'Diagnostics are not available yet for this account.'),
            open: state.currentView === 'diagnostics'
        }));

        stack.appendChild(renderWorkspaceSection({
            title: 'Audit and recovery history',
            badge: Array.isArray(detail.audit?.recent_events) && detail.audit.recent_events.length ? 'Recent activity' : 'No events',
            badgeTone: Array.isArray(detail.audit?.recent_events) && detail.audit.recent_events.length ? 'success' : 'neutral',
            panel: renderAuditPanel(detail),
            open: state.currentView === 'audit'
        }));

        scroll.appendChild(stack);
        panel.appendChild(scroll);
        return panel;
    };

    const renderContextRail = (detail, diagnostics) => {
        const rail = el('div', 'action-rail-stack');

        const shortcuts = el('section', 'panel context-rail-card');
        shortcuts.appendChild(el('div', 'panel-label', 'Action rail'));
        shortcuts.appendChild(el('h2', 'panel-title', 'Focused tools'));
        shortcuts.appendChild(el('p', 'panel-text', 'Keep intervention tools and context cards separate from the main workspace.'));
        const shortcutActions = el('div', 'panel-actions');
        [
            ['accounts', 'Account'],
            ['operations', 'Actions'],
            ['diagnostics', 'Diagnostics'],
            ['billing', 'Billing'],
            ['audit', 'Audit']
        ].forEach(([view, label]) => {
            const button = el('button', state.currentView === view ? 'primary-button' : 'secondary-button', label);
            button.type = 'button';
            button.addEventListener('click', () => setCurrentView(view));
            shortcutActions.appendChild(button);
        });
        shortcuts.appendChild(shortcutActions);
        rail.appendChild(shortcuts);

        if (!detail) {
            const emptyCard = el('section', 'panel context-rail-card');
            emptyCard.appendChild(el('div', 'panel-label', 'Selected account'));
            emptyCard.appendChild(el('h2', 'panel-title', 'Waiting for focus'));
            emptyCard.appendChild(el('div', 'empty-state empty-state--compact', 'Select an account to populate the action rail.'));
            rail.appendChild(emptyCard);
            return rail;
        }

        const accountCard = el('section', 'panel context-rail-card');
        accountCard.appendChild(el('div', 'panel-label', 'Account status'));
        accountCard.appendChild(el('h3', 'context-card__title', detail.account_label || detail.account_id));
        accountCard.appendChild(el('div', 'status-group', ''));
        const accountStatus = accountCard.lastChild;
        accountStatus.appendChild(renderStatusPill(detail.plan.subscription_status));
        accountStatus.appendChild(renderStatusPill(detail.plan.trial_status));
        const miniMetrics = el('div', 'mini-metrics');
        miniMetrics.appendChild(renderMetricCard('Credits', formatNumber(detail.credits.total_remaining)));
        miniMetrics.appendChild(renderMetricCard('Sites', String((detail.sites || []).length)));
        accountCard.appendChild(miniMetrics);
        rail.appendChild(accountCard);

        const primarySite = (detail.sites || [])[0];
        const siteCard = el('section', 'panel context-rail-card');
        siteCard.appendChild(el('div', 'panel-label', 'Site snapshot'));
        siteCard.appendChild(el('h3', 'context-card__title', primarySite?.connected_domain || 'No connected site'));
        siteCard.appendChild(el('div', 'muted', primarySite
            ? `Site ID ${primarySite.site_id || 'n/a'} · Plugin ${primarySite.plugin_version || 'Unknown'} · Last analysis ${formatDate(primarySite.last_analysis_at || detail.usage.last_analysis_at)}`
            : 'This account does not currently have any bound sites.'));
        if (primarySite) {
            const sitePills = el('div', 'status-group');
            sitePills.appendChild(renderStatusPill(primarySite.binding_status || 'connected'));
            if ((detail.sites || []).length > 1) {
                sitePills.appendChild(renderStatusPill(`${detail.sites.length} sites`));
            }
            siteCard.appendChild(sitePills);
        }
        rail.appendChild(siteCard);

        const alertCard = el('section', 'panel context-rail-card');
        alertCard.appendChild(el('div', 'panel-label', 'Attention flags'));
        alertCard.appendChild(el('h3', 'context-card__title', 'Operational status'));
        const alertList = el('div', 'status-group');
        const conflictCount = (diagnostics?.site_binding_conflicts || []).length;
        const failureCount = Number(diagnostics?.webhook_health?.failed_count || 0);
        const replayEligibleCount = Number(diagnostics?.webhook_health?.replay_eligible_count || 0);
        if (conflictCount > 0) {
            alertList.appendChild(renderStatusPill(`conflicts ${conflictCount}`));
        }
        if (failureCount > 0) {
            alertList.appendChild(renderStatusPill(`failures ${failureCount}`));
        }
        if (replayEligibleCount > 0) {
            alertList.appendChild(renderStatusPill(`replay ${replayEligibleCount}`));
        }
        if (!alertList.childNodes.length) {
            alertList.appendChild(renderStatusPill('healthy'));
        }
        alertCard.appendChild(alertList);
        rail.appendChild(alertCard);

        const recentActivity = el('section', 'panel context-rail-card');
        recentActivity.appendChild(el('div', 'panel-label', 'Recent activity'));
        recentActivity.appendChild(el('h3', 'context-card__title', 'Latest operator events'));
        const recentEvents = Array.isArray(detail.audit?.recent_events) ? detail.audit.recent_events.slice(0, 3) : [];
        if (!recentEvents.length) {
            recentActivity.appendChild(el('div', 'muted', 'No recent super-admin events are available for this account.'));
        } else {
            const list = el('div', 'timeline');
            recentEvents.forEach((event) => {
                const item = el('div', 'timeline-item');
                item.appendChild(renderStatusPill(event.status || event.action));
                item.appendChild(el('div', 'timeline-title', titleCase(event.action, 'Action')));
                item.appendChild(el('div', 'timeline-copy', formatDate(event.updated_at || event.created_at)));
                list.appendChild(item);
            });
            recentActivity.appendChild(list);
        }
        rail.appendChild(recentActivity);

        return rail;
    };

    const renderError = () => {
        if (!state.error) return null;
        const box = el('div', 'error-box');
        box.appendChild(el('strong', '', 'Admin console error: '));
        box.appendChild(document.createTextNode(state.error));
        return box;
    };

    const renderBody = () => {
        const body = el('div', 'workspace-sections');

        const content = el('div', 'content-layout content-layout--focused');

        const sidebar = el('div', 'content-sidebar content-sidebar--focused');
        const browserPanel = renderAccountBrowserPanel();
        browserPanel.id = 'section-accounts';
        sidebar.appendChild(browserPanel);
        content.appendChild(sidebar);

        const main = el('div', 'content-main content-main--focused');
        if (state.session.mode === 'api' && !state.session.connected) {
            const gateWorkspace = el('section', 'panel workspace-focus-panel');
            gateWorkspace.id = 'section-overview';
            gateWorkspace.appendChild(el('div', 'panel-label', 'Operator gate'));
            gateWorkspace.appendChild(el('h2', 'panel-title', 'Authenticate and start from a focused workspace'));
            gateWorkspace.appendChild(el('p', 'panel-text workspace-focus-copy', 'This state now uses the same compact layout. Sign in first, then the account and site workspace will populate without changing shells.'));
            const scroll = el('div', 'panel-scroll panel-scroll--workspace');
            scroll.tabIndex = 0;
            const stack = el('div', 'workspace-focus-stack');
            stack.appendChild(renderWorkspaceSection({
                title: 'Authentication',
                badge: state.session.mode === 'preview' ? 'Preview' : 'API mode',
                badgeTone: state.session.mode === 'preview' ? 'warning' : 'neutral',
                panel: renderLoginGate(),
                open: true
            }));
            stack.appendChild(renderWorkspaceSection({
                title: 'Auth model',
                badge: runtimeAuth.requireMfa ? 'MFA required' : 'MFA relaxed',
                badgeTone: runtimeAuth.requireMfa ? 'warning' : 'neutral',
                panel: renderAuthModelPanel(),
                open: false
            }));
            scroll.appendChild(stack);
            gateWorkspace.appendChild(scroll);
            main.appendChild(gateWorkspace);
        } else {
            main.appendChild(renderFocusedWorkspace(state.accountDetail, state.accountDiagnostics));
        }
        content.appendChild(main);

        const rail = el('div', 'content-rail');
        if (state.session.mode === 'api' && !state.session.connected) {
            const gateRail = el('section', 'panel context-rail panel--scroll-shell');
            gateRail.appendChild(el('div', 'panel-label', 'Action rail'));
            gateRail.appendChild(el('h2', 'panel-title', 'Session context'));
            gateRail.appendChild(el('p', 'panel-text', 'Use this rail for session state and auth posture while the main workspace handles sign-in.'));
            const scroll = el('div', 'panel-scroll panel-scroll--rail');
            scroll.tabIndex = 0;
            const stack = el('div', 'workspace-focus-stack');
            stack.appendChild(asEmbeddedPanel(renderOperatorSummary()));
            scroll.appendChild(stack);
            gateRail.appendChild(scroll);
            rail.appendChild(gateRail);
        } else {
            rail.appendChild(renderContextRail(state.accountDetail, state.accountDiagnostics));
        }
        content.appendChild(rail);

        body.appendChild(content);
        return body;
    };

    const renderHero = () => {
        const rollup = getAccountRollup();
        const financialOverview = state.financials.item;
        const hero = el('section', 'hero hero--metrics');
        hero.id = 'section-hero';

        const kpis = el('div', 'hero-kpis');
        kpis.appendChild(renderQuickStat('Accounts', formatNumber(rollup.totalAccounts)));
        kpis.appendChild(renderQuickStat('Paid', formatNumber(rollup.activeAccounts)));
        kpis.appendChild(renderQuickStat('Trial', formatNumber(rollup.trialAccounts)));
        kpis.appendChild(renderMetricButton({
            label: 'Financials',
            value: state.financials.loading ? 'Loading…' : rollup.projectedMrr,
            detail: financialOverview
                ? `${formatCurrencyUsd(financialOverview.observed_checkout_revenue?.last_30d_usd)} observed in 30d`
                : 'Projected MRR plus revenue health. Click to open.',
            onClick: openFinancialsOverlay,
            active: state.financials.overlayOpen
        }));
        kpis.appendChild(renderQuickStat('Alerts', formatNumber(rollup.alertCount)));
        hero.appendChild(kpis);
        return hero;
    };

    const render = () => {
        const root = document.getElementById('app');
        clear(root);

        const shell = el('div', 'console-shell console-shell--compact');

        const page = el('main', 'page-shell');
        page.appendChild(renderTopbar());
        page.appendChild(renderHero());

        const error = renderError();
        if (error) page.appendChild(error);

        page.appendChild(renderBody());

        shell.appendChild(page);
        const financialsOverlay = renderFinancialsOverlay();
        if (financialsOverlay) shell.appendChild(financialsOverlay);
        root.appendChild(shell);
    };

    const init = async () => {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.financials.overlayOpen) {
                closeFinancialsOverlay();
            }
        });
        await handleAuthRedirect();
        render();
        if (state.session.mode === 'preview' || state.session.connected) {
            await loadAccounts();
        }
    };

    init();
})();

