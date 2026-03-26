# Phase 5 Milestone 6 AWS Inventory

Updated: 2026-03-07

## Purpose

This document is the staging/production inventory for Phase 5 rollout hardening. It is not a deploy script. It defines:

- required AWS data stores
- required environment variables
- required secrets
- service boundaries
- least-privilege targets
- rollout dependencies that must exist before staging enablement

## Region baseline

Current AiVI backend infrastructure is pinned in-repo to:

- `eu-north-1`

Important exception:

- if the super-admin console uses `CloudFront` with custom hostnames, the ACM certificate for that distribution must be issued in `us-east-1`

Current local AWS CLI shell check result:

- no default region is set in the current shell/profile context

So the authoritative current region source remains the repo deploy/infrastructure configuration, not the local CLI default.

## Current boundary

AiVI now has three distinct runtime surfaces:

1. WordPress plugin
2. AiVI backend lambdas
3. Super-admin control plane

The WordPress plugin must remain browser-safe and does not hold provider secrets.

## AWS components required

### 1. Customer/backend path

- API Gateway for customer plugin routes
- Orchestrator Lambda
- Worker Lambda
- SQS queue for async analysis tasks
- S3 bucket for artifacts
- optional S3 bucket/table path for prompts
- Secrets Manager for model/API/session secrets
- DynamoDB tables for runs, credits, billing state, and billing events

### 2. Super-admin path

- API Gateway admin routes
- JWT authorizer backed by Cognito
- Cognito User Pool
- Cognito app client
- Cognito groups:
  - `aivi-super-admin`
  - `aivi-support`
  - `aivi-finance`
- static admin console hosting:
  - `S3 + CloudFront` or `Amplify Hosting`

### 3. Payment path

- PayPal sandbox/prod credentials
- PayPal webhook callback route
- DynamoDB persistence for checkout intents, subscriptions, top-ups, and webhook events

## Required DynamoDB tables

### Existing analysis/runtime tables

- `RUNS_TABLE`
- `SUGGESTIONS_TABLE`
- `PROMPTS_TABLE` (if prompt storage is enabled)

### Phase 5 billing/account tables

- `ACCOUNT_BILLING_STATE_TABLE`
- `CREDIT_LEDGER_TABLE`
- `BILLING_CHECKOUT_INTENTS_TABLE`
- `PAYPAL_WEBHOOK_EVENTS_TABLE`
- `BILLING_SUBSCRIPTIONS_TABLE`
- `BILLING_TOPUP_ORDERS_TABLE`
- `ADMIN_AUDIT_LOG_TABLE`

### Compatibility alias

- `BILLING_ACCOUNT_STATE_TABLE`
  - supported as fallback alias for `ACCOUNT_BILLING_STATE_TABLE`
  - do not treat it as the preferred canonical name going forward

## Required buckets and queues

- `ARTIFACTS_BUCKET`
- `PROMPTS_BUCKET` (only if prompt manager is enabled)
- `TASKS_QUEUE_URL`

## Required secrets

### Model/session

- `SECRET_NAME`
  - current model/API secret source
- `SESSION_SECRET`
  - preferred inline session signing secret
- `SESSION_SECRET_NAME`
  - preferred Secrets Manager source for session signing secret

### PayPal

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`

Do not localize or expose any of these values to WordPress or the control-plane browser app.

## Required environment variables

### Shared/customer analysis

- `ENVIRONMENT`
- `RUNS_TABLE`
- `ARTIFACTS_BUCKET`
- `TASKS_QUEUE_URL`
- `MISTRAL_MODEL`
- `MISTRAL_FALLBACK_MODEL`
- `MISTRAL_FALLBACK_MODELS`
- `SECRET_NAME`
- `SESSION_SECRET`
- `SESSION_SECRET_NAME`
- `ENABLE_ANALYSIS`

### Optional analysis tuning

- `INTRO_FOCUS_FACTUALITY_ENABLED`
- `AI_CHECK_CHUNK_SIZE`
- `AI_CHUNK_MAX_TOKENS`
- `AI_CHUNK_RETRY_MAX_TOKENS`
- `AI_CHUNK_REQUEST_MAX_ATTEMPTS`
- `AI_CHUNK_RETRY_BASE_DELAY_MS`
- `AI_MAX_ANALYSIS_LATENCY_MS`
- `AI_COMPLETION_FIRST_ENABLED`
- `AI_LAMBDA_RESERVE_MS`
- `AI_SOFT_ANALYSIS_TARGET_MS`
- `AI_CHUNK_MIN_HEADROOM_MS`
- `AI_CHUNK_MIN_REQUEST_TIMEOUT_MS`
- `AI_CHUNK_MAX_REQUEST_TIMEOUT_MS`
- `AI_CHUNK_TIMEOUT_SLACK_MS`
- `AI_MIN_RETURNED_CHECK_RATE`
- `AI_MAX_SYNTHETIC_CHECK_RATE`
- `CAPTURE_RAW_RESPONSE`

These are not rollout blockers, but their staging values must be explicit.

### Billing/PayPal

- `PAYPAL_API_BASE`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_BRAND_NAME`
- `PAYPAL_RETURN_URL`
- `PAYPAL_CANCEL_URL`
- `PAYPAL_PLAN_ID_STARTER`
- `PAYPAL_PLAN_ID_GROWTH`
- `PAYPAL_PLAN_ID_GROWTH_INTRO`
- `PAYPAL_PLAN_ID_PRO`

### Account/support links

- `AIVI_DOCS_URL`
- `AIVI_BILLING_URL`
- `AIVI_SUPPORT_URL`

### Super-admin auth

- `AIVI_ADMIN_REQUIRE_MFA`
- `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN`
- `AIVI_ADMIN_BOOTSTRAP_TOKEN`

Production target:

- keep `AIVI_ADMIN_REQUIRE_MFA=true`
- keep `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN=false`
- do not set `AIVI_ADMIN_BOOTSTRAP_TOKEN` in production

## Least-privilege IAM target

### Important current constraint

Today, customer routes and admin routes run from the same orchestrator Lambda codebase. That means IAM isolation is currently per-Lambda, not per-route.

So the realistic least-privilege target right now is:

- one constrained orchestrator Lambda role
- one constrained worker Lambda role
- route-level authorization inside the app

If stronger AWS-side isolation is required later, split super-admin APIs into a separate Lambda.

### Orchestrator Lambda role needs

- DynamoDB read/write:
  - `RUNS_TABLE`
  - `SUGGESTIONS_TABLE`
  - `PROMPTS_TABLE` (if used)
  - `ACCOUNT_BILLING_STATE_TABLE`
  - `CREDIT_LEDGER_TABLE`
  - `BILLING_CHECKOUT_INTENTS_TABLE`
  - `PAYPAL_WEBHOOK_EVENTS_TABLE`
  - `BILLING_SUBSCRIPTIONS_TABLE`
  - `BILLING_TOPUP_ORDERS_TABLE`
  - `ADMIN_AUDIT_LOG_TABLE`
- S3 read/write:
  - `ARTIFACTS_BUCKET`
  - `PROMPTS_BUCKET` (if used)
- SQS send:
  - `TASKS_QUEUE_URL`
- Secrets Manager read:
  - model/API secret
  - session signing secret
- CloudWatch Logs write

### Worker Lambda role needs

- DynamoDB read/write:
  - `RUNS_TABLE`
  - `ACCOUNT_BILLING_STATE_TABLE`
  - `CREDIT_LEDGER_TABLE`
- S3 read/write:
  - `ARTIFACTS_BUCKET`
- Secrets Manager read:
  - model/API secret
- CloudWatch Logs write

### Control-plane hosting/app needs

Static hosting itself should not need AWS data permissions if it is a pure front end.

The browser app should only know:

- API base URL
- Cognito domain/client metadata
- auth mode flags

It must not know:

- bootstrap token
- PayPal secrets
- DynamoDB table names
- internal queue/bucket names

## Cognito and API Gateway requirements

### Cognito

- dedicated AWS Cognito User Pool for internal operators
- app client configured for Hosted UI + PKCE
- MFA required
- email required
- operator groups:
  - `aivi-super-admin`
  - `aivi-support`
  - `aivi-finance`

### API Gateway

- JWT authorizer for super-admin routes
- route protection must pass group claims into Lambda authorizer context
- customer plugin routes remain separate from super-admin auth semantics

## Staging prerequisites before Step 4

Before staging rollout begins, all of the following must exist:

1. all required DynamoDB tables
2. artifacts bucket
3. tasks queue
4. PayPal sandbox credentials and plan IDs
5. session signing secret
6. model/API secret
7. Cognito user pool, app client, and groups
8. API Gateway JWT authorizer
9. static hosting target for the control plane

## Domain decision hold point

Do not pick the final control-plane custom domain in this step.

Pause and decide it at the start of Milestone 6 Step 4, when staging hosting is wired.

At that point, explicitly confirm:

- root brand/domain
- hostname pattern
  - e.g. `admin.<domain>`
  - e.g. `console.<domain>`
- staging hostname
- production hostname

User preference already noted:

- candidate brand/domain name: `pusskin`

Chosen control-plane hostnames:

- staging: `console-staging.dollarchain.store`
- production: `console.dollarchain.store`

## Rollout recommendation

### Staging first

1. deploy backend billing/admin env and tables
2. deploy admin console to staging
3. validate sandbox subscription/top-up/webhook flow
4. validate admin auth and audit flow
5. only then consider production enablement

### Production guardrails

- keep the built-in production backend default active for customer installs
- keep hosted billing enabled by default for customer installs
- use `AIVI_BILLING_READY=false` only as a staging/local override when you need to hold billing off temporarily
- keep bootstrap token disabled
- keep admin console outside the customer plugin package
- do not expose billing/admin internals to browser payloads
