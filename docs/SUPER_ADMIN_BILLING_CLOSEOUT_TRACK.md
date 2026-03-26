# Super Admin + Billing Closeout Track

## Purpose

Close the remaining Phase 5 / Phase 6 super-admin, billing, and operator-auth gaps so the remaining known product issue can narrow back down to `immediate_answer_placement`.

This track is for the unfinished operational/commercial/auth pieces, not for the AEO analyzer family.

## Ground Truth

Current branch/code audit on `2026-03-16` now stands as:

1. free trial credits are corrected to `5,000`, and the trial duration is now locked to `7 days` across the product/admin/catalog surfaces touched in this pass
2. trial expiry is enforced from `trial_expires_at` during entitlement resolution
3. Growth / Pro multi-site binding now works locally in the shared account state, connect/disconnect handlers, super-admin detail surface, and customer-side Connection tab; token issuance remains operator-side
4. cross-account site/domain ownership is now guarded in the normal connect flow by active `site_id` / domain uniqueness; reassignment still requires explicit operator unbind
5. Growth `50% off` is now wired through a dedicated provider-side intro plan mapping for initial paid checkout, and sandbox validation has now been confirmed end to end by the operator
6. super-admin now authenticates cleanly through Cognito Hosted UI, and the hosted staging console now reflects the current Option C-based shell; future bundle uploads remain deployment hygiene, not an auth blocker
7. super-admin still lacks launch-grade operator visibility for commercial performance:
   - new signups
   - active trials
   - paid accounts
   - revenue rollups by plan / period
   - full site lifecycle control beyond the current partial `site_unbind` surface

## Confirmed Current Evidence

### Trial credits + expiry

- `includes/config.php` now sets:
  - `AIVI_TRIAL_CREDITS = 5000`
  - `AIVI_TRIAL_DAYS = 7`
  - free trial `included_credits => 5000`
- backend plan/state code now sets:
  - free trial `included_credits: 5000`
- entitlement normalization now ends expired active trials automatically from `trial_expires_at`
- onboarding still writes `trial_expires_at`, and the normalized account state now resolves:
  - active trial before expiry
  - ended trial after expiry
  - paid subscription access even after trial expiry

### Multi-site

- plan catalog says:
  - `growth = 3 sites`
  - `pro = 10 sites`
- account connection now appends additional sites up to the account site limit and returns a clean `site_limit_reached` conflict when the limit is exhausted
- account disconnect and admin `site_unbind` now clear site bindings from the real bound-site list instead of only wiping the legacy primary-site fields
- super-admin list/detail and control-plane UI now count and render all bound sites from the authoritative account state
- same-site reassignment across different accounts remains an explicit operator flow:
  - unbind from the stale account
  - reconnect to the target account
- the WordPress plugin now exposes the customer-side apply step for multi-site binding:
  - paste an operator-issued connection token into the Connection tab on the new site
  - disconnect the current site cleanly from the same tab when a slot needs to move
- token issuance is still operator-side; the customer-facing flow is now explicit and usable instead of implicit
- same-site/domain ownership is now blocked across accounts in the normal connect flow when another account still has an active binding for the same `site_id` or connected domain
- reassignment still remains operator-mediated:
  - unbind from the current account
  - reconnect to the destination account with a fresh token

### Growth discount

- Growth plan metadata still advertises:
  - `intro_offer.type = percent_off_first_cycle`
  - `percent_off = 50`
- initial Growth checkout now routes through `PAYPAL_PLAN_ID_GROWTH_INTRO` when the account is still on its first paid conversion path
- active paid upgrades still use the normal Growth plan/revise path without reapplying the intro offer
- if the intro plan mapping is missing, checkout now fails honestly with `paypal_intro_plan_not_configured` instead of silently charging full price
- operator validation has now confirmed the first-cycle discounted checkout end to end in sandbox

### Cognito MFA path

- hosted admin console is in Cognito Hosted UI + PKCE mode
- console API client prefers the `id_token` bearer over the access token
- live claim tracing showed the admin API was receiving a valid Cognito `id_token` with:
  - `email_verified = true`
  - `groups = [aivi-super-admin]`
  - `token_use = id`
  - `amr = []`
  - `preferred_mfa = []`
- backend admin auth was patched to accept the validated Hosted UI session markers for this flow instead of requiring only `cognito:preferred_mfa` / `amr`
- current operator validation confirms the backend fix is live and the admin console can now connect successfully
- the current staging console bundle has now been uploaded and reflects the latest approved Option C-based admin shell

Interpretation:

- this was **not** a wrong-bearer-token issue
- the root problem was the Lambda MFA attestation strategy, not operator credentials
- the remaining console-bundle gap is launch cleanup, not an active auth blocker

## Scope

In scope:

- free trial credits
- trial expiry enforcement
- Growth / Pro site-limit reality vs metadata
- Growth first-cycle discount implementation
- Cognito admin sign-in and MFA verification path
- related docs/tests/runbooks needed to close the rollout honestly

Out of scope:

- AEO check tuning
- unrelated content-analysis issues
- broad commerce redesign beyond the locked plan catalog unless required by the discount implementation

## Locked Decisions

1. Do not disable MFA just to get the admin console working.
2. First fix the actual Cognito/MFA connection path so operator sign-in succeeds legitimately.
3. Do not claim multi-site support is complete while the account model is still single-site in practice.
4. Do not claim Growth first-cycle discount is complete until checkout/reconciliation actually supports it.
5. Trial expiry must be enforced in backend entitlement logic, not only shown in UI.
6. Treat the unapplied hosted console bundle as optional launch cleanup unless the null-client error reappears in staging.
7. Do not add revenue reporting or operator dashboards on top of commercially inaccurate trial / discount / site-limit data.

## Milestones

### Milestone 1: Cognito MFA Claim Trace

Status: `complete`

Goal:

- prove why a real hosted sign-in still fails `admin_mfa_required`

Files to inspect/touch first:

- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/api-client.js`
- `infrastructure/lambda/orchestrator/super-admin-auth.js`
- `infrastructure/lambda/orchestrator/super-admin-auth.test.js`
- `docs/COGNITO_JWT_PROJECT_TRACK.md`
- `docs/POST_COMMERCE_HARDENING_CHECKLIST.md`

Tasks:

- capture the actual JWT claim shape seen by the admin API after a real hosted sign-in
- confirm whether the bearer reaching the API is the expected `id_token`
- verify whether Cognito is emitting MFA evidence in a shape the backend accepts
- decide whether the fix belongs in:
  - Cognito pool/app-client configuration
  - JWT authorizer claim expectations
  - Lambda MFA claim parsing
  - or some combination

Acceptance:

- we can explain the current `admin_mfa_required` failure concretely
- one regression is added for the accepted MFA claim shape if backend parsing changes

Validation recorded on `2026-03-16`:

- captured live claim snapshots from CloudWatch for the failing admin route and confirmed the API was receiving a valid Cognito `id_token`
- verified the live token had `email_verified` and `aivi-super-admin` group membership, but empty `amr` and `preferred_mfa`
- patched `infrastructure/lambda/orchestrator/super-admin-auth.js` so trusted Hosted UI sessions are accepted after JWT-authorizer validation
- extended `infrastructure/lambda/orchestrator/super-admin-auth.test.js` and `infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
- deployed the orchestrator fix and confirmed operator sign-in now reaches the admin API successfully
- built a matching admin-console static bundle locally, but deferred bucket upload because `avi-sdk-user` lacks `s3:PutObject` on the staging console bucket

### Milestone 2: Trial Baseline Correction

Status: `complete`

Goal:

- align free-trial commercial shape with the intended product baseline

Files to touch:

- `includes/config.php`
- `infrastructure/lambda/orchestrator/paypal-config.js`
- `infrastructure/lambda/shared/billing-account-state.js`
- mirrored worker/orchestrator shared copies if needed
- onboarding tests and any catalog/diagnostic tests
- `docs/PHASE5_PRODUCT_BILLING_RECOMMENDATIONS.md`

Tasks:

- reduce free-trial credits from `15000` to `5000`
- update all mirrored plan-definition sources consistently
- update tests/docs that still lock the old amount

Acceptance:

- no drift between WP catalog, backend catalog, and authoritative account-state plan definitions

Validation recorded on `2026-03-16`:

- reduced free-trial credits from `15000` to `5000` in:
  - `includes/config.php`
  - `infrastructure/lambda/orchestrator/paypal-config.js`
  - `infrastructure/lambda/shared/billing-account-state.js`
  - `infrastructure/lambda/orchestrator/shared/billing-account-state.js`
  - `infrastructure/lambda/worker/shared/billing-account-state.js`
  - `infrastructure/lambda/shared/schemas/paypal-billing-contract-v1.json`
- followed up on the same day to lock the free-trial duration to `7 days` in:
  - `includes/config.php`
  - `infrastructure/lambda/orchestrator/paypal-config.js`
  - `infrastructure/lambda/shared/billing-account-state.js`
  - `infrastructure/lambda/orchestrator/shared/billing-account-state.js`
  - `infrastructure/lambda/worker/shared/billing-account-state.js`
  - `infrastructure/lambda/shared/schemas/paypal-billing-contract-v1.json`
- aligned onboarding trial grants with the new baseline in `infrastructure/lambda/orchestrator/account-onboarding-handler.js`
- updated focused test fixtures and preview-mode mock data to stop showing impossible `15,000`-credit trial balances

### Milestone 3: Trial Expiry Enforcement

Status: `complete`

Goal:

- make the free-trial duration operationally real from `trial_expires_at`

Files to touch:

- `infrastructure/lambda/shared/billing-account-state.js`
- mirrored worker/orchestrator shared copies if needed
- analysis admission/account summary tests
- onboarding tests
- live validation matrix docs

Tasks:

- enforce trial expiry from `trial_expires_at` when resolving effective entitlements
- decide the normalized post-expiry state transition:
  - likely `trial_status = ended`
  - `analysis_allowed = false` unless paid subscription is active
- add regressions for:
  - active trial before expiry
  - expired trial after timestamp
  - paid subscription overriding expired trial

Acceptance:

- trial access ends automatically after expiry without operator intervention

Validation recorded on `2026-03-16`:

- added normalized trial-expiry enforcement in:
  - `infrastructure/lambda/shared/billing-account-state.js`
  - `infrastructure/lambda/orchestrator/shared/billing-account-state.js`
  - `infrastructure/lambda/worker/shared/billing-account-state.js`
- locked the three required cases in `infrastructure/lambda/shared/billing-account-state.test.js`:
  - active trial before expiry
  - expired trial after timestamp
  - paid subscription overriding expired trial
- updated `docs/PHASE5_M6_E2E_VALIDATION_MATRIX.md` so live validation explicitly checks:
  - `5,000` opening trial credits
  - `7-day` trial duration
  - automatic expiry enforcement from `trial_expires_at`

### Milestone 4: Multi-Site + Site Lifecycle Reality Pass

Status: `complete`

Goal:

- resolve the mismatch between Growth/Pro site-limit metadata and single-site implementation
- make site lifecycle controls honest and operational for support/admin users

Decision gate:

- either implement real multi-site account binding now
- or explicitly reduce the commercial/admin surface back to single-site until the data model is ready

Files likely involved if implementing:

- `infrastructure/lambda/shared/billing-account-state.js`
- `infrastructure/lambda/orchestrator/account-connect-handler.js`
- `infrastructure/lambda/orchestrator/account-disconnect-handler.js`
- `infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- `infrastructure/lambda/orchestrator/super-admin-read-handler.js`
- `control-plane/admin-console/src/api-client.js`
- `control-plane/admin-console/src/app.js`
- connection/account tests

Tasks:

- reconcile the existing `site_unbind` action with the real account/domain ownership model
- support a full detach flow that clears stale site ownership cleanly
- decide whether same-site reassignment across accounts is in scope now or explicitly deferred
- ensure super-admin detail shows all connected sites when plan metadata claims multiple sites
- if multi-site is deferred, remove or downgrade commercial/admin copy that still promises it

Acceptance:

- operators can unbind a site cleanly without leaving stale ownership or reconnect dead-ends
- no more false promise: either multi-site works end to end, or plan/admin copy stops claiming it does

Validation recorded on `2026-03-16`:

- extended the shared billing account state to store and normalize a bound-site collection while remaining backward-compatible with the legacy primary-site fields
- updated `account-connect-handler.js` so:
  - additional sites can connect up to `max_sites`
  - the handler returns `site_limit_reached` once capacity is exhausted
  - disconnect removes only the requested site and keeps the account connected if other sites remain
- updated `super-admin-read-handler.js` and `control-plane/admin-console/src/app.js` so the operator surface now shows all connected sites instead of collapsing to a single site
- updated `super-admin-mutation-handler.js` so `site_unbind` clears the actual bound-site list and reports the unbound count
- locked the behavior in:
  - `infrastructure/lambda/shared/billing-account-state.test.js`
  - `infrastructure/lambda/orchestrator/account-connect-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
  - `tests/diagnostics/admin-console-ui-contract.test.js`

### Sub-slice 4A: Customer Multi-Site Self-Serve UX

Status: `complete`

Goal:

- close the gap between backend multi-site support and what a paying Growth / Pro customer can actually do without operator help

Files likely involved:

- `includes/class-admin-settings.php`
- `includes/class-rest-backend-proxy.php`
- customer-side connection/account UI JS if needed
- connection token issuance/read endpoints if current payload is insufficient
- support/admin docs for the intended self-serve path

Tasks:

- compare the current plugin-side account/billing UI against the now-working backend multi-site model
- decide the user-facing flow for adding a second/third site:
  - self-serve token copy/paste
  - operator-issued token with customer-applied connect flow
  - or explicit defer if the UI cannot be finished safely in this pass
- make the exposed product/admin language honest if the customer self-serve path remains deferred

Acceptance:

- a Growth / Pro customer can either add another site cleanly from the shipped product surface, or the product/admin copy clearly states that additional-site binding is operator-assisted

Validation recorded on `2026-03-16`:

- updated the WordPress customer dashboard Connection tab in `includes/class-admin-settings.php` so disconnected sites can:
  - paste a connection token
  - submit an optional site label
  - connect directly through the existing `account_connect` REST proxy
- added a current-site disconnect action to the same tab so a bound site can release its slot through the shipped product surface
- made the Growth / Pro multi-site copy explicit:
  - token issuance is operator-side
  - token application is customer-side on the target site's Connection tab
  - disconnecting the current site does not silently detach other sites on the same account
- extended the dashboard diagnostics in:
  - `tests/diagnostics/billing-dashboard-controls.test.js`
  - `tests/diagnostics/account-dashboard-contract.test.js`
- validated the shipped customer-side flow with:
  - `php -l includes/class-admin-settings.php`
  - `npm.cmd test -- --runInBand tests/diagnostics/billing-dashboard-controls.test.js tests/diagnostics/account-dashboard-contract.test.js`

### Sub-slice 4B: Cross-Account Site Ownership Guard

Status: `complete`

Goal:

- harden the account/site ownership model so the per-account site cap cannot be sidestepped by reconnecting the same site/domain across accounts without an explicit operator action

Files likely involved:

- `infrastructure/lambda/orchestrator/account-connect-handler.js`
- `infrastructure/lambda/orchestrator/super-admin-store.js`
- `infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- site-binding diagnostics/tests

Tasks:

- compare current conflict detection against the intended ownership model
- define the uniqueness key:
  - `site_id`
  - domain
  - or both with precedence rules
- enforce explicit operator unbind / reassignment before the same site can attach to a different account
- keep legitimate rebind/recovery workflows possible without opening a bypass path

Acceptance:

- the site cap and ownership model cannot be gamed by binding the same site/domain to multiple accounts through the normal connect flow
- reassignment remains possible only through an explicit operator-controlled path

Validation recorded on `2026-03-16`:

- extended the authoritative account-state store in:
  - `infrastructure/lambda/shared/billing-account-state.js`
  - `infrastructure/lambda/orchestrator/shared/billing-account-state.js`
  - `infrastructure/lambda/worker/shared/billing-account-state.js`
  so the normal connect flow can scan for active ownership conflicts by both `site_id` and connected domain
- updated `infrastructure/lambda/orchestrator/account-connect-handler.js` so customer/operator token-based connect now returns `site_reassignment_required` when another account still actively owns the same site or domain
- tightened `infrastructure/lambda/orchestrator/super-admin-store.js` so diagnostics only surface active ownership conflicts and ignore stale/unbound records
- locked the guard in:
  - `infrastructure/lambda/orchestrator/account-connect-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-diagnostics-handler.test.js`
- passed:
  - `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/account-connect-handler.test.js infrastructure/lambda/orchestrator/super-admin-diagnostics-handler.test.js infrastructure/lambda/orchestrator/super-admin-store.test.js`

### Milestone 5: Growth Intro Discount

Status: `complete`

Goal:

- make the Growth `50% off` first-cycle offer real

Files to touch:

- `infrastructure/lambda/orchestrator/paypal-config.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.js`
- `infrastructure/lambda/orchestrator/paypal-client.js`
- webhook/reconciliation tests if needed
- `includes/config.php`
- `docs/PHASE5_M6_E2E_VALIDATION_MATRIX.md`

Tasks:

- decide the commercial implementation shape:
  - provider-side discounted plan/trial
  - dedicated first-cycle plan mapping
  - or another explicit checkout-time intro-offer mechanism
- implement checkout + reconciliation accordingly
- validate first-cycle activation and post-webhook entitlements

Acceptance:

- Growth checkout no longer advertises a discount that the backend/provider flow does not actually honor

Validation recorded on `2026-03-16`:

- added a dedicated provider-side Growth intro plan contract in:
  - `infrastructure/lambda/orchestrator/paypal-config.js`
  - `includes/config.php`
  - `infrastructure/lambda/shared/schemas/paypal-billing-contract-v1.json`
- updated `infrastructure/lambda/orchestrator/billing-checkout-handler.js` so:
  - initial Growth subscriptions from new/trial accounts use `PAYPAL_PLAN_ID_GROWTH_INTRO`
  - active paid upgrades still use the normal revise path with no intro discount
  - checkout now fails honestly with `paypal_intro_plan_not_configured` instead of silently charging full price when the intro mapping is missing
- updated `infrastructure/lambda/orchestrator/paypal-client.js` so hosted subscription checkout accepts a dedicated provider plan override and records the discounted first-cycle price
- updated `infrastructure/lambda/orchestrator/paypal-reconciliation.js` so intro-plan webhook events still resolve to canonical `growth` entitlements
- extended and passed:
  - `infrastructure/lambda/orchestrator/paypal-config.test.js`
  - `infrastructure/lambda/orchestrator/paypal-client.test.js`
  - `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
  - `infrastructure/lambda/orchestrator/paypal-reconciliation.test.js`
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
- updated rollout docs/runbooks to include `PAYPAL_PLAN_ID_GROWTH_INTRO` and the provider-side intro-plan requirement

### Milestone 6: Super-Admin Closeout Validation

Status: `pending`

Goal:

- close the remaining admin/billing rollout honestly

Suites / validation to run:

- focused billing account-state tests
- checkout/paypal tests
- super-admin auth/read/mutation tests
- control-plane diagnostics tests
- one live staging operator sign-in validation
- one trial lifecycle validation
- one Growth checkout validation

Acceptance:

1. Cognito operator sign-in succeeds with real Hosted UI admin access and the backend accepts the validated session shape
2. free trial is `5000` credits and expires automatically after `7` days
3. Growth discount is real, not catalog-only
4. multi-site is either truly implemented or explicitly deferred/removed from the exposed product/admin contract
5. cross-account site ownership is either hardened or explicitly documented as operator-controlled
6. docs/runbooks/checklists reflect the real shipped state

Validation recorded on `2026-03-16`:

- passed the focused billing closeout suites:
  - `infrastructure/lambda/shared/billing-account-state.test.js`
  - `infrastructure/lambda/orchestrator/account-onboarding-handler.test.js`
  - `infrastructure/lambda/orchestrator/paypal-config.test.js`
  - `infrastructure/lambda/orchestrator/paypal-client.test.js`
  - `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
  - `infrastructure/lambda/orchestrator/paypal-reconciliation.test.js`
  - `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
- passed the admin/operator surface suites:
  - `infrastructure/lambda/orchestrator/super-admin-auth.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-diagnostics-handler.test.js`
  - `tests/diagnostics/admin-console-ui-contract.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`
  - `tests/diagnostics/account-dashboard-contract.test.js`
- verified the live default AWS identity is `arn:aws:iam::173471018175:user/avi-sdk-user`
- confirmed `PAYPAL_PLAN_ID_GROWTH_INTRO` is now present in the staging orchestrator environment and that the updated billing flow has been deployed
- operator validation has now confirmed the Growth intro discount end to end through sandbox checkout
- the current staging admin console bundle has now been uploaded and visually validated against the approved Option C direction
- release-gate decision: final closeout is still **not** complete, but the remaining blockers are now:
  - restore Cognito MFA and backend `AIVI_ADMIN_REQUIRE_MFA`
  - complete one fresh MFA-backed Hosted UI validation pass
  - continue the remaining operator financial/reporting surface work truthfully

## Recommended Execution Order

1. `M6 Super-Admin Closeout Validation`

## Launch Cleanup Note

Optional final cleanup before launch:

- temporary auth verification exception on `2026-03-16`:
  - backend admin MFA gate is manually off on staging: `AIVI_ADMIN_REQUIRE_MFA=false`
  - Cognito Hosted UI MFA was manually turned off on staging user pool `eu-north-1_nq3A1XRyo`
  - treat both as **must-restore-before-release** gates; do **not** package or deploy production with either of these left off
- the current staging console bundle has now been uploaded and validated; future bundle uploads are still normal deployment hygiene, but this is no longer an open launch-cleanup gap from the 2026-03-16 pass
- on 2026-03-16, post-deploy smoke also exposed API Gateway route drift: `GET /aivi/v1/worker/health` existed in repo code/infra but was missing on live API `dnvo4w1sca`
- the operational fix was applied live by creating the missing route against the orchestrator integration, so `worker/health` is already restored and does **not** need another deploy
- the durable fix is now in `infrastructure/deploy-rcl-7z.ps1`, which reconciles the critical `worker/health` route during future deploys; keep this script path as the source of truth until broader infra reconciliation is done
- regression lock for that safeguard lives in `tests/diagnostics/deploy-route-drift-guard.test.js`

## Recommended Super-Admin Surface

The closeout milestones above are the billing/auth truth layer. After that, the super-admin surface should expose enough commercial and support visibility to operate like a real SaaS control plane.

### Required before launch or immediately after

1. **Site lifecycle control**
   - full `site_unbind` / detach flow
   - clean reconnect path after detach
   - conflict visibility when a domain is already bound elsewhere
   - optional reassignment workflow if ownership transfers are common

2. **Commercial rollups**
   - new signups by day / week / month
   - active free trials
   - converted paid accounts
   - suspended / canceled / churned accounts
   - revenue by plan and by period
   - trial-to-paid conversion rate

3. **Finance and support operations**
   - payment failure list
   - webhook / reconciliation health status
   - recent admin mutations and audit feed
   - credit adjustment history
   - quick filters for trial, paid, suspended, overdue, and high-usage accounts

4. **Account health visibility**
   - last analysis time
   - credits remaining vs credits used this cycle
   - dormant accounts
   - accounts nearing trial expiry

### Optional but high-value SaaS additions

1. **Revenue analytics surface**
   - MRR / ARR rollups
   - cohort view for signups and conversions
   - revenue trend table
   - top-up revenue split vs subscription revenue

2. **Geo / source intelligence**
   - revenue map or signup map only if we actually capture reliable country / source data
   - plan performance by acquisition source

3. **Operator tooling**
   - account tags / internal notes
   - CSV export
   - anomaly alerts for payment failures, unusual credit grants, or rapid churn
   - customer timeline combining billing, site binding, and admin actions

Recommended product stance:

- build the table/rollup layer before building maps
- build revenue/reporting only after trial expiry, discount logic, and site entitlements are truthful
- keep support actions and finance reporting on the same canonical account state to avoid dashboard drift

## Notes

- The MFA blocker should be treated as a concrete auth-integration bug, not a reason to weaken admin security.
- A temporary staging-only verification bypass is active right now: Cognito MFA is off and backend `AIVI_ADMIN_REQUIRE_MFA` is false; both must be restored before any release sign-off.
- The biggest remaining item before release packaging is the final closeout validation pass.
- The hosted admin-console static bundle is intentionally deferred as optional launch cleanup because the backend auth fix is already live and staging access works.
- The `worker/health` 404 was confirmed as API Gateway drift, not a Lambda bug; the live route was restored on 2026-03-16 and future deploys now reconcile it automatically.
- If time is limited today, the smallest honest closeout slice is:
  - one final closeout validation pass
  - package/deploy only after that gate is green
