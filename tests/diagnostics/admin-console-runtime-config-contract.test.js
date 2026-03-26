const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

const RUNTIME_FILES = [
    'control-plane/admin-console/runtime-config.example.js',
    'control-plane/admin-console/runtime-config.staging.example.js',
    'control-plane/admin-console/runtime-config.staging.bootstrap.js',
    'control-plane/admin-console/runtime-config.production.example.js'
];

describe('admin console runtime config contract', () => {
    test.each(RUNTIME_FILES)('%s includes the shared auth contract fields', (filePath) => {
        const content = read(filePath);
        expect(content).toContain('apiBaseUrl');
        expect(content).toContain('redirectUri');
        expect(content).toContain('postLogoutRedirectUri');
        expect(content).toContain('logoutUrl');
        expect(content).toContain('scopes');
        expect(content).toContain('audience');
        expect(content).toContain('adminGroups');
    });
});
