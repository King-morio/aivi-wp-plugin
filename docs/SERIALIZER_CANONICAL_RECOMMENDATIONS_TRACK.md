# Serializer Canonical Recommendations Track

## Goal
Make one issue contract drive overlay highlights, recommendation cards, and jump-to-block behavior so user-facing issue text stays clean, deterministic wording stays instance-specific, and worker/orchestrator serializer drift cannot reintroduce debug copy.

## Locked diagnosis

### 1. The live regression is not an anchoring failure
- Live worker logs for run `0831b2ce-3ea5-4f4f-b393-42f3c58fb116` showed:
  - `candidates_total: 25`
  - `anchored_total: 25`
  - `failed_total: 0`
- The bad text therefore came from issue-message assembly, not failed anchoring.

### 2. The worker serializer is the active broken path
- The worker creates `aggregator.json` and `overlay_content`.
- The worker still uses its own serializer copy in:
  - [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- The newer hygiene work landed in:
  - [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- The worker copy is missing the newer guardrail scrubber and richer recommendation assembly.

### 3. Per-instance guardrail messages are still stale at source
- In the live artifact, top-level semantic `check.explanation` can be clean while `highlights[].message` still contains:
  - `No strict question anchor exists...`
  - `cannot be evaluated`
  - `remains unproven`
- Those stale instance messages are then promoted into recommendation cards.

### 4. Deterministic issue wording is also drifting in the recommendation path
- For `appropriate_paragraph_length`, the stored deterministic highlight message is already singular and local.
- But the recommendation explanation still falls back to aggregate catalog wording like:
  - `At least one paragraph exceeds...`
- So the regression is not only semantic; deterministic recommendation assembly is also stale.

## Fixture baseline
- Stable live manifest fixture:
  - [live-run-0831.manifest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/overlay/live-run-0831.manifest.json)
- Stable live result fixture:
  - [live-run-0831.aggregator.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/overlay/live-run-0831.aggregator.json)

These fixtures are the acceptance baseline for this track.

## Phase 1: Lock the live regression in tests

Files:
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
- new worker serializer regression test file
- [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)

Change group:
- Add fixture-backed tests that prove:
  - worker recommendation text must not contain internal guardrail phrases
  - deterministic paragraph recommendation wording prefers the singular instance message
  - all flagged issues can be represented in recommendation records without losing jump metadata
  - worker and orchestrator serializers produce aligned user-facing issue text for the same fixture

Acceptance:
- No recommendation `message`, `rationale`, `what_failed`, or `issue_explanation` contains:
  - `strict question anchor`
  - `cannot be evaluated`
  - `remains unproven`
- Paragraph-length recommendation wording is singular/local when the issue instance is singular/local.

Status:
- Completed locally on 2026-03-11.
- The live run is now pinned as a fixture-backed regression.
- Worker serializer tests now lock:
  - guardrail phrase scrubbing
  - singular paragraph wording
  - canonical recommendations with jump metadata

## Phase 2: Sanitize issue-instance messages at source

Files:
- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)

Change group:
- When `guardrail_adjusted` is true, use editorial copy for:
  - top-level `check.explanation`
  - `candidate_highlights[].message`
  - any generated per-instance fallback tied to the guardrail-adjusted finding
- Keep `guardrail_reason` internal and machine-readable.

Acceptance:
- Guardrail reason codes remain available for telemetry/runtime logic.
- User-visible instance messages never contain raw guardrail diagnostics.

Status:
- Completed locally on 2026-03-11.
- Worker candidate/highlight messages now use editorial guardrail copy while preserving machine-readable `guardrail_reason`.

## Phase 3: Align worker serializer with the canonical recommendation contract

Files:
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)

Change group:
- Port the newer guardrail sanitization behavior into the worker serializer.
- Prefer instance-specific deterministic wording when a concrete highlight/candidate message exists.
- Emit recommendation records from the same canonical issue objects that feed jump-to-block metadata.
- Keep `recommendations` as the canonical issue list while retaining:
  - `jump_node_ref`
  - `start`
  - `end`
  - `analysis_ref`
- Preserve `unhighlightable_issues` as a narrower subset for backward compatibility if needed.

Acceptance:
- Recommendations become the canonical issue list.
- Jump-to-block still works for inline-capable findings.
- Worker and orchestrator serializers no longer drift on guardrail and deterministic explanation behavior.

Status:
- Completed locally on 2026-03-11 for the active worker overlay path.
- `recommendations` now contains the canonical issue list for the worker overlay serializer.
- `unhighlightable_issues` remains available as the narrower compatibility subset.
- Worker serializer now sanitizes legacy/stale guardrail text on read and prefers local deterministic instance wording.

## Phase 4: Regression lock and rollout

Files:
- tests touched in phases 1-3
- this track doc

Change group:
- Run focused serializer/worker suites.
- Keep deploy as the last step after the regression set is green.

Acceptance:
- Focused regression suites pass.
- One clean deploy is sufficient.
- Live verification confirms the footer/recommendation bucket uses clean editorial wording.

Status:
- Local regression suites passed on 2026-03-11:
  - `infrastructure/lambda/worker/worker-regression.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- Deployment to the dev lambdas completed on 2026-03-16 after the worker/orchestrator serializer regressions and release-package safety checks were re-run successfully.
- This track is complete for the current branch and no longer blocks release decisions.

## Historical Start Point
- Original execution order:
  - Start with Phase 1.
  - Do not deploy until Phases 1-4 are green locally.
