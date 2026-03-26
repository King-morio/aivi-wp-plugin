# Customer Billing and Super-Admin Drift Track

## Purpose

Close the remaining customer-site drifts that sit between:

1. the WordPress customer experience
2. super-admin mutations and lifecycle actions
3. the commercial model behind credits, plans, and top-ups

This track groups related fixes together so we do not create a long chain of tiny milestones for issues that share the same root causes.

## What We Verified

### Customer billing / sidebar surface

- The editor sidebar originally used a generic blocked-analysis message in `assets/js/aivi-sidebar.js` when `analysis_allowed !== true`.
- That blocked copy was not specific enough for paused accounts and still pointed users toward adding credits even when the better next step was restoring the subscription state.
- The connected-account card was too tall and too noisy:
  - it kept trial metadata visible even after the account had moved onto a paid plan
  - it pushed the `Analyze Content` button too far down
  - it mixed primary state, sync state, verification state, and action links in one tall block
- The WordPress settings overview also showed:
  - `Trial status` even after conversion
  - raw `Last result` values including `success_partial`

### Onboarding / email capture

- Free-trial start already had the backend capability to capture `admin_email` from site identity in `account-onboarding-handler.js`.
- The WordPress site identity payload does send `admin_email` from `get_bloginfo( 'admin_email' )`.
- Live staging verification on `2026-03-17` did **not** find `okendo017@gmail.com` in current stored account rows; the affected test rows still returned blank `contact_email`.
- So this gap had two parts:
  - add an explicit email nudge during trial start
  - add a safe persistence/backfill path for blank authoritative rows

### Super-admin mutation propagation

- `site_unbind` and `plan_override` already updated the authoritative backend account state.
- The customer site did not reliably reflect those changes immediately because:
  - the settings page only auto-refreshed remote account summary during pending billing states
  - the editor sidebar refreshed account summary only after analysis activity, not as a general on-load sync
- This explained why super-admin changes could appear correct in the control plane but stale on the customer site even after a hard refresh.

### Unbind semantics

- `site_unbind` means:
  - remove the site binding from the account
  - disconnect the site from that account
- It does not reset the site to a brand-new free-trial state.
- The current deterministic onboarding/account-state model makes automatic trial reset a bad default because it would make trial abuse too easy.

### Connection token delivery

- Operator-issued connection tokens work today.
- The current token system is stateless and signed in `infrastructure/lambda/orchestrator/connection-token.js`.
- Because tokens are not stored as customer-visible records, the user site could not originally:
  - fetch the latest issued token
  - reveal or hide it later
  - copy it from a customer inbox-style surface
- Showing the issued token under `Connection` therefore required a persisted token record or retrieval flow, not just UI polish.

### Help and support

- The `Help` tab already exists in `includes/class-admin-settings.php`.
- The missing work was operational wiring and final polish, not a brand-new tab build.

### Commercial model / credits

- Credits are pooled at the account level across connected sites; they are not duplicated per site.
- The approved first-pass catalog is now:
  - `Starter` = `60,000`
  - `Growth` = `100,000`
  - `Pro` = `250,000`
- The credit multiplier remains `30,000` in `infrastructure/lambda/shared/credit-pricing.js`.
- Official Mistral pricing for the currently deployed families remains:
  - `Mistral Large` = `$0.50 / 1M` input, `$1.50 / 1M` output
  - `Magistral Small` = `$0.50 / 1M` input, `$1.50 / 1M` output
- On pure model-cost math, the plans still carry strong headroom versus direct API cost, so this is not a “3-4% margin” situation.
- Using the current reservation preview helpers instead of ad-hoc past runs, representative reserved debits are:
  - `~1k` base tokens => `490` credits
  - `~2k` base tokens => `572` credits
  - `~4k` base tokens => `776` credits
  - `~8k` base tokens => `1,184` credits
- That translates to the following approximate monthly run capacity:
  - `Starter 60k` => `122 / 104 / 77 / 50` runs at `1k / 2k / 4k / 8k`
  - `Growth 100k` => `204 / 174 / 128 / 84` runs at `1k / 2k / 4k / 8k`
  - `Pro 250k` => `510 / 437 / 322 / 211` runs at `1k / 2k / 4k / 8k`
- A `7%` margin increase should be treated as a separate lever from plan-credit downsizing:
  - `+7%` on the multiplier would move `30,000` to about `32,100`
  - reducing plan credits is a much larger commercial change than a `7%` multiplier increase
- Approved first-pass commercial direction:
  - keep the multiplier at `30,000`
  - keep `Starter` unchanged at `60,000`
  - reduce `Growth` to `100,000`
  - reduce `Pro` to `250,000`
  - leave top-ups unchanged for now

## Brief Answers To Your Questions

1. **Paused message can be made action-specific?**
   - Yes. Best path is to move paused-state guidance into the compact billing/status card and make the blocked sidebar message reflect the real next action.

2. **Should trial disappear once on a paid plan?**
   - Yes.

3. **How do we make the card shorter?**
   - Best path is a compact summary by default plus collapsed secondary details.

4. **Can unbind reset the site to fresh trial?**
   - Not today.
   - We do **not** recommend making that automatic.
   - If we ever want it, it should be a separate audited operator action.

5. **Can issued token appear automatically on the user site?**
   - Yes, but not with the original stateless token-only setup.
   - We needed a stored token record and retrieval path first.

6. **Should credit and consumption review happen last?**
   - Yes. That was the safest place for it.

## Locked Decisions

1. Keep MFA restoration outside this track until the remaining drifts are closed.
2. Treat `site_unbind` as disconnect-only unless we explicitly add a separate “reset trial eligibility” operator action.
3. Fix customer-state propagation before changing pricing, because stale state makes commercial behavior hard to trust.
4. Treat plan-credit resizing and multiplier changes as separate levers; do not change both blindly in one pass.
5. Treat included credits as pooled per account across all connected sites, not as a per-site allowance.
6. For the first commercial recalibration pass, keep the multiplier at `30,000`, leave `Starter` unchanged, reduce `Growth` to `100,000`, reduce `Pro` to `250,000`, and leave top-ups unchanged.

## Milestones

### Milestone 1: Customer Billing Surface and Onboarding UX

Goal:

- clean up the customer-facing sidebar/settings experience without changing the commercial model yet

Scope:

- paused / blocked account copy in the sidebar
- compact connected-account card
- hide trial state once converted / paid
- suppress `success_partial` from customer-facing recent-usage copy
- add the free-trial email nudge and explicit capture UX
- finish the `Help` tab wiring if URLs/config are missing

Acceptance:

- customer sees a clear paused-state action message
- the main billing/status area is compact enough that `Analyze Content` stays easy to reach
- paid users no longer see stale/free-trial emphasis
- trial start captures email smoothly with an explanation

Status:

- complete on `2026-03-17`

Validation record:

- sidebar blocked copy now distinguishes paused, billing-attention, expired-trial, and zero-credit states
- connected-account billing card now defaults to a compact summary and hides secondary details until expanded
- customer-facing trial emphasis now disappears once the account has converted onto a paid plan
- customer-facing `success_partial` output is normalized to `Success`
- free-trial start now opens an email-confirmation modal, explains why email helps, and persists the preferred contact email into onboarding requests
- focused validation passed:
  - `tests/js/sidebar-entitlement-awareness-regression.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`
  - `tests/diagnostics/account-dashboard-contract.test.js`
  - `php -l includes/class-admin-settings.php`
  - `php -l includes/class-rest-backend-proxy.php`

### Milestone 2: Super-Admin Mutation Propagation and Site Lifecycle Truth

Goal:

- make customer sites reflect authoritative backend changes from super-admin actions quickly and truthfully

Scope:

- refresh remote account summary on customer surfaces when super-admin mutations have changed the backend state
- make `plan_override`, pause/restore, and unbind visible on the user site without waiting for an analysis run
- decide and lock unbind semantics in code and docs
- make `contact_email` persist and remain searchable on authoritative account rows, including a safe refresh/backfill path for existing test accounts if needed
- add the customer-visible connection-token delivery/reveal/copy flow if we agree to persist issued tokens

Acceptance:

- plan overrides and pause/unbind actions show up on the user site without confusing stale state
- unbind behavior is explicit and documented
- super-admin email filtering is trustworthy for newly onboarded accounts and no longer blank on the affected test records
- if token self-service is implemented, it is masked by default and copyable on demand

Status:

- complete on `2026-03-17`

Validation record:

- customer surfaces now refresh authoritative account summary on load/focus instead of waiting for a fresh analysis run
- settings hard-refresh now re-syncs authoritative account summary for connected or recently changed account records, not only pending billing states
- account summary refresh now backfills a missing `contact_email` from the customer site's preferred/admin email when the backend row is still blank
- Growth/Pro connection flows now show connected sites plus the latest operator-issued connection token, masked by default with reveal/copy controls
- unbind semantics remain disconnect-only; no automatic trial reset was introduced
- focused validation passed:
  - `infrastructure/lambda/shared/billing-account-state.test.js`
  - `infrastructure/lambda/orchestrator/account-summary-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
  - `tests/js/sidebar-entitlement-awareness-regression.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`
  - `tests/diagnostics/account-dashboard-contract.test.js`
  - `php -l includes/class-admin-settings.php`
  - `php -l includes/class-rest-backend-proxy.php`

### Milestone 3: Commercial Calibration and Credit Policy

Goal:

- rebalance credits, consumption, and packaging only after the customer/admin state layer is trustworthy

Scope:

- review actual reservation + settlement behavior
- implement the approved first-pass catalog decision:
  - keep credit multiplier at `30,000`
  - keep `Starter` at `60,000`
  - reduce `Growth` to `100,000`
  - reduce `Pro` to `250,000`
  - leave top-up packs unchanged for now
- keep room for a later second-pass multiplier review only if actual AWS + support overhead proves it necessary
- align WordPress catalog, backend catalog, contracts, tests, and finance-facing summaries
- record a simple “how many analyses per plan” operator truth table

Acceptance:

- the credit model matches the approved first-pass commercial margin more closely
- plan volumes feel reasonable instead of oversized
- docs and tests reflect the new catalog honestly

Status:

- complete on `2026-03-17`

Validation record:

- the catalog now keeps `Starter` at `60,000`, reduces `Growth` to `100,000`, reduces `Pro` to `250,000`, and leaves top-up packs unchanged
- the credit multiplier remains `30,000`, so debit math stays stable while plan generosity is reduced
- WordPress config, backend catalog, shared billing state, billing contracts, preview data, and focused tests now all agree on the same catalog
- operator truth table for approximate monthly reserved-run capacity now is:
  - `Starter 60k` => `122 / 104 / 77 / 50` runs at `1k / 2k / 4k / 8k`
  - `Growth 100k` => `204 / 174 / 128 / 84` runs at `1k / 2k / 4k / 8k`
  - `Pro 250k` => `510 / 437 / 322 / 211` runs at `1k / 2k / 4k / 8k`
- focused validation passed:
  - `infrastructure/lambda/orchestrator/paypal-config.test.js`
  - `infrastructure/lambda/shared/billing-account-state.test.js`
  - `infrastructure/lambda/orchestrator/account-summary-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `infrastructure/lambda/orchestrator/index.test.js`
  - `tests/diagnostics/account-dashboard-contract.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`

## Suggested Order

1. `Milestone 1` first
2. `Milestone 2` second
3. `Milestone 3` last

## Notes

- The biggest newly verified root cause was state propagation drift, not billing math.
- The current token design became customer-visible only after we added stateful retrieval/storage for the latest issued token.
- The `Help` tab was partially implemented already; the remaining work was configuration and final polish, not a brand-new tab build.
