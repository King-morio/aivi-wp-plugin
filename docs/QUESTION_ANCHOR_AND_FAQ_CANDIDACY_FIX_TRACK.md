# Question Anchor and FAQ Candidacy Fix Track

## Purpose

Tighten the overlapping answer-engine checks exposed by the live `ru.my-style.in` run:

- `immediate_answer_placement`
- `answer_sentence_concise`
- `question_answer_alignment`
- `clear_answer_formatting`
- `faq_structure_opportunity`
- `lists_tables_presence`

This track exists because the latest live artifact showed three different failure modes that should not be conflated:

1. a real worker-side guardrail bug collapsing multiple answer checks into the same fallback message
2. FAQ candidacy rules that are still too loose for dense inline Q&A sections
3. incomplete semantic checks in partial runs, which can make a missing recommendation look like bad logic when it is actually non-completion

## Ground Truth From Live Run

Run:

- `run_id`: `620ed705-0e37-440e-a2c6-13ff26ac3346`
- site: `ru.my-style.in`
- status: `success_partial`

Confirmed from live artifact/logs:

- the manifest block `block-6` contained 3 explicit question-answer pairs
- worker logs recorded `question_anchor_count: 3`
- yet these 4 checks all collapsed to the same fallback explanation:
  - `immediate_answer_placement`
  - `answer_sentence_concise`
  - `question_answer_alignment`
  - `clear_answer_formatting`
- `faq_structure_opportunity` returned `pass` even though the visible block behaved like dense inline Q&A
- `lists_tables_presence` did not truly “miss” on logic in that run; it was one of the checks that did not complete

Incomplete semantic checks in that run:

- `heading_topic_fulfillment`
- `lists_tables_presence`
- `readability_adaptivity`
- `temporal_claim_check`
- `named_entities_detected`

## Locked Decisions

1. The four answer checks above must no longer collapse into one generic “query-to-answer path is too ambiguous” fallback when strict anchors were actually detected.
2. Multi-question inline answer blocks should count as FAQ candidates when they clearly answer repeated user questions, even if the structure is still poor.
3. `faq_structure_opportunity` should not pass merely because Q&A is packed into one paragraph instead of reusable pairs.
4. FAQ-related checks must be audited for false-positive passes when candidacy is clearly present in visible content.
5. `internal_link_context_relevance` must be neutral when no internal links exist, not fail.
6. Incomplete semantic checks must not masquerade as rule failures during diagnosis.

## Current Status

- Milestone 1 implementation already exists in the active worktree across the worker guardrail path, both serializers, the analysis prompt, and the named regression suites.
- Focused validation ran on `2026-03-15` against the current dirty worktree:
  - worker: `npm.cmd test -- --runInBand worker-regression.test.js analysis-serializer.worker.test.js` -> `39 / 39` tests passed
  - orchestrator: `npm.cmd test -- --runInBand analysis-serializer.test.js` -> `52 / 52` tests passed
- Treat Milestone 1 as validated for the current branch state, not as open backlog.
- Treat the completed phases in `PROMPT_GUARDRAIL_EXPLANATION_TRACK.md` as baseline context that should not be reopened casually:
  - prompt and shared-definition cleanup
  - prompt hardening
  - JSON/output reliability locking
  - explanation hygiene
  - regression locking

## Milestones

### Milestone 1: Multi-Anchor Guardrail Fix

Goal:

- stop the worker from force-downgrading valid answer-check findings when multiple strict anchors exist but `question_anchor_text` is missing or imperfect

Scope:

- inspect and patch the question-anchor guardrail in the worker normalization path
- preserve conservative behavior when there are truly no strict anchors
- allow nearest-anchor / same-block matching when the snippet clearly belongs to a strict question-answer block
- keep the downstream serializer behavior aligned with the corrected worker output

Primary files:

- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)

Tests:

- [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)
- [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
- new focused regression for multi-anchor inline Q&A

Acceptance:

- the four answer checks no longer collapse to identical fallback copy when strict anchors were detected
- each check can preserve its own rationale when evidence is valid

### Milestone 2: FAQ Candidate and Dense Inline Q&A Rules

Goal:

- tighten `faq_structure_opportunity` so inline Q&A blocks are judged as candidates when they clearly answer repeated user questions

Scope:

- refine the definition to treat `2+` clear question-answer pairs in one section as FAQ-candidate content
- distinguish:
  - not a FAQ candidate
  - FAQ-candidate but poorly structured
  - already reusable FAQ structure
- audit FAQ-related `pass` verdicts so false-positive passes do not slip through when visible FAQ candidacy is already present
- keep `faq_jsonld_generation_suggestion` aligned with corrected FAQ candidacy so it does not inherit a false-positive pass from upstream logic
- add prompt examples that cover dense inline Q&A paragraphs specifically
- keep FAQ logic machine-readability focused, not old-school rich-result chasing

Primary files:

- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json)
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json)

Tests:

- [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
- [check-contract-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js)
- [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)
- new FAQ candidate regression using dense inline Q&A

Acceptance:

- a block like `What is X? ... Why does X matter? ... Can X help Y? ...` is treated as FAQ-candidate content
- `faq_structure_opportunity` becomes `partial` or `fail` when that content is not reusable as clean Q&A
- FAQ-related `pass` verdicts no longer survive when visible repeated Q&A makes candidacy obvious

### Milestone 3: Partial-Run Diagnostic Hygiene for Semantic Checks

Goal:

- make partial-run gaps easier to diagnose without confusing them with bad rule logic

Scope:

- explicitly verify which semantic checks were incomplete in live artifact paths
- ensure incomplete checks do not distort diagnosis of unrelated rule behavior
- confirm `lists_tables_presence` absence in the run was caused by non-completion, not by a logic miss
- tighten `internal_link_context_relevance` so absence of internal links is neutral rather than a semantic fail
- decide whether we need any additional internal-only telemetry or test coverage for this class of issue

Primary files:

- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [run-status-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/run-status-handler.js)
- artifact-backed local files created during investigation

Tests:

- [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)

Acceptance:

- incomplete semantic checks are clearly distinguished during diagnosis
- `lists_tables_presence` is confirmed as either:
  - fixed and ready
  - or still needing a separate reliability pass
- `internal_link_context_relevance` no longer fails when no internal links exist

### Milestone 4: Regression Lock and Rollout

Goal:

- lock the corrected behavior and then ship it cleanly

Scope:

- rerun targeted worker/orchestrator tests
- add one artifact-backed regression based on the live run pattern
- deploy only after backend/shared changes are complete
- package a plugin zip only if runtime plugin files are touched

Acceptance:

- the answer-check overlap is gone
- FAQ candidate logic handles dense inline Q&A correctly
- the release surface no longer makes these categories look loosely defined or redundant

## Rollout Rules

- deploy only after backend/shared work for this track is complete
- package a plugin zip only if `assets/` or `includes/` runtime files are changed

## Consolidated Remaining Work

This section is now the only active planning surface for the remaining work that used to be split across:

- this document's old follow-up guardrail drift section
- `PROMPT_GUARDRAIL_EXPLANATION_TRACK.md`

The completed prompt-track phases remain historical context, but any unfinished implementation or follow-up validation now belongs here so we do not keep two active guardrail plans in sync manually.

### Milestone 5: Explanation Quality, Observability, and Drift Lock

Goal:

- finish the remaining guardrail and explanation-quality work in one place without reopening the Milestone 1 baseline that already passes focused regressions

Scope:

- keep worker-side guardrail observability explicit and reviewable:
  - `no_strict_question_anchor`
  - `invalid_or_missing_question_anchor`
  - fallback explanation replacement count
- preserve machine-readable guardrail reasons internally while ensuring user-facing copy stays editorial
- remove any remaining one-size-fits-all fallback wording across guarded answer-family checks and FAQ-adjacent recommendation paths
- enforce the explanation length target centrally so final `issue_explanation` output usually lands in the `40-60` word band and does not drift back into filler or duplicated scaffolding
- extend anchor detection carefully for natural question-like sections without regressing the validated multi-anchor behavior
- lock repeated-template detection across answer extractability, FAQ candidacy, and partial-run semantic recommendation paths

Primary files:

- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)
- [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
- [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
- [run-status-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/run-status-handler.test.js)

Acceptance:

- artifacts and raw details clearly distinguish model output from guardrail rewrites
- guarded answer checks and FAQ-adjacent checks do not collapse into repeated fallback narratives
- user-facing explanations stay short, specific, and free of internal guardrail/debug vocabulary
- natural question-like anchor heuristics do not regress the validated multi-anchor inline Q&A scenario
- regression coverage captures both rule correctness and explanation-quality drift

Status:

- Milestone 5 is complete locally as of 2026-03-16.
- The remaining guardrail/explanation work in this consolidated track is now covered by focused regressions and acceptance sweeps across worker, orchestrator, and diagnostics.

Validation:

- `infrastructure/lambda/worker/worker-regression.test.js`: passing acceptance sweep
- `infrastructure/lambda/worker/analysis-serializer.worker.test.js`: passing with semantic and deterministic/document-scope word-band locks
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`: passing after mirrored serializer hardening
- `tests/diagnostics/prompt-sync.test.js`
- `tests/diagnostics/check-contract-sync.test.js`
