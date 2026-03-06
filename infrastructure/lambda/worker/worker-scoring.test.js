global.Request = global.Request || function Request() {};
global.Response = global.Response || function Response() {};
global.Headers = global.Headers || function Headers() {};
global.fetch = global.fetch || jest.fn();

const { __testHooks } = require('./index');

describe('worker scoreChecksForSidebar', () => {
    test('produces non-zero scores when checks pass or partial', () => {
        const checks = {
            direct_answer_first_120: { verdict: 'partial', confidence: 1.0, category: 'AEO' },
            metadata_checks: { verdict: 'pass', confidence: 1.0, category: 'GEO' }
        };

        const scores = __testHooks.scoreChecksForSidebar(checks, { content_type: 'article' }, 'test-run');
        expect(scores.AEO).toBeGreaterThan(0);
        expect(scores.GEO).toBeGreaterThan(0);
        expect(scores.GLOBAL).toBeGreaterThan(0);
    });

    test('keeps score contract shape stable', () => {
        const checks = {
            direct_answer_first_120: { verdict: 'fail', confidence: 1.0, category: 'AEO' },
            metadata_checks: { verdict: 'fail', confidence: 1.0, category: 'GEO' }
        };

        const scores = __testHooks.scoreChecksForSidebar(checks, { content_type: 'article' }, 'test-run');
        expect(scores).toHaveProperty('AEO');
        expect(scores).toHaveProperty('GEO');
        expect(scores).toHaveProperty('GLOBAL');
        expect(typeof scores.AEO).toBe('number');
        expect(typeof scores.GEO).toBe('number');
        expect(typeof scores.GLOBAL).toBe('number');
    });
});
