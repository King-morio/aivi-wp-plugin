const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('admin console UI scaffold contract', () => {
    test('index bootstraps the admin console assets in the correct order', () => {
        const indexHtml = read('control-plane/admin-console/index.html');
        expect(indexHtml).toContain('./runtime-config.js');
        expect(indexHtml).toContain('./src/styles.css');
        expect(indexHtml).toContain('./src/mock-data.js');
        expect(indexHtml).toContain('./src/api-client.js');
        expect(indexHtml).toContain('./src/app.js');
    });

    test('app scaffold includes the step 5 screens, operator filters, write actions, and diagnostics', () => {
        const app = read('control-plane/admin-console/src/app.js');
        expect(app).toContain("Choose preview or API mode");
        expect(app).toContain("Search and Filters");
        expect(app).toContain("Authoritative customer state");
        expect(app).toContain("Connected site context");
        expect(app).toContain("Credit and billing health summary");
        expect(app).toContain("Apply controlled account mutations");
        expect(app).toContain("Recent operator actions");
        expect(app).toContain("Webhook, checkout, and run health");
        expect(app).toContain("Retry reconciliation from stored events");
        expect(app).toContain("submitAdminAction");
        expect(app).toContain("submitRecoveryAction");
        expect(app).toContain("renderAccountList");
        expect(app).toContain("renderSiteDetailPanel");
        expect(app).toContain("renderBillingPanel");
        expect(app).toContain("renderActionPanel");
        expect(app).toContain("renderAuditPanel");
        expect(app).toContain("renderDiagnosticsPanel");
        expect(app).toContain("renderRecoveryPanel");
        expect(app).toContain("window.AiviAdminApi.createApiClient");
        expect(app).toContain("window.AiviAdminApi.createPreviewClient");
    });

    test('api client exposes admin mutation and diagnostics support for preview and api modes', () => {
        const client = read('control-plane/admin-console/src/api-client.js');
        expect(client).toContain('mutateAccount(accountId, payload');
        expect(client).toContain('/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}/actions');
        expect(client).toContain('mutatePreviewDetail');
        expect(client).toContain('getAccountDiagnostics(accountId, filters');
        expect(client).toContain('runRecoveryAction(accountId, payload');
        expect(client).toContain('/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}/diagnostics');
        expect(client).toContain('/aivi/v1/admin/accounts/${encodeURIComponent(accountId)}/diagnostics/recovery');
    });

    test('static scaffold remains outside WordPress release packaging', () => {
        const distignore = read('.distignore');
        const gitattributes = read('.gitattributes');
        expect(distignore).toContain('control-plane/');
        expect(gitattributes).toContain('control-plane export-ignore');
    });
});
