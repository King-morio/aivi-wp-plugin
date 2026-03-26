# Phase 5 Milestone 6 End-to-End Validation Matrix

Updated: 2026-03-16

## Purpose

This matrix defines the exact live validation set for Milestone 6 Step 5.

It is the bridge between:

- staging deployment readiness
- sandbox billing validation
- customer entitlement/credit behavior

## Environment assumptions

- backend region: `eu-north-1`
- admin console hostnames:
  - staging: `console-staging.dollarchain.store`
  - production: `console.dollarchain.store`
- CloudFront ACM certificate region for the admin console hostname:
  - `us-east-1`
- WordPress staging has:
  - `AIVI_BILLING_READY=false` only when billing needs to be held off intentionally
- customer/production builds otherwise use:
  - the built-in production backend default
  - hosted billing enabled by default

## Recorded current truth

- Growth introductory pricing has now been validated end to end in sandbox using the dedicated `PAYPAL_PLAN_ID_GROWTH_INTRO` path.
- Keep Scenario 3 below in the matrix anyway as a regression gate if pricing logic or provider mapping changes again.
- Staging super-admin validation is still not release-complete because MFA restoration and one fresh MFA-backed Hosted UI sign-in are still pending.

## Validation scenarios

### 1. Trial lifecycle

- create/connect a trial-backed account
- confirm free-trial balance starts at `5,000` included credits
- confirm free-trial duration resolves to `7 days`
- confirm trial state appears in:
  - WordPress dashboard
  - sidebar account status
  - super-admin account detail
- run one successful analysis
- confirm:
  - reservation written
  - settlement written
  - credits reduced
  - post-run debit shown in sidebar
- force or simulate an expired `trial_expires_at` timestamp
- confirm:
  - trial status resolves to ended
  - analysis is blocked unless a paid subscription is active

### 2. First paid subscription activation

- complete hosted PayPal sandbox subscription checkout
- confirm verified webhook updates:
  - subscription status
  - plan
  - max sites
  - included credits
- confirm WordPress dashboard reflects the new plan
- confirm super-admin account detail matches backend state

### 3. Growth discount / first-cycle pricing

- complete a `growth` sandbox subscription activation
- confirm:
  - checkout intent stored
  - subscription record stored
  - first-cycle plan activation succeeds through the dedicated intro plan mapping
  - checkout intent records the discounted first-cycle price
- note:
  - the pricing logic is primarily PayPal-side through `PAYPAL_PLAN_ID_GROWTH_INTRO`; account entitlements must still resolve correctly after webhook reconciliation

### 4. Top-up purchase

- complete a `topup_25k` purchase
- confirm verified capture:
  - creates top-up order state
  - grants credits once
  - does not double-grant on repeated webhook delivery
- confirm new balance is visible in:
  - WordPress dashboard
  - sidebar account state
  - super-admin account detail

### 5. Successful run settlement

- run analysis on an entitled account with credits available
- confirm:
  - admission succeeds
  - reservation exists
  - worker settles from actual tokens
  - billing summary is attached to run status
  - sidebar shows post-run debit only

### 6. Failed/aborted run refund

- trigger a failed or aborted run path in staging
- confirm:
  - reservation exists
  - refund or zero-charge path executes
  - account balance is restored appropriately
  - no false debit remains in customer-visible state

### 7. Insufficient-credit block

- reduce account credits below needed admission level
- confirm:
  - admission is blocked
  - user sees low-balance blocker only
  - no run is queued
  - no reservation is written

### 8. Suspended/cancelled subscription behavior

- simulate or replay a suspended/cancelled subscription webhook
- confirm:
  - effective entitlements disable analysis
  - customer dashboard reflects billing state
  - sidebar analysis is blocked cleanly
  - super-admin diagnostics show the change

### 9. Super-admin audited intervention

- perform:
  - manual credit adjustment
  - trial extension
  - recovery action
- confirm:
  - audit log entry exists
  - account state updates correctly
  - operator action is attributable by role and reason

### 10. Diagnostics/replay recovery

- force a replay-eligible failed webhook state
- use the super-admin recovery action
- confirm:
  - replay/reconciliation executes once
  - duplicate processing does not double-grant credits
  - diagnostics panel reflects the new state

## Required proof artifacts

Capture and archive:

1. WordPress dashboard before/after subscription activation
2. sidebar blocker screenshot for insufficient credits
3. sidebar post-run debit screenshot for a successful run
4. super-admin account detail screenshot
5. super-admin diagnostics screenshot
6. super-admin audit trail screenshot
7. one verified webhook record
8. one successful settlement summary
9. one refunded failed-run summary

## Pass criteria

Step 5 is complete only when:

1. all scenarios above have been executed in staging/sandbox
2. no secret/provider leakage appears in browser payloads
3. no duplicate credit grant occurs
4. no customer analysis path regresses because of billing/admin state
5. auditability is intact for every operator write action
