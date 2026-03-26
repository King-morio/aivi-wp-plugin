const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
const rootDir = path.join(__dirname, '..', '..');
const listPhpFiles = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return listPhpFiles(fullPath);
        }
        return entry.name.endsWith('.php') ? [fullPath] : [];
    });
};

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
        const assets = read('includes/class-assets.php');
        const settings = read('includes/class-admin-settings.php');

        expect(script).toContain('[string]$PackageName = "ai-visibility-inspector"');
        expect(script).toContain('[string]$PluginFolderName = "ai-visibility-inspector"');
        expect(script).toContain('"ai-visibility-inspector.php"');
        expect(script).toContain('"LICENSE"');
        expect(script).toContain('"readme.txt"');
        expect(script).toContain('"languages"');
        expect(script).toContain('"assets"');
        expect(script).toContain('"includes"');
        expect(script).toContain("CreateEntryFromFile");
        expect(script).toContain("-replace '\\\\', '/'");
        expect(script).not.toContain('"USER_GUIDE.md"');
        expect(script).not.toContain('"CHECK_REFERENCE.md"');
        expect(script).not.toContain('"TROUBLESHOOTING.md"');
        expect(script).not.toContain('"PRIVACY.md"');
        expect(script).not.toContain('"TERMS_OF_SERVICE.md"');
        expect(script).not.toContain('"SUPPORT.md"');
        expect(script).not.toContain('"DEVELOPMENT.md"');
        expect(script).not.toContain('"ARCHITECTURE.md"');
        expect(script).not.toContain('"OPERATIONS.md"');

        expect(script).not.toContain('"control-plane"');
        expect(script).not.toContain('"docs"');
        expect(script).not.toContain('"tests"');
        expect(script).not.toContain('"infrastructure"');

        expect(assets).toContain("includes/data/primary-category-map.json");
        expect(settings).toContain("includes/data/docs/USER_GUIDE.md");
    });

    test('text domain stays pinned to ai-visibility-inspector for core runtime PHP', () => {
        const pluginHeader = read('ai-visibility-inspector.php');
        expect(pluginHeader).toContain('Text Domain: ai-visibility-inspector');
        expect(pluginHeader).toContain('Domain Path: /languages');
        expect(pluginHeader).not.toContain('load_plugin_textdomain(');
        expect(pluginHeader).not.toContain('aivi_load_textdomain');

        const phpFiles = listPhpFiles(path.join(rootDir, 'includes'));
        let aiVisibilityInspectorDomainHits = 0;

        phpFiles.forEach((filePath) => {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            aiVisibilityInspectorDomainHits += (fileContent.match(/['"]ai-visibility-inspector['"]/g) || []).length;
            expect(fileContent).not.toContain(", 'aivi')");
            expect(fileContent).not.toContain(', "aivi")');
        });
        expect(aiVisibilityInspectorDomainHits).toBeGreaterThan(0);
    });

    test('wordpress.org readme stays aligned to the distributed plugin metadata', () => {
        const readme = read('readme.txt');

        expect(readme).toContain('=== AiVI - AI Visibility Inspector ===');
        expect(readme).toContain('Tested up to: 6.9');
        expect(readme).toContain('Stable tag: 1.0.30');
        expect(readme).toContain('License: GPLv2 or later');
        expect(readme).toContain('License URI: https://www.gnu.org/licenses/gpl-2.0.html');
        expect(readme).not.toContain('WordPress Plugin');
    });

    test('runtime plugin class does not suppress WordPress core or plugin updates', () => {
        const pluginClass = read('includes/class-plugin.php');

        expect(pluginClass).not.toContain('pre_site_transient_update_core');
        expect(pluginClass).not.toContain('pre_site_transient_update_plugins');
        expect(pluginClass).not.toContain('pre_site_transient_update_themes');
        expect(pluginClass).not.toContain('pre_site_transient_update_translations');
        expect(pluginClass).not.toContain('automatic_updater_disabled');
        expect(pluginClass).not.toContain('block_wordpress_org_http_requests');
        expect(pluginClass).not.toContain('disable_wp_updates_transient');
        expect(pluginClass).not.toContain('apply_local_http_hardening');
    });
});
