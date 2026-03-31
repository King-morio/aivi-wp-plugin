# AiVI Copilot Expansion And UI Refinement Track

## Purpose

This track turns the coverage audit and recent UI feedback into an implementation sequence for the next Copilot expansion.

It is guided by:

- [AIVI_COPILOT_CHECK_COVERAGE_AUDIT.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_CHECK_COVERAGE_AUDIT.md)
- [AIVI_COPILOT_AGREED_DECISIONS_BOARD.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_AGREED_DECISIONS_BOARD.md)
- [AIVI_COPILOT_ALIGNMENT_REPAIR_TRACK.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_ALIGNMENT_REPAIR_TRACK.md)

This track exists because Copilot still has three visible product gaps:

1. generation is still blocked in the current shipped release mode
2. several high-value trust and citability checks are still treated as `manual_review`
3. the attached Copilot card is still too cramped and rail-bound to feel calm and premium

## Locked Principles

- Copilot should help on all flagged issue families, but not always in the same mode
- local article context remains the primary grounding source
- analyzer anchors remain hint-only
- web-backed verification must never be automatic
- Copilot should ask for user permission before any web lookup begins
- the card should feel calm, spacious, and intentional rather than squeezed into the Review Rail

## Product Behavior We Are Intentionally Targeting

### For local-only issues

User clicks:

- `Show 3 variants`

Copilot:

- generates variants immediately if the issue is local-rewrite or structural-transform capable

### For web-backed issues

User clicks:

- `Show 3 variants`

Copilot first asks:

- `This issue may benefit from a quick web check for verifiable support. Do you want me to look for closely related source material before I suggest variants?`

Then user chooses:

- `Yes, verify first`
- `No, just suggest local variants`
- `Cancel`

Important:

- no web search should run before the user explicitly chooses `Yes, verify first`
- a `No, just suggest local variants` path should still exist where a local-only reframing is useful

### If no verifiable support is found

Copilot should return calm, professional guidance such as:

- `AiVI could not find verifiable support closely tied to this claim. Consider narrowing the claim, adding a trustworthy source, or rewriting the section to avoid unsupported certainty.`

## Target UI Direction

### Approved direction

Keep the attached-stack concept, but stop forcing the content box to live inside the rail card footprint.

### Refined behavior

- the launch pill stays on the active issue card
- clicking it opens a Copilot bubble attached to that issue
- the bubble can expand over the Review Rail area instead of being trapped inside the issue card flow
- the issue card stays visible below as the anchor
- the bubble becomes the working surface for helper text, consent steps, guidance, and variants

### Layout goals

- wider than the current inline card
- taller than the current inline card
- no early inner-scroll starvation
- one clear message area
- one action row
- one results area

### UI refinements to preserve

- AiVI icon in the Copilot header
- small red close `x`
- close on outside click
- no repeated giant issue heading inside the bubble
- helper message disappears when variants appear
- action pills stay visually neat and low-noise

### Messaging goals

Avoid vulnerable or apologetic system language such as:

- `AiVI needs a clearer local section...`
- `Fix Assist generation is not available in this release mode.`

Prefer:

- issue-aware
- confident
- brief
- user-centered

## Expansion Modes

The implementation should support these Copilot modes as first-class behaviors:

- `local_rewrite`
- `structural_transform`
- `schema_metadata_assist`
- `web_backed_evidence_assist`
- `limited_technical_guidance`

## Milestones

### M1 - Remove Hidden Generation Blocks

#### Goal

Make sure Copilot can actually generate when the product intends it to.

Status:

- implemented locally

#### What changes

- remove or reconfigure the hard release-mode generation block
- stop surfacing `Show 3 variants` when generation is not genuinely available
- align UI state with the true backend capability

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `includes/class-assets.php`
- any release-mode regression guards tied to disabled generation

#### Verification

- Copilot can reach the rewrite endpoint in supported cases
- no fake variant CTA appears when generation is disabled

### M2 - Introduce Copilot Mode Routing

#### Goal

Stop treating all checks as either `rewrite` or `manual review`.

Status:

- implemented locally

#### What changes

- route flagged issues into:
  - `local_rewrite`
  - `structural_transform`
  - `schema_metadata_assist`
  - `web_backed_evidence_assist`
  - `limited_technical_guidance`
- keep Review Rail issue selection as the primary source of truth

#### First files to touch

- `infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/fix-assist-triage.js`
- `infrastructure/lambda/orchestrator/fix-assist-contract-builder.js`
- `assets/js/aivi-overlay-editor.js`

#### Verification

- trust and citability issues no longer collapse into silent manual-only behavior by default
- schema issues route into schema assist instead of pretending to be normal rewrites

### M3 - Expand Manual-Review Checks Into Real Copilot Help

#### Goal

Open up high-value manual-review checks so Copilot can help meaningfully.

Status:

- implemented locally

#### Priority checks

- `external_authoritative_sources`
- `claim_provenance_and_evidence`
- `original_evidence_signal`
- `citation_format_and_context`
- `faq_structure_opportunity`
- `heading_like_text_uses_heading_markup`
- key schema checks

#### What changes

- convert selected `manual_review` checks into:
  - `web_backed_evidence_assist`
  - `structural_transform`
  - `schema_metadata_assist`
- keep true technical/manual cases limited where necessary

#### First files to touch

- `infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/fix-assist-triage.js`
- `docs/AIVI_COPILOT_CHECK_COVERAGE_AUDIT.md`

#### Verification

- Copilot helps with more than just snippet and wording issues
- trust/source issues have a meaningful next step instead of dead-end fallback

### M4 - Add Explicit Web Search Consent Step

#### Goal

Make web-backed assistance deliberate and user-approved.

Status:

- implemented locally

#### What changes

- after `Show 3 variants` on a web-backed issue, show a short consent prompt instead of immediately searching
- support:
  - `Yes, verify first`
  - `No, just suggest local variants`
  - `Cancel`
- persist the choice only for the current issue interaction unless product later decides otherwise

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `includes/class-rest-rewrite.php`
- `infrastructure/lambda/orchestrator/rewrite-handler.js`
- any request contract files carrying verification intent

#### Verification

- no web request starts before user approval
- Copilot can still provide local-only help if the user declines verification

### M5 - Build Web-Backed Evidence Assist

#### Goal

Let Copilot verify claims or source support when the user approves it.

Status:

- implemented locally

#### What changes

- add a verification step that can search for closely related support
- feed the verification result into the variant prompt
- return one of:
  - supported reframing
  - safer narrowed rewrite
  - no-verifiable-support guidance

#### Important limits

- do not silently invent support
- do not overclaim certainty from weak matches
- do not treat loose topical similarity as proof

#### First files to touch

- orchestrator verification path
- prompt builder / rewrite handler
- telemetry for verification-approved generations
- billing / credit settlement path if verification consumes tokens or web resources

#### Verification

- approved web-backed issues can surface source-aware variants
- unsupported claims produce a clean professional fallback instead of silence

### M6 - Bubble UI Refactor

#### Goal

Move the Copilot working surface out of the cramped rail-card layout.

Status:

- implemented locally

#### What changes

- keep launch pill on the issue card
- render Copilot bubble as an anchored overlay over the Review Rail region
- preserve spatial attachment to the active issue card
- give the bubble enough width and height for:
  - helper text
  - consent prompt
  - guidance
  - variants

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- `assets/css/aivi-overlay-editor.css`
- local design preview HTML files if needed

#### Verification

- Copilot no longer wastes large regions of usable rail space
- variants remain readable without feeling crushed
- scrolling the rail does not make the Copilot surface unusable

### M7 - Message Strategy Rewrite

#### Goal

Make Copilot sound competent and calm.

#### What changes

- replace vulnerable copy with issue-aware copy
- make helper messages specific to the issue family
- hide internal fallback mechanics from normal users
- ensure variant errors sound like product guidance, not internal failure leaks

#### First files to touch

- `assets/js/aivi-overlay-editor.js`
- orchestrator response message shaping
- docs/spec files that lock message rules

#### Verification

- no more:
  - `AiVI needs a clearer local section...`
  - `generation is not available in this release mode`
- helper copy reflects the actual issue and likely fix mode

### M8 - End-to-End Validation And Packaging

#### Goal

Prove the expanded Copilot flow in real article scenarios.

#### What changes

- regression coverage for:
  - generation enabled state
  - consent prompt behavior
  - web-backed verification branching
  - bubble UI behavior
  - check-mode routing
- package a new plugin build
- deploy backend changes
- validate against real flagged issues

#### Verification targets

- one local rewrite issue
- one structural issue
- one schema issue
- one trust/source issue with approved web verification
- one trust/source issue with no verifiable support found

## Suggested Implementation Order

1. `M1`
2. `M2`
3. `M3`
4. `M4`
5. `M5`
6. `M6`
7. `M7`
8. `M8`

Reason:

- first make generation real
- then make mode routing honest
- then add the consent-driven verification path
- then give the UI enough space to present it well

## Scan Checklist

Use this after each milestone:

- Can Copilot actually generate when it says it can?
- Does the selected Review Rail issue still remain the source of truth?
- Are trust/source issues getting meaningful help instead of dead ends?
- Does web verification wait for explicit user approval?
- Does the Copilot bubble feel calmer and roomier than before?
- Are users seeing confident product guidance rather than internal fallback language?

## Status Summary

- `M1` implemented locally
- `M2` implemented locally
- `M3` implemented locally
- `M4` implemented locally
- `M5` implemented locally
- `M6` implemented locally
- `M7` implemented locally
- `M8` implemented locally, packaged, and deployed
