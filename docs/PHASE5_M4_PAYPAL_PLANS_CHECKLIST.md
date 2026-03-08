# Phase 5 Milestone 4 Checklist

Updated: 2026-03-06

## Goal

Connect AiVI plan billing and credit top-ups to PayPal as the commercial source of truth without exposing payment secrets in WordPress or destabilizing the working Milestone 1–3 account and credit flows.

## Locked Principles

1. WordPress must never hold PayPal secrets.
2. Browser redirects are not the source of truth for billing state.
3. Subscriptions update entitlements only after verified webhook processing.
4. Top-up credits are granted only after verified PayPal capture.
5. Existing trial/account/credit UX must remain stable while billing wiring is introduced.

## Step 1 - PayPal contract, plan catalog, and environment scaffold

### Files

- `infrastructure/lambda/shared/schemas/paypal-billing-contract-v1.json`
- `infrastructure/lambda/orchestrator/paypal-config.js`
- `includes/config.php`
- `docs/PHASE5_PRODUCT_BILLING_RECOMMENDATIONS.md`

### Tasks

- define the canonical billing contract for:
  - plans
  - subscriptions
  - top-up orders
  - webhook event records
  - hosted approval URLs
- encode the agreed commercial catalog:
  - Starter
  - Growth
  - Pro
  - top-up packs
- define safe environment variable names only:
  - client ID
  - secret
  - webhook ID
  - API base
  - plan IDs
- keep this step configuration-only: no live PayPal calls yet

### Acceptance

- billing contract is centralized and versioned
- plan catalog is defined in one place
- no PayPal secrets or raw IDs are exposed to browser payloads

## Step 2 - Backend checkout/session endpoints for subscriptions and top-ups

### Files

- `infrastructure/lambda/orchestrator/paypal-client.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.js`
- `infrastructure/lambda/orchestrator/index.js`
- `includes/class-rest-backend-proxy.php`
- `includes/config.php`

### Tasks

- add secure backend handlers for:
  - create subscription checkout session
  - create top-up checkout session
  - get billing portal / manage-billing redirect when supported
- keep WordPress as a proxy only
- return only safe hosted approval URLs and request IDs to the plugin
- bind checkout intent to:
  - account ID
  - site ID
  - requested plan or top-up pack

### Acceptance

- WordPress can request hosted PayPal checkout flows through the backend proxy
- no subscription mutation happens directly from WordPress
- checkout initiation is auditable and account-bound

## Step 3 - Webhook ingestion and verified reconciliation

### Files

- `infrastructure/lambda/orchestrator/paypal-webhook-handler.js`
- `infrastructure/lambda/orchestrator/paypal-reconciliation.js`
- `infrastructure/lambda/orchestrator/index.js`
- backend storage for:
  - subscriptions
  - paypal_webhook_events
  - top-up order records

### Tasks

- verify PayPal webhook signatures
- ingest and persist webhook payloads idempotently
- reconcile only from verified events for:
  - subscription created
  - subscription activated
  - subscription updated
  - subscription suspended / cancelled
  - payment completed / failed
  - order capture completed
- map webhook outcomes into:
  - account entitlements
  - subscription state
  - credit grants for top-ups

### Acceptance

- subscription and top-up state changes are driven by verified webhook events only
- duplicate webhook deliveries are idempotent-safe
- webhook records are persisted for later diagnostics

## Step 4 - Entitlement and credit updates from billing state

### Files

- `infrastructure/lambda/orchestrator/account-summary-handler.js`
- `infrastructure/lambda/orchestrator/credit-ledger.js`
- `infrastructure/lambda/orchestrator/credit-pricing.js`
- account/subscription persistence modules introduced for billing

### Tasks

- convert verified subscription state into effective account entitlements
- grant monthly included credits on the right subscription cycle boundary
- grant top-up credits on successful one-time captures
- reflect cancellation/suspension/failure states correctly in:
  - account summary
  - dashboard summary
  - analysis admission logic
- preserve existing silent reservation and settlement behavior

### Acceptance

- paid subscription state affects analysis entitlements correctly
- top-up purchases increase usable credit balance correctly
- analysis admission respects reconciled billing state without UI drift

## Step 5 - WordPress billing actions and dashboard controls

### Files

- `includes/class-admin-settings.php`
- `includes/class-assets.php`
- `assets/js/aivi-sidebar.js`
- optional WordPress-side billing action JS if split from existing sidebar/admin scripts

### Tasks

- add customer-visible actions for:
  - upgrade plan
  - downgrade plan
  - buy credits
  - manage billing
- surface only safe plan/billing state in the dashboard
- keep payment actions routed to hosted PayPal flows
- keep customer copy clear about:
  - current plan
  - renewal / cancellation state
  - top-up purchases
  - failed payment / suspended state

### Acceptance

- dashboard has working billing entry points without exposing raw provider data
- customer sees payment/subscription status clearly inside WordPress
- existing analysis/sidebar flows remain intact

## Step 6 - Regression coverage, sandbox validation, and rollout safety

### Files

- `tests/diagnostics/`
- `tests/js/`
- `infrastructure/lambda/orchestrator/*.test.js`
- deploy/runbook docs as needed

### Tasks

- add tests for:
  - plan catalog integrity
  - checkout request validation
  - webhook signature verification path
  - webhook idempotency
  - subscription state reconciliation
  - top-up credit grant reconciliation
  - WordPress proxy payload safety
  - dashboard billing-state rendering
- verify browser payloads do not expose:
  - PayPal secret
  - webhook ID
  - raw provider tokens
- run sandbox/live validation for:
  - trial -> paid
  - top-up purchase
  - payment failure
  - cancelled subscription

### Acceptance

- billing and entitlements survive verified end-to-end flows
- no payment secrets leak into WordPress or browser payloads
- Milestones 1–3 behavior remains green after billing wiring lands
