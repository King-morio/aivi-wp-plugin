const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('release package safety', () => {
    test('release package exclusion files block internal product surfaces and non-runtime trees', () => {
        const distignore = read('.distignore');
        const gitattributes = read('.gitattributes');

        [
            'control-plane/',
            'docs/',
            'tests/',
            'infrastructure/',
            'tools/'
        ].forEach((entry) => {
            expect(distignore).toContain(entry);
        });

        expect(gitattributes).toContain('control-plane export-ignore');
        expect(gitattributes).toContain('docs export-ignore');
        expect(gitattributes).toContain('tests export-ignore');
        expect(gitattributes).toContain('infrastructure export-ignore');
        expect(gitattributes).toContain('tools export-ignore');
    });

    test('package script uses a strict runtime allowlist only', () => {
        const script = read('tools/package-plugin-release.ps1');

        expect(script).toContain('"ai-visibility-inspector.php"');
        expect(script).toContain('"LICENSE"');
        expect(script).toContain('"readme.md"');
        expect(script).toContain('"assets"');
        expect(script).toContain('"includes"');

        expect(script).not.toContain('"control-plane"');
        expect(script).not.toContain('"docs"');
        expect(script).not.toContain('"tests"');
        expect(script).not.toContain('"infrastructure"');
    });
});
