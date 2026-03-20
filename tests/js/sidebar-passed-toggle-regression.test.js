/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('sidebar passed-toggle regression guard', () => {
    test('reads raw checks from result.checks with fallback to checks', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain('const rawChecksPayload = rawReport && (rawReport.result?.checks || rawReport.checks);');
        expect(source).toContain('const rawChecksArray = Array.isArray(rawChecksPayload)');
        expect(source).toContain('Object.entries(rawChecksPayload).map(([key, val]) => ({ ...val, id: key }))');
        expect(source).toContain("const category = resolveCanonicalCategoryName(safeId, c.category);");
    });

    test('uses canonical check_id map and clears stale raw analysis across runs', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain("const canonicalCategoryMap = (config && typeof config.checkCategoryMap === 'object' && config.checkCategoryMap) ? config.checkCategoryMap : {};");
        expect(source).toContain('function resolveCanonicalCategoryName(checkId, fallbackCategory)');
        expect((source.match(/setRawAnalysis\(null\);/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});
