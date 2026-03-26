const path = require('path');
const { runTranslatorsCommentAudit } = require('./verify-translators-comments');

describe('translators comments guard', () => {
    test('placeholder-bearing translation calls in runtime PHP have translators comments', () => {
        const audit = runTranslatorsCommentAudit(path.join(__dirname, '..', '..'));
        expect(audit.scannedCalls).toBeGreaterThan(0);
        expect(audit.violations).toEqual([]);
    });
});
