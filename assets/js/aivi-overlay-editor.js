(function (wp) {
    const select = wp && wp.data ? wp.data.select : null;

    const state = {
        open: false,
        lastReport: null,
        lastManifest: null,
        contextDoc: null,
        overlayRoot: null,
        overlayPanel: null,
        overlayViewport: null,
        overlayContent: null,
        overlayRail: null,
        overlayRailViewport: null,
        overlayShell: null,
        overlayDocTitle: null,
        blockMenu: null,
        blockMenuNodeRef: '',
        blockMenuDismissHandler: null,
        overlayScrollHandler: null,
        overlayRailScrollHandler: null,
        overlayResizeHandler: null,
        overlayLayoutRaf: null,
        scrollLockTargets: [],
        keyHandler: null,
        issueMap: null,
        suggestions: {},
        metaStatus: '',
        isStale: false,
        lastBlocksKey: '',
        inlinePanel: null,
        inlineItemKey: '',
        inlineDismissHandler: null,
        activeEditableBody: null,
        activeEditableNodeRef: '',
        toolbarButtons: [],
        toolbarSelectionHandler: null,
        toolbarRefreshRaf: null,
        lastJumpNodeRef: '',
        jumpFlashTimer: null,
        insertedSchemaFingerprints: new Set(),
        inlineSuppressedRecommendations: [],
        inlineSuppressedRecommendationKeys: new Set(),
        overlayDirty: false,
        draftSaveTimer: null,
        draftRestoreAttempted: false,
        beforeUnloadHandler: null,
        documentMetaCache: new Map(),
        editorRevealCleanupTimer: null,
        overlayApplyRuntime: null
    };

    function debugLog(level, message, data) {
        if (!window || !window.AIVI_DEBUG) return;
        try {
            const entry = {
                level: level || 'info',
                message: message || '',
                data: data || null,
                timestamp: new Date().toISOString()
            };
            if (!window.AIVI_DEBUG_LOGS) window.AIVI_DEBUG_LOGS = [];
            window.AIVI_DEBUG_LOGS.push(entry);
        } catch (e) {
        }
    }

    const HIGH_IMPACT_CHECK_IDS = new Set([
        'immediate_answer_placement',
        'question_answer_alignment',
        'clear_answer_formatting',
        'lists_tables_presence',
        'heading_topic_fulfillment',
        'claim_provenance_and_evidence',
        'external_authoritative_sources',
        'factual_statements_well_formed',
        'numeric_claim_consistency',
        'contradictions_and_coherence',
        'schema_matches_content',
        'article_jsonld_presence_and_completeness',
        'faq_jsonld_presence_and_completeness',
        'howto_jsonld_presence_and_completeness',
        'itemlist_jsonld_presence_and_completeness',
        'ai_crawler_accessibility'
    ]);

    const POLISH_CHECK_IDS = new Set([
        'appropriate_paragraph_length',
        'readability_adaptivity',
        'author_bio_present',
        'intro_readability',
        'intro_wordcount',
        'terminology_consistency',
        'semantic_html_usage'
    ]);

    function normalizeOverlayPriorityToken(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getOverlayIssueImpactTier(issue) {
        if (!issue) return null;
        const verdict = normalizeOverlayPriorityToken(issue.ui_verdict || issue.verdict || '');
        if (verdict === 'pass') return null;

        const priorityToken = normalizeOverlayPriorityToken(issue.severity || issue.impact || issue.priority || issue.importance);
        if (priorityToken === 'critical' || priorityToken === 'high') return 'high';
        if (priorityToken === 'low' || priorityToken === 'polish') return 'polish';

        const checkId = normalizeOverlayPriorityToken(issue.check_id || issue.id || '');
        if (POLISH_CHECK_IDS.has(checkId)) return 'polish';
        if (HIGH_IMPACT_CHECK_IDS.has(checkId)) return 'high';
        return 'recommended';
    }

    function buildOverlayImpactPill(issue) {
        const tier = getOverlayIssueImpactTier(issue);
        if (!tier || !state.contextDoc) return null;
        const pill = state.contextDoc.createElement('span');
        pill.className = 'aivi-overlay-review-impact-pill';
        pill.setAttribute('data-tier', tier);
        pill.textContent = tier === 'high'
            ? 'High impact'
            : (tier === 'polish' ? 'Polish' : 'Recommended');
        return pill;
    }

    function getOverlaySpanMeta(span) {
        const ds = span && span.dataset ? span.dataset : {};
        const issueKey = ds.issueKey || span.getAttribute('data-issue-key') || '';
        const issueKeysRaw = ds.issueKeys || span.getAttribute('data-issue-keys') || '';
        const issueKeys = issueKeysRaw
            ? issueKeysRaw.split(',').map((value) => value.trim()).filter(Boolean)
            : (issueKey ? [issueKey] : []);
        const checkId = ds.checkId || span.getAttribute('data-check-id') || ds.check || span.getAttribute('data-check') || '';
        const instanceIndexRaw = ds.instanceIndex || span.getAttribute('data-instance-index') || '';
        const instanceIndex = instanceIndexRaw === '' ? null : Number(instanceIndexRaw);
        const runId = ds.runId || span.getAttribute('data-run-id') || '';
        const message = ds.message || span.getAttribute('data-message') || '';
        const nodeRef = ds.nodeRef || span.getAttribute('data-node-ref') || '';
        const signature = ds.signature || span.getAttribute('data-signature') || '';
        const anchorStatus = ds.anchorStatus || span.getAttribute('data-anchor-status') || '';
        const anchorStrategy = ds.anchorStrategy || span.getAttribute('data-anchor-strategy') || '';
        return { issueKey, issueKeys, checkId, instanceIndex, runId, message, nodeRef, signature, anchorStatus, anchorStrategy };
    }

    function resolveIssueItemFromSpan(span) {
        const meta = getOverlaySpanMeta(span);
        if (!state.issueMap || !(state.issueMap instanceof Map)) {
            return { item: null, items: [], meta };
        }
        if (Array.isArray(meta.issueKeys) && meta.issueKeys.length) {
            const items = meta.issueKeys.map(key => state.issueMap.get(key)).filter(Boolean);
            if (items.length) {
                return { item: items[0], items, meta };
            }
        }
        if (meta.issueKey && state.issueMap.has(meta.issueKey)) {
            return { item: state.issueMap.get(meta.issueKey), items: [state.issueMap.get(meta.issueKey)], meta };
        }
        if (meta.checkId && Number.isFinite(meta.instanceIndex) && meta.instanceIndex >= 0) {
            const key = `${meta.checkId}:${meta.instanceIndex}`;
            if (state.issueMap.has(key)) {
                return { item: state.issueMap.get(key), items: [state.issueMap.get(key)], meta };
            }
        }
        return { item: null, items: [], meta };
    }

    function getEditorContext() {
        const iframe = document.querySelector('iframe[name="editor-canvas"]') ||
            document.querySelector('.editor-canvas__iframe');
        if (iframe && iframe.contentDocument) {
            const doc = iframe.contentDocument;
            const root = doc.querySelector('.block-editor-writing-flow') ||
                doc.querySelector('.editor-styles-wrapper') ||
                doc.body;
            return { doc, root };
        }
        const doc = document;
        const root = doc.querySelector('.block-editor-writing-flow') ||
            doc.querySelector('.editor-styles-wrapper') ||
            doc.querySelector('.block-editor') ||
            doc.body;
        return { doc, root };
    }

    function hasBlockEditorCanvas() {
        try {
            return !!(
                document.querySelector('iframe[name="editor-canvas"]') ||
                document.querySelector('.editor-canvas__iframe') ||
                document.querySelector('.block-editor-writing-flow') ||
                document.querySelector('.editor-styles-wrapper') ||
                document.querySelector('.block-editor')
            );
        } catch (e) {
            return false;
        }
    }

    function escapeAttributeSelectorValue(value) {
        const normalized = String(value || '');
        if (!normalized) return '';
        const cssApi = typeof CSS !== 'undefined' ? CSS : null;
        if (cssApi && typeof cssApi.escape === 'function') {
            return cssApi.escape(normalized);
        }
        return normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function getEditorBlockElementByClientId(doc, clientId) {
        if (!doc || typeof doc.querySelector !== 'function' || !clientId) return null;
        const escaped = escapeAttributeSelectorValue(clientId);
        if (!escaped) return null;
        const selectors = [
            `[data-block="${escaped}"]`,
            `[data-block-client-id="${escaped}"]`,
            `.block-editor-block-list__block[data-block="${escaped}"]`,
            `.wp-block[data-block="${escaped}"]`
        ];
        for (let i = 0; i < selectors.length; i += 1) {
            const match = doc.querySelector(selectors[i]);
            if (match) return match;
        }
        return null;
    }

    function clearEditorAppliedReveal(doc) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return;
        const flashed = doc.querySelectorAll('.aivi-editor-apply-flash');
        flashed.forEach((node) => node.classList.remove('aivi-editor-apply-flash'));
        if (state.editorRevealCleanupTimer) {
            clearTimeout(state.editorRevealCleanupTimer);
            state.editorRevealCleanupTimer = null;
        }
    }

    function showEditorNotice(message, status) {
        if (!message || !wp || !wp.data || typeof wp.data.dispatch !== 'function') return;
        try {
            const notices = wp.data.dispatch('core/notices');
            if (notices && typeof notices.createNotice === 'function') {
                notices.createNotice(status || 'success', message, {
                    type: 'snackbar',
                    isDismissible: true
                });
            }
        } catch (e) {
        }
    }

    function revealAppliedChangesInEditor(clientIds) {
        const ids = Array.from(new Set((Array.isArray(clientIds) ? clientIds : []).filter(Boolean)));
        if (!ids.length) return false;

        const runReveal = (attempt) => {
            const context = getEditorContext();
            const doc = context && context.doc ? context.doc : null;
            if (!doc) return false;
            const elements = ids
                .map((clientId) => getEditorBlockElementByClientId(doc, clientId))
                .filter(Boolean);

            if (!elements.length) {
                if ((attempt || 0) >= 8) return false;
                const view = doc.defaultView || window;
                if (view && typeof view.requestAnimationFrame === 'function') {
                    view.requestAnimationFrame(() => runReveal((attempt || 0) + 1));
                } else {
                    setTimeout(() => runReveal((attempt || 0) + 1), 40);
                }
                return true;
            }

            clearEditorAppliedReveal(doc);

            try {
                const dispatcher = wp.data.dispatch('core/block-editor');
                if (dispatcher && typeof dispatcher.selectBlock === 'function') {
                    dispatcher.selectBlock(ids[0]);
                }
            } catch (e) {
            }

            elements.forEach((element) => element.classList.add('aivi-editor-apply-flash'));

            const first = elements[0];
            if (first && typeof first.scrollIntoView === 'function') {
                first.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            state.editorRevealCleanupTimer = setTimeout(() => {
                clearEditorAppliedReveal(doc);
            }, 1800);

            return true;
        };

        return runReveal(0);
    }

    function queueOverlayLayoutSync() {
        if (!state.contextDoc || state.overlayLayoutRaf) return;
        const raf = state.contextDoc.defaultView && typeof state.contextDoc.defaultView.requestAnimationFrame === 'function'
            ? state.contextDoc.defaultView.requestAnimationFrame
            : window.requestAnimationFrame;
        state.overlayLayoutRaf = raf(() => {
            state.overlayLayoutRaf = null;
            syncOverlayLayout();
        });
    }

    function syncOverlayLayout() {
        if (!state.overlayPanel || !state.overlayViewport || !state.overlayRail || !state.contextDoc) {
            return;
        }
        const view = state.contextDoc.defaultView || window;
        const viewportLimit = Math.max(520, (view.innerHeight || window.innerHeight || 900) - 28);
        const panelStyles = view.getComputedStyle(state.overlayPanel);
        const contentNode = state.overlayPanel.firstElementChild;
        const contentStyles = contentNode ? view.getComputedStyle(contentNode) : null;
        const panelChrome =
            (parseFloat(panelStyles.borderTopWidth || '0') || 0) +
            (parseFloat(panelStyles.borderBottomWidth || '0') || 0) +
            (contentStyles ? ((parseFloat(contentStyles.paddingTop || '0') || 0) + (parseFloat(contentStyles.paddingBottom || '0') || 0)) : 0);
        const desiredHeight = Math.max(state.overlayRail.scrollHeight, state.overlayViewport.scrollHeight) + panelChrome;
        const resolvedHeight = Math.min(viewportLimit, Math.max(460, Math.ceil(desiredHeight)));
        state.overlayPanel.style.height = `${resolvedHeight}px`;
        syncReviewRailScrollControls();
    }

    function syncReviewRailScrollControls() {
        if (!state.overlayRailViewport || !state.overlayRail) return;
        const viewport = state.overlayRailViewport;
        const controls = state.overlayRail.querySelector('.aivi-overlay-review-scroll-controls');
        const upButton = state.overlayRail.querySelector('[data-rail-scroll="up"]');
        const downButton = state.overlayRail.querySelector('[data-rail-scroll="down"]');
        if (!controls || !upButton || !downButton) return;
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const overflowActive = maxScrollTop > 6;
        controls.hidden = !overflowActive;
        controls.setAttribute('aria-hidden', overflowActive ? 'false' : 'true');
        upButton.disabled = !overflowActive || viewport.scrollTop <= 4;
        downButton.disabled = !overflowActive || viewport.scrollTop >= (maxScrollTop - 4);
    }

    function scrollReviewRail(direction) {
        if (!state.overlayRailViewport) return;
        const viewport = state.overlayRailViewport;
        const delta = Math.max(180, Math.round(viewport.clientHeight * 0.72));
        const top = Math.max(0, viewport.scrollTop + (direction === 'up' ? -delta : delta));
        if (typeof viewport.scrollTo === 'function') {
            viewport.scrollTo({ top, behavior: 'smooth' });
        } else {
            viewport.scrollTop = top;
        }
        const raf = state.contextDoc && state.contextDoc.defaultView && typeof state.contextDoc.defaultView.requestAnimationFrame === 'function'
            ? state.contextDoc.defaultView.requestAnimationFrame
            : window.requestAnimationFrame;
        raf(() => syncReviewRailScrollControls());
    }

    function setOverlayScrollLock(locked) {
        const targets = [];
        const registerTargets = (doc) => {
            if (!doc) return;
            [doc.documentElement, doc.body].forEach((node) => {
                if (!node || targets.some((entry) => entry.node === node)) return;
                targets.push({
                    node,
                    overflow: node.style.overflow || '',
                    overscrollBehavior: node.style.overscrollBehavior || ''
                });
            });
        };

        if (locked) {
            registerTargets(document);
            if (state.contextDoc && state.contextDoc !== document) {
                registerTargets(state.contextDoc);
            }
            state.scrollLockTargets = targets;
            state.scrollLockTargets.forEach((entry) => {
                entry.node.style.overflow = 'hidden';
                entry.node.style.overscrollBehavior = 'none';
            });
            return;
        }

        (state.scrollLockTargets || []).forEach((entry) => {
            if (!entry || !entry.node) return;
            entry.node.style.overflow = entry.overflow;
            entry.node.style.overscrollBehavior = entry.overscrollBehavior;
        });
        state.scrollLockTargets = [];
    }

    function ensureOverlay() {
        const context = getEditorContext();
        if (!context.root || !context.doc) {
            return null;
        }
        if (state.overlayRoot && state.contextDoc && state.contextDoc !== context.doc) {
            detachEscListener();
            detachToolbarStateListeners();
            if (state.blockMenuDismissHandler) {
                state.contextDoc.removeEventListener('click', state.blockMenuDismissHandler);
                state.blockMenuDismissHandler = null;
            }
            if (state.overlayRoot.parentNode) {
                state.overlayRoot.parentNode.removeChild(state.overlayRoot);
            }
            state.overlayRoot = null;
            state.overlayPanel = null;
            state.overlayViewport = null;
            state.overlayContent = null;
            state.overlayRail = null;
            state.overlayRailViewport = null;
            state.overlayDocTitle = null;
            state.blockMenu = null;
            state.blockMenuNodeRef = '';
            state.overlayScrollHandler = null;
            state.overlayRailScrollHandler = null;
        }
        if (state.overlayRoot && state.contextDoc === context.doc && context.doc.contains(state.overlayRoot)) {
            return state.overlayRoot;
        }

        state.contextDoc = context.doc;
        const root = context.root;

        injectStyles(context.doc);

        const overlayRoot = context.doc.createElement('div');
        overlayRoot.id = 'aivi-overlay-root';
        overlayRoot.className = 'aivi-overlay-root';

        const backdrop = context.doc.createElement('div');
        backdrop.className = 'aivi-overlay-backdrop';
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) {
                closeOverlay();
            }
        });

        const panel = context.doc.createElement('div');
        panel.className = 'aivi-overlay-panel';

        const content = context.doc.createElement('div');
        content.className = 'aivi-overlay-content';

        const shell = context.doc.createElement('div');
        shell.className = 'aivi-overlay-shell';

        const rail = context.doc.createElement('aside');
        rail.className = 'aivi-overlay-review-rail';

        const stage = context.doc.createElement('div');
        stage.className = 'aivi-overlay-stage';
        const docHeader = context.doc.createElement('div');
        docHeader.className = 'aivi-overlay-doc-header';
        const docTitle = context.doc.createElement('h1');
        docTitle.className = 'aivi-overlay-doc-title';
        docHeader.appendChild(docTitle);
        const canvas = context.doc.createElement('div');
        canvas.className = 'aivi-overlay-canvas';
        stage.appendChild(docHeader);
        stage.appendChild(canvas);

        shell.appendChild(rail);
        shell.appendChild(stage);
        content.appendChild(shell);

        panel.appendChild(content);
        backdrop.appendChild(panel);
        overlayRoot.appendChild(backdrop);
        (context.doc.body || root).appendChild(overlayRoot);

        state.overlayRoot = overlayRoot;
        state.overlayPanel = panel;
        state.overlayViewport = stage;
        state.overlayContent = canvas;
        state.overlayRail = rail;
        state.overlayRailViewport = null;
        state.overlayShell = shell;
        state.overlayDocTitle = docTitle;
        state.blockMenu = null;
        state.blockMenuNodeRef = '';
        if (!state.inlineDismissHandler) {
            state.inlineDismissHandler = (event) => {
                if (!state.inlinePanel) return;
                const target = event.target;
                if (target && (target.closest('.aivi-overlay-highlight') || target.closest('.aivi-overlay-inline-panel'))) {
                    return;
                }
                hideInlinePanel();
            };
            state.contextDoc.addEventListener('click', state.inlineDismissHandler);
        }
        if (!state.blockMenuDismissHandler) {
            state.blockMenuDismissHandler = (event) => {
                if (!state.blockMenu || state.blockMenu.hidden) return;
                const target = event.target;
                if (target && (target.closest('.aivi-overlay-block-menu') || target.closest('.aivi-overlay-block-handle'))) {
                    return;
                }
                hideBlockMenu();
            };
            state.contextDoc.addEventListener('mousedown', state.blockMenuDismissHandler, true);
        }
        if (!state.overlayScrollHandler && state.overlayViewport) {
            state.overlayScrollHandler = () => {
                if (state.blockMenu && !state.blockMenu.hidden) {
                    hideBlockMenu();
                }
            };
            state.overlayViewport.addEventListener('scroll', state.overlayScrollHandler, { passive: true });
        }
        if (state.overlayRailScrollHandler && state.overlayRailViewport) {
            state.overlayRailViewport.removeEventListener('scroll', state.overlayRailScrollHandler);
            state.overlayRailScrollHandler = null;
        }
        if (!state.overlayResizeHandler) {
            state.overlayResizeHandler = () => queueOverlayLayoutSync();
            (state.contextDoc.defaultView || window).addEventListener('resize', state.overlayResizeHandler, { passive: true });
        }

        return overlayRoot;
    }

    function openOverlay(detail) {
        const root = ensureOverlay();
        if (!root) {
            return;
        }
        state.open = true;
        state.lastReport = detail && detail.report ? detail.report : state.lastReport;
        state.lastManifest = detail && detail.manifest ? detail.manifest : state.lastManifest;
        // NEW: Store overlay content from backend
        state.overlayContentData = detail && detail.overlayContent ? detail.overlayContent : null;
        debugLog('info', 'Overlay release flags', {
            stability_release_mode: isStabilityReleaseModeEnabled()
        });

        const managerStale = Boolean(window.AiviHighlightManager && window.AiviHighlightManager.isStale && window.AiviHighlightManager.isStale());
        state.isStale = isAutoStaleDetectionEnabled() ? managerStale : false;
        state.draftRestoreAttempted = false;
        setOverlayDirty(false);
        root.setAttribute('data-open', 'true');
        setOverlayScrollLock(true);
        const raf = state.contextDoc && state.contextDoc.defaultView && typeof state.contextDoc.defaultView.requestAnimationFrame === 'function'
            ? state.contextDoc.defaultView.requestAnimationFrame
            : window.requestAnimationFrame;
        raf(() => {
            renderBlocks(true);
            queueOverlayLayoutSync();
        });
        attachEscListener();
        attachToolbarStateListeners();
    }

    function closeOverlayInternal() {
        if (!state.overlayRoot) {
            return;
        }
        state.open = false;
        state.overlayApplyRuntime = null;
        if (state.draftSaveTimer) {
            clearTimeout(state.draftSaveTimer);
            state.draftSaveTimer = null;
        }
        setActiveEditableBody(null, '');
        clearJumpFocus(true);
        state.overlayRoot.removeAttribute('data-open');
        hideInlinePanel();
        hideBlockMenu();
        detachEscListener();
        detachToolbarStateListeners();
        if (state.blockMenuDismissHandler && state.contextDoc) {
            state.contextDoc.removeEventListener('mousedown', state.blockMenuDismissHandler, true);
            state.blockMenuDismissHandler = null;
        }
        if (state.overlayScrollHandler && state.overlayViewport) {
            state.overlayViewport.removeEventListener('scroll', state.overlayScrollHandler);
            state.overlayScrollHandler = null;
        }
        if (state.overlayRailScrollHandler && state.overlayRailViewport) {
            state.overlayRailViewport.removeEventListener('scroll', state.overlayRailScrollHandler);
            state.overlayRailScrollHandler = null;
        }
        if (state.overlayResizeHandler) {
            (state.contextDoc && state.contextDoc.defaultView ? state.contextDoc.defaultView : window).removeEventListener('resize', state.overlayResizeHandler);
            state.overlayResizeHandler = null;
        }
        if (state.overlayLayoutRaf && state.contextDoc && state.contextDoc.defaultView && typeof state.contextDoc.defaultView.cancelAnimationFrame === 'function') {
            state.contextDoc.defaultView.cancelAnimationFrame(state.overlayLayoutRaf);
            state.overlayLayoutRaf = null;
        }
        setOverlayScrollLock(false);
        detachBeforeUnloadGuard();
    }

    function hasUnsavedOverlayChanges() {
        return state.overlayDirty === true;
    }

    async function closeOverlay() {
        if (!state.overlayRoot) return false;
        if (hasUnsavedOverlayChanges()) {
            const confirmed = await confirmOverlayCloseDiscard();
            if (!confirmed) {
                setMetaStatus('Close canceled. Copy any edits you want to keep before closing.');
                return false;
            }
            persistOverlayDraft('overlay_close_confirmed');
        }
        closeOverlayInternal();
        return true;
    }

    function attachEscListener() {
        if (state.keyHandler || !state.contextDoc) {
            return;
        }
        state.keyHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeOverlay();
            }
        };
        state.contextDoc.addEventListener('keydown', state.keyHandler);
    }

    function detachEscListener() {
        if (state.keyHandler && state.contextDoc) {
            state.contextDoc.removeEventListener('keydown', state.keyHandler);
        }
        state.keyHandler = null;
    }

    function queueToolbarActiveRefresh() {
        if (!state.contextDoc || state.toolbarRefreshRaf) return;
        const raf = state.contextDoc.defaultView && typeof state.contextDoc.defaultView.requestAnimationFrame === 'function'
            ? state.contextDoc.defaultView.requestAnimationFrame
            : window.requestAnimationFrame;
        state.toolbarRefreshRaf = raf(() => {
            state.toolbarRefreshRaf = null;
            refreshToolbarActiveStates();
        });
    }

    function attachToolbarStateListeners() {
        if (!state.contextDoc || state.toolbarSelectionHandler) return;
        const handler = () => queueToolbarActiveRefresh();
        state.toolbarSelectionHandler = handler;
        state.contextDoc.addEventListener('selectionchange', handler);
        state.contextDoc.addEventListener('keyup', handler, true);
        state.contextDoc.addEventListener('mouseup', handler, true);
        state.contextDoc.addEventListener('focusin', handler, true);
    }

    function detachToolbarStateListeners() {
        if (!state.contextDoc || !state.toolbarSelectionHandler) {
            state.toolbarSelectionHandler = null;
            return;
        }
        state.contextDoc.removeEventListener('selectionchange', state.toolbarSelectionHandler);
        state.contextDoc.removeEventListener('keyup', state.toolbarSelectionHandler, true);
        state.contextDoc.removeEventListener('mouseup', state.toolbarSelectionHandler, true);
        state.contextDoc.removeEventListener('focusin', state.toolbarSelectionHandler, true);
        state.toolbarSelectionHandler = null;
        state.toolbarRefreshRaf = null;
    }

    function getBlocks() {
        if (!select) {
            return [];
        }
        const store = select('core/block-editor');
        if (!store || typeof store.getBlocks !== 'function') {
            return [];
        }
        return store.getBlocks();
    }

    function normalizeText(value) {
        if (typeof value !== 'string') {
            return '';
        }
        return value.replace(/\s+/g, ' ').trim();
    }

    const AGGREGATE_INLINE_MESSAGE_PATTERNS = [
        /\b\d+\s+[a-z0-9_-]+\(s\)/i,
        /\b\d+\s+(heading|paragraph|section|link|image|check|claim)s?\b/i,
        /\b\d+\s+of\s+\d+\b/i,
        /\bother sections?\b/i,
        /\baverage\b/i
    ];
    const INLINE_FALLBACK_VARIANTS = [
        ({ checkName }) => `This highlighted section maps to ${checkName}. Tighten this part so answer engines can extract and cite it more reliably.`,
        ({ checkName }) => `This span is tied to ${checkName}. Improve clarity and supporting detail so retrieval systems can trust it as evidence.`,
        ({ checkName }) => `This segment needs revision for ${checkName}. Make the claim clearer and better supported for machine-readable answers.`,
        ({ checkName }) => `This portion relates to ${checkName}. Refine wording and evidence so AI answer systems can ground citations correctly.`
    ];
    const OVERLAY_FIX_WITH_AI_ENABLED = false;
    const OVERLAY_DRAFT_VERSION = 2;
    const OVERLAY_EDITOR_PERSISTENCE_NOTE = 'Edit inside AiVI, then copy the revised text and paste it into the matching WordPress block. Close this panel anytime to return to the editor.';

    function stableHash(value) {
        const input = String(value || '');
        let hash = 5381;
        for (let i = 0; i < input.length; i += 1) {
            hash = ((hash << 5) + hash) + input.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function buildInlineFallbackMessage(check) {
        const checkName = normalizeText(
            (check && (check.name || check.title || check.check_id || check.id)) || 'this check'
        );
        const seed = `${checkName}:inline-fallback`;
        const idx = stableHash(seed) % INLINE_FALLBACK_VARIANTS.length;
        const builder = INLINE_FALLBACK_VARIANTS[idx];
        const message = typeof builder === 'function'
            ? builder({ checkName })
            : `This highlighted section maps to ${checkName}. Review and tighten it for extraction reliability.`;
        return normalizeText(message);
    }

    function looksAggregateInlineMessage(value) {
        const text = normalizeText(value || '');
        if (!text) return false;
        return AGGREGATE_INLINE_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
    }

    function sanitizeInlineIssueMessage(message, check) {
        const text = normalizeText(message || '');
        if (!looksAggregateInlineMessage(text)) {
            return text;
        }
        return buildInlineFallbackMessage(check);
    }

    function normalizeFixSteps(steps, fallbackStep) {
        let values = [];
        if (Array.isArray(steps)) {
            values = steps;
        } else if (typeof steps === 'string' && steps.trim()) {
            values = [steps];
        }
        const normalized = values
            .map((step) => normalizeText(step || ''))
            .filter(Boolean);
        if (!normalized.length && fallbackStep) {
            const fallback = normalizeText(fallbackStep);
            if (fallback) normalized.push(fallback);
        }
        return normalized.slice(0, 4);
    }

    function resolveExplanationPack(source, fallback) {
        const pack = source && typeof source === 'object' ? source : {};
        const defaults = fallback && typeof fallback === 'object' ? fallback : {};
        const whatFailed = normalizeText(pack.what_failed || defaults.what_failed || '');
        const whyItMatters = normalizeText(pack.why_it_matters || defaults.why_it_matters || '');
        const steps = normalizeFixSteps(
            pack.how_to_fix_steps,
            defaults.how_to_fix_step || defaults.action_suggestion || ''
        );
        const examplePattern = normalizeText(pack.example_pattern || defaults.example_pattern || '');
        const issueExplanation = normalizeText(pack.issue_explanation || defaults.issue_explanation || '');
        return {
            what_failed: whatFailed,
            why_it_matters: whyItMatters,
            how_to_fix_steps: steps,
            example_pattern: examplePattern,
            issue_explanation: issueExplanation
        };
    }

    function stripGuidanceScaffold(value) {
        const text = normalizeText(value || '');
        if (!text) return '';
        return text
            .replace(/\bnext steps:\s*/gi, '')
            .replace(/\buse this pattern:\s*/gi, '')
            .replace(/\breview guidance\.?\s*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function composeIssueExplanationNarrative(pack) {
        if (!pack || typeof pack !== 'object') return '';
        const explicit = stripGuidanceScaffold(pack.issue_explanation || '');
        if (explicit) return explicit;
        const parts = [];
        const whatFailed = normalizeText(pack.what_failed || '');
        const whyItMatters = normalizeText(pack.why_it_matters || '');
        if (whatFailed) parts.push(whatFailed);
        if (whyItMatters) parts.push(whyItMatters);
        const steps = normalizeFixSteps(pack.how_to_fix_steps, '');
        if (steps.length) {
            steps.slice(0, 3).forEach((step) => {
                const sentence = normalizeText(step);
                if (sentence) parts.push(sentence);
            });
        }
        const example = normalizeText(pack.example_pattern || '');
        if (example) {
            parts.push(`For example, ${example}`);
        }
        return normalizeText(parts.join(' '));
    }

    function resolveSchemaAssist(item) {
        return firstObject(
            item && item.schema_assist,
            item && item.check && item.check.schema_assist,
            item && item.highlight && item.highlight.schema_assist
        );
    }

    function getSchemaAssistLabel(schemaKind) {
        const kind = String(schemaKind || '').toLowerCase().trim();
        if (kind === 'article_jsonld') return 'Article JSON-LD';
        if (kind === 'faq_jsonld') return 'FAQ JSON-LD';
        if (kind === 'howto_jsonld') return 'HowTo JSON-LD';
        if (kind === 'itemlist_jsonld') return 'ItemList JSON-LD';
        if (kind === 'intro_schema_jsonld') return 'Intro Schema';
        if (kind === 'schema_alignment_jsonld') return 'Schema Alignment JSON-LD';
        if (kind === 'semantic_markup_plan') return 'Semantic Markup Plan';
        if (kind === 'jsonld_repair') return 'JSON-LD Repair Draft';
        return 'Schema Draft';
    }

    function stringifySchemaDraft(schemaAssist) {
        if (!schemaAssist || typeof schemaAssist !== 'object') return '';
        if (!schemaAssist.draft_jsonld || typeof schemaAssist.draft_jsonld !== 'object') return '';
        try {
            return JSON.stringify(schemaAssist.draft_jsonld, null, 2);
        } catch (e) {
            return '';
        }
    }

    function getSchemaAssistInsertCapability(schemaAssist) {
        const capability = normalizeText(String(schemaAssist && schemaAssist.insert_capability || ''));
        if (capability) return capability;
        if (schemaAssist && schemaAssist.can_insert === true) return 'conflict_aware_insert';
        if (schemaAssist && schemaAssist.can_copy === true) return 'copy_only';
        return 'unavailable';
    }

    function getSchemaAssistBadgeText(schemaAssist) {
        const capability = getSchemaAssistInsertCapability(schemaAssist);
        if (capability === 'conflict_aware_insert') return 'Conflict-aware insert';
        if (capability === 'copy_only') return 'Copy only';
        return 'Unavailable';
    }

    function getSchemaAssistBaseNote(schemaAssist) {
        const schemaKind = normalizeSchemaKind(schemaAssist && schemaAssist.schema_kind);
        const isSemanticMarkupPlan = schemaKind === 'semantic_markup_plan';
        const notes = Array.isArray(schemaAssist && schemaAssist.generation_notes)
            ? schemaAssist.generation_notes.filter(Boolean)
            : [];
        if (notes[0]) return notes[0];
        if (schemaKind === 'jsonld_repair') {
            return 'Copy-only JSON-LD repair draft. Insert is disabled for repair mode.';
        }
        if (getSchemaAssistInsertCapability(schemaAssist) !== 'conflict_aware_insert' && isSemanticMarkupPlan) {
            return 'Copy-only semantic markup plan. Apply these changes in your theme/editor markup.';
        }
        if (getSchemaAssistInsertCapability(schemaAssist) !== 'conflict_aware_insert') {
            return 'Copy-only schema draft for this recommendation.';
        }
        return 'Deterministic schema draft generated from this recommendation. Inserted drafts stay in the editor until you save the post.';
    }

    function joinReadableClauses(clauses) {
        const list = (Array.isArray(clauses) ? clauses : []).filter(Boolean);
        if (!list.length) return '';
        if (list.length === 1) return list[0];
        if (list.length === 2) return `${list[0]} and ${list[1]}`;
        return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
    }

    function buildSchemaAssistPolicySummary(schemaAssist) {
        const capability = getSchemaAssistInsertCapability(schemaAssist);
        if (capability === 'copy_only') {
            return 'Insert behavior: copy only. AiVI will not change editor or external schema blocks for this draft.';
        }
        if (capability !== 'conflict_aware_insert') {
            return 'Insert behavior: unavailable. Copy this draft into your publishing workflow manually.';
        }
        const hints = schemaAssist && schemaAssist.insert_policy_hints && typeof schemaAssist.insert_policy_hints === 'object'
            ? schemaAssist.insert_policy_hints
            : {};
        const clauses = [];
        if (hints.default_insert_action === 'append_new_block') {
            clauses.push('adds a new JSON-LD block when no match exists');
        }
        if (hints.managed_target_action === 'replace_existing_ai_block_when_single_clear_match') {
            clauses.push('updates one clear AiVI-managed match');
        }
        if (hints.exact_match_action === 'no_op_existing_match') {
            clauses.push('skips exact matches');
        }
        if (hints.external_conflict_action === 'copy_only_external_conflict') {
            clauses.push('switches to copy-only when another schema source conflicts');
        }
        if (!clauses.length) {
            return 'Insert behavior: AiVI uses conflict-aware insert rules for this draft.';
        }
        return `Insert behavior: AiVI ${joinReadableClauses(clauses)}.`;
    }

    function setSchemaAssistStatus(statusNode, tone, message) {
        if (!statusNode) return;
        const resolvedMessage = normalizeText(String(message || ''));
        const resolvedTone = normalizeText(String(tone || 'neutral')) || 'neutral';
        statusNode.textContent = resolvedMessage;
        if (resolvedMessage) {
            statusNode.dataset.state = resolvedTone;
        } else if (statusNode.dataset) {
            delete statusNode.dataset.state;
        }
    }

    function normalizeSchemaKind(schemaKind) {
        return String(schemaKind || '').toLowerCase().trim();
    }

    function canInsertSchemaKind(schemaKind) {
        const kind = normalizeSchemaKind(schemaKind);
        return kind === 'article_jsonld'
            || kind === 'faq_jsonld'
            || kind === 'howto_jsonld'
            || kind === 'intro_schema_jsonld'
            || kind === 'itemlist_jsonld'
            || kind === 'schema_alignment_jsonld';
    }

    function isSchemaAssistInsertAllowed(schemaAssist) {
        if (!schemaAssist || typeof schemaAssist !== 'object') return false;
        if (schemaAssist.can_insert !== true) return false;
        return canInsertSchemaKind(schemaAssist.schema_kind);
    }

    function ensureSchemaFingerprintSet() {
        if (!(state.insertedSchemaFingerprints instanceof Set)) {
            state.insertedSchemaFingerprints = new Set();
        }
        return state.insertedSchemaFingerprints;
    }

    function buildSchemaFingerprint(item, schemaAssist, draft) {
        const runId = String(
            (item && item.analysis_ref && item.analysis_ref.run_id)
            || (item && item.check && item.check.analysis_ref && item.check.analysis_ref.run_id)
            || (item && item.highlight && item.highlight.run_id)
            || (state.lastReport && state.lastReport.run_id)
            || ''
        ).trim();
        const checkId = String(
            (item && item.check && item.check.check_id)
            || (item && item.highlight && item.highlight.check_id)
            || ''
        ).trim();
        const schemaKind = normalizeSchemaKind(schemaAssist && schemaAssist.schema_kind);
        const hash = stableHash(String(draft || ''));
        return [runId || 'no_run', checkId || 'no_check', schemaKind || 'unknown_kind', String(hash)].join('|');
    }

    function hasSchemaFingerprint(fingerprint) {
        if (!fingerprint) return false;
        return ensureSchemaFingerprintSet().has(fingerprint);
    }

    function rememberSchemaFingerprint(fingerprint) {
        if (!fingerprint) return;
        ensureSchemaFingerprintSet().add(fingerprint);
    }

    const AIVI_SCHEMA_BLOCK_MARKER = 'AIVI_SCHEMA_ASSIST';

    function buildManagedSchemaMarker(schemaAssist, fingerprint) {
        const payload = {
            schema_kind: normalizeSchemaKind(schemaAssist && schemaAssist.schema_kind),
            fingerprint: String(fingerprint || '').trim()
        };
        return `<!-- ${AIVI_SCHEMA_BLOCK_MARKER} ${JSON.stringify(payload)} -->`;
    }

    function parseManagedSchemaMarker(content) {
        const source = String(content || '');
        if (!source) return null;
        const match = source.match(/<!--\s*AIVI_SCHEMA_ASSIST\s+({[\s\S]*?})\s*-->/i);
        if (!match || !match[1]) return null;
        try {
            const payload = JSON.parse(match[1]);
            if (!payload || typeof payload !== 'object') return null;
            return {
                schema_kind: normalizeSchemaKind(payload.schema_kind),
                fingerprint: String(payload.fingerprint || '').trim()
            };
        } catch (e) {
            return null;
        }
    }

    function extractJsonLdScriptContents(content) {
        const source = String(content || '');
        if (!source) return [];
        const pattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig;
        const matches = [];
        let match;
        while ((match = pattern.exec(source)) !== null) {
            const raw = String(match[1] || '').trim();
            if (raw) {
                matches.push(raw);
            }
        }
        return matches;
    }

    function normalizeJsonLdObjects(value) {
        if (!value || typeof value !== 'object') return [];
        if (Array.isArray(value)) {
            return value.flatMap((entry) => normalizeJsonLdObjects(entry));
        }
        const graphEntries = Array.isArray(value['@graph'])
            ? value['@graph'].flatMap((entry) => normalizeJsonLdObjects(entry))
            : [];
        return graphEntries.length ? graphEntries : [value];
    }

    function extractJsonLdSchemaTypes(value) {
        const source = value && typeof value === 'object' ? value['@type'] : null;
        const rawTypes = Array.isArray(source) ? source : [source];
        return rawTypes
            .map((item) => normalizeText(String(item || '')))
            .filter(Boolean);
    }

    function collectNamedValues(list, keyResolver, limit) {
        const maxItems = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 8;
        const seen = new Set();
        const output = [];
        (Array.isArray(list) ? list : []).forEach((item) => {
            if (output.length >= maxItems) return;
            const value = normalizeText(String(keyResolver(item) || ''));
            const key = value.toLowerCase();
            if (!value || seen.has(key)) return;
            seen.add(key);
            output.push(value);
        });
        return output;
    }

    function buildJsonLdComparisonSignature(jsonldObject) {
        const normalizedObjects = normalizeJsonLdObjects(jsonldObject);
        const primaryObject = normalizedObjects[0] || null;
        const schemaTypes = primaryObject ? extractJsonLdSchemaTypes(primaryObject) : [];
        const nameOrHeadline = primaryObject
            ? normalizeText(String(primaryObject.headline || primaryObject.name || primaryObject.alternateName || ''))
            : '';
        const url = primaryObject ? normalizeText(String(primaryObject.url || '')) : '';
        const mainEntityOfPage = primaryObject
            ? normalizeText(String(primaryObject.mainEntityOfPage || primaryObject.mainEntityofpage || ''))
            : '';
        const faqQuestionNames = primaryObject && Array.isArray(primaryObject.mainEntity)
            ? collectNamedValues(primaryObject.mainEntity, (entry) => entry && entry.name, 8)
            : [];
        const howToStepNames = primaryObject && Array.isArray(primaryObject.step)
            ? collectNamedValues(primaryObject.step, (entry) => entry && (entry.name || entry.text), 12)
            : [];
        const itemListItemNames = primaryObject && Array.isArray(primaryObject.itemListElement)
            ? collectNamedValues(primaryObject.itemListElement, (entry) => entry && (entry.name || (entry.item && entry.item.name)), 12)
            : [];
        return {
            schema_types: schemaTypes,
            primary_schema_type: schemaTypes[0] || '',
            name_or_headline: nameOrHeadline,
            url,
            main_entity_of_page: mainEntityOfPage,
            faq_question_names: faqQuestionNames,
            howto_step_names: howToStepNames,
            itemlist_item_names: itemListItemNames
        };
    }

    function getBlockHtmlContent(block) {
        if (!block || typeof block !== 'object') return '';
        const attrs = block.attributes && typeof block.attributes === 'object' ? block.attributes : {};
        return String(attrs.content || attrs.html || '');
    }

    function buildEditorSchemaBlockEntry(block) {
        if (!block || typeof block !== 'object') return null;
        const blockName = normalizeText(String(block.name || block.blockName || ''));
        if (blockName !== 'core/html') return null;
        const content = getBlockHtmlContent(block);
        const scripts = extractJsonLdScriptContents(content);
        if (!scripts.length) return null;

        const marker = parseManagedSchemaMarker(content);
        const parsedScripts = scripts.map((scriptContent) => {
            try {
                const parsed = JSON.parse(scriptContent);
                return {
                    valid: true,
                    parsed,
                    signature: buildJsonLdComparisonSignature(parsed),
                    content_hash: buildCanonicalJsonHash(parsed)
                };
            } catch (e) {
                return {
                    valid: false,
                    parsed: null,
                    signature: null,
                    content_hash: ''
                };
            }
        });

        return {
            source: 'editor_block',
            management: marker ? 'aivi_managed' : 'manual',
            client_id: String(block.clientId || '').trim(),
            block_name: blockName,
            marker: marker || null,
            script_count: scripts.length,
            valid_script_count: parsedScripts.filter((entry) => entry.valid === true).length,
            invalid_script_count: parsedScripts.filter((entry) => entry.valid !== true).length,
            signatures: parsedScripts.filter((entry) => entry.signature).map((entry) => entry.signature),
            content_hashes: parsedScripts.map((entry) => String(entry.content_hash || '')).filter(Boolean)
        };
    }

    function collectExistingEditorSchemaBlocks(blocksInput) {
        const blocks = Array.isArray(blocksInput) ? blocksInput : getBlocks();
        return blocks
            .map((block) => buildEditorSchemaBlockEntry(block))
            .filter(Boolean);
    }

    function summarizeExistingEditorSchemaBlocks(entries) {
        const list = Array.isArray(entries) ? entries : [];
        return {
            total: list.length,
            aivi_managed_total: list.filter((entry) => entry.management === 'aivi_managed').length,
            manual_total: list.filter((entry) => entry.management === 'manual').length,
            valid_total: list.reduce((sum, entry) => sum + Number(entry.valid_script_count || 0), 0),
            invalid_total: list.reduce((sum, entry) => sum + Number(entry.invalid_script_count || 0), 0)
        };
    }

    function normalizeSchemaTypeValue(value) {
        return normalizeText(String(value || '')).toLowerCase();
    }

    function buildCanonicalJsonHash(value) {
        if (!value || typeof value !== 'object') return '';
        try {
            return stableHash(JSON.stringify(value, null, 2));
        } catch (e) {
            return '';
        }
    }

    function buildRenderedManifestSchemaEntries(manifest) {
        const entries = manifest && Array.isArray(manifest.jsonld) ? manifest.jsonld : [];
        return entries.map((entry) => {
            if (!entry || entry.valid === false) return null;
            const parsed = entry.parsed && typeof entry.parsed === 'object'
                ? entry.parsed
                : (entry.content && typeof entry.content === 'object' ? entry.content : null);
            if (!parsed) return null;
            return {
                source: 'rendered_page',
                management: 'external',
                signatures: normalizeJsonLdObjects(parsed).map((objectValue) => buildJsonLdComparisonSignature(objectValue)),
                content_hash: buildCanonicalJsonHash(parsed)
            };
        }).filter(Boolean);
    }

    function summarizeRenderedManifestSchemaEntries(entries) {
        const list = Array.isArray(entries) ? entries : [];
        return {
            total: list.length,
            valid_total: list.filter((entry) => entry && entry.content_hash).length
        };
    }

    function normalizeSignatureValue(value) {
        return normalizeText(String(value || '')).toLowerCase();
    }

    function countNormalizedOverlap(leftValues, rightValues) {
        const left = new Set((Array.isArray(leftValues) ? leftValues : []).map((value) => normalizeSignatureValue(value)).filter(Boolean));
        const right = new Set((Array.isArray(rightValues) ? rightValues : []).map((value) => normalizeSignatureValue(value)).filter(Boolean));
        let overlap = 0;
        left.forEach((value) => {
            if (right.has(value)) overlap += 1;
        });
        return overlap;
    }

    function buildSignatureTypeSet(signature) {
        return new Set((Array.isArray(signature && signature.schema_types) ? signature.schema_types : [])
            .map((type) => normalizeSchemaTypeValue(type))
            .filter(Boolean));
    }

    function isArticleSchemaType(type) {
        return type === 'article' || type === 'blogposting' || type === 'newsarticle';
    }

    function areSchemaTypesCompatible(draftSignature, candidateSignature) {
        const draftTypes = buildSignatureTypeSet(draftSignature);
        const candidateTypes = buildSignatureTypeSet(candidateSignature);
        if (!draftTypes.size || !candidateTypes.size) return false;

        for (const type of draftTypes) {
            if (candidateTypes.has(type)) return true;
        }

        const draftHasArticleFamily = Array.from(draftTypes).some((type) => isArticleSchemaType(type));
        const candidateHasArticleFamily = Array.from(candidateTypes).some((type) => isArticleSchemaType(type));
        return draftHasArticleFamily && candidateHasArticleFamily;
    }

    function hasSignatureAnchorMatch(draftSignature, candidateSignature) {
        const draftUrls = [
            normalizeSignatureValue(draftSignature && draftSignature.url),
            normalizeSignatureValue(draftSignature && draftSignature.main_entity_of_page)
        ].filter(Boolean);
        const candidateUrls = new Set([
            normalizeSignatureValue(candidateSignature && candidateSignature.url),
            normalizeSignatureValue(candidateSignature && candidateSignature.main_entity_of_page)
        ].filter(Boolean));
        if (draftUrls.some((value) => candidateUrls.has(value))) {
            return true;
        }

        const draftName = normalizeSignatureValue(draftSignature && draftSignature.name_or_headline);
        const candidateName = normalizeSignatureValue(candidateSignature && candidateSignature.name_or_headline);
        if (draftName && candidateName && draftName === candidateName) {
            return true;
        }

        if (countNormalizedOverlap(draftSignature && draftSignature.faq_question_names, candidateSignature && candidateSignature.faq_question_names) >= 2) {
            return true;
        }
        if (countNormalizedOverlap(draftSignature && draftSignature.howto_step_names, candidateSignature && candidateSignature.howto_step_names) >= 2) {
            return true;
        }
        if (countNormalizedOverlap(draftSignature && draftSignature.itemlist_item_names, candidateSignature && candidateSignature.itemlist_item_names) >= 2) {
            return true;
        }

        return false;
    }

    function findMatchingSchemaSignature(entries, predicate) {
        const list = Array.isArray(entries) ? entries : [];
        for (let index = 0; index < list.length; index += 1) {
            const entry = list[index];
            const signatures = Array.isArray(entry && entry.signatures) ? entry.signatures : [];
            for (let sigIndex = 0; sigIndex < signatures.length; sigIndex += 1) {
                const signature = signatures[sigIndex];
                if (predicate(entry, signature)) {
                    return { entry, signature };
                }
            }
        }
        return null;
    }

    function resolveSchemaInsertPolicy(schemaAssist, canonicalDraft, draftSignature, draftHash) {
        const schemaKind = normalizeSchemaKind(schemaAssist && schemaAssist.schema_kind);
        const editorEntries = collectExistingEditorSchemaBlocks();
        const manifestEntries = buildRenderedManifestSchemaEntries(state.lastManifest);
        const editorSummary = summarizeExistingEditorSchemaBlocks(editorEntries);
        const manifestSummary = summarizeRenderedManifestSchemaEntries(manifestEntries);
        const summary = {
            existing_editor_schema_total: editorSummary.total,
            existing_editor_aivi_schema_total: editorSummary.aivi_managed_total,
            existing_editor_manual_schema_total: editorSummary.manual_total,
            existing_rendered_schema_total: manifestSummary.total
        };

        const identicalEditorMatch = findMatchingSchemaSignature(editorEntries, (entry) => {
            return Array.isArray(entry && entry.content_hashes) && entry.content_hashes.includes(draftHash);
        });
        if (identicalEditorMatch) {
            return {
                action: 'no_op_existing_match',
                summary
            };
        }

        const compatibleManagedEntries = (Array.isArray(editorEntries) ? editorEntries : []).filter((entry) => {
            if (!entry || entry.management !== 'aivi_managed') return false;
            if (normalizeSchemaKind(entry.marker && entry.marker.schema_kind) !== schemaKind) return false;
            return Array.isArray(entry.signatures) && entry.signatures.some((signature) =>
                areSchemaTypesCompatible(draftSignature, signature) && hasSignatureAnchorMatch(draftSignature, signature)
            );
        });

        if (compatibleManagedEntries.length === 1) {
            return {
                action: 'replace_existing_ai_block',
                target: compatibleManagedEntries[0],
                summary
            };
        }

        if (compatibleManagedEntries.length > 1) {
            return {
                action: 'copy_only_external_conflict',
                reason: 'multiple_aivi_targets',
                summary
            };
        }

        const manualEditorConflict = findMatchingSchemaSignature(editorEntries, (entry, signature) => {
            if (!entry || entry.management !== 'manual') return false;
            return areSchemaTypesCompatible(draftSignature, signature) && hasSignatureAnchorMatch(draftSignature, signature);
        });
        if (manualEditorConflict) {
            return {
                action: 'copy_only_external_conflict',
                reason: 'manual_editor_conflict',
                summary
            };
        }

        const renderedConflict = findMatchingSchemaSignature(manifestEntries, (_entry, signature) => {
            return areSchemaTypesCompatible(draftSignature, signature) && hasSignatureAnchorMatch(draftSignature, signature);
        });
        if (renderedConflict) {
            return {
                action: 'copy_only_external_conflict',
                reason: 'rendered_schema_conflict',
                summary
            };
        }

        return {
            action: 'append_new_block',
            summary
        };
    }

    function buildSchemaScriptTag(draft, schemaAssist, fingerprint) {
        const safeDraft = String(draft || '').replace(/<\/script/gi, '<\\/script');
        const marker = buildManagedSchemaMarker(schemaAssist, fingerprint);
        return `${marker}\n<script type="application/ld+json">\n${safeDraft}\n</script>`;
    }

    function buildSchemaConflictStatusMessage(reason) {
        if (reason === 'multiple_aivi_targets') {
            return 'Conflict detected. More than one AiVI-managed schema block matches this draft, so insert is blocked.';
        }
        return 'Conflict detected. Another schema source already covers this area, so this draft is copy-only.';
    }

    function buildSchemaInsertReadiness(item, schemaAssist, draftInput) {
        const rawDraft = String(draftInput || stringifySchemaDraft(schemaAssist)).trim();
        if (!rawDraft) {
            return {
                tone: 'error',
                message: 'Nothing to insert yet. Generate schema first.',
                insertLabel: 'Insert schema',
                allowInsert: false
            };
        }

        let parsed;
        try {
            parsed = JSON.parse(rawDraft);
        } catch (e) {
            return {
                tone: 'error',
                message: 'Schema draft is invalid JSON. Regenerate and try again.',
                insertLabel: 'Insert schema',
                allowInsert: false
            };
        }

        const canonicalDraft = JSON.stringify(parsed, null, 2);
        const fingerprint = buildSchemaFingerprint(item, schemaAssist, canonicalDraft);
        const draftHash = buildCanonicalJsonHash(parsed);
        const draftSignature = buildJsonLdComparisonSignature(parsed);
        const insertPolicy = resolveSchemaInsertPolicy(schemaAssist, canonicalDraft, draftSignature, draftHash);

        if (insertPolicy.action === 'no_op_existing_match') {
            return {
                tone: 'blocked',
                message: 'Already present. Equivalent schema already exists in the editor.',
                insertLabel: 'Already present',
                allowInsert: false,
                fingerprint,
                insertPolicy
            };
        }

        if (insertPolicy.action === 'copy_only_external_conflict') {
            return {
                tone: 'blocked',
                message: buildSchemaConflictStatusMessage(insertPolicy.reason),
                insertLabel: 'Insert blocked',
                allowInsert: false,
                fingerprint,
                insertPolicy
            };
        }

        if (hasSchemaFingerprint(fingerprint)) {
            return {
                tone: 'blocked',
                message: 'Inserted earlier in this run/session. AiVI will skip a duplicate block.',
                insertLabel: 'Already inserted',
                allowInsert: false,
                fingerprint,
                insertPolicy
            };
        }

        if (insertPolicy.action === 'replace_existing_ai_block') {
            return {
                tone: 'ready',
                message: 'Ready to update. AiVI will replace one matching AiVI-managed schema block in the editor.',
                insertLabel: 'Replace AiVI block',
                allowInsert: true,
                fingerprint,
                insertPolicy
            };
        }

        return {
            tone: 'ready',
            message: 'Ready to insert. AiVI will add a new JSON-LD block at the end of the editor.',
            insertLabel: 'Insert new block',
            allowInsert: true,
            fingerprint,
            insertPolicy
        };
    }

    function syncSchemaInsertButton(insertBtn, schemaInsertAllowed, readiness) {
        if (!insertBtn) return;
        insertBtn.textContent = 'Insert schema';
        insertBtn.disabled = true;
        insertBtn.hidden = !schemaInsertAllowed;
        if (!schemaInsertAllowed || !readiness) {
            return;
        }
        insertBtn.textContent = readiness.insertLabel || 'Insert schema';
        insertBtn.disabled = readiness.allowInsert !== true;
    }

    function buildSchemaInsertResultPresentation(result) {
        if (!result || typeof result !== 'object') {
            return {
                tone: 'error',
                message: 'Insert failed. Please copy and add schema manually.',
                metaMessage: 'Schema insert failed.'
            };
        }
        if (result.ok) {
            if (result.code === 'replace_existing_ai_block') {
                return {
                    tone: 'success',
                    message: 'Replaced existing AiVI-managed schema block in the editor. Save the post to publish it live.',
                    metaMessage: 'Schema replaced in editor. Save the post to make it live.'
                };
            }
            return {
                tone: 'success',
                message: 'Inserted new JSON-LD block at the end of the editor. Save the post to publish it live.',
                metaMessage: 'Schema inserted into editor. Save the post to make it live.'
            };
        }
        if (result.code === 'duplicate') {
            return {
                tone: 'blocked',
                message: 'Inserted earlier in this run/session. AiVI skipped a duplicate block.',
                metaMessage: 'Schema already present from this run.'
            };
        }
        if (result.code === 'no_op_existing_match') {
            return {
                tone: 'blocked',
                message: 'Already present. Equivalent schema already exists in the editor.',
                metaMessage: 'Equivalent schema already present.'
            };
        }
        if (result.code === 'copy_only_external_conflict') {
            return {
                tone: 'blocked',
                message: buildSchemaConflictStatusMessage(result.reason),
                metaMessage: 'Schema insert blocked by existing schema.'
            };
        }
        if (result.code === 'invalid_json') {
            return {
                tone: 'error',
                message: 'Schema draft is invalid JSON. Regenerate and try again.',
                metaMessage: 'Schema draft is invalid JSON.'
            };
        }
        if (result.code === 'editor_unavailable' || result.code === 'insert_unavailable') {
            return {
                tone: 'error',
                message: 'Editor insert API unavailable. Copy the schema manually.',
                metaMessage: 'Schema insert API unavailable.'
            };
        }
        return {
            tone: 'error',
            message: 'Insert failed. Please copy and add schema manually.',
            metaMessage: 'Schema insert failed.'
        };
    }

    function insertSchemaAssistIntoEditor(item, schemaAssist, draftInput) {
        if (!isSchemaAssistInsertAllowed(schemaAssist)) {
            return { ok: false, code: 'not_insertable' };
        }

        const rawDraft = String(draftInput || stringifySchemaDraft(schemaAssist)).trim();
        if (!rawDraft) {
            return { ok: false, code: 'empty_draft' };
        }

        let parsed;
        try {
            parsed = JSON.parse(rawDraft);
        } catch (e) {
            return { ok: false, code: 'invalid_json' };
        }
        const canonicalDraft = JSON.stringify(parsed, null, 2);
        const fingerprint = buildSchemaFingerprint(item, schemaAssist, canonicalDraft);
        const draftHash = buildCanonicalJsonHash(parsed);
        const draftSignature = buildJsonLdComparisonSignature(parsed);
        const insertPolicy = resolveSchemaInsertPolicy(schemaAssist, canonicalDraft, draftSignature, draftHash);
        const policySummary = insertPolicy && insertPolicy.summary ? insertPolicy.summary : {};
        if (insertPolicy.action === 'no_op_existing_match') {
            emitHighlightTelemetry('overlay_schema_insert_blocked_existing_match', {
                run_id: (state.lastReport && state.lastReport.run_id) || '',
                check_id: item && item.check ? item.check.check_id || '' : '',
                schema_kind: normalizeSchemaKind(schemaAssist.schema_kind),
                fingerprint,
                ...policySummary
            });
            return { ok: false, code: 'no_op_existing_match', fingerprint, reason: insertPolicy.reason || '' };
        }
        if (insertPolicy.action === 'copy_only_external_conflict') {
            emitHighlightTelemetry('overlay_schema_insert_blocked_conflict', {
                run_id: (state.lastReport && state.lastReport.run_id) || '',
                check_id: item && item.check ? item.check.check_id || '' : '',
                schema_kind: normalizeSchemaKind(schemaAssist.schema_kind),
                fingerprint,
                reason: insertPolicy.reason || 'schema_conflict',
                ...policySummary
            });
            return { ok: false, code: 'copy_only_external_conflict', fingerprint, reason: insertPolicy.reason || '' };
        }
        if (hasSchemaFingerprint(fingerprint)) {
            emitHighlightTelemetry('overlay_schema_insert_blocked_duplicate', {
                run_id: (state.lastReport && state.lastReport.run_id) || '',
                check_id: item && item.check ? item.check.check_id || '' : '',
                schema_kind: normalizeSchemaKind(schemaAssist.schema_kind),
                fingerprint,
                ...policySummary
            });
            return { ok: false, code: 'duplicate', fingerprint };
        }

        if (!wp || !wp.blocks || typeof wp.blocks.createBlock !== 'function' || !wp.data || !wp.data.dispatch) {
            return { ok: false, code: 'editor_unavailable' };
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.insertBlocks !== 'function') {
            return { ok: false, code: 'insert_unavailable' };
        }

        const block = wp.blocks.createBlock('core/html', {
            content: buildSchemaScriptTag(canonicalDraft, schemaAssist, fingerprint)
        });
        if (!block) {
            return { ok: false, code: 'block_create_failed' };
        }

        try {
            if (insertPolicy.action === 'replace_existing_ai_block') {
                const targetClientId = insertPolicy.target && insertPolicy.target.client_id
                    ? String(insertPolicy.target.client_id).trim()
                    : '';
                if (!targetClientId) {
                    return { ok: false, code: 'insert_failed' };
                }
                if (typeof dispatcher.updateBlockAttributes === 'function') {
                    dispatcher.updateBlockAttributes(targetClientId, {
                        content: buildSchemaScriptTag(canonicalDraft, schemaAssist, fingerprint)
                    });
                } else if (typeof dispatcher.replaceBlocks === 'function') {
                    dispatcher.replaceBlocks(targetClientId, block);
                } else {
                    return { ok: false, code: 'insert_unavailable' };
                }
                rememberSchemaFingerprint(fingerprint);
                emitHighlightTelemetry('overlay_schema_replaced', {
                    run_id: (state.lastReport && state.lastReport.run_id) || '',
                    check_id: item && item.check ? item.check.check_id || '' : '',
                    schema_kind: normalizeSchemaKind(schemaAssist.schema_kind),
                    fingerprint,
                    target_client_id: targetClientId,
                    ...policySummary
                });
                return { ok: true, code: 'replace_existing_ai_block', fingerprint };
            }

            const blocks = getBlocks();
            const insertIndex = Array.isArray(blocks) ? blocks.length : undefined;
            if (Number.isFinite(insertIndex)) {
                dispatcher.insertBlocks([block], insertIndex);
            } else {
                dispatcher.insertBlocks([block]);
            }
            rememberSchemaFingerprint(fingerprint);
            emitHighlightTelemetry('overlay_schema_inserted', {
                run_id: (state.lastReport && state.lastReport.run_id) || '',
                check_id: item && item.check ? item.check.check_id || '' : '',
                schema_kind: normalizeSchemaKind(schemaAssist.schema_kind),
                insert_index: Number.isFinite(insertIndex) ? insertIndex : -1,
                fingerprint,
                ...policySummary
            });
            return { ok: true, code: 'inserted', fingerprint };
        } catch (e) {
            emitHighlightTelemetry('overlay_schema_insert_failed', {
                run_id: (state.lastReport && state.lastReport.run_id) || '',
                check_id: item && item.check ? item.check.check_id || '' : '',
                schema_kind: normalizeSchemaKind(schemaAssist.schema_kind),
                reason: e && e.message ? e.message : 'insert_failed',
                ...policySummary
            });
            return { ok: false, code: 'insert_failed' };
        }
    }

    function buildExplanationPackNode(pack, extraClass) {
        if (!state.contextDoc || !pack || typeof pack !== 'object') return null;
        const narrative = composeIssueExplanationNarrative(pack);
        if (!narrative) return null;

        const wrap = state.contextDoc.createElement('div');
        wrap.className = `aivi-overlay-guidance ${extraClass || ''}`.trim();
        const body = state.contextDoc.createElement('div');
        body.className = 'aivi-overlay-guidance-text';
        body.textContent = narrative;
        wrap.appendChild(body);
        return wrap;
    }

    function buildReviewRailSchemaAssistNode(item) {
        if (!state.contextDoc || !item || typeof item !== 'object') return null;
        const schemaAssist = resolveSchemaAssist(item);
        if (!schemaAssist) return null;

        const schemaKind = normalizeSchemaKind(schemaAssist.schema_kind);
        const isSemanticMarkupPlan = schemaKind === 'semantic_markup_plan';
        const schemaInsertAllowed = isSchemaAssistInsertAllowed(schemaAssist);

        const wrap = state.contextDoc.createElement('div');
        wrap.className = 'aivi-overlay-review-schema-assist';

        const head = state.contextDoc.createElement('div');
        head.className = 'aivi-overlay-review-schema-head';

        const titleWrap = state.contextDoc.createElement('div');
        titleWrap.className = 'aivi-overlay-review-schema-title-wrap';
        const title = state.contextDoc.createElement('div');
        title.className = 'aivi-overlay-review-schema-title';
        title.textContent = `${getSchemaAssistLabel(schemaAssist.schema_kind)} available`;
        titleWrap.appendChild(title);

        const badge = state.contextDoc.createElement('div');
        badge.className = 'aivi-overlay-review-schema-badge';
        badge.dataset.mode = getSchemaAssistInsertCapability(schemaAssist);
        badge.textContent = getSchemaAssistBadgeText(schemaAssist);

        head.appendChild(titleWrap);
        head.appendChild(badge);
        wrap.appendChild(head);

        const note = state.contextDoc.createElement('div');
        note.className = 'aivi-overlay-review-schema-note';
        note.textContent = getSchemaAssistBaseNote(schemaAssist);
        wrap.appendChild(note);

        const policy = state.contextDoc.createElement('div');
        policy.className = 'aivi-overlay-review-schema-policy';
        policy.textContent = buildSchemaAssistPolicySummary(schemaAssist);
        wrap.appendChild(policy);

        const actions = state.contextDoc.createElement('div');
        actions.className = 'aivi-overlay-review-schema-actions';

        const generateBtn = state.contextDoc.createElement('button');
        generateBtn.type = 'button';
        generateBtn.className = 'aivi-overlay-review-btn primary';
        generateBtn.textContent = isSemanticMarkupPlan ? 'Generate markup' : 'Generate schema';

        const copyBtn = state.contextDoc.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'aivi-overlay-review-btn';
        copyBtn.textContent = isSemanticMarkupPlan ? 'Copy markup' : 'Copy schema';
        copyBtn.disabled = true;

        const insertBtn = state.contextDoc.createElement('button');
        insertBtn.type = 'button';
        insertBtn.className = 'aivi-overlay-review-btn';
        insertBtn.textContent = 'Insert schema';
        insertBtn.disabled = true;
        insertBtn.hidden = !schemaInsertAllowed;

        actions.appendChild(generateBtn);
        actions.appendChild(copyBtn);
        if (schemaInsertAllowed) {
            actions.appendChild(insertBtn);
        }
        wrap.appendChild(actions);

        const preview = state.contextDoc.createElement('textarea');
        preview.className = 'aivi-overlay-review-schema-preview';
        preview.hidden = true;
        preview.readOnly = true;
        preview.setAttribute('spellcheck', 'false');
        wrap.appendChild(preview);

        const status = state.contextDoc.createElement('div');
        status.className = 'aivi-overlay-review-schema-status';
        wrap.appendChild(status);

        generateBtn.addEventListener('click', () => {
            const draft = stringifySchemaDraft(schemaAssist);
            if (!draft) {
                setSchemaAssistStatus(status, 'error', isSemanticMarkupPlan
                    ? 'No deterministic markup plan could be generated for this issue.'
                    : 'No deterministic schema draft could be generated for this issue.');
                return;
            }
            preview.value = draft;
            preview.hidden = false;
            copyBtn.disabled = schemaAssist.can_copy !== true;
            if (schemaInsertAllowed) {
                const readiness = buildSchemaInsertReadiness(item, schemaAssist, draft);
                syncSchemaInsertButton(insertBtn, schemaInsertAllowed, readiness);
                setSchemaAssistStatus(status, readiness.tone, readiness.message);
            } else {
                setSchemaAssistStatus(status, 'ready', isSemanticMarkupPlan
                    ? 'Markup plan generated. Review it, then copy.'
                    : 'Schema draft generated. Review it, then copy.');
            }
            generateBtn.textContent = isSemanticMarkupPlan ? 'Refresh markup' : 'Refresh schema';
        });

        copyBtn.addEventListener('click', () => {
            const draft = preview.value || stringifySchemaDraft(schemaAssist);
            if (!draft) {
                setSchemaAssistStatus(status, 'error', isSemanticMarkupPlan
                    ? 'Nothing to copy yet. Generate the markup plan first.'
                    : 'Nothing to copy yet. Generate the schema first.');
                return;
            }
            if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
                setSchemaAssistStatus(status, 'error', 'Clipboard is not available in this browser context.');
                return;
            }
            navigator.clipboard.writeText(draft).then(() => {
                setSchemaAssistStatus(status, 'success', isSemanticMarkupPlan
                    ? 'Markup plan copied to clipboard.'
                    : 'Schema copied to clipboard.');
            }).catch(() => {
                setSchemaAssistStatus(status, 'error', 'Copy failed. Please copy the draft manually.');
            });
        });

        if (schemaInsertAllowed) {
            insertBtn.addEventListener('click', () => {
                const draft = preview.value || stringifySchemaDraft(schemaAssist);
                if (!draft) {
                    setSchemaAssistStatus(status, 'error', 'Nothing to insert yet. Generate the schema first.');
                    return;
                }
                const result = insertSchemaAssistIntoEditor(item, schemaAssist, draft);
                const presentation = buildSchemaInsertResultPresentation(result);
                if (result.ok) {
                    insertBtn.disabled = true;
                    insertBtn.textContent = result.code === 'replace_existing_ai_block' ? 'Replaced' : 'Inserted';
                    setSchemaAssistStatus(status, presentation.tone, presentation.message);
                    setOverlayDirty(true);
                    scheduleOverlayDraftSave('review_rail_schema_insert');
                    setMetaStatus(presentation.metaMessage);
                    renderBlocks(true);
                    return;
                }
                if (result.code === 'duplicate'
                    || result.code === 'no_op_existing_match'
                    || result.code === 'copy_only_external_conflict') {
                    const readiness = buildSchemaInsertReadiness(item, schemaAssist, draft);
                    syncSchemaInsertButton(insertBtn, schemaInsertAllowed, readiness);
                } else {
                    syncSchemaInsertButton(insertBtn, schemaInsertAllowed, null);
                }
                setSchemaAssistStatus(status, presentation.tone, presentation.message);
            });
        }

        return wrap;
    }

    function buildReviewRailMetadataNode(item) {
        if (!state.contextDoc || !item || typeof item !== 'object') return null;
        if (String(item.check_id || '').trim() !== 'metadata_checks') return null;

        const post = readEditorPost();
        const postId = post && post.id ? Number(post.id) : 0;

        const wrap = state.contextDoc.createElement('div');
        wrap.className = 'aivi-overlay-review-metadata';

        const head = state.contextDoc.createElement('div');
        head.className = 'aivi-overlay-review-metadata-head';
        const title = state.contextDoc.createElement('div');
        title.className = 'aivi-overlay-review-metadata-title';
        title.textContent = 'Document metadata';
        const badge = state.contextDoc.createElement('div');
        badge.className = 'aivi-overlay-review-metadata-badge';
        badge.textContent = 'Manual';
        head.appendChild(title);
        head.appendChild(badge);
        wrap.appendChild(head);

        const note = state.contextDoc.createElement('div');
        note.className = 'aivi-overlay-review-metadata-note';
        note.textContent = 'Fill in the missing document metadata here. These values are saved with the post and reused by future analysis runs.';
        wrap.appendChild(note);

        const form = state.contextDoc.createElement('div');
        form.className = 'aivi-overlay-review-metadata-form';

        const buildField = (labelText, tagName, className, inputType) => {
            const field = state.contextDoc.createElement('label');
            field.className = 'aivi-overlay-review-metadata-field';
            const label = state.contextDoc.createElement('span');
            label.className = 'aivi-overlay-review-metadata-label';
            label.textContent = labelText;
            const control = state.contextDoc.createElement(tagName);
            control.className = `aivi-overlay-review-metadata-input ${className || ''}`.trim();
            if (inputType) control.type = inputType;
            field.appendChild(label);
            field.appendChild(control);
            form.appendChild(field);
            return control;
        };

        const titleInput = buildField('Meta title', 'input', 'is-title', 'text');
        const descriptionInput = buildField('Meta description', 'textarea', 'is-description');
        descriptionInput.rows = 4;
        const canonicalInput = buildField('Canonical URL', 'input', 'is-canonical', 'url');
        const langInput = buildField('Language', 'input', 'is-lang', 'text');
        langInput.placeholder = 'en, en-us, sw';

        wrap.appendChild(form);

        const actions = state.contextDoc.createElement('div');
        actions.className = 'aivi-overlay-review-metadata-actions';
        const saveBtn = state.contextDoc.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'aivi-overlay-review-btn primary';
        saveBtn.textContent = 'Save metadata';
        const reloadBtn = state.contextDoc.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.className = 'aivi-overlay-review-btn';
        reloadBtn.textContent = 'Reload values';
        actions.appendChild(saveBtn);
        actions.appendChild(reloadBtn);
        wrap.appendChild(actions);

        const status = state.contextDoc.createElement('div');
        status.className = 'aivi-overlay-review-metadata-status';
        wrap.appendChild(status);

        const setFormValues = (documentMeta) => {
            const source = documentMeta && typeof documentMeta === 'object' ? documentMeta : {};
            titleInput.value = normalizeText(source.title || (post && post.title) || '');
            descriptionInput.value = normalizeText(source.meta_description || '');
            canonicalInput.value = normalizeText(source.canonical_url || '');
            langInput.value = normalizeText(source.lang || '');
        };

        const setPending = (pending) => {
            saveBtn.disabled = pending;
            reloadBtn.disabled = pending;
            titleInput.disabled = pending;
            descriptionInput.disabled = pending;
            canonicalInput.disabled = pending;
            langInput.disabled = pending;
        };

        const loadValues = async (force) => {
            if (!postId) {
                setFormValues({ title: post && post.title ? post.title : '' });
                status.textContent = 'Save the post first so AiVI can store document metadata.';
                saveBtn.disabled = true;
                reloadBtn.disabled = true;
                return;
            }
            try {
                setPending(true);
                status.textContent = 'Loading saved metadata…';
                let documentMeta = force ? null : getCachedDocumentMeta(postId);
                if (!documentMeta) {
                    documentMeta = await fetchDocumentMeta(postId);
                }
                setFormValues(documentMeta || { title: post && post.title ? post.title : '' });
                status.textContent = documentMeta
                    ? 'Loaded current metadata values.'
                    : 'No saved metadata yet. Fill in the fields you need.';
            } catch (e) {
                setFormValues({ title: post && post.title ? post.title : '' });
                status.textContent = 'Could not load saved metadata. You can still fill the fields manually.';
            } finally {
                setPending(false);
            }
        };

        saveBtn.addEventListener('click', async () => {
            if (!postId) {
                status.textContent = 'Save the post first so AiVI can store document metadata.';
                return;
            }
            const payload = {
                title: normalizeText(titleInput.value),
                meta_description: normalizeText(descriptionInput.value),
                canonical_url: normalizeText(canonicalInput.value),
                lang: normalizeText(langInput.value)
            };
            try {
                setPending(true);
                status.textContent = 'Saving metadata…';
                const result = await saveDocumentMeta(postId, payload);
                if (!result.ok || !result.documentMeta) {
                    status.textContent = 'Save failed. Please try again.';
                    return;
                }
                setFormValues(result.documentMeta);
                syncEditorTitleValue(result.documentMeta.title || payload.title || '');
                status.textContent = 'Metadata saved for this post.';
                setMetaStatus('Metadata saved');
            } catch (e) {
                status.textContent = 'Save failed. Please try again.';
            } finally {
                setPending(false);
            }
        });

        reloadBtn.addEventListener('click', () => {
            state.documentMetaCache.delete(String(postId));
            loadValues(true);
        });

        setFormValues({ title: post && post.title ? post.title : '' });
        loadValues(false);

        return wrap;
    }

    function normalizeGuidanceComparisonText(value) {
        return normalizeText(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function areGuidanceTextsEquivalent(a, b) {
        const left = normalizeGuidanceComparisonText(a);
        const right = normalizeGuidanceComparisonText(b);
        if (!left || !right) return false;
        if (left === right) return true;
        return left.includes(right) || right.includes(left);
    }

    function splitGuidanceSentences(value) {
        const text = normalizeText(value || '');
        if (!text) return [];
        const matches = text.match(/[^.!?]+[.!?]?/g);
        if (!Array.isArray(matches) || !matches.length) {
            return text ? [text] : [];
        }
        return matches.map((part) => normalizeText(part)).filter(Boolean);
    }

    function resolveRecommendationDetailText(issue, explanationPack, summaryText) {
        const canonical = normalizeText(
            (issue && issue.issue_explanation)
            || (explanationPack && explanationPack.issue_explanation)
            || ''
        );
        const fallback = canonical || composeIssueExplanationNarrative(explanationPack);
        if (!fallback) return '';
        if (!summaryText) return fallback;
        if (areGuidanceTextsEquivalent(fallback, summaryText)) return '';

        const sentences = splitGuidanceSentences(fallback);
        if (sentences.length > 1 && areGuidanceTextsEquivalent(sentences[0], summaryText)) {
            const trimmed = normalizeText(sentences.slice(1).join(' '));
            if (trimmed && !areGuidanceTextsEquivalent(trimmed, summaryText)) {
                return trimmed;
            }
        }

        return fallback;
    }

    function buildGuidanceTextNode(text, extraClass) {
        if (!state.contextDoc) return null;
        const narrative = stripGuidanceScaffold(text || '');
        if (!narrative) return null;

        const wrap = state.contextDoc.createElement('div');
        wrap.className = `aivi-overlay-guidance ${extraClass || ''}`.trim();
        const body = state.contextDoc.createElement('div');
        body.className = 'aivi-overlay-guidance-text';
        body.textContent = narrative;
        wrap.appendChild(body);
        return wrap;
    }

    function isSemanticV2Enabled() {
        try {
            if (localStorage.getItem('aivi.enable_semantic_v2') === '0') return false;
            if (window.AIVI_FEATURE_FLAGS && typeof window.AIVI_FEATURE_FLAGS.SEMANTIC_HIGHLIGHT_V2 === 'boolean') {
                return window.AIVI_FEATURE_FLAGS.SEMANTIC_HIGHLIGHT_V2;
            }
            if (localStorage.getItem('aivi.enable_semantic_v2') === '1') return true;
        } catch (e) {
            return false;
        }
        return true;
    }

    function isStabilityReleaseModeEnabled() {
        const cfg = getConfig();
        if (typeof cfg.stabilityReleaseMode === 'boolean') {
            return cfg.stabilityReleaseMode;
        }
        if (cfg.featureFlags && typeof cfg.featureFlags.STABILITY_RELEASE_MODE === 'boolean') {
            return cfg.featureFlags.STABILITY_RELEASE_MODE;
        }
        if (window.AIVI_FEATURE_FLAGS && typeof window.AIVI_FEATURE_FLAGS.STABILITY_RELEASE_MODE === 'boolean') {
            return window.AIVI_FEATURE_FLAGS.STABILITY_RELEASE_MODE;
        }
        return true;
    }

    function normalizeAnchoringText(value) {
        if (typeof value !== 'string') return '';
        let text = value.normalize('NFC');
        text = text
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        return text;
    }

    function normalizeAnchoringWords(value) {
        const normalized = normalizeAnchoringText(value);
        return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
    }

    function computeSha256(value) {
        if (!value) return Promise.resolve('');
        if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.resolve('');
        const encoder = new TextEncoder();
        const data = encoder.encode(value);
        return window.crypto.subtle.digest('SHA-256', data).then((hash) => {
            const bytes = new Uint8Array(hash);
            let hex = '';
            bytes.forEach((b) => {
                hex += b.toString(16).padStart(2, '0');
            });
            return hex;
        }).catch(() => '');
    }

    function buildBlockHtml(block) {
        if (!block || typeof block !== 'object') return '';
        const attrs = block && block.attributes ? block.attributes : {};
        if (wp && wp.blocks && typeof wp.blocks.getBlockContent === 'function') {
            try {
                const serialized = wp.blocks.getBlockContent(block);
                if (typeof serialized === 'string' && serialized.trim()) {
                    return serialized;
                }
            } catch (e) {
            }
        }
        if (wp && wp.blocks && typeof wp.blocks.serialize === 'function') {
            try {
                const serialized = wp.blocks.serialize([block]);
                if (typeof serialized === 'string' && serialized.trim()) {
                    return serialized;
                }
            } catch (e) {
            }
        }
        if (block.name === 'core/paragraph') {
            return attrs.content || '';
        }
        if (block.name === 'core/heading') {
            return attrs.content || '';
        }
        if (block.name === 'core/list') {
            return attrs.values || '';
        }
        if (block.name === 'core/quote') {
            return attrs.value || attrs.citation || '';
        }
        if (block.name === 'core/table') {
            return attrs.body ? attrs.body.map((row) => row.cells.map((cell) => cell.content).join(' ')).join(' ') : '';
        }
        if (block.name === 'core/image') {
            const alt = attrs.alt || '';
            const url = attrs.url || '';
            const caption = attrs.caption || '';
            const img = url ? `<img src="${url}" alt="${alt}" />` : '';
            const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
            return `<figure>${img}${figcaption}</figure>`;
        }
        const richFallback = buildRichBlockFallbackHtml(block);
        if (richFallback) {
            return richFallback;
        }
        if (typeof attrs.content === 'string') {
            return attrs.content;
        }
        if (typeof block.originalContent === 'string') {
            return block.originalContent;
        }
        if (Array.isArray(block.innerBlocks) && block.innerBlocks.length) {
            return block.innerBlocks.map((innerBlock) => buildBlockHtml(innerBlock)).filter(Boolean).join('');
        }
        return '';
    }

    function buildTableSectionHtml(rows, sectionTag, cellTag) {
        if (!Array.isArray(rows) || !rows.length) return '';
        const renderedRows = rows.map((row) => {
            const cells = Array.isArray(row && row.cells) ? row.cells : [];
            if (!cells.length) return '';
            const renderedCells = cells.map((cell) => {
                const content = typeof cell?.content === 'string' ? cell.content : '';
                const tag = (cell && typeof cell.tag === 'string' && /^(td|th)$/i.test(cell.tag)) ? cell.tag.toLowerCase() : cellTag;
                return `<${tag}>${content}</${tag}>`;
            }).join('');
            return renderedCells ? `<tr>${renderedCells}</tr>` : '';
        }).filter(Boolean).join('');
        if (!renderedRows) return '';
        return `<${sectionTag}>${renderedRows}</${sectionTag}>`;
    }

    function buildRichBlockFallbackHtml(block) {
        if (!block || typeof block !== 'object') return '';
        const attrs = block && block.attributes ? block.attributes : {};
        const name = String(block.name || '').trim();

        if (name === 'core/table') {
            const sections = [
                buildTableSectionHtml(attrs.head, 'thead', 'th'),
                buildTableSectionHtml(attrs.body, 'tbody', 'td'),
                buildTableSectionHtml(attrs.foot, 'tfoot', 'td')
            ].filter(Boolean);
            return sections.length ? `<figure class="aivi-overlay-table-wrap"><table>${sections.join('')}</table></figure>` : '';
        }

        if (name === 'core/embed') {
            if (typeof attrs.html === 'string' && attrs.html.trim()) return attrs.html;
            const url = typeof attrs.url === 'string' ? attrs.url.trim() : '';
            const caption = typeof attrs.caption === 'string' ? attrs.caption : '';
            if (!url) return '';
            const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
            return `<figure class="aivi-overlay-embed-fallback"><a href="${escapeHtmlValue(url)}" target="_blank" rel="noreferrer noopener">${escapeHtmlValue(url)}</a>${figcaption}</figure>`;
        }

        if (name === 'core/video') {
            const src = typeof attrs.src === 'string' ? attrs.src.trim() : '';
            const caption = typeof attrs.caption === 'string' ? attrs.caption : '';
            if (!src) return '';
            const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
            return `<figure><video controls src="${escapeHtmlValue(src)}"></video>${figcaption}</figure>`;
        }

        if (name === 'core/audio') {
            const src = typeof attrs.src === 'string' ? attrs.src.trim() : '';
            const caption = typeof attrs.caption === 'string' ? attrs.caption : '';
            if (!src) return '';
            const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
            return `<figure><audio controls src="${escapeHtmlValue(src)}"></audio>${figcaption}</figure>`;
        }

        if (name === 'core/file') {
            const href = typeof attrs.href === 'string' ? attrs.href.trim() : '';
            const fileName = typeof attrs.fileName === 'string' ? attrs.fileName.trim() : '';
            if (!href && !fileName) return '';
            const label = fileName || href;
            return `<div class="aivi-overlay-file-fallback"><a href="${escapeHtmlValue(href || '#')}" target="_blank" rel="noreferrer noopener">${escapeHtmlValue(label)}</a></div>`;
        }

        if (name === 'core/button') {
            const text = htmlToText(attrs.text || '') || normalizeText(attrs.text || '');
            const url = typeof attrs.url === 'string' ? attrs.url.trim() : '';
            const label = text || 'Button';
            return `<div class="aivi-overlay-button-row"><a class="aivi-overlay-button-fallback" href="${escapeHtmlValue(url || '#')}" target="_blank" rel="noreferrer noopener">${escapeHtmlValue(label)}</a></div>`;
        }

        if (name === 'core/buttons') {
            if (Array.isArray(block.innerBlocks) && block.innerBlocks.length) {
                return `<div class="aivi-overlay-button-group">${block.innerBlocks.map((innerBlock) => buildBlockHtml(innerBlock)).filter(Boolean).join('')}</div>`;
            }
            return '';
        }

        if (name === 'core/gallery') {
            const images = Array.isArray(attrs.images) ? attrs.images : [];
            if (images.length) {
                return `<div class="aivi-overlay-gallery-grid">${images.map((image) => {
                    const src = typeof image?.url === 'string' ? image.url.trim() : '';
                    const alt = typeof image?.alt === 'string' ? image.alt : '';
                    if (!src) return '';
                    return `<figure><img src="${escapeHtmlValue(src)}" alt="${escapeHtmlValue(alt)}" /></figure>`;
                }).filter(Boolean).join('')}</div>`;
            }
            return Array.isArray(block.innerBlocks) && block.innerBlocks.length
                ? block.innerBlocks.map((innerBlock) => buildBlockHtml(innerBlock)).filter(Boolean).join('')
                : '';
        }

        if (name === 'core/separator') {
            return '<hr class="aivi-overlay-separator" />';
        }

        if (name === 'core/spacer') {
            const height = Number.isFinite(Number(attrs.height)) ? Number(attrs.height) : 32;
            return `<div class="aivi-overlay-spacer" style="height:${Math.max(8, height)}px"></div>`;
        }

        if (name === 'core/html' && typeof attrs.content === 'string') {
            return attrs.content;
        }

        if (name === 'core/preformatted' && typeof attrs.content === 'string') {
            return `<pre>${attrs.content}</pre>`;
        }

        if (name === 'core/code' && typeof attrs.content === 'string') {
            return `<pre><code>${attrs.content}</code></pre>`;
        }

        if (name === 'core/verse' && typeof attrs.content === 'string') {
            return `<pre class="aivi-overlay-verse">${attrs.content}</pre>`;
        }

        return '';
    }

    function isEditableBlock(block) {
        if (!block || !block.name) return false;
        return block.name === 'core/paragraph' ||
            block.name === 'core/heading' ||
            block.name === 'core/list' ||
            block.name === 'core/quote';
    }

    function getOverlayBlockRenderMode(block) {
        return isEditableBlock(block) ? 'editable' : 'readonly';
    }

    function buildOverlayBlockState(renderMode) {
        if (!state.contextDoc || renderMode !== 'readonly') return null;
        const chip = state.contextDoc.createElement('span');
        chip.className = 'aivi-overlay-block-state';
        chip.textContent = 'Read-only';
        return chip;
    }

    function shouldSkipBlock(block) {
        if (!block) return true;
        const isHeading = String(block.name || '') === 'core/heading';
        const level = block && block.attributes && block.attributes.level ? Number(block.attributes.level) : 1;
        if (!isHeading || level !== 1) return false;
        const title = normalizeText(getOverlayDocumentTitle([]));
        if (!title) return false;
        const blockText = normalizeText(htmlToText(buildBlockHtml(block) || block?.attributes?.content || ''));
        return blockText === title;
    }

    function hideBlockMenu() {
        if (!state.blockMenu) return;
        state.blockMenu.hidden = true;
        state.blockMenuNodeRef = '';
        state.blockMenu.style.left = '';
        state.blockMenu.style.top = '';
    }

    function ensureBlockMenu() {
        if (!state.contextDoc || !state.overlayPanel) return null;
        if (state.blockMenu && state.blockMenu.parentNode) {
            return state.blockMenu;
        }
        const menu = state.contextDoc.createElement('div');
        menu.className = 'aivi-overlay-block-menu';
        menu.hidden = true;
        state.overlayPanel.appendChild(menu);
        state.blockMenu = menu;
        return menu;
    }

    function buildBlockMenuHeader() {
        if (!state.contextDoc) return null;
        const header = state.contextDoc.createElement('div');
        header.className = 'aivi-overlay-block-menu-header';
        const kicker = state.contextDoc.createElement('div');
        kicker.className = 'aivi-overlay-block-menu-kicker';
        kicker.textContent = 'AiVI block actions';
        const title = state.contextDoc.createElement('div');
        title.className = 'aivi-overlay-block-menu-title';
        title.textContent = 'Choose what to improve here';
        header.appendChild(kicker);
        header.appendChild(title);
        return header;
    }

    function setBlockMenuTitle(text) {
        if (!state.blockMenu) return;
        const title = state.blockMenu.querySelector('.aivi-overlay-block-menu-title');
        if (title) {
            title.textContent = String(text || 'Choose what to improve here');
        }
    }

    function buildBlockMenuAction(label, onClick, options) {
        if (!state.contextDoc) return null;
        const button = state.contextDoc.createElement('button');
        button.type = 'button';
        button.className = `aivi-overlay-block-menu-action${options && options.wide ? ' wide' : ''}`;
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    function buildBlockMenuSection(config) {
        if (!state.contextDoc || !config) return null;
        const section = state.contextDoc.createElement('div');
        section.className = 'aivi-overlay-block-menu-section';
        section.setAttribute('data-section', String(config.id || ''));

        const toggle = state.contextDoc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'aivi-overlay-block-menu-btn aivi-overlay-block-menu-toggle';

        const body = state.contextDoc.createElement('span');
        body.className = 'aivi-overlay-block-menu-item-body';

        const label = state.contextDoc.createElement('span');
        label.className = 'aivi-overlay-block-menu-item-label';
        label.textContent = String(config.label || '');

        const copy = state.contextDoc.createElement('span');
        copy.className = 'aivi-overlay-block-menu-item-copy';
        copy.textContent = String(config.copy || '');

        body.appendChild(label);
        body.appendChild(copy);

        const chevron = state.contextDoc.createElement('span');
        chevron.className = 'aivi-overlay-block-menu-chevron';
        chevron.textContent = '>';

        toggle.appendChild(body);
        toggle.appendChild(chevron);
        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextOpen = !section.classList.contains('open');
            if (state.blockMenu) {
                state.blockMenu.querySelectorAll('.aivi-overlay-block-menu-section.open').forEach((node) => {
                    node.classList.remove('open');
                });
            }
            if (nextOpen) {
                section.classList.add('open');
            }
        });
        section.appendChild(toggle);

        const submenu = state.contextDoc.createElement('div');
        submenu.className = 'aivi-overlay-block-menu-submenu';
        (config.actions || []).forEach((action) => {
            const actionButton = buildBlockMenuAction(action.label, action.run, action);
            if (actionButton) submenu.appendChild(actionButton);
        });
        section.appendChild(submenu);
        return section;
    }

    function getActiveBlockInfo() {
        const blocks = getBlocks();
        const nodeRef = state.activeEditableNodeRef || '';
        return nodeRef ? findBlockByNodeRef(blocks, nodeRef) : null;
    }

    function getActiveBlockText(info) {
        if (!info || !info.block) return '';
        const body = state.activeEditableBody;
        if (body) {
            const html = extractEditableHtml(body);
            if (html && html.trim()) return html;
        }
        return buildBlockHtml(info.block) || '';
    }

    function replaceActiveBlockWith(nextBlock) {
        const info = getActiveBlockInfo();
        if (!info || !info.clientId || !nextBlock || !wp || !wp.data || typeof wp.data.dispatch !== 'function') {
            setMetaStatus('Block action unavailable');
            return false;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.replaceBlocks !== 'function') {
            setMetaStatus('Replace block action unavailable');
            return false;
        }
        try {
            dispatcher.replaceBlocks(info.clientId, nextBlock);
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('replace_block_type');
            renderBlocks(true);
            setMetaStatus('Block updated');
            return true;
        } catch (e) {
            setMetaStatus('Block update failed');
            return false;
        }
    }

    function setActiveBlockType(mode) {
        const info = getActiveBlockInfo();
        if (!info || !info.block || isTitleBlock(info) || !wp || !wp.blocks || typeof wp.blocks.createBlock !== 'function') {
            setMetaStatus('Select a block in the canvas first');
            return;
        }
        const html = getActiveBlockText(info);
        let nextBlock = null;
        if (mode === 'paragraph') {
            nextBlock = wp.blocks.createBlock('core/paragraph', { content: html });
        } else if (mode === 'h2') {
            nextBlock = wp.blocks.createBlock('core/heading', { level: 2, content: htmlToText(html) || normalizeText(html) });
        } else if (mode === 'h3') {
            nextBlock = wp.blocks.createBlock('core/heading', { level: 3, content: htmlToText(html) || normalizeText(html) });
        } else if (mode === 'quote') {
            nextBlock = wp.blocks.createBlock('core/quote', { value: html || normalizeText(html) });
        } else if (mode === 'bulleted-list') {
            nextBlock = wp.blocks.createBlock('core/list', { ordered: false, values: convertTextToListMarkup(htmlToText(html) || normalizeText(html)) });
        } else if (mode === 'numbered-list') {
            nextBlock = wp.blocks.createBlock('core/list', { ordered: true, values: convertTextToListMarkup(htmlToText(html) || normalizeText(html)) });
        }
        if (!nextBlock) {
            setMetaStatus('Block type not supported');
            return;
        }
        replaceActiveBlockWith(nextBlock);
    }

    function insertBlocksAfterActive(blocksToInsert) {
        if (!wp || !wp.data || !wp.data.dispatch) {
            setMetaStatus('WordPress block editor API unavailable');
            return;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.insertBlocks !== 'function') {
            setMetaStatus('Insert action unavailable');
            return;
        }
        const allBlocks = getBlocks();
        const activeNodeRef = state.activeEditableNodeRef || '';
        const activeInfo = activeNodeRef ? findBlockByNodeRef(allBlocks, activeNodeRef) : null;
        const insertIndex = activeInfo && Number.isFinite(activeInfo.blockIndex)
            ? activeInfo.blockIndex + 1
            : (Array.isArray(allBlocks) ? allBlocks.length : undefined);
        try {
            dispatcher.insertBlocks(blocksToInsert, Number.isFinite(insertIndex) ? insertIndex : undefined);
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('insert_block');
            renderBlocks(true);
            setMetaStatus('Block inserted');
        } catch (e) {
            setMetaStatus('Insert failed');
        }
    }

    function appendTextToActiveBlock(text) {
        const info = getActiveBlockInfo();
        if (!info || !info.block || isTitleBlock(info)) {
            setMetaStatus('Select a block in the canvas first');
            return;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.updateBlockAttributes !== 'function') {
            setMetaStatus('Block update unavailable');
            return;
        }
        const attrKey = getBlockTextKey(info.block);
        if (!attrKey) {
            setMetaStatus('This block cannot accept inline text additions');
            return;
        }
        const currentValue = info.block.attributes && typeof info.block.attributes[attrKey] === 'string'
            ? info.block.attributes[attrKey]
            : '';
        try {
            dispatcher.updateBlockAttributes(info.clientId, { [attrKey]: `${currentValue}${text}`.trim() });
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('append_block_text');
            renderBlocks(true);
            setMetaStatus('Block updated');
        } catch (e) {
            setMetaStatus('Block update failed');
        }
    }

    function copyActiveBlockLink() {
        const nodeRef = state.blockMenuNodeRef || state.activeEditableNodeRef || '';
        if (!nodeRef) {
            setMetaStatus('No block selected');
            return;
        }
        const value = `#${nodeRef}`;
        const complete = () => setMetaStatus(`Copied ${value}`);
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(value).then(complete).catch(() => setMetaStatus('Copy failed'));
            return;
        }
        try {
            if (state.contextDoc && typeof state.contextDoc.execCommand === 'function') {
                const input = state.contextDoc.createElement('textarea');
                input.value = value;
                state.contextDoc.body.appendChild(input);
                input.select();
                state.contextDoc.execCommand('copy');
                input.remove();
                complete();
                return;
            }
        } catch (e) {
        }
        setMetaStatus(value);
    }

    function moveActiveBlock(direction) {
        const info = getActiveBlockInfo();
        if (!info || !info.clientId || typeof info.blockIndex !== 'number' || isTitleBlock(info) || !wp || !wp.data || typeof wp.data.dispatch !== 'function') {
            setMetaStatus('Select a movable block first');
            return;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.moveBlocksToPosition !== 'function') {
            setMetaStatus('Move action unavailable');
            return;
        }
        const allBlocks = getBlocks();
        const targetIndex = info.blockIndex + (direction < 0 ? -1 : 1);
        if (targetIndex < 0 || targetIndex >= allBlocks.length) {
            setMetaStatus('Block is already at the edge');
            return;
        }
        try {
            dispatcher.moveBlocksToPosition([info.clientId], '', '', targetIndex);
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('move_block');
            renderBlocks(true);
            setMetaStatus(direction < 0 ? 'Block moved up' : 'Block moved down');
        } catch (e) {
            setMetaStatus('Move failed');
        }
    }

    function duplicateActiveBlock() {
        const info = getActiveBlockInfo();
        if (!info || !info.block || !info.clientId || isTitleBlock(info) || !wp || !wp.data || typeof wp.data.dispatch !== 'function' || !wp.blocks || typeof wp.blocks.cloneBlock !== 'function') {
            setMetaStatus('Select a duplicable block first');
            return;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.insertBlocks !== 'function') {
            setMetaStatus('Duplicate action unavailable');
            return;
        }
        try {
            const clone = wp.blocks.cloneBlock(info.block);
            dispatcher.insertBlocks([clone], info.blockIndex + 1);
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('duplicate_block');
            renderBlocks(true);
            setMetaStatus('Block duplicated');
        } catch (e) {
            setMetaStatus('Duplicate failed');
        }
    }

    function deleteActiveBlock() {
        const info = getActiveBlockInfo();
        if (!info || !info.clientId || isTitleBlock(info) || !wp || !wp.data || typeof wp.data.dispatch !== 'function') {
            setMetaStatus('Select a removable block first');
            return;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.removeBlocks !== 'function') {
            setMetaStatus('Delete action unavailable');
            return;
        }
        try {
            dispatcher.removeBlocks([info.clientId], false);
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('delete_block');
            hideBlockMenu();
            renderBlocks(true);
            setMetaStatus('Block removed');
        } catch (e) {
            setMetaStatus('Delete failed');
        }
    }

    function returnToIssueForActiveBlock() {
        const nodeRef = state.blockMenuNodeRef || state.activeEditableNodeRef || '';
        if (!nodeRef || !state.overlayRail) {
            setMetaStatus('No related issue found');
            return;
        }
        const card = state.overlayRail.querySelector(`[data-jump-node-ref="${String(nodeRef).replace(/"/g, '\\"')}"]`);
        if (!card) {
            setMetaStatus('No related issue found');
            return;
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setMetaStatus('Returned to related issue');
        hideBlockMenu();
    }

    function buildBlockMenu(nodeRef) {
        const menu = ensureBlockMenu();
        if (!menu || !state.contextDoc) return null;
        menu.innerHTML = '';
        state.toolbarButtons = [];

        const menuSections = [
            {
                id: 'block-type',
                label: 'Block type',
                copy: 'Paragraph, H2, H3, quote, bulleted list, numbered list',
                actions: [
                    { label: 'Paragraph', run: () => setActiveBlockType('paragraph') },
                    { label: 'H2 heading', run: () => setActiveBlockType('h2') },
                    { label: 'H3 heading', run: () => setActiveBlockType('h3') },
                    { label: 'Quote', run: () => setActiveBlockType('quote') },
                    { label: 'Bulleted list', run: () => setActiveBlockType('bulleted-list') },
                    { label: 'Numbered list', run: () => setActiveBlockType('numbered-list') }
                ]
            },
            {
                id: 'insert-nearby',
                label: 'Insert nearby',
                copy: 'Insert paragraph, heading, list, FAQ pair, or HowTo step',
                actions: [
                    { label: 'Paragraph', run: () => insertBlocksAfterActive([createOverlayBlock('core/paragraph')].filter(Boolean)) },
                    { label: 'Heading', run: () => insertBlocksAfterActive([createOverlayBlock('core/heading')].filter(Boolean)) },
                    { label: 'List', run: () => insertBlocksAfterActive([createOverlayBlock('core/list')].filter(Boolean)) },
                    {
                        label: 'FAQ pair',
                        run: () => insertBlocksAfterActive([
                            wp.blocks.createBlock('core/heading', { level: 3, content: 'What question should this section answer?' }),
                            wp.blocks.createBlock('core/paragraph', { content: 'Lead with one direct answer sentence, then add one support detail.' })
                        ])
                    },
                    {
                        label: 'HowTo step',
                        run: () => insertBlocksAfterActive([
                            wp.blocks.createBlock('core/list', { ordered: true, values: '<li>Step one with one clear action.</li><li>Step two with one supporting detail.</li>' })
                        ])
                    }
                ]
            },
            {
                id: 'links-evidence',
                label: 'Links and evidence',
                copy: 'Add internal link, citation placeholder, or copy block link',
                actions: [
                    {
                        label: 'Add internal link',
                        run: () => {
                            const view = (state.contextDoc && state.contextDoc.defaultView) ? state.contextDoc.defaultView : window;
                            const input = view.prompt('Enter internal link URL');
                            if (!input) return;
                            runOverlayFormatCommand('createLink', input.trim());
                        }
                    },
                    { label: 'Citation placeholder', run: () => appendTextToActiveBlock(' [Source needed: authoritative citation].') },
                    { label: 'Copy block link', run: () => copyActiveBlockLink(), wide: true }
                ]
            },
            {
                id: 'block-actions',
                label: 'Block actions',
                copy: 'Move up, move down, duplicate, delete, or return to issue',
                actions: [
                    { label: 'Move up', run: () => moveActiveBlock(-1) },
                    { label: 'Move down', run: () => moveActiveBlock(1) },
                    { label: 'Duplicate', run: () => duplicateActiveBlock() },
                    { label: 'Delete', run: () => deleteActiveBlock() },
                    { label: 'Return to issue', run: () => returnToIssueForActiveBlock(), wide: true }
                ]
            }
        ];

        const header = buildBlockMenuHeader();
        if (header) menu.appendChild(header);
        menuSections.forEach((sectionConfig) => {
            const section = buildBlockMenuSection(sectionConfig);
            if (section) menu.appendChild(section);
        });

        state.blockMenuNodeRef = nodeRef || '';
        setBlockMenuTitle(`Actions for ${state.blockMenuNodeRef || 'block'}`);
        return menu;
    }

    function positionBlockMenuForWrapper(wrapper) {
        if (!wrapper || !state.blockMenu || !state.overlayPanel || !state.contextDoc) return;
        const view = state.contextDoc.defaultView || window;
        const panelRect = state.overlayPanel.getBoundingClientRect();
        const stageRect = state.overlayViewport
            ? state.overlayViewport.getBoundingClientRect()
            : panelRect;
        const wrapperRect = wrapper.getBoundingClientRect();
        const menuWidth = 288;
        const horizontalGutter = 18;
        const minLeft = Math.max(stageRect.left + 10, panelRect.left + 16);
        const maxLeft = Math.max(minLeft, stageRect.right - menuWidth - horizontalGutter);
        const preferredLeft = wrapperRect.right + 10;
        const top = Math.max(stageRect.top + 16, Math.min(wrapperRect.top - 6, stageRect.bottom - 220));
        const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);
        state.blockMenu.style.position = 'fixed';
        state.blockMenu.style.width = `${menuWidth}px`;
        state.blockMenu.style.top = `${Math.round(top)}px`;
        state.blockMenu.style.left = `${Math.round(left)}px`;
        state.blockMenu.style.maxHeight = `${Math.max(220, Math.floor(view.innerHeight - top - 24))}px`;
    }

    function openBlockMenuForBody(body, nodeRef) {
        if (!body) return;
        const wrapper = body.closest('.aivi-overlay-block');
        if (!wrapper) return;
        setActiveEditableBody(body, nodeRef || wrapper.getAttribute('data-node-ref') || '');
        body.focus();
        const menu = buildBlockMenu(nodeRef || wrapper.getAttribute('data-node-ref') || '');
        if (!menu) return;
        positionBlockMenuForWrapper(wrapper);
        menu.hidden = false;
    }

    function getOverlayDocumentTitle(blocks) {
        const current = readEditorPost();
        const postTitle = normalizeText(current && current.title ? current.title : '');
        if (postTitle) return postTitle;
        const sourceBlocks = Array.isArray(blocks) ? blocks : getBlocks();
        for (let index = 0; index < sourceBlocks.length; index += 1) {
            const block = sourceBlocks[index];
            if (!block || String(block.name || '') !== 'core/heading') continue;
            const level = block && block.attributes && block.attributes.level ? Number(block.attributes.level) : 1;
            if (level !== 1) continue;
            const headingText = normalizeText(htmlToText(buildBlockHtml(block) || block?.attributes?.content || ''));
            if (headingText) return headingText;
        }
        const manifestTitle = normalizeText(
            state.overlayContentData && typeof state.overlayContentData.title === 'string'
                ? state.overlayContentData.title
                : ''
        );
        return manifestTitle || 'Untitled draft';
    }

    function renderOverlayDocumentHeader(blocks) {
        if (!state.overlayDocTitle) return;
        state.overlayDocTitle.textContent = getOverlayDocumentTitle(blocks);
    }

    function renderReviewRail(recommendations) {
        if (!state.overlayRail || !state.contextDoc) return;
        const issues = Array.isArray(recommendations) ? recommendations : [];
        const guardrail = getGuardrailState();
        if (state.overlayRailScrollHandler && state.overlayRailViewport) {
            state.overlayRailViewport.removeEventListener('scroll', state.overlayRailScrollHandler);
            state.overlayRailScrollHandler = null;
        }
        state.overlayRail.innerHTML = '';
        state.overlayRailViewport = null;

        const head = state.contextDoc.createElement('div');
        head.className = 'aivi-overlay-rail-head';
        const railTitle = state.contextDoc.createElement('div');
        railTitle.className = 'aivi-overlay-review-rail-title';
        railTitle.textContent = 'Review Rail';
        const note = state.contextDoc.createElement('div');
        note.className = 'aivi-overlay-rail-note';
        note.textContent = OVERLAY_EDITOR_PERSISTENCE_NOTE;

        const closeButton = state.contextDoc.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'aivi-overlay-rail-btn subtle';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => closeOverlay());

        head.appendChild(railTitle);
        head.appendChild(closeButton);
        head.appendChild(note);
        state.overlayRail.appendChild(head);

        if (guardrail.message) {
            const banner = state.contextDoc.createElement('div');
            banner.className = `aivi-overlay-rail-banner ${guardrail.type === 'error' ? 'is-error' : 'is-warning'}`;
            banner.textContent = guardrail.message;
            state.overlayRail.appendChild(banner);
        }

        const status = state.contextDoc.createElement('div');
        status.id = 'aivi-overlay-rail-status';
        status.className = 'aivi-overlay-rail-status';
        status.textContent = state.metaStatus || '';
        status.hidden = !state.metaStatus;
        state.overlayRail.appendChild(status);

        const summary = state.contextDoc.createElement('div');
        summary.className = 'aivi-overlay-review-summary';
        const count = state.contextDoc.createElement('div');
        count.className = 'aivi-overlay-review-count';
        count.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'} in focus`;
        summary.appendChild(count);
        state.overlayRail.appendChild(summary);

        if (!issues.length) {
            const empty = state.contextDoc.createElement('div');
            empty.className = 'aivi-overlay-review-empty';
            empty.textContent = 'No failed or partial issues were released into this review pass.';
            state.overlayRail.appendChild(empty);
            queueOverlayLayoutSync();
            return;
        }

        const viewport = state.contextDoc.createElement('div');
        viewport.className = 'aivi-overlay-review-viewport';
        const list = state.contextDoc.createElement('div');
        list.className = 'aivi-overlay-review-list';
        issues.forEach((issue) => {
            if (!issue) return;
            const item = state.contextDoc.createElement('div');
            item.className = 'aivi-overlay-review-item';
            const verdict = normalizeOverlayVerdictValue(issue.ui_verdict || issue.verdict) || 'fail';
            item.setAttribute('data-verdict', verdict);
            if (issue.jump_node_ref || issue.node_ref) {
                item.setAttribute('data-jump-node-ref', issue.jump_node_ref || issue.node_ref || '');
            }
            const header = state.contextDoc.createElement('div');
            header.className = 'aivi-overlay-review-item-header';
            const name = state.contextDoc.createElement('div');
            name.className = 'aivi-overlay-review-item-name';
            name.textContent = issue && issue.check_name ? issue.check_name : 'Untitled issue';
            const impactPill = buildOverlayImpactPill(issue);
            const preferredSummary = normalizeText(issue.review_summary || '');
            const sanitizedMessage = sanitizeInlineIssueMessage(
                preferredSummary || issue.message || '',
                { name: issue.check_name || issue.check_id || '' }
            );
            const summaryText = sanitizedMessage || preferredSummary || 'Issue detected.';
            const summary = state.contextDoc.createElement('div');
            summary.className = 'aivi-overlay-review-item-summary';
            summary.textContent = summaryText;

            const actions = state.contextDoc.createElement('div');
            actions.className = 'aivi-overlay-review-item-actions';
            const viewButton = state.contextDoc.createElement('button');
            viewButton.type = 'button';
            viewButton.className = 'aivi-overlay-review-btn';
            viewButton.textContent = 'View details';
            const jumpButton = state.contextDoc.createElement('button');
            jumpButton.type = 'button';
            jumpButton.className = 'aivi-overlay-review-btn';
            jumpButton.textContent = 'Jump to block';
            const details = state.contextDoc.createElement('div');
            details.className = 'aivi-overlay-review-details';
            details.hidden = true;

            const explanationPack = resolveExplanationPack(
                clonePlainObject(issue.explanation_pack),
                {
                    what_failed: summaryText,
                    how_to_fix_step: issue.action_suggestion || 'Update the referenced section directly from the editor canvas.',
                    issue_explanation: issue.issue_explanation || ''
                }
            );
            const detailText = resolveRecommendationDetailText(issue, explanationPack, summaryText);
            const explanationNode = buildGuidanceTextNode(detailText, 'aivi-overlay-guidance-recommendation');
            if (explanationNode) {
                details.appendChild(explanationNode);
            }
            if (issue.snippet) {
                const snippet = state.contextDoc.createElement('div');
                snippet.className = 'aivi-overlay-review-item-snippet';
                snippet.textContent = issue.snippet;
                details.appendChild(snippet);
            }
            const schemaAssistNode = buildReviewRailSchemaAssistNode(issue);
            if (schemaAssistNode) {
                details.appendChild(schemaAssistNode);
            }
            const metadataNode = buildReviewRailMetadataNode(issue);
            if (metadataNode) {
                details.appendChild(metadataNode);
            }
            const hasReviewDetails = details.childNodes.length > 0;
            if (!hasReviewDetails) {
                viewButton.disabled = true;
                viewButton.title = 'No additional details are available for this issue.';
            }

            viewButton.addEventListener('click', () => {
                if (!hasReviewDetails) return;
                const nextHidden = !details.hidden;
                details.hidden = nextHidden;
                viewButton.textContent = nextHidden ? 'View details' : 'Hide details';
                queueOverlayLayoutSync();
            });

            const syntheticReasons = new Set([
                'synthetic_fallback',
                'missing_ai_checks',
                'chunk_parse_failure',
                'time_budget_exceeded',
                'truncated_response'
            ]);
            const normalizedFailureReason = String(issue.failure_reason || '').trim().toLowerCase();
            const jumpNodeRef = issue.jump_node_ref || issue.node_ref || '';
            const allowJump = !!jumpNodeRef && !syntheticReasons.has(normalizedFailureReason);
            if (allowJump) {
                jumpButton.addEventListener('click', () => {
                    const jumped = jumpToOverlayNode(jumpNodeRef);
                    if (!jumped) {
                        setMetaStatus('Could not locate block for this recommendation');
                    }
                });
            } else {
                jumpButton.disabled = true;
                jumpButton.title = 'No reliable block target is available for this issue.';
            }

            header.appendChild(name);
            if (impactPill) {
                header.appendChild(impactPill);
            }
            item.appendChild(header);
            item.appendChild(summary);
            actions.appendChild(viewButton);
            actions.appendChild(jumpButton);
            item.appendChild(actions);
            item.appendChild(details);
            list.appendChild(item);
        });
        viewport.appendChild(list);
        state.overlayRail.appendChild(viewport);
        state.overlayRailViewport = viewport;

        const controls = state.contextDoc.createElement('div');
        controls.className = 'aivi-overlay-review-scroll-controls';
        controls.hidden = true;

        const upButton = state.contextDoc.createElement('button');
        upButton.type = 'button';
        upButton.className = 'aivi-overlay-review-scroll-btn';
        upButton.setAttribute('data-rail-scroll', 'up');
        upButton.setAttribute('aria-label', 'Scroll review rail up');
        upButton.innerHTML = '<span aria-hidden="true">↑</span>';
        upButton.addEventListener('click', () => scrollReviewRail('up'));

        const downButton = state.contextDoc.createElement('button');
        downButton.type = 'button';
        downButton.className = 'aivi-overlay-review-scroll-btn';
        downButton.setAttribute('data-rail-scroll', 'down');
        downButton.setAttribute('aria-label', 'Scroll review rail down');
        downButton.innerHTML = '<span aria-hidden="true">↓</span>';
        downButton.addEventListener('click', () => scrollReviewRail('down'));

        controls.appendChild(upButton);
        controls.appendChild(downButton);
        state.overlayRail.appendChild(controls);

        if (state.overlayRailScrollHandler && state.overlayRailViewport) {
            state.overlayRailViewport.removeEventListener('scroll', state.overlayRailScrollHandler);
        }
        state.overlayRailScrollHandler = () => syncReviewRailScrollControls();
        state.overlayRailViewport.addEventListener('scroll', state.overlayRailScrollHandler, { passive: true });
        queueOverlayLayoutSync();
    }

    function getConfig() {
        const cfg = (typeof window !== 'undefined' && window.AIVI_CONFIG) ? window.AIVI_CONFIG : {};
        const restBase = cfg.restBase || '/wp-json/aivi/v1';
        const nonce = cfg.nonce || '';
        const backendConfigured = cfg.backendConfigured === true;
        const accountState = (cfg.accountState && typeof cfg.accountState === 'object') ? cfg.accountState : {};
        const isEnabled = typeof cfg.isEnabled === 'boolean' ? cfg.isEnabled : true;
        const text = cfg.text || {};
        const featureFlags = (cfg.featureFlags && typeof cfg.featureFlags === 'object') ? cfg.featureFlags : {};
        const stalePolicy = typeof cfg.stalePolicy === 'string' ? cfg.stalePolicy : 'manual_refresh';
        const stabilityReleaseMode = typeof cfg.stabilityReleaseMode === 'boolean'
            ? cfg.stabilityReleaseMode
            : (typeof featureFlags.STABILITY_RELEASE_MODE === 'boolean'
                ? featureFlags.STABILITY_RELEASE_MODE
                : true);
        return { restBase, nonce, backendConfigured, accountState, isEnabled, text, featureFlags, stalePolicy, stabilityReleaseMode };
    }

    function getUiText() {
        const cfg = getConfig();
        return cfg.text || {};
    }

    function isAutoStaleDetectionEnabled() {
        const cfg = getConfig();
        const stalePolicy = typeof cfg.stalePolicy === 'string'
            ? cfg.stalePolicy.toLowerCase()
            : 'manual_refresh';
        if (stalePolicy !== 'auto') return false;
        const flags = (cfg.featureFlags && typeof cfg.featureFlags === 'object') ? cfg.featureFlags : {};
        if (typeof cfg.autoStaleDetection === 'boolean') return cfg.autoStaleDetection;
        if (typeof flags.AUTO_STALE_DETECTION === 'boolean') return flags.AUTO_STALE_DETECTION;
        return false;
    }

    function getOverlayDraftStorageKey() {
        const post = readEditorPost();
        const postId = post && post.id ? String(post.id) : '';
        const pathKey = (typeof window !== 'undefined' && window.location && window.location.pathname)
            ? String(window.location.pathname)
            : 'unknown-path';
        const identity = postId ? `post:${postId}` : `path:${pathKey}`;
        return `aivi.overlay.draft.v1:${identity}`;
    }

    function getOverlayDraftCompatibilityState() {
        const post = readEditorPost();
        const overlayMeta = state.overlayContentData && typeof state.overlayContentData === 'object'
            ? state.overlayContentData
            : {};
        const reportMeta = state.lastReport && typeof state.lastReport === 'object'
            ? state.lastReport
            : {};
        const editorContent = post && typeof post.content === 'string' ? post.content : '';
        return {
            post_id: post && post.id ? String(post.id) : '',
            run_id: String(overlayMeta.run_id || reportMeta.run_id || '').trim(),
            analysis_content_hash: String(overlayMeta.content_hash || reportMeta.content_hash || '').trim(),
            editor_signature: editorContent ? String(stableHash(editorContent)) : '',
            overlay_schema_version: String(overlayMeta.schema_version || '').trim()
        };
    }

    function isOverlayDraftCompatible(payload) {
        if (!payload || typeof payload !== 'object') return false;
        const payloadVersion = Number(payload.version || 0);
        if (payloadVersion !== OVERLAY_DRAFT_VERSION) return false;

        const current = getOverlayDraftCompatibilityState();
        const savedPostId = String(payload.post_id || '').trim();
        const savedRunId = String(payload.run_id || '').trim();
        const savedAnalysisHash = String(payload.analysis_content_hash || '').trim();
        const savedEditorSignature = String(payload.editor_signature || '').trim();
        const savedSchemaVersion = String(payload.overlay_schema_version || '').trim();

        if (current.post_id && savedPostId && current.post_id !== savedPostId) return false;
        if (current.run_id && savedRunId && current.run_id !== savedRunId) return false;
        if (current.analysis_content_hash && savedAnalysisHash && current.analysis_content_hash !== savedAnalysisHash) return false;
        if (current.editor_signature && savedEditorSignature && current.editor_signature !== savedEditorSignature) return false;
        if (current.overlay_schema_version && savedSchemaVersion && current.overlay_schema_version !== savedSchemaVersion) return false;

        return true;
    }

    function attachBeforeUnloadGuard() {
        if (state.beforeUnloadHandler || typeof window === 'undefined') return;
        state.beforeUnloadHandler = (event) => {
            if (!state.open || !state.overlayDirty) return;
            persistOverlayDraft('beforeunload');
            event.preventDefault();
            event.returnValue = '';
            return '';
        };
        window.addEventListener('beforeunload', state.beforeUnloadHandler);
    }

    function detachBeforeUnloadGuard() {
        if (!state.beforeUnloadHandler || typeof window === 'undefined') return;
        window.removeEventListener('beforeunload', state.beforeUnloadHandler);
        state.beforeUnloadHandler = null;
    }

    function setOverlayDirty(nextDirty) {
        const dirty = nextDirty === true;
        state.overlayDirty = dirty;
        if (dirty) {
            attachBeforeUnloadGuard();
        } else {
            detachBeforeUnloadGuard();
        }
    }

    function scheduleOverlayDraftSave(reason) {
        if (!state.open) return;
        if (state.draftSaveTimer) {
            clearTimeout(state.draftSaveTimer);
            state.draftSaveTimer = null;
        }
        state.draftSaveTimer = setTimeout(() => {
            state.draftSaveTimer = null;
            persistOverlayDraft(reason || 'debounced');
        }, 280);
    }

    function clearOverlayDraft() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.removeItem(getOverlayDraftStorageKey());
        } catch (e) {
        }
    }

    function captureOverlayDraftPayload() {
        if (!state.overlayContent) return null;
        const bodies = Array.from(state.overlayContent.querySelectorAll('.aivi-overlay-block-body[data-editable="true"]'));
        if (!bodies.length) return null;
        const post = readEditorPost();
        const blocks = [];
        bodies.forEach((body, index) => {
            const wrapper = body.closest('.aivi-overlay-block');
            const nodeRef = wrapper ? String(wrapper.getAttribute('data-node-ref') || '') : '';
            const html = extractEditableHtml(body);
            if (!html || !html.trim()) return;
            blocks.push({
                node_ref: nodeRef,
                order: index,
                html: html
            });
        });
        if (!blocks.length) return null;
        const compatibility = getOverlayDraftCompatibilityState();
        return {
            version: OVERLAY_DRAFT_VERSION,
            saved_at: new Date().toISOString(),
            post_id: post && post.id ? String(post.id) : '',
            run_id: compatibility.run_id,
            analysis_content_hash: compatibility.analysis_content_hash,
            editor_signature: compatibility.editor_signature,
            overlay_schema_version: compatibility.overlay_schema_version,
            blocks: blocks
        };
    }

    function persistOverlayDraft(reason) {
        if (typeof localStorage === 'undefined') return;
        if (!state.open || !state.overlayDirty) return;
        const payload = captureOverlayDraftPayload();
        if (!payload) return;
        try {
            localStorage.setItem(getOverlayDraftStorageKey(), JSON.stringify(payload));
            debugLog('info', 'Overlay draft saved', {
                reason: reason || 'manual',
                blocks: Array.isArray(payload.blocks) ? payload.blocks.length : 0
            });
        } catch (e) {
            debugLog('warn', 'Overlay draft save failed', { error: e && e.message });
        }
    }

    function restoreOverlayDraftIfAvailable() {
        if (state.draftRestoreAttempted || typeof localStorage === 'undefined' || !state.overlayContent) return;
        state.draftRestoreAttempted = true;
        try {
            const raw = localStorage.getItem(getOverlayDraftStorageKey());
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.blocks) || !parsed.blocks.length) return;
            if (!isOverlayDraftCompatible(parsed)) {
                clearOverlayDraft();
                return;
            }
            const editableBodies = Array.from(state.overlayContent.querySelectorAll('.aivi-overlay-block-body[data-editable="true"]'));
            if (!editableBodies.length) return;
            let restored = 0;
            parsed.blocks.forEach((entry) => {
                if (!entry || typeof entry.html !== 'string' || !entry.html.trim()) return;
                let body = null;
                const nodeRef = String(entry.node_ref || '').trim();
                if (nodeRef) {
                    const safeRef = nodeRef.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    body = state.overlayContent.querySelector(`[data-node-ref="${safeRef}"] .aivi-overlay-block-body[data-editable="true"]`);
                }
                if (!body && Number.isFinite(Number(entry.order))) {
                    body = editableBodies[Number(entry.order)] || null;
                }
                if (!body) return;
                body.innerHTML = entry.html;
                markOverlayBodyDirty(body);
                restored += 1;
            });
            if (restored > 0) {
                setOverlayDirty(true);
                setMetaStatus(`Restored ${restored} unsaved edit${restored === 1 ? '' : 's'} from draft`);
            }
        } catch (e) {
            debugLog('warn', 'Overlay draft restore failed', { error: e && e.message });
        }
    }

    function getGuardrailState() {
        const cfg = getConfig();
        const text = getUiText();
        const report = state.lastReport || {};
        const accountState = (cfg.accountState && typeof cfg.accountState === 'object') ? cfg.accountState : {};
        const hasCompletedReport = !!(
            report.run_id ||
            report.analysis_summary ||
            report.overlay_content ||
            report.result ||
            report.completed_at
        );
        const hasConnectedAccount = accountState.connected === true &&
            String(accountState.connectionStatus || accountState.connection_status || '').toLowerCase() === 'connected';
        if (state.isStale && isAutoStaleDetectionEnabled()) {
            return { message: 'Analysis results stale — please re-run analysis', type: 'warning', blockAi: true };
        }
        if (cfg.isEnabled === false) {
            return { message: text.plugin_disabled || 'AiVI is currently disabled for this site. Contact support if this was unexpected.', type: 'error', blockAi: true };
        }
        if (!cfg.backendConfigured && !hasCompletedReport && !hasConnectedAccount) {
            return { message: text.backend_not_configured || 'AiVI is not ready on this site yet. Connect your AiVI account or contact support.', type: 'error', blockAi: true };
        }
        const aiUnavailable = report.error === 'ai_unavailable' || report.status === 'unavailable' || report.aiAvailable === false || report.ai_available === false;
        if (aiUnavailable) {
            return { message: text.ai_unavailable || 'AI analysis unavailable. Please check your backend configuration.', type: 'warning', blockAi: true };
        }
        return { message: '', type: '', blockAi: false };
    }

    async function callRest(path, method, body) {
        const { restBase, nonce } = getConfig();
        const url = String(restBase).replace(/\/$/, '') + path;
        const headers = { 'Content-Type': 'application/json' };
        if (nonce) headers['X-WP-Nonce'] = nonce;
        const opts = { method: method || 'GET', headers: headers };
        if (body) {
            opts.body = JSON.stringify(body);
        }
        const resp = await fetch(url, opts);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { data = text; }
        return { ok: resp.ok, status: resp.status, data };
    }

    function getDocumentMetaPath(postId) {
        const normalized = Number(postId || 0);
        if (!Number.isFinite(normalized) || normalized <= 0) return '';
        return `/document-meta/${normalized}`;
    }

    function getCachedDocumentMeta(postId) {
        const normalized = Number(postId || 0);
        if (!Number.isFinite(normalized) || normalized <= 0) return null;
        return state.documentMetaCache.get(String(normalized)) || null;
    }

    function setCachedDocumentMeta(postId, documentMeta) {
        const normalized = Number(postId || 0);
        if (!Number.isFinite(normalized) || normalized <= 0) return null;
        const value = documentMeta && typeof documentMeta === 'object'
            ? {
                post_id: normalized,
                title: normalizeText(documentMeta.title || ''),
                meta_description: normalizeText(documentMeta.meta_description || ''),
                canonical_url: normalizeText(documentMeta.canonical_url || ''),
                lang: normalizeText(documentMeta.lang || '')
            }
            : null;
        if (value) {
            state.documentMetaCache.set(String(normalized), value);
        } else {
            state.documentMetaCache.delete(String(normalized));
        }
        return value;
    }

    async function fetchDocumentMeta(postId) {
        const path = getDocumentMetaPath(postId);
        if (!path) return null;
        const cached = getCachedDocumentMeta(postId);
        if (cached) return cached;
        const response = await callRest(path, 'GET');
        if (!response.ok || !response.data || response.data.ok !== true || !response.data.document_meta) {
            return null;
        }
        return setCachedDocumentMeta(postId, response.data.document_meta);
    }

    async function saveDocumentMeta(postId, payload) {
        const path = getDocumentMetaPath(postId);
        if (!path) return { ok: false, error: 'missing_post_id' };
        const response = await callRest(path, 'POST', payload);
        if (!response.ok || !response.data || response.data.ok !== true || !response.data.document_meta) {
            return { ok: false, error: 'save_failed', response };
        }
        return { ok: true, documentMeta: setCachedDocumentMeta(postId, response.data.document_meta) };
    }

    function syncEditorTitleValue(nextTitle) {
        const title = normalizeText(nextTitle || '');
        if (!title) return;
        try {
            if (wp && wp.data && typeof wp.data.dispatch === 'function') {
                const editorDispatcher = wp.data.dispatch('core/editor');
                if (editorDispatcher && typeof editorDispatcher.editPost === 'function') {
                    editorDispatcher.editPost({ title });
                }
            }
        } catch (e) {
        }
        try {
            const titleEl = document.getElementById('title');
            if (titleEl) {
                titleEl.value = title;
                dispatchDomInputEvents(titleEl);
            }
        } catch (e) {
        }
        if (state.overlayContentData && typeof state.overlayContentData === 'object') {
            state.overlayContentData.title = title;
        }
        renderOverlayDocumentHeader(getBlocks());
    }

    function readEditorPost() {
        try {
            if (select && select('core/editor') && typeof select('core/editor').getCurrentPost === 'function') {
                const editorStore = select('core/editor');
                const post = editorStore.getCurrentPost();
                const editedContent = editorStore && typeof editorStore.getEditedPostContent === 'function'
                    ? editorStore.getEditedPostContent()
                    : '';
                if (post) {
                    const content = editedContent
                        || ((typeof post.content === 'string') ? post.content : (post.content && post.content.raw ? post.content.raw : (post.raw || '')));
                    const title = (post.title && (typeof post.title === 'string' ? post.title : (post.title.raw || ''))) || '';
                    const cachedMeta = getCachedDocumentMeta(post.id || 0);
                    return {
                        id: post.id || null,
                        title: title || '',
                        content: content || '',
                        author: post.author || 0,
                        metaDescription: cachedMeta && cachedMeta.meta_description ? cachedMeta.meta_description : '',
                        canonicalUrl: cachedMeta && cachedMeta.canonical_url ? cachedMeta.canonical_url : '',
                        lang: cachedMeta && cachedMeta.lang ? cachedMeta.lang : ''
                    };
                }
            }
        } catch (e) { }
        try {
            const titleEl = document.getElementById('title');
            const contentEl = document.getElementById('content');
            const postId = document.getElementById('post_ID') ? parseInt(document.getElementById('post_ID').value, 10) : null;
            const cachedMeta = getCachedDocumentMeta(postId || 0);
            return {
                id: postId,
                title: titleEl ? titleEl.value : '',
                content: contentEl ? contentEl.value : '',
                author: 0,
                metaDescription: cachedMeta && cachedMeta.meta_description ? cachedMeta.meta_description : '',
                canonicalUrl: cachedMeta && cachedMeta.canonical_url ? cachedMeta.canonical_url : '',
                lang: cachedMeta && cachedMeta.lang ? cachedMeta.lang : ''
            };
        } catch (e) {
            return null;
        }
    }

    function getOverlayEditorRuntime(blocksInput, editorPostInput) {
        const blocks = Array.isArray(blocksInput) ? blocksInput : [];
        const editorPost = editorPostInput && typeof editorPostInput === 'object'
            ? editorPostInput
            : readEditorPost();
        const canonicalContent = editorPost && typeof editorPost.content === 'string'
            ? editorPost.content.trim()
            : '';
        const hasServerPreview = !!(
            state.overlayContentData
            && typeof state.overlayContentData.highlighted_html === 'string'
            && state.overlayContentData.highlighted_html.trim()
        );

        if (blocks.length > 0) {
            return {
                renderSource: 'block_editor_blocks',
                safeApply: true,
                applyMode: 'block_editor',
                blockedReason: '',
                blockedMessage: ''
            };
        }

        if (hasBlockEditorCanvas()) {
            return {
                renderSource: hasServerPreview ? 'server_preview' : 'editor_loading_preview',
                safeApply: false,
                applyMode: 'preview_only',
                blockedReason: 'block_editor_unready',
                blockedMessage: 'AiVI is waiting for the block editor to finish loading before it can safely apply changes.'
            };
        }

        if (canonicalContent) {
            return {
                renderSource: 'classic_editor_html',
                safeApply: true,
                applyMode: 'classic_editor_html',
                blockedReason: '',
                blockedMessage: ''
            };
        }

        if (hasServerPreview) {
            return {
                renderSource: 'server_preview',
                safeApply: false,
                applyMode: 'preview_only',
                blockedReason: 'preview_only',
                blockedMessage: 'AiVI can preview this analysis, but editor content is not safely available for apply yet.'
            };
        }

        return {
            renderSource: 'unavailable',
            safeApply: false,
            applyMode: 'unavailable',
            blockedReason: 'editor_content_unavailable',
            blockedMessage: 'AiVI could not verify editor content safely enough to apply changes yet.'
        };
    }

    function buildLiveManifest(blocks) {
        const nodes = [];
        const texts = [];
        (blocks || []).forEach((b, i) => {
            const html = buildBlockHtml(b) || '';
            const text = htmlToText(html);
            const ref = 'block-' + i;
            nodes.push({ ref, type: b.name || 'block', text });
            texts.push(text);
            if (Array.isArray(b.innerBlocks)) {
                b.innerBlocks.forEach((ib, j) => {
                    const ih = buildBlockHtml(ib) || '';
                    const it = htmlToText(ih);
                    const iref = 'block-' + i + '-inner-' + j;
                    nodes.push({ ref: iref, type: ib.name || 'block', text: it });
                    texts.push(it);
                });
            }
        });
        return { nodes, plain_text: texts.join('\n\n') };
    }

    function isHeadingNodeType(type) {
        const normalized = String(type || '').toLowerCase().trim();
        return normalized === 'core/heading' || normalized === 'heading' || /\/h[1-6]$/.test(normalized);
    }

    function collectHeadingChain(nodes, nodeIndex) {
        if (!Array.isArray(nodes) || nodeIndex < 0 || nodeIndex >= nodes.length) return [];
        const chain = [];
        for (let idx = nodeIndex; idx >= 0; idx -= 1) {
            const node = nodes[idx];
            if (!node || !isHeadingNodeType(node.type)) continue;
            const text = String(node.text || '').trim();
            if (!text) continue;
            chain.unshift(text);
            if (chain.length >= 3) break;
        }
        return chain;
    }

    function safeSliceText(value, maxLen) {
        const text = String(value || '');
        if (!Number.isFinite(maxLen) || maxLen <= 0) return text;
        return text.length > maxLen ? text.slice(0, maxLen) : text;
    }

    function isLikelySectionBoundaryText(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length < 1 || words.length > 16) return false;
        if (text.length > 140) return false;
        if (/:$/.test(text)) return true;
        if (/\?$/.test(text) && words.length <= 12) return true;
        if (/[.!]$/.test(text)) return false;
        if (/[,;]/.test(text)) return false;
        return /^[A-Z0-9]/.test(text);
    }

    function isSectionBoundaryNodeForContext(node) {
        if (!node || typeof node !== 'object') return false;
        if (isHeadingNodeType(node.type)) return true;
        const normalizedType = String(node.type || '').toLowerCase().trim();
        const paragraphLike = normalizedType === 'core/paragraph'
            || normalizedType === 'paragraph'
            || normalizedType.indexOf('paragraph') !== -1;
        if (!paragraphLike) return false;
        return isLikelySectionBoundaryText(node.text || '');
    }

    function resolveSectionBounds(nodes, anchorIndex, maxNodes) {
        if (!Array.isArray(nodes) || !nodes.length) return null;
        if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= nodes.length) return null;
        const boundedMaxNodes = Number.isFinite(maxNodes) ? Math.max(4, Math.min(12, Number(maxNodes))) : 8;

        let sectionStart = 0;
        for (let idx = anchorIndex; idx >= 0; idx -= 1) {
            if (isSectionBoundaryNodeForContext(nodes[idx])) {
                sectionStart = idx;
                break;
            }
        }

        let sectionEnd = nodes.length - 1;
        for (let idx = anchorIndex + 1; idx < nodes.length; idx += 1) {
            if (isSectionBoundaryNodeForContext(nodes[idx])) {
                sectionEnd = idx - 1;
                break;
            }
        }

        if (sectionEnd < sectionStart) sectionEnd = sectionStart;
        if ((sectionEnd - sectionStart + 1) > boundedMaxNodes) {
            sectionEnd = sectionStart + boundedMaxNodes - 1;
        }

        return { start: sectionStart, end: sectionEnd };
    }

    function buildIssueContextPacket(item, rewriteContext, blocks, manifest) {
        const check = item && item.check ? item.check : {};
        const highlight = item && item.highlight ? item.highlight : {};
        const analysisRef = rewriteContext && rewriteContext.analysis_ref ? rewriteContext.analysis_ref : null;
        const rewriteTarget = rewriteContext && rewriteContext.rewrite_target ? rewriteContext.rewrite_target : null;
        const nodes = manifest && Array.isArray(manifest.nodes) ? manifest.nodes : [];
        const primaryNodeRef = String(
            (rewriteTarget && rewriteTarget.primary_node_ref)
            || (highlight && (highlight.node_ref || highlight.nodeRef))
            || ''
        ).trim();
        const targetNodeRefs = rewriteTarget && Array.isArray(rewriteTarget.node_refs)
            ? rewriteTarget.node_refs.map((ref) => String(ref || '').trim()).filter(Boolean)
            : [];
        const contextWindow = rewriteTarget && Number.isFinite(Number(rewriteTarget.rewrite_context_window))
            ? Math.max(1, Math.min(6, Number(rewriteTarget.rewrite_context_window)))
            : 2;
        const maxSectionNodes = Math.max(4, Math.min(12, contextWindow * 3));

        let nodeIndex = primaryNodeRef ? nodes.findIndex((node) => String(node.ref || '') === primaryNodeRef) : -1;
        if (nodeIndex < 0 && targetNodeRefs.length > 0) {
            for (let i = 0; i < targetNodeRefs.length; i += 1) {
                const idx = nodes.findIndex((node) => String(node.ref || '') === targetNodeRefs[i]);
                if (idx >= 0) {
                    nodeIndex = idx;
                    break;
                }
            }
        }
        if (nodeIndex < 0) {
            nodeIndex = nodes.length ? 0 : -1;
        }

        const sectionBounds = nodeIndex >= 0
            ? resolveSectionBounds(nodes, nodeIndex, maxSectionNodes)
            : null;
        const sectionStart = sectionBounds ? sectionBounds.start : 0;
        const sectionEnd = sectionBounds ? sectionBounds.end : Math.min(nodes.length - 1, 2);
        const sectionNodes = nodes.slice(sectionStart, sectionEnd + 1);
        const surrounding = sectionNodes.map((node) => ({
            ref: String(node.ref || ''),
            type: String(node.type || ''),
            text: safeSliceText(node.text || '', 360)
        }));
        const headingChain = collectHeadingChain(nodes, nodeIndex >= 0 ? nodeIndex : 0);
        const sectionText = safeSliceText(
            sectionNodes.map((node) => String(node.text || '')).filter(Boolean).join('\n\n'),
            3600
        );
        const failureReason = String(
            (highlight && (highlight.failure_reason || highlight.anchor_status))
            || (check && (check.failure_reason || check.anchor_status))
            || ''
        ).trim();

        return {
            run_id: analysisRef && analysisRef.run_id ? String(analysisRef.run_id) : '',
            check_id: analysisRef && analysisRef.check_id
                ? String(analysisRef.check_id)
                : String(check.check_id || check.id || ''),
            check_name: String(check.name || check.check_name || ''),
            category_id: String(check.category_id || ''),
            verdict: String(check.ui_verdict || check.verdict || ''),
            message: String(highlight.message || check.message || check.explanation || '').slice(0, 500),
            failure_reason: failureReason || null,
            snippet: String(highlight.snippet || highlight.text || '').slice(0, 500),
            node_ref: primaryNodeRef || null,
            target_mode: rewriteTarget && rewriteTarget.mode ? String(rewriteTarget.mode) : null,
            target_operation: rewriteTarget && rewriteTarget.operation ? String(rewriteTarget.operation) : null,
            target_node_refs: targetNodeRefs.slice(0, 12),
            instance_index: analysisRef && Number.isFinite(Number(analysisRef.instance_index))
                ? Number(analysisRef.instance_index)
                : (Number.isFinite(Number(highlight.instance_index)) ? Number(highlight.instance_index) : 0),
            heading_chain: headingChain,
            surrounding_nodes: surrounding,
            section_range: {
                start_ref: sectionNodes[0] ? String(sectionNodes[0].ref || '') : null,
                end_ref: sectionNodes[sectionNodes.length - 1] ? String(sectionNodes[sectionNodes.length - 1].ref || '') : null,
                node_count: sectionNodes.length
            },
            section_nodes: surrounding,
            section_text: sectionText,
            post_context: {
                total_blocks: Array.isArray(blocks) ? blocks.length : 0,
                plain_text_chars: manifest && typeof manifest.plain_text === 'string' ? manifest.plain_text.length : 0
            }
        };
    }

    function clonePlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return { ...value };
        }
    }

    function firstObject(...values) {
        for (let i = 0; i < values.length; i += 1) {
            const cloned = clonePlainObject(values[i]);
            if (cloned) return cloned;
        }
        return null;
    }

    function inferOperationFromMode(mode) {
        const normalized = String(mode || '').toLowerCase().trim();
        if (normalized === 'inline_span' || normalized === 'replace_span') return 'replace_span';
        if (normalized === 'convert_to_list') return 'convert_to_list';
        if (normalized === 'heading_support_range') return 'heading_support_range';
        if (normalized === 'block' || normalized === 'section' || normalized === 'replace_block') return 'replace_block';
        return 'replace_span';
    }

    function isStructuralRewriteMode(mode) {
        const normalized = String(mode || '').toLowerCase().trim();
        return normalized === 'heading_support_range'
            || normalized === 'block'
            || normalized === 'section'
            || normalized === 'replace_block'
            || normalized === 'convert_to_list';
    }

    function isStructuralRewriteOperation(operation) {
        const normalized = String(operation || '').toLowerCase().trim();
        return normalized === 'replace_block'
            || normalized === 'convert_to_list'
            || normalized === 'convert_to_steps'
            || normalized === 'heading_support_range'
            || normalized === 'insert_after_heading'
            || normalized === 'append_support';
    }

    function hasStructuralRewriteIntentHints(repairIntent) {
        if (!repairIntent || typeof repairIntent !== 'object') return false;
        const fragments = [];
        if (typeof repairIntent.instruction === 'string') fragments.push(repairIntent.instruction);
        if (Array.isArray(repairIntent.must_change)) {
            fragments.push(repairIntent.must_change.join(' '));
        }
        if (Array.isArray(repairIntent.must_preserve)) {
            fragments.push(repairIntent.must_preserve.join(' '));
        }
        const joined = fragments.join(' ').toLowerCase();
        if (!joined) return false;
        return joined.indexOf('supporting content') !== -1
            || joined.indexOf('targeted block') !== -1
            || joined.indexOf('section') !== -1
            || joined.indexOf('bullet list') !== -1
            || joined.indexOf('numbered list') !== -1
            || joined.indexOf('convert') !== -1
            || joined.indexOf('steps') !== -1;
    }

    function resolveItemRewriteContext(item) {
        const suggestionInfo = item && item.key && state.suggestions
            ? state.suggestions[item.key]
            : null;
        const resolvedTarget = firstObject(
            suggestionInfo && suggestionInfo.rewrite_target,
            item && item.rewrite_target,
            item && item.highlight && item.highlight.rewrite_target,
            item && item.check && item.check.rewrite_target
        );
        const repairIntent = firstObject(
            suggestionInfo && suggestionInfo.repair_intent,
            item && item.repair_intent,
            item && item.highlight && item.highlight.repair_intent,
            item && item.check && item.check.repair_intent
        );
        const analysisRef = firstObject(
            suggestionInfo && suggestionInfo.analysis_ref,
            item && item.analysis_ref,
            item && item.highlight && item.highlight.analysis_ref,
            item && item.check && item.check.analysis_ref
        );
        const checkId = String(
            (analysisRef && analysisRef.check_id)
            || (item && item.check && (item.check.check_id || item.check.id || item.check.name))
            || ''
        ).trim();
        const instanceCandidate = (analysisRef && analysisRef.instance_index !== undefined)
            ? analysisRef.instance_index
            : (item && item.highlight
                ? (item.highlight.instance_index !== undefined ? item.highlight.instance_index : item.highlight.index)
                : (item && item.instance_index));
        const instanceIndex = Number.isFinite(Number(instanceCandidate)) ? Number(instanceCandidate) : 0;
        const runId = String(
            (analysisRef && analysisRef.run_id)
            || (item && item.highlight && item.highlight.run_id)
            || (item && item.check && item.check.run_id)
            || (state.lastReport && state.lastReport.run_id)
            || ''
        ).trim();
        const hasAnchorRef = Boolean(
            (item && item.highlight && (item.highlight.node_ref || item.highlight.nodeRef))
            || (item && item.resolvedNodeRef)
        );
        const hasSnippetText = Boolean(
            item && item.highlight && String(item.highlight.snippet || item.highlight.text || '').trim()
        );
        const hasOffsetRange = Boolean(
            item
            && item.highlight
            && Number.isFinite(item.highlight.start)
            && Number.isFinite(item.highlight.end)
            && Number(item.highlight.end) > Number(item.highlight.start)
        );
        const structuralModeHint = isStructuralRewriteMode(resolvedTarget && resolvedTarget.mode)
            || isStructuralRewriteMode(item && item.rewrite_target && item.rewrite_target.mode)
            || isStructuralRewriteMode(item && item.check && item.check.rewrite_target && item.check.rewrite_target.mode);
        const structuralOperationHint = isStructuralRewriteOperation(resolvedTarget && resolvedTarget.operation)
            || isStructuralRewriteOperation(item && item.rewrite_target && item.rewrite_target.operation)
            || isStructuralRewriteOperation(item && item.check && item.check.rewrite_target && item.check.rewrite_target.operation);
        const structuralIntentHint = hasStructuralRewriteIntentHints(repairIntent);
        const hasStructuralRewriteHint = structuralModeHint || structuralOperationHint || structuralIntentHint;
        const fallbackInlineAllowed = hasAnchorRef && (hasSnippetText || hasOffsetRange) && (
            !item
            || !item.highlight
            || !item.highlight.scope
            || ['span', 'sentence'].indexOf(String(item.highlight.scope).toLowerCase().trim()) !== -1
        ) && !hasStructuralRewriteHint;

        let target = null;
        if (resolvedTarget) {
            target = { ...resolvedTarget };
            if (!target.primary_node_ref) {
                target.primary_node_ref = (item && item.highlight && (item.highlight.node_ref || item.highlight.nodeRef))
                    || (item && item.resolvedNodeRef)
                    || '';
            }
            if (!Array.isArray(target.node_refs) || !target.node_refs.length) {
                target.node_refs = target.primary_node_ref ? [target.primary_node_ref] : [];
            }
            if (!target.target_text) {
                target.target_text = item && item.highlight
                    ? String(item.highlight.snippet || item.highlight.text || '').trim()
                    : '';
            }
            if (!target.mode) {
                target.mode = 'legacy';
            }
            if (!target.operation) {
                target.operation = inferOperationFromMode(target.mode);
            }
            if (!isStructuralRewriteMode(target.mode) && isStructuralRewriteOperation(target.operation)) {
                target.mode = 'section';
                if (target.start !== undefined) target.start = null;
                if (target.end !== undefined) target.end = null;
            }
            if (!Object.prototype.hasOwnProperty.call(target, 'actionable')) {
                const hasPrimaryRef = !!target.primary_node_ref || (Array.isArray(target.node_refs) && target.node_refs.length > 0);
                if (isStructuralRewriteMode(target.mode)) {
                    target.actionable = hasPrimaryRef || !!target.target_text;
                } else {
                    target.actionable = hasPrimaryRef && (!!target.target_text || hasOffsetRange);
                }
            } else {
                target.actionable = target.actionable === true;
            }
        } else if (fallbackInlineAllowed) {
            target = {
                actionable: true,
                mode: 'inline_span',
                operation: 'replace_span',
                primary_node_ref: (item && item.highlight && (item.highlight.node_ref || item.highlight.nodeRef))
                    || (item && item.resolvedNodeRef)
                    || '',
                node_refs: [],
                target_text: item && item.highlight
                    ? String(item.highlight.snippet || item.highlight.text || '').trim()
                    : '',
                quote: item && item.highlight && item.highlight.snippet
                    ? { exact: String(item.highlight.snippet).trim() }
                    : null,
                start: item && item.highlight && Number.isFinite(item.highlight.start) ? Number(item.highlight.start) : null,
                end: item && item.highlight && Number.isFinite(item.highlight.end) ? Number(item.highlight.end) : null,
                resolver_reason: 'ui_inline_fallback'
            };
            if (target.primary_node_ref) {
                target.node_refs = [target.primary_node_ref];
            }
        }

        const normalizedAnalysisRef = analysisRef || ((runId || checkId)
            ? {
                run_id: runId || null,
                check_id: checkId || null,
                instance_index: instanceIndex
            }
            : null);

        return {
            rewrite_target: target,
            repair_intent: repairIntent || null,
            analysis_ref: normalizedAnalysisRef
        };
    }

    function extractIssuesFromReport() {
        const report = state.lastReport;
        if (!report) return [];
        const items = [];
        const overlayHighlights = state.overlayContentData && Array.isArray(state.overlayContentData.highlights)
            ? state.overlayContentData.highlights
            : [];
        const overlayHighlightByKey = new Map();
        overlayHighlights.forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const checkId = String(entry.check_id || '').trim();
            const instanceIndex = Number.isFinite(Number(entry.instance_index)) ? Number(entry.instance_index) : 0;
            if (!checkId) return;
            overlayHighlightByKey.set(`${checkId}:${instanceIndex}`, entry);
        });
        const buildFirstInstanceFallbackHighlight = (source) => {
            if (!source || typeof source !== 'object') return null;
            const snippet = String(source.first_instance_snippet || source.snippet || '').trim();
            const nodeRef = String(source.first_instance_node_ref || source.node_ref || '').trim();
            const signature = String(source.first_instance_signature || source.signature || '').trim();
            const startRaw = source.first_instance_start;
            const endRaw = source.first_instance_end;
            const start = Number.isFinite(startRaw) ? Number(startRaw) : null;
            const end = Number.isFinite(endRaw) ? Number(endRaw) : null;
            const hasTarget = !!snippet || !!nodeRef || !!signature || (start !== null && end !== null);
            if (!hasTarget) return null;
            const fallback = {
                snippet: snippet || '',
                text: snippet || '',
                node_ref: nodeRef || '',
                signature: signature || '',
                scope: 'span'
            };
            if (start !== null) fallback.start = start;
            if (end !== null) fallback.end = end;
            return fallback;
        };
        const normalizeVerdict = (source) => {
            if (!source || typeof source !== 'object') return '';
            let verdict = '';
            if (typeof source.ui_verdict === 'string' && source.ui_verdict.trim()) {
                verdict = source.ui_verdict;
            } else if (typeof source.verdict === 'string' && source.verdict.trim()) {
                verdict = source.verdict;
            } else if (source.passed === true) {
                verdict = 'pass';
            } else if (source.passed === false) {
                verdict = 'fail';
            } else if (typeof source.status === 'string' && source.status.trim()) {
                verdict = source.status;
            }

            const normalized = String(verdict).toLowerCase().trim();
            if (normalized === 'failed' || normalized === 'issue' || normalized === 'warning') {
                return 'fail';
            }
            if (normalized === 'ok' || normalized === 'passed') {
                return 'pass';
            }
            if (normalized === 'fail' || normalized === 'partial' || normalized === 'pass') {
                return normalized;
            }
            return '';
        };
        const isHighlightableVerdict = (source) => {
            const verdict = normalizeVerdict(source);
            return verdict === 'fail' || verdict === 'partial';
        };
        if (report.analysis_summary && Array.isArray(report.analysis_summary.categories)) {
            report.analysis_summary.categories.forEach(cat => {
                (cat.issues || []).forEach(issue => {
                    if (!isHighlightableVerdict(issue)) return;
                    const checkId = issue.check_id || issue.id || issue.name || 'issue';
                    const issueRewriteTarget = clonePlainObject(issue.rewrite_target);
                    const issueRepairIntent = clonePlainObject(issue.repair_intent);
                    const issueAnalysisRef = firstObject(
                        issue.analysis_ref,
                        {
                            run_id: report.run_id || report.analysis_summary?.run_id || '',
                            check_id: checkId,
                            instance_index: 0
                        }
                    );
                    const highlights = Array.isArray(issue.highlights) ? issue.highlights : [];
                    if (highlights.length) {
                        highlights.forEach(h => {
                            const instanceIndex = typeof h.instance_index === 'number'
                                ? h.instance_index
                                : (typeof h.index === 'number' ? h.index : 0);
                            const analysisRef = firstObject(
                                h && h.analysis_ref,
                                overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) && overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`).analysis_ref,
                                issueAnalysisRef,
                                {
                                    run_id: report.run_id || report.analysis_summary?.run_id || '',
                                    check_id: checkId,
                                    instance_index: instanceIndex
                                }
                            );
                            items.push({
                                key: checkId + ':' + String(instanceIndex),
                                check: issue,
                                rewrite_target: firstObject(
                                    h && h.rewrite_target,
                                    overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) && overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`).rewrite_target,
                                    issueRewriteTarget
                                ),
                                repair_intent: firstObject(
                                    h && h.repair_intent,
                                    overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) && overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`).repair_intent,
                                    issueRepairIntent
                                ),
                                analysis_ref: analysisRef,
                                highlight: {
                                    ...h,
                                    instance_index: instanceIndex
                                }
                            });
                        });
                    } else {
                        const fallbackHighlight = buildFirstInstanceFallbackHighlight(issue);
                        const instanceIndex = (fallbackHighlight && typeof fallbackHighlight.instance_index === 'number')
                            ? fallbackHighlight.instance_index
                            : 0;
                        const overlayMatch = overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) || null;
                        items.push({
                            key: checkId + ':' + String(instanceIndex),
                            check: issue,
                            rewrite_target: firstObject(overlayMatch && overlayMatch.rewrite_target, issueRewriteTarget),
                            repair_intent: firstObject(overlayMatch && overlayMatch.repair_intent, issueRepairIntent),
                            analysis_ref: firstObject(
                                overlayMatch && overlayMatch.analysis_ref,
                                issueAnalysisRef,
                                {
                                    run_id: report.run_id || report.analysis_summary?.run_id || '',
                                    check_id: checkId,
                                    instance_index: instanceIndex
                                }
                            ),
                            highlight: fallbackHighlight || {}
                        });
                    }
                });
            });
        } else if (Array.isArray(report.checks)) {
            report.checks.forEach(c => {
                if (!isHighlightableVerdict(c)) return;
                const checkId = c.check_id || c.id || c.name || 'check';
                const checkRewriteTarget = clonePlainObject(c.rewrite_target);
                const checkRepairIntent = clonePlainObject(c.repair_intent);
                const checkAnalysisRef = firstObject(
                    c.analysis_ref,
                    {
                        run_id: report.run_id || '',
                        check_id: checkId,
                        instance_index: 0
                    }
                );
                const highlights = Array.isArray(c.highlights) ? c.highlights : [];
                if (highlights.length) {
                    highlights.forEach(h => {
                        const instanceIndex = typeof h.instance_index === 'number'
                            ? h.instance_index
                            : (typeof h.index === 'number' ? h.index : 0);
                        const analysisRef = firstObject(
                            h && h.analysis_ref,
                            overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) && overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`).analysis_ref,
                            checkAnalysisRef,
                            {
                                run_id: report.run_id || '',
                                check_id: checkId,
                                instance_index: instanceIndex
                            }
                        );
                        items.push({
                            key: checkId + ':' + String(instanceIndex),
                            check: c,
                            rewrite_target: firstObject(
                                h && h.rewrite_target,
                                overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) && overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`).rewrite_target,
                                checkRewriteTarget
                            ),
                            repair_intent: firstObject(
                                h && h.repair_intent,
                                overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) && overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`).repair_intent,
                                checkRepairIntent
                            ),
                            analysis_ref: analysisRef,
                            highlight: {
                                ...h,
                                instance_index: instanceIndex
                            }
                        });
                    });
                } else {
                    const fallbackHighlight = buildFirstInstanceFallbackHighlight(c);
                    const instanceIndex = (fallbackHighlight && typeof fallbackHighlight.instance_index === 'number')
                        ? fallbackHighlight.instance_index
                        : 0;
                    const overlayMatch = overlayHighlightByKey.get(`${checkId}:${String(instanceIndex)}`) || null;
                    items.push({
                        key: checkId + ':' + String(instanceIndex),
                        check: c,
                        rewrite_target: firstObject(overlayMatch && overlayMatch.rewrite_target, checkRewriteTarget),
                        repair_intent: firstObject(overlayMatch && overlayMatch.repair_intent, checkRepairIntent),
                        analysis_ref: firstObject(
                            overlayMatch && overlayMatch.analysis_ref,
                            checkAnalysisRef,
                            {
                                run_id: report.run_id || '',
                                check_id: checkId,
                                instance_index: instanceIndex
                            }
                        ),
                        highlight: fallbackHighlight || {}
                    });
                }
            });
        }
        return items;
    }

    function normalizeOverlayVerdictValue(verdict) {
        const normalized = String(verdict || '').toLowerCase().trim();
        if (!normalized) return '';
        if (normalized === 'failed' || normalized === 'issue' || normalized === 'warning') {
            return 'fail';
        }
        if (normalized === 'ok' || normalized === 'passed') {
            return 'pass';
        }
        if (normalized === 'fail' || normalized === 'partial' || normalized === 'pass') {
            return normalized;
        }
        return '';
    }

    function resolveItemSeverity(item) {
        if (!item || typeof item !== 'object') return 'fail';
        const highlight = item.highlight && typeof item.highlight === 'object' ? item.highlight : {};
        const check = item.check && typeof item.check === 'object' ? item.check : {};
        const verdict = normalizeOverlayVerdictValue(
            highlight.ui_verdict
            || highlight.verdict
            || highlight.severity
            || check.ui_verdict
            || check.verdict
            || check.status
            || ''
        );
        if (verdict === 'partial') return 'partial';
        if (verdict === 'pass') return 'pass';
        return 'fail';
    }

    function applySeverityToHighlightNode(node, severity) {
        if (!node || !node.classList) return;
        const normalized = severity === 'partial' || severity === 'pass' ? severity : 'fail';
        node.classList.remove('aivi-overlay-highlight-fail', 'aivi-overlay-highlight-partial', 'aivi-overlay-highlight-pass');
        node.classList.add(`aivi-overlay-highlight-${normalized}`);
        node.dataset.severity = normalized;
    }

    function getSeverityPalette(severity) {
        if (severity === 'partial') {
            return {
                borderColor: '#d97706',
                borderStyle: 'dashed',
                background: 'rgba(217,119,6,0.12)'
            };
        }
        if (severity === 'pass') {
            return {
                borderColor: '#16a34a',
                borderStyle: 'solid',
                background: 'rgba(22,163,74,0.12)'
            };
        }
        return {
            borderColor: '#dc2626',
            borderStyle: 'solid',
            background: 'rgba(220,38,38,0.10)'
        };
    }

    function buildSummaryVerdictMap(report) {
        const verdictMap = new Map();
        if (!report || !report.analysis_summary || !Array.isArray(report.analysis_summary.categories)) {
            return verdictMap;
        }
        report.analysis_summary.categories.forEach((category) => {
            const issues = Array.isArray(category && category.issues) ? category.issues : [];
            issues.forEach((issue) => {
                const checkId = String(issue && (issue.check_id || issue.id) || '').trim();
                if (!checkId) return;
                const verdict = normalizeOverlayVerdictValue(issue.ui_verdict || issue.verdict);
                if (verdict) {
                    verdictMap.set(checkId, verdict);
                }
            });
        });
        return verdictMap;
    }

    function stripPassHighlightSpans(root, summaryVerdictMap) {
        if (!root) return 0;
        const verdictByCheck = summaryVerdictMap instanceof Map ? summaryVerdictMap : new Map();
        const spans = Array.from(root.querySelectorAll('.aivi-overlay-highlight'));
        let removedCount = 0;

        spans.forEach((span) => {
            const severity = normalizeOverlayVerdictValue(span.getAttribute('data-severity'));
            const checkId = String(span.getAttribute('data-check-id') || '').trim();
            const summaryVerdict = checkId ? verdictByCheck.get(checkId) : '';
            const shouldRemove = severity === 'pass' || summaryVerdict === 'pass';
            if (!shouldRemove) return;

            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            parent.removeChild(span);
            removedCount += 1;
        });

        return removedCount;
    }

    function collectOverlayRecommendations(overlayContentData) {
        if (!overlayContentData || typeof overlayContentData !== 'object') return [];
        const source = Array.isArray(overlayContentData.recommendations)
            ? overlayContentData.recommendations
            : (Array.isArray(overlayContentData.unhighlightable_issues)
                ? overlayContentData.unhighlightable_issues
                : []);
        const clientSuppressed = Array.isArray(state.inlineSuppressedRecommendations)
            ? state.inlineSuppressedRecommendations
            : [];
        const syntheticReasons = new Set([
            'synthetic_fallback',
            'missing_ai_checks',
            'chunk_parse_failure',
            'time_budget_exceeded',
            'truncated_response'
        ]);
        const seen = new Set();
        const buildRecommendationDedupKey = (issue) => {
            if (!issue || typeof issue !== 'object') return '';
            const checkId = String(issue.check_id || issue.id || issue.name || '').trim();
            const instanceIndex = Number.isFinite(Number(issue.instance_index)) ? Number(issue.instance_index) : null;
            const signature = String(issue.signature || '').trim();
            const snippet = String(issue.snippet || '').trim();
            if (checkId && instanceIndex !== null) return `${checkId}:${instanceIndex}`;
            if (checkId && signature) return `${checkId}:${signature}`;
            if (checkId && snippet) return `${checkId}:${snippet.slice(0, 120)}`;
            return checkId || snippet.slice(0, 120);
        };
        return source.concat(clientSuppressed).filter((issue) => {
            if (!issue || typeof issue !== 'object') return false;
            const verdict = normalizeOverlayVerdictValue(issue.ui_verdict || issue.verdict);
            if (verdict === 'pass') return false;
            const normalizedFailureReason = String(issue.failure_reason || '').trim().toLowerCase();
            if (syntheticReasons.has(normalizedFailureReason)) return false;
            const dedupKey = buildRecommendationDedupKey(issue);
            if (!dedupKey) return true;
            if (seen.has(dedupKey)) return false;
            seen.add(dedupKey);
            return true;
        });
    }

    function resetInlineSuppressedRecommendations() {
        state.inlineSuppressedRecommendations = [];
        state.inlineSuppressedRecommendationKeys = new Set();
    }

    function registerInlineSuppressedRecommendation(item, reason) {
        if (!item || typeof item !== 'object') return;
        const check = item.check && typeof item.check === 'object' ? item.check : {};
        const highlight = item.highlight && typeof item.highlight === 'object' ? item.highlight : {};
        const verdict = normalizeOverlayVerdictValue(
            highlight.ui_verdict
            || highlight.verdict
            || check.ui_verdict
            || check.verdict
            || check.status
            || ''
        );
        if (verdict === 'pass') return;
        const checkId = String(check.check_id || check.id || check.name || '').trim();
        if (!checkId) return;
        if (!(state.inlineSuppressedRecommendationKeys instanceof Set)) {
            state.inlineSuppressedRecommendationKeys = new Set();
        }
        if (!Array.isArray(state.inlineSuppressedRecommendations)) {
            state.inlineSuppressedRecommendations = [];
        }
        const instanceIndex = Number.isFinite(Number(highlight.instance_index))
            ? Number(highlight.instance_index)
            : (Number.isFinite(Number(highlight.index)) ? Number(highlight.index) : 0);
        const dedupKey = `${checkId}:${instanceIndex}`;
        if (state.inlineSuppressedRecommendationKeys.has(dedupKey)) return;
        state.inlineSuppressedRecommendationKeys.add(dedupKey);
        const message = sanitizeInlineIssueMessage(
            highlight.message || check.explanation || check.message || check.title || check.name || 'Issue detected',
            check
        );
        state.inlineSuppressedRecommendations.push({
            check_id: checkId,
            name: String(check.name || check.title || checkId),
            verdict: verdict || 'fail',
            ui_verdict: verdict || 'fail',
            message: message,
            explanation: message,
            snippet: String(highlight.snippet || highlight.text || '').trim(),
            node_ref: String(highlight.node_ref || highlight.nodeRef || item.resolvedNodeRef || '').trim(),
            signature: String(highlight.signature || '').trim(),
            instance_index: instanceIndex,
            failure_reason: reason || 'client_guardrail_inline_suppressed',
            provenance: String(check.provenance || 'ai')
        });
    }

    function buildIssueIndex(blocks) {
        const items = extractIssuesFromReport();
        state.issueMap = new Map();
        const highlightsByRef = new Map();
        if (!items.length) {
            return { items, highlightsByRef };
        }
        const liveManifest = buildLiveManifest(blocks || []);
        const nodes = Array.isArray(liveManifest.nodes) ? liveManifest.nodes : [];
        const serverBlockMap = state.lastManifest && Array.isArray(state.lastManifest.block_map) ? state.lastManifest.block_map : [];
        const signatureMap = new Map();
        const nodeRefMap = new Map();
        serverBlockMap.forEach((b) => {
            if (b && typeof b.signature === 'string') signatureMap.set(b.signature, b);
            if (b && typeof b.node_ref === 'string') nodeRefMap.set(b.node_ref, b);
        });
        items.forEach((item) => {
            const highlight = item.highlight || {};
            let ref = highlight.node_ref || highlight.nodeRef || '';
            const sig = typeof highlight.signature === 'string' ? highlight.signature : '';
            if (!ref && sig && signatureMap.has(sig)) {
                const block = signatureMap.get(sig);
                ref = block && block.node_ref ? block.node_ref : ref;
            }
            if (!ref) {
                const snippet = highlight.snippet || highlight.text || '';
                if (snippet) {
                    const target = normalizeText(snippet).toLowerCase();
                    const match = nodes.find((n) => normalizeText(n.text).toLowerCase().includes(target));
                    if (match) {
                        ref = match.ref;
                    }
                }
            }
            item.resolvedNodeRef = ref;
            state.issueMap.set(item.key, item);
            if (ref) {
                if (!highlightsByRef.has(ref)) highlightsByRef.set(ref, []);
                highlightsByRef.get(ref).push(item);
            }
        });
        return { items, highlightsByRef };
    }

    function resolveHighlightRanges(text, highlight) {
        if (!text || !highlight) return null;
        const start = typeof highlight.start_offset === 'number' ? highlight.start_offset : (typeof highlight.start === 'number' ? highlight.start : null);
        const end = typeof highlight.end_offset === 'number' ? highlight.end_offset : (typeof highlight.end === 'number' ? highlight.end : null);
        if (typeof start === 'number' && typeof end === 'number' && end > start) {
            return [{ start, end }];
        }
        const scope = typeof highlight.scope === 'string' ? highlight.scope : '';
        if (scope === 'block') {
            return [{ start: 0, end: text.length }];
        }
        const edgeWordCount = 5;
        const maxEdgeRangeChars = 800;
        const maxEdgeRangeWords = 120;
        const getWordEdgeRange = (blockText, snippet) => {
            const normalizedSnippet = normalizeText(snippet || '');
            if (!normalizedSnippet) return null;
            const words = normalizedSnippet.split(/\s+/).filter(Boolean);
            if (words.length < edgeWordCount * 2) return null;
            const lowerText = blockText.toLowerCase();
            const firstPhrase = words.slice(0, edgeWordCount).join(' ');
            const lastPhrase = words.slice(-edgeWordCount).join(' ');
            const firstIdx = lowerText.indexOf(firstPhrase.toLowerCase());
            if (firstIdx === -1) return null;
            const searchStart = firstIdx + firstPhrase.length;
            const lastIdx = lowerText.indexOf(lastPhrase.toLowerCase(), searchStart);
            if (lastIdx === -1) return null;
            const startIdx = firstIdx;
            const endIdx = lastIdx + lastPhrase.length;
            if (endIdx <= startIdx) return null;
            const slice = blockText.slice(startIdx, endIdx);
            const wordCount = slice.split(/\s+/).filter(Boolean).length;
            if (endIdx - startIdx > maxEdgeRangeChars || wordCount > maxEdgeRangeWords) return null;
            return { start: startIdx, end: endIdx };
        };
        const snippet = highlight.snippet || highlight.text || '';
        if (!snippet) {
            return null;
        }
        const lowerText = text.toLowerCase();
        const parts = snippet
            .split(/…|\.{3,}/)
            .map(part => part.trim())
            .filter(part => part.length >= 5)
            .map(part => part.toLowerCase());
        if (!parts.length) {
            return null;
        }
        if (parts.length === 1) {
            const idx = lowerText.indexOf(parts[0]);
            if (idx === -1) {
                return null;
            }
            return [{ start: idx, end: idx + parts[0].length }];
        }
        const edgeRange = getWordEdgeRange(text, snippet);
        if (edgeRange) {
            return [edgeRange];
        }
        let cursor = 0;
        const ranges = [];
        for (let i = 0; i < parts.length; i++) {
            const idx = lowerText.indexOf(parts[i], cursor);
            if (idx === -1) {
                break;
            }
            ranges.push({ start: idx, end: idx + parts[i].length });
            cursor = idx + parts[i].length;
        }
        if (ranges.length === parts.length) {
            return [{ start: ranges[0].start, end: ranges[ranges.length - 1].end }];
        }
        if (ranges.length) {
            return null;
        }
        return null;
    }

    function normalizeHighlightScope(highlight) {
        return String(highlight && highlight.scope ? highlight.scope : '').toLowerCase().trim();
    }

    function hasExplicitBlockScope(highlight) {
        const scope = normalizeHighlightScope(highlight);
        if (scope === 'block') return true;
        const strategy = String(
            (highlight && (highlight.anchor_strategy || highlight.anchor_method || highlight.anchor_strategy_used))
            || ''
        ).toLowerCase().trim();
        return strategy === 'block' || strategy === 'block_exact';
    }

    function shouldSuppressInlineRange(text, highlight, range) {
        if (!text || !range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return true;
        if (range.end <= range.start) return true;
        if (hasExplicitBlockScope(highlight)) return false;
        const totalLength = text.length;
        if (!totalLength) return false;
        const rangeLength = range.end - range.start;
        const coverage = rangeLength / totalLength;
        const snippet = normalizeText((highlight && (highlight.snippet || highlight.text)) || '');
        if (coverage >= 0.9 && totalLength >= 220) return true;
        if (rangeLength >= 700 && totalLength >= 260) return true;
        if (!snippet && coverage >= 0.7 && totalLength >= 180) return true;
        return false;
    }

    function emitHighlightTelemetry(eventName, payload) {
        if (!window || !window.AiviHighlightTelemetry || typeof window.AiviHighlightTelemetry.log !== 'function') {
            return;
        }
        window.AiviHighlightTelemetry.log(eventName, payload);
    }

    function buildParagraphDataList(container) {
        if (!container) return [];
        const candidates = Array.from(container.querySelectorAll('p,li,blockquote,figcaption,td,th,h1,h2,h3,h4,h5,h6'));
        const paragraphs = candidates.length ? candidates : [container];
        return paragraphs.map((element, index) => {
            const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
            const map = [];
            const buffer = [];
            let lastWasSpace = false;
            let node = walker.nextNode();
            while (node) {
                const raw = node.nodeValue || '';
                const normalized = raw.normalize('NFC');
                for (let i = 0; i < normalized.length; i++) {
                    let char = normalized[i];
                    if (char === '\u2018' || char === '\u2019') char = "'";
                    if (char === '\u201C' || char === '\u201D') char = '"';
                    if (char === '\u2013' || char === '\u2014') char = '-';
                    if (/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]/.test(char)) char = ' ';
                    if (char === ' ') {
                        if (lastWasSpace) {
                            continue;
                        }
                        lastWasSpace = true;
                    } else {
                        lastWasSpace = false;
                    }
                    map.push({ node, offset: i });
                    buffer.push(char);
                }
                node = walker.nextNode();
            }
            while (buffer.length && buffer[0] === ' ') {
                buffer.shift();
                map.shift();
            }
            while (buffer.length && buffer[buffer.length - 1] === ' ') {
                buffer.pop();
                map.pop();
            }
            const normalizedText = buffer.join('').toLowerCase();
            return { element, index, normalizedText, map };
        });
    }

    function findAllIndices(text, phrase) {
        const indices = [];
        if (!text || !phrase) return indices;
        let idx = 0;
        while (idx <= text.length) {
            const found = text.indexOf(phrase, idx);
            if (found === -1) break;
            indices.push(found);
            idx = found + 1;
        }
        return indices;
    }

    function findBoundaryCandidates(normalizedText, firstPhrase, lastPhrase) {
        if (!normalizedText || !firstPhrase || !lastPhrase) return [];
        const firstIndices = findAllIndices(normalizedText, firstPhrase);
        if (!firstIndices.length) return [];
        const lastIndices = findAllIndices(normalizedText, lastPhrase);
        if (!lastIndices.length) return [];
        const candidates = [];
        firstIndices.forEach((firstIdx) => {
            const minLast = firstIdx + firstPhrase.length;
            lastIndices.forEach((lastIdx) => {
                if (lastIdx < minLast) return;
                candidates.push({ start: firstIdx, end: lastIdx + lastPhrase.length });
            });
        });
        candidates.sort((a, b) => (a.start - b.start) || (a.end - b.end));
        return candidates;
    }

    function resolveBoundaryAnchor(normalizedText, boundary, textQuoteSelector, snippet, scope) {
        const boundaryFirst = boundary && boundary.first_words ? normalizeAnchoringText(boundary.first_words) : '';
        const boundaryLast = boundary && boundary.last_words ? normalizeAnchoringText(boundary.last_words) : '';
        const boundaryExact = boundary && boundary.exact_text ? normalizeAnchoringText(boundary.exact_text) : '';
        const quoteExact = textQuoteSelector && textQuoteSelector.exact ? normalizeAnchoringText(textQuoteSelector.exact) : '';
        const snippetExact = snippet ? normalizeAnchoringText(snippet) : '';
        let normalizedNeedle = '';
        let anchorStrategy = '';
        let collisionCount = 0;
        let expansionSteps = 0;
        let candidateList = null;

        if (boundaryFirst && boundaryLast) {
            normalizedNeedle = `${boundaryFirst} ${boundaryLast}`.trim();
            const candidates = findBoundaryCandidates(normalizedText, boundaryFirst, boundaryLast);
            if (candidates.length === 1) {
                return { range: candidates[0], anchorStrategy: 'boundary_v2', collisionCount: 0, expansionSteps, normalizedNeedle, candidateList: null };
            }
            if (candidates.length > 1) {
                const tokens = normalizeAnchoringWords(boundaryExact || quoteExact || snippetExact);
                for (let n = 4; n <= 8; n++) {
                    if (tokens.length < n * 2) continue;
                    expansionSteps += 1;
                    const firstPhrase = tokens.slice(0, n).join(' ');
                    const lastPhrase = tokens.slice(tokens.length - n).join(' ');
                    const expandedCandidates = findBoundaryCandidates(normalizedText, firstPhrase, lastPhrase);
                    if (expandedCandidates.length === 1) {
                        normalizedNeedle = `${firstPhrase} ${lastPhrase}`.trim();
                        return { range: expandedCandidates[0], anchorStrategy: 'boundary_expand_v2', collisionCount: 0, expansionSteps, normalizedNeedle, candidateList: null };
                    }
                }
                collisionCount = candidates.length;
                anchorStrategy = 'boundary_v2';
                candidateList = candidates;
                return { range: candidates[0], anchorStrategy, collisionCount, expansionSteps, normalizedNeedle, candidateList };
            }
        }

        const exactPhrase = boundaryExact || quoteExact || snippetExact;
        if (exactPhrase) {
            const indices = findAllIndices(normalizedText, exactPhrase);
            if (indices.length) {
                collisionCount = indices.length > 1 ? indices.length : 0;
                normalizedNeedle = exactPhrase;
                anchorStrategy = scope === 'sentence' && boundaryExact ? 'sentence_expand' : 'exact_quote';
                candidateList = indices.length > 1 ? indices.map((idx) => ({ start: idx, end: idx + exactPhrase.length })) : null;
                return { range: { start: indices[0], end: indices[0] + exactPhrase.length }, anchorStrategy, collisionCount, expansionSteps, normalizedNeedle, candidateList };
            }
        }

        return null;
    }

    function mapNormalizedRange(paragraphData, range) {
        if (!paragraphData || !range) return null;
        const map = paragraphData.map || [];
        if (range.start < 0 || range.end <= range.start || range.end > map.length) return null;
        const startMap = map[range.start];
        const endMap = map[range.end - 1];
        if (!startMap || !endMap || !startMap.node || !endMap.node) return null;
        return {
            startNode: startMap.node,
            startOffset: startMap.offset,
            endNode: endMap.node,
            endOffset: endMap.offset + 1
        };
    }

    function buildV2Span(doc, text, item, meta) {
        const span = doc.createElement('span');
        const provenance = item && item.check && item.check.provenance ? String(item.check.provenance) : 'ai';
        const isAi = provenance !== 'deterministic';
        const severity = resolveItemSeverity(item);
        span.className = isAi ? 'aivi-overlay-highlight aivi-overlay-highlight-ai v2' : 'aivi-overlay-highlight v2';
        applySeverityToHighlightNode(span, severity);
        span.dataset.issueKey = item.key;
        span.dataset.provenance = provenance;
        if (meta.checkId) span.dataset.checkId = meta.checkId;
        if (Number.isFinite(meta.instanceIndex)) span.dataset.instanceIndex = String(meta.instanceIndex);
        if (meta.anchorStrategy) span.dataset.anchorMethod = meta.anchorStrategy;
        if (meta.normalizedHash) span.dataset.normalizedHash = meta.normalizedHash;
        span.textContent = text;
        span.addEventListener('click', (event) => {
            event.stopPropagation();
            openInlinePanel(item, span);
        });
        return span;
    }

    function wrapRangeSegments(range, item, meta) {
        if (!range || !range.startContainer || !range.endContainer) return { spans: [], wrapErrors: 1 };
        const doc = range.startContainer.ownerDocument;
        const spans = [];
        let wrapErrors = 0;
        const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        while (node) {
            if (!range.intersectsNode(node)) {
                node = walker.nextNode();
                continue;
            }
            const text = node.nodeValue || '';
            let localStart = 0;
            let localEnd = text.length;
            if (node === range.startContainer) localStart = range.startOffset;
            if (node === range.endContainer) localEnd = range.endOffset;
            if (localEnd > localStart) {
                try {
                    const before = text.slice(0, localStart);
                    const middle = text.slice(localStart, localEnd);
                    const after = text.slice(localEnd);
                    const span = buildV2Span(doc, middle, item, meta);
                    const frag = doc.createDocumentFragment();
                    if (before) frag.appendChild(doc.createTextNode(before));
                    frag.appendChild(span);
                    if (after) frag.appendChild(doc.createTextNode(after));
                    node.parentNode.replaceChild(frag, node);
                    spans.push(span);
                } catch (e) {
                    wrapErrors += 1;
                }
            }
            node = walker.nextNode();
        }
        return { spans, wrapErrors };
    }

    function createRectOverlays(body, range, item, meta) {
        if (!body || !range) return { rects: 0 };
        const rectList = Array.from(range.getClientRects());
        if (!rectList.length) return { rects: 0 };
        const doc = body.ownerDocument;
        const bodyRect = body.getBoundingClientRect();
        const provenance = item && item.check && item.check.provenance ? String(item.check.provenance) : 'ai';
        const isAi = provenance !== 'deterministic';
        const severity = resolveItemSeverity(item);
        const palette = getSeverityPalette(severity);
        let overlay = body.querySelector('.aivi-overlay-v2-rects');
        if (!overlay) {
            overlay = doc.createElement('div');
            overlay.className = 'aivi-overlay-v2-rects';
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '2';
            if (body.style.position === '') body.style.position = 'relative';
            body.appendChild(overlay);
        }
        let rectCount = 0;
        rectList.forEach((rect) => {
            const el = doc.createElement('div');
            el.className = isAi ? 'aivi-overlay-highlight aivi-overlay-highlight-ai v2-rect' : 'aivi-overlay-highlight v2-rect';
            applySeverityToHighlightNode(el, severity);
            el.style.position = 'absolute';
            el.style.left = `${rect.left - bodyRect.left + body.scrollLeft}px`;
            el.style.top = `${rect.top - bodyRect.top + body.scrollTop}px`;
            el.style.width = `${rect.width}px`;
            el.style.height = `${rect.height}px`;
            el.style.border = `2px ${palette.borderStyle} ${palette.borderColor}`;
            el.style.borderRadius = '6px';
            el.style.background = palette.background;
            el.style.pointerEvents = 'auto';
            el.dataset.issueKey = item.key;
            if (meta.checkId) el.dataset.checkId = meta.checkId;
            if (Number.isFinite(meta.instanceIndex)) el.dataset.instanceIndex = String(meta.instanceIndex);
            if (meta.anchorStrategy) el.dataset.anchorMethod = meta.anchorStrategy;
            if (meta.normalizedHash) el.dataset.normalizedHash = meta.normalizedHash;
            el.addEventListener('click', (event) => {
                event.stopPropagation();
                openInlinePanel(item, el);
            });
            overlay.appendChild(el);
            rectCount += 1;
        });
        return { rects: rectCount };
    }

    function wrapTextRange(container, start, end, item) {
        if (!container || start < 0 || end <= start) return false;
        const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        let current = walker.nextNode();
        let pos = 0;
        const toWrap = [];
        while (current) {
            const len = current.nodeValue ? current.nodeValue.length : 0;
            const nextPos = pos + len;
            if (end <= pos) break;
            if (start < nextPos && end > pos) {
                const localStart = Math.max(0, start - pos);
                const localEnd = Math.min(len, end - pos);
                toWrap.push({ node: current, start: localStart, end: localEnd });
            }
            pos = nextPos;
            current = walker.nextNode();
        }
        if (!toWrap.length) return false;
        toWrap.forEach((part) => {
            const node = part.node;
            const text = node.nodeValue || '';
            const before = text.slice(0, part.start);
            const middle = text.slice(part.start, part.end);
            const after = text.slice(part.end);
            const span = container.ownerDocument.createElement('span');
            const provenance = item && item.check && item.check.provenance ? String(item.check.provenance) : 'ai';
            const isAi = provenance !== 'deterministic';
            const severity = resolveItemSeverity(item);
            span.className = isAi ? 'aivi-overlay-highlight aivi-overlay-highlight-ai' : 'aivi-overlay-highlight';
            applySeverityToHighlightNode(span, severity);
            span.dataset.issueKey = item.key;
            span.dataset.provenance = provenance;
            span.textContent = middle;
            span.addEventListener('click', (event) => {
                event.stopPropagation();
                openInlinePanel(item, span);
            });
            const frag = container.ownerDocument.createDocumentFragment();
            if (before) frag.appendChild(container.ownerDocument.createTextNode(before));
            frag.appendChild(span);
            if (after) frag.appendChild(container.ownerDocument.createTextNode(after));
            node.parentNode.replaceChild(frag, node);
        });
        return true;
    }

    function applyHighlightsToBodyV2(body, items) {
        if (!body || !Array.isArray(items) || !items.length) return;
        const paragraphs = buildParagraphDataList(body);
        const totals = { total: 0, success: 0, collisions: 0, expansionSteps: 0 };
        items.forEach((item) => {
            totals.total += 1;
            const startTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
            const highlight = item.highlight || {};
            const boundary = highlight.boundary || null;
            const textQuoteSelector = highlight.text_quote_selector || highlight.quote || null;
            const scope = highlight.scope || '';
            const paragraphIndex = boundary && Number.isInteger(boundary.paragraph_index) ? boundary.paragraph_index : null;
            const snippet = highlight.snippet || highlight.text || '';
            const paragraphTargets = (paragraphIndex !== null && paragraphIndex >= 0 && paragraphIndex < paragraphs.length)
                ? [paragraphs[paragraphIndex]]
                : paragraphs;
            let anchorResult = null;
            let paragraphUsed = null;
            paragraphTargets.some((paragraph) => {
                anchorResult = resolveBoundaryAnchor(paragraph.normalizedText, boundary, textQuoteSelector, snippet, scope);
                if (anchorResult) {
                    paragraphUsed = paragraph;
                    return true;
                }
                return false;
            });
            const endTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
            let anchorSuccess = false;
            let wrapErrors = 0;
            let normalizedHashPromise = Promise.resolve('');
            let spanNodes = [];
            let rectCount = 0;
            if (anchorResult && paragraphUsed && shouldSuppressInlineRange(paragraphUsed.normalizedText || '', highlight, anchorResult.range)) {
                registerInlineSuppressedRecommendation(item, 'client_guardrail_overwide_inline');
                anchorResult = null;
                paragraphUsed = null;
            }
            if (anchorResult && paragraphUsed) {
                const mapped = mapNormalizedRange(paragraphUsed, anchorResult.range);
                if (mapped) {
                    const range = body.ownerDocument.createRange();
                    range.setStart(mapped.startNode, mapped.startOffset);
                    range.setEnd(mapped.endNode, mapped.endOffset);
                    const meta = {
                        checkId: item.check && (item.check.check_id || item.check.id || item.check.name) ? String(item.check.check_id || item.check.id || item.check.name) : '',
                        instanceIndex: highlight.instance_index || highlight.index,
                        anchorStrategy: anchorResult.anchorStrategy
                    };
                    const wrapResult = wrapRangeSegments(range, item, meta);
                    spanNodes = wrapResult.spans;
                    wrapErrors = wrapResult.wrapErrors;
                    if (!spanNodes.length) {
                        const rectResult = createRectOverlays(body, range, item, meta);
                        rectCount = rectResult.rects;
                    }
                    anchorSuccess = spanNodes.length > 0 || rectCount > 0;
                    const normalizedNeedle = anchorResult.normalizedNeedle || '';
                    normalizedHashPromise = computeSha256(normalizedNeedle);
                    normalizedHashPromise.then((hash) => {
                        if (!hash) return;
                        spanNodes.forEach((span) => {
                            span.dataset.normalizedHash = hash;
                        });
                        const rectNodes = Array.from(body.querySelectorAll(`.aivi-overlay-highlight.v2-rect[data-issue-key="${item.key}"]`));
                        rectNodes.forEach((el) => {
                            el.dataset.normalizedHash = hash;
                        });
                    });
                } else {
                    registerInlineSuppressedRecommendation(item, 'client_guardrail_no_safe_inline_range');
                }
            } else if (!anchorResult) {
                registerInlineSuppressedRecommendation(item, 'client_guardrail_no_anchor');
            }

            if (anchorResult && anchorResult.collisionCount) {
                totals.collisions += 1;
            }
            if (anchorResult && anchorResult.expansionSteps) {
                totals.expansionSteps += anchorResult.expansionSteps;
            }
            if (anchorSuccess) totals.success += 1;

            const boundaryFirst = boundary && boundary.first_words ? String(boundary.first_words) : '';
            const boundaryLast = boundary && boundary.last_words ? String(boundary.last_words) : '';
            const anchorPayload = {
                issue_key: item.key,
                check_id: item.check && (item.check.check_id || item.check.id || item.check.name) ? String(item.check.check_id || item.check.id || item.check.name) : '',
                instance_index: highlight.instance_index || highlight.index || 0,
                scope: scope || '',
                paragraph_index: paragraphIndex,
                boundary_first_n: boundaryFirst,
                boundary_last_n: boundaryLast,
                normalized_string: anchorResult ? anchorResult.normalizedNeedle || '' : '',
                anchor_strategy_used: anchorResult ? anchorResult.anchorStrategy : 'failed',
                collision_count: anchorResult ? anchorResult.collisionCount || 0 : 0,
                expansion_steps: anchorResult ? anchorResult.expansionSteps || 0 : 0,
                anchor_success: anchorSuccess,
                anchor_time_ms: Math.round(endTime - startTime),
                wrap_errors: wrapErrors > 0,
                boundary_first_raw: boundaryFirst,
                boundary_last_raw: boundaryLast,
                candidate_spans: anchorResult && Array.isArray(anchorResult.candidateList) ? anchorResult.candidateList : []
            };
            normalizedHashPromise.then((hash) => {
                anchorPayload.normalized_hash = hash;
                emitHighlightTelemetry('overlay_anchor_attempt_v2', anchorPayload);
            });
        });
        const summary = {
            total_findings: totals.total,
            boundary_anchor_success_rate: totals.total ? totals.success / totals.total : 0,
            collision_rate: totals.total ? totals.collisions / totals.total : 0,
            avg_expansion_steps: totals.total ? totals.expansionSteps / totals.total : 0
        };
        emitHighlightTelemetry('overlay_anchor_summary_v2', summary);
    }

    function applyHighlightsToBody(body, items, useV2) {
        if (useV2) {
            const v2Items = [];
            const fallbackItems = [];
            items.forEach((item) => {
                const highlight = item.highlight || {};
                if (highlight.boundary || highlight.text_quote_selector || highlight.quote || highlight.scope) {
                    v2Items.push(item);
                } else {
                    fallbackItems.push(item);
                }
            });
            if (v2Items.length) {
                applyHighlightsToBodyV2(body, v2Items);
            }
            if (!fallbackItems.length) {
                return;
            }
            items = fallbackItems;
        }
        if (!body || !Array.isArray(items) || !items.length) return;
        const text = body.textContent || '';
        items.forEach((item) => {
            const highlight = item.highlight || {};
            const ranges = resolveHighlightRanges(text, highlight);
            if (!ranges || !ranges.length) {
                registerInlineSuppressedRecommendation(item, 'client_guardrail_no_anchor');
                return;
            }
            let wrapped = false;
            ranges.forEach((range) => {
                if (shouldSuppressInlineRange(text, highlight, range)) {
                    registerInlineSuppressedRecommendation(item, 'client_guardrail_overwide_inline');
                    return;
                }
                wrapTextRange(body, range.start, range.end, item);
                wrapped = true;
            });
            if (!wrapped) {
                registerInlineSuppressedRecommendation(item, 'client_guardrail_no_safe_inline_range');
            }
        });
    }

    function hideInlinePanel() {
        if (state.inlinePanel) {
            state.inlinePanel.style.display = 'none';
            state.inlinePanel.innerHTML = '';
        }
        state.inlinePanel = null;
        state.inlineItemKey = '';
    }

    function openInlinePanel(item, span, groupItems) {
        const wrapper = span ? span.closest('.aivi-overlay-block') : null;
        if (!wrapper) return;
        const panel = wrapper.querySelector('.aivi-overlay-inline-panel');
        if (!panel) return;
        hideInlinePanel();
        state.inlinePanel = panel;
        state.inlineItemKey = item.key;
        renderInlinePanel(panel, item, groupItems);
        panel.style.display = 'flex';
        panel.scrollIntoView({ block: 'nearest' });
    }

    function renderInlinePanel(panel, item, groupItems) {
        panel.innerHTML = '';
        const group = Array.isArray(groupItems) ? groupItems.filter(Boolean) : [];
        if (group.length > 1) {
            const chooser = state.contextDoc.createElement('div');
            chooser.style.cssText = 'display:flex;gap:7px;align-items:center;flex-wrap:wrap;';
            group.forEach((option) => {
                const label = option.check?.name || option.check?.title || option.check?.check_id || option.check?.id || option.highlight?.message || 'Issue';
                const button = state.contextDoc.createElement('button');
                button.type = 'button';
                button.style.cssText = 'border:1px solid #c7d7ef;background:#fff;color:#13346f;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;font-family:"Manrope","Segoe UI",sans-serif;';
                if (option.key === item.key) {
                    button.style.background = '#1d4ed8';
                    button.style.color = '#fff';
                    button.style.borderColor = '#1d4ed8';
                }
                button.textContent = String(label).slice(0, 60);
                button.addEventListener('click', () => {
                    renderInlinePanel(panel, option, group);
                });
                chooser.appendChild(button);
            });
            panel.appendChild(chooser);
        }
        const guardrail = getGuardrailState();
        const isFallback = item && item.isFallback === true;
        const stabilityReleaseMode = isStabilityReleaseModeEnabled();
        const schemaAssist = item && item.isRecommendation === true
            ? resolveSchemaAssist(item)
            : null;
        const message = sanitizeInlineIssueMessage(
            item.highlight?.message || item.check?.explanation || item.check?.title || item.check?.name || 'Issue detected',
            item.check
        );
        const explanationPack = resolveExplanationPack(
            firstObject(
                item.highlight && item.highlight.explanation_pack,
                item.check && item.check.explanation_pack,
                item && item.explanation_pack
            ),
            {
                what_failed: message || 'Issue detected.',
                how_to_fix_step: (item && item.check && item.check.action_suggestion)
                    || (item && item.repair_intent && item.repair_intent.instruction)
                    || ''
            }
        );
        const top = state.contextDoc.createElement('div');
        top.style.cssText = 'display:flex;gap:9px;align-items:center;flex-wrap:wrap;';
        const pill = state.contextDoc.createElement('div');
        pill.style.cssText = 'display:inline-flex;align-items:center;background:#f8fbff;border:1px solid #d7dfec;border-radius:999px;padding:7px 11px;font-size:12px;color:#162740;font-weight:700;font-family:"Manrope","Segoe UI",sans-serif;';
        pill.textContent = message;
        if (isFallback) {
            const ro = state.contextDoc.createElement('div');
            ro.style.cssText = 'display:inline-flex;align-items:center;background:#fff4ea;border:1px solid #f8cfae;border-radius:999px;padding:7px 11px;font-size:12px;color:#9a3412;font-weight:700;font-family:"Manrope","Segoe UI",sans-serif;';
            ro.textContent = 'Read-only fallback';
            top.appendChild(ro);
        }
        const fixBtn = state.contextDoc.createElement('button');
        fixBtn.type = 'button';
        fixBtn.style.cssText = 'border:1px solid #2271b1;background:#2271b1;color:#fff;padding:7px 12px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;font-family:"Manrope","Segoe UI",sans-serif;';
        fixBtn.textContent = 'Fix with AI';
        const rewriteContext = resolveItemRewriteContext(item);
        const hasTarget = rewriteContext.rewrite_target && rewriteContext.rewrite_target.actionable === true;
        if (!OVERLAY_FIX_WITH_AI_ENABLED) {
            fixBtn.disabled = true;
            fixBtn.style.display = 'none';
            fixBtn.style.cursor = 'not-allowed';
            fixBtn.title = 'Disabled in Stability Release Mode';
        } else if (stabilityReleaseMode || !hasTarget || guardrail.blockAi || isFallback) {
            fixBtn.disabled = true;
            fixBtn.style.background = '#94a3b8';
            fixBtn.style.cursor = 'not-allowed';
            if (stabilityReleaseMode) {
                fixBtn.title = 'Disabled in Stability Release Mode';
            }
        } else {
            fixBtn.addEventListener('click', () => handleInlineFix(item, panel, rewriteContext));
        }
        top.appendChild(pill);
        top.appendChild(fixBtn);
        const status = state.contextDoc.createElement('div');
        status.className = 'aivi-overlay-inline-status';
        status.style.cssText = 'font-size:12px;color:#5e6f86;font-weight:600;';
        const variantsWrap = state.contextDoc.createElement('div');
        variantsWrap.className = 'aivi-overlay-inline-variants';
        variantsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
        panel.appendChild(top);
        const explanationNode = buildExplanationPackNode(explanationPack, 'aivi-overlay-guidance-inline');
        if (explanationNode) {
            panel.appendChild(explanationNode);
        }
        if (schemaAssist) {
            const schemaWrap = state.contextDoc.createElement('div');
            schemaWrap.style.cssText = 'display:flex;flex-direction:column;gap:9px;padding:11px;border:1px solid #cfdbef;border-radius:11px;background:#f6faff;';
            const schemaTop = state.contextDoc.createElement('div');
            schemaTop.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap;';
            const schemaTitle = state.contextDoc.createElement('div');
            schemaTitle.style.cssText = 'font-size:12px;font-weight:700;color:#153670;font-family:"Manrope","Segoe UI",sans-serif;';
            schemaTitle.textContent = `${getSchemaAssistLabel(schemaAssist.schema_kind)} available`;
            const schemaActions = state.contextDoc.createElement('div');
            schemaActions.style.cssText = 'display:flex;gap:8px;align-items:center;';
            const schemaInsertAllowed = isSchemaAssistInsertAllowed(schemaAssist);
            const schemaKind = normalizeSchemaKind(schemaAssist.schema_kind);
            const isSemanticMarkupPlan = schemaKind === 'semantic_markup_plan';

            const generateBtn = state.contextDoc.createElement('button');
            generateBtn.type = 'button';
            generateBtn.className = 'aivi-overlay-recommendation-btn';
            generateBtn.textContent = isSemanticMarkupPlan ? 'Generate markup' : 'Generate schema';

            const copyBtn = state.contextDoc.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'aivi-overlay-recommendation-btn';
            copyBtn.textContent = isSemanticMarkupPlan ? 'Copy markup' : 'Copy schema';
            copyBtn.disabled = true;

            const insertBtn = state.contextDoc.createElement('button');
            insertBtn.type = 'button';
            insertBtn.className = 'aivi-overlay-recommendation-btn';
            insertBtn.textContent = 'Insert schema';
            insertBtn.disabled = true;
            if (!schemaInsertAllowed) {
                insertBtn.style.display = 'none';
            }

            schemaActions.appendChild(generateBtn);
            schemaActions.appendChild(copyBtn);
            if (schemaInsertAllowed) {
                schemaActions.appendChild(insertBtn);
            }
            schemaTop.appendChild(schemaTitle);
            schemaTop.appendChild(schemaActions);
            schemaWrap.appendChild(schemaTop);

            const note = state.contextDoc.createElement('div');
            note.className = 'aivi-overlay-review-schema-note';
            note.textContent = getSchemaAssistBaseNote(schemaAssist);
            schemaWrap.appendChild(note);

            const policy = state.contextDoc.createElement('div');
            policy.className = 'aivi-overlay-review-schema-policy';
            policy.textContent = buildSchemaAssistPolicySummary(schemaAssist);
            schemaWrap.appendChild(policy);

            const schemaPreview = state.contextDoc.createElement('textarea');
            schemaPreview.className = 'aivi-overlay-review-schema-preview';
            schemaPreview.readOnly = true;
            schemaPreview.hidden = true;

            const schemaStatus = state.contextDoc.createElement('div');
            schemaStatus.className = 'aivi-overlay-review-schema-status';

            generateBtn.addEventListener('click', () => {
                const draft = stringifySchemaDraft(schemaAssist);
                if (!draft) {
                    setSchemaAssistStatus(schemaStatus, 'error', isSemanticMarkupPlan
                        ? 'No deterministic markup plan could be built for this item.'
                        : 'No deterministic schema draft could be built for this item.');
                    return;
                }
                schemaPreview.value = draft;
                schemaPreview.hidden = false;
                copyBtn.disabled = schemaAssist.can_copy !== true;
                if (schemaInsertAllowed) {
                    const readiness = buildSchemaInsertReadiness(item, schemaAssist, draft);
                    syncSchemaInsertButton(insertBtn, schemaInsertAllowed, readiness);
                    setSchemaAssistStatus(schemaStatus, readiness.tone, readiness.message);
                } else {
                    setSchemaAssistStatus(schemaStatus, 'ready', isSemanticMarkupPlan
                        ? 'Markup plan generated. Review it, then copy.'
                        : 'Schema draft generated. Review it, then copy.');
                }
                generateBtn.textContent = isSemanticMarkupPlan ? 'Refresh markup' : 'Refresh schema';
            });

            copyBtn.addEventListener('click', () => {
                const draft = schemaPreview.value || stringifySchemaDraft(schemaAssist);
                if (!draft) {
                    setSchemaAssistStatus(schemaStatus, 'error', isSemanticMarkupPlan
                        ? 'Nothing to copy yet. Generate markup first.'
                        : 'Nothing to copy yet. Generate schema first.');
                    return;
                }
                if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
                    setSchemaAssistStatus(schemaStatus, 'error', 'Clipboard is not available in this browser context.');
                    return;
                }
                navigator.clipboard.writeText(draft).then(() => {
                    setSchemaAssistStatus(schemaStatus, 'success', isSemanticMarkupPlan
                        ? 'Markup plan copied to clipboard.'
                        : 'Schema copied to clipboard.');
                }).catch(() => {
                    setSchemaAssistStatus(schemaStatus, 'error', 'Copy failed. Please copy the draft manually.');
                });
            });

            if (schemaInsertAllowed) {
                insertBtn.addEventListener('click', () => {
                    const draft = schemaPreview.value || stringifySchemaDraft(schemaAssist);
                    if (!draft) {
                        setSchemaAssistStatus(schemaStatus, 'error', 'Nothing to insert yet. Generate schema first.');
                        return;
                    }
                    const result = insertSchemaAssistIntoEditor(item, schemaAssist, draft);
                    const presentation = buildSchemaInsertResultPresentation(result);
                    if (result.ok) {
                        insertBtn.disabled = true;
                        insertBtn.textContent = result.code === 'replace_existing_ai_block' ? 'Replaced' : 'Inserted';
                        setSchemaAssistStatus(schemaStatus, presentation.tone, presentation.message);
                        setOverlayDirty(true);
                        scheduleOverlayDraftSave('schema_insert');
                        setMetaStatus(presentation.metaMessage);
                        renderBlocks(true);
                        return;
                    }
                    if (result.code === 'duplicate'
                        || result.code === 'no_op_existing_match'
                        || result.code === 'copy_only_external_conflict') {
                        const readiness = buildSchemaInsertReadiness(item, schemaAssist, draft);
                        syncSchemaInsertButton(insertBtn, schemaInsertAllowed, readiness);
                    } else {
                        syncSchemaInsertButton(insertBtn, schemaInsertAllowed, null);
                    }
                    setSchemaAssistStatus(schemaStatus, presentation.tone, presentation.message);
                });
            }

            schemaWrap.appendChild(schemaPreview);
            schemaWrap.appendChild(schemaStatus);
            panel.appendChild(schemaWrap);
        }
        panel.appendChild(status);
        panel.appendChild(variantsWrap);
        if (!OVERLAY_FIX_WITH_AI_ENABLED || stabilityReleaseMode) {
            if (!schemaAssist) {
                status.textContent = '';
            } else {
                status.textContent = '';
            }
            return;
        }
        if (isFallback) {
            status.textContent = 'Read-only fallback: highlight could not be mapped to a deterministic issue.';
        }
        const info = state.suggestions[item.key];
        if (info) {
            status.textContent = info.status || '';
            if (Array.isArray(info.variants) && info.variants.length) {
                renderVariants(item, variantsWrap);
            }
        }
    }

    async function handleInlineFix(item, panel, rewriteContextArg) {
        const statusEl = panel.querySelector('.aivi-overlay-inline-status');
        if (!OVERLAY_FIX_WITH_AI_ENABLED) {
            if (statusEl) {
                statusEl.textContent = '';
            }
            return;
        }
        if (isStabilityReleaseModeEnabled()) {
            if (statusEl) {
                statusEl.textContent = '';
            }
            return;
        }
        const guardrail = getGuardrailState();
        if (guardrail.blockAi) {
            setMetaStatus(guardrail.message || 'AI unavailable');
            return;
        }
        const rewriteContext = rewriteContextArg || resolveItemRewriteContext(item);
        const variantsWrap = panel.querySelector('.aivi-overlay-inline-variants');
        state.suggestions[item.key] = {
            status: 'Generating...',
            variants: [],
            rewrite_target: rewriteContext.rewrite_target || null,
            repair_intent: rewriteContext.repair_intent || null,
            analysis_ref: rewriteContext.analysis_ref || null
        };
        if (statusEl) statusEl.textContent = 'Generating...';
        const blocks = getBlocks();
        const manifest = buildLiveManifest(blocks);
        const rewriteTarget = rewriteContext.rewrite_target && typeof rewriteContext.rewrite_target === 'object'
            ? rewriteContext.rewrite_target
            : null;
        const suggestionText = String(
            (rewriteTarget && rewriteTarget.target_text)
            || (rewriteTarget && rewriteTarget.quote && rewriteTarget.quote.exact)
            || item.highlight.snippet
            || item.highlight.text
            || ''
        ).trim();
        const suggestion = {
            text: suggestionText,
            node_ref: (rewriteTarget && rewriteTarget.primary_node_ref)
                || item.highlight.node_ref
                || item.highlight.nodeRef
                || item.resolvedNodeRef
                || ''
        };
        const payload = { manifest };
        if (suggestion.text) {
            payload.suggestion = suggestion;
        }
        const suggestionId = item.highlight.suggestion_id || item.check.suggestion_id || '';
        if (suggestionId) payload.suggestion_id = suggestionId;
        if (rewriteContext.analysis_ref) payload.analysis_ref = rewriteContext.analysis_ref;
        if (rewriteContext.rewrite_target) payload.rewrite_target = rewriteContext.rewrite_target;
        if (rewriteContext.repair_intent) payload.repair_intent = rewriteContext.repair_intent;
        payload.issue_context = buildIssueContextPacket(item, rewriteContext, blocks, manifest);
        const result = await callRest('/rewrite', 'POST', payload);
        if (!result.ok || !result.data || result.data.ok === false) {
            state.suggestions[item.key] = {
                status: 'Error',
                variants: [],
                rewrite_target: rewriteContext.rewrite_target || null,
                repair_intent: rewriteContext.repair_intent || null,
                analysis_ref: rewriteContext.analysis_ref || null
            };
            if (statusEl) statusEl.textContent = 'Error';
            return;
        }
        const responseSuggestionId = result.data.suggestion_id || suggestionId || '';
        const variants = Array.isArray(result.data.variants) ? result.data.variants : [];
        state.suggestions[item.key] = {
            suggestion_id: responseSuggestionId,
            variants,
            original: suggestion.text,
            status: 'Variants ready',
            rewrite_target: rewriteContext.rewrite_target || null,
            repair_intent: rewriteContext.repair_intent || null,
            analysis_ref: rewriteContext.analysis_ref || null
        };
        if (statusEl) statusEl.textContent = 'Variants ready';
        if (variantsWrap) {
            renderVariants(item, variantsWrap);
        }
    }
    function renderVariants(item, wrap) {
        wrap.innerHTML = '';
        const info = state.suggestions[item.key];
        if (!info || !Array.isArray(info.variants) || !info.variants.length) return;
        info.variants.forEach((variant, idx) => {
            const card = state.contextDoc.createElement('div');
            card.style.cssText = 'border:1px solid #d7dfec;border-radius:10px;padding:9px;background:#fbfdff;display:flex;flex-direction:column;gap:7px;';
            const vtext = state.contextDoc.createElement('div');
            vtext.style.cssText = 'font-size:13px;color:#172740;line-height:1.55;';
            vtext.textContent = variant.text || '';
            const row = state.contextDoc.createElement('div');
            row.style.cssText = 'display:flex;gap:8px;align-items:center;';
            const copyBtn = state.contextDoc.createElement('button');
            copyBtn.type = 'button';
            copyBtn.style.cssText = 'border:1px solid #0f8b5f;background:#0f8b5f;color:#fff;padding:6px 11px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:"Manrope","Segoe UI",sans-serif;';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => handleAccept(item, idx));
            const rejectBtn = state.contextDoc.createElement('button');
            rejectBtn.type = 'button';
            rejectBtn.style.cssText = 'border:1px solid #d14343;background:#fff;color:#b91c1c;padding:6px 11px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:"Manrope","Segoe UI",sans-serif;';
            rejectBtn.textContent = 'Reject';
            rejectBtn.addEventListener('click', () => handleReject(item, idx));
            const meta = state.contextDoc.createElement('div');
            meta.style.cssText = 'font-size:12px;color:#5e6f86;margin-left:auto;font-weight:600;';
            meta.textContent = variant.explanation ? String(variant.explanation) : '';
            row.appendChild(copyBtn);
            row.appendChild(rejectBtn);
            row.appendChild(meta);
            card.appendChild(vtext);
            card.appendChild(row);
            wrap.appendChild(card);
        });
    }

    async function handleAccept(item, idx) {
        const info = state.suggestions[item.key];
        if (!info) return;
        const variant = info.variants[idx];
        if (!variant) return;
        const text = String(variant.text || '').trim();
        if (!text) {
            info.status = 'Nothing to copy';
            renderBlocks(true);
            return;
        }

        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            info.status = 'Copy unavailable';
            setMetaStatus('Clipboard is not available here. Copy the revised text manually from AiVI.');
            renderBlocks(true);
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            info.status = 'Copied for paste';
            setMetaStatus('Copied revised text. Paste it into the matching WordPress block, then review and update the post.');
        } catch (e) {
            info.status = 'Copy failed';
            setMetaStatus('Copy failed. Copy the revised text manually from AiVI.');
        }
        renderBlocks(true);
    }

    function handleReject(item, idx) {
        const info = state.suggestions[item.key];
        if (!info) return;
        const remaining = info.variants.filter((_, i) => i !== idx);
        state.suggestions[item.key].variants = remaining;
        if (!remaining.length) {
            state.suggestions[item.key].status = 'Rejected';
        }
        renderBlocks(true);
    }

    function resolveRewriteApplyMode(rewriteTarget) {
        const operation = String(rewriteTarget && rewriteTarget.operation ? rewriteTarget.operation : '').toLowerCase().trim();
        if (operation === 'replace_span' || operation === 'replace_block' || operation === 'heading_support_range' || operation === 'convert_to_list') {
            return operation;
        }
        if (operation === 'convert_to_steps' || operation === 'insert_after_heading' || operation === 'append_support') {
            return operation;
        }
        const mode = String(rewriteTarget && rewriteTarget.mode ? rewriteTarget.mode : '').toLowerCase().trim();
        if (mode === 'convert_to_list') return 'convert_to_list';
        if (mode === 'convert_to_steps') return 'convert_to_steps';
        if (mode === 'heading_support_range') return 'heading_support_range';
        if (mode === 'block' || mode === 'section') return 'replace_block';
        return 'replace_span';
    }

    function isListLikeMode(mode) {
        const normalized = String(mode || '').toLowerCase().trim();
        return normalized === 'convert_to_list' || normalized === 'convert_to_steps';
    }

    function isHeadingBlockInfo(blockInfo) {
        return !!(blockInfo && blockInfo.block && blockInfo.block.name === 'core/heading');
    }

    function resolveTargetNodeRefsForApply(item, rewriteTarget, applyMode) {
        const sourceNodeRefs = Array.isArray(rewriteTarget && rewriteTarget.node_refs) && rewriteTarget.node_refs.length
            ? rewriteTarget.node_refs
            : [rewriteTarget && rewriteTarget.primary_node_ref];
        let targetNodeRefs = sourceNodeRefs
            .map((ref) => String(ref || '').trim())
            .filter(Boolean);

        if (applyMode === 'heading_support_range') {
            const headingNodeRef = String(rewriteTarget && rewriteTarget.heading_node_ref ? rewriteTarget.heading_node_ref : '').trim();
            if (headingNodeRef) {
                targetNodeRefs = targetNodeRefs.filter((ref) => ref !== headingNodeRef);
            }
        }

        const uniqueRefs = Array.from(new Set(targetNodeRefs));
        if (!uniqueRefs.length) {
            const fallbackRef = item.highlight.node_ref || item.highlight.nodeRef || item.resolvedNodeRef || '';
            if (fallbackRef) return [String(fallbackRef)];
            return [];
        }
        return uniqueRefs;
    }

    function selectPrimaryApplyNodeRef(blocks, nodeRefs, rewriteTarget) {
        const explicitPrimary = String(rewriteTarget && rewriteTarget.primary_node_ref ? rewriteTarget.primary_node_ref : '').trim();
        if (explicitPrimary && nodeRefs.indexOf(explicitPrimary) !== -1) {
            const info = findBlockByNodeRef(blocks, explicitPrimary);
            if (info && !isTitleBlock(info) && !isHeadingBlockInfo(info) && isOverlayApplySupportedBlockInfo(info)) {
                return explicitPrimary;
            }
        }
        for (let i = 0; i < nodeRefs.length; i += 1) {
            const ref = nodeRefs[i];
            const info = findBlockByNodeRef(blocks, ref);
            if (!info) continue;
            if (isTitleBlock(info)) continue;
            if (!isOverlayApplySupportedBlockInfo(info)) continue;
            if (!isHeadingBlockInfo(info)) return ref;
        }
        for (let i = 0; i < nodeRefs.length; i += 1) {
            const ref = nodeRefs[i];
            const info = findBlockByNodeRef(blocks, ref);
            if (!info) continue;
            if (isTitleBlock(info)) continue;
            if (!isOverlayApplySupportedBlockInfo(info)) continue;
            return ref;
        }
        return '';
    }

    function getEditableBodyInitialHtml(block) {
        if (!block || typeof block !== 'object') return '';
        const attrs = block && block.attributes ? block.attributes : {};
        if (block.name === 'core/paragraph') {
            return attrs.content || '';
        }
        if (block.name === 'core/heading') {
            return attrs.content || '';
        }
        if (block.name === 'core/list') {
            const listTag = attrs.ordered ? 'ol' : 'ul';
            return `<${listTag}>${attrs.values || ''}</${listTag}>`;
        }
        if (block.name === 'core/quote') {
            return attrs.value || '';
        }
        return buildBlockHtml(block);
    }

    function splitRewriteSegments(text) {
        return String(text || '')
            .split(/\n{2,}/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function escapeHtmlValue(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function convertTextToListMarkup(text) {
        const value = String(text || '').trim();
        if (!value) return '';
        if (/<(ul|ol|li)\b/i.test(value)) return value;

        const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const explicitBullets = lines
            .filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
            .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
            .filter(Boolean);
        if (explicitBullets.length >= 2) {
            return `<ul>${explicitBullets.map((item) => `<li>${escapeHtmlValue(item)}</li>`).join('')}</ul>`;
        }
        if (lines.length >= 2) {
            return `<ul>${lines.map((item) => `<li>${escapeHtmlValue(item)}</li>`).join('')}</ul>`;
        }
        return '';
    }

    function isOverlayApplySupportedBlockInfo(blockInfo) {
        return !!(blockInfo && blockInfo.block && isEditableBlock(blockInfo.block));
    }

    function applyTextToNodeRef(dispatcher, blocks, nodeRef, appliedText, options) {
        if (!dispatcher || !Array.isArray(blocks) || !nodeRef) return 'apply_failed';
        const blockInfo = findBlockByNodeRef(blocks, nodeRef);
        if (!blockInfo) return 'apply_failed';
        if (isTitleBlock(blockInfo)) return 'skipped_title';
        if (!isOverlayApplySupportedBlockInfo(blockInfo)) return 'unsupported_block';
        const { block, clientId } = blockInfo;
        const attrKey = getBlockTextKey(block);
        if (!attrKey) return 'apply_failed';
        const currentValue = block.attributes && typeof block.attributes[attrKey] === 'string' ? block.attributes[attrKey] : '';
        const useReplace = options && options.useReplace === true;
        const originalText = useReplace ? String(options.originalText || '') : '';
        const candidateValue = useReplace
            ? replaceText(currentValue, originalText, appliedText)
            : String(appliedText || '');
        if (!candidateValue || candidateValue === currentValue) {
            return 'unchanged';
        }
        dispatcher.updateBlockAttributes(clientId, { [attrKey]: candidateValue });
        if (!verifyBlockAttributeApplied(nodeRef, attrKey, candidateValue)) {
            return 'apply_failed';
        }
        if (isAutoStaleDetectionEnabled()) {
            state.isStale = true;
        }
        return 'applied';
    }

    function applyVariantToEditor(item, appliedText) {
        if (!wp || !wp.data || !wp.data.dispatch) return false;
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.updateBlockAttributes !== 'function') return false;
        const blocks = getBlocks();
        const suggestionInfo = state.suggestions[item.key] || {};
        const rewriteContext = resolveItemRewriteContext(item);
        const rewriteTarget = rewriteContext.rewrite_target || null;
        const applyMode = resolveRewriteApplyMode(rewriteTarget);

        if (applyMode === 'replace_span') {
            const nodeRef = (rewriteTarget && rewriteTarget.primary_node_ref)
                || item.highlight.node_ref
                || item.highlight.nodeRef
                || item.resolvedNodeRef
                || '';
            const originalText = String(
                suggestionInfo.original
                || (rewriteTarget && rewriteTarget.target_text)
                || item.highlight.snippet
                || item.highlight.text
                || ''
            );
            return applyTextToNodeRef(dispatcher, blocks, nodeRef, appliedText, {
                useReplace: true,
                originalText
            });
        }

        if (isListLikeMode(applyMode)) {
            const targetNodeRefs = resolveTargetNodeRefsForApply(item, rewriteTarget, applyMode);
            if (!targetNodeRefs.length) return 'apply_failed';
            const primaryNodeRef = selectPrimaryApplyNodeRef(blocks, targetNodeRefs, rewriteTarget);
            if (!primaryNodeRef) {
                const hasUnsupportedTarget = targetNodeRefs.some((ref) => {
                    const info = findBlockByNodeRef(blocks, ref);
                    return info && !isTitleBlock(info) && !isOverlayApplySupportedBlockInfo(info);
                });
                return hasUnsupportedTarget ? 'unsupported_block' : 'apply_failed';
            }
            const listMarkup = convertTextToListMarkup(appliedText);
            if (!listMarkup) return 'list_format_required';
            const primaryResult = applyTextToNodeRef(dispatcher, blocks, primaryNodeRef, listMarkup, { useReplace: false });
            return primaryResult;
        }

        const targetNodeRefs = resolveTargetNodeRefsForApply(item, rewriteTarget, applyMode);
        if (!targetNodeRefs.length) return 'apply_failed';

        const uniqueRefs = Array.from(new Set(targetNodeRefs));
        const segments = splitRewriteSegments(appliedText);
        let appliedCount = 0;
        let skippedTitleCount = 0;
        let unsupportedCount = 0;

        if (applyMode === 'replace_block' || applyMode === 'insert_after_heading' || applyMode === 'append_support') {
            const primaryNodeRef = selectPrimaryApplyNodeRef(blocks, uniqueRefs, rewriteTarget);
            if (!primaryNodeRef) {
                const hasUnsupportedTarget = uniqueRefs.some((ref) => {
                    const info = findBlockByNodeRef(blocks, ref);
                    return info && !isTitleBlock(info) && !isOverlayApplySupportedBlockInfo(info);
                });
                return hasUnsupportedTarget ? 'unsupported_block' : 'apply_failed';
            }
            const mappedSegments = segments.length >= 2 && segments.length >= uniqueRefs.length;
            if (!mappedSegments) {
                const combinedText = String(appliedText || '').trim();
                if (!combinedText) return 'apply_failed';
                return applyTextToNodeRef(dispatcher, blocks, primaryNodeRef, combinedText, { useReplace: false });
            }
        }

        uniqueRefs.forEach((nodeRef, index) => {
            let segment = segments[index] || '';
            if (!segment && index === 0) {
                segment = String(appliedText || '').trim();
            }
            if (!segment) return;
            const result = applyTextToNodeRef(dispatcher, blocks, nodeRef, segment, { useReplace: false });
            if (result === 'applied') {
                appliedCount += 1;
            } else if (result === 'skipped_title') {
                skippedTitleCount += 1;
            } else if (result === 'unsupported_block') {
                unsupportedCount += 1;
            }
        });

        if (appliedCount > 0) return 'applied';
        if (skippedTitleCount > 0) return 'skipped_title';
        if (unsupportedCount > 0) return 'unsupported_block';
        return 'apply_failed';
    }

    function extractEditableHtml(body) {
        if (!body) return '';
        const clone = body.cloneNode(true);
        const highlights = clone.querySelectorAll('.aivi-overlay-highlight');
        highlights.forEach((span) => {
            const text = clone.ownerDocument.createTextNode(span.textContent || '');
            if (span.parentNode) {
                span.parentNode.replaceChild(text, span);
            }
        });
        return clone.innerHTML;
    }

    function markOverlayBodyDirty(body) {
        if (!body) return;
        body.setAttribute('data-overlay-dirty', 'true');
        const wrapper = typeof body.closest === 'function' ? body.closest('.aivi-overlay-block') : null;
        if (wrapper) {
            wrapper.setAttribute('data-overlay-dirty', 'true');
        }
    }

    function clearOverlayBodyDirty(body) {
        if (!body) return;
        body.removeAttribute('data-overlay-dirty');
        const wrapper = typeof body.closest === 'function' ? body.closest('.aivi-overlay-block') : null;
        if (wrapper) {
            wrapper.removeAttribute('data-overlay-dirty');
        }
    }

    function isOverlayBodyDirty(body) {
        return !!(body && body.getAttribute('data-overlay-dirty') === 'true');
    }

    function extractEditableValueForBlock(blockInfo, body) {
        if (!blockInfo || !blockInfo.block || !body) return '';
        const block = blockInfo.block;
        const html = extractEditableHtml(body);
        const textFallback = normalizeText(body.textContent || '');

        if (block.name === 'core/list') {
            const container = state.contextDoc ? state.contextDoc.createElement('div') : document.createElement('div');
            container.innerHTML = html;
            let list = container.querySelector('ul,ol');
            if (!list) {
                const listMarkup = convertTextToListMarkup(htmlToText(html) || textFallback);
                if (!listMarkup) return '';
                container.innerHTML = listMarkup;
                list = container.querySelector('ul,ol');
            }
            return list ? String(list.innerHTML || '').trim() : '';
        }

        return html || textFallback || '';
    }

    function buildOverlayEditedHtmlSnapshot() {
        if (!state.overlayContent) return '';
        const bodies = Array.from(state.overlayContent.querySelectorAll('.aivi-overlay-block-body[data-editable="true"]'));
        if (bodies.length !== 1) return '';
        const body = bodies[0];
        const wrapper = typeof body.closest === 'function' ? body.closest('.aivi-overlay-block') : null;
        if (!wrapper || wrapper.getAttribute('data-block-name') !== 'classic/content') return '';
        return extractEditableHtml(body).trim();
    }

    function dispatchDomInputEvents(element) {
        if (!element || !element.ownerDocument) return;
        const view = element.ownerDocument.defaultView || window;
        ['input', 'change'].forEach((eventName) => {
            try {
                const event = new view.Event(eventName, { bubbles: true });
                element.dispatchEvent(event);
            } catch (e) {
            }
        });
    }

    function applyHtmlToNonBlockEditor(html) {
        const nextHtml = typeof html === 'string' ? html : '';
        if (!nextHtml.trim()) {
            return 'apply_failed';
        }
        let applied = false;
        let unchanged = false;

        const current = readEditorPost();
        if (current && typeof current.content === 'string') {
            const currentContent = current.content.trim();
            if (currentContent && currentContent === nextHtml.trim()) {
                unchanged = true;
            }
        }

        try {
            if (wp && wp.data && typeof wp.data.dispatch === 'function') {
                const editorDispatcher = wp.data.dispatch('core/editor');
                if (editorDispatcher && typeof editorDispatcher.editPost === 'function') {
                    editorDispatcher.editPost({ content: nextHtml });
                    applied = true;
                }
            }
        } catch (e) {
        }

        const hostDocs = [];
        if (state.contextDoc) hostDocs.push(state.contextDoc);
        if (typeof window !== 'undefined' && window.document && window.document !== state.contextDoc) {
            hostDocs.push(window.document);
        }
        for (let i = 0; i < hostDocs.length; i += 1) {
            const doc = hostDocs[i];
            if (!doc || typeof doc.getElementById !== 'function') continue;
            const textarea = doc.getElementById('content');
            if (textarea) {
                textarea.value = nextHtml;
                dispatchDomInputEvents(textarea);
                applied = true;
            }
        }

        try {
            const activeTiny = window && window.tinyMCE && typeof window.tinyMCE.get === 'function'
                ? window.tinyMCE.get('content')
                : null;
            if (activeTiny && typeof activeTiny.setContent === 'function') {
                activeTiny.setContent(nextHtml, { format: 'raw' });
                if (typeof activeTiny.save === 'function') {
                    activeTiny.save();
                }
                applied = true;
            }
        } catch (e) {
        }

        const verifyEditedPostContent = () => {
            try {
                if (select && select('core/editor') && typeof select('core/editor').getEditedPostContent === 'function') {
                    const edited = select('core/editor').getEditedPostContent();
                    if (normalizeComparableEditorValue(edited) === normalizeComparableEditorValue(nextHtml)) {
                        return true;
                    }
                }
            } catch (e) {
            }
            return false;
        };

        const verifyTextareaContent = () => {
            const docs = [];
            if (state.contextDoc) docs.push(state.contextDoc);
            if (typeof window !== 'undefined' && window.document && window.document !== state.contextDoc) {
                docs.push(window.document);
            }
            for (let i = 0; i < docs.length; i += 1) {
                const doc = docs[i];
                if (!doc || typeof doc.getElementById !== 'function') continue;
                const textarea = doc.getElementById('content');
                if (!textarea) continue;
                if (normalizeComparableEditorValue(textarea.value) === normalizeComparableEditorValue(nextHtml)) {
                    return true;
                }
            }
            return false;
        };

        const verifyTinyMceContent = () => {
            try {
                const activeTiny = window && window.tinyMCE && typeof window.tinyMCE.get === 'function'
                    ? window.tinyMCE.get('content')
                    : null;
                if (!activeTiny || typeof activeTiny.getContent !== 'function') return false;
                const currentHtml = activeTiny.getContent({ format: 'raw' });
                return normalizeComparableEditorValue(currentHtml) === normalizeComparableEditorValue(nextHtml);
            } catch (e) {
                return false;
            }
        };

        const verified = verifyEditedPostContent() || verifyTextareaContent() || verifyTinyMceContent();
        if (!applied && unchanged) {
            return 'unchanged';
        }
        if (applied && verified) {
            return 'applied';
        }
        return 'apply_failed';
    }

    function updateBlockFromEditable(nodeRef, body) {
        if (!nodeRef || !body || !wp || !wp.data || !wp.data.dispatch) return 'apply_failed';
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.updateBlockAttributes !== 'function') return 'apply_failed';
        const blocks = getBlocks();
        const blockInfo = findBlockByNodeRef(blocks, nodeRef);
        if (!blockInfo) return 'apply_failed';
        if (isTitleBlock(blockInfo)) return 'skipped_title';
        const attrKey = getBlockTextKey(blockInfo.block);
        if (!attrKey) return 'apply_failed';
        const nextValue = extractEditableValueForBlock(blockInfo, body);
        const currentValue = blockInfo.block.attributes && typeof blockInfo.block.attributes[attrKey] === 'string'
            ? blockInfo.block.attributes[attrKey]
            : '';
        if (nextValue === currentValue) return 'unchanged';
        dispatcher.updateBlockAttributes(blockInfo.clientId, { [attrKey]: nextValue });
        if (!verifyBlockAttributeApplied(nodeRef, attrKey, nextValue)) return 'apply_failed';
        if (isAutoStaleDetectionEnabled()) {
            state.isStale = true;
        }
        return 'updated';
    }

    function markOverlayEditableChanged(reason, body) {
        if (body) {
            markOverlayBodyDirty(body);
        } else if (state.activeEditableBody) {
            markOverlayBodyDirty(state.activeEditableBody);
        }
        setOverlayDirty(true);
        scheduleOverlayDraftSave(reason || 'input');
    }

    function setActiveEditableBody(body, nodeRef) {
        state.activeEditableBody = body || null;
        state.activeEditableNodeRef = nodeRef || '';
        if (!state.overlayContent) return;
        const active = state.overlayContent.querySelectorAll('.aivi-overlay-block-editing');
        active.forEach((el) => el.classList.remove('aivi-overlay-block-editing'));
        if (body && typeof body.closest === 'function') {
            const wrapper = body.closest('.aivi-overlay-block');
            if (wrapper) {
                wrapper.classList.add('aivi-overlay-block-editing');
                if (state.blockMenu && !state.blockMenu.hidden && state.blockMenuNodeRef === (nodeRef || '')) {
                    positionBlockMenuForWrapper(wrapper);
                }
            }
        }
        queueToolbarActiveRefresh();
    }

    function flushPendingBlockUpdates() {
        if (state.overlayApplyRuntime && state.overlayApplyRuntime.safeApply === false) {
            return {
                updated: 0,
                unchanged: 0,
                failed: 0,
                total: 0,
                updatedClientIds: [],
                blocked: true,
                blockedReason: state.overlayApplyRuntime.blockedReason || 'unsafe_editor_state',
                blockedMessage: state.overlayApplyRuntime.blockedMessage || 'AiVI could not verify a safe editor state for apply.'
            };
        }
        if (!state.overlayContent) return { updated: 0, unchanged: 0, failed: 0, total: 0 };
        const bodies = Array.from(state.overlayContent.querySelectorAll('.aivi-overlay-block-body[data-editable="true"]'));
        const dirtyBodies = bodies.filter((body) => isOverlayBodyDirty(body));
        const blocks = getBlocks();
        const hasBlockEditorContent = Array.isArray(blocks) && blocks.length > 0;
        if (!dirtyBodies.length) {
            return { updated: 0, unchanged: 0, failed: 0, total: 0, updatedClientIds: [], noChanges: true };
        }
        if (!hasBlockEditorContent) {
            const snapshotHtml = buildOverlayEditedHtmlSnapshot();
            if (!snapshotHtml) {
                return {
                    updated: 0,
                    unchanged: 0,
                    failed: 0,
                    total: dirtyBodies.length,
                    updatedClientIds: [],
                    blocked: true,
                    blockedReason: 'unsafe_full_editor_snapshot',
                    blockedMessage: 'AiVI could not safely assemble the full editor content for apply. No changes were written.'
                };
            }
            const fallbackResult = applyHtmlToNonBlockEditor(snapshotHtml);
            if (fallbackResult === 'applied') {
                dirtyBodies.forEach((body) => clearOverlayBodyDirty(body));
                return { updated: Math.max(1, dirtyBodies.length), unchanged: 0, failed: 0, total: Math.max(1, dirtyBodies.length), updatedClientIds: [] };
            }
            if (fallbackResult === 'unchanged') {
                dirtyBodies.forEach((body) => clearOverlayBodyDirty(body));
                return { updated: 0, unchanged: Math.max(1, dirtyBodies.length), failed: 0, total: Math.max(1, dirtyBodies.length), updatedClientIds: [] };
            }
            return { updated: 0, unchanged: 0, failed: Math.max(1, dirtyBodies.length), total: Math.max(1, dirtyBodies.length), updatedClientIds: [] };
        }

        let updated = 0;
        let unchanged = 0;
        let failed = 0;
        const updatedClientIds = [];
        dirtyBodies.forEach((body) => {
            const wrapper = body.closest('.aivi-overlay-block');
            const nodeRef = wrapper ? wrapper.getAttribute('data-node-ref') : '';
            if (!nodeRef) {
                failed += 1;
                return;
            }
            const result = updateBlockFromEditable(nodeRef, body);
            if (result === 'updated') {
                updated += 1;
                const info = findBlockByNodeRef(blocks, nodeRef);
                if (info && info.clientId) {
                    updatedClientIds.push(info.clientId);
                }
                clearOverlayBodyDirty(body);
            }
            else if (result === 'unchanged' || result === 'skipped_title') {
                unchanged += 1;
                clearOverlayBodyDirty(body);
            }
            else failed += 1;
        });
        return { updated, unchanged, failed, total: dirtyBodies.length, updatedClientIds };
    }

    function enableEditableBody(body, block, nodeRef) {
        if (!body) return;
        if (!isEditableBlock(block)) return;
        body.setAttribute('contenteditable', 'true');
        body.setAttribute('data-editable', 'true');
        body.addEventListener('focus', () => setActiveEditableBody(body, nodeRef));
        body.addEventListener('click', () => setActiveEditableBody(body, nodeRef));
        body.addEventListener('keyup', () => setActiveEditableBody(body, nodeRef));
        body.addEventListener('input', () => markOverlayEditableChanged('input', body));
        body.addEventListener('blur', () => {
            setActiveEditableBody(body, nodeRef);
            if (state.overlayDirty) {
                scheduleOverlayDraftSave('blur');
            }
        });
        const wrapper = typeof body.closest === 'function' ? body.closest('.aivi-overlay-block') : null;
        if (wrapper && !wrapper._aiviBlockShellBound) {
            wrapper._aiviBlockShellBound = true;
            wrapper.addEventListener('mousedown', (event) => {
                const target = event.target;
                if (!target) return;
                if (target === body || body.contains(target)) return;
                if (typeof target.closest === 'function') {
                    if (target.closest('.aivi-overlay-block-handle')) return;
                    if (target.closest('.aivi-overlay-inline-panel')) return;
                    if (target.closest('.aivi-overlay-highlight')) return;
                }
                event.preventDefault();
                body.focus();
                setActiveEditableBody(body, nodeRef);
            });
        }
    }

    function replaceText(text, original, applied) {
        if (!text) return String(applied || '');
        if (!original) return String(applied || '');
        if (text.includes(original)) {
            return text.replace(original, applied);
        }
        return text;
    }

    function getBlockTextKey(block) {
        if (!block || !block.attributes) return '';
        if (typeof block.attributes.content === 'string') return 'content';
        if (typeof block.attributes.value === 'string') return 'value';
        if (typeof block.attributes.values === 'string') return 'values';
        if (typeof block.attributes.caption === 'string') return 'caption';
        if (typeof block.attributes.alt === 'string') return 'alt';
        return '';
    }

    function normalizeComparableEditorValue(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getBlockAttributeValue(block, attrKey) {
        if (!block || !block.attributes || !attrKey) return '';
        return typeof block.attributes[attrKey] === 'string'
            ? block.attributes[attrKey]
            : '';
    }

    function verifyBlockAttributeApplied(nodeRef, attrKey, expectedValue) {
        const blocks = getBlocks();
        const info = findBlockByNodeRef(blocks, nodeRef);
        if (!info || !info.block) return false;
        const actualValue = getBlockAttributeValue(info.block, attrKey);
        return normalizeComparableEditorValue(actualValue) === normalizeComparableEditorValue(expectedValue);
    }

    function findBlockByNodeRef(blocks, nodeRef) {
        if (!nodeRef || !Array.isArray(blocks)) return null;
        const match = String(nodeRef).match(/^block-(\d+)(?:-inner-(\d+))?$/);
        if (!match) return null;
        const blockIndex = parseInt(match[1], 10);
        if (Number.isNaN(blockIndex) || !blocks[blockIndex]) return null;
        const block = blocks[blockIndex];
        if (match[2] && Array.isArray(block.innerBlocks)) {
            const innerIndex = parseInt(match[2], 10);
            if (Number.isNaN(innerIndex) || !block.innerBlocks[innerIndex]) return null;
            return { block: block.innerBlocks[innerIndex], clientId: block.innerBlocks[innerIndex].clientId, blockIndex, innerIndex };
        }
        return { block, clientId: block.clientId, blockIndex };
    }

    function isTitleBlock(info) {
        if (!info || !info.block) return false;
        if (typeof info.innerIndex === 'number') return false;
        if (info.blockIndex !== 0) return false;
        if (info.block.name !== 'core/heading') return false;
        const level = info.block.attributes && info.block.attributes.level ? Number(info.block.attributes.level) : 1;
        return level === 1;
    }

    function clearJumpFocus(clearState) {
        if (state.jumpFlashTimer) {
            clearTimeout(state.jumpFlashTimer);
            state.jumpFlashTimer = null;
        }
        if (state.overlayContent) {
            const focused = state.overlayContent.querySelectorAll('.aivi-overlay-block-jump-focus, .aivi-overlay-block-jump-flash, .aivi-overlay-block-focus');
            focused.forEach((el) => {
                el.classList.remove('aivi-overlay-block-jump-focus');
                el.classList.remove('aivi-overlay-block-jump-flash');
                el.classList.remove('aivi-overlay-block-focus');
            });
        }
        if (clearState) {
            state.lastJumpNodeRef = '';
        }
    }

    function applyJumpFocus(nodeRef, withFlash) {
        if (!nodeRef || !state.overlayContent) return false;
        const safeRef = String(nodeRef).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const target = state.overlayContent.querySelector(`[data-node-ref="${safeRef}"]`);
        if (!target) return false;

        clearJumpFocus(false);
        target.classList.add('aivi-overlay-block-jump-focus');
        state.lastJumpNodeRef = String(nodeRef);

        if (withFlash) {
            target.classList.add('aivi-overlay-block-jump-flash');
            state.jumpFlashTimer = setTimeout(() => {
                target.classList.remove('aivi-overlay-block-jump-flash');
                state.jumpFlashTimer = null;
            }, 2200);
        }
        return true;
    }

    function restoreJumpFocus() {
        if (!state.lastJumpNodeRef) return;
        applyJumpFocus(state.lastJumpNodeRef, false);
    }

    function jumpToOverlayNode(nodeRef) {
        if (!nodeRef || !state.overlayContent || !state.overlayViewport || !state.contextDoc) return false;
        const safeRef = String(nodeRef).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const target = state.overlayContent.querySelector(`[data-node-ref="${safeRef}"]`);
        if (!target) return false;
        try {
            const containerRect = state.overlayViewport.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const offsetTop = targetRect.top - containerRect.top + state.overlayViewport.scrollTop;
            const top = Math.max(0, offsetTop - 24);
            if (typeof state.overlayViewport.scrollTo === 'function') {
                state.overlayViewport.scrollTo({ top, behavior: 'smooth' });
            } else {
                state.overlayViewport.scrollTop = top;
            }
        } catch (e) {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return applyJumpFocus(nodeRef, true);
    }

    state.buildUnhighlightableSection = function (issues) {
        if (!state.contextDoc || !Array.isArray(issues) || !issues.length) return null;
        const wrap = state.contextDoc.createElement('div');
        wrap.className = 'aivi-overlay-unhighlightable';
        const title = state.contextDoc.createElement('div');
        title.className = 'aivi-overlay-recommendations-title';
        title.textContent = 'Recommendations';
        const subtitle = state.contextDoc.createElement('div');
        subtitle.className = 'aivi-overlay-recommendations-subtitle';
        subtitle.textContent = `${issues.length} prioritized recommendation${issues.length === 1 ? '' : 's'} from this analysis.`;
        wrap.appendChild(title);
        wrap.appendChild(subtitle);
        issues.forEach((issue, index) => {
            if (!issue) return;
            const itemWrap = state.contextDoc.createElement('div');
            itemWrap.className = 'aivi-overlay-recommendation-item';
            const checkName = state.contextDoc.createElement('div');
            checkName.className = 'aivi-overlay-recommendation-check';
            checkName.textContent = issue.check_name || issue.check_id || 'Unknown check';
            const preferredSummary = normalizeText(issue.review_summary || '');
            const sanitizedMessage = sanitizeInlineIssueMessage(
                preferredSummary || issue.message || '',
                { name: issue.check_name || issue.check_id || '' }
            );
            const summaryText = sanitizedMessage || preferredSummary || 'Issue detected but could not be anchored.';
            const explanationPack = resolveExplanationPack(
                clonePlainObject(issue.explanation_pack),
                {
                    what_failed: summaryText,
                    how_to_fix_step: issue.action_suggestion || 'Review this section manually and update the related sentence.',
                    issue_explanation: issue.issue_explanation || ''
                }
            );
            const detailText = resolveRecommendationDetailText(issue, explanationPack, summaryText);
            const snippet = state.contextDoc.createElement('div');
            snippet.className = 'aivi-overlay-recommendation-snippet';
            snippet.textContent = issue.snippet || '';
            const actions = state.contextDoc.createElement('div');
            actions.className = 'aivi-overlay-recommendation-actions';
            const button = state.contextDoc.createElement('button');
            button.type = 'button';
            button.className = 'aivi-overlay-recommendation-btn';
            button.textContent = 'View details';
            const jumpButton = state.contextDoc.createElement('button');
            jumpButton.type = 'button';
            jumpButton.className = 'aivi-overlay-recommendation-btn';
            jumpButton.textContent = 'Jump to block';
            const syntheticReasons = new Set([
                'synthetic_fallback',
                'missing_ai_checks',
                'chunk_parse_failure',
                'time_budget_exceeded',
                'truncated_response'
            ]);
            const normalizedFailureReason = String(issue.failure_reason || '').trim().toLowerCase();
            const jumpNodeRef = issue.jump_node_ref || issue.node_ref || '';
            const allowJump = !!jumpNodeRef && !syntheticReasons.has(normalizedFailureReason);
            if (allowJump) {
                jumpButton.addEventListener('click', () => {
                    const jumped = jumpToOverlayNode(jumpNodeRef);
                    if (!jumped) {
                        setMetaStatus('Could not locate block for this recommendation');
                    }
                });
            }
            const panel = state.contextDoc.createElement('div');
            panel.className = 'aivi-overlay-inline-panel';
            panel.style.display = 'none';
            const issueKey = issue.issue_key || `${issue.check_id || 'issue'}:${typeof issue.instance_index === 'number' ? issue.instance_index : index}`;
            const issueRewriteTarget = clonePlainObject(issue.rewrite_target);
            const issueRepairIntent = clonePlainObject(issue.repair_intent);
            const issueSchemaAssist = clonePlainObject(issue.schema_assist);
            const issueAnalysisRef = firstObject(
                issue.analysis_ref,
                {
                    run_id: issue.run_id || (state.lastReport && state.lastReport.run_id) || '',
                    check_id: issue.check_id || '',
                    instance_index: typeof issue.instance_index === 'number' ? issue.instance_index : index
                }
            );
            const item = {
                key: issueKey,
                isRecommendation: true,
                check: {
                    check_id: issue.check_id || '',
                    explanation: summaryText,
                    action_suggestion: issue.action_suggestion || '',
                    explanation_pack: clonePlainObject(issue.explanation_pack) || explanationPack,
                    review_summary: normalizeText(issue.review_summary || ''),
                    issue_explanation: normalizeText(issue.issue_explanation || ''),
                    rewrite_target: issueRewriteTarget || null,
                    repair_intent: issueRepairIntent || null,
                    analysis_ref: issueAnalysisRef || null,
                    schema_assist: issueSchemaAssist || null
                },
                explanation_pack: clonePlainObject(issue.explanation_pack) || explanationPack,
                review_summary: normalizeText(issue.review_summary || ''),
                issue_explanation: normalizeText(issue.issue_explanation || ''),
                rewrite_target: issueRewriteTarget || null,
                repair_intent: issueRepairIntent || null,
                analysis_ref: issueAnalysisRef || null,
                schema_assist: issueSchemaAssist || null,
                highlight: {
                    snippet: issue.snippet || '',
                    message: summaryText,
                    explanation_pack: clonePlainObject(issue.explanation_pack) || explanationPack,
                    review_summary: normalizeText(issue.review_summary || ''),
                    issue_explanation: normalizeText(issue.issue_explanation || ''),
                    node_ref: issue.node_ref || '',
                    signature: issue.signature || '',
                    start: Number.isFinite(issue.start) ? Number(issue.start) : null,
                    end: Number.isFinite(issue.end) ? Number(issue.end) : null,
                    instance_index: typeof issue.instance_index === 'number' ? issue.instance_index : index,
                    rewrite_target: issueRewriteTarget || null,
                    analysis_ref: issueAnalysisRef || null,
                    schema_assist: issueSchemaAssist || null
                }
            };
            const hasRecommendationDetails = !!(detailText || issue.snippet);
            if (!hasRecommendationDetails) {
                button.disabled = true;
                button.title = 'No additional details are available for this issue.';
            }
            button.addEventListener('click', () => {
                if (!hasRecommendationDetails) return;
                if (panel.style.display === 'none') {
                    renderInlinePanel(panel, item);
                    panel.style.display = 'flex';
                    button.textContent = 'Hide details';
                } else {
                    panel.style.display = 'none';
                    panel.innerHTML = '';
                    button.textContent = 'View details';
                }
            });
            if (allowJump) {
                actions.appendChild(jumpButton);
            }
            actions.appendChild(button);
            itemWrap.appendChild(checkName);
            const explanationNode = buildGuidanceTextNode(detailText, 'aivi-overlay-guidance-recommendation');
            if (explanationNode) {
                itemWrap.appendChild(explanationNode);
            }
            if (issue.snippet) {
                itemWrap.appendChild(snippet);
            }
            itemWrap.appendChild(actions);
            itemWrap.appendChild(panel);
            wrap.appendChild(itemWrap);
        });
        return wrap;
    }

    function renderBlocks(force) {
        if (!state.overlayContent || !state.contextDoc) {
            return;
        }
        if (state.overlayDirty) {
            persistOverlayDraft('render_refresh');
        }
        const allBlocks = getBlocks();
        const filtered = allBlocks.filter((block, index) => !shouldSkipBlock(block, index));
        const blocksKey = buildBlocksKey(allBlocks);
        if (!force && blocksKey === state.lastBlocksKey) {
            renderOverlayDocumentHeader(allBlocks);
            renderReviewRail(collectOverlayRecommendations(state.overlayContentData));
            queueOverlayLayoutSync();
            return;
        }
        state.overlayContent.innerHTML = '';
        hideBlockMenu();
        resetInlineSuppressedRecommendations();

        renderOverlayDocumentHeader(allBlocks);
        renderReviewRail(collectOverlayRecommendations(state.overlayContentData));
        state.lastBlocksKey = blocksKey;
        const DISABLE_SEMANTIC_HIGHLIGHT_V1 = (() => {
            try {
                return localStorage.getItem('aivi.disable_semantic_v1') === '1'
                    || (window.AIVI_FEATURE_FLAGS && window.AIVI_FEATURE_FLAGS.SEMANTIC_HIGHLIGHT_V1_RENDER === false);
            } catch (e) {
                return false;
            }
        })();
        const useV2 = isSemanticV2Enabled();
        const hasEditorBlocks = filtered.length > 0;
        const editorPost = readEditorPost();
        const runtime = getOverlayEditorRuntime(allBlocks, editorPost);
        state.overlayApplyRuntime = runtime;
        const useServerHighlightedHtmlFallback = !DISABLE_SEMANTIC_HIGHLIGHT_V1
            && runtime.renderSource === 'server_preview'
            && !state.isStale;

        function markServerPreviewBlocksReadOnly() {
            const wrappers = state.overlayContent.querySelectorAll('.aivi-overlay-block');
            wrappers.forEach((wrapper) => {
                wrapper.setAttribute('data-editability', 'readonly');
                const body = wrapper.querySelector('.aivi-overlay-block-body');
                if (body) {
                    body.removeAttribute('contenteditable');
                    body.removeAttribute('data-editable');
                    body.setAttribute('data-editability', 'readonly');
                }
            });
        }

        if (useServerHighlightedHtmlFallback) {
            state.overlayContent.innerHTML = state.overlayContentData.highlighted_html;
            markServerPreviewBlocksReadOnly();
            const removedPassSpans = stripPassHighlightSpans(
                state.overlayContent,
                buildSummaryVerdictMap(state.lastReport)
            );
            if (removedPassSpans > 0) {
                debugLog('warn', 'AiVI Overlay: removed pass verdict spans from highlighted_html', {
                    removed: removedPassSpans
                });
            }
            // Still build index to populate state.issueMap for lookups
            buildIssueIndex(allBlocks);

            // Attach listeners to the pre-rendered spans
            const spans = state.overlayContent.querySelectorAll('.aivi-overlay-highlight');
            const countsByCheck = {};
            spans.forEach((span) => {
                const meta = getOverlaySpanMeta(span);
                const key = meta.checkId || 'unknown';
                countsByCheck[key] = (countsByCheck[key] || 0) + 1;
            });
            debugLog('debug', 'AiVI Overlay: highlighted_html spans attached', {
                total: spans.length,
                countsByCheck: countsByCheck,
                overlayContentMeta: state.overlayContentData && typeof state.overlayContentData === 'object'
                    ? {
                        schema_version: state.overlayContentData.schema_version,
                        generated_at: state.overlayContentData.generated_at,
                        run_id: state.overlayContentData.run_id,
                        content_hash: state.overlayContentData.content_hash
                    }
                    : null
            });
            spans.forEach(span => {
                span.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const resolved = resolveIssueItemFromSpan(span);
                    if (resolved.item) {
                        openInlinePanel(resolved.item, span, resolved.items);
                        return;
                    }

                    const meta = resolved.meta;
                    const snippet = span.textContent || '';
                    let bestItem = null;
                    if (meta.checkId && state.issueMap) {
                        for (const item of state.issueMap.values()) {
                            const itemCheckId = item.check.check_id || item.check.id;
                            if (itemCheckId !== meta.checkId) continue;
                            if (Number.isFinite(meta.instanceIndex) && meta.instanceIndex >= 0) {
                                const itemIndex = typeof item.highlight?.instance_index === 'number'
                                    ? item.highlight.instance_index
                                    : null;
                                if (itemIndex !== null && itemIndex === meta.instanceIndex) {
                                    bestItem = item;
                                    break;
                                }
                            }
                            const itemSnippet = item.highlight.snippet || item.highlight.text || '';
                            if (itemSnippet === snippet || itemSnippet.includes(snippet) || snippet.includes(itemSnippet)) {
                                bestItem = item;
                                break;
                            }
                        }
                    }

                    if (bestItem) {
                        openInlinePanel(bestItem, span, [bestItem]);
                        return;
                    }

                    debugLog('warn', 'AiVI Overlay: highlight click could not map to issue item', {
                        meta: meta,
                        snippet_preview: snippet ? snippet.slice(0, 160) : ''
                    });

                    const fallbackItem = {
                        key: 'fallback-' + Date.now(),
                        isFallback: true,
                        check: {
                            check_id: meta.checkId || '',
                            explanation: meta.message || 'Issue detected'
                        },
                        highlight: {
                            snippet: snippet,
                            message: meta.message || ''
                        }
                    };
                    openInlinePanel(fallbackItem, span, [fallbackItem]);
                });
            });

            if (runtime.blockedMessage) {
                setMetaStatus(runtime.blockedMessage);
            }
            restoreJumpFocus();
            restoreOverlayDraftIfAvailable();
            queueOverlayLayoutSync();

            return;
        }

        if (!hasEditorBlocks) {
            const fallbackHtml = (editorPost && typeof editorPost.content === 'string' ? editorPost.content : '')
                || (state.lastManifest && typeof state.lastManifest.content_html === 'string' ? state.lastManifest.content_html : '')
                || '';
            if (!fallbackHtml.trim()) {
                const empty = state.contextDoc.createElement('div');
                empty.className = 'aivi-overlay-empty';
                empty.textContent = 'No editor blocks available.';
                state.overlayContent.appendChild(empty);
                queueOverlayLayoutSync();
                return;
            }

            hideInlinePanel();
            const { items } = buildIssueIndex(allBlocks);
            const wrapper = state.contextDoc.createElement('div');
            wrapper.className = 'aivi-overlay-block';
            wrapper.setAttribute('data-block-name', 'classic/content');
            wrapper.setAttribute('data-node-ref', 'block-0');

            const body = state.contextDoc.createElement('div');
            body.className = 'aivi-overlay-block-body';
            body.innerHTML = fallbackHtml;
            applyHighlightsToBody(body, items || [], useV2);
            body.setAttribute('contenteditable', 'true');
            body.setAttribute('data-editable', 'true');
            body.addEventListener('focus', () => setActiveEditableBody(body, 'block-0'));
            body.addEventListener('click', () => setActiveEditableBody(body, 'block-0'));
            body.addEventListener('keyup', () => setActiveEditableBody(body, 'block-0'));
            body.addEventListener('input', () => {
                setOverlayDirty(true);
                scheduleOverlayDraftSave('input_classic');
            });

            const panel = state.contextDoc.createElement('div');
            panel.className = 'aivi-overlay-inline-panel';
            panel.style.cssText = 'display:none;flex-direction:column;gap:10px;margin-top:10px;padding:12px;border:1px solid #d7dfec;border-radius:12px;background:#fff;box-shadow:0 8px 18px rgba(15,23,42,.06);';
            const handle = buildBlockHandle('block-0', body);
            if (handle) wrapper.appendChild(handle);
            wrapper.appendChild(body);
            wrapper.appendChild(panel);
            state.overlayContent.appendChild(wrapper);

            restoreJumpFocus();
            restoreOverlayDraftIfAvailable();
            queueOverlayLayoutSync();
            return;
        }

        hideInlinePanel();
        const { highlightsByRef } = buildIssueIndex(allBlocks);
        const collectItemsForTopNodeRef = (topNodeRef) => {
            const matched = [];
            const seen = new Set();
            const pushItem = (item) => {
                if (!item || !item.key || seen.has(item.key)) return;
                seen.add(item.key);
                matched.push(item);
            };
            (highlightsByRef.get(topNodeRef) || []).forEach(pushItem);
            const nestedPrefix = `${topNodeRef}-inner-`;
            highlightsByRef.forEach((list, ref) => {
                if (typeof ref !== 'string' || ref.indexOf(nestedPrefix) !== 0) return;
                (list || []).forEach(pushItem);
            });
            return matched;
        };

        allBlocks.forEach((block, index) => {
            if (shouldSkipBlock(block, index)) return;
            const nodeRef = `block-${index}`;
            const wrapper = state.contextDoc.createElement('div');
            wrapper.className = 'aivi-overlay-block';
            wrapper.setAttribute('data-block-name', block.name || '');
            wrapper.setAttribute('data-node-ref', nodeRef);
            const renderMode = getOverlayBlockRenderMode(block);
            wrapper.setAttribute('data-editability', renderMode);

            const body = state.contextDoc.createElement('div');
            body.className = 'aivi-overlay-block-body';
            body.setAttribute('data-editability', renderMode);
            const html = renderMode === 'editable'
                ? getEditableBodyInitialHtml(block)
                : buildBlockHtml(block);
            if (html) {
                body.innerHTML = html;
            } else {
                const text = normalizeText(block?.attributes?.content || block?.attributes?.value || '');
                body.textContent = text || 'Unsupported block type.';
            }
            const items = collectItemsForTopNodeRef(nodeRef);
            applyHighlightsToBody(body, items, useV2);
            enableEditableBody(body, block, nodeRef);
            const handle = buildBlockHandle(nodeRef, body);
            const blockState = buildOverlayBlockState(renderMode);

            const panel = state.contextDoc.createElement('div');
            panel.className = 'aivi-overlay-inline-panel';
            panel.style.cssText = 'display:none;flex-direction:column;gap:10px;margin-top:10px;padding:12px;border:1px solid #d7dfec;border-radius:12px;background:#fff;box-shadow:0 8px 18px rgba(15,23,42,.06);';

            if (handle) wrapper.appendChild(handle);
            if (blockState) wrapper.appendChild(blockState);
            wrapper.appendChild(body);
            wrapper.appendChild(panel);
            state.overlayContent.appendChild(wrapper);
        });
        queueOverlayLayoutSync();

        restoreJumpFocus();
        restoreOverlayDraftIfAvailable();
    }

    function buildBlockHandle(nodeRef, body) {
        if (!state.contextDoc) return null;
        const button = state.contextDoc.createElement('button');
        button.type = 'button';
        button.className = 'aivi-overlay-block-handle';
        button.setAttribute('aria-label', 'Open block actions');
        button.setAttribute('data-node-ref', nodeRef || '');
        button.innerHTML = '<span></span><span></span><span></span>';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (state.blockMenu && !state.blockMenu.hidden && state.blockMenuNodeRef === (nodeRef || '')) {
                hideBlockMenu();
                return;
            }
            openBlockMenuForBody(body, nodeRef);
        });
        return button;
    }

    function setMetaStatus(text) {
        state.metaStatus = text || '';
        const el = state.overlayPanel ? state.overlayPanel.querySelector('#aivi-overlay-rail-status') : null;
        if (el) {
            el.textContent = state.metaStatus;
            el.hidden = !state.metaStatus;
        }
        queueOverlayLayoutSync();
    }

    function resolveActiveEditableFromSelection() {
        if (!state.contextDoc || !state.overlayContent) return null;
        const selection = state.contextDoc.getSelection ? state.contextDoc.getSelection() : null;
        if (!selection || selection.rangeCount < 1) return null;
        const range = selection.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (!node) return null;
        if (node.nodeType === 3) {
            node = node.parentNode;
        }
        if (!node || !state.overlayContent.contains(node)) return null;
        const editableBody = typeof node.closest === 'function'
            ? node.closest('.aivi-overlay-block-body[data-editable="true"]')
            : null;
        if (!editableBody) return null;
        const wrapper = editableBody.closest('.aivi-overlay-block');
        const nodeRef = wrapper ? wrapper.getAttribute('data-node-ref') : '';
        return { body: editableBody, nodeRef: nodeRef || '' };
    }

    function getSelectionFormattingSnapshot() {
        if (!state.contextDoc) return null;
        const active = resolveActiveEditableFromSelection() || (
            state.activeEditableBody
                ? { body: state.activeEditableBody, nodeRef: state.activeEditableNodeRef || '' }
                : null
        );
        if (!active || !active.body) return null;

        const selection = state.contextDoc.getSelection ? state.contextDoc.getSelection() : null;
        let node = null;
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            node = range ? range.commonAncestorContainer : null;
        }
        if (!node) {
            node = selection && selection.anchorNode ? selection.anchorNode : active.body;
        }
        if (node && node.nodeType === 3) {
            node = node.parentNode;
        }
        if (!node || !active.body.contains(node)) {
            node = active.body;
        }

        const hasAncestorTag = (tagName) => {
            if (!node) return false;
            const wanted = String(tagName || '').toUpperCase();
            let current = node;
            while (current && current !== active.body) {
                if (current.nodeType === 1 && String(current.tagName || '').toUpperCase() === wanted) {
                    return true;
                }
                current = current.parentNode;
            }
            if (active.body.nodeType === 1 && String(active.body.tagName || '').toUpperCase() === wanted) {
                return true;
            }
            return false;
        };

        const safeState = (command) => {
            if (!state.contextDoc || typeof state.contextDoc.queryCommandState !== 'function') return false;
            try {
                return !!state.contextDoc.queryCommandState(command);
            } catch (e) {
                return false;
            }
        };

        const safeValue = (command) => {
            if (!state.contextDoc || typeof state.contextDoc.queryCommandValue !== 'function') return '';
            try {
                return String(state.contextDoc.queryCommandValue(command) || '');
            } catch (e) {
                return '';
            }
        };

        const commandBlockValue = safeValue('formatBlock').toLowerCase().replace(/[<>]/g, '').trim();
        const blockTag = hasAncestorTag('H2')
            ? 'h2'
            : (hasAncestorTag('H3')
                ? 'h3'
                : (hasAncestorTag('BLOCKQUOTE')
                    ? 'blockquote'
                    : commandBlockValue));

        return {
            isBold: safeState('bold') || hasAncestorTag('STRONG') || hasAncestorTag('B'),
            isItalic: safeState('italic') || hasAncestorTag('EM') || hasAncestorTag('I'),
            isUnorderedList: safeState('insertUnorderedList') || hasAncestorTag('UL'),
            isOrderedList: safeState('insertOrderedList') || hasAncestorTag('OL'),
            isLink: hasAncestorTag('A') || safeState('createLink'),
            isH2: blockTag === 'h2',
            isH3: blockTag === 'h3',
            isQuote: blockTag === 'blockquote'
        };
    }

    function refreshToolbarActiveStates() {
        if (!Array.isArray(state.toolbarButtons) || state.toolbarButtons.length === 0) return;
        const snapshot = getSelectionFormattingSnapshot();
        state.toolbarButtons.forEach((button) => {
            if (!button) return;
            const resolver = button._aiviActiveResolver;
            if (typeof resolver !== 'function') {
                button.classList.remove('is-active');
                button.removeAttribute('aria-pressed');
                return;
            }
            const isActive = !!(snapshot && resolver(snapshot));
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function runOverlayFormatCommand(command, value) {
        if (!state.contextDoc || typeof state.contextDoc.execCommand !== 'function') {
            setMetaStatus('Editor command unavailable');
            return false;
        }
        const active = resolveActiveEditableFromSelection() || (
            state.activeEditableBody
                ? { body: state.activeEditableBody, nodeRef: state.activeEditableNodeRef || '' }
                : null
        );
        if (!active || !active.body || !active.nodeRef) {
            setMetaStatus('Select text in the overlay first');
            return false;
        }
        setActiveEditableBody(active.body, active.nodeRef);
        active.body.focus();
        try {
            const ok = state.contextDoc.execCommand(command, false, value || null);
            if (!ok && ok !== undefined) {
                setMetaStatus('Command not supported for this selection');
                return false;
            }
            markOverlayEditableChanged('format_command', active.body);
            setMetaStatus('Formatting staged in AiVI. Copy the revised text into the matching WordPress block when you are ready.');
            queueToolbarActiveRefresh();
            return true;
        } catch (e) {
            setMetaStatus('Formatting failed');
            queueToolbarActiveRefresh();
            return false;
        }
    }

    function createOverlayBlock(name) {
        if (!wp || !wp.blocks || typeof wp.blocks.createBlock !== 'function') return null;
        if (name === 'core/list') {
            return wp.blocks.createBlock('core/list', { values: '<li>New list item</li>' });
        }
        if (name === 'core/heading') {
            return wp.blocks.createBlock('core/heading', { level: 2, content: 'New heading' });
        }
        return wp.blocks.createBlock('core/paragraph', { content: '' });
    }

    state.insertBlockAfterActive = function (name) {
        if (!wp || !wp.data || !wp.data.dispatch) {
            setMetaStatus('WordPress block editor API unavailable');
            return;
        }
        const dispatcher = wp.data.dispatch('core/block-editor');
        if (!dispatcher || typeof dispatcher.insertBlocks !== 'function') {
            setMetaStatus('Insert action unavailable');
            return;
        }
        const blocks = getBlocks();
        const activeNodeRef = state.activeEditableNodeRef || '';
        const activeInfo = activeNodeRef ? findBlockByNodeRef(blocks, activeNodeRef) : null;
        const block = createOverlayBlock(name);
        if (!block) {
            setMetaStatus('Could not create block');
            return;
        }
        const insertIndex = activeInfo && Number.isFinite(activeInfo.blockIndex)
            ? activeInfo.blockIndex + 1
            : (Array.isArray(blocks) ? blocks.length : undefined);
        try {
            if (Number.isFinite(insertIndex)) {
                dispatcher.insertBlocks([block], insertIndex);
            } else {
                dispatcher.insertBlocks([block]);
            }
            if (isAutoStaleDetectionEnabled()) {
                state.isStale = true;
            }
            setOverlayDirty(true);
            scheduleOverlayDraftSave('insert_block');
            setMetaStatus('Block inserted');
            renderBlocks(true);
        } catch (e) {
            setMetaStatus('Insert failed');
        }
    }

    function confirmApplyOverlayOverwrite() {
        const title = 'Apply overlay edits to WordPress editor?';
        const message = 'Your staged AiVI edits will be sent to the matching WordPress blocks now. Review those changes in the editor, then click Update or Publish to make them live. You can still undo after applying.';
        if (!state.contextDoc || !state.overlayRoot) {
            return Promise.resolve(false);
        }
        return new Promise((resolve) => {
            const backdrop = state.contextDoc.createElement('div');
            backdrop.className = 'aivi-overlay-confirm-backdrop';
            const dialog = state.contextDoc.createElement('div');
            dialog.className = 'aivi-overlay-confirm-dialog';
            const heading = state.contextDoc.createElement('div');
            heading.className = 'aivi-overlay-confirm-title';
            heading.textContent = title;
            const body = state.contextDoc.createElement('div');
            body.className = 'aivi-overlay-confirm-message';
            body.textContent = message;
            const actions = state.contextDoc.createElement('div');
            actions.className = 'aivi-overlay-confirm-actions';
            const cancel = state.contextDoc.createElement('button');
            cancel.type = 'button';
            cancel.className = 'aivi-overlay-confirm-btn secondary';
            cancel.textContent = 'Cancel';
            const apply = state.contextDoc.createElement('button');
            apply.type = 'button';
            apply.className = 'aivi-overlay-confirm-btn primary';
            apply.textContent = 'Apply to Editor';

            const done = (accepted) => {
                if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                resolve(Boolean(accepted));
            };
            cancel.addEventListener('click', () => done(false));
            apply.addEventListener('click', () => done(true));
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) done(false);
            });
            actions.appendChild(cancel);
            actions.appendChild(apply);
            dialog.appendChild(heading);
            dialog.appendChild(body);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);
            state.overlayRoot.appendChild(backdrop);
            apply.focus();
        });
    }

    function confirmOverlayCloseDiscard() {
        const title = 'Close editor with unsaved overlay edits?';
        const message = 'Your edits stay inside AiVI. Copy any revised text you want to keep before closing, or those local changes may be lost.';
        if (!state.contextDoc || !state.overlayRoot) {
            return Promise.resolve(false);
        }
        return new Promise((resolve) => {
            const backdrop = state.contextDoc.createElement('div');
            backdrop.className = 'aivi-overlay-confirm-backdrop';
            const dialog = state.contextDoc.createElement('div');
            dialog.className = 'aivi-overlay-confirm-dialog';
            const heading = state.contextDoc.createElement('div');
            heading.className = 'aivi-overlay-confirm-title';
            heading.textContent = title;
            const body = state.contextDoc.createElement('div');
            body.className = 'aivi-overlay-confirm-message';
            body.textContent = message;
            const actions = state.contextDoc.createElement('div');
            actions.className = 'aivi-overlay-confirm-actions';
            const stay = state.contextDoc.createElement('button');
            stay.type = 'button';
            stay.className = 'aivi-overlay-confirm-btn secondary';
            stay.textContent = 'Keep Editing';
            const closeBtn = state.contextDoc.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'aivi-overlay-confirm-btn primary';
            closeBtn.textContent = 'Close Anyway';

            const done = (accepted) => {
                if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                resolve(Boolean(accepted));
            };
            stay.addEventListener('click', () => done(false));
            closeBtn.addEventListener('click', () => done(true));
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) done(false);
            });
            actions.appendChild(stay);
            actions.appendChild(closeBtn);
            dialog.appendChild(heading);
            dialog.appendChild(body);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);
            state.overlayRoot.appendChild(backdrop);
            stay.focus();
        });
    }

    async function handleApplyChangesClick() {
        const accepted = await confirmApplyOverlayOverwrite();
        if (!accepted) {
            setMetaStatus('Apply canceled');
            return;
        }
        const sync = flushPendingBlockUpdates();
        if (sync.blocked) {
            setMetaStatus(sync.blockedMessage || 'AiVI could not verify a safe editor state for apply.');
            return;
        }
        if (!sync.total) {
            setMetaStatus(sync.noChanges ? 'No changes to apply' : 'No editable content found');
            return;
        }
        if (sync.updated > 0) {
            setOverlayDirty(false);
            clearOverlayDraft();
            const noticeMessage = sync.failed > 0
                ? `Applied ${sync.updated} block${sync.updated === 1 ? '' : 's'} to the WordPress editor. ${sync.failed} block${sync.failed === 1 ? '' : 's'} stayed untouched. Review the changed blocks, then click Update or Publish.`
                : `Applied ${sync.updated} block${sync.updated === 1 ? '' : 's'} to the WordPress editor. Review the changed blocks, then click Update or Publish.`;
            if (sync.failed === 0) {
                closeOverlayInternal();
                revealAppliedChangesInEditor(sync.updatedClientIds);
                showEditorNotice(noticeMessage, 'success');
                return;
            }
            setMetaStatus(`Applied ${sync.updated} block${sync.updated === 1 ? '' : 's'} to the WordPress editor. ${sync.failed} block${sync.failed === 1 ? '' : 's'} stayed untouched.`);
            return;
        }
        if (sync.failed > 0) {
            setOverlayDirty(true);
            scheduleOverlayDraftSave('apply_failed');
            setMetaStatus(`Apply completed with ${sync.failed} block${sync.failed === 1 ? '' : 's'} skipped. Rich/read-only blocks stay untouched.`);
            return;
        }
        if (sync.unchanged > 0) {
            setOverlayDirty(false);
            clearOverlayDraft();
        }
        setMetaStatus('No changes to apply');
    }

    async function copyToClipboard() {
        const html = buildClipboardHtml();
        if (!html) {
            setMetaStatus('Nothing to copy');
            return;
        }
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([htmlToText(html)], { type: 'text/plain' })
                });
                await navigator.clipboard.write([item]);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(html);
            } else {
                const textarea = state.contextDoc.createElement('textarea');
                textarea.value = html;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                state.contextDoc.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                state.contextDoc.execCommand('copy');
                state.contextDoc.body.removeChild(textarea);
            }
            setMetaStatus('Copied');
        } catch (e) {
            setMetaStatus('Copy failed');
        }
    }

    function buildClipboardHtml() {
        const blocks = getBlocks();
        if (!blocks.length) return '';
        const parts = [];
        blocks.forEach((block, index) => {
            if (shouldSkipBlock(block, index)) return;
            const html = buildBlockHtml(block);
            if (html) {
                parts.push(html);
            } else {
                const text = normalizeText(block?.attributes?.content || block?.attributes?.value || '');
                if (text) {
                    parts.push(`<p>${escapeHtml(text)}</p>`);
                }
            }
            if (Array.isArray(block.innerBlocks) && block.innerBlocks.length) {
                block.innerBlocks.forEach((inner) => {
                    const innerHtml = buildBlockHtml(inner);
                    if (innerHtml) {
                        parts.push(innerHtml);
                    } else {
                        const innerText = normalizeText(inner?.attributes?.content || inner?.attributes?.value || '');
                        if (innerText) {
                            parts.push(`<p>${escapeHtml(innerText)}</p>`);
                        }
                    }
                });
            }
        });
        return parts.join('\n');
    }

    function escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function buildBlocksKey(blocks) {
        if (!blocks || !blocks.length) return 'empty';
        const parts = [];
        blocks.forEach((block, index) => {
            parts.push(getBlockSignature(block, index));
            if (Array.isArray(block.innerBlocks) && block.innerBlocks.length) {
                block.innerBlocks.forEach((inner, innerIndex) => {
                    parts.push(getBlockSignature(inner, `${index}-${innerIndex}`));
                });
            }
        });
        return parts.join('|');
    }

    function getBlockSignature(block, index) {
        const attrs = block && block.attributes ? block.attributes : {};
        const textValues = [
            attrs.content,
            attrs.value,
            attrs.values,
            attrs.caption,
            attrs.alt
        ].filter((v) => typeof v === 'string').join('|');
        return `${index}:${block?.name || 'block'}:${block?.clientId || ''}:${textValues.length}`;
    }

    function htmlToText(html) {
        if (!html) return '';
        const tmp = state.contextDoc ? state.contextDoc.createElement('div') : document.createElement('div');
        tmp.innerHTML = html;
        const text = tmp.textContent || tmp.innerText || '';
        return normalizeText(text);
    }

    function injectStyles(doc) {
        if (!doc) return;
        if (doc.getElementById('aivi-overlay-style')) return;
        const style = doc.createElement('style');
        style.id = 'aivi-overlay-style';
        style.type = 'text/css';
        style.textContent = `
            .aivi-overlay-root{position:fixed;inset:0;pointer-events:none;z-index:999999;}
            .aivi-overlay-root[data-open="true"]{pointer-events:auto;}
            .aivi-overlay-backdrop{
                position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:14px;box-sizing:border-box;
                background:rgba(15,23,42,.32);
            }
            .aivi-overlay-root[data-open="true"] .aivi-overlay-backdrop{display:flex;}
            .aivi-overlay-panel{
                background:#fff;border-radius:24px;box-shadow:0 18px 44px rgba(23,26,33,.16);width:min(1600px,calc(100vw - 20px));max-height:calc(100vh - 28px);
                overflow:hidden;border:1px solid rgba(23,26,33,.08);
            }
            .aivi-overlay-content{
                height:100%;min-height:0;padding:16px;overflow:hidden;
                font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;color:#171a21;
                background:linear-gradient(180deg,rgba(37,99,235,.05),transparent 24%), #f5f6f8;
            }
            .aivi-overlay-shell{
                display:grid;grid-template-columns:minmax(320px,360px) minmax(0,1fr);gap:14px;align-items:stretch;height:100%;min-height:0;
            }
            .aivi-overlay-review-rail{
                padding:14px;border:1px solid rgba(23,26,33,.08);border-radius:24px;background:#fff;
                box-shadow:0 18px 44px rgba(23,26,33,.10);display:flex;flex-direction:column;gap:14px;height:100%;min-height:0;overflow:hidden;
            }
            .aivi-overlay-rail-head{display:flex;flex-direction:column;gap:10px;}
            .aivi-overlay-review-rail-title{
                font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#69707d;
            }
            .aivi-overlay-rail-actions{display:flex;gap:8px;flex-wrap:wrap;}
            .aivi-overlay-rail-note{font-size:11px;line-height:1.5;color:#69707d;}
            .aivi-overlay-rail-btn{
                border:1px solid #dee3ea;background:#fff;color:#171a21;padding:9px 12px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.2;cursor:pointer;
                font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;
            }
            .aivi-overlay-rail-btn:hover{background:#f5f8fd;}
            .aivi-overlay-rail-btn.primary{background:#171a21;border-color:#171a21;color:#fff;}
            .aivi-overlay-rail-btn.primary:hover{background:#222835;border-color:#222835;}
            .aivi-overlay-rail-btn.subtle{color:#69707d;}
            .aivi-overlay-rail-banner,.aivi-overlay-rail-status{border-radius:14px;padding:11px 12px;font-size:12px;line-height:1.5;}
            .aivi-overlay-rail-banner{border:1px solid #f3dfad;background:#fff9ea;color:#92400e;}
            .aivi-overlay-rail-banner.is-error{border-color:#f4c5bf;background:#fff1ef;color:#991b1b;}
            .aivi-overlay-rail-status{border:1px solid #dee3ea;background:#fbfbfc;color:#4b5563;}
            .aivi-overlay-review-summary,.aivi-overlay-review-empty,.aivi-overlay-review-preview-item{
                border:1px solid #dee3ea;border-radius:14px;background:#fff;
            }
            .aivi-overlay-review-summary,.aivi-overlay-review-empty{padding:14px;}
            .aivi-overlay-review-count{font-size:15px;font-weight:700;color:#13233d;}
            .aivi-overlay-review-preview-list{display:flex;flex-direction:column;gap:10px;}
            .aivi-overlay-review-viewport{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;padding:0 10px 18px 0;margin-right:-4px;scrollbar-width:thin;scrollbar-color:#b9c2d0 transparent;scroll-padding-bottom:18px;}
            .aivi-overlay-review-list{display:flex;flex-direction:column;gap:12px;padding-bottom:6px;}
            .aivi-overlay-review-viewport::-webkit-scrollbar,.aivi-overlay-stage::-webkit-scrollbar{width:10px;}
            .aivi-overlay-review-viewport::-webkit-scrollbar-thumb,.aivi-overlay-stage::-webkit-scrollbar-thumb{background:#b9c2d0;border-radius:999px;border:2px solid transparent;background-clip:padding-box;}
            .aivi-overlay-review-viewport::-webkit-scrollbar-track,.aivi-overlay-stage::-webkit-scrollbar-track{background:transparent;}
            .aivi-overlay-review-scroll-controls{display:flex;justify-content:flex-end;gap:8px;padding:2px 4px 0 0;}
            .aivi-overlay-review-scroll-btn{width:34px;height:34px;border:1px solid #dee3ea;border-radius:999px;background:#fff;color:#171a21;font-size:15px;font-weight:800;line-height:1;cursor:pointer;box-shadow:0 8px 18px rgba(23,26,33,.08);}
            .aivi-overlay-review-scroll-btn:hover{background:#f5f8fd;}
            .aivi-overlay-review-scroll-btn[disabled]{opacity:.4;cursor:default;box-shadow:none;}
            .aivi-overlay-review-preview-item,.aivi-overlay-review-item{padding:12px 14px;border:1px solid #dee3ea;border-radius:18px;background:#fbfbfc;}
            .aivi-overlay-review-item[data-verdict="fail"]{border-color:#f0c6c6;box-shadow:inset 3px 0 0 #d14343;}
            .aivi-overlay-review-item[data-verdict="partial"]{border-color:#efd6a4;box-shadow:inset 3px 0 0 #b56a07;}
            .aivi-overlay-review-preview-name,.aivi-overlay-review-item-name{font-size:14px;font-weight:700;line-height:1.35;color:#171a21;flex:1 1 auto;min-width:0;}
            .aivi-overlay-review-item-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
            .aivi-overlay-review-impact-pill{display:inline-flex;align-items:center;justify-content:center;padding:4px 9px;border-radius:999px;border:1px solid #dee3ea;background:#fff;color:#4b5563;font-size:11px;font-weight:700;line-height:1.1;white-space:nowrap;flex:0 0 auto;}
            .aivi-overlay-review-impact-pill[data-tier="high"]{background:#fff1ef;border-color:#f3c2c7;color:#7c2532;}
            .aivi-overlay-review-impact-pill[data-tier="recommended"]{background:#fff6dd;border-color:#e2b86a;color:#8a4b00;}
            .aivi-overlay-review-impact-pill[data-tier="polish"]{background:#edfdf3;border-color:#bde7c9;color:#0f6b49;}
            .aivi-overlay-review-item-summary{margin-top:8px;font-size:13px;line-height:1.6;color:#69707d;}
            .aivi-overlay-review-item-actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;}
            .aivi-overlay-review-btn{
                border:1px solid #dee3ea;background:#fff;color:#171a21;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.2;cursor:pointer;
                font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;
            }
            .aivi-overlay-review-btn:hover{background:#f5f8fd;}
            .aivi-overlay-review-btn[disabled]{opacity:.5;cursor:not-allowed;}
                .aivi-overlay-review-details{margin-top:12px;display:flex;flex-direction:column;gap:10px;}
                .aivi-overlay-review-details[hidden]{display:none !important;}
                .aivi-overlay-review-schema-assist{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid #d9e3f1;border-radius:14px;background:#ffffff;}
                .aivi-overlay-review-schema-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
                .aivi-overlay-review-schema-title-wrap{display:flex;flex-direction:column;gap:4px;min-width:0;}
                .aivi-overlay-review-schema-title{font-size:13px;font-weight:800;line-height:1.35;color:#153670;}
                .aivi-overlay-review-schema-badge{border-radius:999px;padding:6px 10px;background:#f5f8fd;border:1px solid #cfdbef;color:#153670;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
                .aivi-overlay-review-schema-badge[data-mode="copy_only"]{background:#fff7ea;border-color:#efd6a4;color:#8a4b00;}
                .aivi-overlay-review-schema-badge[data-mode="unavailable"]{background:#f3f4f6;border-color:#dee3ea;color:#556070;}
                .aivi-overlay-review-schema-note{font-size:12px;line-height:1.6;color:#4b607d;}
                .aivi-overlay-review-schema-policy{font-size:11px;line-height:1.6;color:#51647d;border:1px solid #e0e7f2;border-radius:12px;background:#f8fbff;padding:8px 10px;}
                .aivi-overlay-review-schema-actions{display:flex;gap:8px;flex-wrap:wrap;}
                .aivi-overlay-review-schema-preview{width:100%;min-height:148px;font-size:11px;font-family:"IBM Plex Mono","SFMono-Regular",Consolas,monospace;padding:10px;border-radius:12px;border:1px solid #cfdbef;background:#fbfdff;color:#15233a;resize:vertical;}
                .aivi-overlay-review-schema-status{font-size:11px;line-height:1.5;color:#4b607d;}
                .aivi-overlay-review-schema-status:not(:empty){border:1px solid #dee3ea;border-radius:12px;background:#fbfbfc;padding:8px 10px;}
                .aivi-overlay-review-schema-status[data-state="ready"]{border-color:#cfdbef;background:#f6faff;color:#153670;}
                .aivi-overlay-review-schema-status[data-state="success"]{border-color:#c7ead7;background:#f1fbf5;color:#0f6b49;}
                .aivi-overlay-review-schema-status[data-state="blocked"]{border-color:#efd6a4;background:#fff8ea;color:#8a4b00;}
                .aivi-overlay-review-schema-status[data-state="error"]{border-color:#f0c6c6;background:#fff2f2;color:#9d2b2b;}
                .aivi-overlay-review-metadata{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid #d9e3f1;border-radius:14px;background:#ffffff;}
                .aivi-overlay-review-metadata-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
                .aivi-overlay-review-metadata-title{font-size:13px;font-weight:800;line-height:1.35;color:#153670;}
                .aivi-overlay-review-metadata-badge{border-radius:999px;padding:6px 10px;background:#f5f8fd;border:1px solid #cfdbef;color:#153670;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
                .aivi-overlay-review-metadata-note,.aivi-overlay-review-metadata-status{font-size:12px;line-height:1.6;color:#4b607d;}
                .aivi-overlay-review-metadata-form{display:flex;flex-direction:column;gap:10px;}
                .aivi-overlay-review-metadata-field{display:flex;flex-direction:column;gap:5px;}
                .aivi-overlay-review-metadata-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5b6980;}
                .aivi-overlay-review-metadata-input{width:100%;border:1px solid #cfdbef;border-radius:12px;background:#fbfdff;color:#15233a;padding:10px 12px;font-size:13px;line-height:1.5;box-sizing:border-box;font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;}
                .aivi-overlay-review-metadata-input:focus{outline:none;border-color:#9fb7df;box-shadow:0 0 0 3px rgba(37,99,235,.12);}
                .aivi-overlay-review-metadata-input.is-description{resize:vertical;min-height:96px;}
                .aivi-overlay-review-metadata-actions{display:flex;gap:8px;flex-wrap:wrap;}
                .aivi-overlay-review-item-snippet{
                    font-size:12px;line-height:1.55;color:#69707d;border:1px solid #dee3ea;border-radius:12px;background:#fff;padding:10px 11px;
                }
            .aivi-overlay-review-empty{font-size:13px;line-height:1.55;color:#5e6f86;}
            .aivi-overlay-stage{min-width:0;min-height:0;display:flex;flex-direction:column;gap:18px;padding:4px 6px 8px 18px;border-left:1px solid #dee3ea;overflow:auto;scrollbar-width:thin;scrollbar-color:#b9c2d0 transparent;}
            .aivi-overlay-doc-header{width:min(100%,940px);margin:0 auto;padding:10px 0 0;}
            .aivi-overlay-doc-title{
                margin:0;font-size:clamp(38px,4.2vw,60px);font-weight:700;line-height:1.04;color:#171a21;letter-spacing:-.03em;
                font-family:"Newsreader",Georgia,serif;
            }
            .aivi-overlay-canvas{display:flex;flex-direction:column;gap:8px;width:min(100%,940px);margin:0 auto;padding:0 0 12px;min-width:0;}
            .aivi-overlay-canvas h1,.aivi-overlay-canvas h2,.aivi-overlay-canvas h3{
                font-family:"Newsreader",Georgia,serif;
                color:#171a21;line-height:1.12;
            }
            .aivi-overlay-canvas p,.aivi-overlay-canvas li{font-size:20px;line-height:1.72;color:#2a303b;}
            .aivi-overlay-block{
                border:0;border-radius:0;padding:0 28px 0 20px;background:transparent;
                box-shadow:none;transition:background .16s ease;position:relative;margin:0 0 18px;
            }
            .aivi-overlay-block[data-editability="readonly"]{padding-right:96px;}
            .aivi-overlay-block::before{
                content:"";position:absolute;left:0;top:10px;width:6px;height:calc(100% - 18px);border-radius:999px;background:#2563eb;opacity:0;transition:opacity .18s ease;
            }
            .aivi-overlay-block-nested{margin-left:10px;}
            .aivi-overlay-block-body{
                font-size:18px;line-height:1.72;color:#1b2940;padding:0;border-radius:0;border:1px solid transparent;
                background:transparent;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;outline:none;
            }
            .aivi-overlay-block-body[data-editability="readonly"]{border-color:rgba(23,26,33,.06);}
            .aivi-overlay-block-state{
                position:absolute;top:8px;right:42px;display:inline-flex;align-items:center;justify-content:center;
                padding:4px 9px;border-radius:999px;border:1px solid rgba(23,26,33,.08);background:rgba(255,255,255,.95);
                color:#5e6f86;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;z-index:2;
            }
            .aivi-overlay-block-handle{
                position:absolute;top:6px;right:8px;width:28px;height:28px;border:1px solid #d4deef;border-radius:999px;background:rgba(255,255,255,.96);
                box-shadow:0 8px 18px rgba(15,23,42,.08);display:inline-flex;align-items:center;justify-content:center;gap:2px;opacity:0;pointer-events:none;
                transition:opacity .14s ease,transform .14s ease,background .14s ease;transform:translateY(2px);z-index:3;
            }
            .aivi-overlay-block:hover .aivi-overlay-block-handle,.aivi-overlay-block:focus-within .aivi-overlay-block-handle,.aivi-overlay-block-editing .aivi-overlay-block-handle{
                opacity:1;pointer-events:auto;transform:translateY(0);
            }
            .aivi-overlay-block:hover::before,.aivi-overlay-block:focus-within::before,.aivi-overlay-block-editing::before{opacity:1;}
            .aivi-overlay-block-handle span{width:4px;height:4px;border-radius:999px;background:#5e6f86;display:inline-block;}
            .aivi-overlay-block-handle:hover{background:#f6f9ff;}
            .aivi-overlay-block-menu{
                position:fixed;width:288px;max-width:calc(100vw - 28px);padding:8px;border:1px solid #d7deea;border-radius:16px;background:rgba(255,255,255,.99);
                box-shadow:0 24px 48px rgba(15,23,42,.18);display:flex;flex-direction:column;gap:6px;overflow:auto;z-index:1000001;
            }
            .aivi-overlay-block-menu-header{padding:8px 10px 10px;border-bottom:1px solid rgba(23,26,33,.08);margin-bottom:2px;}
            .aivi-overlay-block-menu-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#69707d;font-weight:800;}
            .aivi-overlay-block-menu-title{display:block;margin-top:4px;font-size:15px;font-weight:800;color:#171a21;letter-spacing:-.02em;}
            .aivi-overlay-block-menu-section{display:flex;flex-direction:column;gap:6px;}
            .aivi-overlay-block-menu-toggle{border-radius:14px;}
            .aivi-overlay-block-menu-section.open .aivi-overlay-block-menu-toggle{background:#f5f8fd;}
            .aivi-overlay-block-menu-btn{
                width:100%;border:0;background:transparent;color:#20252e;padding:11px 12px;border-radius:12px;font-size:14px;font-weight:600;line-height:1.2;cursor:pointer;transition:all .16s ease;
                display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;
            }
            .aivi-overlay-block-menu-btn:hover{background:#f5f8fd;}
            .aivi-overlay-block-menu-item-body{display:flex;flex-direction:column;gap:3px;}
            .aivi-overlay-block-menu-item-label{font-weight:800;font-size:14px;color:#171a21;}
            .aivi-overlay-block-menu-item-copy{color:#69707d;font-size:12px;line-height:1.45;}
            .aivi-overlay-block-menu-chevron{color:#6b7280;font-size:14px;transition:transform .16s ease;}
            .aivi-overlay-block-menu-section.open .aivi-overlay-block-menu-chevron{transform:rotate(90deg);}
            .aivi-overlay-block-menu-submenu{display:none;grid-template-columns:1fr 1fr;gap:8px;padding:0 2px 6px;}
            .aivi-overlay-block-menu-section.open .aivi-overlay-block-menu-submenu{display:grid;}
            .aivi-overlay-block-menu-action{border:1px solid rgba(23,26,33,.08);border-radius:12px;background:#fbfbfc;color:#171a21;padding:10px 11px;font-size:12px;font-weight:700;line-height:1.35;text-align:left;min-height:56px;cursor:pointer;}
            .aivi-overlay-block-menu-action:hover{background:#eef4ff;border-color:#cfe0ff;}
            .aivi-overlay-block-menu-action.wide{grid-column:1 / -1;min-height:0;}
            .aivi-overlay-block-body img{max-width:100%;border-radius:10px;display:block;margin-bottom:10px;}
            .aivi-overlay-block-body figure{margin:0 0 12px;}
            .aivi-overlay-block-body figcaption{font-size:12px;color:#5e6f86;}
            .aivi-overlay-block-body table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:16px;line-height:1.55;background:#fff;}
            .aivi-overlay-block-body th,.aivi-overlay-block-body td{border:1px solid #d9e3f1;padding:10px 12px;vertical-align:top;}
            .aivi-overlay-block-body th{background:#f6f9ff;color:#13233d;font-weight:800;}
            .aivi-overlay-block-body iframe,.aivi-overlay-block-body video{width:100%;max-width:100%;border:0;border-radius:12px;display:block;background:#0f172a;margin:4px 0 12px;}
            .aivi-overlay-block-body audio{width:100%;display:block;margin:4px 0 12px;}
            .aivi-overlay-button-group,.aivi-overlay-button-row{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 12px;}
            .aivi-overlay-button-fallback{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border-radius:999px;background:#171a21;color:#fff;text-decoration:none;font-size:13px;font-weight:800;line-height:1.2;}
            .aivi-overlay-file-fallback{margin:6px 0 12px;}
            .aivi-overlay-file-fallback a,.aivi-overlay-embed-fallback a{color:#1d4ed8;font-weight:700;word-break:break-word;}
            .aivi-overlay-gallery-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:6px 0 12px;}
            .aivi-overlay-gallery-grid figure{margin:0;}
            .aivi-overlay-separator{border:0;border-top:1px solid #d9e3f1;margin:10px 0 16px;}
            .aivi-overlay-spacer{width:100%;display:block;}
            .aivi-overlay-verse{white-space:pre-wrap;}
            .aivi-overlay-block-editing{
                background:transparent;
            }
            .aivi-overlay-block-editing .aivi-overlay-block-body{
                border-color:transparent;background:transparent;box-shadow:none;
            }
            .aivi-overlay-inline-panel{
                display:flex;flex-direction:column;gap:10px;margin-top:10px;padding:12px;
                border:1px solid #d9e3f1;border-radius:12px;background:#ffffff;
                box-shadow:0 4px 10px rgba(15,23,42,.05);
            }
            .aivi-overlay-highlight{
                cursor:pointer;border-radius:4px;padding:0 1px;
                text-decoration-line:underline;text-decoration-thickness:2px;text-underline-offset:3px;text-decoration-skip-ink:none;
                transition:background-color .18s ease,text-decoration-color .18s ease,box-shadow .18s ease;
            }
            .aivi-overlay-highlight:hover{background:rgba(21,35,58,.08);}
            .aivi-overlay-highlight[data-severity="fail"],.aivi-overlay-highlight-fail{
                text-decoration-style:solid;text-decoration-color:#d14343;background:rgba(209,67,67,.10);
            }
            .aivi-overlay-highlight[data-severity="partial"],.aivi-overlay-highlight-partial{
                text-decoration-style:dashed;text-decoration-color:#b56a07;background:rgba(181,106,7,.11);
            }
            .aivi-overlay-highlight[data-severity="pass"],.aivi-overlay-highlight-pass{
                text-decoration-style:solid;text-decoration-color:#0f8b5f;background:rgba(15,139,95,.08);
            }
            .aivi-overlay-highlight-ai{font-weight:600;}
            .aivi-overlay-highlight.v2-rect{text-decoration:none;padding:0;border-radius:8px;box-shadow:none;}
            .aivi-overlay-empty{
                padding:24px;text-align:center;font-size:14px;color:#5e6f86;border:1px dashed #ccd7eb;border-radius:12px;background:#fff;
            }
            .aivi-overlay-unhighlightable{
                border:1px solid #cfdcf0;border-radius:14px;padding:14px;background:linear-gradient(180deg,#fbfdff 0%,#f4f8ff 100%);
                display:flex;flex-direction:column;gap:12px;margin-top:12px;
            }
            .aivi-overlay-recommendations-title{
                font-size:19px;font-weight:700;color:#13233d;
                font-family:"Newsreader","Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,serif;
            }
            .aivi-overlay-recommendations-subtitle{font-size:12px;color:#5e6f86;font-weight:600;}
            .aivi-overlay-recommendation-item{
                display:flex;flex-direction:column;gap:8px;padding:12px;background:#fff;border:1px solid #d4deef;border-radius:12px;
            }
            .aivi-overlay-recommendation-check{
                font-size:18px;font-weight:700;color:#14253f;line-height:1.2;
                font-family:"Newsreader","Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,serif;
            }
            .aivi-overlay-recommendation-rationale{font-size:14px;color:#1d2c43;}
            .aivi-overlay-recommendation-snippet{
                font-size:13px;color:#4b607d;background:#fbfdff;border-radius:10px;padding:9px 10px;border:1px solid #e2e8f3;line-height:1.5;
            }
            .aivi-overlay-recommendation-action{font-size:13px;color:#1d4ed8;}
            .aivi-overlay-recommendation-reason{font-size:11px;color:#5e6f86;}
            .aivi-overlay-recommendation-actions{display:flex;gap:8px;align-items:center;}
            .aivi-overlay-recommendation-btn{
                border:1px solid #c7d7ef;background:#fff;color:#13346f;padding:6px 11px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;
                font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;
            }
            .aivi-overlay-recommendation-btn:hover{background:#f6f9ff;}
            .aivi-overlay-recommendation-btn[disabled]{cursor:not-allowed;opacity:.55;}
            .aivi-overlay-guidance{
                display:flex;flex-direction:column;gap:8px;padding:11px;border:1px solid #cfdbef;border-radius:11px;background:#f8fbff;
            }
            .aivi-overlay-guidance-inline{border-color:#d7dfec;background:#f8fafd;}
            .aivi-overlay-guidance-recommendation{border-color:#cfdbef;background:#f6faff;}
            .aivi-overlay-guidance-section{display:flex;flex-direction:column;gap:4px;}
            .aivi-overlay-guidance-label{font-size:11px;font-weight:700;color:#1f4f9c;text-transform:uppercase;letter-spacing:.04em;}
            .aivi-overlay-guidance-text{font-size:14px;color:#172740;line-height:1.6;}
            .aivi-overlay-guidance-steps{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:13px;color:#172740;line-height:1.55;}
            .aivi-overlay-confirm-backdrop{
                position:absolute;inset:0;background:rgba(15,23,42,.34);display:flex;align-items:center;justify-content:center;
                padding:16px;box-sizing:border-box;z-index:1000001;
            }
            .aivi-overlay-confirm-dialog{
                width:min(560px,100%);background:#fff;border:1px solid #d4deef;border-radius:14px;padding:16px;
                display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 44px rgba(15,23,42,.24);
                font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;
            }
            .aivi-overlay-confirm-title{font-size:17px;font-weight:800;color:#0f172a;}
            .aivi-overlay-confirm-message{font-size:14px;line-height:1.6;color:#1f3048;}
            .aivi-overlay-confirm-actions{display:flex;gap:8px;justify-content:flex-end;}
            .aivi-overlay-confirm-btn{
                border:1px solid #c8d6ee;background:#fff;color:#13346f;padding:8px 12px;border-radius:10px;
                font-size:12px;font-weight:700;cursor:pointer;
                font-family:"Manrope","Segoe UI",-apple-system,system-ui,sans-serif;
            }
            .aivi-overlay-confirm-btn.primary{border-color:#1e3a8a;background:#1e3a8a;color:#fff;}
            .aivi-overlay-confirm-btn.primary:hover{background:#172b63;}
            .aivi-overlay-confirm-btn.secondary:hover{background:#f6f9ff;}
            @keyframes aiviOverlayJumpPulse{
                0%{box-shadow:0 0 0 0 rgba(34,113,177,.34);}
                70%{box-shadow:0 0 0 14px rgba(34,113,177,0);}
                100%{box-shadow:0 0 0 0 rgba(34,113,177,0);}
            }
            @keyframes aiviEditorApplyPulse{
                0%{box-shadow:0 0 0 0 rgba(34,113,177,.24);}
                50%{box-shadow:0 0 0 10px rgba(34,113,177,.10);}
                100%{box-shadow:0 0 0 0 rgba(34,113,177,0);}
            }
            .aivi-overlay-block-jump-focus{
                position:relative;border-radius:12px;background:linear-gradient(180deg,rgba(222,235,255,.66) 0%,rgba(222,235,255,.20) 100%);
                box-shadow:inset 0 0 0 2px rgba(34,113,177,.62),0 10px 24px rgba(16,42,87,.16);transition:box-shadow .25s ease,background .25s ease;
            }
            .aivi-overlay-block-jump-focus .aivi-overlay-block-body{
                padding:6px 8px;margin:-6px -8px;border-radius:10px;background:rgba(255,255,255,.62);
            }
            .aivi-overlay-block-jump-flash{animation:aiviOverlayJumpPulse 1.2s ease-out 1;}
            .aivi-overlay-block-focus{outline:2px solid #2271b1;outline-offset:2px;border-radius:10px;}
            .aivi-editor-apply-flash{
                position:relative;border-radius:12px;
                box-shadow:0 0 0 2px rgba(34,113,177,.58),0 14px 34px rgba(34,113,177,.14);
                animation:aiviEditorApplyPulse 1.8s ease-out 1;
            }
            @media (max-width: 980px){
                .aivi-overlay-panel{width:calc(100vw - 12px);max-height:calc(100vh - 12px);}
                .aivi-overlay-content{padding:10px;}
                .aivi-overlay-shell{grid-template-columns:1fr;height:auto;}
                .aivi-overlay-review-rail{height:auto;max-height:none;overflow:visible;}
                .aivi-overlay-review-viewport{max-height:40vh;}
                .aivi-overlay-stage{padding-left:0;border-left:0;overflow:visible;}
            }
        `;
        doc.head.appendChild(style);
    }

    window.addEventListener('aivi:overlay_open', (event) => {
        openOverlay(event.detail || {});
    });

    window.addEventListener('aivi:overlay_close', () => {
        closeOverlay();
    });

    window.addEventListener('aivi:run_stale', () => {
        if (!isAutoStaleDetectionEnabled()) {
            return;
        }
        if (state.isStale) {
            return;
        }
        state.isStale = true;
        if (state.open) {
            hideInlinePanel();
            renderReviewRail(collectOverlayRecommendations(state.overlayContentData));
            setMetaStatus('Analysis results stale — please re-run analysis');
        }
    });
})(window.wp || {});
