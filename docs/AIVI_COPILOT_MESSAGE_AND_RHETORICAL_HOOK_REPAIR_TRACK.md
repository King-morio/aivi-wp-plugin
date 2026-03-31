# AiVI Copilot Message And Rhetorical Hook Repair Track

## Purpose

This track covers the last visible drift after the recent Copilot repair lanes:

- weak or overly vulnerable stored Copilot messages
- stale Copilot status text persisting in the Review Rail after close
- rhetorical hook questions still being treated as answer anchors on live analysis runs

This is a bounded repair track. It is not a redesign of Analyzer, Review Rail, or Copilot scope.

## Why This Track Exists

Recent live diagnosis showed that the remaining issues are not random model behavior. They are mostly contract and state drift:

- several weak Copilot lines are stored messages, not live-composed model text
- the lingering rail message is a stale `metaStatus` cleanup problem
- the rhetoric-question repair did not fully land in the live analyzer contract actually used by the worker

## Confirmed Evidence

### 1. Stored user-facing messages still need refinement

Confirmed hardcoded examples:

- `assets/js/aivi-overlay-editor.js`
  - `I am not confident enough to rewrite this section yet. Open the issue details or jump to the related block and I will stay scoped from there.`
  - `Scoped to this issue only. Copilot keeps the suggestion anchored to the nearby text instead of rewriting the whole article.`
- `infrastructure/lambda/orchestrator/evidence-verifier.js`
  - `Variants should stay careful and avoid overstating certainty.`

These should be treated as editable product copy, not as model output.

### 2. The lingering message in the Review Rail is a stale UI state issue

Confirmed path:

- rail status surface is created in `assets/js/aivi-overlay-editor.js`
- `setMetaStatus(...)` writes to the persistent rail status element
- Copilot close/dismiss hides the panel but does not reliably clear `metaStatus`

Result:

- Copilot can close correctly
- the last fallback sentence can still remain visible in the Review Rail

### 3. Live rhetorical-question handling is still incomplete

Confirmed from live worker logs for the latest run:

- run id: `30936ad2-2512-411e-8e0d-c6e89c5a4497`
- started: `2026-03-31 09:18:58 UTC`
- `question_anchor_count: 3`
- `anchor_v2_enabled: false`

This means the live analyzer still entered answer-extractability with three accepted question anchors.

### 4. The live worker contract still uses older strict-anchor language

Confirmed runtime drift:

- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`

These files still lean on the older strict-anchor framing instead of the newer rhetorical-hook and section-intent behavior.

## Immediate Non-Goals

- do not redesign Analyzer beyond the scoped answer-extractability lane
- do not redesign Review Rail layout
- do not add new user actions like `Insert`
- do not broaden Copilot scope beyond issue-local repair behavior

## Milestones

### Progress Snapshot

- `M1` completed on March 31, 2026
- `M2` completed on March 31, 2026
- `M3` completed on March 31, 2026
- `M4` completed on March 31, 2026

## M1. Copilot Message Surface Refinement

### Goal

Replace vulnerable or over-explanatory stored copy with calmer, more product-ready messaging.

### Required Work

- audit stored Copilot helper, fallback, consent, and verification strings
- replace weak self-referential phrasing with calm editorial guidance
- keep message intent intact while removing vulnerability language and internal-sounding phrasing

### Primary Files

- `assets/js/aivi-overlay-editor.js`
- `infrastructure/lambda/orchestrator/evidence-verifier.js`
- `tests/js/overlay-fix-assist-regression.test.js`

### Acceptance

- Copilot no longer tells the user it is "not confident enough"
- scoped behavior can still be communicated without sounding defensive or technical
- verification fallback copy stays professional and publication-oriented

### Status

Completed on March 31, 2026.

Delivered:

- refined stored helper, consent, and verification copy in `assets/js/aivi-overlay-editor.js`
- refined verification-result copy in `infrastructure/lambda/orchestrator/evidence-verifier.js`
- updated string-based regression proof in `tests/js/overlay-fix-assist-regression.test.js`

Focused proof:

- `node --check assets/js/aivi-overlay-editor.js`
- `node --check infrastructure/lambda/orchestrator/evidence-verifier.js`
- `npm test -- tests/js/overlay-fix-assist-regression.test.js infrastructure/lambda/orchestrator/evidence-verifier.test.js --runInBand` passed `17/17`

## M2. Review Rail Status Cleanup

### Goal

Ensure Copilot close and dismiss actions do not leave stale Copilot messaging behind in the Review Rail.

### Required Work

- trace every close path for the Copilot panel
- clear or normalize `metaStatus` when close is purely visual and no durable status should remain
- preserve valid operational status messages where they still matter, without leaving stale Copilot helper text behind

### Primary Files

- `assets/js/aivi-overlay-editor.js`
- `tests/js/overlay-fix-assist-regression.test.js`

### Acceptance

- closing Copilot removes leftover helper/fallback text from the Review Rail
- the rail status surface still works for genuine operational messages
- no stale Copilot message remains after outside-click dismiss, close button, or panel collapse

### Status

Completed on March 31, 2026.

Delivered:

- introduced Copilot-owned rail status tracking in `assets/js/aivi-overlay-editor.js`
- routed Copilot helper, consent, failure, and variant-ready rail messages through a dedicated fix-assist status path
- cleared Copilot-owned rail status on close, outside dismiss, issue switch, and full overlay close without wiping general editor messages
- added focused regression coverage in `tests/js/overlay-fix-assist-regression.test.js`

Focused proof:

- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- tests/js/overlay-fix-assist-regression.test.js --runInBand` passed `13/13`

## M3. Rhetorical Hook And Section-Intent Runtime Alignment

### Goal

Make the live analyzer stop treating rhetorical hooks as real answer anchors, and allow heading or pseudo-heading intent to govern bounded local extractability decisions.

### Required Work

- align all runtime schema copies to the newer rhetorical-hook and section-intent contract
- update the worker-side analysis prompt actually used in live analysis
- confirm whether `anchor_v2_enabled` must be turned on, replaced, or bypassed for this lane
- keep the scope bounded to answer-extractability checks only

### Primary Files

- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/orchestrator/analyze-run-async-handler.js`
- focused worker/orchestrator tests for rhetorical hooks and answer extractability

### Acceptance

- rhetorical intro questions no longer inflate `question_anchor_count` for explainer-style articles
- heading and pseudo-heading intent can support local answer-placement judgment when a true strict anchor does not exist
- live analyzer output stops trying to force direct-answer obligations onto rhetorical lead-ins

### Status

Completed on March 31, 2026.

Delivered:

- narrowed live strict-anchor detection in `infrastructure/lambda/worker/index.js` so relaxed heading-like prompts no longer count as strict anchors
- added live analyzer telemetry for `section_intent_cue_count` alongside `question_anchor_count`
- updated the live worker prompt in `infrastructure/lambda/worker/prompts/analysis-system-v1.txt` so answer-family checks can use bounded section-intent cues when strict anchors are absent
- aligned all runtime schema copies:
  - `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
  - `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
  - `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- refreshed worker regression coverage for:
  - rhetorical hook question filtering
  - heading/pseudo-heading intent cues
  - March 16-style heading-intent extractability handling
- aligned worker serializer expectations with the calmer section-intent fallback wording now used in runtime

Focused proof:

- `node --check infrastructure/lambda/worker/index.js`
- JSON parse passed for all 3 runtime `checks-definitions-v1.json` copies
- `npm test -- infrastructure/lambda/worker/worker-regression.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js tests/diagnostics/check-contract-sync.test.js --runInBand` passed `77/77`

## M4. Focused Live Proof And Release

### Goal

Prove the repaired behavior on one or two disciplined live cases, then package and deploy cleanly if code changes cross plugin and backend surfaces.

### Required Work

- run focused regression checks for Copilot messaging and rhetorical-hook handling
- run one live analyzer verification on a rhetoric-hook specimen
- confirm the rail no longer keeps stale Copilot fallback text after close
- package a plugin ZIP only if local installable plugin files changed
- deploy backend only if runtime lambda files changed

### Acceptance

- user-facing Copilot copy reads calmly and professionally
- stale Review Rail helper text no longer persists after close
- a recent live rhetoric-hook article no longer gets pushed into false answer-anchor behavior
- release artifact and deploy timestamps clearly match the repaired lane

### Status

Completed on March 31, 2026.

Delivered:

- ran the focused proof pack across Copilot messaging, evidence wording, worker rhetorical-hook handling, and contract sync
- packaged the installable plugin release as `dist/ai-visibility-inspector-1.0.41.zip`
- deployed the live backend through `infrastructure/deploy-rcl-7z.ps1`
- verified the live rhetoric-hook repair on a disposable trial-bound site against the public dev API without touching a customer site

Focused proof:

- `npm test -- tests/js/overlay-fix-assist-regression.test.js infrastructure/lambda/orchestrator/evidence-verifier.test.js infrastructure/lambda/worker/worker-regression.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js tests/diagnostics/check-contract-sync.test.js --runInBand` passed `95/95`
- live proof run `9bfb52b0-c882-43f4-a9ad-b3fbacaaf97e` completed with status `success`
- live worker logs for that run showed:
  - `feature_flags.anchor_v2_enabled: false`
  - `question_anchor_count: 0`
  - `section_intent_cue_count: 0`
- release package checks passed:
  - ZIP path: `dist/ai-visibility-inspector-1.0.41.zip`
  - packaged plugin header verified at `Version: 1.0.41`
- deployed lambda timestamps:
  - `aivi-orchestrator-run-dev` `LastModified: 2026-03-31T11:20:12.000+0000`
  - `aivi-analyzer-worker-dev` `LastModified: 2026-03-31T11:20:38.000+0000`

## Release Rule

- if only backend files change, deploy only
- if only installable plugin files change, package only
- if both surfaces change, package and deploy
