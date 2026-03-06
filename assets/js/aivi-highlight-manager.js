/**
 * AiVI Highlight Manager
 *
 * Central single-highlight manager implementing:
 * - Deterministic anchor resolution (node_ref primary, snippet exact match fallback)
 * - Single active highlight lifecycle
 * - Stale-run invalidation
 * - Telemetry logging (PII-safe)
 *
 * @version 1.3.0
 */
(function (window) {
    'use strict';

    // ============================================
    // SEMANTIC STYLE TOKENS (Verdict â†’ Style mapping)
    // ============================================
    const HIGHLIGHT_STYLES = {
        'highlight-severity-critical': {
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124, 58, 237, 0.1)',
            outlineColor: '#7c3aed',
            label: 'Critical issue highlight'
        },
        'highlight-severity-warning': {
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            outlineColor: '#2563eb',
            label: 'Warning issue highlight'
        },
        'highlight-severity-success': {
            borderColor: '#059669',
            backgroundColor: 'rgba(5, 150, 105, 0.1)',
            outlineColor: '#059669',
            label: 'Success highlight'
        }
    };

    // Verdict to semantic style mapping
    const VERDICT_STYLE_MAP = {
        'fail': 'highlight-severity-critical',
        'partial': 'highlight-severity-warning',
        'pass': 'highlight-severity-success'
    };

    // ============================================
    // STATE
    // ============================================
    let activeHighlight = null;
    let isRunStale = false;
    let currentRunId = null;
    let contentChangeListener = null;
    let contentChangeTarget = null;
    let tooltipElement = null;
    let tooltipTimer = null;
    let tooltipDocument = null;
    let tooltipWindow = null;
    let bulkSpans = [];
    let bulkHighlightIndex = new Map();
    // Re-attach system state
    let lastSummary = null;  // Store last summary for re-applying highlights
    let highlightObserver = null;  // MutationObserver for detecting DOM changes
    let reattachDebounce = null;  // Debounce timer for re-attach
    const highlightConfig = (typeof window !== 'undefined' && window.AIVI_CONFIG) ? window.AIVI_CONFIG : {};
    const highlightPriority = Array.isArray(highlightConfig.aiHighlightSourcePriority)
        ? highlightConfig.aiHighlightSourcePriority
        : [];
    const highlightMode = highlightPriority.length > 0 && !highlightPriority.includes('analyzer') ? 'passive' : 'active';
    const highlightFeatureFlags = (highlightConfig && typeof highlightConfig.featureFlags === 'object') ? highlightConfig.featureFlags : {};
    const stalePolicy = typeof highlightConfig.stalePolicy === 'string'
        ? highlightConfig.stalePolicy.toLowerCase()
        : 'manual_refresh';
    const autoStaleDetectionEnabled = (typeof highlightConfig.autoStaleDetection === 'boolean')
        ? (stalePolicy === 'auto' ? highlightConfig.autoStaleDetection : false)
        : ((typeof highlightFeatureFlags.AUTO_STALE_DETECTION === 'boolean')
            ? (stalePolicy === 'auto' ? highlightFeatureFlags.AUTO_STALE_DETECTION : false)
            : false);

    // ============================================
    // TELEMETRY (PII-safe logging)
    // ============================================
    const Telemetry = {
        log: function (event, data) {
            const safeData = { ...data };
            delete safeData.snippet;
            delete safeData.content;

            const payload = {
                level: 'INFO',
                event: event,
                ...safeData,
                timestamp: new Date().toISOString()
            };

            if (window && typeof window.AIVI_TELEMETRY_EMIT === 'function') {
                window.AIVI_TELEMETRY_EMIT(payload);
                return;
            }

            if (window && window.AIVI_DEBUG) {
                if (!window.AIVI_DEBUG_LOGS) window.AIVI_DEBUG_LOGS = [];
                window.AIVI_DEBUG_LOGS.push(payload);
            }
        },

        /**
         * Log navigation attempt with full context
         * @param {Object} params - { run_id, check_id, instance_index, node_ref, resolution_method, success, duration_ms }
         */
        navigationAttempt: function (params) {
            this.log('navigation_attempt', {
                run_id: params.run_id,
                check_id: params.check_id,
                instance_index: params.instance_index,
                node_ref: params.node_ref || null,
                resolution_method: params.resolution_method,
                success: params.success,
                duration_ms: params.duration_ms
            });
        },

        highlightShown: function (runId, checkId, instanceIndex, nodeRefPresent, resolutionMethod) {
            this.log('highlight_shown', {
                run_id: runId,
                check_id: checkId,
                instance_index: instanceIndex,
                node_ref_present: nodeRefPresent,
                resolution_method: resolutionMethod
            });
        },

        highlightCleared: function (runId, checkId) {
            this.log('highlight_cleared', {
                run_id: runId,
                check_id: checkId
            });
        },

        anchorResolutionFailed: function (runId, checkId, instanceIndex, reason, nodeRef) {
            this.log('anchor_resolution_failed', {
                run_id: runId,
                check_id: checkId,
                instance_index: instanceIndex,
                reason: reason,
                node_ref: nodeRef || null
            });
        }
    };

    const DebugLog = {
        emit: function (event, data) {
            if (window && window.AIVI_DEBUG) {
                if (!window.AIVI_DEBUG_LOGS) window.AIVI_DEBUG_LOGS = [];
                window.AIVI_DEBUG_LOGS.push({
                    level: 'DEBUG',
                    event: event,
                    ...data,
                    timestamp: new Date().toISOString()
                });
            }
        }
    };

    // ============================================
    // ANCHOR RESOLUTION (Deterministic, no fuzzy search)
    // Cross-editor support for Gutenberg and Classic
    // ============================================

    /**
     * Top-level HTML tags treated as blocks in Classic editor.
     * MUST match server-side CLASSIC_BLOCK_TAGS exactly.
     */
    const CLASSIC_BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'table', 'blockquote', 'div'];

    const describeElement = function (element) {
        if (!element) return null;
        const tag = (element.tagName || 'unknown').toLowerCase();
        const dataBlock = element.getAttribute ? element.getAttribute('data-block') : null;
        const id = element.id || null;
        const parts = [tag];
        if (dataBlock) parts.push(`data-block=${dataBlock}`);
        if (id) parts.push(`id=${id}`);
        return parts.join(' ');
    };

    const AnchorResolver = {
        /**
         * Cache for computed block map
         */
        _signatureMap: null,
        _signatureMapHash: null,
        _classicOverlayContainer: null,
        _classicOverlayContent: null,
        _classicOverlayHash: null,
        _classicOverlayTextarea: null,
        _classicOverlayScrollHandler: null,

        /**
         * Build map of block signatures to DOM elements
         * Must be called before resolution
         */
        buildSignatureMap: async function () {
            // Check cache validity
            const currentHash = this.getEditorContentHash();
            if (this._signatureMap && this._signatureMapHash === currentHash) {
                return;
            }

            const blocks = this.getEditorBlocks();
            const map = new Map();

            // Process all blocks
            // Note: Parallel processing for speed
            await Promise.all(blocks.map(async (block) => {
                const text = this.getBlockText(block.element);
                if (!text) return;

                const signature = await this.computeSignature(text);

                // Store in map
                // Note: First block with signature wins (collision handling strategy: first-wins)
                if (!map.has(signature)) {
                    map.set(signature, block.element);
                }
            }));

            this._signatureMap = map;
            this._signatureMapHash = currentHash;
        },
        getEditorFrameContext: function () {
            const iframe = document.querySelector('iframe[name="editor-canvas"]') ||
                document.querySelector('.editor-canvas__iframe');
            if (iframe && iframe.contentDocument) {
                const doc = iframe.contentDocument;
                const root = doc.querySelector('.block-editor-writing-flow') || doc.body;
                const win = doc.defaultView || window;
                return { doc, root, win };
            }
            // Non-iframe mode: find editor area in main document
            // This happens when plugins use API version 2 (e.g. Essential Blocks)
            // Try multiple selectors in order of specificity
            const selectors = [
                '.block-editor-writing-flow',
                '.editor-styles-wrapper',
                '.is-root-container',
                '[data-type="core/paragraph"]',  // Any Gutenberg block
                '.block-editor-block-list__layout',
                '.edit-post-visual-editor'
            ];
            let mainRoot = null;
            for (const sel of selectors) {
                mainRoot = document.querySelector(sel);
                if (mainRoot) {
                    break;
                }
            }
            if (!mainRoot) {
                mainRoot = document.body;
            }
            return { doc: document, root: mainRoot, win: window };
        },
        getEditorDocument: function () {
            return this.getEditorFrameContext().doc || document;
        },
        getEditorRoot: function () {
            return this.getEditorFrameContext().root || document.body;
        },
        getEditorWindows: function () {
            const ctx = this.getEditorFrameContext();
            return ctx.win || window;
        },
        getEditorDocuments: function () {
            const docs = [document];
            const ctx = this.getEditorFrameContext();
            if (ctx.doc && ctx.doc !== document) {
                docs.push(ctx.doc);
            }
            return docs;
        },
        getClassicTextarea: function () {
            const textarea = document.querySelector('#content');
            if (textarea && textarea.tagName === 'TEXTAREA') {
                return textarea;
            }
            return null;
        },
        clearClassicOverlay: function () {
            if (this._classicOverlayTextarea && this._classicOverlayScrollHandler) {
                this._classicOverlayTextarea.removeEventListener('scroll', this._classicOverlayScrollHandler);
            }
            if (this._classicOverlayContainer && this._classicOverlayContainer.parentNode) {
                this._classicOverlayContainer.parentNode.removeChild(this._classicOverlayContainer);
            }
            this._classicOverlayContainer = null;
            this._classicOverlayContent = null;
            this._classicOverlayHash = null;
            this._classicOverlayTextarea = null;
            this._classicOverlayScrollHandler = null;
        },
        ensureClassicOverlay: function (textarea) {
            if (!textarea) {
                this.clearClassicOverlay();
                return null;
            }
            const contentHash = this._simpleHash(textarea.value || '');
            if (this._classicOverlayContainer && this._classicOverlayHash === contentHash) {
                return this._classicOverlayContent;
            }
            this.clearClassicOverlay();
            const parent = textarea.parentNode;
            if (!parent) return null;
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.position === 'static') {
                parent.style.position = 'relative';
            }
            const overlay = document.createElement('div');
            overlay.className = 'aivi-classic-overlay';
            overlay.style.position = 'absolute';
            overlay.style.pointerEvents = 'none';
            overlay.style.top = `${textarea.offsetTop}px`;
            overlay.style.left = `${textarea.offsetLeft}px`;
            overlay.style.width = `${textarea.offsetWidth}px`;
            overlay.style.height = `${textarea.offsetHeight}px`;
            overlay.style.overflow = 'hidden';
            overlay.style.zIndex = '99998';
            const overlayContent = document.createElement('div');
            overlayContent.className = 'aivi-classic-overlay-content';
            overlayContent.style.position = 'absolute';
            overlayContent.style.top = '0';
            overlayContent.style.left = '0';
            overlayContent.style.width = '100%';
            overlayContent.style.minHeight = '100%';
            overlayContent.style.whiteSpace = 'pre-wrap';
            overlayContent.style.color = 'transparent';
            overlayContent.style.background = 'transparent';
            const computed = window.getComputedStyle(textarea);
            overlayContent.style.fontFamily = computed.fontFamily;
            overlayContent.style.fontSize = computed.fontSize;
            overlayContent.style.lineHeight = computed.lineHeight;
            overlayContent.style.letterSpacing = computed.letterSpacing;
            overlayContent.style.padding = computed.padding;
            overlayContent.style.textTransform = computed.textTransform;
            overlayContent.style.wordSpacing = computed.wordSpacing;
            const parser = new DOMParser();
            const doc = parser.parseFromString(textarea.value || '', 'text/html');
            doc.querySelectorAll('script,style').forEach(node => node.remove());
            const body = doc.body;
            const nodes = Array.from(body.childNodes);
            nodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.nodeValue || '';
                    if (text.trim().length > 0) {
                        const wrapper = doc.createElement('div');
                        wrapper.textContent = text;
                        body.replaceChild(wrapper, node);
                    } else {
                        body.removeChild(node);
                    }
                }
            });
            overlayContent.innerHTML = body.innerHTML;
            overlay.appendChild(overlayContent);
            parent.appendChild(overlay);
            const syncScroll = () => {
                overlayContent.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
            };
            textarea.addEventListener('scroll', syncScroll, { passive: true });
            syncScroll();
            this._classicOverlayContainer = overlay;
            this._classicOverlayContent = overlayContent;
            this._classicOverlayHash = contentHash;
            this._classicOverlayTextarea = textarea;
            this._classicOverlayScrollHandler = syncScroll;
            return overlayContent;
        },
        getClassicOverlayState: function () {
            return {
                container: this._classicOverlayContainer,
                content: this._classicOverlayContent,
                textarea: this._classicOverlayTextarea
            };
        },

        /**
         * Resolve anchor deterministically
         * 1. Node Ref
         * 2. Exact Signature
         * 3. Exact Snippet
         */
        resolve: function (highlight) {
            if (!highlight) return null;
            const trace = {
                highlight_id: highlight.highlight_id || highlight.id || null,
                node_ref: highlight.node_ref || null,
                signature: highlight.signature || null,
                snippet_length: highlight.snippet ? highlight.snippet.length : 0,
                attempts: [],
                final: null
            };
            const recordAttempt = (path, success, reason) => {
                trace.attempts.push({
                    path: path,
                    success: !!success,
                    reason: reason || null
                });
            };
            const finalize = (anchor) => {
                if (anchor && anchor.element) {
                    trace.final = describeElement(anchor.element);
                }
                DebugLog.emit('anchor_trace', trace);
                return anchor;
            };
            const resolveSentenceRange = (text, snippet) => {
                if (!text || !snippet) return null;
                const needle = String(snippet).trim().toLowerCase();
                if (!needle) return null;
                const sentenceRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
                let match;
                while ((match = sentenceRegex.exec(text)) !== null) {
                    const sentenceStart = match.index;
                    const sentenceText = match[0];
                    const trimmed = sentenceText.trim();
                    if (!trimmed) continue;
                    const leadingWhitespace = sentenceText.length - sentenceText.trimStart().length;
                    const trailingWhitespace = sentenceText.length - sentenceText.trimEnd().length;
                    const start = sentenceStart + leadingWhitespace;
                    const end = sentenceStart + sentenceText.length - trailingWhitespace;
                    if (!(end > start)) continue;
                    const sentence = text.slice(start, end).toLowerCase();
                    if (sentence.includes(needle)) {
                        return { start, end };
                    }
                }
                return null;
            };
            const resolveBoundaryRange = (text, highlightMeta) => {
                if (!text) return null;
                const boundary = highlightMeta && typeof highlightMeta.boundary === 'object'
                    ? highlightMeta.boundary
                    : null;
                const normalize = (value) => this.canonicalize(typeof value === 'string' ? value : '');
                let firstWords = normalize(boundary && boundary.first_words ? boundary.first_words : '');
                let lastWords = normalize(boundary && boundary.last_words ? boundary.last_words : '');
                if (!firstWords || !lastWords) {
                    const snippetWords = this.canonicalize(highlightMeta && highlightMeta.snippet ? highlightMeta.snippet : '')
                        .split(/\s+/)
                        .filter(Boolean);
                    if (snippetWords.length >= 6) {
                        if (!firstWords) firstWords = snippetWords.slice(0, 3).join(' ');
                        if (!lastWords) lastWords = snippetWords.slice(-3).join(' ');
                    }
                }
                if (!firstWords || !lastWords) return null;
                const lowerText = text.toLowerCase();
                const firstIdx = lowerText.indexOf(firstWords.toLowerCase());
                if (firstIdx === -1) return null;
                const lastIdx = lowerText.indexOf(lastWords.toLowerCase(), firstIdx + firstWords.length);
                if (lastIdx === -1) return null;
                const start = firstIdx;
                const end = lastIdx + lastWords.length;
                if (!(end > start)) return null;
                return { start, end };
            };
            const resolveRange = (text, highlightMeta, methodPrefix) => {
                const len = text.length;
                const start = typeof highlightMeta.start === 'number' ? highlightMeta.start : null;
                const end = typeof highlightMeta.end === 'number' ? highlightMeta.end : null;
                if (typeof start === 'number' && typeof end === 'number' && start >= 0 && end > start && end <= len) {
                    return { start, end, method: `${methodPrefix}-exact` };
                }
                if (highlightMeta.snippet) {
                    const rawIdx = text.toLowerCase().indexOf(String(highlightMeta.snippet).toLowerCase());
                    if (rawIdx !== -1) {
                        return {
                            start: rawIdx,
                            end: rawIdx + String(highlightMeta.snippet).length,
                            method: `${methodPrefix}-snippet`
                        };
                    }
                }
                if (highlightMeta.scope === 'sentence') {
                    const sentenceRange = resolveSentenceRange(text, highlightMeta.snippet || highlightMeta.text || '');
                    if (sentenceRange) {
                        return { ...sentenceRange, method: `${methodPrefix}-sentence` };
                    }
                }
                const boundaryRange = resolveBoundaryRange(text, highlightMeta);
                if (boundaryRange) {
                    return { ...boundaryRange, method: `${methodPrefix}-first-last` };
                }
                if (highlightMeta.anchor_status === 'block_only' || highlightMeta.scope === 'block') {
                    return { start: 0, end: len, method: `${methodPrefix}-block-only` };
                }
                return { start: 0, end: len, method: `${methodPrefix}-block-only` };
            };

            if (highlight.node_ref) {
                const ref = String(highlight.node_ref);
                let element = null;
                const blockIndexMatch = ref.match(/^block-(\d+)$/);
                if (blockIndexMatch) {
                    const idx = parseInt(blockIndexMatch[1], 10);
                    const blocks = this.getEditorBlocks();
                    if (idx >= 0 && idx < blocks.length) {
                        element = blocks[idx].element;
                    } else {
                        recordAttempt('node_ref', false, 'node_ref_out_of_range');
                    }
                } else {
                    if (!element) {
                        const editorDocument = this.getEditorDocument();
                        try {
                            element = editorDocument.querySelector(ref);
                        } catch (e) {
                            element = null;
                            recordAttempt('node_ref', false, 'node_ref_invalid_selector');
                        }
                    }
                    if (!element) element = this.getEditorDocument().querySelector('[data-block="' + ref + '"]');
                    if (!element) element = this.getEditorDocument().querySelector('#block-' + ref);
                    if (!element) element = this.getEditorDocument().querySelector('[id*="' + ref + '"]');
                    if (!element) element = document.querySelector('[data-block="' + ref + '"]');
                    if (!element) element = document.querySelector('#block-' + ref);
                    if (!element) element = document.querySelector('[id*="' + ref + '"]');
                    if (!element && ref === 'title') element = document.querySelector('.editor-post-title');
                }
                if (element) {
                    recordAttempt('node_ref', true, null);
                    const text = this.getBlockText(element);
                    const range = resolveRange(text, highlight, 'node_ref');
                    return finalize({ element, start: range.start, end: range.end, method: range.method });
                }
                recordAttempt('node_ref', false, 'node_ref_not_found');
            } else {
                recordAttempt('node_ref', false, 'node_ref_missing');
            }

            // 1. Exact Signature Match (Preferred)
            if (highlight.signature && this._signatureMap) {
                const element = this._signatureMap.get(highlight.signature);
                if (element) {
                    recordAttempt('signature', true, null);
                    const text = this.getBlockText(element);
                    const range = resolveRange(text, highlight, 'signature');
                    return finalize({ element: element, start: range.start, end: range.end, method: range.method });
                }
                recordAttempt('signature', false, 'signature_mismatch');
            } else if (highlight.signature && !this._signatureMap) {
                recordAttempt('signature', false, 'signature_map_unavailable');
            } else {
                recordAttempt('signature', false, 'signature_missing');
            }

            // 2. Exact Snippet Match (Fallback)
            if (highlight.snippet) {
                const snippet = this.canonicalize(highlight.snippet);
                const blocks = this.getEditorBlocks();

                for (const block of blocks) {
                    const text = this.getBlockText(block.element);
                    const normalizedText = this.canonicalize(text);
                    const idx = normalizedText.indexOf(snippet);
                    if (idx !== -1) {
                        const rawIdx = text.toLowerCase().indexOf(highlight.snippet.toLowerCase());
                        if (rawIdx !== -1) {
                            const rawEnd = rawIdx + highlight.snippet.length;
                            recordAttempt('snippet', true, null);
                            return finalize({ element: block.element, start: rawIdx, end: rawEnd, method: 'snippet-exact' });
                        }
                        recordAttempt('snippet', true, null);
                        const range = resolveRange(text, highlight, 'snippet');
                        return finalize({ element: block.element, start: range.start, end: range.end, method: range.method });
                    }
                }
                recordAttempt('snippet', false, 'snippet_not_found');
            } else {
                recordAttempt('snippet', false, 'snippet_missing');
            }

            DebugLog.emit('anchor_trace', trace);
            return null;
        },

        /**
         * Get editor blocks for both Gutenberg and Classic editors
         * Order matches server-side block extraction
         * @returns {Array} - [{ element, type }]
         */
        getEditorBlocks: function () {
            // Check cache first
            const currentHash = this.getEditorContentHash();
            if (this._blockMapCache && this._blockMapCacheHash === currentHash) {
                return this._blockMapCache;
            }

            const blocks = [];
            const isGutenberg = this.isGutenbergEditor();
            const editorDocument = this.getEditorDocument();

            if (isGutenberg) {
                // Gutenberg: use wp.data to get blocks in order
                if (window.wp && window.wp.data && window.wp.data.select) {
                    try {
                        const editorBlocks = window.wp.data.select('core/block-editor').getBlocks();
                        editorBlocks.forEach((block) => {
                            const element = editorDocument.querySelector(`[data-block="${block.clientId}"]`);
                            if (element) {
                                const textContent = this.getBlockText(element);
                                if (textContent.length > 0) {
                                    blocks.push({
                                        element: element,
                                        type: block.name || 'core/freeform',
                                        clientId: block.clientId
                                    });
                                }
                            }
                        });
                    } catch (e) {
                        // Fall back to DOM-based extraction
                        this._extractBlocksFromDOM(blocks);
                    }
                } else {
                    this._extractBlocksFromDOM(blocks);
                }
            } else {
                // Classic editor: enumerate top-level elements matching CLASSIC_BLOCK_TAGS
                this._extractClassicBlocks(blocks);
            }

            // Cache the result
            this._blockMapCache = blocks;
            this._blockMapCacheHash = currentHash;

            return blocks;
        },

        /**
         * Extract blocks from DOM when wp.data is unavailable
         */
        _extractBlocksFromDOM: function (blocks) {
            const editorDocument = this.getEditorDocument();
            const wpBlocks = editorDocument.querySelectorAll('.wp-block[data-block]');
            wpBlocks.forEach(element => {
                const textContent = this.getBlockText(element);
                if (textContent.length > 0) {
                    blocks.push({
                        element: element,
                        type: 'gutenberg/unknown',
                        clientId: element.getAttribute('data-block')
                    });
                }
            });
        },

        /**
         * Extract blocks from Classic editor
         */
        _extractClassicBlocks: function (blocks) {
            // Try to find Classic editor content area
            const editorArea = document.querySelector('#content') || // Classic editor textarea
                document.querySelector('.mce-content-body') || // TinyMCE
                document.querySelector('iframe#content_ifr')?.contentDocument?.body; // TinyMCE iframe

            if (!editorArea) return;

            if (editorArea.tagName && editorArea.tagName.toLowerCase() === 'textarea') {
                this._extractClassicTextareaBlocks(blocks, editorArea);
                return;
            }

            this.clearClassicOverlay();

            // Get direct children that match block tags
            const children = editorArea.children;
            for (let i = 0; i < children.length; i++) {
                const element = children[i];
                const tagName = element.tagName.toLowerCase();

                if (CLASSIC_BLOCK_TAGS.includes(tagName)) {
                    const textContent = this.getBlockText(element);
                    if (textContent.length > 0) {
                        blocks.push({
                            element: element,
                            type: 'classic/' + tagName
                        });
                    }
                }
            }
        },
        _extractClassicTextareaBlocks: function (blocks, textarea) {
            const overlayContent = this.ensureClassicOverlay(textarea);
            if (!overlayContent) return;
            const children = Array.from(overlayContent.children);
            children.forEach(element => {
                if (!element.tagName) return;
                const tagName = element.tagName.toLowerCase();
                if (CLASSIC_BLOCK_TAGS.includes(tagName)) {
                    const textContent = this.getBlockText(element);
                    if (textContent.length > 0) {
                        blocks.push({
                            element: element,
                            type: 'classic/' + tagName
                        });
                    }
                }
            });
        },

        /**
         * Detect if using Gutenberg editor
         */
        isGutenbergEditor: function () {
            const editorDocument = this.getEditorDocument();
            return !!(
                document.querySelector('.block-editor') ||
                document.querySelector('.editor-styles-wrapper') ||
                editorDocument.querySelector('.block-editor') ||
                editorDocument.querySelector('.editor-styles-wrapper') ||
                (window.wp && window.wp.data && window.wp.data.select('core/block-editor'))
            );
        },

        /**
         * Get text content from a block element
         * Matches server-side strip_to_text behavior
         */
        getBlockText: function (element) {
            if (!element) return '';
            let text = element.textContent || '';
            // Normalize whitespace to match server
            text = text.replace(/\s+/g, ' ').trim();
            return text;
        },

        /**
         * Compute SHA256 hash of text content
         * Must match server-side compute_block_hash
         */
        computeBlockHash: async function (text) {
            // Use Web Crypto API for SHA256
            if (window.crypto && window.crypto.subtle) {
                try {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(text);
                    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                } catch (e) {
                    // Fallback to simple hash
                    return this._simpleHash(text);
                }
            }
            return this._simpleHash(text);
        },

        /**
         * Synchronous hash computation for validation
         * Uses simple DJB2 hash - for quick comparison, not cryptographic
         */
        /**
         * Compute SHA-256 signature of text content
         * MUST match server-side compute_block_signature
         */
        computeSignature: async function (text) {
            const normalized = this.canonicalize(text);

            // Use Web Crypto API for SHA256 if available
            if (window.crypto && window.crypto.subtle) {
                try {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(normalized);
                    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    return hashHex;
                } catch (e) {
                }
            }
            // Fallback for non-secure contexts (though SHA256 required by spec)
            return this._simpleHash(normalized);
        },

        /**
         * Canonicalize text for signature generation
         * MUST match server-side canonicalize_php()
         */
        canonicalize: function (text) {
            if (!text) return '';

            return text
                // 1. Decode entities (browser handles this often, but ensure)
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')

                // 2. Normalize Unicode
                .normalize('NFKC')

                // 3. Remove zero-width chars
                .replace(/[\u200B-\u200D\uFEFF]/g, '')

                // 4. Collapse whitespace
                .replace(/\s+/g, ' ')

                // 5 & 6. Trim and Lowercase
                .trim()
                .toLowerCase();
        },

        // Legacy hash (DJB2) - kept for backward compat if needed
        computeBlockHashSync: function (text) {
            // For synchronous validation, use simple hash
            // Full SHA256 validation should be done async
            let hash = 5381;
            for (let i = 0; i < text.length; i++) {
                hash = ((hash << 5) + hash) + text.charCodeAt(i);
                hash = hash & hash; // Convert to 32bit int
            }
            return hash.toString(16);
        },

        _simpleHash: function (text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(16);
        },

        /**
         * Get editor content hash for stale detection
         */
        getEditorContentHash: function () {
            const content = this.getEditorContent();
            return this._simpleHash(content);
        },

        getEditorContentSha256: async function () {
            const content = this.getEditorContent();
            if (!content) return '';
            try {
                if (window && window.crypto && window.crypto.subtle && typeof window.TextEncoder !== 'undefined') {
                    const encoder = new window.TextEncoder();
                    const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(content));
                    const bytes = new Uint8Array(digest);
                    let hex = '';
                    for (let i = 0; i < bytes.length; i += 1) {
                        hex += bytes[i].toString(16).padStart(2, '0');
                    }
                    return hex;
                }
            } catch (e) {
                Telemetry.log('content_hash_sha256_failed', {
                    message: e && e.message ? e.message : 'unknown_error'
                });
            }
            return '';
        },

        getEditorContent: function () {
            const textarea = this.getClassicTextarea();
            if (textarea) {
                return textarea.value || '';
            }
            let content = '';
            const documents = this.getEditorDocuments();
            documents.forEach(doc => {
                const blocks = doc.querySelectorAll('.wp-block, .editor-post-title__input, .mce-content-body');
                blocks.forEach(block => {
                    // Clone block and remove highlight spans to get clean textContent
                    // This prevents hash changes when highlights are present
                    const clone = block.cloneNode(true);
                    const highlightSpans = clone.querySelectorAll('.aivi-inline-highlight, .aivi-highlight');
                    highlightSpans.forEach(span => {
                        // Unwrap span, keeping its text content
                        const textNode = doc.createTextNode(span.textContent || '');
                        if (span.parentNode) {
                            span.parentNode.replaceChild(textNode, span);
                        }
                    });
                    content += (clone.textContent || '') + '\n';
                });
            });
            return content;
        }
    };

    // ============================================
    // HIGHLIGHT MANAGER (Single active highlight)
    // ============================================
    const HighlightManager = {
        /**
         * Initialize the highlight manager
         */
        init: function (runId) {
            currentRunId = runId;
            isRunStale = false;
            this.clearActiveHighlight();
            this.clearBulkHighlights();
            this.setupContentChangeListener();
            // Note: setupHighlightObserver is called AFTER highlights are applied in showSummaryHighlights
            // because the iframe may not be accessible at init time
        },

        /**
         * Set up listener for content changes (stale-run detection)
         */
        setupContentChangeListener: function () {
            // Remove existing listener
            if (contentChangeListener) {
                if (contentChangeTarget) {
                    contentChangeTarget.removeEventListener('input', contentChangeListener, true);
                } else {
                    document.removeEventListener('input', contentChangeListener);
                }
            }
            if (!autoStaleDetectionEnabled) {
                contentChangeListener = null;
                contentChangeTarget = null;
                return;
            }

            // Track content hash
            let lastContentHash = AnchorResolver.getEditorContentHash();

            contentChangeListener = () => {
                const currentHash = AnchorResolver.getEditorContentHash();
                if (currentHash !== lastContentHash) {
                    if (activeHighlight && this.refreshActiveHighlight()) {
                        lastContentHash = currentHash;
                        return;
                    }
                    lastContentHash = currentHash;
                    this.markRunStale();
                }
            };

            // Listen for content changes in editor area
            const editorArea = AnchorResolver.getEditorRoot() ||
                document.querySelector('.editor-styles-wrapper') ||
                document.querySelector('.block-editor-writing-flow') ||
                document.body;

            contentChangeTarget = editorArea;
            editorArea.addEventListener('input', contentChangeListener, true);
        },

        /**
         * Set up MutationObserver to detect when Gutenberg re-renders and removes highlight spans.
         * Re-applies highlights from lastSummary when this happens.
         * @param {Document} [targetDoc] - Optional document to observe (from applied highlight spans)
         */
        setupHighlightObserver: function (targetDoc) {
            // Clean up existing observer
            if (highlightObserver) {
                highlightObserver.disconnect();
                highlightObserver = null;
            }

            // If targetDoc provided (from highlight spans), use it to find editor area
            let editorArea;
            if (targetDoc && targetDoc !== document) {
                editorArea = targetDoc.querySelector('.block-editor-writing-flow') || targetDoc.body;
            } else {
                editorArea = AnchorResolver.getEditorRoot() ||
                    document.querySelector('.editor-styles-wrapper') ||
                    document.querySelector('.block-editor-writing-flow');
            }

            if (!editorArea) {
                return;
            }

            const self = this;
            let mutationCounter = 0;
            highlightObserver = new MutationObserver((mutations) => {
                // Skip if run is stale or no summary to re-apply
                if (isRunStale || !lastSummary) return;

                mutationCounter++;

                // Check if any highlight spans were removed
                let highlightsRemoved = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const removed of mutation.removedNodes) {
                            if (removed.nodeType === Node.ELEMENT_NODE) {
                                // Check if removed node is or contains a highlight span
                                const isHighlight = removed.classList?.contains('aivi-inline-highlight');
                                const containsHighlight = removed.querySelector?.('.aivi-inline-highlight');
                                if (isHighlight || containsHighlight) {
                                    highlightsRemoved = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (highlightsRemoved) break;
                }

                // Also check if highlights no longer exist in the DOM (backup detection)
                if (!highlightsRemoved && mutationCounter % 5 === 0) {
                    const editorDoc = AnchorResolver.getEditorDocument();
                    const remainingHighlights = editorDoc.querySelectorAll('.aivi-inline-highlight');
                    if (remainingHighlights.length === 0 && lastSummary) {
                        highlightsRemoved = true;
                    }
                }

                if (highlightsRemoved) {
                    // Debounce re-attach to avoid rapid re-applies during DOM changes
                    if (reattachDebounce) {
                        clearTimeout(reattachDebounce);
                    }
                    reattachDebounce = setTimeout(() => {
                        self.reapplyBulkHighlights();
                    }, 150); // Wait for Gutenberg to finish re-rendering
                }
            });

            highlightObserver.observe(editorArea, {
                childList: true,
                subtree: true
            });
        },

        /**
         * Re-apply bulk highlights from lastSummary without clearing first.
         * Used after Gutenberg re-renders DOM and removes our highlight spans.
         */
        reapplyBulkHighlights: async function () {
            if (!lastSummary || isRunStale) {
                return;
            }

            // Check if highlights already exist - must check iframe document if applicable
            const editorDoc = AnchorResolver.getEditorDocument();
            const existingSpans = editorDoc.querySelectorAll('.aivi-inline-highlight');
            if (existingSpans.length > 0) {
                return;
            }

            await AnchorResolver.buildSignatureMap();

            const collected = [];
            lastSummary.categories.forEach(cat => {
                const issues = Array.isArray(cat.issues) ? cat.issues : [];
                issues.forEach(issue => {
                    const verdict = issue.ui_verdict || 'fail';
                    const styleKey = VERDICT_STYLE_MAP[verdict] || 'highlight-severity-warning';
                    const style = HIGHLIGHT_STYLES[styleKey];
                    const highlights = Array.isArray(issue.highlights) ? issue.highlights : [];
                    const checkId = issue.check_id || '';
                    highlights.forEach((h, hIndex) => {
                        const anchor = AnchorResolver.resolve(h);
                        if (anchor && anchor.element) {
                            const spans = this.applyInlineHighlight(anchor.element, anchor.start, anchor.end, {
                                runId: currentRunId,
                                checkId: checkId,
                                instanceIndex: hIndex,
                                verdict: verdict,
                                nodeRef: h.node_ref || null,
                                signature: h.signature || null,
                                snippet: h.snippet || null,
                                message: h.message || ''
                            }, style);
                            if (spans && spans.length) {
                                collected.push(spans);
                                if (checkId) {
                                    const key = `${checkId}:${hIndex}`;
                                    if (!bulkHighlightIndex.has(key)) {
                                        bulkHighlightIndex.set(key, spans);
                                    }
                                }
                            }
                        }
                    });
                });
            });
            bulkSpans = collected;
        },

        /**
         * Mark current run as stale
         */
        markRunStale: function () {
            if (isRunStale) return; // Already stale

            isRunStale = true;
            this.clearActiveHighlight();
            this.clearBulkHighlights();

            // Dispatch event for UI to handle
            window.dispatchEvent(new CustomEvent('aivi:run_stale', {
                detail: { runId: currentRunId }
            }));

            Telemetry.log('run_marked_stale', {
                run_id: currentRunId
            });
        },

        /**
         * Check if current run is stale
         */
        isStale: function () {
            return isRunStale;
        },
        refreshActiveHighlight: function () {
            if (!activeHighlight || !activeHighlight.highlight) return false;
            const highlight = activeHighlight.highlight;
            const anchor = AnchorResolver.resolve(highlight);
            if (!anchor || !anchor.element) return false;
            const styleKey = VERDICT_STYLE_MAP[activeHighlight.verdict] || 'highlight-severity-warning';
            const style = HIGHLIGHT_STYLES[styleKey];
            this.clearActiveHighlight();
            const spans = this.applyInlineHighlight(anchor.element, anchor.start, anchor.end, {
                runId: activeHighlight.runId,
                checkId: activeHighlight.checkId,
                instanceIndex: activeHighlight.instanceIndex,
                verdict: activeHighlight.verdict,
                nodeRef: highlight.node_ref || null,
                signature: highlight.signature || null,
                snippet: highlight.snippet || null,
                message: highlight.message || ''
            }, style);
            if (!spans || spans.length === 0) return false;
            activeHighlight = {
                runId: activeHighlight.runId,
                checkId: activeHighlight.checkId,
                instanceIndex: activeHighlight.instanceIndex,
                element: anchor.element,
                spans: spans,
                verdict: activeHighlight.verdict,
                highlight: highlight
            };
            return true;
        },

        /**
         * Show highlight for a specific instance
         * @param {Object} details - Details endpoint response
         * @param {string} verdict - 'fail', 'partial', or 'pass'
         * @param {Array} blockMap - Optional server block_map for hash validation
         * @returns {Promise<Object>} - { success: boolean, error?: string }
         */
        showHighlight: async function (details, verdict, blockMap) {
            if (highlightMode === 'passive') {
                Telemetry.log('highlight_passive_mode', { source: 'aivi-highlight-manager', action: 'show_highlight' });
                return { success: false, error: 'passive_mode' };
            }
            if (isRunStale) {
                return {
                    success: false,
                    error: 'stale_run',
                    message: 'Content changed â€” please re-run analysis'
                };
            }

            const startTime = Date.now();
            const preRendered = this.getBulkHighlightSpans(details?.check_id, details?.instance_index);
            if (preRendered && preRendered.length) {
                Telemetry.navigationAttempt({
                    run_id: details?.run_id || currentRunId,
                    check_id: details?.check_id,
                    instance_index: details?.instance_index,
                    node_ref: details?.node_ref || null,
                    resolution_method: 'pre_rendered',
                    success: true,
                    duration_ms: Date.now() - startTime
                });
                this.scrollToElement(preRendered[0]);
                this.focusInlineSpan(preRendered[0]);
                return { success: true };
            }

            // Ensure signature map is built
            await AnchorResolver.buildSignatureMap();

            // Clear any existing highlight first (single active highlight rule)
            this.clearActiveHighlight();

            let synthesizedHighlight = null;
            if (details?.cannot_anchor) {
                const fallbackCandidate = details?.focused_failed_candidate ||
                    (details?.check && Array.isArray(details.check.failed_candidates)
                        ? details.check.failed_candidates[details.instance_index || 0]
                        : null);
                if (fallbackCandidate && (fallbackCandidate.node_ref || fallbackCandidate.signature)) {
                    synthesizedHighlight = {
                        ...fallbackCandidate,
                        scope: fallbackCandidate.scope || 'block',
                        anchor_status: 'block_only',
                        anchor_strategy: 'client_block_only_fallback'
                    };
                    Telemetry.log('anchor_block_only_fallback', {
                        run_id: details?.run_id || currentRunId,
                        check_id: details?.check_id,
                        instance_index: details?.instance_index
                    });
                } else {
                    Telemetry.navigationAttempt({
                        run_id: details?.run_id || currentRunId,
                        check_id: details?.check_id,
                        instance_index: details?.instance_index,
                        node_ref: null,
                        resolution_method: 'cannot_anchor',
                        success: false,
                        duration_ms: Date.now() - startTime
                    });
                    Telemetry.anchorResolutionFailed(
                        details?.run_id || currentRunId,
                        details?.check_id,
                        details?.instance_index,
                        details?.failure_reason || 'cannot_anchor',
                        null
                    );
                    return {
                        success: false,
                        error: 'cannot_anchor',
                        message: 'Evidence could not be anchored - Open details'
                    };
                }
            }

            // Get the highlight - support both highlights array and focused_highlight
            let highlight = null;
            if (details.focused_highlight) {
                highlight = details.focused_highlight;
            } else if (synthesizedHighlight) {
                highlight = synthesizedHighlight;
            } else if (details.highlights && details.highlights.length > 0) {
                highlight = details.highlights[0];
            }

            // Validate highlight exists
            if (!highlight) {
                Telemetry.navigationAttempt({
                    run_id: details?.run_id || currentRunId,
                    check_id: details?.check_id,
                    instance_index: details?.instance_index,
                    node_ref: null,
                    resolution_method: 'unresolved',
                    success: false,
                    duration_ms: Date.now() - startTime
                });
                Telemetry.anchorResolutionFailed(
                    details?.run_id || currentRunId,
                    details?.check_id,
                    details?.instance_index,
                    'no_highlights',
                    null
                );
                return {
                    success: false,
                    error: 'no_highlights',
                    message: 'Cannot locate instance in current content â€” Open details'
                };
            }

            DebugLog.emit('raw_highlight', {
                run_id: details?.run_id || currentRunId,
                check_id: details?.check_id || null,
                instance_index: details?.instance_index,
                highlight: highlight
            });

            // Resolve anchor deterministically
            const anchor = AnchorResolver.resolve(highlight, blockMap);

            // Handle stale block (hash mismatch)
            if (anchor && anchor.stale_block) {
                if (autoStaleDetectionEnabled) {
                    this.markRunStale();
                }
                Telemetry.navigationAttempt({
                    run_id: details.run_id || currentRunId,
                    check_id: details.check_id,
                    instance_index: details.instance_index,
                    node_ref: highlight.node_ref,
                    resolution_method: 'stale',
                    success: false,
                    duration_ms: Date.now() - startTime
                });
                return {
                    success: false,
                    error: 'results_stale',
                    message: 'Content changed â€” please re-run analysis'
                };
            }

            // Handle unresolved anchor
            if (!anchor || !anchor.element) {
                Telemetry.navigationAttempt({
                    run_id: details.run_id || currentRunId,
                    check_id: details.check_id,
                    instance_index: details.instance_index,
                    node_ref: highlight.node_ref,
                    resolution_method: 'unresolved',
                    success: false,
                    duration_ms: Date.now() - startTime
                });
                Telemetry.anchorResolutionFailed(
                    details.run_id || currentRunId,
                    details.check_id,
                    details.instance_index,
                    'anchor_unresolved',
                    highlight.node_ref
                );
                return {
                    success: false,
                    error: 'anchor_unresolved',
                    message: 'Cannot locate instance in current content â€” Open details'
                };
            }

            const styleKey = VERDICT_STYLE_MAP[verdict] || 'highlight-severity-warning';
            const style = HIGHLIGHT_STYLES[styleKey];
            const spans = this.applyInlineHighlight(anchor.element, anchor.start, anchor.end, {
                runId: details.run_id || currentRunId,
                checkId: details.check_id,
                instanceIndex: details.instance_index,
                verdict: verdict,
                nodeRef: highlight.node_ref || null,
                signature: highlight.signature || null,
                snippet: highlight.snippet || null,
                message: highlight.message || details.message || ''
            }, style);

            if (!spans || spans.length === 0) {
                Telemetry.navigationAttempt({
                    run_id: details.run_id || currentRunId,
                    check_id: details.check_id,
                    instance_index: details.instance_index,
                    node_ref: highlight.node_ref,
                    resolution_method: 'inline_unavailable',
                    success: false,
                    duration_ms: Date.now() - startTime
                });
                Telemetry.anchorResolutionFailed(
                    details.run_id || currentRunId,
                    details.check_id,
                    details.instance_index,
                    'inline_unavailable',
                    highlight.node_ref
                );
                return {
                    success: false,
                    error: 'inline_unavailable',
                    message: 'Cannot render inline evidence â€” Open details'
                };
            }

            const highlightPayload = {
                node_ref: highlight.node_ref || null,
                signature: highlight.signature || null,
                start: typeof highlight.start === 'number' ? highlight.start : undefined,
                end: typeof highlight.end === 'number' ? highlight.end : undefined,
                snippet: highlight.snippet || null,
                message: highlight.message || details.message || '',
                anchor_status: highlight.anchor_status || null,
                anchor_strategy: highlight.anchor_strategy || null
            };
            activeHighlight = {
                runId: details.run_id || currentRunId,
                checkId: details.check_id,
                instanceIndex: details.instance_index,
                element: anchor.element,
                spans: spans,
                verdict: verdict,
                highlight: highlightPayload
            };

            // Log telemetry
            Telemetry.navigationAttempt({
                run_id: details.run_id || currentRunId,
                check_id: details.check_id,
                instance_index: details.instance_index,
                node_ref: highlight.node_ref,
                resolution_method: anchor.method,
                success: true,
                duration_ms: Date.now() - startTime
            });

            this.scrollToElement(spans[0] || anchor.element);
            if (spans[0]) {
                this.focusInlineSpan(spans[0]);
            }
            this.focusElement(anchor.element);

            return { success: true };
        },
        showSummaryHighlights: async function (summary) {
            if (highlightMode === 'passive') {
                Telemetry.log('highlight_passive_mode', { source: 'aivi-highlight-manager', action: 'show_summary' });
                return { success: false, error: 'passive_mode' };
            }
            if (!summary || !Array.isArray(summary.categories)) {
                return { success: false, error: 'invalid_summary' };
            }
            if (isRunStale) {
                return { success: false, error: 'stale_run' };
            }
            // Store summary for re-attach after DOM mutations
            lastSummary = summary;
            await AnchorResolver.buildSignatureMap();
            this.clearBulkHighlights();
            const collected = [];
            summary.categories.forEach(cat => {
                const issues = Array.isArray(cat.issues) ? cat.issues : [];
                issues.forEach(issue => {
                    const verdict = issue.ui_verdict || 'fail';
                    const styleKey = VERDICT_STYLE_MAP[verdict] || 'highlight-severity-warning';
                    const style = HIGHLIGHT_STYLES[styleKey];
                    const highlights = Array.isArray(issue.highlights) ? issue.highlights : [];
                    const checkId = issue.check_id || '';
                    highlights.forEach((h, hIndex) => {
                        const anchor = AnchorResolver.resolve(h);
                        if (anchor && anchor.element) {
                            const spans = this.applyInlineHighlight(anchor.element, anchor.start, anchor.end, {
                                runId: currentRunId,
                                checkId: checkId,
                                instanceIndex: hIndex,
                                verdict: verdict,
                                nodeRef: h.node_ref || null,
                                signature: h.signature || null,
                                snippet: h.snippet || null,
                                message: h.message || ''
                            }, style);
                            if (spans && spans.length) {
                                collected.push(spans);
                                if (checkId) {
                                    const key = `${checkId}:${hIndex}`;
                                    if (!bulkHighlightIndex.has(key)) {
                                        bulkHighlightIndex.set(key, spans);
                                    }
                                }
                            }
                        }
                    });
                });
            });
            bulkSpans = collected;
            if (collected.length === 0) {
                return { success: false, error: 'no_highlights' };
            }

            // Setup observer AFTER highlights are applied
            // Use the first span's ownerDocument to get the correct iframe document
            const firstSpan = collected[0]?.[0];
            const targetDoc = firstSpan ? firstSpan.ownerDocument : null;
            this.setupHighlightObserver(targetDoc);

            return { success: true, count: collected.length };
        },
        getBulkHighlightSpans: function (checkId, instanceIndex) {
            if (!checkId || typeof instanceIndex !== 'number') return null;
            const key = `${checkId}:${instanceIndex}`;
            return bulkHighlightIndex.get(key) || null;
        },
        quickFocusByNodeRef: function (nodeRef, verdict, checkId, instanceIndex) {
            if (!nodeRef) {
                return { success: false, error: 'missing_node_ref' };
            }
            const highlight = { node_ref: nodeRef, start: 0, end: 0 };
            const anchor = AnchorResolver.resolve(highlight);
            if (!anchor || !anchor.element) {
                return { success: false, error: 'anchor_unresolved' };
            }
            const styleKey = VERDICT_STYLE_MAP[verdict] || 'highlight-severity-warning';
            const style = HIGHLIGHT_STYLES[styleKey];
            this.clearActiveHighlight();
            const textLen = AnchorResolver.getBlockText(anchor.element).length;
            const spans = this.applyInlineHighlight(anchor.element, 0, textLen, {
                runId: currentRunId,
                checkId: checkId,
                instanceIndex: instanceIndex,
                verdict: verdict,
                nodeRef: nodeRef,
                signature: null,
                snippet: null,
                message: ''
            }, style);
            if (!spans || spans.length === 0) {
                return { success: false, error: 'inline_unavailable' };
            }
            activeHighlight = {
                runId: currentRunId,
                checkId: checkId,
                instanceIndex: instanceIndex,
                element: anchor.element,
                spans: spans,
                verdict: verdict,
                highlight: {
                    node_ref: nodeRef || null,
                    signature: null,
                    start: 0,
                    end: textLen,
                    snippet: null,
                    message: ''
                }
            };
            if (spans && spans[0]) {
                this.scrollToElement(spans[0]);
                this.focusInlineSpan(spans[0]);
            } else {
                this.scrollToElement(anchor.element);
            }
            this.focusElement(anchor.element);
            return { success: true };
        },
        clearBulkHighlights: function () {
            if (!bulkSpans || bulkSpans.length === 0) {
                // Still clear lastSummary to prevent re-attach
                lastSummary = null;
                return;
            }
            bulkSpans.forEach(spans => {
                if (!spans) return;
                spans.forEach(span => {
                    if (!span || !span.parentNode) return;
                    const doc = span.ownerDocument || document;
                    const textNode = doc.createTextNode(span.textContent || '');
                    span.parentNode.replaceChild(textNode, span);
                    if (textNode.parentNode && textNode.parentNode.normalize) {
                        textNode.parentNode.normalize();
                    }
                });
            });
            bulkSpans = [];
            bulkHighlightIndex = new Map();
            lastSummary = null;  // Clear to prevent re-attach
            this.hideTooltip();
        },
        clearAllHighlights: function () {
            this.clearActiveHighlight();
            this.clearBulkHighlights();
        },

        /**
         * Apply visual highlight style to element
         */
        applyInlineHighlight: function (element, start, end, data, style) {
            if (highlightMode === 'passive') return [];
            if (!element) return [];
            if (typeof start !== 'number' || typeof end !== 'number' || start >= end) return [];
            const doc = element.ownerDocument || document;
            const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let pos = 0;
            const spans = [];
            const nodesToProcess = [];
            let node;
            while ((node = walker.nextNode())) {
                const text = node.nodeValue || '';
                const len = text.length;
                const nodeStart = pos;
                const nodeEnd = pos + len;
                if (end <= nodeStart) break;
                if (start >= nodeEnd) {
                    pos = nodeEnd;
                    continue;
                }
                nodesToProcess.push({ node, nodeStart });
                pos = nodeEnd;
            }
            nodesToProcess.forEach(item => {
                const { node, nodeStart } = item;
                const text = node.nodeValue || '';
                const sliceStart = Math.max(start - nodeStart, 0);
                const sliceEnd = Math.min(end - nodeStart, text.length);
                const beforeText = text.slice(0, sliceStart);
                const midText = text.slice(sliceStart, sliceEnd);
                const afterText = text.slice(sliceEnd);
                if (!midText) return;
                const fragment = doc.createDocumentFragment();
                if (beforeText) fragment.appendChild(doc.createTextNode(beforeText));
                const span = this.createInlineSpan(midText, data, style, doc);
                fragment.appendChild(span);
                if (afterText) fragment.appendChild(doc.createTextNode(afterText));
                if (node.parentNode) {
                    node.parentNode.replaceChild(fragment, node);
                }
                spans.push(span);
            });
            return spans;
        },
        createInlineSpan: function (text, data, style, doc) {
            const targetDoc = doc || document;
            const span = targetDoc.createElement('span');
            span.textContent = text;
            span.classList.add('aivi-inline-highlight');
            span.classList.add(`aivi-inline-${data.verdict || 'partial'}`);
            // AI Glow Style: Use background color based on verdict, no underlines
            const glowColors = {
                fail: 'rgba(239, 68, 68, 0.15)',
                partial: 'rgba(245, 158, 11, 0.15)',
                pass: 'rgba(16, 185, 129, 0.15)'
            };
            const verdict = data.verdict || 'partial';
            span.style.backgroundColor = glowColors[verdict] || glowColors.partial;
            span.style.borderRadius = '3px';
            span.style.padding = '0 2px';
            span.style.cursor = 'help';
            if (data.message) {
                span.dataset.aiviMessage = data.message;
                span.setAttribute('aria-label', data.message);
            } else {
                span.setAttribute('aria-label', style.label);
            }
            if (data.checkId) span.dataset.aiviCheckId = data.checkId;
            if (data.verdict) span.dataset.aiviVerdict = data.verdict;
            if (data.runId) span.dataset.aiviRunId = data.runId;
            if (typeof data.instanceIndex === 'number') span.dataset.aiviInstanceIndex = String(data.instanceIndex);
            if (data.nodeRef) span.dataset.aiviNodeRef = data.nodeRef;
            if (data.signature) span.dataset.aiviSignature = data.signature;
            if (data.snippet) span.dataset.aiviSnippet = data.snippet;
            span.setAttribute('role', 'mark');
            span.tabIndex = 0;
            this.attachTooltipHandlers(span);
            return span;
        },
        attachTooltipHandlers: function (span) {
            if (!span) return;
            let locked = false;

            // Hover to show (unless locked)
            span.addEventListener('mouseenter', () => {
                this.showTooltip(span);
            });
            span.addEventListener('mouseleave', () => {
                if (!locked) {
                    this.hideTooltip();
                }
            });

            // Click to lock/unlock tooltip
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                locked = !locked;
                this.showTooltip(span); // Always show on click
                if (locked) {
                    this._lockedSpan = span;
                    this._unlockFn = () => { locked = false; };
                }
            });

            // Focus shows tooltip for accessibility
            span.addEventListener('focus', () => this.showTooltip(span));
            span.addEventListener('blur', () => {
                if (!locked) this.hideTooltip();
            });
        },
        ensureTooltip: function () {
            const doc = (tooltipDocument && tooltipDocument.body) ? tooltipDocument : document;
            if (!doc || !doc.body) return;
            const sameDocument = tooltipElement && tooltipDocument === doc;
            const inDom = tooltipElement && tooltipElement.parentNode;
            if (sameDocument && inDom) return;
            if (!sameDocument && tooltipElement && tooltipElement.parentNode) {
                tooltipElement.parentNode.removeChild(tooltipElement);
            }
            if (!sameDocument) {
                tooltipElement = doc.createElement('div');
                tooltipElement.className = 'aivi-magic-pill';
            }
            // Magic Pill Styles
            tooltipElement.style.cssText = `
                position: fixed;
                z-index: 999999;
                display: none;
                align-items: center;
                gap: 10px;
                padding: 6px 6px 6px 14px;
                border-radius: 99px;
                font-size: 12px;
                font-weight: 500;
                white-space: nowrap;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid rgba(0, 0, 0, 0.05);
                backdrop-filter: blur(8px);
                color: #374151;
                animation: aivi-float 3s ease-in-out infinite;
            `;
            // Add animation keyframes if not exist
            if (!doc.getElementById('aivi-pill-styles')) {
                const style = doc.createElement('style');
                style.id = 'aivi-pill-styles';
                style.textContent = `
                    @keyframes aivi-float {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-4px); }
                    }
                    .aivi-magic-pill {
                        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    }
                    .aivi-magic-pill:hover {
                        box-shadow: 0 15px 30px -10px rgba(0, 0, 0, 0.2);
                        border-radius: 12px;
                        padding-right: 14px;
                        max-width: 600px !important;
                    }
                    .aivi-pill-text {
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        max-width: 180px;
                        transition: max-width 0.4s ease, white-space 0s 0.4s;
                    }
                    .aivi-magic-pill:hover .aivi-pill-text {
                        max-width: 400px;
                        white-space: normal;
                        transition: max-width 0.4s ease, white-space 0s 0s;
                    }
                `;
                doc.head.appendChild(style);
            }
            // Inner structure
            tooltipElement.innerHTML = `
                <span class="aivi-pill-icon" style="font-size: 14px; flex-shrink: 0;">!</span>
                <span class="aivi-pill-text"></span>
                <span class="aivi-pill-separator" style="width: 1px; height: 16px; opacity: 0.15; background: #000; flex-shrink: 0;"></span>
                <button class="aivi-pill-action" style="
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 12px;
                    border-radius: 99px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    background: linear-gradient(135deg, #2563eb, #4f46e5);
                    color: white;
                    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
                    transition: transform 0.1s;
                    flex-shrink: 0;
                    white-space: nowrap;
                ">âœ¨ Fix with AI</button>
            `;
            tooltipElement.style.pointerEvents = 'auto';
            if (!tooltipElement.parentNode) {
                doc.body.appendChild(tooltipElement);
            }
            tooltipDocument = doc;
            tooltipWindow = doc.defaultView || window;
            tooltipWindow.addEventListener('scroll', () => this.hideTooltip(), true);
            tooltipWindow.addEventListener('resize', () => this.hideTooltip(), true);

            // Click outside closes tooltip
            doc.addEventListener('click', (e) => {
                if (tooltipElement && tooltipElement.style.display === 'flex') {
                    // Check if click is outside both the tooltip and the current span
                    if (!tooltipElement.contains(e.target) && (!this._currentSpan || !this._currentSpan.contains(e.target))) {
                        this.hideTooltip();
                    }
                }
            });

            // Attach rewrite button handler
            const rewriteBtn = tooltipElement.querySelector('.aivi-pill-action');
            if (rewriteBtn) {
                rewriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Dispatch rewrite event with current span data
                    if (this._currentSpan) {
                        const checkId = this._currentSpan.dataset ? this._currentSpan.dataset.aiviCheckId : null;
                        window.dispatchEvent(new CustomEvent('aivi:rewrite', {
                            detail: { checkId, nodeRef: this._currentSpan.dataset.aiviNodeRef }
                        }));
                    }
                    this.hideTooltip();
                });
            }
        },
        showTooltip: function (span) {
            const message = span && span.dataset ? span.dataset.aiviMessage : '';
            if (!message) return;
            tooltipDocument = span && span.ownerDocument ? span.ownerDocument : document;
            this.ensureTooltip();
            this._currentSpan = span;
            if (tooltipTimer) {
                clearTimeout(tooltipTimer);
                tooltipTimer = null;
            }
            tooltipTimer = setTimeout(() => {
                if (!tooltipElement) return;
                const textEl = tooltipElement.querySelector('.aivi-pill-text');
                if (textEl) textEl.textContent = message;
                // Update icon based on verdict
                const iconEl = tooltipElement.querySelector('.aivi-pill-icon');
                const verdict = span.dataset ? span.dataset.aiviVerdict : 'partial';
                if (iconEl) {
                    if (verdict === 'fail') iconEl.textContent = 'âŒ';
                    else if (verdict === 'pass') iconEl.textContent = 'âœ…';
                    else iconEl.textContent = 'âš ï¸';
                }
                tooltipElement.style.display = 'flex';
                this.positionTooltip(span, tooltipElement);
            }, 80);
        },
        hideTooltip: function () {
            if (tooltipTimer) {
                clearTimeout(tooltipTimer);
                tooltipTimer = null;
            }
            if (tooltipElement) {
                tooltipElement.style.display = 'none';
            }
            this._currentSpan = null;
        },
        positionTooltip: function (span, tooltip) {
            if (!span || !tooltip) return;
            const rect = span.getBoundingClientRect();
            const top = rect.top - 12;
            const left = rect.left + rect.width / 2;
            const tooltipRect = tooltip.getBoundingClientRect();
            let x = left - tooltipRect.width / 2;
            let y = top - tooltipRect.height;
            const view = (tooltip.ownerDocument && tooltip.ownerDocument.defaultView) ? tooltip.ownerDocument.defaultView : window;
            if (x < 8) x = 8;
            if (x + tooltipRect.width > view.innerWidth - 8) {
                x = view.innerWidth - tooltipRect.width - 8;
            }
            if (y < 8) {
                y = rect.bottom + 12;
            }
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        },
        focusInlineSpan: function (span) {
            if (span && span.focus) span.focus();
        },

        /**
         * Clear active highlight
         */
        clearActiveHighlight: function () {
            if (!activeHighlight) return;

            const { element, runId, checkId, spans } = activeHighlight;

            if (element) {
                if (spans && spans.length > 0) {
                    spans.forEach(span => {
                        if (!span || !span.parentNode) return;
                        const doc = span.ownerDocument || document;
                        const textNode = doc.createTextNode(span.textContent || '');
                        span.parentNode.replaceChild(textNode, span);
                        if (textNode.parentNode && textNode.parentNode.normalize) {
                            textNode.parentNode.normalize();
                        }
                    });
                }
            }
            this.hideTooltip();

            // Log telemetry
            if (runId && checkId) {
                Telemetry.highlightCleared(runId, checkId);
            }

            activeHighlight = null;
        },

        /**
         * Scroll to element smoothly
         */
        scrollToElement: function (element) {
            if (!element) return;
            const overlayState = AnchorResolver.getClassicOverlayState();
            if (overlayState && overlayState.content && overlayState.textarea && overlayState.content.contains(element)) {
                const top = element.offsetTop;
                const targetTop = Math.max(0, top - (overlayState.textarea.clientHeight / 2));
                overlayState.textarea.scrollTop = targetTop;
                return;
            }

            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        },

        /**
         * Focus element (set caret inside block)
         */
        focusElement: function (element) {
            if (!element) return;
            const overlayState = AnchorResolver.getClassicOverlayState();
            if (overlayState && overlayState.content && overlayState.textarea && overlayState.content.contains(element)) {
                overlayState.textarea.focus();
                return;
            }

            // Try to focus the element
            if (element.focus) {
                element.focus();
            }

            // For Gutenberg, try to select the block
            if (window.wp && window.wp.data && window.wp.data.dispatch) {
                try {
                    const blockId = element.getAttribute('data-block');
                    if (blockId) {
                        window.wp.data.dispatch('core/block-editor').selectBlock(blockId);
                    }
                } catch (e) {
                    // Focus not critical - continue silently
                }
            }
        },

        /**
         * Get current highlight state
         */
        getActiveHighlight: function () {
            return activeHighlight ? { ...activeHighlight } : null;
        },

        /**
         * Cleanup on unmount
         */
        destroy: function () {
            this.clearActiveHighlight();
            if (contentChangeListener) {
                document.removeEventListener('input', contentChangeListener);
                contentChangeListener = null;
            }
            isRunStale = false;
            currentRunId = null;
        }
    };

    // ============================================
    // DETAILS ENDPOINT CLIENT
    // ============================================
    const DetailsClient = {
        _cache: new Map(),
        _cacheTtlMs: 5 * 60 * 1000,
        _cacheMaxEntries: 400,

        _makeCacheKey: function (detailsToken, checkId, instanceIndex, detailRef) {
            const ref = detailRef || (checkId ? `check:${checkId}` : 'check:unknown');
            const idx = Number.isInteger(instanceIndex) ? instanceIndex : 0;
            return `${detailsToken || ''}|${ref}|${idx}`;
        },

        _readCache: function (cacheKey, allowStale) {
            const entry = this._cache.get(cacheKey);
            if (!entry) return null;
            const ageMs = Date.now() - entry.timestamp;
            if (ageMs <= this._cacheTtlMs) return entry.data;
            if (allowStale) return entry.data;
            this._cache.delete(cacheKey);
            return null;
        },

        _writeCache: function (cacheKey, data) {
            this._cache.set(cacheKey, { data: data, timestamp: Date.now() });
            if (this._cache.size <= this._cacheMaxEntries) return;
            const oldestKey = this._cache.keys().next().value;
            if (oldestKey) this._cache.delete(oldestKey);
        },

        clearCache: function () {
            this._cache.clear();
        },

        /**
         * Fetch instance details from endpoint
         * @param {string} detailsToken - The details token from analysis response
         * @param {string} checkId - The check ID
         * @param {number} instanceIndex - Zero-based instance index
         * @param {string|null} detailRef - Optional compact detail reference
         * @returns {Promise<Object>} - Details response or error
         */
        fetchInstanceDetails: async function (detailsToken, checkId, instanceIndex, detailRef) {
            if (HighlightManager.isStale()) {
                return {
                    success: false,
                    error: 'stale_run',
                    status: 410,
                    message: 'Analysis results stale - please re-run analysis.'
                };
            }

            const cacheKey = this._makeCacheKey(detailsToken, checkId, instanceIndex, detailRef);
            const cached = this._readCache(cacheKey, false);
            if (cached) {
                return {
                    success: true,
                    data: cached,
                    cached: true
                };
            }

            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            try {
                const restBase = window.aiviSidebar?.restBase || '/wp-json/aivi/v1';
                const nonce = window.aiviSidebar?.nonce || '';
                const contentHash = autoStaleDetectionEnabled
                    ? await AnchorResolver.getEditorContentSha256()
                    : '';
                const requestPayload = {
                    details_token: detailsToken,
                    check_id: checkId,
                    detail_ref: detailRef || (checkId ? `check:${checkId}` : null),
                    instance_index: instanceIndex,
                    content_hash: contentHash
                };
                const maxAttempts = 2;
                let attempt = 0;
                let lastNetworkError = null;

                while (attempt < maxAttempts) {
                    attempt += 1;
                    let response;
                    try {
                        response = await fetch(`${restBase}/backend/analysis-details`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-WP-Nonce': nonce
                            },
                            body: JSON.stringify(requestPayload)
                        });
                    } catch (error) {
                        lastNetworkError = error;
                        if (attempt < maxAttempts) {
                            await sleep(250);
                            continue;
                        }
                        break;
                    }

                    if (response.status === 410) {
                        if (autoStaleDetectionEnabled) {
                            HighlightManager.markRunStale();
                        }
                        return {
                            success: false,
                            error: autoStaleDetectionEnabled ? 'results_stale' : 'details_unavailable',
                            status: 410,
                            message: autoStaleDetectionEnabled
                                ? 'Analysis results stale - please re-run analysis.'
                                : 'Details are unavailable for this edited content. Re-run analysis when you are ready.'
                        };
                    }
                    if (response.status === 401) {
                        return {
                            success: false,
                            error: 'unauthorized',
                            status: 401,
                            message: 'Session token invalid or expired.'
                        };
                    }
                    if (response.status === 503) {
                        return {
                            success: false,
                            error: 'aborted',
                            status: 503,
                            message: 'Analysis aborted - no details available.'
                        };
                    }

                    if (!response.ok) {
                        if (response.status >= 500 && attempt < maxAttempts) {
                            await sleep(250);
                            continue;
                        }
                        return {
                            success: false,
                            error: 'request_failed',
                            status: response.status,
                            message: `Failed to fetch details: ${response.status}`
                        };
                    }

                    const data = await response.json();
                    this._writeCache(cacheKey, data);
                    return {
                        success: true,
                        data: data
                    };
                }

                const staleCached = this._readCache(cacheKey, true);
                if (staleCached) {
                    return {
                        success: true,
                        data: staleCached,
                        cached: true,
                        fallback: 'stale_cache'
                    };
                }

                return {
                    success: false,
                    error: 'network_error',
                    message: lastNetworkError && lastNetworkError.message ? lastNetworkError.message : 'Network request failed'
                };

            } catch (error) {
                const staleCached = this._readCache(cacheKey, true);
                if (staleCached) {
                    return {
                        success: true,
                        data: staleCached,
                        cached: true,
                        fallback: 'stale_cache'
                    };
                }
                return {
                    success: false,
                    error: 'network_error',
                    message: error.message
                };
            }
        }
    };

    // ============================================
    // POPOVER MANAGER (Unresolved anchor messaging)
    // ============================================
    const PopoverManager = {
        activePopover: null,

        /**
         * Show unresolved anchor popover
         * @param {HTMLElement} anchorElement - Element to anchor popover to
         * @param {Function} onOpenDetails - Callback when user clicks "Open details"
         */
        showUnresolvedPopover: function (anchorElement, onOpenDetails) {
            this.hidePopover();

            const popover = document.createElement('div');
            popover.className = 'aivi-popover aivi-popover-unresolved';
            popover.innerHTML = `
                <div class="aivi-popover-content">
                    <span class="aivi-popover-icon">!</span>
                    <span class="aivi-popover-text">Cannot locate instance in current content</span>
                    <button class="aivi-popover-action" type="button">Open details</button>
                    <button class="aivi-popover-close" type="button" aria-label="Close">x</button>
                </div>
            `;

            // Position popover
            if (anchorElement) {
                const rect = anchorElement.getBoundingClientRect();
                popover.style.position = 'fixed';
                popover.style.top = `${rect.bottom + 8}px`;
                popover.style.left = `${rect.left}px`;
            }

            // Event handlers
            const actionBtn = popover.querySelector('.aivi-popover-action');
            const closeBtn = popover.querySelector('.aivi-popover-close');

            actionBtn.addEventListener('click', () => {
                this.hidePopover();
                if (onOpenDetails) onOpenDetails();
            });

            closeBtn.addEventListener('click', () => {
                this.hidePopover();
            });

            // Click outside to close
            setTimeout(() => {
                document.addEventListener('click', this._outsideClickHandler);
            }, 0);

            document.body.appendChild(popover);
            this.activePopover = popover;
        },

        /**
         * Show stale run toast
         */
        showStaleToast: function () {
            // Remove existing toast
            const existing = document.querySelector('.aivi-toast-stale');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.className = 'aivi-toast aivi-toast-stale';
            toast.innerHTML = `
                <span class="aivi-toast-icon">!</span>
                <span class="aivi-toast-text">Content changed - please re-run analysis</span>
                <button class="aivi-toast-close" type="button" aria-label="Close">x</button>
            `;

            const closeBtn = toast.querySelector('.aivi-toast-close');
            closeBtn.addEventListener('click', () => {
                toast.remove();
            });

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 5000);

            document.body.appendChild(toast);
        },

        hidePopover: function () {
            if (this.activePopover) {
                this.activePopover.remove();
                this.activePopover = null;
            }
            document.removeEventListener('click', this._outsideClickHandler);
        },

        _outsideClickHandler: function (e) {
            const popover = document.querySelector('.aivi-popover');
            if (popover && !popover.contains(e.target)) {
                PopoverManager.hidePopover();
            }
        }
    };

    // ============================================
    // EXPORTS
    // ============================================
    window.AiviHighlightManager = HighlightManager;
    window.AiviAnchorResolver = AnchorResolver;
    window.AiviDetailsClient = DetailsClient;
    window.AiviPopoverManager = PopoverManager;
    window.AiviHighlightTelemetry = Telemetry;

})(window);
