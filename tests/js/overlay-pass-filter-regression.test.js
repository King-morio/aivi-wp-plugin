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
        expect(source).toContain('const recommendations = collectOverlayRecommendations(state.overlayContentData);');
        expect(source).toContain('function sanitizeInlineIssueMessage(message, check)');
        expect(source).toContain('const message = sanitizeInlineIssueMessage(');
        expect(source).toContain('const sanitizedMessage = sanitizeInlineIssueMessage(');
        expect(source).toContain('function shouldSuppressInlineRange(text, highlight, range)');
        expect(source).toContain("registerInlineSuppressedRecommendation(item, 'client_guardrail_overwide_inline')");
        expect(source).toContain("registerInlineSuppressedRecommendation(item, 'client_guardrail_no_anchor')");
        expect(source).toContain('resetInlineSuppressedRecommendations();');
        expect(source).not.toMatch(/if\\s*\\(highlight\\.node_ref\\s*\\|\\|\\s*highlight\\.signature\\)\\s*\\{\\s*return \\[\\{ start: 0, end: text\\.length \\}\\];\\s*\\}/);
    });
});
