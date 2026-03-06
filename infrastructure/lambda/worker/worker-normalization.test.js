global.Request = global.Request || function Request() {};
global.Response = global.Response || function Response() {};
global.Headers = global.Headers || function Headers() {};
global.fetch = global.fetch || jest.fn();
const { normalizeHighlightsWithManifest } = require('./index');

describe('worker normalizeHighlightsWithManifest', () => {
    test('anchors candidate highlights with matching signature', () => {
        const manifest = {
            block_map: [{
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma'
            }]
        };
        const result = {
            checks: {
                test_check: {
                    verdict: 'fail',
                    confidence: 1,
                    explanation: 'Issue found.',
                    candidate_highlights: [{
                        signature: 'sig-1',
                        snippet: 'beta',
                        message: 'Missing evidence',
                        type: 'issue'
                    }]
                }
            }
        };
        const normalized = normalizeHighlightsWithManifest(result, manifest);
        const check = normalized.checks.test_check;
        expect(check.highlights.length).toBe(1);
        expect(check.highlights[0].node_ref).toBe('block-0');
        expect(check.highlights[0].start).toBe(6);
        expect(check.highlights[0].end).toBe(10);
        expect(check.highlights[0].anchor_status).toBe('anchored');
        expect(check.candidate_highlights).toBeUndefined();
    });

    test('falls back to block_only when precise range cannot be resolved', () => {
        const manifest = {
            block_map: [{
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma'
            }]
        };
        const result = {
            checks: {
                test_check: {
                    verdict: 'fail',
                    confidence: 1,
                    explanation: 'Issue found.',
                    candidate_highlights: [{
                        signature: 'sig-1',
                        snippet: 'text that is not present',
                        message: 'Missing evidence',
                        type: 'issue'
                    }]
                }
            }
        };
        const normalized = normalizeHighlightsWithManifest(result, manifest);
        const check = normalized.checks.test_check;
        expect(check.highlights.length).toBe(1);
        expect(check.highlights[0].anchor_status).toBe('block_only');
        expect(check.highlights[0].start).toBe(0);
        expect(check.highlights[0].end).toBe('Alpha beta gamma'.length);
        expect(check.cannot_anchor).toBeUndefined();
    });

    test('recovers missing anchor from text_quote_selector on same block', () => {
        const manifest = {
            block_map: [{
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma delta'
            }]
        };
        const result = {
            checks: {
                recovered_check: {
                    verdict: 'fail',
                    confidence: 0.9,
                    explanation: 'Recovered from selector',
                    candidate_highlights: [{
                        scope: 'span',
                        snippet: 'beta gamma',
                        quote: {
                            exact: 'beta gamma',
                            prefix: 'Alpha ',
                            suffix: ' delta'
                        },
                        message: 'Recovered'
                    }]
                }
            }
        };

        const normalized = normalizeHighlightsWithManifest(result, manifest);
        const check = normalized.checks.recovered_check;
        expect(check.highlights.length).toBe(1);
        expect(check.highlights[0].node_ref).toBe('block-0');
        expect(check.highlights[0].start).toBe(6);
        expect(check.highlights[0].end).toBe(16);
        expect(check.cannot_anchor).toBeUndefined();
    });

    test('splits cross-block selector into multiple anchored highlights', () => {
        const manifest = {
            block_map: [
                {
                    node_ref: 'block-0',
                    signature: 'sig-0',
                    text: 'Alpha beta'
                },
                {
                    node_ref: 'block-1',
                    signature: 'sig-1',
                    text: 'gamma delta'
                }
            ]
        };
        const result = {
            checks: {
                cross_block_check: {
                    verdict: 'fail',
                    confidence: 0.9,
                    explanation: 'Cross-block recovery',
                    candidate_highlights: [{
                        scope: 'span',
                        snippet: 'beta gamma',
                        quote: {
                            exact: 'beta gamma',
                            prefix: 'Alpha ',
                            suffix: ' delta'
                        },
                        message: 'Recovered'
                    }]
                }
            }
        };

        const normalized = normalizeHighlightsWithManifest(result, manifest);
        const check = normalized.checks.cross_block_check;
        expect(check.highlights.length).toBe(2);
        expect(check.highlights[0].node_ref).toBe('block-0');
        expect(check.highlights[1].node_ref).toBe('block-1');
        expect(check.cannot_anchor).toBeUndefined();
    });
});
