# Phase 5 Milestone 6 Staging + Sandbox Runbook

Updated: 2026-03-07

## Purpose

This runbook is the execution guide for Milestone 6 Step 4. It prepares:

- staging deployment prerequisites
- super-admin staging hosting
- PayPal sandbox validation
- end-to-end proof before any production enablement

It does not enable production billing by itself.

## Before you start

The following must already exist:

- all tables listed in `docs/PHASE5_M6_AWS_ENV_IAM_INVENTORY.md`
- staging lambda environment variables
- PayPal sandbox credentials and plan IDs
- Cognito staging user pool and app client
- API Gateway JWT authorizer for admin routes

## Domain decision checkpoint

Do not improvise the control-plane hostname.

Before staging hosting is created, explicitly confirm:

1. the real registered base domain you control
2. the staging hostname
3. the production hostname
4. whether the console should live under:
   - `admin.<domain>`
   - or `console.<domain>`

Noted user preference:

- candidate brand/domain name: `pusskin`

Chosen control-plane hostnames for rollout:

- staging: `console-staging.dollarchain.store`
- production: `console.dollarchain.store`

If you host those names on CloudFront, request the ACM certificate in:

- `us-east-1`

AiVI backend compute/storage remains in:

- `eu-north-1`

This still requires the exact registered domain/zone before AWS hosting can be finalized.

## WordPress staging billing gate

The plugin now keeps billing disabled by default through:

- `AIVI_BILLING_READY=false`

For staging validation only, enable billing by defining the constant before the plugin loads, for example in `wp-config.php`:

```php
define( 'AIVI_BILLING_READY', true );
```

This is safer than editing plugin source for each environment.

Production remains:

- `AIVI_BILLING_READY=false` until staging proof passes

## Admin console staging bundle

Prepare the static bundle with:

```powershell
powershell -ExecutionPolicy Bypass -File .\control-plane\admin-console\package-admin-console.ps1 -UseStagingExample
```

Bundle output:

- `control-plane/admin-console/dist/admin-console-bundle.zip`

For real staging, replace the example runtime config values with the actual:

- API base URL
- Cognito domain
- Cognito app client ID
- logout URL

## Staging hosting target

Recommended:

1. host the admin console from `S3 + CloudFront`
2. restrict CORS on admin APIs to the admin console origin
3. keep preview mode disabled in staging

Alternative:

- `AWS Amplify Hosting`

## Staging backend validation order

1. deploy orchestrator + worker with staging billing/admin env vars
2. confirm customer analysis flow still works with billing disabled
3. enable staging billing gate in WordPress
4. confirm dashboard billing actions appear
5. confirm hosted checkout requests are created
6. confirm webhook verification endpoint accepts only verified events
7. confirm account state updates after verified sandbox events
8. confirm credit grants and settlements appear in account state and admin console

## PayPal sandbox scenarios

Validate these cases explicitly:

### Subscription cases

1. trial -> starter
2. starter -> growth
3. growth first-cycle discount
4. active -> suspended
5. active -> cancelled at period end
6. payment failed

### Top-up cases

1. successful 25k top-up
2. successful 100k top-up
3. duplicate webhook delivery for same capture

### Analysis/credit cases

1. successful run settles actual debit
2. failed run refunds reservation
3. insufficient credits blocks admission cleanly
4. suspended plan blocks admission cleanly

### Super-admin cases

1. read account detail with Cognito auth
2. manual credit adjustment writes audit log
3. replay failed webhook from diagnostics panel
4. retry reconciliation from diagnostics panel

## Proof artifacts to capture

Capture and archive all of the following from staging:

1. WordPress dashboard screenshot with billing enabled
2. hosted checkout creation response
3. verified webhook event sample
4. account summary before and after sandbox payment
5. admin console screenshot for:
   - account detail
   - ledger activity
   - diagnostics
   - audit trail
6. one successful run billing summary
7. one refunded failed run billing summary

## Rollback rule

Immediately revert staging billing enablement if any of these occur:

- webhook verification is bypassed or misconfigured
- account state grants credits twice for one provider event
- customer browser payload begins exposing provider identifiers or secrets
- admin routes accept requests without valid operator auth
- analysis admission becomes unstable for non-paying fallback-safe states

## Production promotion rule

Do not promote to production until:

1. all sandbox scenarios above have been exercised
2. staging proof artifacts are captured
3. billing/account/admin regressions remain green
4. final admin hostname is confirmed
5. bootstrap token remains disabled in production
