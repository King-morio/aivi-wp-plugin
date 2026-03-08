const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('super-admin rollout safety', () => {
    test('control-plane html loads runtime config before the console app', () => {
        const indexHtml = read('control-plane/admin-console/index.html');
        expect(indexHtml).toContain('./runtime-config.js');
        expect(indexHtml.indexOf('./runtime-config.js')).toBeLessThan(indexHtml.indexOf('./src/app.js'));
    });

    test('runtime config template is deployment-oriented and disables preview by default', () => {
        const runtimeConfig = read('control-plane/admin-console/runtime-config.example.js');
        expect(runtimeConfig).toContain("allowPreview: false");
        expect(runtimeConfig).toContain("apiBaseUrl:");
        expect(runtimeConfig).toContain("cognitoDomain:");
        expect(runtimeConfig).toContain("requireMfa: true");
    });

    test('checked-in local runtime config remains secret-free', () => {
        const runtimeConfig = read('control-plane/admin-console/runtime-config.js');
        expect(runtimeConfig).toContain("environment: 'local'");
        expect(runtimeConfig).toContain("apiBaseUrl: ''");
        expect(runtimeConfig).not.toContain('AIVI_ADMIN_BOOTSTRAP_TOKEN');
        expect(runtimeConfig).not.toContain('PAYPAL_CLIENT_SECRET');
        expect(runtimeConfig).not.toContain('clientSecret');
    });

    test('control-plane remains excluded from the customer WordPress package', () => {
        const distignore = read('.distignore');
        const gitattributes = read('.gitattributes');
        expect(distignore).toContain('control-plane/');
        expect(gitattributes).toContain('control-plane export-ignore');
    });

    test('deployment runbook documents Cognito, MFA, JWT authorizer, and bootstrap-token restriction', () => {
        const runbook = read('docs/PHASE5_M5_CONTROL_PLANE_DEPLOY_RUNBOOK.md');
        expect(runbook).toContain('AWS Cognito User Pool');
        expect(runbook).toContain('MFA required');
        expect(runbook).toContain('API Gateway');
        expect(runbook).toContain('JWT authorizer');
        expect(runbook).toContain('do not enable `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN` in production');
    });
});
