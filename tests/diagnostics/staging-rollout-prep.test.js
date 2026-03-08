const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('staging rollout prep', () => {
    test('billing ready default stays false but can be overridden before plugin load', () => {
        const config = read('includes/config.php');

        expect(config).toContain("if ( ! defined( 'AIVI_BILLING_READY' ) ) {");
        expect(config).toContain("define( 'AIVI_BILLING_READY', false );");
    });

    test('admin console ships a staging runtime template and bundle script', () => {
        const runtimeConfig = read('control-plane/admin-console/runtime-config.staging.example.js');
        const packageScript = read('control-plane/admin-console/package-admin-console.ps1');
        const readme = read('control-plane/admin-console/README.md');

        expect(runtimeConfig).toContain("environment: 'staging'");
        expect(runtimeConfig).toContain('allowPreview: false');
        expect(runtimeConfig).toContain('apiBaseUrl:');
        expect(runtimeConfig).toContain('cognitoDomain:');
        expect(packageScript).toContain('runtime-config.staging.example.js');
        expect(packageScript).toContain('admin-console-bundle.zip');
        expect(readme).toContain('runtime-config.staging.example.js');
        expect(readme).toContain('package-admin-console.ps1');
    });

    test('staging sandbox runbook captures domain checkpoint and validation scenarios', () => {
        const runbook = read('docs/PHASE5_M6_STAGING_SANDBOX_RUNBOOK.md');

        expect(runbook).toContain('candidate brand/domain name: `pusskin`');
        expect(runbook).toContain("define( 'AIVI_BILLING_READY', true );");
        expect(runbook).toContain('trial -> starter');
        expect(runbook).toContain('successful 25k top-up');
        expect(runbook).toContain('manual credit adjustment writes audit log');
    });
});
