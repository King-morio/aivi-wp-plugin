/** @jest-environment node */
const fs = require('fs');
const path = require('path');

const sidebarPath = path.resolve(__dirname, '../../assets/js/aivi-sidebar.js');
const definitionsPath = path.resolve(
    __dirname,
    '../../infrastructure/lambda/shared/schemas/checks-definitions-v1.json'
);

function loadJson(filePath) {
    return JSON.parse(String(fs.readFileSync(filePath, 'utf8')).replace(/^\uFEFF/, ''));
}

function flattenCheckIds(definitions) {
    return Object.values(definitions.categories || {}).flatMap((category) =>
        Object.keys((category && category.checks) || {})
    );
}

describe('Sidebar analysis progress sequence contract', () => {
    test('loader progress covers every defined check exactly once', () => {
        const sidebar = fs.readFileSync(sidebarPath, 'utf8');
        const definitions = loadJson(definitionsPath);

        const loaderCheckIds = Array.from(sidebar.matchAll(/checkId:\s*'([^']+)'/g)).map((match) => match[1]);
        const uniqueLoaderCheckIds = Array.from(new Set(loaderCheckIds));
        const definedCheckIds = flattenCheckIds(definitions);

        expect(loaderCheckIds.length).toBe(definedCheckIds.length);
        expect(uniqueLoaderCheckIds.length).toBe(definedCheckIds.length);
        expect(uniqueLoaderCheckIds.sort()).toEqual([...definedCheckIds].sort());
    });
});
