const fs = require('fs');
const path = require('path');

describe('sidebar stale-results reset regression', () => {
    const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
    const source = fs.readFileSync(sidebarPath, 'utf8');

    test('starting a new analysis clears the previous report before preflight begins', () => {
        const analyzingSegment = source.slice(
            source.indexOf("setState('analyzing');"),
            source.indexOf('// Run preflight')
        );

        expect(analyzingSegment).toContain('setReport(null);');
        expect(analyzingSegment).toContain('setOverlayContent(null);');
        expect(analyzingSegment).toContain('setRawAnalysis(null);');
    });
});
