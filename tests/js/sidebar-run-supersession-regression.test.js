const fs = require('fs');
const path = require('path');

describe('sidebar run supersession regression', () => {
    const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
    const source = fs.readFileSync(sidebarPath, 'utf8');

    test('analysis requests now carry post identity to the backend', () => {
        expect(source).toContain('post_id: post.id || null,');
    });

    test('polling flow switches to the latest run when the backend marks a run superseded', () => {
        expect(source).toContain("case 'superseded':");
        expect(source).toContain("const nextRunId = String(result.data?.superseded_by_run_id || '').trim();");
        expect(source).toContain('currentRunId = nextRunId;');
        expect(source).toContain("setQueueMessage('Switching to the latest analysis run…');");
    });
});
