const path = require('path');
const { runTextDomainAudit } = require('./text-domain-guard-utils');

describe('text domain guard', () => {
    const audit = runTextDomainAudit(path.join(__dirname, '..', '..'));

    test('bootstrap and packaging stay aligned to ai-visibility-inspector', () => {
        expect(audit.bootstrapChecks).toEqual([]);
        expect(audit.packageChecks).toEqual([]);
    });

    test('all runtime PHP i18n helpers use the canonical text domain', () => {
        expect(audit.scannedCallCount).toBeGreaterThan(0);
        expect(audit.i18nViolations).toEqual([]);
    });

    test('legacy repo slug never appears in runtime PHP string literals', () => {
        expect(audit.legacySlugViolations).toEqual([]);
    });
});
