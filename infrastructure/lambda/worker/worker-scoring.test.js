global.Request = global.Request || function Request() {};
global.Response = global.Response || function Response() {};
global.Headers = global.Headers || function Headers() {};
global.fetch = global.fetch || jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({ send: jest.fn() }))
    },
    PutCommand: jest.fn((input) => ({ input })),
    GetCommand: jest.fn((input) => ({ input }))
}), { virtual: true });

const { __testHooks } = require('./index');
const { scoreAnalysisResults } = require('../orchestrator/scoring-engine');
const { performDeterministicChecks } = require('../orchestrator/preflight-handler');
const fs = require('fs');
const path = require('path');

function loadScoringFixture(name) {
    const fixturePath = path.resolve(
        __dirname,
        `../../../fixtures/scoring/${name}`
    );
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('worker scoreChecksForSidebar', () => {
    test('produces non-zero scores when checks pass or partial', () => {
        const checks = {
            immediate_answer_placement: { verdict: 'partial', confidence: 1.0, category: 'AEO' },
            metadata_checks: { verdict: 'pass', confidence: 1.0, category: 'GEO' }
        };

        const scores = __testHooks.scoreChecksForSidebar(checks, { content_type: 'article' }, 'test-run');
        expect(scores.AEO).toBeGreaterThan(0);
        expect(scores.GEO).toBeGreaterThan(0);
        expect(scores.GLOBAL).toBeGreaterThan(0);
    });

    test('keeps score contract shape stable', () => {
        const checks = {
            immediate_answer_placement: { verdict: 'fail', confidence: 1.0, category: 'AEO' },
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

    test('does not award a full GEO bucket when only one GEO check is present', () => {
        const checks = {
            single_h1: { verdict: 'pass', confidence: 1.0, category: 'GEO' }
        };

        const scores = __testHooks.scoreChecksForSidebar(checks, { content_type: 'article' }, 'test-run');
        expect(scores.GEO).toBeLessThan(10);
        expect(scores.GLOBAL).toBeLessThan(10);
    });

    test('matches orchestrator scoring for the bad local manifest fixture', async () => {
        const fixturePath = path.resolve(
            __dirname,
            '../../../fixtures/scoring/how-to-improve-website-performance-fast.manifest.json'
        );
        const manifest = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        const checks = await performDeterministicChecks(
            manifest,
            { content_type: 'article' },
            {
                contentHtml: manifest.content_html || '',
                enableIntroFocusFactuality: true
            }
        );

        const workerScores = __testHooks.scoreChecksForSidebar(checks, { content_type: 'article' }, 'test-run');
        const orchestratorScores = scoreAnalysisResults({ checks }, 'article').scores;

        expect(workerScores.AEO).toBe(orchestratorScores.AEO);
        expect(workerScores.GEO).toBe(orchestratorScores.GEO);
        expect(workerScores.GLOBAL).toBe(orchestratorScores.GLOBAL);
    });

    test('matches orchestrator scoring for the coffee unsupported-claim regression fixture', async () => {
        const manifest = loadScoringFixture('coffee-10-cups-health.manifest.json');
        const semanticOverlay = loadScoringFixture('coffee-10-cups-health.semantic-checks.json');
        const deterministicChecks = await performDeterministicChecks(
            manifest,
            { content_type: 'article' },
            {
                contentHtml: manifest.content_html || '',
                enableIntroFocusFactuality: true
            }
        );
        const checks = { ...deterministicChecks, ...semanticOverlay };

        const workerScores = __testHooks.scoreChecksForSidebar(checks, { content_type: 'article' }, 'test-run');
        const orchestratorScores = scoreAnalysisResults({ checks }, 'article').scores;

        expect(workerScores.AEO).toBe(orchestratorScores.AEO);
        expect(workerScores.GEO).toBe(orchestratorScores.GEO);
        expect(workerScores.GLOBAL).toBe(orchestratorScores.GLOBAL);
        expect(workerScores.GLOBAL).toBeLessThanOrEqual(60);
    });
});
