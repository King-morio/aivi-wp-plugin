const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('aws rollout inventory', () => {
    test('milestone 6 aws inventory documents required billing/admin tables and hosting boundary', () => {
        const doc = read('docs/PHASE5_M6_AWS_ENV_IAM_INVENTORY.md');

        [
            'RUNS_TABLE',
            'ACCOUNT_BILLING_STATE_TABLE',
            'CREDIT_LEDGER_TABLE',
            'BILLING_CHECKOUT_INTENTS_TABLE',
            'PAYPAL_WEBHOOK_EVENTS_TABLE',
            'BILLING_SUBSCRIPTIONS_TABLE',
            'BILLING_TOPUP_ORDERS_TABLE',
            'ADMIN_AUDIT_LOG_TABLE',
            'S3 + CloudFront',
            'AWS Cognito',
            'JWT authorizer'
        ].forEach((needle) => {
            expect(doc).toContain(needle);
        });
    });

    test('inventory documents bootstrap-token production restriction and custom-domain decision hold point', () => {
        const doc = read('docs/PHASE5_M6_AWS_ENV_IAM_INVENTORY.md');

        expect(doc).toContain('AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN=false');
        expect(doc).toContain('Do not pick the final control-plane custom domain in this step.');
        expect(doc).toContain('candidate brand/domain name: `pusskin`');
    });
});
