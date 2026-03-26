#!/usr/bin/env node
const path = require('path');
const { runTextDomainAudit } = require('./text-domain-guard-utils');

const audit = runTextDomainAudit(path.join(__dirname, '..', '..'));

function printIssueList(title, issues) {
    if (!issues.length) {
        return;
    }

    console.log(`\n${title}`);
    issues.forEach((issue) => {
        const line = issue.line ? `:${issue.line}` : '';
        const file = issue.file || '(package)';
        const reason = issue.reason || issue.snippet || JSON.stringify(issue);
        console.log(`- ${file}${line} ${reason}`);
    });
}

console.log('\n=== AiVI Text Domain Guard ===\n');
console.log(`Canonical text domain: ${audit.canonicalTextDomain}`);
console.log(`Runtime PHP files scanned: ${audit.runtimeFileCount}`);
console.log(`Translation calls scanned: ${audit.scannedCallCount}`);

printIssueList('Bootstrap/package issues', [
    ...audit.bootstrapChecks.map((reason) => ({ reason })),
    ...audit.packageChecks.map((reason) => ({ reason })),
]);
printIssueList('I18n domain violations', audit.i18nViolations);
printIssueList('Legacy slug violations', audit.legacySlugViolations);

const failed = audit.bootstrapChecks.length > 0
    || audit.packageChecks.length > 0
    || audit.i18nViolations.length > 0
    || audit.legacySlugViolations.length > 0;

if (failed) {
    console.log('\nFAILED: Text domain guard found drift.\n');
    process.exit(1);
}

console.log('\nPASS: Text domain guard found no slug or i18n drift.\n');
