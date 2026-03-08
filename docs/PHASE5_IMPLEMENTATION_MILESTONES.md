# Phase 5 Implementation Milestones

Updated: 2026-03-08

## Objective

Implement commercial AiVI in a controlled sequence without destabilizing the working Phase 4 analyzer baseline.

## Current Status Snapshot

- Milestone 1: completed
- Milestone 2: completed
- Milestone 3: completed
- Milestone 4: completed
- Milestone 5: formally closed
- Milestone 6: rollout polish and infrastructure hardening

Latest validated outcomes:

- WordPress customer dashboard syncs to authoritative backend account state.
- PayPal top-up flow is validated end to end:
  - checkout
  - return capture
  - `PAYMENT.CAPTURE.COMPLETED`
  - credit grant
- PayPal subscription flow is validated end to end:
  - checkout
  - `BILLING.SUBSCRIPTION.CREATED`
  - `BILLING.SUBSCRIPTION.ACTIVATED`
  - effective `starter / active` state
- Analysis and credits coexist cleanly:
  - entitled analysis admitted
  - run status polling repaired
  - completed analysis consumes credits correctly
- Customer credit displays now stay coherent after completed runs:
  - sidebar account state refreshes from authoritative backend summary
  - WordPress settings/dashboard no longer remain stuck on stale balances
  - duplicate post-run debit card removed from the sidebar
- Live API Gateway drift was resolved by adding the missing route:
  - `GET /aivi/v1/analyze/run/{run_id}`

## Phase 5 Closeout Decision

Phase 5 is complete.

Why:

- customer billing and dashboard flows are validated in sandbox
- subscription and top-up lifecycles are both proven
- analysis admission, completion, and credit settlement coexist correctly
- WordPress customer UI and backend account state now stay aligned after live runs
- the remaining tasks are deployment/runtime polish, not Phase 5 feature correctness

This plan assumes the decisions in:

- `docs/PHASE5_PRODUCT_BILLING_RECOMMENDATIONS.md`

are accepted, including:

- separate super admin control plane
- subscription plans plus top-up credits
- silent preflight reservation
- post-run debit display only
- actual-token-cost billing with credit conversion
- PayPal as the payment provider

## Locked Principles

1. Do not expose billing secrets or PayPal credentials inside WordPress.
2. Do not break the current analysis pipeline while adding billing.
3. Do not ship monetization before credit settlement and entitlement checks are correct.
4. Do not re-enable `Fix with AI` as a paid promise in this phase.

## Milestone 1 - Identity, Site Connection, and Entitlements Foundation

### Goal

Create the account/site/plan model and replace raw backend setup in WordPress with account connection.

### Scope

- backend account identity
- site registration and connection token flow
- plan and entitlement lookup
- WordPress plugin connection state

### Backend tasks

- add account data model:
  - `accounts`
  - `sites`
  - `plans`
  - `subscriptions`
  - `feature_overrides`
- add API endpoints for:
  - connect site
  - fetch account/plan summary
  - validate entitlement for a site
- issue and validate site connection tokens
- bind `site_id` from WordPress to a backend account record

### WordPress plugin tasks

- replace backend/API-key setup UX in:
  - `includes/class-admin-settings.php`
- add account connection state UI:
  - connected
  - not connected
  - wrong site / revoked
- localize only safe account summary fields through:
  - `includes/class-assets.php`
- gate analysis start on valid connected entitlement

### Candidate file areas

- `includes/class-admin-settings.php`
- `includes/class-assets.php`
- `includes/class-rest-backend-proxy.php`
- `includes/class-rest-ping.php`
- `assets/js/aivi-sidebar.js`
- `infrastructure/lambda/orchestrator/`
- new backend auth/entitlement handlers

### Acceptance

- a WordPress site can connect to exactly one AiVI account
- customer no longer needs to configure backend URL or raw API key
- plugin can fetch account and plan summary safely
- analysis can be blocked cleanly when site entitlement is invalid

## Milestone 2 - Credit Ledger, Silent Reservation, and Settlement

### Goal

Implement the actual credit system behind the analyzer without changing the visible analysis UX.

### Scope

- credit ledger
- silent affordability check at preflight
- reservation before run
- exact post-run settlement from actual token usage
- refund logic for failed runs

### Backend tasks

- add data model:
  - `credit_ledger`
  - `usage_events`
- implement credit rules:
  - use actual `input_tokens` and `output_tokens`
  - convert raw cost to credits with the agreed multiplier
- perform silent preflight reservation
- finalize actual debit when run completes
- auto-refund on failed/no-result runs
- store rate snapshot with every settlement event

### WordPress plugin tasks

- show current credit balance in customer dashboard
- after analysis, show:
  - credits used
  - previous balance
  - current balance
- show low-balance blocker only when the run cannot be admitted
- do not show preflight estimates in the normal sidebar UX

### Candidate file areas

- `assets/js/aivi-sidebar.js`
- `includes/class-assets.php`
- `includes/class-rest-backend-proxy.php`
- `infrastructure/lambda/orchestrator/analyze-run-handler.js`
- `infrastructure/lambda/orchestrator/run-status-handler.js`
- `infrastructure/lambda/orchestrator/index.js`
- new ledger/usage handlers

### Acceptance

- a successful run creates a settled debit entry
- a failed run creates a refund or zero-charge path
- sidebar shows only post-run debit information
- no visible estimate is shown unless balance is insufficient

## Milestone 3 - Customer Dashboard Inside WordPress

### Goal

Turn the AiVI settings/admin area into a real customer account dashboard.

### Scope

- plan display
- credit balance
- subscription status
- billing actions
- recent usage and analysis summary

### WordPress UI tasks

- replace development-oriented settings view with:
  - plan card
  - credit balance card
  - usage this month
  - connected site card
  - billing/manage plan actions
  - support/help block
- keep advanced operational settings hidden from normal customers
- retain plugin-safe operational flags internally, not as public plan controls

### Backend tasks

- expose dashboard summary endpoint:
  - plan
  - subscription status
  - next renewal date
  - included credits
  - remaining credits
  - top-up credits
  - recent usage

### Candidate file areas

- `includes/class-admin-menu.php`
- `includes/class-admin-settings.php`
- `includes/class-assets.php`
- new WordPress-side account dashboard renderer
- backend account summary handlers

### Acceptance

- customer sees account and billing status inside WordPress
- customer no longer sees backend URL/API-key/token-cutoff configuration
- customer can clearly understand available credits and current plan

## Milestone 4 - PayPal Plans, Top-Ups, and Webhooks

### Goal

Connect plan billing and top-up purchase flows to PayPal as the source of truth.

### Scope

- recurring plan subscriptions
- discounted first month for Growth
- one-time top-up purchases
- webhook reconciliation

### Backend tasks

- implement PayPal subscription flow for:
  - Starter
  - Growth
  - Pro
- implement one-time top-up order flow
- build webhook handlers for:
  - subscription created/activated/updated/cancelled
  - payment completed/failed
  - order capture completed
- reconcile entitlements from verified webhook events only
- store PayPal identifiers against accounts/subscriptions/orders

### WordPress tasks

- add actions for:
  - upgrade plan
  - downgrade plan
  - buy credits
  - manage billing
- route user to secure hosted billing flow
- display payment/subscription status returned from backend

### Candidate file areas

- backend billing service handlers
- webhook ingestion handlers
- `includes/class-rest-backend-proxy.php`
- `includes/class-assets.php`
- WordPress admin/dashboard UI files

### Acceptance

- paid subscription updates account entitlements after verified webhook
- top-up purchase credits the ledger after verified capture
- billing failures/suspensions reflect correctly in account state

## Milestone 5 - Super Admin Control Plane

### Goal

Create the operator-facing control plane for support, credits, and subscription management.

### Scope

- account search
- subscription and credit visibility
- manual credit adjustments
- support controls
- webhook diagnostics

### Backend/admin tasks

- build super admin UI outside WordPress
- add operator capabilities:
  - view accounts
  - search by email/domain/site/subscription ID
  - view balances and recent usage
  - grant/deduct credits
  - extend trial
  - suspend/reactivate account
  - revoke site connection
  - replay failed webhook events
  - add support notes
- add immutable audit logging for manual operator actions

### Acceptance

- super admin can fully support customers without touching their WordPress install
- manual credit actions write to the ledger and audit log
- operator can diagnose PayPal webhook failures safely

## Milestone 6 - Hardening, Packaging, and Rollout

### Goal

Prove the monetized product works cleanly before customer rollout.

### Scope

- regression coverage
- entitlement gating
- billing reconciliation safety
- release packaging

### Tasks

- add tests for:
  - site connection
  - entitlement denial
  - credit reservation
  - post-run settlement
  - refund paths
  - PayPal webhook reconciliation
  - dashboard rendering with real account states
- verify no sensitive billing data is exposed to browser payloads
- verify release package excludes internal billing/admin files where appropriate
- run live end-to-end tests:
  - trial account
  - paid subscription
  - top-up purchase
  - insufficient-balance block
  - cancelled subscription behavior

### Acceptance

- billing and entitlements survive end-to-end testing
- no customer-visible secrets leak
- WordPress plugin remains stable with or without an active paid plan

## Suggested Build Order

Use this exact sequence:

1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5
6. Milestone 6

Reason:

- identity and site binding must exist before credits
- credits must exist before paid plans
- paid plans must exist before super admin operations are meaningful

## Rollout Notes

- keep Phase 4 analyzer behavior intact while building Phase 5
- ship customer dashboard only after backend entitlements are ready
- hide billing UI behind a platform readiness flag until PayPal webhook reconciliation is proven
- do not promise rewrite automation as part of plan differentiation yet
