# Answer Extractability 3-Layer Hardening Track

## Purpose

Stabilize the entire `Answer Extractability (AEO)` family with a 3-layer fix:

1. tighten check semantics in shared definitions
2. tighten family-level interpretation and explanation rules in the analyzer prompt
3. stop the review rail from leading with brittle raw threshold copy when richer serializer-owned narratives already exist

This track exists because the current branch has already improved explanation hygiene broadly, but the latest live `ru.my-style.in` run still shows brittle and sometimes misleading visible copy in the answer family.

## Ground Truth

Live run used as the hardening specimen:

- `run_id`: `550a7004-60ce-4fc5-842e-56cf4deec550`
- site: `ru.my-style.in`
- observed on: `2026-03-16`

Confirmed from raw artifact:

- `immediate_answer_placement` raw explanation: `Answer appears at 121-150 words after the question anchor.`
- `answer_sentence_concise` raw explanation: `Answer sentence has 32 words, which is below the 40-60 word threshold.`
- `clear_answer_formatting` raw explanation: `Answer is not separated into clear steps or bullet points for better readability.`
- `faq_structure_opportunity` still returns `pass` on content that remains suspicious for inline answer-candidate structure

Important diagnostic conclusions:

1. this is not the old forced guardrail-collapse bug for this run
2. the raw analyzer wording is already too threshold-led and too generic for some answer-family cases
3. richer serializer narratives already exist downstream, but the visible rail summary still tends to lead with the short raw `message`
4. these checks are intentionally special-cased in both definitions and prompt, which makes them more brittle unless the category is locked holistically

## Scope

In scope:

- `immediate_answer_placement`
- `answer_sentence_concise`
- `question_answer_alignment`
- `clear_answer_formatting`
- `faq_structure_opportunity`

Out of scope for this track:

- unrelated semantic categories
- reopening already-accepted question-anchor fallback regressions unless this work exposes a new regression
- broad deploy work before milestone acceptance is green

## Locked Decisions

1. We will fix this family with a 3-layer approach, not a UI-only patch.
2. Shared definitions remain the canonical semantics source for the category.
3. The analyzer prompt remains responsible for question-anchor gating and explanation discipline.
4. The review rail must prefer serializer-owned editorial narrative over brittle raw threshold text.
5. Raw analyzer `message` should remain available for audit/export paths even if it stops being the primary visible rail summary.
6. The March 16 live run becomes the regression anchor for this hardening pass.

## Milestones

### Milestone 1: Baseline Locks

Status: `complete`

Goal:

- freeze the March 16 live specimen into focused regressions before editing logic

Files to touch first:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js`
- optional trimmed fixture file derived from the live artifact if re-use becomes cleaner than inline test payloads

What to lock:

- raw answer-family verdicts from the March 16 specimen
- serializer-owned `issue_explanation` remaining richer than raw `message`
- review-summary behavior expected after the rail fix
- no regression to question-anchor guardrail telemetry or existing answer-family coverage

Primary suites:

- `npm.cmd test -- --runInBand infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-regression.test.js`

Acceptance:

- the new specimen is represented in tests
- current failing behavior is reproduced in at least one targeted assertion per layer

Validation recorded on 2026-03-16:

- added trimmed fixture `wp-content/plugins/AiVI-WP-Plugin/fixtures/overlay/live-run-0316-answer-extractability.json`
- locked worker serializer behavior in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- locked sidebar/orchestrator serializer behavior in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- locked non-guardrail raw verdict preservation in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js`
- passed the three focused suites listed above

### Milestone 2: Definition Hardening

Status: `complete`

Goal:

- sharpen the semantics for the entire answer-extractability family without bloating the prompt

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js`

Definition work:

- rewrite `description`, `evaluation`, and `thresholds` for the five scoped checks
- add negative controls where needed
- explicitly distinguish direct answer vs setup
- explicitly distinguish concise snippet vs whole paragraph
- explicitly distinguish readable prose vs bullets/steps actually required by question shape
- keep wording compact and operational

Acceptance:

- definitions remain concise
- diagnostics reflect the new wording and still pass
- no contradiction between answer-family checks

Validation recorded on 2026-03-16:

- updated the five answer-family definition entries in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- preserved FAQ-candidate wording required by sync diagnostics while tightening the operational semantics
- passed `prompt-sync.test.js`, `check-contract-sync.test.js`, and the focused serializer/worker regression suites

### Milestone 3: Prompt Hardening

Status: `complete`

Goal:

- improve model interpretation and explanation quality for the whole family without overwhelming the analyzer

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js`

Prompt work:

- replace the current answer-family gate block with the tightened family interpretation rules
- tighten the FAQ candidacy block
- require answer-family explanations to describe the observed structural problem, not only restate thresholds
- keep additions compact so they fit current prompt budgets

Acceptance:

- prompt and definitions stay aligned
- prompt additions do not become essay-like or redundant
- specimen-based regressions verify the new interpretation rules

Validation recorded on 2026-03-16:

- updated the answer-family gate, interpretation, explanation-quality, and FAQ-specific prompt rules in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- extended `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js` to lock the new prompt language
- added a worker-owned prompt regression in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js`
- passed `prompt-sync.test.js`, `check-contract-sync.test.js`, `worker-regression.test.js`, `analysis-serializer.worker.test.js`, and `analysis-serializer.test.js`

### Milestone 4: Review-Summary Surface

Status: `complete`

Goal:

- stop the rail from surfacing brittle raw threshold copy as the primary user-facing explanation

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js`
- `wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js`
- `wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js`
- possibly `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/run-status-handler.test.js` if the summary surface changes payload expectations

Implementation intent:

- add a serializer-owned summary field such as `review_summary` or equivalent dedicated rail text
- preserve raw `message` for audit/export
- have the rail prefer serializer-owned narrative over the short raw explanation
- keep `issue_explanation` and `explanation_pack` authoritative for details

Acceptance:

- March 16 rail copy no longer leads with the brittle threshold one-liners
- exports/raw payloads still retain the original raw analyzer wording
- overlay details remain richer than the summary row

Validation recorded on 2026-03-16:

- added serializer-owned `review_summary` generation to both serializer paths in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js` and `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js`
- updated `wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js` and `wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js` so visible rail rows prefer `review_summary` while preserving raw `message` for audit/export paths
- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js`, `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js`, `wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-pass-filter-regression.test.js`, and `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/sidebar-data-flow.test.js`
- passed `analysis-serializer.worker.test.js`, `analysis-serializer.test.js`, `run-status-handler.test.js`, `worker-regression.test.js`, `overlay-pass-filter-regression.test.js`, and `sidebar-data-flow.test.js`

### Milestone 5: Contract Sync

Status: `complete`

Goal:

- keep payload shape and diagnostics aligned if a new visible summary field is introduced

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json`
- `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js`
- any serializer contract tests that assert sidebar payload shape

Acceptance:

- runtime contract reflects the chosen field shape
- diagnostics stay green
- no silent drift between worker and orchestrator serializer payloads

Validation recorded on 2026-03-16:

- added a `sidebar_payload` contract section to `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json` so the visible-summary field policy and allowed issue/highlight fields are explicit
- updated `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/sidebar-payload-stripper.js` to preserve sanitized `review_summary` on issues and highlights
- extended `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js`, `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js`, `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/sidebar-noise-elimination.test.js`, and `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/sidebar-hard-separation.test.js`
- passed `check-contract-sync.test.js`, `prompt-sync.test.js`, `sidebar-noise-elimination.test.js`, `sidebar-hard-separation.test.js`, `run-status-handler.test.js`, and `analysis-serializer.test.js`

### Milestone 6: Validation and Release Gate

Status: `complete`

Goal:

- verify the family end-to-end and decide whether the branch is safe to package/deploy

Suites to run:

- `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-regression.test.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/run-status-handler.test.js`
- `npm.cmd test -- --runInBand tests/diagnostics/prompt-sync.test.js tests/diagnostics/check-contract-sync.test.js`

Release gate:

- no deploy/package until Milestones 1-5 pass
- if all milestones pass and no other track is blocking release, package and deploy may proceed under the existing release rules

Validation recorded on 2026-03-16:

- passed the Milestone 6 release-gate sweep: `worker-regression.test.js`, `analysis-serializer.worker.test.js`, `analysis-serializer.test.js`, `run-status-handler.test.js`, `prompt-sync.test.js`, and `check-contract-sync.test.js`
- final sweep result: `6/6` suites and `112/112` tests passing
- Milestones 1-5 are green, so this track no longer blocks package/deploy; broader branch release decisions still depend on any other active track-level blockers

## Acceptance Criteria

This track is complete when all of the following are true:

1. The March 16 `Answer Extractability` specimen is locked in regression coverage.
2. Raw analyzer wording for the family improves through definitions + prompt hardening, or at minimum is no longer the primary visible rail text.
3. The rail summary shows serializer-owned editorial phrasing instead of brittle threshold-first wording.
4. `clear_answer_formatting` no longer over-implies bullets/steps for simple prose answers that are merely dense.
5. `faq_structure_opportunity` no longer gets an easy `pass` on dense inline repeated Q&A that is visibly FAQ-candidate.
6. Prompt and runtime contract diagnostics pass after the changes.

## Suggested Execution Order

1. complete `Milestone 1` before touching semantics
2. complete `Milestone 2` and `Milestone 3` together as one semantic pass
3. complete `Milestone 4` immediately after so the UI reflects the new narrative contract
4. complete `Milestone 5` only if payload shape changes
5. use `Milestone 6` as the package/deploy gate

## Notes

- Keep prompt additions compact; the analyzer already runs within chunk and compact-prompt budgets.
- Prefer targeted family-level rules over repeating long per-check essays in multiple places.
- If the category still drifts after this pass, the next escalation should be specimen-driven prompt examples, not broad prompt expansion.
