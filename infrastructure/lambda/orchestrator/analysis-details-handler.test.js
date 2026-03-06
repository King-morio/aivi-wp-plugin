const fs = require('fs');
const path = require('path');

describe('analysis-details-handler rewrite contract regression guard', () => {
    test('details response attaches resolver rewrite_target and repair_intent', () => {
        const handlerPath = path.resolve(__dirname, './analysis-details-handler.js');
        const source = fs.readFileSync(handlerPath, 'utf8');

        expect(source).toContain('rewriteResolution = resolveRewriteTarget({');
        expect(source).toContain('response.rewrite_target = rewriteResolution.rewrite_target;');
        expect(source).toContain('checkDetails.rewrite_target = rewriteResolution.rewrite_target;');
        expect(source).toContain('response.repair_intent = rewriteResolution.repair_intent;');
        expect(source).toContain('checkDetails.repair_intent = rewriteResolution.repair_intent;');
    });

    test('details telemetry includes actionable rewrite target marker', () => {
        const handlerPath = path.resolve(__dirname, './analysis-details-handler.js');
        const source = fs.readFileSync(handlerPath, 'utf8');

        expect(source).toContain('rewrite_target_actionable: rewriteResolution?.rewrite_target?.actionable === true');
    });
});
