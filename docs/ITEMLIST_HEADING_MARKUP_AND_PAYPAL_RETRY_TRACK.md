# ItemList, Heading Markup, And PayPal Retry Track

Last updated: 2026-03-24

## Purpose

This track stages two reconciliation fixes that should stay cleanly separated but are both
active follow-ups from live validation:

- structural detection fixes for ItemList / heading-like markup on article content
- billing retry-state fixes after failed PayPal activation on free-trial sites

The goal is to fix both without mixing:

- deterministic structure truth
- new deterministic check registration
- serializer/review-rail surfacing
- billing-state diagnosis
- billing-state retry unblocking

## Guardrails

- Keep the structural work deterministic-first.
- Treat real list blocks and strong heading/pseudo-heading contexts more generously than
  weaker inferred list shapes.
- Do not let pseudo-headings contaminate real heading hierarchy checks.
- Do not widen the PayPal diagnosis milestone into patching before the blocking state is
  proven from runtime data.
- If any milestone needs a file outside its declared write set, stop and amend this track first.

## Adopted Reconciliation Decisions

- `itemlist_jsonld_presence_and_completeness` should relax to `>= 2` substantive entries
  for:
  - real list blocks
  - strong heading contexts
  - strong pseudo-heading contexts
- weaker inferred list shapes should remain stricter so AiVI does not create new false positives.
- bolded or otherwise heading-like section labels should still help structural grouping for:
  - ItemList detection
  - FAQ bridge detection
  - HowTo bridge detection
- heading-like text that behaves as a section heading should also get its own deterministic
  check instead of being hidden inside `semantic_html_usage`.
- proposed new check ID:
  - `heading_like_text_uses_heading_markup`

## Milestones

### M1 - ItemList Threshold Reconciliation

**Status:** Complete

**Goal**

Make true list blocks and strong sectioned list contexts trigger ItemList detection at
`>= 2` substantive entries instead of being score-neutraled out.

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`
- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`

**Scope**

- relax ItemList detection for true list blocks
- relax ItemList detection for strong heading / pseudo-heading list contexts
- keep weaker inferred shapes stricter
- preserve FAQ / HowTo exclusions
- keep this milestone focused on structural truth only

**Out of scope**

- new check registration
- serializer changes
- billing work

**Outcome**

- true list blocks now trigger ItemList candidacy at `>= 2` substantive entries when they sit
  under a strong question/heading context
- true list blocks now trigger ItemList candidacy at `>= 3` substantive entries even without
  a stronger heading signal
- weaker inferred shapes remain unchanged and still require stricter evidence
- FAQ / HowTo exclusions remain intact
- pseudo-heading structural support is still deferred to `M2`

**Validation**

- `npm.cmd test -- --runInBand preflight-handler.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  - workdir: `infrastructure/lambda/worker`

### M2 - Pseudo-Heading Structural Inventory

**Status:** Complete

**Goal**

Teach deterministic structure collection to recognize heading-like paragraph blocks,
especially bolded question/section labels, without pretending they are real headings.

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`
- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`

**Scope**

- add `heading_like_sections` into `manifest.preflight_structure`
- let those pseudo-headings act as section boundaries for structural detectors only
- wire them into ItemList / FAQ / HowTo grouping
- explicitly keep them out of real heading hierarchy math

**Out of scope**

- new deterministic check registration
- serializer changes
- billing work

**Outcome**

- `manifest.preflight_structure` now carries `heading_like_sections`
- short paragraph-style section labels can now act as structural boundaries for:
  - ItemList detection
  - FAQ bridge detection
  - HowTo grouping
- explicit pseudo FAQ labels now contribute to FAQ section signaling
- pseudo step-heading paragraphs now contribute to procedural grouping
- real heading hierarchy math is still untouched because only structural preflight grouping changed

**Validation**

- `npm.cmd test -- --runInBand preflight-handler.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  - workdir: `infrastructure/lambda/worker`

### M3 - Heading Markup Deterministic Check

**Status:** Complete

**Goal**

Add a deterministic check that flags heading-like text which should be real heading markup.

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`
- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/worker/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/schemas/primary-category-map.json`
- `infrastructure/lambda/worker/schemas/primary-category-map.json`
- `infrastructure/lambda/orchestrator/schemas/scoring-config-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/deterministic-instance-messages-v1.json`
- `infrastructure/lambda/worker/shared/schemas/deterministic-instance-messages-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/deterministic-explanations-v1.json`
- `infrastructure/lambda/worker/shared/schemas/deterministic-explanations-v1.json`
- `tests/diagnostics/check-contract-sync.test.js`

**Scope**

- add `heading_like_text_uses_heading_markup`
- place it under `Structure & Readability`
- give it deterministic-only ownership
- emit the check directly from preflight using `heading_like_sections`
- add scoring and deterministic message coverage

**Out of scope**

- serializer/review-rail release changes
- schema assist
- billing work

**Outcome**

- `heading_like_text_uses_heading_markup` is now a registered deterministic check
- the check is emitted directly from preflight using `heading_like_sections`
- the check now lives under `Structure & Readability`
- scoring, runtime contract, deterministic instance copy, and deterministic explanation coverage are now in place
- the check stays separate from `semantic_html_usage`, which remains the broader semantic-structure signal

**Validation**

- `npm.cmd test -- --runInBand preflight-handler.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  - workdir: `infrastructure/lambda/worker`
- `npm.cmd test -- --runInBand tests/diagnostics/check-contract-sync.test.js`
  - workdir: plugin root
- JSON parse sweep over all edited registry/message files via `ConvertFrom-Json`

### M4 - Structural Release And Regression Sweep

**Status:** Complete

**Goal**

Make the new structural detections and heading-markup check surface cleanly in the review rail,
then lock them with focused regressions and live-specimen replay.

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/worker/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `tests/diagnostics/sidebar-data-flow.test.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`

**Scope**

- confirm ItemList now surfaces when schema is missing
- confirm the new heading-markup check surfaces once per real issue
- confirm pseudo-headings help ItemList grouping without polluting hierarchy checks
- replay the confirmed concert/home-office article patterns through focused regressions

**Out of scope**

- billing work

**Outcome**

- serializer release now recognizes `heading_like_text_uses_heading_markup` as a real
  deterministic structural issue with stable user-facing fallback guidance
- ItemList schema failures still surface cleanly in overlay and sidebar payloads when they are
  emitted as non-inline deterministic recommendations
- worker and orchestrator serializer fallbacks now preserve check-specific document-scope
  guidance for deterministic structural issues instead of dropping to generic fallback prose
- focused regressions now cover:
  - anchored heading-markup release in the overlay
  - worker/orchestrator parity for pseudo-heading ItemList plus heading-markup release
  - sidebar summary handling for the new structural deterministic check
- preflight tests were not changed in this milestone because the structural replay coverage they
  needed was already locked in `M1-M3`; `M4` stayed on release-surface verification

**Validation**

- `npm.cmd test -- --runInBand analysis-serializer.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand analysis-serializer.worker.test.js`
  - workdir: `infrastructure/lambda/worker`
- `npm.cmd test -- --runInBand tests/diagnostics/sidebar-data-flow.test.js`
  - workdir: plugin root

### M5 - PayPal Retry Block Diagnosis

**Status:** Complete

**Goal**

Diagnose why a failed PayPal activation leaves the customer on free trial but still blocks
all plan buttons behind `Wait for activation` and the stale "billing is not ready" messaging.

**Planned inspection set**

- `includes/class-admin-settings.php`
- `infrastructure/lambda/orchestrator/paypal-webhook-processing.js`
- `infrastructure/lambda/orchestrator/billing-store.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.js`
- `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
- `infrastructure/lambda/orchestrator/billing-store.test.js`
- `tests/diagnostics/billing-dashboard-controls.test.js`

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`

**Scope**

- confirm which stored billing state keeps plan buttons blocked
- confirm whether the stale UI state is backend-derived, plugin-derived, or both
- record the exact runtime reason the customer remains non-retryable after failed activation

**Out of scope**

- patching the billing flow before diagnosis is recorded

**Outcome**

- live diagnosis was confirmed against `https://testaivi.wuaze.com/`
- affected runtime identity:
  - `account_id`: `acct_site_fd8e151ccaa8838bac600261`
  - `site_id`: `UwA3HxBZbnZoI5CpRJ0kVTZx`
- CloudWatch evidence showed:
  - a PayPal subscription checkout intent was created for the site at `2026-03-24T16:16:25Z`
  - the backend processed `BILLING.SUBSCRIPTION.CREATED` at `2026-03-24T16:16:32Z`
  - repeated account-summary polls followed
  - no terminal PayPal event for that attempt appeared in the same window:
    - no `BILLING.SUBSCRIPTION.CANCELLED`
    - no `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
    - no `BILLING.SUBSCRIPTION.EXPIRED`
- this proves the retry block is primarily backend-derived:
  - the canonical account state remains in `subscription_status = created`
  - the dashboard therefore keeps all non-current plans behind `Wait for activation`
- the plugin also has a separate local messaging bug:
  - guarded plan cards use `data-billing-action="plan_change_info"`
  - `resolveBillingEndpoint( 'plan_change_info' )` returns an empty endpoint
  - the click handler checks for a missing endpoint before it handles the local-info action
  - that is why the user sees `AiVI billing is not ready on this site yet.` even though this is not really a billing-config outage
- the current subscription return flow is not self-healing for failed subscription attempts:
  - `GET /aivi/v1/billing/return/paypal` always redirects subscriptions as `subscription_pending`
  - unlike top-ups, it does not reconcile provider state on return
  - so if PayPal never sends a terminal webhook for a failed/cancelled approval path, the account can stay stranded in `created`
- the current super-admin recovery path is also weak:
  - `subscription_resync` only stamps `subscription.last_event_type = admin_resync_requested`
  - it does not reconcile provider state or clear a stale `created` status

**Diagnosis summary**

- the stuck retry state is caused by both layers:
  - backend state gets stranded at `created` when the only observed event is `BILLING.SUBSCRIPTION.CREATED`
  - plugin messaging then misreports the blocked `plan_change_info` action as `billing is not ready`
- the next patch must therefore touch both:
  - retry-state reconciliation
  - local guarded-button messaging / action handling

### M6 - PayPal Retry Unblock Fix

**Status:** Complete

**Goal**

Return free-trial customers to a real retry-ready state after failed activation so plan
buttons unblock and the stale activation-wait messaging clears correctly.

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`
- `includes/class-admin-settings.php`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.js`
- `infrastructure/lambda/orchestrator/paypal-client.js`
- `infrastructure/lambda/orchestrator/paypal-webhook-processing.js`
- `infrastructure/lambda/orchestrator/billing-store.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
- `infrastructure/lambda/orchestrator/paypal-client.test.js`
- `tests/diagnostics/billing-dashboard-controls.test.js`
- `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
- `infrastructure/lambda/orchestrator/billing-store.test.js`

**Scope**

- reset failed/cancelled initial subscription attempts back to retry-ready trial state when the
  subscription return route can confirm a terminal provider status
- fix the guarded plan-card button path so `plan_change_info` shows its local explanatory notice
  instead of the misleading `AiVI billing is not ready on this site yet.` error
- keep the patch focused on retry-unblocking rather than broad subscription activation changes

**Out of scope**

- replacing webhook activation as the primary happy-path activation source
- super-admin recovery redesign
- broad billing dashboard copy refresh outside the blocked retry path

**Outcome**

- the PayPal client now has a clean provider-status read helper so the subscription return route
  can inspect the latest PayPal subscription state without duplicating raw provider-call logic
- `GET /aivi/v1/billing/return/paypal` now checks the provider status for subscription returns
  and, when it confirms a terminal status on an initial free-trial signup attempt, resets the
  account back to retry-ready `trial` state instead of leaving it stranded at `created`
- that retry-ready reset now:
  - clears the stale provider subscription link from account state
  - preserves the customer's existing free-trial access and credits
  - marks the checkout intent as retry-ready instead of perpetually pending
  - redirects back with `aivi_billing_return=subscription_retry_ready`
- the admin billing button handler no longer routes `plan_change_info` through the missing-endpoint
  billing readiness check
- the dashboard now has explicit return-notice coverage for `subscription_retry_ready`

**Validation**

- `npm.cmd test -- --runInBand billing-checkout-handler.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand paypal-client.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand paypal-webhook-processing.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand billing-store.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand tests/diagnostics/billing-dashboard-controls.test.js`
  - workdir: plugin root
- `php.exe -l includes/class-admin-settings.php`
  - result: no syntax errors

### M7 - PayPal Retry Regression Sweep

**Status:** Complete

**Goal**

Run focused regressions so the retry fix does not reintroduce premature plan activation or
stale blocked-plan states.

**Planned write set**

- `docs/ITEMLIST_HEADING_MARKUP_AND_PAYPAL_RETRY_TRACK.md`
- test files only if expectations require maintenance

**Planned validation set**

- `infrastructure/lambda/orchestrator/paypal-webhook-processing.test.js`
- `infrastructure/lambda/orchestrator/billing-store.test.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
- `tests/diagnostics/billing-dashboard-controls.test.js`

**Outcome**

- the retry-unblock patch passed its focused backend and dashboard regression sweep without
  needing any follow-up test maintenance
- the return-path reconciliation logic remains scoped correctly:
  - retry-ready reset behavior is covered in the checkout handler suite
  - webhook processing behavior still passes unchanged
  - billing-store behavior still passes unchanged
  - dashboard control behavior still reflects the corrected guarded-button flow
- no regression evidence surfaced for:
  - premature paid-plan activation
  - loss of free-trial preservation on retry-ready reset
  - stale guarded-plan button messaging after the `plan_change_info` fix

**Validation**

- `npm.cmd test -- --runInBand billing-checkout-handler.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand paypal-webhook-processing.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand billing-store.test.js`
  - workdir: `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand tests/diagnostics/billing-dashboard-controls.test.js`
  - workdir: plugin root

## Acceptance Targets

Structural acceptance:

- the concert article style fails `itemlist_jsonld_presence_and_completeness` when visible
  list schema is missing
- the home-office article style fails `itemlist_jsonld_presence_and_completeness` when
  visible list schema is missing
- a bolded pseudo-heading before a real list still gives the list enough structural context
- `heading_like_text_uses_heading_markup` flags real pseudo-headings but ignores inline bold emphasis

Billing acceptance:

- a failed PayPal activation on free trial does not leave all plans blocked at
  `Wait for activation`
- the stale messages
  - `AiVI billing is not ready on this site yet.`
  - `AiVI is waiting for PayPal to confirm your subscription activation. Plans and credits will refresh here automatically.`
  no longer persist once the site is truly retry-ready
