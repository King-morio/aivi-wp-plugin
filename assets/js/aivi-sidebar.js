(function (wp, config) {
    const debugLog = function (level, message, data) {
        if (!window || !window.AIVI_DEBUG) return;
        const entry = {
            level: level || 'info',
            message: message || '',
            data: data || null,
            timestamp: new Date().toISOString()
        };
        if (!window.AIVI_DEBUG_LOGS) window.AIVI_DEBUG_LOGS = [];
        window.AIVI_DEBUG_LOGS.push(entry);
    };
    debugLog('info', 'AiVI: Sidebar script starting');
    debugLog('info', 'AiVI: wp object available', { available: !!wp });
    debugLog('info', 'AiVI: config available', { available: !!config });

    const { createElement, useState, useEffect, useCallback, useRef } = wp.element || {};
    const { registerPlugin, getPlugins } = wp.plugins || {};
    const { PluginSidebar } = wp.editor || wp.editPost || {};
    const { PanelBody, Button, Spinner, Dashicon } = wp.components || {};
    const { select } = wp.data || {};
    const restBase = config.restBase || '/wp-json/aivi/v1';
    const nonce = config.nonce || '';
    const canonicalCategoryMap = (config && typeof config.checkCategoryMap === 'object' && config.checkCategoryMap) ? config.checkCategoryMap : {};
    const isAutoStaleDetectionEnabled = (() => {
        const stalePolicy = typeof config.stalePolicy === 'string'
            ? config.stalePolicy.toLowerCase()
            : 'manual_refresh';
        if (stalePolicy !== 'auto') return false;
        const flags = (config && typeof config.featureFlags === 'object' && config.featureFlags) ? config.featureFlags : {};
        if (typeof config.autoStaleDetection === 'boolean') return config.autoStaleDetection;
        if (typeof flags.AUTO_STALE_DETECTION === 'boolean') return flags.AUTO_STALE_DETECTION;
        return false;
    })();

    try { window.aiviSidebar = { restBase, nonce }; } catch (e) { }

    // ============================================
    // COLOR TOKENS
    // ============================================
    const COLORS = {
        primary: '#2563EB',
        primaryLight: '#EFF6FF',
        success: '#16A34A',
        successLight: '#DCFCE7',
        warning: '#FFFBEB',
        warningBorder: '#FDE68A',
        error: '#EF4444',
        errorLight: '#FEE2E2',
        scoreText: '#111827',
        subtext: '#475569',
        muted: '#9ca3af',
        cardBorder: '#E5E7EB',
        white: '#FFFFFF',
        aeoRing: '#FCD34D',
        geoRing: '#86EFAC',
        highBg: '#FEE2E2',
        highText: '#991B1B',
        mediumBg: '#FEF3C7',
        mediumText: '#92400E',
        lowBg: '#DCFCE7',
        lowText: '#166534',
        failIcon: '#DC2626',
        partialIcon: '#CA8A04',
        passIcon: '#16A34A',
        inlineFail: '#7c3aed',
        inlinePartial: '#2563eb',
        inlinePass: '#059669'
    };

    const ANALYSIS_STATUS_LABEL = 'Analysis in progress.';
    const ANALYSIS_HERO_MESSAGE = 'Initializing AI perspective simulation...';
    const ANALYSIS_PROGRESS_PHASES = [
        {
            id: 'intro_answer',
            contextTag: 'Opening Signals',
            bannerTitle: 'Reviewing opening clarity',
            label: 'Intro & Answer',
            messages: [
                'Reviewing intro clarity',
                'Checking intro focus',
                'Validating answer placement',
                'Measuring answer brevity',
                'Evaluating answer alignment'
            ]
        },
        {
            id: 'claims_evidence',
            contextTag: 'Claim Support',
            bannerTitle: 'Checking claim support',
            label: 'Claims & Evidence',
            messages: [
                'Scanning claim patterns',
                'Checking evidence support',
                'Reviewing provenance signals',
                'Validating numeric claims',
                'Running coherence checks'
            ]
        },
        {
            id: 'entities_meaning',
            contextTag: 'Entity Clarity',
            bannerTitle: 'Mapping semantic relationships',
            label: 'Entities & Meaning',
            messages: [
                'Detecting named entities',
                'Mapping entity relationships',
                'Resolving ambiguity',
                'Checking topical relevance',
                'Reviewing terminology consistency'
            ]
        },
        {
            id: 'structure_schema',
            contextTag: 'Structure and Schema',
            bannerTitle: 'Validating machine-readable structure',
            label: 'Structure & Schema',
            messages: [
                'Checking heading structure',
                'Detecting orphan headings',
                'Validating schema syntax',
                'Reviewing schema coverage',
                'Checking semantic HTML'
            ]
        },
        {
            id: 'links_trust_metadata',
            contextTag: 'Trust Signals',
            bannerTitle: 'Checking trust signals',
            label: 'Links, Trust & Metadata',
            messages: [
                'Reviewing citation context',
                'Checking external authority',
                'Scanning internal links',
                'Validating metadata',
                'Checking author signals'
            ]
        },
        {
            id: 'readability_final',
            contextTag: 'Readability',
            bannerTitle: 'Finalizing visibility assessment',
            label: 'Readability & Final Scoring',
            messages: [
                'Measuring readability',
                'Checking paragraph length',
                'Scanning promotional bias',
                'Reviewing freshness signals',
                'Finalizing visibility score'
            ]
        }
    ];
    const ANALYSIS_PROGRESS_SEQUENCE = ANALYSIS_PROGRESS_PHASES.flatMap((phase) =>
        phase.messages.map((text) => ({
            phaseId: phase.id,
            phaseLabel: phase.label,
            contextTag: phase.contextTag,
            bannerTitle: phase.bannerTitle,
            text
        }))
    );
    const PRECHECK_HERO_MS = 7000;
    const ANALYSIS_MESSAGE_ROTATE_MS = 4000;

    // ============================================
    // VERDICT ICON MAPPING (Sidebar Noise Elimination)
    // ============================================
    // fail → ❌ (X), partial → ⚠️ (warning), pass → ✓ (yes, muted when shown)
    const VERDICT_CONFIG = {
        fail: { icon: 'no', color: COLORS.failIcon, show: true },
        partial: { icon: 'warning', color: COLORS.partialIcon, show: true },
        warning: { icon: 'no', color: COLORS.failIcon, show: true },
        pass: { icon: 'yes', color: COLORS.passIcon, show: true },  // Shown only when toggle ON
        not_applicable: { icon: 'minus', color: COLORS.muted, show: false }
    };

    function getVerdictIcon(verdict) {
        return VERDICT_CONFIG[verdict] || VERDICT_CONFIG.fail;
    }

    function resolveCanonicalCategoryName(checkId, fallbackCategory) {
        const normalizedId = String(checkId || '').trim();
        if (normalizedId && canonicalCategoryMap[normalizedId]) {
            return canonicalCategoryMap[normalizedId];
        }

        const fallback = String(fallbackCategory || '').trim();
        if (!fallback) return 'General';

        return fallback.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // ============================================
    // TOOLTIP COPY (Static UI text, not AI-generated)
    // ============================================
    // ============================================
    // NAVIGATION CONTROLLER (Centralized instance cycling)
    // ============================================
    const NavigationController = {
        // Current focused issue for keyboard navigation
        _focusedIssue: null,
        _keyboardHandler: null,
        _isStale: false,
        _currentRunId: null,
        _onStaleCallback: null,
        _anchorRowRef: null,
        _boundStaleHandler: null,

        // Initialize with run context
        init: function (runId, onStaleCallback) {
            this._currentRunId = runId;
            this._isStale = false;
            this._onStaleCallback = onStaleCallback;
            if (!this._boundStaleHandler) {
                this._boundStaleHandler = this._handleStaleEvent.bind(this);
            }

            // Listen for stale events (single bound handler, no listener leak across runs)
            window.removeEventListener('aivi:run_stale', this._boundStaleHandler);
            window.addEventListener('aivi:run_stale', this._boundStaleHandler);
        },

        // Handle stale run event
        _handleStaleEvent: function () {
            this._isStale = true;
            if (this._onStaleCallback) {
                this._onStaleCallback();
            }
            // Show stale toast
            if (window.AiviPopoverManager) {
                window.AiviPopoverManager.showStaleToast();
            }
        },

        // Check if run is stale
        isStale: function () {
            return this._isStale;
        },

        // Set the currently focused issue (for keyboard nav)
        setFocusedIssue: function (issue, instanceIndex, setInstanceIndexFn, detailsToken, anchorRowRef) {
            this._focusedIssue = {
                issue: issue,
                instanceIndex: instanceIndex,
                setInstanceIndexFn: setInstanceIndexFn,
                detailsToken: detailsToken,
                detailRef: issue && issue.detail_ref ? issue.detail_ref : null
            };
            this._anchorRowRef = anchorRowRef;
        },

        // Navigate to specific instance
        navigateToInstance: async function (checkId, instanceIndex, totalInstances, verdict, detailsToken, anchorRowRef, detailRef) {
            // Check for stale run
            if (this.isStale()) {
                if (window.AiviPopoverManager) {
                    window.AiviPopoverManager.showStaleToast();
                }
                return { success: false, error: 'stale_run' };
            }

            // Validate bounds
            if (instanceIndex < 0 || instanceIndex >= totalInstances) {
                return { success: false, error: 'out_of_bounds' };
            }

            // Store anchor for popover positioning
            this._anchorRowRef = anchorRowRef;

            // Fetch details from endpoint
            const detailsResult = await this.fetchInstanceDetails(checkId, instanceIndex, detailsToken, detailRef);

            if (!detailsResult.success) {
                // Handle 410 stale
                if (detailsResult.status === 410) {
                    this._isStale = true;
                    if (window.AiviPopoverManager) {
                        window.AiviPopoverManager.showStaleToast();
                    }
                    return detailsResult;
                }

                return detailsResult;
            }

            if (detailsResult.data && detailsResult.data.cannot_anchor) {
                this.openDetailsDrawer(checkId, detailsToken, instanceIndex, detailRef);
                return { success: false, error: 'cannot_anchor' };
            }

            this.openDetailsDrawer(checkId, detailsToken, instanceIndex, detailRef);
            return { success: true };
        },

        // Fetch instance details from endpoint
        fetchInstanceDetails: async function (checkId, instanceIndex, detailsToken, detailRef) {
            if (window.AiviDetailsClient) {
                return window.AiviDetailsClient.fetchInstanceDetails(detailsToken, checkId, instanceIndex, detailRef);
            }

            // Fallback to direct fetch
            try {
                const post = readEditorPost();
                const currentContent = post && post.content ? post.content : '';
                const currentContentHash = isAutoStaleDetectionEnabled
                    ? await hashContentSha256(currentContent)
                    : '';
                const result = await callRest('/backend/analysis-details', 'POST', {
                    details_token: detailsToken,
                    check_id: checkId,
                    detail_ref: detailRef || null,
                    instance_index: instanceIndex,
                    content_hash: currentContentHash || ''
                });

                if (!result.ok) {
                    if (result.status === 410) {
                        return { success: false, status: 410, error: 'results_stale' };
                    }
                    if (result.status === 401) {
                        return { success: false, status: 401, error: 'unauthorized' };
                    }
                    if (result.status === 503) {
                        return { success: false, status: 503, error: 'aborted' };
                    }
                    return { success: false, error: 'request_failed' };
                }

                return { success: true, data: result.data };
            } catch (e) {
                debugLog('warn', 'Failed to fetch instance details', { error: e && e.message });
                return { success: false, error: 'network_error' };
            }
        },

        openDetailsDrawer: function (checkId, detailsToken, instanceIndex, detailRef) {
            const index = typeof instanceIndex === 'number' ? instanceIndex : 0;
            window.dispatchEvent(new CustomEvent('aivi:open_details', {
                detail: {
                    checkId: checkId,
                    detailsToken: detailsToken,
                    instanceIndex: index,
                    detailRef: detailRef || null
                }
            }));
        },

        // Cyclic previous (wraps from first to last)
        cyclicPrev: function (current, total) {
            return current > 0 ? current - 1 : total - 1;
        },

        // Cyclic next (wraps from last to first)
        cyclicNext: function (current, total) {
            return current < total - 1 ? current + 1 : 0;
        },

        // Initialize keyboard navigation ([ and ] keys)
        initKeyboardNav: function () {
            if (this._keyboardHandler) return; // Already initialized

            this._keyboardHandler = (e) => {
                // Only handle [ and ] keys
                if (e.key !== '[' && e.key !== ']') return;

                // Don't intercept if user is typing in an input
                const tagName = document.activeElement?.tagName?.toLowerCase();
                if (tagName === 'input' || tagName === 'textarea') return;

                // Check for stale run
                if (this.isStale()) {
                    if (window.AiviPopoverManager) {
                        window.AiviPopoverManager.showStaleToast();
                    }
                    return;
                }

                // Need a focused issue to navigate
                if (!this._focusedIssue) return;

                const { issue, instanceIndex, setInstanceIndexFn, detailsToken, detailRef } = this._focusedIssue;
                const instances = issue.instances || 1;
                if (instances <= 1) return; // Nothing to navigate

                const checkId = issue.check_id || issue.id;
                const verdict = issue.ui_verdict || issue.verdict || 'fail';
                let newIdx;

                if (e.key === '[') {
                    // Previous instance
                    newIdx = this.cyclicPrev(instanceIndex, instances);
                } else {
                    // Next instance
                    newIdx = this.cyclicNext(instanceIndex, instances);
                }

                // Update state and navigate
                if (setInstanceIndexFn) {
                    setInstanceIndexFn(checkId, newIdx);
                }
                this.navigateToInstance(checkId, newIdx, instances, verdict, detailsToken, this._anchorRowRef, detailRef);

                // Update focused issue index
                this._focusedIssue.instanceIndex = newIdx;

                e.preventDefault();
            };

            document.addEventListener('keydown', this._keyboardHandler);
        },

        // Cleanup keyboard navigation
        destroyKeyboardNav: function () {
            if (this._keyboardHandler) {
                document.removeEventListener('keydown', this._keyboardHandler);
                this._keyboardHandler = null;
            }
            this._focusedIssue = null;
            if (this._boundStaleHandler) {
                window.removeEventListener('aivi:run_stale', this._boundStaleHandler);
            }
        },

        // Cleanup
        destroy: function () {
            this.destroyKeyboardNav();
            this._isStale = false;
            this._currentRunId = null;
        }
    };

    NavigationController.initKeyboardNav();

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    function isPluginAvailable() {
        return config.isEnabled !== false;
    }

    function getCallRestTimeoutMs(path, method) {
        const p = String(path || '');
        const m = String(method || 'GET').toUpperCase();
        if (p.startsWith('/backend/proxy_run_status/')) return 10000;
        if (p === '/backend/proxy_ping') return 12000;
        if (p === '/backend/proxy_worker_health') return 12000;
        if (p === '/preflight') return 30000;
        if (p === '/backend/proxy_analyze') return 20000;
        if (m === 'GET') return 20000;
        return 30000;
    }

    async function callRest(path, method, body) {
        const url = restBase.replace(/\/$/, '') + path;
        const headers = { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce };
        const controller = new AbortController();
        const opts = { method: method || 'GET', headers: headers, signal: controller.signal };
        if (body) {
            opts.body = JSON.stringify(body);
            // Debug: Log request details to browser console
            debugLog('debug', 'Request', {
                method: method || 'GET',
                path: path,
                bodyLength: opts.body.length,
                bodyPreview: opts.body.substring(0, 500),
                contentHtmlLength: body.content_html ? body.content_html.length : undefined
            });
        }
        const timeoutMs = getCallRestTimeoutMs(path, method);
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let resp;
        try {
            resp = await fetch(url, opts);
        } catch (err) {
            clearTimeout(timer);
            const isAbort = err && err.name === 'AbortError';
            const message = isAbort ? 'Request timed out.' : (err && err.message ? err.message : 'Request failed.');
            return {
                status: 0,
                ok: false,
                data: {
                    message: message,
                    diagnostics: { type: isAbort ? 'timeout' : 'connection', message: message }
                }
            };
        }
        clearTimeout(timer);
        const text = await resp.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) { data = text; }

        debugLog('debug', 'Response', {
            status: resp.status,
            ok: resp.ok,
            path: path,
            diagnostics: data && data.diagnostics ? data.diagnostics : undefined,
            error: !resp.ok ? data : undefined
        });

        return { status: resp.status, ok: resp.ok, data: data };
    }

    async function checkBackendAvailability() {
        try {
            const result = await callRest('/backend/proxy_ping', 'GET');
            return result.ok && result.data && result.data.aiAvailable;
        } catch (e) {
            return false;
        }
    }

    function simpleHashContent(str) {
        if (!str) return '';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    async function hashContentSha256(str) {
        const input = typeof str === 'string' ? str : '';
        if (!input) return '';
        try {
            if (window && window.crypto && window.crypto.subtle && typeof window.TextEncoder !== 'undefined') {
                const encoder = new window.TextEncoder();
                const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(input));
                const bytes = new Uint8Array(digest);
                let hex = '';
                for (let i = 0; i < bytes.length; i += 1) {
                    hex += bytes[i].toString(16).padStart(2, '0');
                }
                return hex;
            }
        } catch (e) {
            debugLog('warn', 'SHA-256 hash failed, falling back to simple hash', { error: e && e.message });
        }
        return '';
    }

    function readEditorPost() {
        try {
            if (select && select('core/editor') && typeof select('core/editor').getCurrentPost === 'function') {
                const post = select('core/editor').getCurrentPost();
                if (post) {
                    const content = (typeof post.content === 'string') ? post.content : (post.content && post.content.raw ? post.content.raw : (post.raw || ''));
                    const title = (post.title && (typeof post.title === 'string' ? post.title : (post.title.raw || ''))) || '';
                    return { id: post.id || null, title: title || '', content: content || '', author: post.author || 0 };
                }
            }
        } catch (e) { /* fallback */ }
        try {
            const titleEl = document.getElementById('title');
            const contentEl = document.getElementById('content');
            return { id: (document.getElementById('post_ID') ? parseInt(document.getElementById('post_ID').value, 10) : null), title: titleEl ? titleEl.value : '', content: contentEl ? contentEl.value : '', author: 0 };
        } catch (e) {
            return null;
        }
    }

    async function runAutoAnalysisOnLoad() {
        if (!config || !config.autoRunOnLoad) return;
        const post = readEditorPost();
        if (!post || !post.content) return;

        const available = await checkBackendAvailability();
        if (!available) return;

        const preResult = await callRest('/preflight', 'POST', {
            content: post.content,
            title: post.title,
            content_type: 'post',
            site_id: window.location.hostname
        });

        if (!preResult.ok || !preResult.data?.ok) return;

        await callRest('/backend/proxy_analyze', 'POST', {
            content_html: post.content,
            title: post.title,
            content_type: 'post',
            site_id: window.location.hostname,
            meta_description: post.metaDescription || '',
            enable_web_lookups: false,
            manifest: preResult.data.manifest
        });
    }

    // ============================================
    // CSS STYLES (injected once)
    // ============================================

    const styleId = 'aivi-sidebar-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Indeterminate striped progress bar */
            @keyframes aivi-progress-stripes {
                0% { background-position: 40px 0; }
                100% { background-position: 0 0; }
            }

            .aivi-progress-bar {
                height: 40px;
                background: ${COLORS.primaryLight};
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            }

            .aivi-progress-bar-inner {
                height: 100%;
                width: 100%;
                background: repeating-linear-gradient(
                    -45deg,
                    ${COLORS.primary},
                    ${COLORS.primary} 10px,
                    ${COLORS.primaryLight} 10px,
                    ${COLORS.primaryLight} 20px
                );
                background-size: 40px 40px;
                animation: aivi-progress-stripes 1s linear infinite;
            }

            .aivi-progress-bar-error {
                background: ${COLORS.errorLight};
            }

            .aivi-progress-bar-error .aivi-progress-bar-inner {
                background: ${COLORS.error};
                animation: none;
                width: 100%;
            }

            /* Success highlight animation */
            @keyframes aivi-success-pulse {
                0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.4); }
                70% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
                100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
            }

            .aivi-success-animate {
                animation: aivi-success-pulse 0.4s ease-out;
            }

            /* Respect reduced motion */
            @media (prefers-reduced-motion: reduce) {
                .aivi-progress-bar-inner {
                    animation: none;
                }
                .aivi-success-animate {
                    animation: none;
                }
                .aivi-analysis-status-dot {
                    animation: none;
                }
                .aivi-analysis-preflight-title .aivi-accent {
                    animation: none;
                }
            }

            /* Progress label */
            .aivi-progress-label {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: ${COLORS.white};
                font-size: 13px;
                font-weight: 500;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }

            /* Console-style analysis loader */
            @keyframes aivi-loader-pulse {
                0% { box-shadow: 0 0 0 0 rgba(37,99,235,.45); }
                70% { box-shadow: 0 0 0 10px rgba(37,99,235,0); }
                100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
            }
            @keyframes aivi-loader-accent-shift {
                0% { background-position: 0 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0 50%; }
            }

            .aivi-analysis-loader {
                border: 1px solid ${COLORS.cardBorder};
                border-radius: 10px;
                background: ${COLORS.white};
                overflow: hidden;
            }
            .aivi-analysis-status {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid ${COLORS.cardBorder};
                background: #F8FAFF;
                color: #17315c;
                font-size: 11px;
                font-weight: 700;
            }
            .aivi-analysis-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: ${COLORS.primary};
                animation: aivi-loader-pulse 1.6s infinite;
                flex: 0 0 auto;
            }
            .aivi-analysis-shell {
                position: relative;
                min-height: 248px;
                background: linear-gradient(180deg,#fbfcff,#f1f5fb);
            }
            .aivi-analysis-preflight {
                position: absolute;
                inset: 0;
                z-index: 2;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 18px 14px;
                background:
                    radial-gradient(circle at 18% 12%, rgba(37,99,235,.12), rgba(37,99,235,0) 42%),
                    radial-gradient(circle at 82% 8%, rgba(15,157,122,.10), rgba(15,157,122,0) 34%),
                    linear-gradient(180deg,#f8fbff,#edf4ff);
            }
            .aivi-analysis-preflight-card {
                width: 100%;
                border-radius: 16px;
                padding: 24px 18px;
                background: rgba(255,255,255,.84);
                border: 1px solid rgba(37,99,235,.10);
                box-shadow: 0 14px 28px rgba(16,34,64,.08);
                text-align: center;
            }
            .aivi-analysis-preflight-title {
                margin: 0;
                color: #17325b;
                font-size: 20px;
                font-weight: 900;
                line-height: 1.16;
                letter-spacing: -.02em;
            }
            .aivi-analysis-preflight-title .aivi-accent {
                background: linear-gradient(90deg,#2563eb,#0f9d7a,#2563eb);
                background-size: 220% 100%;
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                animation: aivi-loader-accent-shift 3.8s ease-in-out infinite;
            }
            .aivi-analysis-banner {
                position: absolute;
                top: 14px;
                left: 12px;
                right: 12px;
                box-sizing: border-box;
                height: 92px;
                border-radius: 14px;
                padding: 12px 13px;
                background: #ffffff;
                border: 1px solid rgba(22,50,92,.08);
                box-shadow: 0 12px 20px rgba(18,44,81,.06);
                z-index: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 8px;
            }
            .aivi-analysis-banner::before {
                content: "";
                position: absolute;
                left: 0;
                top: 14px;
                bottom: 14px;
                width: 4px;
                border-radius: 999px;
                background: linear-gradient(180deg,#2563eb,#0f9d7a);
            }
            .aivi-analysis-tag {
                display: inline-flex;
                align-items: center;
                align-self: flex-start;
                margin-left: 8px;
                padding: 4px 8px;
                border-radius: 999px;
                background: #edf3ff;
                color: #234ca0;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: .05em;
                text-transform: uppercase;
            }
            .aivi-analysis-banner-title {
                margin: 0 0 0 8px;
                color: #17325b;
                font-size: 18px;
                font-weight: 900;
                line-height: 1.14;
                letter-spacing: -.02em;
            }
            .aivi-analysis-console {
                position: absolute;
                top: 122px;
                left: 12px;
                right: 12px;
                bottom: 44px;
                font-family: ${COLORS.fontStack};
                font-size: 11px;
                line-height: 1.25;
                color: #456182;
                display: flex;
                flex-direction: column;
                justify-content: flex-start;
                gap: 6px;
            }
            .aivi-analysis-log-row {
                padding: 8px 10px;
                border-radius: 11px;
                background: rgba(255,255,255,.80);
                border: 1px solid rgba(22,50,92,.08);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: .25s ease;
            }
            .aivi-analysis-log-ts {
                display: none;
                margin-right: 8px;
            }
            .aivi-analysis-log-run { color: #456182; }
            .aivi-analysis-log-ok { color: #0f8f74; }
            .aivi-analysis-log-phase {
                color: #17325b;
                font-weight: 800;
                background: #ffffff;
                border-color: rgba(37,99,235,.18);
                box-shadow: 0 10px 18px rgba(25,50,91,.08);
            }
            .aivi-analysis-footer {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 8px 12px;
                border-top: 1px solid rgba(23,49,92,0.08);
                color: #4d6891;
                font-size: 10px;
                font-weight: 600;
            }
            .aivi-analysis-footer .aivi-muted {
                color: #6880a7;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            /* Navigation controls hover */
            .aivi-nav-btn {
                cursor: pointer;
                user-select: none;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background 0.15s;
            }
            .aivi-nav-btn:hover:not(.aivi-nav-disabled) {
                background: rgba(0,0,0,0.08);
            }
            .aivi-nav-disabled {
                opacity: 0.3;
                cursor: default;
            }

            /* Tooltip for verdict icons */
            .aivi-verdict-icon {
                position: relative;
            }
            .aivi-verdict-icon[data-tooltip]:hover::after {
                content: attr(data-tooltip);
                position: absolute;
                left: 100%;
                top: 50%;
                transform: translateY(-50%);
                margin-left: 8px;
                padding: 4px 8px;
                background: #1f2937;
                color: white;
                font-size: 11px;
                font-weight: 400;
                border-radius: 4px;
                white-space: nowrap;
                z-index: 1000;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    function useAiviDetailsDrawer() {
        const [state, setState] = useState({
            isOpen: false,
            loading: false,
            error: null,
            data: null,
            checkId: null,
            detailsToken: null,
            detailRef: null,
            instanceIndex: 0
        });

        useEffect(() => {
            function handler(event) {
                const detail = event.detail || {};
                const index = typeof detail.instanceIndex === 'number' ? detail.instanceIndex : 0;
                setState({
                    isOpen: true,
                    loading: true,
                    error: null,
                    data: null,
                    checkId: detail.checkId,
                    detailsToken: detail.detailsToken,
                    detailRef: detail.detailRef || null,
                    instanceIndex: index
                });
                loadDetails(detail.checkId, detail.detailsToken, index, detail.detailRef || null);
            }
            window.addEventListener('aivi:open_details', handler);
            return () => {
                window.removeEventListener('aivi:open_details', handler);
            };
        }, []);

        function loadDetails(checkId, detailsToken, instanceIndex, detailRef) {
            setState(prev => Object.assign({}, prev, { loading: true, error: null }));

            const client = window.AiviDetailsClient;
            if (!client || !client.fetchInstanceDetails) {
                setState(prev => Object.assign({}, prev, {
                    loading: false,
                    error: 'client_missing',
                    data: null
                }));
                return;
            }

            client.fetchInstanceDetails(detailsToken, checkId, instanceIndex, detailRef).then(result => {
                if (!result.success) {
                    setState(prev => Object.assign({}, prev, {
                        loading: false,
                        error: result.error || 'request_failed',
                        data: null
                    }));
                    return;
                }
                setState(prev => Object.assign({}, prev, {
                    loading: false,
                    error: null,
                    data: result.data
                }));
            }).catch(() => {
                setState(prev => Object.assign({}, prev, {
                    loading: false,
                    error: 'network_error',
                    data: null
                }));
            });
        }

        function rerunAnalysis() {
            window.dispatchEvent(new CustomEvent('aivi:rerun_analysis', {
                detail: {}
            }));
        }

        function closeDrawer() {
            setState({
                isOpen: false,
                loading: false,
                error: null,
                data: null,
                checkId: null,
                detailsToken: null,
                detailRef: null,
                instanceIndex: 0
            });
        }

        function DetailsDrawer() {
            if (!state.isOpen) return null;

            let message = null;
            if (state.error === 'results_stale') {
                message = isAutoStaleDetectionEnabled
                    ? 'Analysis results are stale. Please re-run analysis.'
                    : 'Details are unavailable for this run. Re-run analysis if you need fresh issue details.';
            } else if (state.error === 'unauthorized') {
                message = 'Session expired or invalid. Please re-run analysis.';
            } else if (state.error === 'aborted') {
                message = 'Analysis aborted — no details available. Please re-run.';
            } else if (state.error === 'client_missing') {
                message = 'AiVI details are unavailable in this context.';
            } else if (state.error && state.error !== 'network_error') {
                message = 'AiVI could not load details. Please try again.';
            } else if (state.error === 'network_error') {
                message = 'Network error while loading details. Please retry.';
            } else if (state.data?.cannot_anchor) {
                message = 'Evidence could not be anchored to current content.';
            }

            const explanation = state.data && (state.data.explanation || state.data.summary || '');

            return createElement(
                PanelBody,
                { title: 'AiVI details', initialOpen: true },
                state.loading && createElement(Spinner, null),
                message && createElement('p', null, message),
                explanation && createElement('p', null, explanation),
                !state.loading && !message && !explanation && createElement('p', null, 'Details unavailable.'),
                createElement(
                    'div',
                    { style: { marginTop: 12, display: 'flex', gap: 8 } },
                    createElement(
                        Button,
                        { isPrimary: true, onClick: rerunAnalysis },
                        'Re-run analysis'
                    ),
                    createElement(
                        Button,
                        { isTertiary: true, onClick: closeDrawer },
                        'Close'
                    )
                )
            );
        }

        return { DetailsDrawer };
    }

    function mapBackendError(status, payload) {
        const code = payload && payload.code ? String(payload.code) : '';
        if (code === 'ai_disabled') {
            return {
                type: 'error',
                message: config.text.plugin_disabled,
                retry: true
            };
        }
        if (code === 'no_backend') {
            return {
                type: 'error',
                message: config.text.backend_not_configured,
                retry: true
            };
        }
        if (status === 400) {
            return {
                type: 'error',
                message: 'AiVI could not analyze this content. Please check the content and try again.',
                retry: true
            };
        }
        if (status === 410) {
            return {
                type: 'warning',
                message: isAutoStaleDetectionEnabled
                    ? 'Analysis results are stale. Please re-run analysis.'
                    : 'This run details are no longer available. Re-run analysis when you are ready.',
                retry: true
            };
        }
        if (status === 429) {
            return {
                type: 'warning',
                message: 'AiVI rate limit reached. Wait a moment and re-run analysis.',
                retry: true
            };
        }
        if (status >= 500) {
            return {
                type: 'error',
                message: 'AiVI backend is unavailable. Try again later.',
                retry: true
            };
        }
        return {
            type: 'error',
            message: 'AiVI encountered an unexpected error.',
            retry: true
        };
    }

    function useStaleBanner() {
        const [isStale, setIsStale] = useState(false);
        useEffect(() => {
            if (!isAutoStaleDetectionEnabled) return undefined;
            function handler() {
                setIsStale(true);
            }
            window.addEventListener('aivi:run_stale', handler);
            return () => {
                window.removeEventListener('aivi:run_stale', handler);
            };
        }, []);
        return [isStale, setIsStale];
    }

    // ============================================
    // UI COMPONENTS
    // ============================================

    function getAnalysisProgressEntry(messageIndex) {
        const total = ANALYSIS_PROGRESS_SEQUENCE.length;
        if (!total) {
            return {
                phaseId: 'analysis',
                phaseLabel: 'Analysis',
                contextTag: 'Analysis',
                bannerTitle: 'Checking content signals',
                text: 'Checking content signals'
            };
        }

        const normalizedIndex = ((messageIndex % total) + total) % total;
        return ANALYSIS_PROGRESS_SEQUENCE[normalizedIndex];
    }

    function buildConsoleLogRows(messageIndex, phase, queueMessage) {
        const rows = [];
        const rowCount = 3;

        if (phase === 'queued' && queueMessage) {
            rows.push({
                id: 'row-queued',
                ts: '',
                text: queueMessage,
                level: 'phase'
            });
        }

        for (let idx = rowCount - 1; idx >= 0; idx -= 1) {
            const itemIndex = messageIndex - idx;
            if (itemIndex < 0) continue;
            const entry = getAnalysisProgressEntry(itemIndex);
            rows.push({
                id: `row-${itemIndex}`,
                ts: '',
                text: entry.text,
                level: idx === 0 ? 'phase' : 'run'
            });
        }

        return rows;
    }

    function AnalysisProgressPanel(props) {
        const phase = props.phase || 'preflight';
        const analysisStartTime = Math.max(0, Number(props.analysisStartTime || 0));
        const splashUntilEpochMs = Math.max(0, Number(props.splashUntilEpochMs || 0));
        const queueMessage = typeof props.queueMessage === 'string' ? props.queueMessage : '';
        const [nowMs, setNowMs] = useState(Date.now());

        useEffect(() => {
            const timer = setInterval(() => {
                setNowMs(Date.now());
            }, 1000);
            return () => clearInterval(timer);
        }, []);

        const elapsed = analysisStartTime ? Math.max(0, Math.round((nowMs - analysisStartTime) / 1000)) : 0;
        const showSplash = phase === 'preflight' || (splashUntilEpochMs > 0 && nowMs < splashUntilEpochMs);
        const progressStartMs = splashUntilEpochMs > 0 ? splashUntilEpochMs : analysisStartTime;
        const progressElapsedMs = Math.max(0, nowMs - progressStartMs);
        const messageIndex = Math.floor(progressElapsedMs / ANALYSIS_MESSAGE_ROTATE_MS);
        const currentProgressEntry = getAnalysisProgressEntry(messageIndex);
        const bannerContext = showSplash ? 'Opening Signals' : currentProgressEntry.contextTag;
        const bannerTitle = showSplash ? ANALYSIS_HERO_MESSAGE : currentProgressEntry.bannerTitle;
        const rows = showSplash ? [] : buildConsoleLogRows(messageIndex, phase, queueMessage);
        const footerMessage = phase === 'queued'
            ? 'Preparing analysis worker'
            : bannerContext;

        return createElement('div', { className: 'aivi-analysis-loader' },
            createElement('div', {
                className: 'aivi-analysis-status',
                role: 'status',
                'aria-live': 'polite'
            },
                createElement('span', { className: 'aivi-analysis-status-dot' }),
                createElement('span', null, ANALYSIS_STATUS_LABEL)
            ),
            createElement('div', { className: 'aivi-analysis-shell' },
                showSplash
                    ? createElement('div', { className: 'aivi-analysis-preflight' },
                        createElement('div', { className: 'aivi-analysis-preflight-card' },
                            createElement('h3', { className: 'aivi-analysis-preflight-title' },
                                'Initializing ',
                                createElement('span', { className: 'aivi-accent' }, 'AI perspective'),
                                ' simulation...'
                            )
                        )
                    )
                    : [
                        createElement('div', { key: 'banner', className: 'aivi-analysis-banner' },
                            createElement('span', { className: 'aivi-analysis-tag' }, bannerContext),
                            createElement('h3', { className: 'aivi-analysis-banner-title' }, bannerTitle)
                        ),
                        createElement('div', { key: 'console', className: 'aivi-analysis-console' },
                            rows.map((row) =>
                                createElement('div', { key: row.id, className: 'aivi-analysis-log-row' },
                                    createElement('span', { className: 'aivi-analysis-log-ts' }, row.ts),
                                    createElement('span', { className: `aivi-analysis-log-${row.level}` }, row.text)
                                )
                            )
                        )
                    ],
                createElement('div', { className: 'aivi-analysis-footer' },
                    createElement('span', null, `${elapsed}s elapsed`),
                    createElement('span', { className: 'aivi-muted' }, footerMessage)
                )
            )
        );
    }

    // Legacy progress bar (error state)
    function ProgressBar(props) {
        const isError = props.error;
        const elapsed = props.elapsedSeconds || 0;

        // Determine contextual message based on elapsed time
        let message = 'Analyzing…';
        let detailMessage = 'Analyzing content for AI visibility';

        if (!isError && elapsed > 0) {
            if (elapsed < 30) {
                message = 'Analyzing…';
                detailMessage = `Analyzing content for AI visibility — ${elapsed}s`;
            } else if (elapsed < 60) {
                message = 'Still analyzing…';
                detailMessage = `Analysis in progress — ${elapsed}s elapsed`;
            } else if (elapsed < 120) {
                message = 'Taking longer than usual…';
                detailMessage = `Still processing — ${elapsed}s elapsed (system may be busy)`;
            } else if (elapsed < 240) {
                message = 'Almost done…';
                detailMessage = `Finishing analysis — ${elapsed}s elapsed`;
            } else {
                message = 'Still working…';
                detailMessage = `Analysis taking longer due to system load — ${elapsed}s elapsed`;
            }
        }

        return createElement('div', {
            className: 'aivi-progress-bar' + (isError ? ' aivi-progress-bar-error' : ''),
            role: 'progressbar',
            'aria-busy': !isError,
            'aria-valuetext': isError ? 'Analysis failed' : detailMessage,
            style: { width: '100%' }
        },
            !isError && createElement('div', { className: 'aivi-progress-bar-inner' }),
            !isError && createElement('div', { style: { textAlign: 'center', marginTop: 8 } },
                createElement('span', { className: 'aivi-progress-label' }, message),
                elapsed > 30 && createElement('div', {
                    style: { fontSize: 11, color: COLORS.subtext, marginTop: 2 }
                }, `${elapsed}s elapsed`)
            ),
            isError && createElement('div', {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    height: '100%'
                }
            },
                createElement('span', { style: { color: COLORS.highText, fontSize: 13 } }, props.errorMessage || 'Analysis failed'),
                createElement(Button, {
                    isSmall: true,
                    onClick: props.onRetry,
                    style: { background: COLORS.error, color: COLORS.white, border: 'none' }
                }, 'Retry')
            )
        );
    }

    // Score Circle Component (Gauge Style)
    function ScoreCircle(props) {
        const value = Number.isFinite(props.value) ? props.value : 0;
        const max = props.max || 100;
        const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

        // Gauge configuration
        const radius = 36;
        const circumference = 2 * Math.PI * radius;
        const gaugeAngle = 260; // Degrees of the arc
        const unusedAngle = 360 - gaugeAngle;
        const offset = circumference * (unusedAngle / 360); // Gap size in px

        // Calculate stroke for the value
        // We map 0-100% to the gaugeAngle range
        const totalVisibleDash = circumference - offset;
        const strokeValue = (pct / 100) * totalVisibleDash;
        const dashOffsetValue = circumference - strokeValue; // Offset for value path

        const color = props.color || COLORS.aeoRing;

        return createElement('div', { style: { textAlign: 'center' } },
            createElement('div', { style: { position: 'relative', display: 'inline-block' } },
                createElement('svg', {
                    width: 84,
                    height: 84,
                    viewBox: '0 0 84 84',
                    style: { transform: 'rotate(140deg)' } // Rotate to center gap at bottom
                },
                    // Background track
                    createElement('circle', {
                        cx: 42, cy: 42, r: radius,
                        stroke: '#F1F5F9',
                        strokeWidth: 6,
                        fill: 'none',
                        strokeDasharray: circumference,
                        strokeDashoffset: offset,
                        strokeLinecap: 'round'
                    }),
                    // Value track
                    createElement('circle', {
                        cx: 42, cy: 42, r: radius,
                        stroke: color,
                        strokeWidth: 6,
                        strokeDasharray: circumference,
                        strokeDashoffset: dashOffsetValue, // Animate this
                        fill: 'none',
                        strokeLinecap: 'round',
                        style: {
                            transition: 'stroke-dashoffset 1s ease-out'
                        }
                    })
                ),
                createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 4 } },
                    createElement('span', { style: { fontSize: 24, fontWeight: 700, color: COLORS.scoreText, lineHeight: 1 } }, value)
                )
            ),
            props.label && createElement('div', { style: { marginTop: -6, fontSize: 12, color: COLORS.subtext, fontWeight: 500 } }, props.label)
        );
    }

    // Hero Score Rectangle (Global Score)
    function HeroScore(props) {
        const score = props.score || 0;
        const aeo = props.aeo || 0;
        const geo = props.geo || 0;
        const lastRun = props.lastRun || 'Just now';

        return createElement('div', {
            className: props.animate ? 'aivi-success-animate' : '',
            style: {
                background: COLORS.warning,
                border: '1px solid ' + COLORS.warningBorder,
                borderRadius: 12,
                padding: '24px 16px',
                textAlign: 'center',
                marginBottom: 20,
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }
        },
            createElement('div', { style: { fontSize: 56, fontWeight: 700, color: COLORS.scoreText, lineHeight: 1, letterSpacing: '-1px' } }, score),
            createElement('div', {
                style: {
                    marginTop: 12,
                    fontSize: 13,
                    color: COLORS.subtext,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    maxWidth: 220,
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    fontWeight: 500
                }
            },
                createElement('span', null, `AEO ${aeo}`),
                createElement('span', null, `GEO ${geo}`)
            ),
            createElement('div', {
                style: {
                    marginTop: 8,
                    fontSize: 12,
                    color: COLORS.subtext,
                    textAlign: 'center'
                }
            }, `Last run: ${lastRun}`)
        );
    }

    // Issue Accordion Component (Sidebar Noise Elimination - fail/partial only)
    // Props: issues, category, showPassedChecks, onIssueClick, detailsToken
    function IssueAccordion(props) {
        const [expanded, setExpanded] = useState(false);
        const allIssues = props.issues || [];
        const category = props.category || 'Detected Issues';
        const showPassedChecks = props.showPassedChecks || false;

        // NOISE ELIMINATION: Filter to only show fail/partial verdicts for issue count
        const failPartialIssues = allIssues.filter(issue => {
            const verdict = issue.ui_verdict || issue.verdict;
            return verdict === 'fail' || verdict === 'partial';
        });

        // Passed checks (only shown when toggle is ON)
        const passedIssues = allIssues.filter(issue => {
            const verdict = issue.ui_verdict || issue.verdict;
            return verdict === 'pass';
        });

        // Issue count is ONLY fail + partial (never includes passed)
        const issueCount = failPartialIssues.length;

        // Category is visible even with 0 issues, but show "0 issues"
        // Only hide if no issues AND no passed checks to show
        if (issueCount === 0 && (!showPassedChecks || passedIssues.length === 0)) return null;

        // Helper to render a single issue row
        const renderIssueRow = (issue, idx) => {
            const verdict = issue.ui_verdict || issue.verdict || 'fail';
            const verdictConfig = getVerdictIcon(verdict);
            const instances = issue.instances || 1;
            const checkId = issue.check_id || issue.id;
            const isPassedCheck = verdict === 'pass';

            return createElement('div', {
                key: checkId,
                // NO CLICK HANDLER - Static List
                style: {
                    padding: '10px 16px',
                    borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none',
                    cursor: 'default', // No pointer cursor
                    transition: 'background 0.2s',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    opacity: 1 // Always full opacity
                },
                onMouseEnter: (e) => e.currentTarget.style.background = '#f8fafc',
                onMouseLeave: (e) => e.currentTarget.style.background = COLORS.white
            },
                // VERDICT ICON: ❌ fail, ⚠️ partial, ✓ pass
                createElement('div', {
                    className: 'aivi-verdict-icon',
                    style: { color: verdictConfig.color, flexShrink: 0 }
                }, createElement(Dashicon, { icon: verdictConfig.icon, size: 16 })),

                // NAME
                createElement('div', {
                    style: {
                        flex: 1,
                        fontSize: 13,
                        fontWeight: isPassedCheck ? 400 : 500,
                        color: isPassedCheck ? COLORS.subtext : COLORS.scoreText,
                        lineHeight: '1.4',
                        wordBreak: 'break-word'
                    }
                }, issue.name || issue.title || checkId.replace(/_/g, ' ')),

                // Badge: "Needs review" - HIDE for Passed Checks
                (issue.actionable === false && !isPassedCheck) && createElement('span', {
                    style: {
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: COLORS.warning,
                        border: '1px solid ' + COLORS.warningBorder,
                        color: COLORS.mediumText,
                        flexShrink: 0
                    }
                }, 'Needs review'),

                // BADGE: Instance Count (Static, Circular) - Only if > 1
                instances > 1 && createElement('span', {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: COLORS.warning, // Warning yellow background
                        color: COLORS.scoreText,    // Dark text for contrast
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: '50%',        // Circular
                        width: 20,
                        height: 20,
                        flexShrink: 0,
                        lineHeight: 1
                    }
                }, instances)
            );
        };

        return createElement('div', {
            style: {
                background: COLORS.white,
                border: '1px solid ' + COLORS.cardBorder,
                borderRadius: 8,
                marginBottom: 8,
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }
        },
            // Header (Click to expand) - Format: "<Category Name> (<N> issues)"
            createElement('div', {
                onClick: () => setExpanded(!expanded),
                style: {
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: expanded ? '#f8fafc' : COLORS.white,
                    borderBottom: expanded ? '1px solid ' + COLORS.cardBorder : 'none'
                }
            },
                createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    createElement(Dashicon, { icon: expanded ? 'arrow-down-alt2' : 'arrow-right-alt2', size: 16 }),
                    // Category header with issue count in exact format
                    createElement('span', {
                        style: { fontWeight: 600, fontSize: 13, color: COLORS.scoreText }
                    },
                        `${category} (${issueCount} ${issueCount === 1 ? 'issue' : 'issues'})`
                    )
                )
            ),

            // Expanded List - Split into Active Issues and Passed Checks
            expanded && createElement('div', { style: { background: COLORS.white } },
                // 1. Fail/Partial Issues
                failPartialIssues.map((issue, idx) => renderIssueRow(issue, idx, false)),

                // 2. Passed Checks Header & List (if enabled and present)
                (showPassedChecks && passedIssues.length > 0) && createElement('div', { key: 'passed-section' },
                    // Divider / Header
                    createElement('div', {
                        style: {
                            padding: '8px 16px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: COLORS.subtext,
                            background: '#f1f5f9', // Slightly darker than row hover
                            borderTop: '1px solid ' + COLORS.cardBorder,
                            borderBottom: '1px solid ' + COLORS.cardBorder,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginTop: failPartialIssues.length > 0 ? 0 : -1 // Merge borders if adjacent
                        }
                    }, 'Passed Checks'),
                    // Passed Issues List
                    passedIssues.map((issue, idx) => renderIssueRow(issue, idx, true))
                )
            )
        );
    }

    // JSON-LD Panel Component (Untouched)
    function JsonLdPanel(props) {
        const [expanded, setExpanded] = useState(false);
        if (!props.jsonLd) return null;

        return createElement('div', {
            style: {
                background: COLORS.white,
                border: '1px solid ' + COLORS.cardBorder,
                borderRadius: 8,
                marginTop: 12,
                overflow: 'hidden'
            }
        },
            createElement('div', {
                onClick: () => setExpanded(!expanded),
                style: {
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: expanded ? '#f8fafc' : COLORS.white,
                    borderBottom: expanded ? '1px solid ' + COLORS.cardBorder : 'none'
                }
            },
                createElement('span', { style: { fontWeight: 600, fontSize: 13, color: COLORS.scoreText } }, 'FAQ Schema Opportunity'),
                createElement(Dashicon, { icon: expanded ? 'arrow-up-alt2' : 'arrow-down-alt2', size: 16 })
            ),
            expanded && createElement('div', { style: { padding: 12 } },
                createElement('div', {
                    style: {
                        marginBottom: 12,
                        fontSize: 12,
                        color: COLORS.subtext,
                        lineHeight: 1.5
                    }
                }, 'AI detected Q&A content suitable for FAQPerson markup. Copy this JSON-LD and insert it into your page HTML or SEO plugin.'),
                createElement('textarea', {
                    readOnly: true,
                    style: {
                        width: '100%',
                        height: 120,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        padding: 8,
                        borderRadius: 4,
                        border: '1px solid ' + COLORS.cardBorder,
                        background: '#f8fafc',
                        resize: 'vertical',
                        marginBottom: 8
                    },
                    value: JSON.stringify(props.jsonLd, null, 2)
                }),
                createElement(Button, {
                    isSecondary: true,
                    isSmall: true,
                    style: { width: '100%', justifyContent: 'center' },
                    onClick: () => {
                        navigator.clipboard.writeText(JSON.stringify(props.jsonLd, null, 2));
                        // alert('Copied to clipboard!'); // Optional feedback
                    }
                }, 'Copy JSON-LD')
            )
        );
    }

    // Compact Launcher Card (Pre-analysis)
    function LauncherCard(props) {
        return createElement('div', {
            style: {
                background: COLORS.white,
                border: '1px solid ' + COLORS.cardBorder,
                borderRadius: 8,
                padding: 12
            }
        },
            createElement('div', { style: { marginBottom: 10 } },
                createElement('div', { style: { fontWeight: 600, fontSize: 14, color: COLORS.scoreText, marginBottom: 2 } },
                    'Would AI choose this page?'),
                createElement('div', { style: { fontSize: 12, color: COLORS.subtext } },
                    'Analyze content for AEO & GEO visibility')
            ),
            createElement(Button, {
                isPrimary: true,
                onClick: props.onAnalyze,
                disabled: props.disabled,
                style: { width: '100%', justifyContent: 'center', height: 40 }
            }, 'Analyze content'),
            createElement('div', { style: { textAlign: 'center', marginTop: 8 } },
                createElement('a', {
                    href: '#',
                    onClick: (e) => {
                        e.preventDefault();
                        if (props.onClearCache) {
                            props.onClearCache();
                        }
                    },
                    style: { fontSize: 12, color: COLORS.muted, textDecoration: 'none' }
                }, 'Clear cache')
            )
        );
    }



    // ============================================
    // MAIN SIDEBAR COMPONENT
    // ============================================

    function AiviSidebar() {
        const [state, setState] = useState('idle');
        const [errorMessage, setErrorMessage] = useState(null);
        const [report, setReport] = useState(null);
        const [showSuccessAnim, setShowSuccessAnim] = useState(false);
        const [analysisStartTime, setAnalysisStartTime] = useState(null);
        const [isStale, setIsStale] = useState(false);
        const [lastContentHash, setLastContentHash] = useState(null);
        const [showPassedChecks, setShowPassedChecks] = useState(false);
        const [rawAnalysis, setRawAnalysis] = useState(null);
        const [lastManifest, setLastManifest] = useState(null);
        const [, setQueueStatus] = useState(null);
        const [queueMessage, setQueueMessage] = useState(null);
        const [queueHealth, setQueueHealth] = useState(null);
        const [lastHealthCheckAt, setLastHealthCheckAt] = useState(0);
        const [overlayContent, setOverlayContent] = useState(null); // NEW: Store highlighted HTML
        const [analysisPhase, setAnalysisPhase] = useState('idle');
        const [analysisSplashUntil, setAnalysisSplashUntil] = useState(0);
        const activeRunIdRef = useRef('');
        const rawFetchRequestRef = useRef(0);
        const staleEventRunRef = useRef('');
        const detailsDrawer = useAiviDetailsDrawer();
        const [isStaleBanner] = useStaleBanner();

        useEffect(() => {
            if (!isPluginAvailable()) {
                setState('error');
                setErrorMessage('Plugin not enabled or backend not configured.');
            }
        }, []);

        useEffect(() => {
            const currentRunId = report && report.run_id ? String(report.run_id) : '';
            activeRunIdRef.current = currentRunId;
            setRawAnalysis((prev) => {
                if (!prev || !currentRunId) return prev;
                const prevRunId = String(prev.run_id || prev.result?.run_id || '');
                if (!prevRunId || prevRunId === currentRunId) return prev;
                debugLog('warn', 'AiVI: Dropping stale raw analysis payload (run mismatch)', {
                    current_run_id: currentRunId,
                    raw_run_id: prevRunId
                });
                return null;
            });
        }, [report?.run_id]);

        // STALE-RUN DETECTION: Monitor editor content changes
        useEffect(() => {
            if (!isAutoStaleDetectionEnabled) return;
            if (state !== 'success' || !report || isStale) return;

            let cancelled = false;
            let checking = false;
            let mismatchCount = 0;
            const runId = report && report.run_id ? String(report.run_id) : '';

            const emitStaleOnce = () => {
                if (!runId) return;
                if (staleEventRunRef.current === runId) return;
                staleEventRunRef.current = runId;
                setIsStale(true);
                window.dispatchEvent(new CustomEvent('aivi:run_stale', { detail: { run_id: runId } }));
                debugLog('info', 'AiVI: Content changed, marking results as stale');
            };

            const ensureBaselineHash = async () => {
                if (cancelled || lastContentHash) return;
                const reportHash = typeof report.content_hash === 'string' ? report.content_hash.trim() : '';
                if (reportHash) {
                    setLastContentHash(reportHash);
                    return;
                }
                const post = readEditorPost();
                if (!post) return;
                const shaHash = await hashContentSha256(post.content || '');
                if (cancelled) return;
                const fallback = simpleHashContent(post.content || '');
                const baseline = shaHash || fallback;
                if (baseline) {
                    setLastContentHash(baseline);
                }
            };

            const checkForChanges = async () => {
                if (cancelled || checking || isStale) return;
                const currentPost = readEditorPost();
                if (!currentPost) return;
                checking = true;
                try {
                    const currentSha = await hashContentSha256(currentPost.content || '');
                    if (cancelled) return;
                    const currentHash = currentSha || simpleHashContent(currentPost.content || '');
                    const baselineHash = lastContentHash || (typeof report.content_hash === 'string' ? report.content_hash.trim() : '');
                    if (!baselineHash || !currentHash) return;
                    if (currentHash !== baselineHash) {
                        mismatchCount += 1;
                        if (mismatchCount >= 2) {
                            emitStaleOnce();
                        }
                    } else {
                        mismatchCount = 0;
                    }
                } finally {
                    checking = false;
                }
            };

            ensureBaselineHash();
            const interval = setInterval(() => {
                checkForChanges();
            }, 2000);

            return () => {
                cancelled = true;
                clearInterval(interval);
            };
        }, [state, report?.run_id, report?.content_hash, lastContentHash, isStale]);

        // Helper: Get user-friendly error message (must be defined before runAnalysis)
        function getUserFriendlyMessage(error, message, status, elapsedMs) {
            // Handle specific timeout errors from PN1
            if (error === 'timeout') {
                if (message && message.includes('worker did not start')) {
                    return 'The analysis worker is taking too long to start. This usually happens when the system is busy. Please try again in a few minutes.';
                }
                if (message && message.includes('worker crashed')) {
                    return 'The analysis was interrupted. This might happen with very long content or temporary issues. Please try again.';
                }
            }

            // Handle other specific errors
            switch (error) {
                case 'ai_unavailable':
                    return 'AI service is currently unavailable. Please try again later.';
                case 'invalid_request':
                    return 'The request format was invalid. Please contact support.';
                case 'rate_limited':
                    return 'Too many requests. Please wait a moment before trying again.';
                case 'content_too_long':
                    return 'Your content is too long for analysis. Please reduce the length and try again.';
                case 'api_key_invalid':
                    return 'Service configuration error. Please contact the site administrator.';
                default:
                    // Fallback to provided message or generic
                    if (message && message !== 'AI analysis could not be completed.') {
                        return message;
                    }
                    if (elapsedMs > 240000) { // More than 4 minutes
                        return 'Analysis is taking longer than expected. The system might be experiencing delays.';
                    }
                    return 'Analysis failed. Please try again.';
            }
        }

        function formatQueueHealth(health) {
            if (!health) return null;
            const queue = health.queue || {};
            const attrs = queue.attributes || {};
            const visible = Number(attrs.ApproximateNumberOfMessages || 0);
            const inFlight = Number(attrs.ApproximateNumberOfMessagesNotVisible || 0);
            const oldest = Number(attrs.ApproximateAgeOfOldestMessage || 0);
            const mappingState = health.mapping && health.mapping.state ? health.mapping.state : 'unknown';
            const statusLabel = health.ok ? 'Healthy' : 'Degraded';
            return { visible, inFlight, oldest, mappingState, statusLabel };
        }

        async function checkWorkerHealth(force) {
            const now = Date.now();
            if (!force && now - lastHealthCheckAt < 60000) return;
            setLastHealthCheckAt(now);
            try {
                const result = await callRest('/backend/proxy_worker_health', 'GET');
                if (result.ok && result.data) {
                    setQueueHealth(result.data);
                    return;
                }
                setQueueHealth({
                    ok: false,
                    error: result.data?.message || 'Health check failed'
                });
            } catch (err) {
                setQueueHealth({ ok: false, error: err.message || 'Health check failed' });
            }
        }

        async function runAnalysis() {
            const post = readEditorPost();
            if (!post || !post.content) {
                setState('error');
                setErrorMessage('No content to analyze.');
                setAnalysisPhase('idle');
                return;
            }

            setState('analyzing');
            setAnalysisPhase('preflight');
            setErrorMessage(null);
            setAnalysisStartTime(Date.now());
            setAnalysisSplashUntil(Date.now() + PRECHECK_HERO_MS);
            setIsStale(false);
            staleEventRunRef.current = '';
            setLastContentHash(null);
            setQueueStatus(null);
            setQueueMessage(null);
            setQueueHealth(null);
            setLastHealthCheckAt(0);
            setRawAnalysis(null);

            // Run preflight
            const preResult = await callRest('/preflight', 'POST', {
                content: post.content,
                title: post.title,
                content_type: 'post',
                site_id: window.location.hostname
            });

            if (!preResult.ok || !preResult.data?.ok) {
                setState('error');
                setAnalysisPhase('idle');
                if (!preResult.ok) {
                    const mapped = mapBackendError(preResult.status, preResult.data);
                    setErrorMessage(mapped.message);
                } else {
                    const friendlyMessage = getUserFriendlyMessage(
                        preResult.data?.error || 'preflight_failed',
                        preResult.data?.message,
                        'failed',
                        0
                    );
                    setErrorMessage(friendlyMessage);
                }
                return;
            }
            setLastManifest(preResult.data.manifest || null);
            setAnalysisPhase('queued');


            // Run analysis (Phase 5: Async pattern)
            const result = await callRest('/backend/proxy_analyze', 'POST', {
                content_html: post.content,
                title: post.title,
                content_type: 'post',
                site_id: window.location.hostname,
                meta_description: post.metaDescription || '',
                enable_web_lookups: false,
                manifest: preResult.data.manifest
            });

            // Handle 202 Accepted - start polling
            if (result.status === 202 || result.data?.status === 'queued') {
                const runId = result.data?.run_id;
                if (!runId) {
                    setState('error');
                    setErrorMessage('Analysis queued but no run_id received.');
                    setAnalysisPhase('idle');
                    return;
                }

                debugLog('info', 'AiVI: Analysis queued, polling for run_id', { runId: runId });

                // Poll for results with backoff: 3s → 10s, max 5 mins
                const pollResult = await pollForResults(runId);

                if (pollResult.success) {
                    setQueueStatus(null);
                    setQueueMessage(null);
                    setQueueHealth(null);
                    setAnalysisPhase('idle');
                    handleAnalysisSuccess(pollResult.data);
                } else if (pollResult.aborted) {
                    // ABORT BEHAVIOR: Show abort banner, empty sidebar, no partial results
                    setQueueStatus(null);
                    setQueueMessage(null);
                    setQueueHealth(null);
                    setState('aborted');
                    setAnalysisPhase('idle');
                    setErrorMessage(pollResult.message || 'Analysis aborted — no partial results shown');
                    setReport(null); // Ensure no partial results
                } else {
                    setQueueStatus(null);
                    setQueueMessage(null);
                    setQueueHealth(null);
                    setState('error');
                    setAnalysisPhase('idle');
                    setErrorMessage(pollResult.error || 'Analysis failed during processing.');
                }
                return;
            }

            // Handle immediate success (legacy sync response)
            if (result.ok && result.data) {
                setAnalysisPhase('idle');
                handleAnalysisSuccess(result.data);
            } else {
                setState('error');
                setAnalysisPhase('idle');
                if (!result.ok) {
                    const mapped = mapBackendError(result.status, result.data);
                    setErrorMessage(mapped.message);
                } else {
                    const friendlyMessage = getUserFriendlyMessage(
                        result.data?.error || 'analysis_failed',
                        result.data?.message,
                        'failed',
                        0
                    );
                    setErrorMessage(friendlyMessage);
                }
            }
        }

        // Phase 5: Poll for async analysis results
        async function pollForResults(runId) {
            const INITIAL_INTERVAL = 1500;      // 1.5 seconds
            const EARLY_MAX_INTERVAL = 4000;    // 4 seconds
            const MAX_INTERVAL = 10000;         // 10 seconds
            const MAX_DURATION = 210000;        // 3.5 minutes
            const EARLY_POLL_WINDOW_MS = 30000; // first 30 seconds
            const MID_POLL_WINDOW_MS = 90000;   // 30-90 seconds
            const startTime = Date.now();
            let interval = INITIAL_INTERVAL;
            let consecutivePollErrors = 0;
            let consecutiveInvalidStatus = 0;

            function nextPollInterval(currentInterval, elapsedMs) {
                if (elapsedMs <= EARLY_POLL_WINDOW_MS) {
                    return Math.min(Math.max(Math.floor(currentInterval * 1.25), 2000), EARLY_MAX_INTERVAL);
                }
                if (elapsedMs <= MID_POLL_WINDOW_MS) {
                    return Math.min(Math.max(Math.floor(currentInterval * 1.25), 4000), 7000);
                }
                return Math.min(Math.max(Math.floor(currentInterval * 1.2), 7000), MAX_INTERVAL);
            }

            function computeBackoffDelay(elapsedMs) {
                const exponent = Math.min(consecutivePollErrors, 6);
                const base = INITIAL_INTERVAL * Math.pow(1.5, exponent);
                const jitter = Math.floor(Math.random() * 500);
                const minFloor = elapsedMs <= EARLY_POLL_WINDOW_MS ? 2000 : 4000;
                return Math.min(Math.max(minFloor, Math.floor(base) + jitter), MAX_INTERVAL);
            }

            function shouldTreatPollFailureAsTransient(result, diagnostics) {
                const status = Number(result && result.status);
                if (status === 429 || status === 503 || status === 502 || status === 504) return true;
                const type = diagnostics && diagnostics.type ? String(diagnostics.type).toLowerCase() : '';
                if (type === 'connection' || type === 'timeout' || type === 'dns' || type === 'ssl') return true;
                const msg = diagnostics && diagnostics.message ? String(diagnostics.message).toLowerCase() : '';
                if (msg.includes('curl error 55') || msg.includes('socket not connected') || msg.includes('http_request_failed')) return true;
                return false;
            }

            async function finalizeSuccessfulPollPayload(responseData, responseStatus) {
                const detailsToken = responseData?.details_token;
                if (responseData?.result_url) {
                    try {
                        const fullResult = await fetch(responseData.result_url);
                        const json = await fullResult.json();
                        if (json && detailsToken && !json.details_token) {
                            json.details_token = detailsToken;
                        }
                        if (json && !json.status) {
                            json.status = responseStatus;
                        }
                        if (json && responseData.partial && !json.partial) {
                            json.partial = responseData.partial;
                        }
                        return { success: true, data: json };
                    } catch (e) {
                        return { success: false, error: 'Failed to fetch result JSON from S3' };
                    }
                }
                if (responseData?.result) {
                    const data = responseData.result;
                    if (data && detailsToken && !data.details_token) {
                        data.details_token = detailsToken;
                    }
                    if (data && !data.status) {
                        data.status = responseStatus;
                    }
                    if (data && responseData.partial && !data.partial) {
                        data.partial = responseData.partial;
                    }
                    return { success: true, data: data };
                }
                if (responseData && detailsToken && !responseData.details_token) {
                    responseData.details_token = detailsToken;
                }
                if (responseData && !responseData.status) {
                    responseData.status = responseStatus;
                }
                return { success: true, data: responseData };
            }

            while (Date.now() - startTime < MAX_DURATION) {
                await new Promise(resolve => setTimeout(resolve, interval));

                const result = await callRest(`/backend/proxy_run_status/${runId}`, 'GET');
                const elapsedMs = Date.now() - startTime;

                if (!result.ok) {
                    const diagnostics = result.data?.data?.diagnostics || result.data?.diagnostics;
                    debugLog('warn', 'AiVI: Poll request failed', { result: result, diagnostics: diagnostics });
                    if (shouldTreatPollFailureAsTransient(result, diagnostics)) {
                        consecutivePollErrors += 1;
                        interval = computeBackoffDelay(elapsedMs);
                        setQueueStatus('queued');
                        setQueueMessage(consecutivePollErrors >= 2 ? 'Connection issue while checking status. Retrying…' : 'Checking status…');
                        continue;
                    }
                    if (diagnostics && diagnostics.summary) return { success: false, error: diagnostics.summary };
                    if (result.data?.message) return { success: false, error: result.data.message };
                    interval = nextPollInterval(interval, elapsedMs);
                    continue;
                }

                const status = result.data?.status;
                debugLog('debug', 'AiVI: Poll status', { status: status, elapsedSeconds: Math.round(elapsedMs / 1000) });
                consecutivePollErrors = 0;

                if (!status || typeof status !== 'string') {
                    consecutiveInvalidStatus += 1;
                    const message = result.data?.message || result.data?.error || 'Invalid status response from server.';
                    if (consecutiveInvalidStatus >= 3) {
                        return { success: false, error: message };
                    }
                    interval = nextPollInterval(interval, elapsedMs);
                    continue;
                }

                consecutiveInvalidStatus = 0;

                switch (status) {
                    case 'success':
                    case 'success_partial': {
                        return await finalizeSuccessfulPollPayload(result.data, status);
                    }

                    case 'failed':
                    case 'failed_schema':
                    case 'failed_too_long':
                    case 'aborted':
                        // Defensive path: if backend returns failed but carries recoverable partial payload, render it.
                        if (result.data?.partial && (result.data?.result_url || result.data?.result || result.data?.analysis_summary)) {
                            debugLog('warn', 'AiVI: Recoverable partial payload returned with failed status; treating as success_partial', {
                                runId: runId,
                                status: status,
                                error: result.data?.error || null
                            });
                            return await finalizeSuccessfulPollPayload(result.data, 'success_partial');
                        }
                        // ABORT BEHAVIOR: Check for aborted analysis_summary
                        if (result.data.analysis_summary?.status === 'aborted') {
                            return {
                                success: false,
                                aborted: true,
                                reason: result.data.analysis_summary.reason || result.data.error,
                                message: result.data.analysis_summary.message || 'Analysis aborted — no partial results shown',
                                traceId: result.data.analysis_summary.trace_id || result.data.trace_id
                            };
                        }
                        const friendlyError = getUserFriendlyMessage(
                            result.data.error,
                            result.data.message,
                            status,
                            elapsedMs
                        );
                        return { success: false, error: friendlyError };

                    case 'queued':
                        setQueueStatus('queued');
                        setAnalysisPhase('queued');
                        setQueueMessage(elapsedMs > 45000 ? 'Waiting for a worker to pick up the job.' : 'Queued for processing.');
                        if (elapsedMs > 60000) {
                            await checkWorkerHealth(false);
                        }
                        if (elapsedMs > 90000) {
                            debugLog('info', 'AiVI: Still queued after 1.5 minutes');
                        }
                        interval = nextPollInterval(interval, elapsedMs);
                        break;

                    case 'running':
                        setQueueStatus('running');
                        setAnalysisPhase('running');
                        setQueueMessage('Analysis in progress.');
                        if (elapsedMs > 150000) {
                            debugLog('info', 'AiVI: Still running after 2.5 minutes');
                        }
                        interval = nextPollInterval(interval, elapsedMs);
                        break;

                    default:
                        interval = nextPollInterval(interval, elapsedMs);
                        break;
                }
            }
            // Use friendly timeout message
            const timeoutMessage = getUserFriendlyMessage('timeout', '', '', MAX_DURATION);
            return { success: false, error: timeoutMessage };
        }

        function openOverlayEditor() {
            if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
                return;
            }
            window.dispatchEvent(new CustomEvent('aivi:overlay_open', {
                detail: { report: report, manifest: lastManifest, overlayContent: overlayContent }
            }));
        }

        // Handle successful analysis result
        function handleAnalysisSuccess(data) {
            setRawAnalysis(null);
            setReport(data);
            setState('success');
            setAnalysisPhase('idle');
            setTimeout(() => setShowSuccessAnim(true), 100);
            staleEventRunRef.current = '';
            setIsStale(false);
            setLastContentHash(typeof data?.content_hash === 'string' ? data.content_hash : null);
            setQueueStatus(null);
            setQueueMessage(null);
            setQueueHealth(null);
            setOverlayContent(data.overlay_content || null); // NEW: Store overlay content

            if (data && data.run_id && NavigationController) {
                NavigationController.init(data.run_id, () => setIsStale(true));
            }
        }

        function clearCache() {
            setReport(null);
            setState('idle');
            setAnalysisPhase('idle');
            setShowSuccessAnim(false);
            setAnalysisStartTime(null);
            setIsStale(false);
            staleEventRunRef.current = '';
            setLastContentHash(null);
            setLastManifest(null);
            setQueueStatus(null);
            setQueueMessage(null);
            setOverlayContent(null); // NEW: Clear overlay content
            setRawAnalysis(null);
        }

        function downloadBlob(filename, content, type) {
            try {
                const blob = new Blob([content], { type: type || 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } catch (e) {
                debugLog('warn', 'AiVI: Download failed', { error: e && e.message });
            }
        }

        function escapeHtml(value) {
            return String(value || '').replace(/[&<>"']/g, (char) => {
                switch (char) {
                    case '&': return '&amp;';
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '"': return '&quot;';
                    case "'": return '&#39;';
                    default: return char;
                }
            });
        }

        function buildReportHtml(payload) {
            const metadata = payload.metadata || {};
            const checks = payload.raw_result && payload.raw_result.checks ? payload.raw_result.checks : {};
            const checkEntries = Object.entries(checks);
            const counts = { pass: 0, fail: 0, partial: 0, other: 0 };
            const rows = checkEntries.map(([id, data]) => {
                const verdict = (data && (data.ui_verdict || data.verdict)) ? String(data.ui_verdict || data.verdict).toLowerCase() : 'unknown';
                if (verdict === 'pass') counts.pass += 1;
                else if (verdict === 'fail') counts.fail += 1;
                else if (verdict === 'partial') counts.partial += 1;
                else counts.other += 1;
                const name = data && (data.name || data.title) ? data.name || data.title : id;
                const explanation = data && data.explanation ? data.explanation : '';
                const severity = data && data.severity ? data.severity : '';
                return `<tr>
<td>${escapeHtml(id)}</td>
<td>${escapeHtml(name)}</td>
<td>${escapeHtml(verdict)}</td>
<td>${escapeHtml(severity)}</td>
<td>${escapeHtml(explanation)}</td>
</tr>`;
            }).join('');

            return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>AiVI Analysis Report</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 24px; }
h1 { font-size: 20px; margin-bottom: 8px; }
.meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
.summary { display: flex; gap: 12px; margin-bottom: 16px; }
.badge { padding: 6px 10px; border-radius: 999px; font-size: 12px; background: #f1f5f9; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
th { background: #f8fafc; font-weight: 600; }
</style>
</head>
<body>
<h1>AiVI Analysis Report</h1>
<div class="meta">Run ID: ${escapeHtml(metadata.run_id)} • Completed: ${escapeHtml(metadata.completed_at || '')} • Generated: ${escapeHtml(metadata.generated_at || '')}</div>
<div class="summary">
<div class="badge">Passed: ${counts.pass}</div>
<div class="badge">Failed: ${counts.fail}</div>
<div class="badge">Partial: ${counts.partial}</div>
<div class="badge">Other: ${counts.other}</div>
</div>
<table>
<thead>
<tr>
<th>Check ID</th>
<th>Name</th>
<th>Verdict</th>
<th>Severity</th>
<th>Explanation</th>
</tr>
</thead>
<tbody>
${rows || '<tr><td colspan="5">No raw checks available.</td></tr>'}
</tbody>
</table>
</body>
</html>`;
        }

        const fetchRawAnalysis = useCallback(async () => {
            if (!report || !report.details_token) {
                return { ok: false, error: 'missing_details_token' };
            }
            const expectedRunId = report && report.run_id ? String(report.run_id) : '';
            const result = await callRest('/backend/analysis-raw', 'POST', {
                details_token: report.details_token,
                content_hash: isAutoStaleDetectionEnabled ? (lastContentHash || '') : ''
            });
            if (!result.ok || !result.data) {
                return { ok: false, error: result.data?.message || 'raw_fetch_failed' };
            }
            const payloadRunId = String(result.data.run_id || result.data.result?.run_id || expectedRunId || '');
            if (expectedRunId && payloadRunId && payloadRunId !== expectedRunId) {
                debugLog('warn', 'AiVI: Raw analysis run_id mismatch', {
                    expected_run_id: expectedRunId,
                    raw_run_id: payloadRunId
                });
                return { ok: false, error: 'raw_run_id_mismatch' };
            }
            const normalizedData = {
                ...result.data,
                run_id: result.data.run_id || expectedRunId || null
            };
            return { ok: true, data: normalizedData, run_id: normalizedData.run_id || expectedRunId };
        }, [report, lastContentHash]);

        useEffect(() => {
            const currentRunId = report && report.run_id ? String(report.run_id) : '';
            if (!showPassedChecks || !currentRunId) return;
            const loadedRunId = rawAnalysis ? String(rawAnalysis.run_id || rawAnalysis.result?.run_id || '') : '';
            if (loadedRunId && loadedRunId === currentRunId) return;
            const requestId = ++rawFetchRequestRef.current;
            fetchRawAnalysis().then(result => {
                if (requestId !== rawFetchRequestRef.current) return;
                if (activeRunIdRef.current !== currentRunId) return;
                if (result.ok && result.data) {
                    const nextRaw = {
                        ...result.data,
                        run_id: result.data.run_id || currentRunId
                    };
                    setRawAnalysis(nextRaw);
                    return;
                }
                if (result.error === 'raw_run_id_mismatch') {
                    setRawAnalysis(null);
                }
            });
        }, [showPassedChecks, rawAnalysis, report?.run_id, fetchRawAnalysis]);

        async function exportAnalysisReport() {
            if (!report) return;
            const rawResult = await fetchRawAnalysis();
            const metadata = {
                run_id: report.run_id,
                completed_at: report.completed_at,
                generated_at: new Date().toISOString(),
                scores: report.scores || null,
                prompt_provenance: report.prompt_provenance || null
            };
            const payload = {
                metadata: metadata,
                analysis_summary: report.analysis_summary || null,
                raw_result: rawResult.ok ? rawResult.data?.result || null : null
            };
            const fileBase = `aivi-report-${report.run_id || Date.now()}`;
            downloadBlob(`${fileBase}.json`, JSON.stringify(payload, null, 2), 'application/json');
            const html = buildReportHtml(payload);
            downloadBlob(`${fileBase}.html`, html, 'text/html');
            try {
                const win = window.open('', '_blank');
                if (win) {
                    win.document.open();
                    win.document.write(html);
                    win.document.close();
                    win.focus();
                    win.print();
                }
            } catch (e) {
                debugLog('warn', 'AiVI: Print failed', { error: e && e.message });
            }
        }

        async function downloadRawVerdicts() {
            if (!report) return;
            const rawResult = await fetchRawAnalysis();
            if (!rawResult.ok) {
                debugLog('warn', 'AiVI: Raw verdict download failed', { error: rawResult.error });
                return;
            }
            const payload = {
                run_id: report.run_id,
                completed_at: report.completed_at,
                generated_at: new Date().toISOString(),
                result: rawResult.data?.result || null
            };
            const fileBase = `aivi-raw-verdicts-${report.run_id || Date.now()}`;
            downloadBlob(`${fileBase}.json`, JSON.stringify(payload, null, 2), 'application/json');
        }

        function getScores() {
            if (!report || !report.scores) return { global: 0, aeo: 0, geo: 0 };
            const scores = report.scores || {};
            const normalizeBounded = (value, max) => {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return 0;
                if (numeric <= 1) return Math.round(Math.max(0, Math.min(max, numeric * max)));
                if (numeric > max && numeric <= 100) return Math.round((numeric / 100) * max);
                return Math.round(Math.max(0, Math.min(max, numeric)));
            };
            const aeoCandidate = scores.AEO ?? scores.aeo ?? scores?.global?.AEO?.score ?? scores?.categories?.AEO?.score;
            const geoCandidate = scores.GEO ?? scores.geo ?? scores?.global?.GEO?.score ?? scores?.categories?.GEO?.score;
            const globalCandidate = scores.GLOBAL ?? scores.global_score ?? scores?.global?.score;
            const aeo = normalizeBounded(aeoCandidate, 55);
            const geo = normalizeBounded(geoCandidate, 45);
            const global = globalCandidate === undefined || globalCandidate === null
                ? Math.round(Math.max(0, Math.min(100, aeo + geo)))
                : normalizeBounded(globalCandidate, 100);
            return {
                global,
                aeo,
                geo
            };
        }

        // New Helper: Group ALL checks by Category (includes passed for toggle)
        // CRITICAL FIX: Support both analysis_summary.categories (Result Contract Lock)
        // and legacy report.checks format for backward compatibility
        function getGroupedIssues(customReport, rawReport) {
            const targetReport = customReport || report;
            if (!targetReport) return { groups: {}, allIssues: [], issueCount: 0 };

            // RESULT CONTRACT LOCK: Prefer analysis_summary.categories if available
            // This is the new format returned by run-status-handler after sidebar-payload-stripper
            if (targetReport.analysis_summary && Array.isArray(targetReport.analysis_summary.categories)) {
                const categories = targetReport.analysis_summary.categories;
                const groups = {};
                const allIssues = [];
                let issueCount = 0;

                categories.forEach(cat => {
                    const categoryName = cat.name || cat.id || 'General';
                    if (!groups[categoryName]) groups[categoryName] = [];

                    const issues = cat.issues || [];
                    issues.forEach(issue => {
                        const actionable = !!issue.first_instance_node_ref;
                        const resolvedVerdict = (issue.ui_verdict === 'pass' || issue.verdict === 'pass') ? 'pass' : (issue.ui_verdict || 'fail');
                        const mappedIssue = {
                            id: issue.check_id || issue.id || 'unknown',
                            check_id: issue.check_id || issue.id || 'unknown',
                            detail_ref: issue.detail_ref || ((issue.check_id || issue.id) ? `check:${issue.check_id || issue.id}` : null),
                            name: issue.name || issue.check_id || 'Unknown Check',
                            title: issue.name || issue.check_id || 'Unknown Check',
                            category: categoryName,
                            verdict: resolvedVerdict,
                            ui_verdict: resolvedVerdict,
                            instances: issue.instances || 1,
                            first_instance_node_ref: issue.first_instance_node_ref || null,
                            actionable: actionable,
                            highlights: []
                        };
                        groups[categoryName].push(mappedIssue);
                        allIssues.push(mappedIssue);

                        // Count fail + partial
                        if (mappedIssue.ui_verdict === 'fail' || mappedIssue.ui_verdict === 'partial') {
                            issueCount++;
                        }
                    });
                });

                const rawChecksPayload = rawReport && (rawReport.result?.checks || rawReport.checks);
                const summaryRunId = String(targetReport.run_id || targetReport.analysis_summary?.run_id || '');
                const rawRunId = rawReport ? String(rawReport.run_id || rawReport.result?.run_id || '') : '';
                const hasRunAlignedRaw = !!summaryRunId && !!rawRunId && summaryRunId === rawRunId;
                if (showPassedChecks && rawChecksPayload && hasRunAlignedRaw) {
                    const existingIds = new Set(allIssues.map(issue => issue.check_id));
                    const rawChecksArray = Array.isArray(rawChecksPayload)
                        ? rawChecksPayload
                        : Object.entries(rawChecksPayload).map(([key, val]) => ({ ...val, id: key }));
                    const mappedPasses = rawChecksArray.map(c => {
                        const safeId = c.id || 'unknown_check';
                        let verdict = c.verdict || 'fail';
                        if (c.passed === true) verdict = 'pass';
                        if (c.passed === false && !c.verdict) verdict = 'fail';
                        if (c.status === 'fail' || c.status === 'critical') verdict = 'fail';
                        const category = resolveCanonicalCategoryName(safeId, c.category);
                        const title = c.title
                            ? c.title
                            : safeId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        return {
                            id: safeId,
                            check_id: safeId,
                            detail_ref: `check:${safeId}`,
                            name: title,
                            title: title,
                            category: category,
                            verdict: verdict,
                            ui_verdict: verdict,
                            instances: c.instances || 1,
                            first_instance_node_ref: c.first_instance_node_ref || null,
                            actionable: false,
                            highlights: []
                        };
                    }).filter(c => c.ui_verdict === 'pass' && !existingIds.has(c.check_id));
                    mappedPasses.forEach(passIssue => {
                        if (!groups[passIssue.category]) groups[passIssue.category] = [];
                        groups[passIssue.category].push(passIssue);
                        allIssues.push(passIssue);
                    });
                } else if (showPassedChecks && rawChecksPayload && summaryRunId && rawRunId && !hasRunAlignedRaw) {
                    debugLog('warn', 'AiVI: Ignoring raw passed checks due to run mismatch', {
                        summary_run_id: summaryRunId,
                        raw_run_id: rawRunId
                    });
                }

                return { groups, allIssues, issueCount };
            }

            // LEGACY FALLBACK: Use report.checks if analysis_summary not available
            if (!targetReport.checks) return { groups: {}, allIssues: [], issueCount: 0 };

            // Phase 5 fix: Preserve Keys as IDs (Sonnet output schema doesn't embed ID in value)
            const checksArray = Array.isArray(targetReport.checks)
                ? targetReport.checks
                : Object.entries(targetReport.checks).map(([key, val]) => ({ ...val, id: key }));

            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

            // Map ALL checks (including passed) with verdict info
            const mappedChecks = checksArray.map(c => {
                let severity = 'medium';
                if (c.impact === 'high' || c.impact === 'critical' || c.status === 'critical') severity = 'high';
                if (c.impact === 'low') severity = 'low';

                // Determine verdict (normalize different formats)
                let verdict = c.verdict || 'fail';
                if (c.passed === true) verdict = 'pass';
                if (c.passed === false && !c.verdict) verdict = 'fail';
                if (c.status === 'fail' || c.status === 'critical') verdict = 'fail';

                let explanation = c.message || c.explanation || 'Issue detected';
                if (c.issues && Array.isArray(c.issues) && c.issues.length > 0) explanation = c.issues[0];

                // Determine Category (Fallback to 'General' if missing)
                let category = c.category || 'General';
                if (typeof category === 'string') {
                    category = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                } else {
                    category = 'General';
                }

                // Determine Title (Fallback to ID)
                const safeId = c.id || 'unknown_check';
                const title = c.title
                    ? c.title
                    : safeId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                return {
                    id: safeId,
                    check_id: safeId,
                    name: title,
                    title: title,
                    explanation: explanation,
                    severity: severity,
                    category: category,
                    verdict: verdict,
                    ui_verdict: verdict,
                    highlights: c.highlights || [],
                    instances: c.instances || 1
                };
            }).sort((a, b) => (severityOrder[a.severity] || 1) - (severityOrder[b.severity] || 1));

            // 3. Group by Category
            const groups = {};
            mappedChecks.forEach(check => {
                if (!groups[check.category]) groups[check.category] = [];
                groups[check.category].push(check);
            });

            // Count only fail + partial for issue count
            const issueCount = mappedChecks.filter(c => c.verdict === 'fail' || c.verdict === 'partial').length;

            return { groups, allIssues: mappedChecks, issueCount };
        }

        // Helper to format time ago
        function getTimeAgo() {
            if (!report || !report.completed_at) return 'Just now';
            try {
                const completed = new Date(report.completed_at);
                const diff = Math.floor((new Date() - completed) / 60000); // minutes
                if (diff < 1) return 'Just now';
                if (diff < 60) return diff + 'm ago';
                const hours = Math.floor(diff / 60);
                if (hours < 24) return hours + 'h ago';
                return '1d+ ago';
            } catch (e) { return 'Just now'; }
        }

        function getFaqJsonLd() {
            if (!report) return null;
            return report.schema_suggestions?.faq_jsonld || (report.result?.schema_suggestions?.faq_jsonld) || null;
        }

        // Render groupings
        const { groups: groupedIssues, issueCount } = getGroupedIssues(report, rawAnalysis);
        const hasIssues = issueCount > 0;
        const queueInfo = formatQueueHealth(queueHealth);

        // Render
        return createElement(PluginSidebar, { name: 'aivi-sidebar', title: 'AiVI Inspector' },
            createElement(PanelBody, { title: 'Content Analysis', initialOpen: true },

                // IDLE STATE
                state === 'idle' && createElement(LauncherCard, {
                    onAnalyze: runAnalysis,
                    onClearCache: clearCache
                }),
                // ANALYZING STATE
                state === 'analyzing' && createElement('div', {
                    style: {
                        background: COLORS.white,
                        border: '1px solid ' + COLORS.cardBorder,
                        borderRadius: 8,
                        padding: 12
                    }
                },
                    createElement(AnalysisProgressPanel, {
                        phase: analysisPhase,
                        analysisStartTime: analysisStartTime || 0,
                        splashUntilEpochMs: analysisSplashUntil || 0,
                        queueMessage: queueMessage || '',
                        queueInfo: queueInfo
                    })
                ),

                // ERROR STATE
                state === 'error' && createElement('div', {
                    style: {
                        background: COLORS.white,
                        border: '1px solid ' + COLORS.cardBorder,
                        borderRadius: 8,
                        padding: 12
                    }
                },
                    createElement('div', { style: { marginBottom: 10 } },
                        createElement('div', { style: { fontWeight: 600, fontSize: 14, color: COLORS.scoreText } },
                            'Would AI choose this page?')
                    ),
                    createElement(ProgressBar, {
                        error: true,
                        errorMessage: errorMessage,
                        onRetry: runAnalysis
                    })
                ),

                // ABORTED STATE - Prominent non-modal banner with exact copy
                state === 'aborted' && createElement('div', {
                    style: {
                        background: COLORS.errorLight,
                        border: '2px solid ' + COLORS.error,
                        borderRadius: 8,
                        padding: 16,
                        textAlign: 'center'
                    },
                    role: 'alert',
                    'aria-live': 'polite'
                },
                    createElement(Dashicon, {
                        icon: 'warning',
                        style: { color: COLORS.error, fontSize: 28, width: 28, height: 28, marginBottom: 8 }
                    }),
                    createElement('div', {
                        style: { fontWeight: 600, fontSize: 14, color: COLORS.highText, marginBottom: 8 }
                    }, 'Analysis aborted — no partial results shown'),
                    createElement('div', {
                        style: { fontSize: 12, color: COLORS.subtext, marginBottom: 12 }
                    }, 'The analysis could not be completed. No partial data is shown.'),
                    createElement(Button, {
                        isPrimary: true,
                        onClick: runAnalysis,
                        style: { width: '100%', justifyContent: 'center', height: 40 }
                    }, 'Retry analysis')
                ),

                // SUCCESS STATE
                state === 'success' && report && createElement('div', {
                    style: { position: 'relative', paddingBottom: 60 } // padding for footer
                },
                    // STALE BANNER - Show when content has been edited
                    isAutoStaleDetectionEnabled && (isStale || isStaleBanner) && createElement('div', {
                        style: {
                            background: COLORS.warning,
                            border: '1px solid ' + COLORS.warningBorder,
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 12,
                            textAlign: 'center'
                        },
                        role: 'alert',
                        'aria-live': 'polite'
                    },
                        createElement(Dashicon, {
                            icon: 'update',
                            style: { color: COLORS.mediumText, fontSize: 20, width: 20, height: 20, marginRight: 6 }
                        }),
                        createElement('span', {
                            style: { fontWeight: 500, fontSize: 13, color: COLORS.mediumText }
                        }, 'Analysis results stale — please re-run analysis'),
                        createElement(Button, {
                            isSecondary: true,
                            isSmall: true,
                            onClick: runAnalysis,
                            style: { marginLeft: 12 }
                        }, 'Re-run analysis')
                    ),

                    createElement(HeroScore, {
                        score: getScores().global,
                        aeo: getScores().aeo,
                        geo: getScores().geo,
                        lastRun: getTimeAgo(),
                        animate: showSuccessAnim
                    }),
                    createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 } },
                        createElement(ScoreCircle, { value: getScores().aeo, max: 55, color: COLORS.aeoRing, label: 'AEO Score' }),
                        createElement(ScoreCircle, { value: getScores().geo, max: 45, color: COLORS.geoRing, label: 'GEO Score' })
                    ),
                    createElement('div', { style: { marginBottom: 16 } },
                        createElement(Button, { isPrimary: true, onClick: openOverlayEditor, style: { width: '100%', justifyContent: 'center', height: 40 } }, 'Edit in AiVI')
                    ),
                    createElement('div', { style: { marginBottom: 16, display: 'flex', gap: 8 } },
                        createElement(Button, { isSecondary: true, isSmall: true, onClick: exportAnalysisReport }, 'Export Report (PDF)'),
                        createElement(Button, { isTertiary: true, isSmall: true, onClick: downloadRawVerdicts }, 'Raw Verdicts (Debug)')
                    ),

                    // Render Grouped Issues via Accordions
                    hasIssues && createElement('div', { style: { marginBottom: 16 } },
                        Object.entries(groupedIssues).map(([category, issues]) =>
                            createElement(IssueAccordion, {
                                key: category,
                                category: category,
                                issues: issues,
                                showPassedChecks: showPassedChecks,
                                detailsToken: report.details_token,
                                isStale: isStale,
                                isStaleBanner: isStaleBanner
                            })
                        )
                    ),

                    // Advanced Toggle: "Show passed checks" (power-user, de-emphasized)
                    createElement('div', {
                        style: {
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            paddingTop: 8,
                            borderTop: '1px solid ' + COLORS.cardBorder
                        }
                    },
                        createElement('input', {
                            type: 'checkbox',
                            id: 'aivi-show-passed',
                            checked: showPassedChecks,
                            onChange: (e) => setShowPassedChecks(e.target.checked),
                            style: { margin: 0, cursor: 'pointer' }
                        }),
                        createElement('label', {
                            htmlFor: 'aivi-show-passed',
                            style: {
                                fontSize: 12,
                                color: COLORS.muted,
                                cursor: 'pointer',
                                fontWeight: 400
                            }
                        }, 'Show passed checks')
                    ),

                    // No issues found message
                    !hasIssues && createElement('div', {
                        style: {
                            padding: 16,
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: 8,
                            textAlign: 'center',
                            marginBottom: 16
                        }
                    },
                        createElement(Dashicon, { icon: 'yes-alt', style: { color: '#16A34A', fontSize: 24, width: 24, height: 24, marginBottom: 8 } }),
                        createElement('div', { style: { fontSize: 13, fontWeight: 600, color: '#16A34A' } }, 'Excellent! No issues found.')
                    ),

                    createElement(JsonLdPanel, { jsonLd: getFaqJsonLd() }),
                    createElement('div', { style: { marginTop: 12, display: 'flex', gap: 8 } },
                        createElement(Button, { isSecondary: true, isSmall: true, onClick: runAnalysis }, 'Re-analyze'),
                        createElement(Button, { isTertiary: true, isSmall: true, onClick: clearCache }, 'Clear')
                    ),

                    // Navigation Footer (Sticky)

                    detailsDrawer && detailsDrawer.DetailsDrawer && createElement(detailsDrawer.DetailsDrawer, null)
                )
            )
        );
    }

    runAutoAnalysisOnLoad();

    // ============================================
    // PLUGIN REGISTRATION
    // ============================================

    debugLog('info', 'AiVI: registerPlugin available', { available: !!registerPlugin });
    if (registerPlugin && typeof registerPlugin === 'function') {
        try {
            const existingPlugins = (typeof getPlugins === 'function') ? getPlugins() : [];
            const alreadyRegistered = existingPlugins.some(p => p.name === 'aivi-plugin');
            if (alreadyRegistered) {
                debugLog('info', 'AiVI: Plugin already registered, skipping');
            } else {
                debugLog('info', 'AiVI: Attempting to register plugin');
                registerPlugin('aivi-plugin', { render: AiviSidebar, icon: 'visibility' });
                debugLog('info', 'AiVI: Plugin registered successfully');
            }
        } catch (e) {
            debugLog('error', 'AiVI: registerPlugin failed', { error: e && e.message });
        }
    } else {
        debugLog('warn', 'AiVI: registerPlugin not available');
    }

    if (document.getElementById('aivi-meta-root')) {
        debugLog('info', 'AiVI: Classic editor detected');
    }

})(window.wp, window.AIVI_CONFIG || {});
