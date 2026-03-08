# Phase 5 Billing Component Closeout

## Scope
This closeout covers the customer billing/dashboard path introduced in Phase 5:

- account overview sync in WordPress
- PayPal top-up checkout
- PayPal subscription checkout
- billing return handling
- webhook-driven credit/subscription reconciliation

## Locked product rule
- Analysis access requires an active trial or subscription.
- Top-up credits extend active access; they do not unlock analysis on their own.

## Live validations completed
- WordPress customer dashboard syncs to authoritative backend state.
- Top-up checkout intent creation works.
- Top-up PayPal return capture works.
- `PAYMENT.CAPTURE.COMPLETED` grants credits once.
- Credited top-up balance is reflected in backend account state.
- Subscription checkout intent creation works.
- `BILLING.SUBSCRIPTION.CREATED` is recorded.
- `BILLING.SUBSCRIPTION.ACTIVATED` is recorded.
- Effective plan state moved to `starter / active`.
- Entitled analysis run completes successfully and debits credits against the active account state.
- Live polling path was repaired by adding the missing API route:
  - `GET /aivi/v1/analyze/run/{run_id}`

## UX cleanup completed
- Settings page moved to quieter tabbed layout.
- Billing copy now states that credits extend an active trial/subscription.
- Billing-return refresh copy no longer contains mojibake.
- Billing return now performs one bounded follow-up account refresh for:
  - `subscription_pending`
  - `topup_capture_pending_credit`
  - `topup_capture_received`

## Operational notes
- Cloudflare quick tunnels were sufficient for sandbox validation, but they are not stable enough for staging UX.
- Staging/production should use stable public hostnames:
  - `console-staging.dollarchain.store`
  - `console.dollarchain.store`
- Customer WordPress staging also needs a stable public HTTPS host for reliable PayPal return/cancel behavior.

## Remaining non-blocking follow-ups
- Clean up internal admin diagnostics so reconciled webhooks never look misleading in raw detail views.
- Remove stale historical sandbox intents/subscriptions from the staging seed account if you want a cleaner support/admin view.
- Re-run a final sanity check after moving from quick tunnel URLs to a stable staging hostname.

## Release view
This billing component is functionally ready for controlled staging use.
