# AiVI Extractability Explanation Preservation Track

## Purpose

This track removes one remaining source of Answer Extractability drift:

- the analyzer can produce usable, actionable explanation packs
- the serializer still rewrites parts of those packs into generic stock language
- that flattening makes Review Rail and Copilot sound less intelligent than the analyzer actually is

This is a bounded serializer repair. It is not a redesign of Analyzer or Copilot scope.

## Core Decision

- preserve the analyzer's own explanation pack for Answer Extractability whenever it is usable
- keep serializer sanitation only for truly internal or unsafe wording
- use stock fallback wording only when the analyzer explanation is missing, empty, or clearly internal
- do not let serializer introduce question-style wording into section-intent cases

## Scope Boundaries

- do not weaken analyzer-side contracts for rhetorical hooks or title/heading intent
- do not redesign Review Rail layout
- do not touch Copilot rewrite generation in this track
- do not package or deploy until the milestone proof is green

## Milestones

### Progress Snapshot

- `M1` completed on March 31, 2026
- `M2` completed on March 31, 2026
- `M3` completed on March 31, 2026
- `M4` completed on March 31, 2026

## M1. Preserve Usable Analyzer Explanation Packs

### Goal

Stop overwriting good Answer Extractability explanation packs with serializer-authored fallback wording.

### Required Work

- preserve `what_failed`, `why_it_matters`, and `issue_explanation` from usable analyzer packs
- only supplement missing fields instead of overwriting all fields
- remove the most misleading fallback phrase so section-intent cases no longer talk about a `question heading`

### Primary Files

- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/worker/analysis-serializer.js`
- focused serializer tests

### Acceptance

- usable AI explanation packs survive summary/overlay serialization
- serializer fallback only fills missing gaps
- immediate-answer fallback wording no longer assumes a literal question heading

### Status

Completed on March 31, 2026.

Delivered:

- added preservation logic for usable Answer Extractability explanation packs in:
  - `infrastructure/lambda/orchestrator/analysis-serializer.js`
  - `infrastructure/lambda/worker/analysis-serializer.js`
- changed immediate-answer fallback guidance from `question heading` to `heading or opening line that carries the section promise`
- added focused preservation coverage in:
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`

Focused proof:

- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `node --check infrastructure/lambda/worker/analysis-serializer.js`
- `npm test -- infrastructure/lambda/orchestrator/analysis-serializer.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js --runInBand` passed `101/101`

## M2. Narrow Extractability Fallback Rewriting

### Goal

Make serializer normalization run only on clearly internal or threshold-math-heavy text, not on ordinary model-composed reasoning.

### Primary Files

- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/worker/analysis-serializer.js`
- focused serializer tests

### Acceptance

- threshold scrub still works
- internal guardrail wording is still hidden from users
- normal section-intent explanations are no longer flattened into canned stock lines

### Status

Completed on March 31, 2026.

Delivered:

- narrowed raw issue-explanation selection in:
  - `infrastructure/lambda/orchestrator/analysis-serializer.js`
  - `infrastructure/lambda/worker/analysis-serializer.js`
- raw Answer Extractability explanations now evaluate all usable analyzer-authored candidates:
  - `issue_explanation`
  - selected summary/highlight `message`
  - check-level `explanation`
- threshold-math and brittle evidence drift are now scrubbed into one clean user-facing explanation instead of being dropped and replaced with serializer-authored stock narrative
- added focused regression coverage in:
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`

Focused proof:

- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `node --check infrastructure/lambda/worker/analysis-serializer.js`
- `npm test -- infrastructure/lambda/orchestrator/analysis-serializer.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js --runInBand` passed `103/103`

## M3. Keep Review Rail And Copilot On Analyzer-Led Language

### Goal

Ensure Review Rail summaries and Copilot issue context inherit the preserved analyzer reasoning instead of generic serializer substitutes.

### Primary Files

- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `assets/js/aivi-overlay-editor.js`
- focused overlay/serializer tests

### Acceptance

- Review Rail issue explanation stays aligned with analyzer intent
- Copilot receives cleaner issue framing for Answer Extractability cases
- no `question heading` drift appears in section-intent paths

### Status

Completed on March 31, 2026.

Delivered:

- updated `assets/js/aivi-overlay-editor.js` so Answer Extractability summaries now prefer preserved analyzer-led `what_failed` text before older `review_summary` and `message` fallbacks
- updated `assets/js/aivi-overlay-editor.js` so Copilot analyzer notes now prefer preserved analyzer-authored fields in this order:
  - `issue_explanation`
  - explanation-pack `issue_explanation`
  - explanation-pack `what_failed`
  - only then older `review_summary` / `message` fields
- aligned the dedicated Copilot issue packet so:
  - `analyzer_note` carries the richer preserved analyzer explanation
  - `message` carries the cleaner summary text for the selected issue
- updated focused overlay proof in:
  - `tests/js/overlay-fix-assist-regression.test.js`

Focused proof:

- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- tests/js/overlay-fix-assist-regression.test.js --runInBand` passed `15/15`

## M4. Focused Proof And Release

### Goal

Run the narrow proof pack, then package and deploy only after the serializer preservation lane is clean.

### Acceptance

- focused proof pack green
- track notes updated
- package/deploy handled cleanly once approved

### Status

Completed on March 31, 2026.

Delivered:

- ran the focused extractability preservation proof pack across:
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `tests/js/overlay-fix-assist-regression.test.js`
- bumped the plugin release markers to `1.0.43` in:
  - `ai-visibility-inspector.php`
  - `readme.txt`
  - `CHANGELOG.md`
- packaged the fresh installable plugin ZIP as `dist/ai-visibility-inspector-1.0.43.zip`
- deployed the lambda-side serializer changes cleanly through `infrastructure/deploy-rcl-7z.ps1`
- verified the live backend timestamps after deploy:
  - `aivi-orchestrator-run-dev` → `2026-03-31T15:26:02.000+0000`
  - `aivi-analyzer-worker-dev` → `2026-03-31T15:26:14.000+0000`

Focused proof:

- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `node --check infrastructure/lambda/worker/analysis-serializer.js`
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- infrastructure/lambda/orchestrator/analysis-serializer.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js tests/js/overlay-fix-assist-regression.test.js --runInBand` passed `118/118`
