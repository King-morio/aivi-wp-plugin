# Live PayPal Pending Subscription Fix Track

## Goal
Stop live PayPal subscription attempts from moving customers onto a paid plan before PayPal actually activates billing, then harden the failure and recovery paths without losing retry safety.

## Milestones
- [x] M1: Preserve the customer's current plan, trial, entitlements, and credits until PayPal sends an activation event, while still marking the subscription as pending approval.
- [x] M2: Clear failed or cancelled pending subscriptions back into a retry-ready customer state and remove stale "waiting for PayPal" messaging.
- [x] M3: Fix webhook bookkeeping and status-name drift so reconciliation outcomes are recorded and surfaced consistently.
- [x] M4: Run focused regression tests for initial signup, pending approval, failed payment, cancelled approval, upgrade flow, and unaffected top-up behavior.

## File Scope

### M1
- Runtime files touched:
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.js`
  - `infrastructure/lambda/orchestrator/billing-checkout-handler.js`
  - `includes/class-admin-settings.php`
- Tests touched:
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
  - `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
- Tracker:
  - `docs/LIVE_PAYPAL_PENDING_SUBSCRIPTION_FIX_TRACK.md`

### M2
- Planned runtime files:
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.js`
  - `includes/class-admin-settings.php`
- Planned tests:
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js` if customer messaging copy/conditions change

### M3
- Runtime files touched:
  - `infrastructure/lambda/orchestrator/billing-store.js`
  - `includes/class-admin-settings.php`
- Tests touched:
  - `infrastructure/lambda/orchestrator/billing-store.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`

### M4
- Tests executed:
  - `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
  - `infrastructure/lambda/orchestrator/billing-store.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`
- Test maintenance completed during sweep:
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js` updated one stale upgrade-delta expectation from `90000` to the current catalog-driven `40000`
