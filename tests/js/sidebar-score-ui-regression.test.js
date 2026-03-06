/* global describe, test, expect */
const fs = require('fs');
const path = require('path');

describe('sidebar score UI regression guard', () => {
    test('hero score UI hides denominator and keeps centered last run row', () => {
        const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        expect(source).toContain("createElement('span', null, `AEO ${aeo}`)");
        expect(source).toContain("createElement('span', null, `GEO ${geo}`)");
        expect(source).toContain("`Last run: ${lastRun}`");
        expect(source).not.toContain('/ 55');
        expect(source).not.toContain('/ 45');
        expect(source).not.toContain('Inline highlight legend');
    });
});
