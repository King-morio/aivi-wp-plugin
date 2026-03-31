# AiVI Headline Intent Cue Repair Track

## Purpose

This track narrows one remaining Answer Extractability drift:

- page titles, H1s, and headlines can still behave too loosely in the answer-intent lane
- they should not be treated as automatic strict question anchors
- they should still be usable as bounded local intent cues when they clearly promise an answer or structured surface

This is a small contract repair. It is not a redesign of the analyzer.

## Core Decision

- page title, H1, and headline text are `intent cues` by default
- they are **not** automatic strict question anchors
- strict anchors stay limited to explicit user-facing question text
- title/headline intent can still support bounded local judgment for:
  - immediate answer placement
  - answer snippet concision
  - question-answer alignment
  - clear answer formatting

## Why This Track Exists

Recent testing exposed an edge case:

- rhetorical hook questions are now being filtered correctly in live runs
- but some headline-led articles still feel like they are being judged without a clean title-intent contract
- the page title is not always present as a usable local intent cue in runtime payloads

That creates confusion for articles where:

- the title promises a direct answer or structured surface
- the opening delays fulfillment
- the section is not a literal Q&A pair

## Scope Boundaries

- do not turn titles or H1s into strict question anchors
- do not suppress title/headline intent entirely
- do not redesign the whole answer-extractability family
- do not change Review Rail or Copilot UI in this track

## Milestones

### Progress Snapshot

- `M1` completed on March 31, 2026
- `M2` completed on March 31, 2026
- `M3` completed on March 31, 2026
- `M4` completed on March 31, 2026

## M1. Runtime Title And Headline Intent Contract

### Goal

Make the live runtime treat page title, H1, and headline text as bounded intent cues by default, not as automatic strict anchors.

### Required Work

- add explicit title/headline intent-cue guidance to the answer-extractability contract
- promote the page title into the runtime `section_intent_cues` payload when it clearly signals answer or structured-surface intent
- keep strict question anchors limited to explicit question text only

### Primary Files

- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `infrastructure/lambda/orchestrator/prompts/analyzer-v1.txt`
- `infrastructure/lambda/orchestrator/prompt-manager.js`
- `infrastructure/lambda/worker/worker-regression.test.js`

### Acceptance

- page titles can appear as `section_intent_cues`
- page titles do not inflate `question_anchor_count`
- prompt and schema language both describe titles/headlines as intent cues, not automatic strict anchors

### Status

Completed on March 31, 2026.

Delivered:

- promoted page-title intent into runtime `section_intent_cues` in `infrastructure/lambda/worker/index.js`
- kept title/headline intent separate from strict question anchors
- aligned all three shared `checks-definitions-v1.json` copies with the new title/headline intent-cue language
- aligned live worker and orchestrator prompt text:
  - `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
  - `infrastructure/lambda/orchestrator/prompts/analyzer-v1.txt`
  - `infrastructure/lambda/orchestrator/prompt-manager.js`
- added focused regression coverage in `infrastructure/lambda/worker/worker-regression.test.js`

Focused proof:

- `node --check infrastructure/lambda/worker/index.js`
- `node --check infrastructure/lambda/orchestrator/prompt-manager.js`
- JSON parse passed for `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `npm test -- infrastructure/lambda/worker/worker-regression.test.js tests/diagnostics/prompt-sync.test.js tests/diagnostics/check-contract-sync.test.js --runInBand` passed `50/50`

## M2. User-Facing Answer Extractability Wording

### Goal

Make serializer wording explain delayed headline fulfillment cleanly instead of sounding like every headline is a literal question anchor.

### Primary Files

- `infrastructure/lambda/worker/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- focused serializer tests

### Acceptance

- user-facing explanations prefer “headline promise / delayed fulfillment” language
- no drift back to rigid question-anchor wording for title-led explainer articles

### Status

Completed on March 31, 2026.

Delivered:

- updated worker and orchestrator serializer guardrail wording so answer-extractability fallbacks now talk about headline or section promise fulfillment instead of strict question-anchor failure
- updated immediate-answer placement fallback wording to describe delayed fulfillment rather than generic extractability failure
- aligned focused serializer expectations in:
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`

Focused proof:

- `node --check infrastructure/lambda/worker/analysis-serializer.js`
- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `npm test -- infrastructure/lambda/worker/analysis-serializer.worker.test.js infrastructure/lambda/orchestrator/analysis-serializer.test.js --runInBand` passed `99/99`

## M3. Focused Fixtures And Runtime Proof

### Goal

Lock the repaired contract with narrow fixtures:

- direct-answer headline
- broad multi-answer headline
- structured-surface headline

### Primary Files

- `fixtures/copilot/*` as needed
- `infrastructure/lambda/worker/worker-regression.test.js`
- `tests/diagnostics/prompt-sync.test.js`
- `tests/diagnostics/check-contract-sync.test.js`

### Acceptance

- title-led headline specimens produce bounded intent cues without strict-anchor inflation
- contract copies and prompt text stay aligned

### Status

Completed on March 31, 2026.

Delivered:

- added three focused title-led specimens:
  - `fixtures/copilot/headline-intent-direct-answer-psoriasis.fixture.json`
  - `fixtures/copilot/headline-intent-broad-multi-answer-digital-tools.fixture.json`
  - `fixtures/copilot/headline-intent-structured-surface-resume-donts.fixture.json`
- added runtime proof coverage in `infrastructure/lambda/worker/worker-regression.test.js`
- tightened prompt and shared-definition sync proof in:
  - `tests/diagnostics/prompt-sync.test.js`
  - `tests/diagnostics/check-contract-sync.test.js`

Focused proof:

- JSON parse passed for all three new `fixtures/copilot/*.fixture.json` files
- `npm test -- infrastructure/lambda/worker/worker-regression.test.js tests/diagnostics/prompt-sync.test.js tests/diagnostics/check-contract-sync.test.js --runInBand` passed `52/52`

## M4. Release Proof

### Goal

Run the focused pack, then package and deploy only after proof is clean.

### Acceptance

- focused runtime pack green
- release notes recorded
- package and deploy handled cleanly once approved

### Status

Completed on March 31, 2026.

Delivered:

- ran the focused M4 proof pack across:
  - `tests/js/overlay-fix-assist-regression.test.js`
  - `infrastructure/lambda/worker/worker-regression.test.js`
  - `tests/diagnostics/prompt-sync.test.js`
  - `tests/diagnostics/check-contract-sync.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- bumped the plugin release markers to `1.0.42` in:
  - `ai-visibility-inspector.php`
  - `readme.txt`
  - `CHANGELOG.md`
- packaged the fresh installable plugin ZIP as `dist/ai-visibility-inspector-1.0.42.zip`
- verified the packaged ZIP keeps the runtime-only allowlist:
  - top-level `docs/` excluded
  - `tests/` excluded
  - `infrastructure/` excluded
- deployed the repaired backend through `infrastructure/deploy-rcl-7z.ps1`

Focused proof:

- `npm test -- tests/js/overlay-fix-assist-regression.test.js infrastructure/lambda/worker/worker-regression.test.js tests/diagnostics/prompt-sync.test.js tests/diagnostics/check-contract-sync.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js infrastructure/lambda/orchestrator/analysis-serializer.test.js --runInBand` passed `165/165`
- package checks passed:
  - ZIP path: `dist/ai-visibility-inspector-1.0.42.zip`
  - packaged plugin header verified at `Version: 1.0.42`
  - packaged constant verified at `AIVI_VERSION = 1.0.42`
- deployed lambda timestamps:
  - `aivi-orchestrator-run-dev` `LastModified: 2026-03-31T13:24:19.000+0000`
  - `aivi-analyzer-worker-dev` `LastModified: 2026-03-31T13:24:31.000+0000`
