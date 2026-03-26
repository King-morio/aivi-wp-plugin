# Semantic Opportunity Governance Implementation Track

Last updated: 2026-03-24

## Purpose

This track stages the implementation of the approved semantic-governance decisions in:

- `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_AGREEMENT.md`

It exists to harden opportunity-style semantic checks without mixing:

- prompt teaching
- deterministic structural truth
- semantic runtime veto logic
- serializer release and anchoring cleanup
- debug-safe observability for live diagnosis

## Guardrails

- Use `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_AGREEMENT.md` as the active source of truth for this work.
- Keep milestones narrow enough that semantic drift can be isolated quickly.
- If a milestone needs a file outside its declared write set, stop and amend this track first.
- Do not widen M1 into runtime veto logic or serializer dedup.
- Treat live diagnosability as part of the fix, not as optional polish.

## Milestones

### M1 - Teaching Grounding

**Status:** Complete

**Goal**

Ground opportunity-style semantic checks with approved pass shapes, non-trigger rules,
and compact contrastive prompt examples before changing runtime veto logic.

**Planned write set**

- `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_IMPLEMENTATION_TRACK.md`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `tests/diagnostics/prompt-sync.test.js`

**Scope**

- keep check definitions concise but align them to the approved governance agreement
- use shared definitions only for concise boundary wording, not long tutorials
- add compact pass-shape and non-trigger rules to the worker prompt
- add contrastive prompt examples for the most drift-prone checks first
- keep runtime veto, mutual exclusion, and anchor-collapse logic deferred to later milestones
- lock the teaching rules in diagnostics so they do not silently regress

**Out of scope**

- deterministic detector changes
- FAQ bridge logic changes
- worker runtime veto logic
- serializer anchor dedup

**Outcome**

- The new governance agreement is now the explicit source of truth for this track:
  `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_AGREEMENT.md`.
- Shared check definitions now teach narrower opportunity boundaries for:
  `lists_tables_presence`, `faq_structure_opportunity`,
  `clear_answer_formatting`, `howto_semantic_validity`, and
  `readability_adaptivity`.
- The worker prompt now teaches approved pass shapes and non-trigger rules for the
  same opportunity-style checks without widening into runtime veto logic.
- The worker prompt now includes compact pass examples for the two drift-prone live
  patterns we just diagnosed:
  - visible list already present
  - single question heading plus explainer is not FAQ by itself
- Diagnostic prompt-sync tests now lock those new teaching rules so they do not
  silently drift.

**Validation**

- JSON parse check passed for all edited shared definition files via `ConvertFrom-Json`
- Focused Jest run passed:
  `npm test -- --runInBand tests/diagnostics/prompt-sync.test.js`

### M2 - Structural Truth Hardening

**Status:** Complete

**Goal**

Harden deterministic structure truth so ItemList, FAQ, and related bridge checks infer
sections from one consistent visible-section inventory.

**Planned write set**

- `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_IMPLEMENTATION_TRACK.md`
- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`

**Scope**

- build one shared normalized section inventory for:
  - visible list sections
  - pseudo-list paragraphs
  - question-led sections
  - FAQ-candidate sections
  - procedural/how-to sections
- expand visible-list detection so bullet-glyph paragraphs and similar list-like shapes
  are recognized as structural list candidates
- split FAQ bridge diagnostics so `question_sections_detected` and
  `faq_pairs_detected` do not overclaim the same thing
- emit a debug-safe structural artifact through the existing preflight artifact flow so
  live diagnosis can inspect:
  - section inventory
  - visible structural candidates
  - semantic candidate hints derived from structure

**Out of scope**

- worker post-model veto logic
- serializer release dedup
- UI changes

**Outcome**

- Orchestrator and worker preflight now build one shared structural inventory and attach
  it to the manifest as `preflight_structure` for debug-safe live diagnosis.
- The shared inventory now records:
  - visible ItemList-style sections
  - pseudo-list paragraphs
  - question-led sections
  - FAQ-candidate sections
  - procedural/how-to sections
  - semantic candidate hints derived from structure
- ItemList detection now recognizes bullet-glyph paragraph sequences as visible list
  candidates instead of requiring only true list blocks.
- FAQ bridge diagnostics now separate `question_sections_detected` from
  `faq_pairs_detected`, which prevents a single question heading plus explainer from
  overclaiming FAQ pairs.
- Procedural support detection is tightened so ordinary phrases like `next concert`
  do not accidentally trigger HowTo-style structural interpretation.

**Validation**

- Focused Jest run passed:
  `npm test -- --runInBand infrastructure/lambda/orchestrator/preflight-handler.test.js`
- Focused Jest run passed:
  `npm test -- --runInBand infrastructure/lambda/worker/preflight-handler.test.js`

### M3 - Semantic Runtime Governance

**Status:** Complete

**Goal**

Add post-model veto rules, mutual exclusions, and per-check release guards so semantic
findings cannot contradict structural truth or over-claim section opportunities.

**Planned write set**

- `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_IMPLEMENTATION_TRACK.md`
- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/worker/worker-regression.test.js`
- `infrastructure/lambda/worker/worker-normalization.test.js`

**Scope**

- add worker-side structure guardrails that can veto opportunity findings when
  `preflight_structure` contradicts them
- keep those guardrails narrow and evidence-based so they stop known overreach
  without silencing legitimate semantic findings
- preserve question-anchor guardrails as a separate mechanism rather than folding all
  semantic governance into one opaque rule
- add focused regression coverage for:
  - visible list already present
  - single question-led explainer that is not a real FAQ candidate
  - non-procedural explainer misread as HowTo
  - structurally valid FAQ opportunity that must still survive
- defer cross-block multi-highlight collapse to M4

**Out of scope**

- serializer release dedup
- overlay/sidebar rendering changes
- new deterministic structure detection

**Outcome**

- The worker now builds a dedicated semantic-structure guardrail context from
  `manifest.preflight_structure` before converting AI findings into released checks.
- `lists_tables_presence` now vetoes to `pass` when the finding lands in a section that
  already has recognized visible list structure, or when the section is structurally
  supported as FAQ material instead of a list-formatting problem.
- `faq_structure_opportunity` now vetoes to `pass` when there are not enough reusable
  question-answer pairs to support FAQ candidacy, or when a question-led section is
  actually behaving like a list/explainer rather than repeated FAQ pairs.
- `howto_semantic_validity` now vetoes to `pass` when the content lacks meaningful
  procedural signals and is therefore not a valid HowTo candidate in the first place.
- Semantic-structure vetoes now record their own telemetry bucket:
  - `semantic_structure_guardrail_adjustments_total`
  - `semantic_structure_guardrail_adjustments_by_check`
  - `semantic_structure_guardrail_adjustments_by_reason`
- Existing question-anchor telemetry remains separate, which keeps semantic-governance
  drift diagnosable instead of mixing different guardrail families together.
- `worker-normalization.test.js` was reviewed and validated unchanged for M3; the
  normalization surface itself stays deferred to M4.

**Validation**

- Focused Jest run passed:
  `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-regression.test.js`
- Focused Jest run passed:
  `npm.cmd test -- --runInBand infrastructure/lambda/worker/worker-normalization.test.js`

### M4 - Anchor And Release Dedup

**Status:** Complete

**Goal**

Collapse one semantic section finding into one released issue even when anchor recovery
touches multiple adjacent blocks.

**Planned write set**

- `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_IMPLEMENTATION_TRACK.md`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/analysis-details-handler.js`
- `infrastructure/lambda/worker/analysis-serializer.js`
- `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `tests/diagnostics/sidebar-data-flow.test.js`

**Scope**

- collapse cross-block recovered highlights for governed opportunity checks into one
  canonical released instance
- keep the collapsed instance visible as one issue in:
  - sidebar summaries
  - detail extraction
  - overlay/recommendation release paths
- preserve a representative jump target and focused highlight for the collapsed issue
- keep multi-highlight source membership available in metadata for diagnosis
- use the run manifest block map where available so the collapsed instance prefers a
  non-heading block when choosing its primary anchor

**Out of scope**

- new semantic veto rules
- new deterministic structure detection
- UI rendering redesign

**Outcome**

- Worker and orchestrator serializers now collapse cross-block recovered highlights for
  governed opportunity checks before they are surfaced to sidebar summaries.
- Collapsed issue summaries now report one canonical instance count instead of counting
  every adjacent recovery block as a separate issue.
- Worker and orchestrator `extractCheckDetails` now return collapsed opportunity
  highlights, expose the collapsed instance count, and prefer the strongest section
  anchor when selecting the focused highlight.
- The orchestrator details handler now loads the manifest before extracting details so
  the detail serializer can choose the best primary anchor from the actual block map.
- Overlay/release paths now emit one canonical issue per collapsed opportunity group
  instead of releasing one duplicate issue per adjacent recovered block.
- Collapsed groups keep lightweight metadata for diagnosis:
  - `collapsed_member_count`
  - `collapsed_source_instance_indexes`
- `tests/diagnostics/sidebar-data-flow.test.js` was validated unchanged in M4; no
  consumer-side patch was needed once serializer instance counts were corrected.

**Validation**

- Focused Jest run passed:
  `npm.cmd test -- --runInBand infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- Focused Jest run passed:
  `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/analysis-details-handler.test.js`
- Focused Jest run passed:
  `npm.cmd test -- --runInBand tests/diagnostics/sidebar-data-flow.test.js`

### M5 - Acceptance Sweep

**Status:** Complete

**Goal**

Run the focused regression sweep for the governed opportunity checks and confirm the
live drift patterns are covered by fixtures.

**Planned write set**

- `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_IMPLEMENTATION_TRACK.md`
- focused test files only if expectation snapshots need alignment

**Scope**

- run the focused regression suite for structural truth, semantic governance, and
  release dedup together
- verify the debug-safe artifact is produced and is useful enough to inspect:
  - visible bullet-glyph lists
  - single question heading plus explainer
  - no true FAQ pairs
  - no triple-highlight duplication
- lock the exact live-diagnosis patterns that triggered this track into regression
  fixtures so the same drift does not quietly return

**Outcome**

- The full focused governance sweep is clean across the whole chain:
  - prompt teaching
  - deterministic structural truth
  - worker-side semantic veto logic
  - serializer/detail dedup and release shaping
- Existing M2-M4 regressions collectively cover the live drift patterns that started
  this track:
  - visible bullet-glyph list structures
  - a single question-led explainer that should not become FAQ
  - no true FAQ pairs
  - no duplicate multi-block issue release from one semantic section finding
- No additional runtime or test-file edits were needed in M5; the acceptance sweep
  passed on the implemented code as-is.

**Validation**

- Focused Jest batch passed:
  `npm.cmd test -- --runInBand tests/diagnostics/prompt-sync.test.js infrastructure/lambda/orchestrator/preflight-handler.test.js infrastructure/lambda/worker/preflight-handler.test.js infrastructure/lambda/worker/worker-regression.test.js infrastructure/lambda/worker/worker-normalization.test.js`
- Focused Jest batch passed:
  `npm.cmd test -- --runInBand infrastructure/lambda/worker/analysis-serializer.worker.test.js infrastructure/lambda/orchestrator/analysis-details-handler.test.js tests/diagnostics/sidebar-data-flow.test.js`
- Total focused suites passed: `8`
- Total focused tests passed: `180`
