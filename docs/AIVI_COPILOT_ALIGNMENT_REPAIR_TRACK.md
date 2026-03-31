# AiVI Copilot Alignment Repair Track

## Purpose

This track turns the decisions in [AIVI_COPILOT_AGREED_DECISIONS_BOARD.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_AGREED_DECISIONS_BOARD.md) into implementation milestones for the current repair sweep.

This is not a replacement for:

- [AIVI_COPILOT_FIX_ASSIST_SPEC.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_FIX_ASSIST_SPEC.md)
- [AIVI_COPILOT_FIX_ASSIST_IMPLEMENTATION_TRACK.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_FIX_ASSIST_IMPLEMENTATION_TRACK.md)

Those documents still matter.

This track exists because the recent shipped Copilot slice drifted away from the agreed direction in four visible ways:

1. the Review Rail stopped matching the sidebar-visible issue set
2. issue naming regressed into `Untitled issue`
3. Copilot kept falling back to guidance-only because gating was too rewrite-target-driven
4. the attached-stack UI still felt noisier and more repetitive than intended

## Source of Truth

For this repair sweep, the decisions board is the authority:

- [AIVI_COPILOT_AGREED_DECISIONS_BOARD.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_AGREED_DECISIONS_BOARD.md)

If any implementation detail conflicts with that board, the board wins.

## Locked Outcome

By the end of this repair track:

- the Review Rail is again the canonical visible issue list
- Copilot follows the selected flagged issue, not a rewrite-ready subset
- local article scanning is the primary grounding path
- analyzer `rewrite_target` and `signature` become hint-only
- Copilot opens quietly from the issue card in a calm attached-stack layout
- helper copy disappears when variants are shown
- state chips and action text stop polluting the compact card

## Milestones

### M1 - Restore Canonical Review Rail

#### Goal

Put the Review Rail back on the full visible issue set so it matches what the user already sees in the sidebar and overlay issue summary.

#### What changes

- stop using `overlay_content.v2_findings` as the rail’s primary list
- use the canonical issue list as the rail dataset
- keep actionable/enriched finding metadata as a merge layer, not the source list
- restore count parity between:
  - sidebar issue total
  - rail issue total

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`

#### Verification

- rail count matches visible issue count again
- no issue disappearance caused by rewrite readiness
- no change to the user’s visible issue ordering unless intentional

#### Status

- implemented locally

What landed in this slice:

- the Review Rail no longer prefers `overlay_content.v2_findings` as its primary dataset
- canonical rail issues now come from `overlay_content.recommendations` first
- `v2_findings` are still used, but only as an enrichment layer for:
  - `rewrite_target`
  - `repair_intent`
  - `analysis_ref`
  - `fix_assist_triage`
- rail items now retain the canonical visible issue count instead of collapsing to the rewrite-ready subset

What this is expected to fix first:

- `3 issues in focus` drift when the sidebar shows a larger visible issue set
- rail item drift caused by treating rewrite-capable findings as the list source
- some `Untitled issue` cases where the actionable enrichment path had displaced the canonical named issue objects

### M2 - Normalize Issue Identity and Naming

#### Goal

Ensure every issue card and Copilot surface resolves a human-readable issue name without falling back to `Untitled issue` unless truly unavoidable.

#### What changes

- prefer `check_name`
- else `name`
- else canonical resolved check name
- else `check_id`
- stop showing raw check ID as a large visible heading in Copilot UI

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `infrastructure/lambda/orchestrator/sidebar-payload-stripper.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`

#### Verification

- no `Untitled issue` when a usable name exists
- no check ID shown as the visible Copilot title
- issue card title and Copilot identity stay consistent

#### Status

- implemented locally

What landed in this slice:

- canonical issues in `analysis_summary` now carry both `name` and `check_name`
- the sidebar payload stripper now preserves `check_name` and normalizes it before fallback defaults
- the overlay now resolves issue labels through a real fallback chain:
  - `checkName`
  - `check_name`
  - `name`
  - `title`
  - nested check/title values
  - humanized `check_id`
- Review Rail and Copilot issue labels no longer depend on `check_name` existing in only one exact shape

What this is expected to fix first:

- `Untitled issue` regressions when a usable issue name exists
- name drift between canonical issues and enriched actionable findings
- raw identifier leakage where a human-readable check name should be available

### M3 - Local-First Copilot Target Resolution

#### Goal

Make Copilot ground itself primarily in the selected Review Rail issue plus the live article context, not in analyzer rewrite anchors.

#### What changes

- selected Review Rail issue becomes the primary `what` and `why`
- local article scan resolves the `where`
- targeting order becomes:
  1. selected issue
  2. local matched highlight/block
  3. local snippet/message overlap scan
  4. heading chain and pseudo-heading section bounds
  5. analyzer `rewrite_target` as hint only

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `infrastructure/lambda/orchestrator/rewrite-handler.js`

#### Likely supporting files

- `infrastructure/lambda/orchestrator/rewrite-target-resolver.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`

#### Verification

- Copilot can still locate the flagged section even when analyzer targeting is weak
- pseudo headings still act as real boundaries
- local section confidence can allow help even when shipped rewrite target is imperfect

#### Status

- implemented locally

What landed in this slice:

- the overlay now builds a local repair context from the selected Review Rail issue plus the live editor manifest before it falls back to analyzer rewrite metadata
- local target resolution now uses:
  - explicit local node refs when available
  - snippet and review-summary text overlap search
  - heading and pseudo-heading section bounds
  - section-aware repair anchor adjustment when the surfaced issue lands on a heading-like boundary
- the rewrite handler can now synthesize a suggestion from `issue_context` when `rewrite_target` is weak or absent, so local issue grounding can still travel end to end

What this is expected to fix first:

- Copilot staying blocked just because analyzer rewrite anchors are imperfect
- issue focus drifting back to analyzer-emitted targets when the current article context already identifies the repair area more clearly
- needless failure on issue-context-grounded requests that do not need a legacy suggestion object

### M4 - Rewrite Gating Realignment

#### Goal

Stop the early “guidance-only” fallback from firing just because `rewrite_target.actionable` is missing or imperfect.

#### What changes

- Copilot asks:
  - `Can AiVI resolve a local section confidently enough to help?`
- not:
  - `Did the analyzer give a perfect rewrite target?`
- `variants_allowed` and similar state should reflect local-context confidence, not only backend anchor presence
- keep analyzer targeting as assistive metadata, not the permission gate

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `infrastructure/lambda/orchestrator/rewrite-handler.js`
- `includes/class-rest-rewrite.php`

#### Verification

- fewer false `guidance-only` fallbacks
- actionable issues in the rail can actually surface variants when local context is strong enough
- remaining guidance-only cases are calm and justified, not accidental

#### Status

- implemented locally

What landed in this slice:

- Copilot now resolves a live availability state from the selected issue, the current source item, and the local rewrite context instead of trusting the stale `rewrite_target.actionable` snapshot on the rail card
- false manual-only fallbacks now use calmer local-context language instead of the old `guidance-only` / `safe block-local rewrite target` copy
- the popover now re-resolves the live source item before generation, so rail cards no longer depend on a brittle direct key lookup alone
- optional and leave-as-is issues can keep their editorial state while still allowing variants when local grounding is strong enough

What this is expected to fix first:

- Copilot saying it cannot suggest variants even when the selected issue can already be grounded from local article context
- stale `guidance-only` behavior caused by card-level `actionable` flags that were frozen too early
- noisy fallback messaging that made the assistant feel more broken than cautious

### M5 - Calm Attached-Stack UI Pass

#### Goal

Bring the shipped Copilot card closer to the agreed calm, Grammarly-like attached-stack behavior.

#### What changes

- Copilot stays closed by default
- only the small launch pill/icon is visible on the active issue card
- Copilot opens attached just above the active issue
- card width matches the issue-card width
- body copy wraps neatly like the Review Rail
- the card no longer competes with the issue card using a second loud title block

#### Header treatment

- AiVI icon
- `Copilot`
- quiet state pill only if it truly helps
- small red `x`

#### Body treatment

- one calm helper sentence before generation
- helper sentence disappears when variants are shown
- scrollable body region if content runs long

#### Action treatment

- use pill-like actions
- keep them low-noise and inline
- action-related explanations open only when clicked

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `includes/class-assets.php`
- `assets/img/aivi-icon.png`

#### Verification

- Copilot card no longer covers article paragraphs by default
- no repeated giant heading in the card
- helper sentence is hidden once variants are present
- outside click and red `x` both close the card cleanly

#### Status

- implemented locally

What landed in this slice:

- the Copilot popover no longer repeats the issue name as a second large heading, so the issue card keeps identity and the popover stays in helper mode
- the pre-generation body is now a single calm helper sentence instead of stacked summary plus framing blocks
- the state chip is now suppressed unless it genuinely clarifies the editorial state, which keeps the header quieter
- action labels were shortened and kept pill-like, with `Why flagged` replacing the longer earlier copy
- the popover chrome was tightened to better match the approved attached-stack feel:
  - lighter shadow
  - slightly shorter card
  - quieter note treatment
  - neater wrapping inside the message area

What this is expected to fix first:

- the feeling that Copilot is a second competing card instead of a helper attached to the active issue
- visual noise from repeated titles and stacked explanatory copy
- migraine-inducing density when the user only wants a quick read of what Copilot can help with

### M6 - Guidance and Variants Mode Separation

#### Goal

Make the compact Copilot card prioritize one mode at a time instead of trying to show helper text, guidance, and variants all at once.

#### What changes

- helper mode:
  - calm single sentence
- guidance mode:
  - expanded explanation on `Why flagged`
- variants mode:
  - variants surface replaces helper copy
- state labels like `Guidance only` stay suppressed unless they genuinely help the user

#### First files to touch

- `assets/js/aivi-overlay-editor.js`

#### Verification

- compact card stays readable
- no message pollution from stacked explanatory blocks
- card feels closer to a focused assistant note than a second sidebar

#### Status

- implemented locally

What landed in this slice:

- the Copilot popover now resolves an explicit display mode:
  - helper
  - guidance
  - variants
- helper mode now shows a single calm sentence, with temporary status copy folded into that same slot instead of stacking extra note blocks underneath
- guidance mode now owns the body area when `Why flagged` is opened, so the compact card stops showing helper copy and expanded explanation at the same time
- variants mode now replaces helper text instead of sitting underneath it
- clicking `Show 3 variants` or `Keep as is` now collapses guidance mode so the card returns to a single clear mode

What this is expected to fix first:

- stacked helper + guidance + variants content inside the same small Copilot card
- message pollution from user notes and generation status blocks piling under the main explanation
- the feeling that the popover is trying to be a second sidebar instead of a compact assistant note

### M7 - Analyzer Hint Demotion and Prompt Cleanup

#### Goal

Demote analyzer-emitted anchors to hint-only status in both implementation and prompt framing, without breaking useful metadata paths.

#### What changes

- stop treating analyzer `rewrite_target`, `signature`, and related anchor metadata as authoritative
- keep them in payloads only as optional hints
- remove any prompt framing that assumes analyzer-provided rewrite anchors are the core authority
- preserve useful fields only where they still help local-first grounding

#### First files to touch

- `infrastructure/lambda/orchestrator/rewrite-handler.js`
- `infrastructure/lambda/orchestrator/rewrite-target-resolver.js`
- `docs/AIVI_COPILOT_FIX_ASSIST_SPEC.md`

#### Verification

- Copilot still works when anchor metadata is weak
- prompt framing reflects issue-first and local-context-first grounding
- no new dependency is introduced on fragile signature drift

#### Status

- implemented locally

What landed in this slice:

- the rewrite system prompt now treats the repair contract and issue context as the primary authority
- analyzer-emitted anchors are now framed explicitly as optional location hints in the rewrite prompt instead of as a hard `TARGET RESOLUTION`
- `rewrite-target-resolver` now prefers node refs and local text evidence before it falls back to `signature`
- the core spec now states the grounding order directly:
  - selected Review Rail issue
  - live local article context
  - analyzer anchor hints only

What this is expected to fix first:

- backend prompt framing that still sounded like analyzer anchors outranked local issue grounding
- signature drift pulling targeting toward the wrong section when better local text evidence already exists
- confusion between `source of truth` metadata and `optional hint` metadata during variant generation

### M8 - Regression Lock, Packaging, and Live Validation

#### Goal

Lock the repaired behavior with regression coverage, then package and validate in a real article.

#### What changes

- add regression coverage for:
  - rail count parity
  - issue naming
  - local-first gating
  - attached-stack visibility behavior
  - helper-to-variants transition
- package a clean plugin build
- deploy backend changes if touched
- validate against a real article with multiple flagged issue types

#### First files to touch

- `tests/js/overlay-fix-assist-regression.test.js`
- `tests/js/overlay-redesign-regression.test.js`
- `infrastructure/lambda/orchestrator/rewrite-handler.test.js`
- `tests/diagnostics/release-package-safety.test.js`

#### Verification

- live Review Rail count matches sidebar-visible issues
- no `Untitled issue`
- Copilot opens calmly from the issue card
- at least one true flagged issue can produce variants from local-first grounding

#### Status

- packaged and deployed; live article validation pending

What landed in this slice:

- the M8 regression set passed across:
  - rail count parity
  - issue naming
  - local-first gating
  - attached-stack UI behavior
  - rewrite-handler and rewrite-target-resolver grounding checks
- release metadata was bumped to `1.0.34` and a clean package was created
- the packaged plugin header and distributed readme were verified inside the release zip
- the backend repair slice was deployed to:
  - `aivi-orchestrator-run-dev`
  - `aivi-analyzer-worker-dev`
- post-deploy validation confirmed:
  - default AiVI AWS identity in use
  - public ping route reachable
  - worker health route reachable

What still needs a real editor pass:

- a fresh in-article analysis run with multiple flagged issue types
- at least one confirmed Copilot variant generation from the repaired local-first grounding path
- visual confirmation that the shipped Review Rail and attached Copilot card match the repaired behavior in WordPress

## Implementation Order

Recommended order:

1. `M1`
2. `M2`
3. `M3`
4. `M4`
5. `M5`
6. `M6`
7. `M7`
8. `M8`

Reason:

- restore correctness before polishing
- fix grounding before generation messaging
- fix UI only after the card is bound to the right issue model

## Scan Checklist

Use this after each milestone:

- Does the Review Rail still match the visible issue set?
- Does Copilot still follow the selected issue rather than a hidden subset?
- Is local article context doing more of the grounding work than analyzer anchors?
- Is the compact card calmer than before?
- Did we accidentally reintroduce old rewrite-agent behavior?

## Status Summary

- `M1` implemented locally
- `M2` implemented locally
- `M3` implemented locally
- `M4` implemented locally
- `M5` implemented locally
- `M6` implemented locally
- `M7` implemented locally
- `M8` packaged and deployed; live article validation pending

## Notes

- This track should be scanned milestone by milestone during implementation.
- The decisions board remains the governing alignment document.
- If a new behavior feels clever but not calm, it should be treated as suspect by default.
