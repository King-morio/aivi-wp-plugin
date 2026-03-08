# Phase 5 Milestone 6 Checklist

Updated: 2026-03-08

## Goal

Harden the commercial AiVI product for staging and production rollout without weakening the working analyzer baseline or leaking billing/admin internals into customer-facing payloads.

## Locked Principles

1. No browser payload should expose secrets, provider identifiers, or unnecessary internal state.
2. No customer release package should ship internal billing, control-plane, test, or rollout assets.
3. Staging must prove entitlement, billing, and admin flows before production enablement.
4. Rollout safety beats convenience. Unsupported partial rollout states must fail closed.

## Step 1 - Browser payload and secret exposure audit

### Focus

- WordPress localized browser payloads
- control-plane runtime config defaults
- customer-visible billing/account payload minimization

### Tasks

- audit `AIVI_CONFIG` for fields that are not required in sidebar/overlay/admin JS
- confirm no PayPal secrets, plan IDs, provider order IDs, or subscription IDs reach browser payloads
- confirm control-plane `runtime-config.js` contains no secrets and is safe for local preview only
- strip unused customer-side identity fields from localized payloads where they add no runtime value
- strengthen diagnostics coverage for the reduced browser-safe payload contract

### Step 1 result

- completed
- removed unnecessary customer-browser localization of:
  - `accountDashboard`
  - `billingCatalog`
- removed unnecessary account-state browser exposure of:
  - `siteId`
  - `blogId`
  - `pluginVersion`
- retained only customer-runtime fields actually used by sidebar/overlay gating and status display
- verified control-plane runtime config remains secret-free and excluded from the WordPress release package

## Step 2 - Release package and artifact exclusion audit

### Focus

- plugin zip contents
- exclusion rules
- non-runtime artifacts

### Tasks

- verify `.distignore` and `.gitattributes` exclude:
  - `control-plane/`
  - `docs/`
  - `tests/`
  - `infrastructure/`
  - temp/debug artifacts
- verify package script still produces a customer-safe zip
- confirm no staging/local runtime config or sandbox files ship accidentally

### Step 2 result

- completed
- rebuilt the customer plugin zip with `tools/package-plugin-release.ps1`
- verified the packaged zip contains only:
  - `ai-visibility-inspector.php`
  - `LICENSE`
  - `readme.md`
  - `assets/`
  - `includes/`
- verified the packaged zip excludes:
  - `control-plane/`
  - `docs/`
  - `tests/`
  - `infrastructure/`
  - `tools/`
  - local runtime config and other non-runtime artifacts
- added regression coverage to lock the release-package allowlist and exclusion rules

## Step 3 - AWS environment and least-privilege inventory

### Focus

- required tables
- env vars
- IAM boundaries
- Cognito/API Gateway requirements

### Tasks

- enumerate required billing/admin tables for staging
- enumerate required PayPal and admin env vars
- define least-privilege IAM for:
  - plugin/orchestrator paths
  - webhook processing
  - super-admin routes
- confirm bootstrap admin token remains disabled outside local/dev/test

### Step 3 result

- completed
- added consolidated AWS inventory and IAM boundary doc:
  - `docs/PHASE5_M6_AWS_ENV_IAM_INVENTORY.md`
- documented:
  - required DynamoDB tables
  - required buckets/queues
  - required secrets and env vars
  - Cognito and API Gateway requirements
  - realistic least-privilege boundary for the current shared orchestrator Lambda
  - staging prerequisites before sandbox rollout
- explicitly deferred the custom-domain choice to Step 4 hosting time
- captured the requested future candidate name:
  - `pusskin`

## Step 4 - Staging deploy prerequisites and sandbox validation

### Focus

- AWS staging wiring
- PayPal sandbox
- control-plane staging hosting

### Tasks

- wire staging tables/env vars
- wire Cognito + JWT authorizer for admin routes
- host the admin console in staging
- validate PayPal sandbox subscription and top-up flows
- verify webhook verification and reconciliation in staging

### Step 4 result

- completed at the repo/pre-deploy level
- added staging execution runbook:
  - `docs/PHASE5_M6_STAGING_SANDBOX_RUNBOOK.md`
- added admin-console staging template and static bundle script:
  - `control-plane/admin-console/runtime-config.staging.example.js`
  - `control-plane/admin-console/package-admin-console.ps1`
- updated admin-console README with staging bundle instructions
- made WordPress billing readiness safely overrideable before plugin load while keeping the default locked off:
  - `AIVI_BILLING_READY=false` remains the default
  - staging can opt in via `wp-config.php`
- did not bind a real AWS hostname yet; that still requires the final domain decision at live staging deploy time

## Step 5 - End-to-end entitlement and credit validation

### Focus

- trial flow
- paid subscription flow
- top-up flow
- insufficient-credit blocking
- suspended/cancelled plan behavior

### Tasks

- validate trial account lifecycle
- validate first paid activation and monthly grant
- validate top-up credit grant and settlement
- validate failed/aborted run refund behavior
- validate blocked admission when credits or entitlement are insufficient

### Step 5 result

- completed
- added live validation matrix:
  - `docs/PHASE5_M6_E2E_VALIDATION_MATRIX.md`
- locked rollout environment assumptions:
  - backend region: `eu-north-1`
  - staging admin hostname: `console-staging.dollarchain.store`
  - production admin hostname: `console.dollarchain.store`
  - CloudFront ACM certificate region: `us-east-1`
- completed live validation for:
  - trial-backed account connection
  - PayPal top-up checkout, return capture, webhook reconciliation, and credit grant
  - PayPal subscription checkout, webhook reconciliation, and active plan state update
  - WordPress customer dashboard sync against authoritative backend account state
  - analysis admission, completion, and credit consumption on an active entitled account
- resolved live API Gateway drift that had blocked polling:
  - added missing route `GET /aivi/v1/analyze/run/{run_id}` to the active API `dnvo4w1sca`
- confirmed the working staging account state:
  - `plan_code = starter`
  - `subscription_status = active`
  - `analysis_allowed = true`
  - credited balance reflects included + top-up credits

## Step 6 - Closeout, checkpoint, and rollout decision

### Focus

- docs
- regression summary
- final go/no-go

### Tasks

- update milestone/status docs with as-built Phase 5 behavior
- checkpoint code and rollout docs
- record staging proof artifacts
- decide:
  - keep billing gated
  - enable sandbox only
  - promote to production

### Step 6 result

- completed for Phase 5 closeout
- final closeout state:
  - billing component validated end to end
  - subscription and top-up flows validated in sandbox
  - analysis plus credit settlement validated after live route repair
  - customer dashboard and sidebar credit displays now refresh from authoritative backend state after completed runs
  - duplicate post-run debit card removed from the sidebar to keep the account status view singular and clean
- remaining work is now Phase 6 rollout polish:
  - stable staging hostnames
  - Cognito/JWT hosting hardening
  - final admin diagnostics polish
