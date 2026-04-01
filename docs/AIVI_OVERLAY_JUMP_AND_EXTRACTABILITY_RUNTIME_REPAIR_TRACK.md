# AiVI Overlay Jump And Extractability Runtime Repair Track

## Purpose

This track closes two connected usability problems:

- copying a Copilot variant can yank the overlay editor back toward the early blocks
- degraded Answer Extractability runs can still surface brittle anchors, weak highlights, and flattened explanations

This is a bounded repair lane. It is not a redesign of the overlay editor, serializer, or analyzer family.

## Grounded Diagnosis

- variant copy in the overlay currently routes through a full `renderBlocks(true)` refresh
- that rebuild drops the overlay viewport position and lets jump-restoration logic reassert focus
- the problematic résumé run on `ru.my-style.in` completed as `success_partial` with `chunk_parse_failure`
- that same run logged `question_anchor_count: 4` and `section_intent_cue_count: 4`
- the overlay consumer can still trim or flatten richer analyzer explanations into shorter rail/detail text

## Scope Boundaries

- do not redesign Review Rail layout
- do not weaken verified Answer Extractability checks globally without runtime proof
- do not package or deploy until the focused proof is green

## Milestones

### Progress Snapshot

- `M1` completed on April 1, 2026
- `M2` completed on April 1, 2026
- `M3` completed on April 1, 2026
- `M4` completed on April 1, 2026

## M1. Overlay Copy Stability And Full-Draft Copy

### Goal

Stop Copilot variant copy from rebuilding the whole overlay editor, and add one explicit action to copy the full overlay draft from the current overlay state.

### Primary Files

- `assets/js/aivi-overlay-editor.js`
- focused overlay regression tests

### Acceptance

- copying a variant no longer forces a full `renderBlocks(true)` cycle
- the overlay viewport no longer jumps back toward the first blocks on variant copy
- the rail exposes one clear action to copy the whole overlay draft, including title and current edited blocks

### Status

Completed on April 1, 2026.

Delivered:

- removed the full overlay rerender from the variant copy path in:
  - `assets/js/aivi-overlay-editor.js`
- added a rail-level `Copy overlay content` action that copies the current overlay title plus current edited block content from the live overlay DOM
- kept the action copy-safe by preserving HTML for WordPress paste while also writing a plain-text fallback
- added focused regression coverage in:
  - `tests/js/overlay-fix-assist-regression.test.js`
  - `tests/js/overlay-apply-safety-regression.test.js`

Focused proof:

- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- tests/js/overlay-fix-assist-regression.test.js tests/js/overlay-apply-safety-regression.test.js --runInBand`

## M2. Overlay Explanation Preservation Follow-Through

### Goal

Keep richer analyzer-authored explanation text intact in Review Rail details and Copilot notes when it is already usable.

### Primary Files

- `assets/js/aivi-overlay-editor.js`
- focused overlay regression tests

### Acceptance

- `View details` no longer drops the fuller analyzer explanation just because its first sentence overlaps the rail summary
- Copilot notes prefer the composed analyzer explanation narrative before falling back to one-line summary fields
- no regression to overlay copy-only behavior

### Status

Completed on April 1, 2026.

Delivered:

- removed the sentence-level trimming that was stripping richer analyzer explanation text from:
  - `assets/js/aivi-overlay-editor.js`
- updated Copilot note resolution to consider the composed explanation narrative and `why_it_matters` before falling back to shorter summary/message fields
- added focused regression coverage in:
  - `tests/js/overlay-fix-assist-regression.test.js`
  - `tests/js/overlay-apply-safety-regression.test.js`

Focused proof:

- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- tests/js/overlay-fix-assist-regression.test.js tests/js/overlay-apply-safety-regression.test.js --runInBand` passed `28/28`

## M3. Extractability Runtime Guard For Degraded Partial Runs

### Goal

Reduce brittle anchor promotion and unstable highlight blame when Answer Extractability runs degrade under chunk salvage or parse failure.

### Status

Completed on April 1, 2026.

Delivered:

- carried partial-run status and reason through the worker result in:
  - `infrastructure/lambda/worker/index.js`
- added a degraded partial-run guard in:
  - `infrastructure/lambda/worker/analysis-serializer.js`
  - `infrastructure/lambda/orchestrator/analysis-serializer.js`
- when a run is `success_partial` with `chunk_parse_failure`, Answer Extractability checks now stay section-level instead of blaming one brittle inline snippet or list item
- released those guarded findings as unhighlightable section-level issues with a direct user-facing explanation instead of anchoring the wrong inline node
- added focused regression coverage in:
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`

Focused proof:

- `node --check infrastructure/lambda/worker/index.js`
- `node --check infrastructure/lambda/worker/analysis-serializer.js`
- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `npm test -- infrastructure/lambda/worker/analysis-serializer.worker.test.js --runInBand` passed `34/34`

## M4. Focused Runtime Proof And Release Readiness

### Goal

Prove the overlay and extractability repairs together against focused local regressions and one live log sanity pass before any packaging or deploy.

### Status

Completed on April 1, 2026.

Delivered:

- ran the focused overlay and extractability regression pack together to prove:
  - overlay copy stability
  - full-draft overlay copy
  - explanation preservation in details and Copilot notes
  - degraded partial-run extractability guardrails
- completed one live AiVI worker sanity pass in CloudWatch after the local proof pack
- confirmed the latest live worker run completed as `success`, not another degraded partial run

Focused proof:

- `npm test -- tests/js/overlay-fix-assist-regression.test.js tests/js/overlay-apply-safety-regression.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js --runInBand` passed `62/62`
- live worker sanity pass:
  - log group: `/aws/lambda/aivi-analyzer-worker-dev`
  - run id: `a91b60c4-bca4-484c-b993-673f23edfae4`
  - completed on April 1, 2026 at `10:27:21 UTC`
  - final status: `success`
  - `partial_reason: null`

Release note:

- no package or deploy was done in this lane

## Agreed Follow-Up Direction

On April 1, 2026, we agreed not to package or deploy this lane yet while evaluating one additional runtime guard:

- if a run records too many chunk-level failures, retries, or parse degradations, the analyzer should stop treating the outcome as a usable partial and instead abort the run with a clear user-facing failure state

Why this follow-up is on deck:

- recent diagnosis showed that some degraded runs can still relay results as `partial`, even when the failure pressure is high enough to make the released analysis feel misleading
- after the latest local repairs, the user confirmed the diagnoses now make sense, which makes this a good moment to tighten the failure budget instead of shipping ambiguous partials

## Agreed Runtime Abort Budget

The agreed repair extension for this lane is:

- do not use `model_switch_count` as an abort trigger
- abort the run if `failed_chunk_count >= 1`
- abort the run if `synthetic_check_rate >= 0.03`
- if a run does not cross the abort threshold but still shows heavy salvage pressure, keep the existing M3 behavior:
  - release section-level guarded extractability issues
  - suppress brittle inline blame and unstable highlight anchoring

Supporting salvage-pressure signal:

- treat `malformed_chunk_capture_count >= 3` together with `parse_error_total >= 4` as a strong degradation indicator
- that signal can support abort or guarded partial handling, but it does not replace the hard abort rules above

User-facing failure direction:

- if the abort budget is crossed, the run should stop and tell the user that the analysis did not complete cleanly enough to trust the results
- the message should explain that too many analysis chunks failed or had to be salvaged, and invite the user to rerun the analysis

Packaging note:

- this lane remains intentionally unshipped until the abort-budget extension is implemented and proven

## Follow-Up Mini Milestones

To keep the abort-budget extension disciplined without reopening the whole lane, we will implement it as three small follow-up milestones:

- `M4A` runtime abort-budget gate completed on April 1, 2026
- `M4B` user-facing failure-state relay completed on April 1, 2026
- `M4C` focused proof and ship-readiness check completed on April 1, 2026

### M4A. Runtime Abort-Budget Gate

Goal:

- stop the worker from returning a usable partial when the agreed abort budget is crossed

Primary files:

- `infrastructure/lambda/worker/index.js`
- any nearby worker runtime helpers that compute partial/failure state

Acceptance:

- abort when `failed_chunk_count >= 1`
- abort when `synthetic_check_rate >= 0.03`
- do not use `model_switch_count` as an abort trigger
- keep the existing M3 guarded section-level behavior for degraded runs that do not cross the abort threshold

Status:

Completed on April 1, 2026.

Delivered:

- added the hard runtime abort budget in:
  - `infrastructure/lambda/worker/index.js`
- runs now flip to a true failed status instead of `success_partial` when:
  - `failed_chunk_count >= 1`
  - `synthetic_check_rate >= 0.03`
- preserved a separate abort reason so later UI relay can distinguish:
  - `failed_chunk_count_exceeded`
  - `synthetic_check_rate_exceeded`
- skipped deterministic partial fallback when the reliability abort budget is already exceeded
- preserved refund-safe failed-run settlement by routing these aborts through the existing failed status path instead of treating them as billable partials
- added focused runtime regression coverage in:
  - `infrastructure/lambda/worker/worker-regression.test.js`

Focused proof:

- `node --check infrastructure/lambda/worker/index.js`
- `npm test -- infrastructure/lambda/worker/worker-regression.test.js --runInBand` passed `46/46`

### M4B. User-Facing Failure Relay

Goal:

- return a calm, clear failure state instead of a misleading partial when the abort budget is crossed

Primary files:

- worker/orchestrator run-status surfaces
- overlay/review-rail consumers only if needed for clean display

Acceptance:

- the UI receives a true failed/aborted state, not `success_partial`
- only one message is shown at a time
- the message copy is selected from the approved interchangeable set below

Status:

Completed on April 1, 2026.

Delivered:

- added a reliability-threshold abort reason and interchangeable message pool in:
  - `infrastructure/lambda/orchestrator/analysis-serializer.js`
- made the aborted summary/details generators choose exactly one approved reliability message per run
- updated the run-status relay in:
  - `infrastructure/lambda/orchestrator/run-status-handler.js`
  so it prefers `run.abort.reason` and passes the generated summary message through instead of stamping a generic abort line over it
- preserved aborted summary visibility through the sidebar strip gate in:
  - `infrastructure/lambda/orchestrator/sidebar-payload-stripper.js`
- updated the sidebar poller fallback in:
  - `assets/js/aivi-sidebar.js`
  so it prefers the backend-provided aborted message before any local fallback copy
- added focused proof in:
  - `tests/js/execution-failure-states.test.js`
  - `infrastructure/lambda/orchestrator/run-status-handler.test.js`

Focused proof:

- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `node --check infrastructure/lambda/orchestrator/run-status-handler.js`
- `node --check infrastructure/lambda/orchestrator/sidebar-payload-stripper.js`
- `node --check assets/js/aivi-sidebar.js`
- `npm test -- tests/js/execution-failure-states.test.js infrastructure/lambda/orchestrator/run-status-handler.test.js --runInBand` passed `36/36`

Approved interchangeable messages:

- `This run didn’t meet AiVI’s reliability standard, so we stopped it instead of returning an ambiguous partial. Please try again.`
- `AiVI paused this run after repeated processing failures. Rather than show a misleading partial result, we recommend running the analysis again.`
- `We stopped this analysis because the result quality dropped below our reliability threshold. Please run it again to get a cleaner result.`
- `AiVI aborted this analysis rather than surface a result that could mislead your editorial decision. Please run it again.`
- `This analysis was stopped because the draft hit too many processing failures to return a result we’d trust. Please run the analysis again.`

### M4C. Focused Proof And Ship-Readiness Check

Goal:

- prove the new abort behavior against the known bad-run shape before packaging or deploy

Acceptance:

- one focused local regression covers the bad-run pressure profile
- one focused local regression proves that milder degradation still uses guarded section-level release instead of full abort
- packaging/deploy remains blocked until this proof is green

Status:

Completed on April 1, 2026.

Delivered:

- reran the combined focused proof pack across:
  - `infrastructure/lambda/worker/worker-regression.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `tests/js/execution-failure-states.test.js`
  - `infrastructure/lambda/orchestrator/run-status-handler.test.js`
- proved the hard abort path for the known bad-run pressure profile
- proved that milder degradation still stays in the guarded partial lane instead of collapsing into a full abort
- confirmed the reliability-abort relay stays intact end-to-end from worker pressure signals through orchestrator and sidebar-facing run status

Focused proof:

- `npm test -- --runInBand infrastructure/lambda/worker/worker-regression.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js tests/js/execution-failure-states.test.js infrastructure/lambda/orchestrator/run-status-handler.test.js` passed `116/116`

Release note:

- no package or deploy was done in this extension lane
