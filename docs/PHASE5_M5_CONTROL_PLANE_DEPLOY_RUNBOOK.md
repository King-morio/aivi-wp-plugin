# Phase 5 Milestone 5 Control Plane Deploy Runbook

Updated: 2026-03-07

## Scope

This runbook covers Step 6 hardening and deployment requirements for the AiVI super-admin control plane.

## Recommended AWS shape

- static hosting:
  - `S3 + CloudFront`
  - or `AWS Amplify Hosting`
- auth:
  - `AWS Cognito User Pool`
  - Hosted UI + PKCE
  - MFA required
- API:
  - `API Gateway` with JWT authorizer
  - admin routes backed by orchestrator handlers
- internal domain:
  - `https://admin.aivi.example.com`

## Required auth rules

- required groups:
  - `aivi-super-admin`
  - `aivi-support`
  - `aivi-finance`
- required claims:
  - `email`
  - `cognito:groups`
- MFA:
  - keep `AIVI_ADMIN_REQUIRE_MFA=true`
- bootstrap token:
  - do not enable `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN` in production

## Runtime files

- local runtime file:
  - `control-plane/admin-console/runtime-config.js`
- deployment template:
  - `control-plane/admin-console/runtime-config.example.js`

For hosted environments set:

- `allowPreview: false`
- `apiBaseUrl`
- Cognito Hosted UI metadata

## API route surface

- `GET /aivi/v1/admin/accounts`
- `GET /aivi/v1/admin/accounts/{account_id}`
- `POST /aivi/v1/admin/accounts/{account_id}/actions`
- `GET /aivi/v1/admin/accounts/{account_id}/diagnostics`
- `POST /aivi/v1/admin/accounts/{account_id}/diagnostics/recovery`

## Required backend tables

- `ACCOUNT_BILLING_STATE_TABLE`
- `BILLING_CHECKOUT_INTENTS_TABLE`
- `BILLING_SUBSCRIPTIONS_TABLE`
- `BILLING_TOPUP_ORDERS_TABLE`
- `PAYPAL_WEBHOOK_EVENTS_TABLE`
- `CREDIT_LEDGER_TABLE`
- `ADMIN_AUDIT_LOG_TABLE`
- `RUNS_TABLE`

## Least-privilege IAM guidance

Admin handlers should get only the table access they need:

- read routes:
  - `dynamodb:GetItem`
  - `dynamodb:Scan`
- mutation/recovery routes:
  - `dynamodb:PutItem`
  - `dynamodb:UpdateItem`
- no wildcard secrets or unrelated table access
- no customer WordPress credentials in the control plane

## CloudFront / browser security

- only serve over HTTPS
- set strict CSP for the static console origin
- restrict API CORS to the admin domain only
- disable preview mode in hosted environments
- do not publish bootstrap tokens into runtime config

## Validation checklist before production

1. Login through Cognito Hosted UI.
2. Confirm non-admin users are rejected.
3. Confirm MFA is enforced.
4. Open one account and inspect:
   - credits
   - webhook health
   - site conflicts
5. Apply a manual credit adjustment and confirm:
   - account state changes
   - audit event exists
6. Replay one stored webhook event and confirm:
   - reconciliation completes
   - audit event exists
   - no raw webhook payload is returned to the browser
7. Confirm the control plane is not in the WordPress release zip.

## Rollback rule

Do not enable hosted operator writes if any of these fail:

- JWT authorizer does not pass correct group claims
- MFA is not enforced
- admin audit events are missing for write actions
- recovery routes can replay unrelated account webhooks
- preview mode is still enabled in hosted production config
