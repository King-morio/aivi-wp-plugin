/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay redesign regression guard', () => {
    test('surfaces the document title and uses the left review rail as the primary issue navigator', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("rail.className = 'aivi-overlay-review-rail';");
        expect(source).toContain("docTitle.className = 'aivi-overlay-doc-title';");
        expect(source).toContain('function getOverlayDocumentTitle(blocks) {');
        expect(source).toContain('function renderReviewRail(recommendations) {');
        expect(source).toContain("viewport.className = 'aivi-overlay-review-viewport';");
        expect(source).toContain("list.className = 'aivi-overlay-review-list';");
        expect(source).toContain("controls.className = 'aivi-overlay-review-scroll-controls';");
        expect(source).toContain("upButton.setAttribute('data-rail-scroll', 'up');");
        expect(source).toContain("downButton.setAttribute('data-rail-scroll', 'down');");
        expect(source).toContain("closeButton.className = 'aivi-overlay-rail-btn subtle';");
        expect(source).toContain("note.textContent = OVERLAY_EDITOR_PERSISTENCE_NOTE;");
        expect(source).toContain('head.appendChild(closeButton);');
        expect(source).toContain('grid-template-columns:minmax(320px,360px) minmax(0,1fr);');
        expect(source).toContain('width:min(100%,940px);');
        expect(source).not.toContain('state.overlayContent.appendChild(listSection);');
    });

    test('places impact pills in the review rail header instead of the sidebar', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const HIGH_IMPACT_CHECK_IDS = new Set([');
        expect(source).toContain('function buildOverlayImpactPill(issue) {');
        expect(source).toContain("pill.className = 'aivi-overlay-review-impact-pill';");
        expect(source).toContain("pill.textContent = tier === 'high'");
        expect(source).toContain("header.className = 'aivi-overlay-review-item-header';");
        expect(source).toContain('const impactPill = buildOverlayImpactPill(issue);');
    });

    test('uses the contextual right-side block handle and floating block menu instead of the top toolbar', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildBlockHandle(nodeRef, body) {');
        expect(source).toContain("button.className = 'aivi-overlay-block-handle';");
        expect(source).toContain('function buildBlockMenu(nodeRef) {');
        expect(source).toContain("menu.className = 'aivi-overlay-block-menu';");
        expect(source).toContain("state.contextDoc.addEventListener('mousedown', state.blockMenuDismissHandler, true);");
        expect(source).toContain('const menuWidth = 288;');
        expect(source).toContain('position:fixed;width:288px;max-width:calc(100vw - 28px);padding:8px;');
        expect(source).not.toContain('function buildOverlayEditToolbar() {');
    });

    test('adds the rail-attached Fix Assist launcher and anchored bubble without auto-generating variants', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("fixAssist.className = 'aivi-overlay-fix-assist';");
        expect(source).toContain('shell.appendChild(fixAssist);');
        expect(source).toContain('state.overlayFixAssist = fixAssist;');
        expect(source).toContain('function renderFixAssistPanel() {');
        expect(source).toContain("bubble.className = 'aivi-overlay-fix-assist-bubble';");
        expect(source).toContain('function positionFixAssistPanel() {');
        expect(source).toContain('const anchorItem = findFixAssistAnchorItem(issueKey);');
        expect(source).toContain("state.overlayFixAssist.setAttribute('data-placement', 'rail');");
        expect(source).toContain("panel.style.setProperty('--aivi-fix-assist-arrow-left', '36px');");
        expect(source).toContain("launchButton.className = 'aivi-overlay-fix-assist-launch';");
        expect(source).toContain("brandText.textContent = 'Copilot';");
        expect(source).toContain("variantsBtn.textContent = hasVariants ? 'Regenerate variants' : 'Show 3 variants';");
        expect(source).toContain("keepBtn.textContent = 'Keep as is';");
        expect(source).toContain("verifyBtn.textContent = 'Verify first';");
        expect(source).toContain("localBtn.textContent = 'Stay local';");
        expect(source).toContain("cancelBtn.textContent = 'Cancel';");
        expect(source).toContain('function normalizeFixAssistTriage(value, availability) {');
        expect(source).toContain('function buildFixAssistAvailability(issueLike, rewriteContextArg, sourceItemArg) {');
        expect(source).toContain('function shouldRenderFixAssistBadge(triage) {');
        expect(source).toContain('function buildFixAssistRepairObjective(issue, triage, availability) {');
        expect(source).toContain('function buildFixAssistHelperText(issue, triage, availability) {');
        expect(source).toContain('function resolveFixAssistDisplayMode(options) {');
        expect(source).toContain('function buildFixAssistConsentMessage() {');
        expect(source).toContain("helper.className = 'aivi-overlay-fix-assist-helper';");
        expect(source).toContain('aivi-overlay-fix-assist-popover-title');
        expect(source).not.toContain('Why flagged');
        expect(source).toContain("triage.state === 'leave_as_is'");
        expect(source).toContain("triage.state === 'optional_improvement'");
        expect(source).toContain('function syncFixAssistIssueFromNodeRef(nodeRef) {');
        expect(source).toContain("item.classList.toggle('is-fix-assist-active', isActive);");
        expect(source).toContain('function setFixAssistOpenIssueKey(key, source) {');
        expect(source).toContain('const liveAvailability = buildFixAssistAvailability(sourceItem, rewriteContextArg);');
        expect(source).toContain('requestFixAssistVariants(');
        expect(source).toContain('function createFixAssistGenerationRequestId(item) {');
        expect(source).toContain("payload.generation_request_id = generationRequestId;");
        expect(source).toContain("payload.verification_intent = verificationIntent;");
        expect(source).toContain("copyBtn.textContent = 'Copy variant';");
        expect(source).toContain("rejectBtn.textContent = 'Dismiss';");
        expect(source).toContain("variant.label || `Variant ${idx + 1}`");
        expect(source).toContain("confidence.textContent = `${Math.round(Number(variant.confidence) * 100)}%`;");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_panel_seen'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_help_requested'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_variants_generated'");
        expect(source).toContain('.aivi-overlay-fix-assist{');
        expect(source).toContain('.aivi-overlay-fix-assist-bubble{');
        expect(source).toContain('.aivi-overlay-fix-assist-variant-card{');
        expect(source).not.toContain('stage.appendChild(fixAssist);');
        expect(source).not.toContain("const popover = buildFixAssistRailPopover(fixAssistRecord);");
    });

    test('tracks repair scope separately from the anchor when binding Fix Assist issue context', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('rewriteTarget && rewriteTarget.anchor_node_ref');
        expect(source).toContain('rewriteTarget && rewriteTarget.primary_repair_node_ref');
        expect(source).toContain('rewriteTarget && rewriteTarget.section_start_node_ref');
        expect(source).toContain('rewriteTarget && rewriteTarget.boundary_node_ref');
        expect(source).toContain('Array.isArray(rewriteTarget.repair_node_refs)');
        expect(source).toContain('target.primary_repair_node_ref = target.primary_node_ref');
        expect(source).toContain('target.repair_node_refs = Array.isArray(target.node_refs) && target.node_refs.length');
    });
});
