# Live Analysis, PayPal, And Review Rail Fix Track

Last updated: 2026-03-25

## Purpose

Close the confirmed live regressions and drift surfaced after the latest plugin and backend rollout:

- semantic FAQ opportunity misfires on question-led list sections
- semantic structure guardrails are not activating early enough on the live async path
- PayPal cancelled or failed upgrade attempts can still leave plan cards stuck on `Wait for activation`
- the approved impact pills landed in the wrong surface
- the analysis progress board is overcrowded and needs calmer, more truthful progress UX

This track exists to fix those issues without widening into unrelated scoring, schema, or redesign work.

## Confirmed Diagnosis

1. The latest live `king.lovestoblog.com` analysis did include deterministic ItemList detection. The real live issue is that `faq_structure_opportunity` still misfired on a question-led list section.
2. The semantic runtime guardrails already exist in worker normalization, but they depend on `manifest.preflight_structure`.
3. On the live async path, AI findings are converted before `preflight_structure` is present, so the FAQ and list veto logic is effectively bypassed.
4. The local WordPress preflight route does not currently send `preflight_structure` through to the backend manifest.
5. PayPal return reconciliation still fails open to a pending activation hold when provider lookup cannot classify the subscription cleanly.
6. The sidebar progress shell is height-constrained in a way that makes the live-category card and message rows compete for space.
7. The impact pills were added to the sidebar issue accordion, but the approved placement is the overlay review rail header at the far end of the check name.

## Guardrails

- treat the worker live-path semantic guardrail activation as the highest-priority fix
- keep FAQ prompt teaching additive and compact; do not rely on prompting alone
- keep deterministic ItemList logic unchanged unless a new live artifact disproves the current diagnosis
- restore the sidebar issue row to its original verdict-oriented behavior before adding the impact pills in the correct overlay location
- treat super-admin recovery as a narrow billing-recovery action, not a broad force-unlock tool
- if a milestone needs a file outside its declared write set, amend this track first

## Approved Decisions

- Add one compact FAQ pass example showing that a question-style heading followed by a list or explainer is not automatically FAQ structure.
- Add one matching FAQ non-trigger rule alongside that pass example.
- Add a super-admin recovery path with two layers:
  - `Recheck activation`
  - `Clear activation hold` only when reconciliation cannot resolve the hold and operator intervention is justified
- Use calm progress guidance copy in the sidebar.
  Recommended first-pass note:
  `Most analyses finish in about 4-5 minutes.`

## Milestones

### M1 - Activate Semantic Guardrails On The Live Path

**Status:** Complete

**Goal**

Make `preflight_structure` available before AI findings are converted so the semantic structure vetoes actually apply in live async runs.

**Planned write set**

- `docs/LIVE_ANALYSIS_PAYPAL_AND_REVIEW_RAIL_FIX_TRACK.md`
- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `includes/class-rest-preflight.php`
- `infrastructure/lambda/worker/worker-regression.test.js`
- `infrastructure/lambda/worker/worker-normalization.test.js`

**Scope**

- ensure the worker builds or receives structural inventory before `convertFindingsToChecks(...)`
- preserve the existing semantic-governance rules rather than rewriting them
- make the live async path and local/plugin path agree on structural inventory availability
- lock the regression with one specimen that mirrors the `king.lovestoblog.com` FAQ/list pattern

**Acceptance**

- `faq_structure_opportunity` is vetoed when a question-led section is structurally a list rather than true FAQ
- live manifests used by worker normalization include usable structural inventory at the time findings are converted
- no new drift appears in `lists_tables_presence` or HowTo guardrails

**Outcome**

- The worker now enriches manifests with `preflight_structure` before any AI findings are converted into released checks.
- That enrichment is now shared through a dedicated `ensureManifestPreflightStructure(...)` helper in the worker preflight layer instead of relying on the later deterministic pass to attach structural inventory.
- `callMistralChunked(...)` now defensively ensures structural inventory exists before building question anchors and before downstream semantic normalization can evaluate FAQ/list opportunity findings.
- The live async path no longer depends on stored manifest artifacts already containing `preflight_structure`; the worker can recover the needed structural truth from the manifest it downloads.
- A new worker regression now proves that a manifest which starts without `preflight_structure` still gains enough structure before AI conversion to veto the diagnosed `faq_structure_opportunity` misfire pattern.
- `includes/class-rest-preflight.php` was reviewed for M1 and intentionally left unchanged. The live-path guardrail failure is fixed by worker-side early enrichment, which avoids duplicating the structural-inventory algorithm in WordPress PHP during this milestone.

**Validation**

- `node --check infrastructure/lambda/worker/index.js`
- `node --check infrastructure/lambda/worker/preflight-handler.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-regression.test.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-normalization.test.js`

### M2 - Tighten FAQ Teaching Without Prompt Bloat

**Status:** Complete

**Goal**

Add one compact pass example and one non-trigger rule so the model is less eager to interpret question-led list sections as FAQ opportunities.

**Planned write set**

- `docs/LIVE_ANALYSIS_PAYPAL_AND_REVIEW_RAIL_FIX_TRACK.md`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `tests/diagnostics/prompt-sync.test.js`

**Scope**

- keep the addition short and contrastive
- reinforce the exact live misfire pattern:
  - question heading
  - explanatory or list-shaped body
  - not reusable FAQ pairs
- do not widen this milestone into broader prompt rewriting

**Acceptance**

- the prompt contains one compact FAQ pass example for the diagnosed pattern
- the prompt contains one explicit FAQ non-trigger rule for question-led explainer or list sections
- prompt-sync coverage locks the new wording

**Outcome**

- The worker prompt now contains one sharper FAQ non-trigger rule for the exact diagnosed pattern:
  a single question heading followed by a visible list, pseudo-list, or idea collection does not create FAQ candidacy unless 2 or more explicit question-answer pairs are truly present.
- The compact FAQ pass example was updated to mirror the live misfire more closely by showing a question-led list section that should still return `pass` for `faq_structure_opportunity`.
- The change stayed narrow and additive; no wider prompt rewrite or extra example sprawl was introduced.

**Validation**

- `npm.cmd test -- --runInBand tests/diagnostics/prompt-sync.test.js`

### M3 - Finish PayPal Retry Recovery And Add Super-Admin Escape Hatch

**Status:** Complete

**Goal**

Stop cancelled or failed upgrade attempts from remaining stuck at `Wait for activation`, and add a safe operator recovery path when automatic reconciliation is insufficient.

**Planned write set**

- `docs/LIVE_ANALYSIS_PAYPAL_AND_REVIEW_RAIL_FIX_TRACK.md`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.js`
- `infrastructure/lambda/orchestrator/paypal-client.js`
- `infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
- `infrastructure/lambda/orchestrator/paypal-client.test.js`
- `infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/api-client.js`

**Scope**

- classify provider lookup failures more carefully on subscription return
- distinguish retry-ready terminal states from true transient lookup failure
- add a super-admin recovery action that:
  - rechecks activation first
  - can clear a stale activation hold second when justified
- keep audit logging and permissions explicit

**Acceptance**

- a cancelled or failed initial upgrade can return the customer to retry-ready state
- the customer Plans tab no longer remains stuck on `Wait for activation` after retry-ready resolution
- operators have a narrow, auditable recovery path when automatic reconciliation is not enough

**Outcome**

- PayPal subscription lookup failures are now classified more precisely during return reconciliation instead of collapsing every failure into a generic pending hold.
- The subscription return path now treats terminal lookup failures such as `not found` and `invalid subscription` as retry-ready for stale trial-created activations, which clears the customer out of the `Wait for activation` dead end when the provider never completed the activation.
- `subscription_resync` in the super-admin mutation surface is now a real provider recheck for activation recovery rather than a metadata-only stamp. It can clear stale trial activation holds when PayPal confirms a terminal outcome.
- A second super-admin action, `clear_activation_hold`, is now available as the explicit manual fallback when reconciliation cannot resolve the stale hold safely on its own.
- The admin console now exposes the two approved support actions with clearer labels and help text:
  - `Recheck activation`
  - `Clear activation hold`
- Preview-mode admin mutations were kept in parity so the support UI does not drift between preview and live API modes.

**Validation**

- `node --check infrastructure/lambda/orchestrator/billing-checkout-handler.js`
- `node --check infrastructure/lambda/orchestrator/paypal-client.js`
- `node --check infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- `node --check control-plane/admin-console/src/app.js`
- `node --check control-plane/admin-console/src/api-client.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/billing-checkout-handler.test.js infrastructure/lambda/orchestrator/paypal-client.test.js infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`

### M4 - Restore Sidebar Truth And Move Impact Pills To The Review Rail

**Status:** Complete

**Goal**

Undo the misplaced impact-pill rollout in the sidebar, place pills in the overlay review rail where approved, and stabilize the analysis progress panel.

**Planned write set**

- `docs/LIVE_ANALYSIS_PAYPAL_AND_REVIEW_RAIL_FIX_TRACK.md`
- `assets/js/aivi-sidebar.js`
- `assets/js/aivi-overlay-editor.js`
- `assets/css/aivi-overlay-editor.css`
- `tests/js/sidebar-score-ui-regression.test.js`
- `tests/js/frontend.test.js`
- `tests/js/overlay-redesign-regression.test.js`

**Scope**

- remove impact pills from the sidebar issue accordion
- restore the sidebar issue row to the original verdict-oriented presentation
- add `High impact`, `Recommended`, and `Polish` to the overlay review rail item header at the far end of the check name
- rebalance the analysis progress shell so:
  - the live-category card stops starving the message rows
  - the message rows stop fighting each other
  - the `4-5 minutes` expectation note is placed neatly in the progress panel

**Acceptance**

- sidebar issue rows no longer show the misplaced impact pills
- overlay review rail headers show the approved impact pills in the approved location
- progress cards no longer visually collide during active analysis
- the progress panel shows a calm duration expectation note without cluttering the message stack

**Outcome**

- The sidebar issue accordion is back to verdict-oriented row badges, so it no longer mixes impact guidance into the wrong surface.
- The approved `High impact`, `Recommended`, and `Polish` guidance now appears in the overlay review rail header at the far end of each check name, which matches the approved placement.
- The analysis progress shell now uses a calmer flex layout instead of the previous absolute-positioned stack, so the live-category card no longer crowds the console rows during longer runs.
- The progress panel now includes the approved duration note:
  `Most analyses finish in about 4-5 minutes.`
- The global score pill and the AEO/GEO ring-color work from the earlier UX track were left intact.

**Validation**

- `node --check assets/js/aivi-sidebar.js`
- `node --check assets/js/aivi-overlay-editor.js`
- `npm.cmd test -- --runInBand tests/js/sidebar-score-ui-regression.test.js tests/js/frontend.test.js tests/js/overlay-redesign-regression.test.js`

### M5 - Focused Regression And Live-Artifact Confidence Sweep

**Status:** Complete

**Goal**

Prove the fixes hold together across the real incident surfaces before deploy.

**Planned write set**

- `docs/LIVE_ANALYSIS_PAYPAL_AND_REVIEW_RAIL_FIX_TRACK.md`

**Validation set**

- `infrastructure/lambda/worker/worker-regression.test.js`
- `infrastructure/lambda/worker/worker-normalization.test.js`
- `tests/diagnostics/prompt-sync.test.js`
- `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
- `infrastructure/lambda/orchestrator/paypal-client.test.js`
- `infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
- `tests/js/sidebar-score-ui-regression.test.js`
- `tests/js/frontend.test.js`
- `tests/js/overlay-redesign-regression.test.js`

**Acceptance**

- the FAQ/list live pattern is covered by regression tests
- the PayPal retry-ready path is covered by regression tests
- the super-admin recovery path is covered by regression tests
- the sidebar and overlay placement behavior is covered by regression tests

**Outcome**

- The full targeted regression chain passed across worker normalization, prompt teaching, PayPal recovery, super-admin recovery, sidebar UX, and overlay review-rail placement.
- The diagnosed FAQ/list live pattern is now covered from both sides:
  - worker-side structural guardrail regression
  - prompt-sync coverage for the compact FAQ non-trigger rule
- The PayPal retry-ready path is now covered for:
  - terminal provider statuses
  - terminal lookup failures
  - super-admin recheck and explicit clear-hold recovery
- The sidebar and overlay surface behavior is now locked so the impact guidance cannot drift back into the wrong panel silently.

**Validation**

- `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-regression.test.js infrastructure/lambda/worker/worker-normalization.test.js tests/diagnostics/prompt-sync.test.js infrastructure/lambda/orchestrator/billing-checkout-handler.test.js infrastructure/lambda/orchestrator/paypal-client.test.js infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js tests/js/sidebar-score-ui-regression.test.js tests/js/frontend.test.js tests/js/overlay-redesign-regression.test.js`

**Notes**

- The Jest sweep also executed the staged public-repo mirror JS tests that live under `dist/public-repo/_stage/...` in this workspace, and they passed alongside the source tests.
- Worker anchor-verification info logs appeared during the normalization suite and are expected diagnostic output, not failures.

## Done Definition

This track is complete when:

- live semantic guardrails activate early enough to suppress the diagnosed FAQ/list misfire
- the FAQ prompt contains the approved compact pass example and non-trigger rule
- failed or cancelled PayPal upgrade attempts can return to retry-ready state without leaving plan cards stuck
- super-admin operators can resolve a stale activation hold safely and audibly
- the sidebar is restored to truthful verdict-oriented issue rows
- the approved impact pills appear in the overlay review rail, not the sidebar
- the analysis progress panel no longer crowds or collides during longer runs
- the focused regression set passes
