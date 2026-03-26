#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const translationCallWithPlaceholderPattern = /\b(?:__|_e|esc_html__|esc_attr__|esc_html_e|esc_attr_e|_x|_ex|esc_html_x|esc_attr_x|esc_html_ex|esc_attr_ex|_n|_nx|_n_noop|_nx_noop)\s*\(.*%/;

function listPhpFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return listPhpFiles(fullPath);
        }

        return entry.name.endsWith('.php') ? [fullPath] : [];
    });
}

function getPreviousNonEmptyLine(lines, index) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (lines[cursor].trim() !== '') {
            return lines[cursor].trim();
        }
    }

    return '';
}

function runTranslatorsCommentAudit(rootDir) {
    const phpFiles = [
        path.join(rootDir, 'ai-visibility-inspector.php'),
        ...listPhpFiles(path.join(rootDir, 'includes')),
    ];

    const violations = [];
    let scannedCalls = 0;

    phpFiles.forEach((filePath) => {
        const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

        lines.forEach((lineContent, index) => {
            if (!translationCallWithPlaceholderPattern.test(lineContent)) {
                return;
            }

            scannedCalls += 1;
            const previousNonEmptyLine = getPreviousNonEmptyLine(lines, index);

            if (!/translators:/i.test(previousNonEmptyLine)) {
                violations.push({
                    file: relativePath,
                    line: index + 1,
                    snippet: lineContent.trim(),
                });
            }
        });
    });

    return {
        runtimeFileCount: phpFiles.length,
        scannedCalls,
        violations,
    };
}

if (require.main === module) {
    const rootDir = path.join(__dirname, '..', '..');
    const audit = runTranslatorsCommentAudit(rootDir);

    console.log('\n=== AiVI Translators Comment Guard ===\n');
    console.log(`Runtime PHP files scanned: ${audit.runtimeFileCount}`);
    console.log(`Placeholder-bearing translation calls scanned: ${audit.scannedCalls}`);

    if (audit.violations.length > 0) {
        console.log('\nMissing translators comments:\n');
        audit.violations.forEach((violation) => {
            console.log(`- ${violation.file}:${violation.line}`);
            console.log(`  ${violation.snippet}`);
        });
        console.log('\nFAILED: Placeholder-bearing translation calls need a translators comment on the line above.\n');
        process.exit(1);
    }

    console.log('\nPASS: Placeholder-bearing translation calls are annotated with translators comments.\n');
}

module.exports = {
    runTranslatorsCommentAudit,
};
