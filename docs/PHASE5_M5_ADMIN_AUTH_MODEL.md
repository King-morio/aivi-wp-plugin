# Phase 5 Milestone 5 Admin Auth Model

Updated: 2026-03-06

## Decision

Use a separate AWS-backed admin control plane outside WordPress with:
- `AWS Cognito User Pool`
- `Hosted UI + PKCE`
- required `cognito:groups` claims
- MFA required for all internal operators

## Why this model

This keeps super-admin access outside customer sites and gives AiVI a clean security boundary for:
- manual credit adjustments
- plan overrides
- billing recovery
- webhook replay and diagnostics
- site unbind and account support actions

## Recommended roles

### `aivi-super-admin`

Full operator access:
- read/write accounts
- read/write sites
- credit adjustments
- billing reconciliation
- webhook replay
- audit access

### `aivi-support`

Support access:
- read accounts and sites
- read credits and billing
- limited reconciliation and webhook replay
- no unrestricted plan or credit mutation

### `aivi-finance`

Finance access:
- read accounts
- read billing and credits
- manual credit adjustments
- billing reconciliation
- audit access

## Access path

Recommended internal domains:
- `https://admin.aivi.example.com`
- `https://console.aivi.example.com`

Recommended AWS hosting:
- static app on `S3 + CloudFront`
- or `AWS Amplify Hosting`

Recommended backend:
- `API Gateway` + dedicated admin handlers

## Security rules

1. Customer WordPress plugins must never receive super-admin tokens or claims.
2. Admin APIs must verify Cognito identity and group membership on every request.
3. All operator mutations must record:
   - operator id
   - operator role
   - reason
   - target id
   - timestamp
   - idempotency key when applicable
4. MFA remains mandatory for production operators.
5. Secrets stay in AWS-managed configuration only.

## Near-term implementation path

1. Scaffold the static admin console app
2. Add read-only admin APIs
3. Add Cognito auth gate
4. Add operator write actions with audit trail
5. Deploy to a protected AWS staging domain
