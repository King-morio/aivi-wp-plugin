const fs = require('fs');
const path = require('path');

const CANONICAL_TEXT_DOMAIN = 'ai-visibility-inspector';
const LEGACY_PLUGIN_SLUG = 'AiVI-WP-Plugin';

const FUNCTION_DOMAIN_INDEX = {
    '__': 1,
    '_e': 1,
    'esc_html__': 1,
    'esc_attr__': 1,
    'esc_html_e': 1,
    'esc_attr_e': 1,
    'translate': 1,
    '_x': 2,
    '_ex': 2,
    'esc_html_x': 2,
    'esc_attr_x': 2,
    'esc_html_ex': 2,
    'esc_attr_ex': 2,
    '_n': 3,
    '_nx': 4,
    '_n_noop': 2,
    '_nx_noop': 3,
};

const I18N_FUNCTION_NAMES = Object.keys(FUNCTION_DOMAIN_INDEX).sort((left, right) => right.length - left.length);
const I18N_CALL_PATTERN = new RegExp(`\\b(${I18N_FUNCTION_NAMES.map(escapeRegex).join('|')})\\s*\\(`, 'g');

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function read(relativePath, rootDir) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

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

function getLineNumber(content, charIndex) {
    return content.slice(0, charIndex).split(/\r?\n/).length;
}

function extractFunctionInnerContent(content, openParenIndex) {
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let index = openParenIndex; index < content.length; index += 1) {
        const char = content[index];

        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === quote) {
                quote = null;
            }

            continue;
        }

        if (char === '"' || char === '\'') {
            quote = char;
            continue;
        }

        if (char === '(') {
            depth += 1;
            continue;
        }

        if (char === ')') {
            depth -= 1;
            if (depth === 0) {
                return {
                    inner: content.slice(openParenIndex + 1, index),
                    endIndex: index,
                };
            }
        }
    }

    return null;
}

function splitTopLevelArguments(inner) {
    const args = [];
    let current = '';
    let quote = null;
    let escaped = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;

    for (let index = 0; index < inner.length; index += 1) {
        const char = inner[index];

        if (quote) {
            current += char;

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === quote) {
                quote = null;
            }

            continue;
        }

        if (char === '"' || char === '\'') {
            quote = char;
            current += char;
            continue;
        }

        if (char === '(') {
            parenDepth += 1;
            current += char;
            continue;
        }

        if (char === ')') {
            parenDepth -= 1;
            current += char;
            continue;
        }

        if (char === '[') {
            bracketDepth += 1;
            current += char;
            continue;
        }

        if (char === ']') {
            bracketDepth -= 1;
            current += char;
            continue;
        }

        if (char === '{') {
            braceDepth += 1;
            current += char;
            continue;
        }

        if (char === '}') {
            braceDepth -= 1;
            current += char;
            continue;
        }

        if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
            args.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    if (current.trim() !== '') {
        args.push(current.trim());
    }

    return args;
}

function parseQuotedString(argument) {
    const trimmed = argument.trim();
    const match = trimmed.match(/^(['"])([\s\S]*)\1$/);
    if (!match) {
        return null;
    }

    return match[2];
}

function scanPhpFileForI18nDomains(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');
    const matches = [];
    const violations = [];
    let match;

    while ((match = I18N_CALL_PATTERN.exec(fileContent)) !== null) {
        const functionName = match[1];
        const openParenIndex = fileContent.indexOf('(', match.index);
        const extracted = extractFunctionInnerContent(fileContent, openParenIndex);

        if (!extracted) {
            violations.push({
                file: relativePath,
                line: getLineNumber(fileContent, match.index),
                functionName,
                reason: 'Could not parse translation call arguments.',
            });
            continue;
        }

        const args = splitTopLevelArguments(extracted.inner);
        const domainArgIndex = FUNCTION_DOMAIN_INDEX[functionName];
        const domainArg = args[domainArgIndex];
        const domainValue = typeof domainArg === 'string' ? parseQuotedString(domainArg) : null;
        const line = getLineNumber(fileContent, match.index);

        matches.push({
            file: relativePath,
            functionName,
            line,
            domainValue,
        });

        if (domainValue !== CANONICAL_TEXT_DOMAIN) {
            violations.push({
                file: relativePath,
                line,
                functionName,
                foundDomain: domainValue,
                reason: domainValue === null
                    ? 'Text domain is not a simple canonical string literal.'
                    : `Expected '${CANONICAL_TEXT_DOMAIN}' but found '${domainValue}'.`,
            });
        }
    }

    const legacySlugHits = [];
    const lines = fileContent.split(/\r?\n/);
    lines.forEach((lineContent, index) => {
        if (lineContent.includes(`'${LEGACY_PLUGIN_SLUG}'`) || lineContent.includes(`"${LEGACY_PLUGIN_SLUG}"`)) {
            legacySlugHits.push({
                file: relativePath,
                line: index + 1,
                snippet: lineContent.trim(),
            });
        }
    });

    return {
        matches,
        violations,
        legacySlugHits,
    };
}

function runTextDomainAudit(rootDir) {
    const pluginBootstrap = read('ai-visibility-inspector.php', rootDir);
    const packageScript = read('tools/package-plugin-release.ps1', rootDir);
    const packageJson = JSON.parse(read('package.json', rootDir));
    const runtimePhpFiles = [
        path.join(rootDir, 'ai-visibility-inspector.php'),
        ...listPhpFiles(path.join(rootDir, 'includes')),
    ];

    const bootstrapChecks = [];
    const packageChecks = [];

    if (!pluginBootstrap.includes('Text Domain: ai-visibility-inspector')) {
        bootstrapChecks.push("Plugin bootstrap is missing 'Text Domain: ai-visibility-inspector'.");
    }
    if (!pluginBootstrap.includes('Domain Path: /languages')) {
        bootstrapChecks.push("Plugin bootstrap is missing 'Domain Path: /languages'.");
    }
    if (pluginBootstrap.includes("load_plugin_textdomain(") || pluginBootstrap.includes('aivi_load_textdomain')) {
        bootstrapChecks.push('Plugin bootstrap should rely on WordPress.org translation loading instead of manual load_plugin_textdomain wiring.');
    }

    if (!packageScript.includes('[string]$PackageName = "ai-visibility-inspector"')) {
        packageChecks.push('Package script is not pinned to the canonical package name.');
    }
    if (!packageScript.includes('[string]$PluginFolderName = "ai-visibility-inspector"')) {
        packageChecks.push('Package script is not pinned to the canonical install folder name.');
    }
    if (!packageJson.scripts || packageJson.scripts['verify:textdomain'] !== 'node tests/diagnostics/verify-text-domain-guard.js') {
        packageChecks.push("package.json is missing the 'verify:textdomain' guard script.");
    }

    const i18nViolations = [];
    const legacySlugViolations = [];
    let scannedCallCount = 0;

    runtimePhpFiles.forEach((filePath) => {
        const result = scanPhpFileForI18nDomains(filePath);
        scannedCallCount += result.matches.length;
        i18nViolations.push(...result.violations);
        legacySlugViolations.push(...result.legacySlugHits);
    });

    return {
        canonicalTextDomain: CANONICAL_TEXT_DOMAIN,
        legacyPluginSlug: LEGACY_PLUGIN_SLUG,
        runtimeFileCount: runtimePhpFiles.length,
        scannedCallCount,
        bootstrapChecks,
        packageChecks,
        i18nViolations,
        legacySlugViolations,
    };
}

module.exports = {
    CANONICAL_TEXT_DOMAIN,
    LEGACY_PLUGIN_SLUG,
    runTextDomainAudit,
};
