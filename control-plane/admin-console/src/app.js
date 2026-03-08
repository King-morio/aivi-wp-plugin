(function () {
    const runtime = window.AIVI_ADMIN_RUNTIME || {};
    const runtimeAuth = runtime.auth || {};
    const previewClient = window.AiviAdminApi.createPreviewClient();

    const state = {
        session: {
            mode: runtime.allowPreview === false ? 'api' : 'preview',
            baseUrl: runtime.apiBaseUrl || '',
            bootstrapToken: '',
            connected: runtime.allowPreview !== false
        },
        loading: false,
        error: '',
        filters: {
            query: '',
            planCode: '',
            subscriptionStatus: ''
        },
        accounts: [],
        selectedAccountId: '',
        accountDetail: null,
        currentView: 'accounts',
        actionDraft: {
            action: 'manual_credit_adjustment',
            reason: '',
            creditsDelta: '5000',
            trialDays: '14',
            targetPlanCode: 'starter'
        },
        actionResult: null,
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
        { value: 'subscription_resync', label: 'Subscription resync', context: 'Support' },
        { value: 'site_unbind', label: 'Site unbind', context: 'Sites' },
        { value: 'account_pause', label: 'Pause account', context: 'Support' },
        { value: 'account_restore', label: 'Restore account', context: 'Support' }
    ];

    const ACTION_HELP = {
        manual_credit_adjustment: 'Adds or deducts credits without changing the customer plan.',
        extend_trial: 'Moves the trial window forward without changing the paid subscription state.',
        end_trial: 'Ends the trial immediately and re-evaluates access on the next summary refresh.',
        plan_override: 'Switches the effective plan state for support or recovery purposes.',
        subscription_resync: 'Queues a provider state refresh without changing plan credits directly.',
        site_unbind: 'Removes the current site binding so the customer can reconnect cleanly.',
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
        { view: 'overview', label: 'Overview', hint: 'Session and auth', sectionId: 'section-hero' },
        { view: 'accounts', label: 'Accounts', hint: 'Customer state', sectionId: 'section-accounts' },
        { view: 'operations', label: 'Operations', hint: 'Mutations and recovery', sectionId: 'section-operations' },
        { view: 'diagnostics', label: 'Diagnostics', hint: 'Webhook and run health', sectionId: 'section-diagnostics' },
        { view: 'billing', label: 'Billing', hint: 'Credits and subscriptions', sectionId: 'section-billing' },
        { view: 'audit', label: 'Audit', hint: 'Operator history', sectionId: 'section-audit' }
    ];

    const formatNumber = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '0';
        return new Intl.NumberFormat().format(numeric);
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
        if (state.session.mode === 'api' && state.session.connected && state.session.baseUrl) {
            return window.AiviAdminApi.createApiClient({
                baseUrl: state.session.baseUrl,
                bootstrapToken: state.session.bootstrapToken
            });
        }
        return previewClient;
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

    const buildMutationPayload = () => {
        const payload = {
            action: state.actionDraft.action,
            reason: state.actionDraft.reason
        };
        if (actionNeedsCredits()) payload.credits_delta = Number(state.actionDraft.creditsDelta || 0);
        if (actionNeedsTrialDays()) payload.trial_days = Number(state.actionDraft.trialDays || 14);
        if (actionNeedsPlanCode()) payload.target_plan_code = state.actionDraft.targetPlanCode;
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

    const getAccountRollup = () => {
        const accounts = Array.isArray(state.accounts) ? state.accounts : [];
        return {
            totalAccounts: accounts.length,
            activeAccounts: accounts.filter((account) => String(account.subscription_status || '').toLowerCase() === 'active').length,
            trialAccounts: accounts.filter((account) => String(account.subscription_status || '').toLowerCase() === 'trial').length,
            suspendedAccounts: accounts.filter((account) => String(account.subscription_status || '').toLowerCase() === 'suspended').length,
            totalCredits: accounts.reduce((sum, account) => sum + (Number(account.credits_remaining) || 0), 0)
        };
    };

    const setCurrentView = (viewId) => {
        state.currentView = viewId;
        render();
        const targetId = (NAV_ITEMS.find((item) => item.view === viewId) || {}).sectionId;
        if (!targetId) return;
        window.requestAnimationFrame(() => {
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    };

    const loadAccounts = async () => {
        setLoading(true);
        try {
            const client = getClient();
            const response = await client.listAccounts(state.filters);
            state.accounts = Array.isArray(response.items) ? response.items : [];
            if (!state.selectedAccountId || !state.accounts.some((item) => item.account_id === state.selectedAccountId)) {
                state.selectedAccountId = state.accounts[0] ? state.accounts[0].account_id : '';
            }
            state.error = '';
            if (state.selectedAccountId) {
                await loadAccountDetail(state.selectedAccountId, false);
            } else {
                state.accountDetail = null;
            }
        } catch (error) {
            state.error = error.message || 'Could not load accounts.';
        } finally {
            state.loading = false;
            render();
        }
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
            const client = getClient();
            const response = await client.getAccountDetail(accountId);
            if (state.selectedAccountId && state.selectedAccountId !== accountId) {
                state.actionResult = null;
                state.recoveryResult = null;
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
        if (rerender) render();
    };

    const loadAccountDiagnostics = async (accountId, rerender = true) => {
        if (!accountId) {
            state.accountDiagnostics = null;
            if (rerender) render();
            return;
        }
        try {
            const client = getClient();
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

    const submitAdminAction = async () => {
        if (!state.accountDetail || !state.selectedAccountId) return;
        setLoading(true);
        try {
            const client = getClient();
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
            const client = getClient();
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

    const renderQuickStat = (label, value) => {
        const card = el('div', 'quick-stat');
        card.appendChild(el('div', 'quick-stat__value', value));
        card.appendChild(el('div', 'quick-stat__label', label));
        return card;
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
        copy.appendChild(el('div', 'workspace-topbar__eyebrow', 'AiVI internal control plane'));
        copy.appendChild(el('h1', 'workspace-topbar__title', `${getGreeting()}, operator.`));
        copy.appendChild(el('div', 'workspace-topbar__meta', state.accountDetail
            ? `Focused on ${state.accountDetail.account_label || state.accountDetail.account_id}`
            : 'Review accounts, credits, billing, and recovery from one surface.'));
        header.appendChild(copy);

        const actions = el('div', 'workspace-topbar__actions');
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
        section.appendChild(el('h2', 'panel-title', 'Choose preview or API mode'));
        section.appendChild(el('p', 'panel-text', runtime.allowPreview === false
            ? 'This environment is configured for API mode only. Use Cognito-backed admin access against the deployed control plane.'
            : 'Preview mode uses bundled mock data. API mode will call the new super-admin routes once your admin domain and auth are live.'));

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
        section.appendChild(fieldGrid);

        const actions = el('div', 'panel-actions');
        const connectButton = el('button', 'primary-button', state.session.mode === 'preview' ? 'Enter preview console' : 'Connect to admin API');
        connectButton.type = 'button';
        connectButton.addEventListener('click', async () => {
            state.session.connected = true;
            await loadAccounts();
        });
        actions.appendChild(connectButton);
        section.appendChild(actions);

        const note = el('div', 'note-box');
        note.appendChild(el('strong', '', 'Current auth direction: '));
        note.appendChild(document.createTextNode(`AWS Cognito Hosted UI + PKCE, MFA, and operator groups. Runtime environment: ${runtime.environment || 'local'}.`));
        section.appendChild(note);
        return section;
    };

    const renderOperatorSummary = () => {
        const panel = el('section', 'panel summary-panel');
        panel.appendChild(el('div', 'panel-label', 'Session Summary'));
        panel.appendChild(el('h2', 'panel-title', state.session.mode === 'preview' ? 'Preview session active' : 'Admin API session'));
        panel.appendChild(el('p', 'panel-text', state.session.mode === 'preview'
            ? 'You are viewing the console with mock data. The layout and flows are real, but the data is bundled locally.'
            : 'This session is prepared to use the backend super-admin read APIs. Live auth will replace the bootstrap token once Cognito is wired.'));

        const metrics = el('div', 'mini-metrics');
        metrics.appendChild(renderMetricCard('Mode', titleCase(state.session.mode, 'Preview')));
        metrics.appendChild(renderMetricCard('Accounts loaded', formatNumber(state.accounts.length || 0)));
        metrics.appendChild(renderMetricCard('Selected account', resolveSelectedAccount() ? resolveSelectedAccount().account_label : 'None'));
        panel.appendChild(metrics);
        return panel;
    };

    const renderFilterBar = () => {
        const bar = el('section', 'panel filter-panel');
        bar.appendChild(el('div', 'panel-label', 'Search and Filters'));
        const fields = el('div', 'filter-grid');

        const queryField = el('label', 'field');
        queryField.appendChild(el('span', 'field-label', 'Search accounts'));
        const queryInput = el('input', 'field-input');
        queryInput.type = 'text';
        queryInput.placeholder = 'Account, domain, or account ID';
        queryInput.value = state.filters.query;
        queryInput.addEventListener('input', (event) => {
            state.filters.query = event.target.value;
        });
        queryField.appendChild(queryInput);
        fields.appendChild(queryField);

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
        bar.appendChild(fields);

        const actions = el('div', 'panel-actions');
        const applyButton = el('button', 'primary-button', 'Apply filters');
        applyButton.type = 'button';
        applyButton.addEventListener('click', loadAccounts);
        actions.appendChild(applyButton);

        const resetButton = el('button', 'secondary-button', 'Reset');
        resetButton.type = 'button';
        resetButton.addEventListener('click', () => {
            state.filters = { query: '', planCode: '', subscriptionStatus: '' };
            loadAccounts();
        });
        actions.appendChild(resetButton);
        bar.appendChild(actions);
        return bar;
    };

    const renderAccountList = () => {
        const panel = el('section', 'panel panel--span-two');
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

        panel.appendChild(list);
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

        const list = el('div', 'key-list');
        const site = (detail.sites && detail.sites[0]) || {};
        [
            ['Primary domain', site.connected_domain || 'Not connected'],
            ['Site ID', site.site_id || 'Not available'],
            ['Blog ID', site.blog_id || 'Not available'],
            ['Binding', titleCase(site.binding_status, 'Unknown')],
            ['Plugin version', site.plugin_version || 'Unknown'],
            ['Last analysis', formatDate(detail.usage.last_analysis_at)]
        ].forEach(([label, value]) => {
            const row = el('div', 'key-row');
            row.appendChild(el('div', 'key-label', label));
            row.appendChild(el('div', 'key-value', String(value)));
            list.appendChild(row);
        });
        panel.appendChild(list);
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

        const effectEntries = Object.entries(state.actionResult.effect || {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
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

        return box;
    };

    const renderActionPanel = (detail) => {
        const panel = el('section', 'panel');
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
            state.actionDraft.action = event.target.value;
            state.actionResult = null;
            render();
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
        if (result) panel.appendChild(result);

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

    const renderError = () => {
        if (!state.error) return null;
        const box = el('div', 'error-box');
        box.appendChild(el('strong', '', 'Admin console error: '));
        box.appendChild(document.createTextNode(state.error));
        return box;
    };

    const renderBody = () => {
        const body = el('div', 'workspace-sections');

        const utility = el('div', 'utility-grid');
        utility.id = 'section-overview';
        utility.appendChild(renderLoginGate());
        utility.appendChild(renderOperatorSummary());
        utility.appendChild(renderFilterBar());
        utility.appendChild(renderAuthModelPanel());
        body.appendChild(utility);

        const content = el('div', 'content-layout');
        const sidebar = el('div', 'content-sidebar');
        const accountList = renderAccountList();
        accountList.id = 'section-accounts';
        sidebar.appendChild(accountList);
        content.appendChild(sidebar);

        const main = el('div', 'content-main');

        if (state.accountDetail) {
            const overviewGrid = el('div', 'detail-grid detail-grid--two');
            const overviewPanel = renderOverviewPanel(state.accountDetail);
            overviewPanel.id = 'section-overview-panel';
            const sitePanel = renderSiteDetailPanel(state.accountDetail);
            overviewGrid.appendChild(overviewPanel);
            overviewGrid.appendChild(sitePanel);
            main.appendChild(overviewGrid);

            const operationsGrid = el('div', 'detail-grid detail-grid--two');
            operationsGrid.id = 'section-operations';
            operationsGrid.appendChild(renderActionPanel(state.accountDetail));
            if (state.accountDiagnostics) {
                operationsGrid.appendChild(renderRecoveryPanel(state.accountDiagnostics));
            }
            main.appendChild(operationsGrid);

            if (state.accountDiagnostics) {
                const diagnosticsPanel = renderDiagnosticsPanel(state.accountDiagnostics);
                diagnosticsPanel.id = 'section-diagnostics';
                main.appendChild(diagnosticsPanel);
            }

            const billingPanel = renderBillingPanel(state.accountDetail);
            billingPanel.id = 'section-billing';
            main.appendChild(billingPanel);

            const auditPanel = renderAuditPanel(state.accountDetail);
            auditPanel.id = 'section-audit';
            main.appendChild(auditPanel);
        } else {
            const empty = el('section', 'panel panel--span-two');
            empty.appendChild(el('div', 'panel-label', 'Account Detail'));
            empty.appendChild(el('h2', 'panel-title', 'Select an account'));
            empty.appendChild(el('p', 'panel-text', 'Choose an account from the list to inspect connected sites, billing health, and credit activity.'));
            main.appendChild(empty);
        }

        content.appendChild(main);
        body.appendChild(content);
        return body;
    };

    const renderHero = () => {
        const rollup = getAccountRollup();
        const hero = el('section', 'hero');
        hero.id = 'section-hero';

        const left = el('div', 'hero-copy');
        left.appendChild(el('div', 'eyebrow', 'AiVI Internal Control Plane'));
        left.appendChild(el('h2', 'hero-title', 'Operate accounts, credits, and recovery from one surface.'));
        left.appendChild(el('p', 'hero-text', 'Monitor customer state, intervene safely, and keep billing, diagnostics, and recovery flows under direct operator control.'));

        const spotlight = el('div', 'hero-spotlight');
        spotlight.appendChild(el('div', 'hero-spotlight__label', state.session.mode === 'preview' ? 'Preview workspace' : 'Live admin workspace'));
        spotlight.appendChild(el('div', 'hero-spotlight__title', state.loading ? 'Refreshing authoritative records...' : 'Search accounts, inspect billing health, and recover provider drift fast.'));
        const spotlightActions = el('div', 'hero-spotlight__actions');
        ['Credit controls', 'Webhook replay', 'Site recovery', 'Billing health'].forEach((label) => {
            spotlightActions.appendChild(el('span', 'hero-chip', label));
        });
        spotlight.appendChild(spotlightActions);
        left.appendChild(spotlight);
        hero.appendChild(left);

        const right = el('div', 'hero-meta');
        right.appendChild(renderQuickStat('Accounts', formatNumber(rollup.totalAccounts)));
        right.appendChild(renderQuickStat('Active', formatNumber(rollup.activeAccounts)));
        right.appendChild(renderQuickStat('Trial', formatNumber(rollup.trialAccounts)));
        right.appendChild(renderQuickStat('Suspended', formatNumber(rollup.suspendedAccounts)));
        right.appendChild(renderMetricCard('Credits under management', formatNumber(rollup.totalCredits), 'Across loaded accounts'));
        right.appendChild(renderMetricCard('Auth direction', titleCase(runtimeAuth.mode, 'Cognito Hosted UI'), runtimeAuth.requireMfa ? 'MFA required' : 'MFA optional'));
        hero.appendChild(right);
        return hero;
    };

    const render = () => {
        const root = document.getElementById('app');
        clear(root);

        const shell = el('div', 'console-shell');
        shell.appendChild(renderRail());

        const page = el('main', 'page-shell');
        page.appendChild(renderTopbar());
        page.appendChild(renderHero());

        const error = renderError();
        if (error) page.appendChild(error);

        page.appendChild(renderBody());

        const footer = el('section', 'footer-note');
        footer.appendChild(el('strong', '', 'Step 5 status. '));
        footer.appendChild(document.createTextNode('Support diagnostics and recovery tooling are now available. IAM hardening, deployment, and production rollout validation remain Step 6 work.'));
        page.appendChild(footer);

        shell.appendChild(page);
        root.appendChild(shell);
    };

    loadAccounts();
})();
