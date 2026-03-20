/**
 * AiVI Editor Highlights - Proof of Concept
 * Grammarly-style inline highlights for WordPress editor
 */

(function () {
    'use strict';
    const highlightConfig = (typeof window !== 'undefined' && window.AIVI_CONFIG) ? window.AIVI_CONFIG : {};
    const highlightPriority = Array.isArray(highlightConfig.aiHighlightSourcePriority)
        ? highlightConfig.aiHighlightSourcePriority
        : [];
    if (highlightPriority.length === 1 && highlightPriority[0] === 'analyzer') {
        return;
    }

    /**
     * Highlight Manager Class
     */
    class AiVIHighlightManager {
        constructor() {
            this.highlights = new Map(); // checkId -> highlight data
            this.activeHighlight = null;
            this.observer = null;
            this.overlayContainer = null;
            this.init();
        }

        init() {
            this.createOverlayContainer();
            this.setupMutationObserver();
            this.addStyles();
        }

        createOverlayContainer() {
            // Check if Gutenberg uses iframe
            const iframe = document.querySelector('iframe[name="editor-canvas"]') ||
                document.querySelector('.editor-canvas__iframe');

            let targetDocument = document;
            let targetContainer = document.querySelector('.block-editor-writing-flow');

            if (iframe && iframe.contentDocument) {
                targetDocument = iframe.contentDocument;
                targetContainer = iframe.contentDocument.querySelector('.block-editor-writing-flow');
            }

            // Create a container for all highlight overlays
            this.overlayContainer = targetDocument.createElement('div');
            this.overlayContainer.id = 'aivi-highlights-overlay';
            this.overlayContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 999999;
            `;

            // Add to editor area
            if (targetContainer) {
                targetContainer.style.position = 'relative';
                targetContainer.appendChild(this.overlayContainer);
                this.targetDocument = targetDocument;
            }
        }

        setupMutationObserver() {
            // Smart Re-attach: Watch for content changes and re-apply highlights if text is similar
            this.observer = new MutationObserver((mutations) => {
                // Debounce rapid mutations
                if (this._mutationTimeout) clearTimeout(this._mutationTimeout);
                this._mutationTimeout = setTimeout(() => {
                    this.smartReattach(mutations);
                }, 100);
            });

            const targetDocument = this.targetDocument || document;
            const editorContent = targetDocument.querySelector('.block-editor-writing-flow, #content');
            if (editorContent) {
                this.observer.observe(editorContent, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
        }

        /**
         * Smart Re-attach: Reposition or re-attach highlights after DOM changes
         * Only removes highlight if text difference is >= 3 words
         */
        smartReattach() {
            // First, reposition all overlays
            this.repositionAllHighlights();

            // Check each highlight for validity
            const targetDoc = this.targetDocument || document;
            const toRemove = [];

            this.highlights.forEach((data, uniqueId) => {
                const { domElement, overlay, highlight, node } = data;

                // Skip if overlay itself is still in the document (most common case)
                if (overlay && (document.body.contains(overlay) || targetDoc.body?.contains(overlay))) {
                    // Overlay still exists, just reposition
                    return;
                }

                // If the DOM element is no longer in the document AND overlay is gone, try to find it again
                if (!document.body.contains(domElement) && !(targetDoc.body?.contains(domElement))) {
                    // Try to find the new element
                    const newElement = this.findNodeElement(node);
                    if (newElement) {
                        // Check if text is similar (< 3 word difference)
                        const oldText = data.originalText || '';
                        const newText = newElement.textContent || '';
                        const wordDiff = this.countWordDifference(oldText, newText);

                        if (wordDiff < 3) {
                            // Re-attach highlight to new element
                            data.domElement = newElement;
                            this.positionOverlay(overlay, newElement, highlight);
                            this.highlightText(newElement, highlight);
                            data.originalText = newText; // Update original text
                        } else {
                            // Text changed significantly, mark for removal
                            toRemove.push(uniqueId);
                        }
                    } else {
                        // Element not found, mark for removal
                        toRemove.push(uniqueId);
                    }
                }
            });

            // Remove marked highlights
            toRemove.forEach(id => this.removeHighlight(id));
        }

        /**
         * Count word difference between two strings (simple Levenshtein-like)
         */
        countWordDifference(str1, str2) {
            const words1 = (str1 || '').toLowerCase().split(/\s+/).filter(w => w.length > 0);
            const words2 = (str2 || '').toLowerCase().split(/\s+/).filter(w => w.length > 0);

            // Simple set difference approach
            const set1 = new Set(words1);
            const set2 = new Set(words2);

            let diff = 0;
            // Count words in str1 not in str2
            for (const word of words1) {
                if (!set2.has(word)) diff++;
            }
            // Count words in str2 not in str1
            for (const word of words2) {
                if (!set1.has(word)) diff++;
            }

            return diff;
        }

        /**
         * Remove a specific highlight
         */
        removeHighlight(uniqueId) {
            const data = this.highlights.get(uniqueId);
            if (!data) return;

            if (data.overlay && data.overlay.parentNode) {
                data.overlay.parentNode.removeChild(data.overlay);
            }
            if (data.spans) {
                data.spans.forEach(span => {
                    if (span.parentNode) {
                        // Unwrap the span, preserving text
                        const text = document.createTextNode(span.textContent);
                        span.parentNode.replaceChild(text, span);
                    }
                });
            }
            this.highlights.delete(uniqueId);
        }

        addStyles() {
            const targetDocument = this.targetDocument || document;
            const style = targetDocument.createElement('style');
            style.textContent = `
                .aivi-highlight {
                    background-color: rgba(37, 99, 235, 0.15); /* Default Blue (Partial) */
                    border-radius: 3px;
                    border-bottom: none !important;
                    text-decoration: none !important;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    mix-blend-mode: multiply;
                }

                .aivi-highlight[data-verdict="fail"] {
                    background-color: rgba(239, 68, 68, 0.15); /* #ef4444 with 0.15 opacity */
                }

                .aivi-highlight[data-verdict="pass"] {
                    background-color: rgba(16, 185, 129, 0.15); /* #10b981 with 0.15 opacity */
                }

                .aivi-highlight[data-verdict="partial"] {
                     background-color: rgba(245, 158, 11, 0.15); /* #f59e0b with 0.15 opacity (Warning/Partial) */
                }

                .aivi-highlight:hover {
                    background-color: rgba(37, 99, 235, 0.25);
                }

                .aivi-highlight[data-verdict="fail"]:hover {
                    background-color: rgba(239, 68, 68, 0.25);
                }

                .aivi-highlight[data-verdict="pass"]:hover {
                    background-color: rgba(16, 185, 129, 0.25);
                }

                .aivi-highlight[data-verdict="partial"]:hover {
                     background-color: rgba(245, 158, 11, 0.25);
                }

                .aivi-highlight-overlay {
                    position: absolute;
                    pointer-events: auto;
                }

                /* Magic Pill Tooltip Styles */
                .aivi-magic-pill {
                    position: absolute;
                    bottom: calc(100% + 12px);
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 6px 6px 6px 14px;
                    border-radius: 99px;
                    font-size: 12px;
                    font-weight: 500;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    backdrop-filter: blur(8px);
                    color: #374151;
                    z-index: 1000000;
                    animation: aivi-float 3s ease-in-out infinite;
                    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    max-width: 400px;
                }

                .aivi-magic-pill:hover {
                    box-shadow: 0 15px 30px -10px rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                    padding-right: 14px;
                    max-width: 600px;
                }

                @keyframes aivi-float {
                    0%, 100% { transform: translateX(-50%) translateY(0); }
                    50% { transform: translateX(-50%) translateY(-4px); }
                }

                .aivi-pill-text {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 180px;
                    transition: max-width 0.4s ease;
                }

                .aivi-magic-pill:hover .aivi-pill-text {
                    max-width: 400px;
                    white-space: normal;
                }

                .aivi-pill-action {
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
                }

                .aivi-pill-action:hover {
                    transform: scale(1.02);
                }
            `;
            targetDocument.head.appendChild(style);
        }

        /**
         * Add highlights based on manifest and checks
         */
        addHighlights(manifest, checks) {
            // Clear existing highlights
            this.clearHighlights();

            // Process each check
            checks.forEach((check, index) => {
                if (check.verdict === 'pass' || !check.highlights) return;

                check.highlights.forEach((highlight, hIndex) => {
                    const nodeId = highlight.node_ref;
                    const node = manifest.nodes.find(n => n.node_id === nodeId);

                    if (node) {
                        this.createHighlight(check, highlight, node, `${index}-${hIndex}`);
                    }
                });
            });
        }

        createHighlight(check, highlight, node, uniqueId) {
            // Find the DOM element for this node
            const domElement = this.findNodeElement(node);
            if (!domElement) return;

            const targetDocument = this.targetDocument || document;

            // Create highlight overlay
            const overlay = targetDocument.createElement('div');
            overlay.className = 'aivi-highlight-overlay';
            overlay.dataset.checkId = check.id;
            overlay.dataset.uniqueId = uniqueId;

            // Create Magic Pill tooltip
            const pill = targetDocument.createElement('div');
            pill.className = 'aivi-magic-pill';
            pill.style.display = 'none';

            // Choose icon based on verdict
            let icon = '⚠️';
            if (check.verdict === 'fail') icon = '❌';
            else if (check.verdict === 'pass') icon = '✅';

            // Short message (title only for pill)
            const shortMessage = check.title || check.id;

            pill.innerHTML = `
                <span class="aivi-pill-icon" style="font-size: 14px; flex-shrink: 0;">${icon}</span>
                <span class="aivi-pill-text">${shortMessage}</span>
                <span class="aivi-pill-separator" style="width: 1px; height: 16px; opacity: 0.15; background: #000; flex-shrink: 0;"></span>
                <button class="aivi-pill-action">✨ Fix with AI</button>
            `;

            // Position overlay
            this.positionOverlay(overlay, domElement, highlight);
            overlay.appendChild(pill);

            // Attach rewrite button handler
            const rewriteBtn = pill.querySelector('.aivi-pill-action');
            if (rewriteBtn) {
                rewriteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.handleRewrite(check, node);
                };
            }

            // Add to container
            this.overlayContainer.appendChild(overlay);

            // Store reference (including originalText for Smart Re-attach)
            this.highlights.set(uniqueId, {
                check,
                highlight,
                node,
                overlay,
                domElement,
                originalText: domElement.textContent || ''
            });

            // Highlight the actual text (temporary - will be replaced by better approach)
            this.highlightText(domElement, highlight);

            // Hybrid: hover shows pill, click locks it open, click outside closes
            let pillLocked = false;

            // Hover to show (unless locked)
            overlay.addEventListener('mouseenter', () => {
                pill.style.display = 'flex';
            });

            overlay.addEventListener('mouseleave', () => {
                if (!pillLocked) {
                    pill.style.display = 'none';
                }
            });

            // Click to lock/unlock
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                pillLocked = !pillLocked;
                pill.style.display = 'flex'; // Always show on click
                if (pillLocked) {
                    this._activePill = pill;
                    this._activeOverlay = overlay;
                    this._unlockPill = () => { pillLocked = false; };
                }
            });

            // Click outside closes pill (one-time setup per document)
            const targetDoc = this.targetDocument || document;
            if (!targetDoc._aiviClickOutsideSetup) {
                targetDoc._aiviClickOutsideSetup = true;
                targetDoc.addEventListener('click', (e) => {
                    if (this._activePill && !this._activeOverlay?.contains(e.target)) {
                        this._activePill.style.display = 'none';
                        if (this._unlockPill) this._unlockPill();
                        this._activePill = null;
                        this._activeOverlay = null;
                        this._unlockPill = null;
                    }
                });
            }
        }

        findNodeElement(node) {
            const targetDocument = this.targetDocument || document;

            // Try different selectors to find the element
            const selectors = [
                `[data-block="${node.id}"]`,
                `[data-node="${node.id}"]`,
                `#${node.id}`,
                `.node-${node.id}`
            ];

            for (const selector of selectors) {
                const element = targetDocument.querySelector(selector);
                if (element) return element;
            }

            // Fallback: try to find element containing the text
            const allElements = targetDocument.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
            for (const element of allElements) {
                if (element.textContent && element.textContent.includes(node.text)) {
                    return element;
                }
            }

            return null;
        }

        positionOverlay(overlay, domElement, highlight) {
            const targetDocument = this.targetDocument || document;
            const containerRect = this.overlayContainer.parentElement.getBoundingClientRect();
            const totalLength = domElement.textContent ? domElement.textContent.length : 0;
            const startOffset = typeof highlight.start_offset === 'number' ? highlight.start_offset : 0;
            const endOffset = typeof highlight.end_offset === 'number' ? highlight.end_offset : totalLength;

            function computeRectsForOffsets(element, start, end) {
                if (!element) return [];
                const clampedStart = Math.max(0, Math.min(start, totalLength));
                const clampedEnd = Math.max(clampedStart, Math.min(end, totalLength));

                const range = targetDocument.createRange();
                const walker = targetDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                let currentNode = walker.nextNode();
                let currentOffset = 0;
                let startNode = null;
                let endNode = null;
                let startInNode = 0;
                let endInNode = 0;

                while (currentNode) {
                    const textLength = currentNode.textContent.length;
                    if (startNode === null && clampedStart >= currentOffset && clampedStart <= currentOffset + textLength) {
                        startNode = currentNode;
                        startInNode = clampedStart - currentOffset;
                    }
                    if (endNode === null && clampedEnd >= currentOffset && clampedEnd <= currentOffset + textLength) {
                        endNode = currentNode;
                        endInNode = clampedEnd - currentOffset;
                        break;
                    }
                    currentOffset += textLength;
                    currentNode = walker.nextNode();
                }

                if (!startNode || !endNode) {
                    return Array.prototype.slice.call(element.getClientRects());
                }

                range.setStart(startNode, Math.max(0, Math.min(startInNode, startNode.textContent.length)));
                range.setEnd(endNode, Math.max(0, Math.min(endInNode, endNode.textContent.length)));
                const rects = range.getClientRects();
                if (!rects || rects.length === 0) {
                    return Array.prototype.slice.call(element.getClientRects());
                }
                return Array.prototype.slice.call(rects);
            }

            let rects;
            try {
                rects = computeRectsForOffsets(domElement, startOffset, endOffset);
            } catch (e) {
                rects = Array.prototype.slice.call(domElement.getClientRects());
            }

            if (!rects || rects.length === 0) {
                const fallbackRect = domElement.getBoundingClientRect();
                overlay.style.cssText = [
                    'position:absolute',
                    'left:' + (fallbackRect.left - containerRect.left) + 'px',
                    'top:' + (fallbackRect.top - containerRect.top) + 'px',
                    'width:' + fallbackRect.width + 'px',
                    'height:' + fallbackRect.height + 'px',
                    'pointer-events:auto'
                ].join(';');
                return;
            }

            const rect = rects[0];
            overlay.style.cssText = [
                'position:absolute',
                'left:' + (rect.left - containerRect.left) + 'px',
                'top:' + (rect.top - containerRect.top) + 'px',
                'width:' + rect.width + 'px',
                'height:' + rect.height + 'px',
                'pointer-events:auto'
            ].join(';');
        }

        highlightText(element, highlight) {
            const totalLength = element.textContent ? element.textContent.length : 0;
            const startOffset = typeof highlight.start_offset === 'number' ? highlight.start_offset : 0;
            const endOffset = typeof highlight.end_offset === 'number' ? highlight.end_offset : totalLength;

            const targetDocument = this.targetDocument || document;
            const range = targetDocument.createRange();
            const walker = targetDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let currentNode = walker.nextNode();
            let currentOffset = 0;
            let startNode = null;
            let endNode = null;
            let startInNode = 0;
            let endInNode = 0;

            while (currentNode) {
                const textLength = currentNode.textContent.length;
                if (startNode === null && startOffset >= currentOffset && startOffset <= currentOffset + textLength) {
                    startNode = currentNode;
                    startInNode = startOffset - currentOffset;
                }
                if (endNode === null && endOffset >= currentOffset && endOffset <= currentOffset + textLength) {
                    endNode = currentNode;
                    endInNode = endOffset - currentOffset;
                    break;
                }
                currentOffset += textLength;
                currentNode = walker.nextNode();
            }

            if (!startNode || !endNode) {
                element.classList.add('aivi-highlight');
                const existing = this.highlights.get(element) || { overlay: null, domElement: element, spans: [] };
                this.highlights.set(element, existing);
                return;
            }

            range.setStart(startNode, Math.max(0, Math.min(startInNode, startNode.textContent.length)));
            range.setEnd(endNode, Math.max(0, Math.min(endInNode, endNode.textContent.length)));

            const span = targetDocument.createElement('span');
            span.className = 'aivi-highlight';
            try {
                range.surroundContents(span);
            } catch (e) {
                element.classList.add('aivi-highlight');
                const existing = this.highlights.get(element) || { overlay: null, domElement: element, spans: [] };
                this.highlights.set(element, existing);
                return;
            }

            const record = this.highlights.get(element) || { overlay: null, domElement: element, spans: [] };
            record.spans = record.spans || [];
            record.spans.push(span);
            this.highlights.set(element, record);
        }

        handleRewrite(check, node) {
            // Trigger rewrite modal
            // This will be connected to the main sidebar component
            window.dispatchEvent(new CustomEvent('aivi:rewrite', {
                detail: { check, node }
            }));
        }

        clearHighlights() {
            this.highlights.forEach(record => {
                if (record.overlay) {
                    if (record.overlay.remove) {
                        record.overlay.remove();
                    }
                }
                if (record.spans && record.spans.length) {
                    record.spans.forEach(span => {
                        const parent = span.parentNode;
                        if (!parent) return;
                        while (span.firstChild) {
                            parent.insertBefore(span.firstChild, span);
                        }
                        parent.removeChild(span);
                    });
                }
                if (record.domElement) {
                    record.domElement.classList.remove('aivi-highlight');
                }
            });
            this.highlights.clear();
        }

        repositionAllHighlights() {
            // Reposition all highlights after content changes
            this.highlights.forEach(({ highlight, overlay, domElement }) => {
                if (domElement) {
                    this.positionOverlay(overlay, domElement, highlight);
                }
            });
        }

        focusHighlight(checkId) {
            // Find and focus on a specific highlight
            this.highlights.forEach(({ check, overlay, domElement }) => {
                if (check.id === checkId && domElement) {
                    // Scroll element into view
                    domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Temporarily highlight with a pulse effect
                    overlay.style.transition = 'none';
                    overlay.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.5)';

                    setTimeout(() => {
                        overlay.style.transition = 'all 0.3s ease';
                        overlay.style.boxShadow = '';
                    }, 1000);
                }
            });
        }

        destroy() {
            if (this.observer) {
                this.observer.disconnect();
            }
            this.clearHighlights();
            if (this.overlayContainer) {
                this.overlayContainer.remove();
            }
        }
    }

    // Initialize highlight manager
    let highlightManager = null;

    // Initialize when DOM is ready
    function init() {
        if (highlightManager) {
            highlightManager.destroy();
        }
        highlightManager = new AiVIHighlightManager();
    }

    // Wait for editor to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Try to initialize immediately
        setTimeout(init, 100);
    }

    // Expose for external use
    window.AiVIHighlights = {
        addHighlights: (manifest, checks) => {
            if (highlightManager) {
                highlightManager.addHighlights(manifest, checks);
            }
        },
        clearHighlights: () => {
            if (highlightManager) {
                highlightManager.clearHighlights();
            }
        },
        focusHighlight: (checkId) => {
            if (highlightManager) {
                highlightManager.focusHighlight(checkId);
            }
        }
    };

})();
