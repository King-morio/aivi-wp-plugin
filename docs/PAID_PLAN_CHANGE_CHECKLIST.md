# Paid Plan Change Checklist

## Step 1 — Add PayPal revise support
- [x] Add a PayPal client method for revising an existing subscription to a higher paid plan.
- [x] Route active paid upgrades through PayPal revise instead of support-only blocking.
- [x] Persist the revise checkout intent with the current subscription reference and target plan.

## Step 2 — Add plan-change intent state handling
- [x] Track pending upgrade intents distinctly from first-time subscription checkout intents.
- [x] Update billing reconciliation to understand pending plan changes and mark account state safely.

## Step 3 — Update customer billing UI
- [x] Replace support-only upgrade copy with self-serve upgrade copy.
- [x] Keep downgrades as renewal-scheduled only.

## Step 4 — Extend refresh/sync behavior
- [x] Reuse the existing billing return/account summary refresh path so revised subscriptions update the WP dashboard without manual refresh.

## Step 5 — Regression and live validation
- [ ] Add coverage for revise flow, no-overlap guarantees, and downgrade scheduling.
- [ ] Validate on a public HTTPS customer site.
