/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('sidebar score UI regression guard', () => {
    test('hero score UI hides denominator and keeps centered last run row', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain("createElement('span', null, `AEO ${aeo}`)");
        expect(source).toContain("createElement('span', null, `GEO ${geo}`)");
        expect(source).toContain('const scorePill = getGlobalScorePill(score);');
        expect(source).toContain('}, scorePill.label)');
        expect(source).toContain("`Last run: ${lastRun}`");
        expect(source).not.toContain('/ 55');
        expect(source).not.toContain('/ 45');
        expect(source).not.toContain('Inline highlight legend');
    });

    test('sidebar reads only the flat score contract and avoids noisy coverage banners', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('const aeo = normalizeBounded(scores.AEO, 55);');
        expect(source).toContain('const geo = normalizeBounded(scores.GEO, 45);');
        expect(source).toContain('const globalCandidate = scores.GLOBAL;');
        expect(source).not.toContain('scores?.global?.AEO?.score');
        expect(source).not.toContain('scores?.categories?.AEO?.score');
        expect(source).not.toContain('scores.global_score');
        expect(source).not.toContain('AI coverage was incomplete');
        expect(source).not.toContain('missing_ai_checks');
    });

    test('sidebar uses a single global quality pill and banded ring colors', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('function getScoreRingColor(pct) {');
        expect(source).toContain('if (normalizedPct <= 24) return COLORS.failIcon;');
        expect(source).toContain('if (normalizedPct <= 49) return COLORS.partialIcon;');
        expect(source).toContain('if (normalizedPct <= 74) return COLORS.passIcon;');
        expect(source).toContain('return COLORS.inlinePass;');
        expect(source).toContain('function getGlobalScorePill(score) {');
        expect(source).toContain("label: 'Fair'");
        expect(source).toContain("label: 'Good'");
        expect(source).toContain("label: 'Excellent'");
        expect(source).toContain('const color = getScoreRingColor(pct);');
        expect(source).not.toContain('ring-quality');
    });

    test('sidebar issue rows stay verdict-oriented and do not show overlay impact tiers', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('function getIssueVerdictPresentation(issue) {');
        expect(source).toContain("label: 'Fail'");
        expect(source).toContain("label: 'Partial'");
        expect(source).toContain("label: 'Pass'");
        expect(source).toContain('const verdictPill = getIssueVerdictPresentation(issue);');
        expect(source).not.toContain("label: 'High impact'");
        expect(source).not.toContain("label: 'Recommended'");
        expect(source).not.toContain("label: 'Polish'");
        expect(source).not.toContain("}, 'Needs review'),");
    });

    test('sidebar can enrich summary issues with aligned raw impact signals when available', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('const rawCheckIndex = new Map();');
        expect(source).toContain('const rawCheck = rawCheckIndex.get(issueCheckId);');
        expect(source).toContain('severity: normalizeIssuePriorityToken(');
        expect(source).toContain('impact: normalizeIssuePriorityToken(');
    });

    test('analysis progress shell includes the calm duration note and non-overlapping flex layout', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain("const durationNote = 'Most analyses finish in about 4-5 minutes.';");
        expect(source).toContain('function getAnalysisStartPills(phase) {');
        expect(source).toContain('function getAnalysisStartFooterCopy(phase) {');
        expect(source).toContain("createElement('div', { className: 'aivi-analysis-preflight-meta' }, `${elapsed}s elapsed`)");
        expect(source).toContain("createElement('div', { className: 'aivi-analysis-pill-strip' },");
        expect(source).toContain("className: 'aivi-analysis-pill'");
        expect(source).toContain("createElement('span', { className: 'aivi-analysis-footer-subtle' }, startFooterCopy)");
        expect(source).toContain("createElement('span', { className: 'aivi-analysis-note' }, durationNote)");
        expect(source).not.toContain('const footerMessage =');
        expect(source).not.toContain("createElement('span', { className: 'aivi-muted' }, footerMessage)");
        expect(source).toContain('display: flex;');
        expect(source).toContain('flex-direction: column;');
        expect(source).toContain('overflow: auto;');
    });

    test('analysis progress shell uses the approved restrained edge glow treatment', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('.aivi-analysis-banner::before,');
        expect(source).toContain('.aivi-analysis-banner::after {');
        expect(source).toContain('box-shadow: 0 0 10px rgba(87,214,255,.16);');
        expect(source).toContain('.aivi-analysis-log-row::before,');
        expect(source).toContain('.aivi-analysis-log-row::after {');
        expect(source).toContain('box-shadow: 0 0 8px rgba(87,214,255,.1);');
        expect(source).toContain('.aivi-analysis-log-row.is-live::before,');
        expect(source).toContain('.aivi-analysis-log-row.is-live::after {');
    });
});
