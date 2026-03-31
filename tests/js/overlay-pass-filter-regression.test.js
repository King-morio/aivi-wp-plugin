/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('overlay pass-filter regression guard', () => {
    test('extractIssuesFromReport filters pass verdicts before building highlight items', () => {
        const overlayPath = path.resolve(__dirname, '../../assets/js/aivi-overlay-editor.js');
        const source = fs.readFileSync(overlayPath, 'utf8');

        expect(source).toContain('const isHighlightableVerdict = (source) => {');
        expect(source).toContain('if (!isHighlightableVerdict(issue)) return;');
        expect(source).toContain('if (!isHighlightableVerdict(c)) return;');
        expect(source).toContain('function stripPassHighlightSpans(root, summaryVerdictMap)');
        expect(source).toContain('const removedPassSpans = stripPassHighlightSpans(');
        expect(source).toContain('renderReviewRail(collectOverlayRecommendations(state.overlayContentData));');
        expect(source).toContain('function sanitizeInlineIssueMessage(message, check)');
        expect(source).toContain('const message = sanitizeInlineIssueMessage(');
        expect(source).toContain('const sanitizedMessage = sanitizeInlineIssueMessage(');
        expect(source).toContain('function shouldSuppressInlineRange(text, highlight, range)');
        expect(source).toContain("registerInlineSuppressedRecommendation(item, 'client_guardrail_overwide_inline')");
        expect(source).toContain("registerInlineSuppressedRecommendation(item, 'client_guardrail_no_anchor')");
        expect(source).toContain('resetInlineSuppressedRecommendations();');
        expect(source).toContain("const syntheticReasons = new Set([");
        expect(source).toContain("if (syntheticReasons.has(normalizedFailureReason)) return false;");
        expect(source).toContain('const actionableByKey = new Map();');
        expect(source).toContain('const mergeReviewRailIssue = (issue, actionableIssue) => {');
        expect(source).toContain('const source = recommendationFallback.length');
        expect(source).toContain('? recommendationFallback');
        expect(source).toContain(': actionableFindings;');
        expect(source).toContain('function humanizeCheckIdentifier(value) {');
        expect(source).toContain('function resolveIssueDisplayName(issueLike) {');
        expect(source).toContain("name.textContent = resolveIssueDisplayName(issue);");
        expect(source).toContain('checkName: issueDisplayName,');
        expect(source).not.toContain("issue && issue.check_name ? issue.check_name : 'Untitled issue'");
        expect(source).toContain("issue_explanation: issue.issue_explanation || ''");
        expect(source).toContain("review_summary: normalizeText(issue.review_summary || '')");
        expect(source).toContain('function resolveRecommendationDetailText(issue, explanationPack, summaryText)');
        expect(source).toContain('function buildGuidanceTextNode(text, extraClass)');
        expect(source).toContain("details.hidden = true;");
        expect(source).toContain("details.hidden = nextHidden;");
        expect(source).toContain("preferredSummary || issue.message || ''");
        expect(source).toContain('const detailText = resolveRecommendationDetailText(issue, explanationPack, summaryText);');
        expect(source).toContain("buildGuidanceTextNode(detailText, 'aivi-overlay-guidance-recommendation')");
        expect(source).toContain('const schemaAssistNode = buildReviewRailSchemaAssistNode(issue);');
        expect(source).toContain('if (schemaAssistNode) {');
        expect(source).toContain('const metadataNode = buildReviewRailMetadataNode(issue);');
        expect(source).toContain('if (metadataNode) {');
        expect(source).toContain('if (areGuidanceTextsEquivalent(fallback, summaryText)) return \'\';');
        expect(source).toContain('if (!hasReviewDetails) {');
        expect(source).toContain('if (!hasRecommendationDetails) {');
        expect(source).not.toContain("issue.rationale || issue.message || ''");
        expect(source).not.toContain("details.style.display = 'flex'");
        expect(source).toContain('function buildReviewRailSchemaAssistNode(item) {');
        expect(source).toContain('function buildReviewRailMetadataNode(item) {');
        expect(source).not.toContain('function buildMetadataDetailsPanel(issue)');
        expect(source).not.toMatch(/if\\s*\\(highlight\\.node_ref\\s*\\|\\|\\s*highlight\\.signature\\)\\s*\\{\\s*return \\[\\{ start: 0, end: text\\.length \\}\\];\\s*\\}/);
    });
});
