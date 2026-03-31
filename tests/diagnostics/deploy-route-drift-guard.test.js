const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('deploy route drift guard', () => {
    test('deploy script reconciles critical worker, copilot, and admin routes on the dev HTTP API', () => {
        const script = read('infrastructure/deploy-rcl-7z.ps1');

        expect(script).toContain('$httpApiId = "dnvo4w1sca"');
        expect(script).toContain('function Ensure-HttpApiRoute');
        expect(script).toContain('$criticalHttpRoutes = @(');
        expect(script).toContain('GET /ping');
        expect(script).toContain('GET /aivi/v1/worker/health');
        expect(script).toContain('POST /aivi/v1/rewrite');
        expect(script).toContain('GET /aivi/v1/admin/accounts');
        expect(script).toContain('GET /aivi/v1/admin/financials/overview');
        expect(script).toContain('--authorizer-id');
        expect(script).toContain('AuthorizationType = "JWT"');
        expect(script).toContain('apigatewayv2 get-routes');
        expect(script).toContain('"create-route"');
        expect(script).toContain('"update-route"');
        expect(script).toContain('"evidence-verifier.js"');
        expect(script).toContain('"fix-assist-contract-builder.js"');
        expect(script).toContain('"rewrite-handler.js"');
        expect(script).toContain('"rewrite-target-resolver.js"');
        expect(script).toContain('Assert-ArchiveContains -ArchivePath "..\\orchestrator-rcl.zip"');
        expect(script).toContain('foreach ($routeSpec in $criticalHttpRoutes)');
    });
});
