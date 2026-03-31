/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay fix assist regression guard', () => {
    test('emits the core Fix Assist telemetry events through the highlight telemetry bridge', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_panel_seen'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_help_requested'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_variants_generated'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_variant_copied'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_keep_as_is_selected'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_generation_failed'");
    });

    test('keeps free guidance actions separate from billable generation actions', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');
        const variantsStart = source.indexOf('const variantsBtn = state.contextDoc.createElement(\'button\');');
        const keepStart = source.indexOf('const keepBtn = state.contextDoc.createElement(\'button\');');
        const handleInlineFixStart = source.indexOf('async function handleInlineFix(item, panel, rewriteContextArg) {');
        const requestVariantsStart = source.indexOf('async function requestFixAssistVariants(item, statusEl, rewriteContextArg, source, verificationIntentArg) {');
        const variantsSection = source.slice(variantsStart, keepStart);
        const handleInlineFixSection = source.slice(handleInlineFixStart, requestVariantsStart);

        expect(variantsSection).toContain("emitFixAssistTelemetry('overlay_fix_assist_help_requested'");
        expect(variantsSection).toContain('beginFixAssistVariantRequestFlow(');
        expect(handleInlineFixSection).toContain("request_kind: 'variants'");
    });

    test('locks copy-only variant acceptance and keeps panel-seen telemetry deduplicated per issue', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('fixAssistSeenIssueKeys: new Set()');
        expect(source).toContain('state.fixAssistSeenIssueKeys = new Set();');
        expect(source).toContain('function maybeEmitFixAssistPanelSeen(issueLike, source) {');
        expect(source).toContain('if (state.fixAssistSeenIssueKeys.has(issueLike.key)) return;');
        expect(source).toContain('function normalizeFixAssistVariantText(text, rewriteTarget) {');
        expect(source).toContain("container.querySelectorAll('li')");
        expect(source).toContain("vtext.textContent = normalizeFixAssistVariantText(variant.text || '', info.rewrite_target || null);");
        expect(source).toContain("const text = normalizeFixAssistVariantText(variant.text || '', info.rewrite_target || null);");
        expect(source).toContain("copyBtn.textContent = 'Copy variant';");
        expect(source).toContain("setMetaStatus('Copied revised text. Paste it into the matching WordPress block, then review and update the post.');");
        expect(source).not.toContain("info.status = 'Applied in editor';");
    });

    test('prefers local article context for repair targeting before falling back to analyzer rewrite hints', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function collectIssueSearchTexts(item, repairIntent) {');
        expect(source).toContain('function resolveLocalRepairAnchorIndex(nodes, anchorIndex, sectionBounds) {');
        expect(source).toContain('function buildLocalRewriteContextFromIssue(item, meta) {');
        expect(source).toContain('item && item.analyzerNote,');
        expect(source).not.toContain('item && item.review_summary,');
        expect(source).toContain("item && item.resolvedNodeSource !== 'signature_hint' ? item.resolvedNodeRef : ''");
        expect(source).toContain("if (anchorIndex >= 0) locatorSource = 'issue_note_search';");
        expect(source).toContain("locatorSource = 'analyzer_hint';");
        expect(source).toContain("resolver_reason: locatorSource === 'live_node_ref'");
        expect(source).toContain("resolver_reason: locatorSource === 'live_node_ref'\n                    ? 'ui_local_issue_context_node_ref'");
        expect(source).toContain("? 'ui_local_issue_context_search'");
        expect(source).toContain(": 'ui_analyzer_hint_fallback'");
        expect(source).toContain('item.resolvedNodeSource = refSource || \'\';');
        expect(source).toContain('const localContext = buildLocalRewriteContextFromIssue(item, {');
        expect(source).toContain('if (localContext && localContext.rewrite_target) {');
        expect(source.indexOf('const localContext = buildLocalRewriteContextFromIssue(item, {')).toBeLessThan(source.indexOf('} else if (resolvedTarget) {'));
    });

    test('sends a dedicated copilot issue packet with preserved analyzer-led framing for generation', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildCopilotIssuePacket(item, rewriteContext, blocks, manifest) {');
        expect(source).toContain('const analyzerNote = resolveCopilotAnalyzerNote(item, issueDisplayName, explanationPack);');
        expect(source).toContain('analyzer_note: analyzerNote.slice(0, 500),');
        expect(source).toContain('message: summaryText.slice(0, 500),');
        expect(source).toContain('payload.copilot_issue = buildCopilotIssuePacket(sourceItem, rewriteContext, blocks, manifest);');
        expect(source).toContain('payload.issue_context = payload.copilot_issue;');
    });

    test('prefers preserved extractability explanations for rail summaries and copilot notes', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const ANSWER_EXTRACTABILITY_CHECK_IDS = new Set([');
        expect(source).toContain('function resolvePreferredIssueSummaryText(issueLike, explanationPack, issueDisplayName) {');
        expect(source).toContain('if (isAnswerExtractabilityIssue(issueLike) && explanationPack && explanationPack.what_failed) {');
        expect(source).toContain('issueLike.issue_explanation,');
        expect(source).toContain('explanationPack && explanationPack.issue_explanation,');
        expect(source).toContain('explanationPack && explanationPack.what_failed,');
        expect(source).toContain('const summaryText = resolvePreferredIssueSummaryText(issue, explanationPack, issueDisplayName)');
        expect(source).toContain('const summaryText = resolvePreferredIssueSummaryText(item, explanationPack, issueDisplayName)');
        expect(source).not.toContain('question heading');
    });

    test('maps the selected review-rail issue to a stable canonical copilot source item', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('fixAssistSourceItemMap: null,');
        expect(source).toContain('function buildCanonicalFixAssistSourceKey(issue, fallbackIndex) {');
        expect(source).toContain('sourceKey: sourceKey || issueKey,');
        expect(source).toContain('sourceKey: String(item.copilot_source_key || item.source_issue_key || item.issue_key || issueKey).trim(),');
        expect(source).toContain('const sourceMap = state.fixAssistSourceItemMap instanceof Map ? state.fixAssistSourceItemMap : null;');
        expect(source).toContain('if (sourceMap && key && sourceMap.has(key)) {');
        expect(source).toContain('state.fixAssistSourceItemMap = new Map();');
        expect(source).toContain('state.fixAssistSourceItemMap.set(canonicalKey, item);');
        expect(source).toContain('merged.copilot_source_key = String(issue.copilot_source_key || canonicalSourceKey || \'\').trim() || merged.issue_key;');
    });

    test('realigns copilot gating around local availability instead of stale rewrite-target snapshots', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function resolveFixAssistSourceItem(issueLike) {');
        expect(source).toContain('function buildFixAssistAvailability(issueLike, rewriteContextArg, sourceItemArg) {');
        expect(source).toContain('const availability = buildFixAssistAvailability(issue);');
        expect(source).toContain('const sourceItem = availability && availability.sourceItem ? availability.sourceItem : resolveFixAssistSourceItem(item);');
        expect(source).toContain('availability.variantsAllowed === true');
        expect(source).toContain("reason: 'local_issue_context_unavailable'");
        expect(source).not.toContain('This issue is guidance-only right now. AiVI does not yet have a safe block-local rewrite target for variants.');
        expect(source).toContain('This section still needs clearer local grounding before Copilot should draft variants. Open the issue details or jump to the related block, and Copilot will stay tightly scoped there.');
        expect(source).not.toContain('AiVI needs clearer local grounding before it can suggest variants for this issue.');
    });

    test('preserves Copilot mode routing so schema and evidence issues do not read like generic rewrites', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("copilot_mode: 'local_rewrite'");
        expect(source).toContain("copilot_mode: actionable ? 'local_rewrite' : 'limited_technical_guidance'");
        expect(source).toContain("const copilotMode = triage && typeof triage === 'object'");
        expect(source).toContain("const requiresWebConsent = !!(triage && typeof triage === 'object' && triage.requires_web_consent === true);");
        expect(source).toContain("if (copilotMode === 'schema_metadata_assist') {");
        expect(source).toContain('This needs a metadata or schema fix more than a wording change, so I will keep the next step practical and scoped.');
        expect(source).toContain("if (copilotMode === 'web_backed_evidence_assist' && requiresWebConsent) {");
        expect(source).toContain('I can keep this claim careful, or verify nearby support first if you want stronger source-aware variants.');
        expect(source).toContain('I can keep this claim careful and strengthen the wording using only the nearby text.');
        expect(source).toContain('This one needs a technical or settings-level fix more than a wording pass, so I will keep the help practical.');
        expect(source).not.toContain('This issue is better handled with schema assistance than a plain text rewrite.');
        expect(source).not.toContain('This issue is about support and verifiability. Copilot will treat it as evidence assist rather than a plain rewrite.');
    });

    test('separates helper, consent, and variants into distinct popover modes', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function resolveFixAssistDisplayMode(options) {');
        expect(source).toContain("if (source.requiresConsentPrompt === true) return 'consent';");
        expect(source).toContain("if (source.hasVariants === true) return 'variants';");
        expect(source).toContain("return 'helper';");
        expect(source).toContain('const displayMode = resolveFixAssistDisplayMode({');
        expect(source).toContain("if (displayMode === 'helper' && helperMessage) {");
        expect(source).toContain("if (displayMode === 'consent') {");
        expect(source).toContain("if (displayMode === 'variants' && suggestionInfo && Array.isArray(suggestionInfo.variants) && suggestionInfo.variants.length) {");
        expect(source).not.toContain('if (userNote) {');
        expect(source).not.toContain('if (suggestionInfo && suggestionInfo.status) {');
        expect(source).not.toContain("if (source.isExpanded === true) return 'guidance';");
    });

    test('only surfaces web-verification helper copy when the issue explicitly requires consent', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("if (displayMode === 'consent' && requiresWebConsent) {");
        expect(source).toContain("if (copilotMode === 'web_backed_evidence_assist' && requiresWebConsent) {");
        expect(source).toContain('Web verification is optional. If you want stronger source-aware variants, Copilot can check only closely related support for this issue.');
        expect(source).toContain('Copilot will stay with this issue and work only from the nearby text.');
        expect(source).toContain('I can keep this claim careful and strengthen the wording using only the nearby text.');
    });

    test('requires explicit consent before web-backed evidence issues can carry a verification intent', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function normalizeFixAssistVerificationIntent(value) {');
        expect(source).toContain('function openFixAssistConsentPrompt(item, rewriteContextArg) {');
        expect(source).toContain("consent_required: true");
        expect(source).toContain("verification_intent: ''");
        expect(source).toContain("verificationIntent === 'verify_first'");
        expect(source).toContain("payload.verification_intent = verificationIntent;");
        expect(source).not.toContain("request_kind: 'web_search'");
    });

    test('preserves consent intent through request preparation and dispatch for both verify-first and stay-local flows', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_request_prepare'");
        expect(source).toContain("emitFixAssistTelemetry('overlay_fix_assist_request_dispatch'");
        expect(source).toContain("request_kind: 'verify_first'");
        expect(source).toContain("request_kind: 'local_only'");
        expect(source).toContain("payload.verification_intent = verificationIntent;");
        expect(source).toContain('payload.options = {');
        expect(source).toContain('verification_intent: verificationIntent');
        expect(source).toContain("request_kind: verificationIntent || 'variants'");
        expect(source).toContain("verification_intent: verificationIntent || ''");
        expect(source.indexOf("emitFixAssistTelemetry('overlay_fix_assist_request_prepare'")).toBeLessThan(
            source.indexOf("emitFixAssistTelemetry('overlay_fix_assist_request_dispatch'")
        );
        expect(source.indexOf("emitFixAssistTelemetry('overlay_fix_assist_request_dispatch'")).toBeLessThan(
            source.indexOf("result = await callRest('/rewrite', 'POST', payload);")
        );
    });

    test('stores and summarizes verification outcomes for source-aware variants', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('function buildFixAssistVerificationSummary(info) {');
        expect(source).toContain("AiVI found closely related support and used it carefully while shaping these variants.");
        expect(source).toContain("AiVI did not find verifiable support close to this claim. These variants keep the wording measured and avoid unsupported certainty.");
        expect(source).toContain("AiVI could not complete web verification just now, so these variants stay local and carefully framed.");
        expect(source).toContain("AiVI kept this pass local and framed the variants without web verification.");
        expect(source).not.toContain("AiVI could not find verifiable support closely tied to this claim, so these variants narrow the wording and avoid unsupported certainty.");
        expect(source).not.toContain("AiVI could not complete web verification for this request, so these variants stay local and cautious.");
        expect(source).toContain('verification_result: result.data.verification_result || null');
        expect(source).toContain('verification_status: state.suggestions[issueKey].verification_result');
        expect(source).toContain('verification_provider: state.suggestions[issueKey].verification_result');
    });

    test('clears Copilot-owned rail status when the panel closes without wiping general editor status', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain("metaStatusSource: ''");
        expect(source).toContain("function setFixAssistMetaStatus(text) {");
        expect(source).toContain("setMetaStatus(text, 'fix_assist');");
        expect(source).toContain("function clearFixAssistMetaStatus() {");
        expect(source).toContain("if (state.metaStatusSource === 'fix_assist') {");
        expect(source).toContain("setFixAssistOpenIssueKey('', 'outside_dismiss');");
        expect(source).toContain("clearFixAssistMetaStatus();");
        expect(source).toContain("function setMetaStatus(text, source) {");
        expect(source).toContain("state.metaStatusSource = state.metaStatus");
        expect(source).toContain("? (typeof source === 'string' && source ? source : 'general')");
    });
});
