# Phase 5 Milestone 5 Checklist

Updated: 2026-03-06

## Goal

Build a separate AiVI super-admin control plane outside WordPress so internal operators can manage customers, plans, credits, sites, billing state, and support diagnostics without exposing those controls to plugin users.

## Locked Principles

1. Super-admin tooling must stay outside customer WordPress.
2. The control plane must be protected by dedicated admin authentication and role checks.
3. Manual operator actions must be auditable.
4. Account state shown in the control plane must come from authoritative backend billing/account records.
5. Customer-facing WordPress UI must never receive super-admin capabilities or secrets.

## Step 1 - Super-admin contract, auth model, and control-plane scaffold

### Files

- `infrastructure/lambda/shared/schemas/super-admin-contract-v1.json`
- `docs/PHASE5_PRODUCT_BILLING_RECOMMENDATIONS.md`
- `docs/PHASE5_M5_SUPER_ADMIN_CHECKLIST.md`
- new control-plane app scaffold folder (recommended: `control-plane/admin-console/`)

### Tasks

- define the canonical control-plane payloads for:
  - account list rows
  - account detail
  - site detail
  - credit ledger summary
  - adjustment requests
  - support diagnostics summary
- lock the auth strategy for internal operators:
  - recommended: AWS Cognito user pool + admin group + MFA
- define operator roles:
  - super admin
  - support operator
  - finance operator
- scaffold the separate admin console shell outside WordPress

### Acceptance

- one canonical admin contract exists
- internal auth model is explicit
- control plane has a dedicated app boundary outside WordPress

## Step 2 - Backend super-admin read APIs

### Files

- new backend handlers under `infrastructure/lambda/orchestrator/`
- `infrastructure/lambda/orchestrator/index.js`
- persistence modules already added for:
  - account billing state
  - subscriptions
  - top-up orders
  - webhook events
  - checkout intents
  - credit ledger events

### Tasks

- add read-only admin endpoints for:
  - account search/list
  - account detail
  - connected sites for account
  - current plan / subscription / trial state
  - credit balance summary
  - recent ledger activity
  - recent billing/webhook state
- support filters for:
  - account id
  - site id
  - email/domain
  - plan code
  - subscription status
- keep all responses safe for internal use but still avoid leaking provider secrets

### Acceptance

- super admin can inspect authoritative customer state without touching WordPress
- list/detail APIs are consistent and paginated
- internal read APIs do not require customer-site access

## Step 3 - Super-admin console UI

### Files

- control-plane app files under the new admin-console folder
- supporting static assets and API client modules

### Tasks

- build the first control-plane UI screens:
  - login gate
  - account list
  - account detail
  - site detail
  - billing/credit summary panel
- expose the most important operator information:
  - plan
  - credits remaining
  - trial status
  - subscription state
  - site count
  - last analysis / last debit
  - webhook health snapshot
- add operator-friendly search and filters

### Acceptance

- internal operators can browse customer state from one place
- no WordPress plugin dependency is required to observe account evolution
- the console is usable before write-actions are introduced

## Step 4 - Operator write actions and audit trail

### Files

- new backend admin mutation handlers under `infrastructure/lambda/orchestrator/`
- control-plane admin console action views
- shared audit/event helpers

### Tasks

- add controlled write actions for:
  - manual credit adjustment
  - trial extension / trial end
  - plan override
  - subscription resync
  - site unbind / site-limit recovery
  - account pause / restore
- require:
  - operator id
  - reason
  - audit timestamp
  - idempotency / mutation guardrails
- persist all operator actions into an audit trail

### Acceptance

- super admin can safely adjust customer state
- every mutation is attributable and reviewable
- actions do not bypass ledger/account-state consistency rules

## Step 5 - Support diagnostics and recovery tools

### Files

- backend admin diagnostics handlers
- control-plane diagnostics views
- runbook docs as needed

### Tasks

- surface support tools for:
  - webhook delivery history
  - webhook replay eligibility
  - checkout intent lookup
  - subscription/top-up reconciliation state
  - recent run failures / blocked admissions
  - site binding conflicts
- add operator-safe recovery actions where appropriate:
  - resync subscription
  - retry reconciliation
  - replay failed webhook processing from stored event

### Acceptance

- support can diagnose billing and entitlement issues without raw database access
- recovery actions are scoped, auditable, and operator-only

## Step 6 - IAM hardening, deployment, and rollout validation

### Files

- control-plane deployment config
- infrastructure/deploy docs
- tests/diagnostics
- admin-console tests

### Tasks

- protect the control plane with:
  - Cognito auth
  - admin group/role claims
  - MFA
  - least-privilege API access
- deploy the admin console to AWS:
  - recommended: S3 + CloudFront or Amplify Hosting
- add diagnostics/tests for:
  - auth gating
  - admin API payload safety
  - mutation audit logs
  - operator-role restrictions
- validate real operator flows:
  - inspect customer
  - add manual credits
  - extend trial
  - resync billing state
  - confirm audit log

### Acceptance

- the control plane is reachable only by authorized internal operators
- operator actions are secure and auditable
- the admin console can be used in production without exposing customer-facing risk
