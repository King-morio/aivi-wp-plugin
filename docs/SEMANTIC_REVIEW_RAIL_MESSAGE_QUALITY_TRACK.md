# Semantic Review Rail Message Quality Track

## Purpose

Fix the global semantic-message quality problem in the overlay review rail so users see one clean, useful explanation per issue instead of duplicated, templated, or bloated copy.

This track applies to semantic checks broadly, not just one check such as `clear_answer_formatting`.

Hard UX rule:

- if a semantic check did not complete and was synthesized from a failure mode such as `chunk_parse_failure`, it must not be shown in the review rail at all
- users must never see analyzer-incomplete messaging in the rail

## Problem Summary

Live semantic issue payloads currently suffer from three overlapping defects:

1. The same issue is represented multiple times in overlapping fields.
   - `message`
   - `rationale`
   - `explanation_pack.what_failed`
   - `issue_explanation`

2. The worker serializer globally expands semantic issues with templated `why_it_matters`, fix steps, and example patterns.
   - This produces repetitive and generic language across many check IDs.

3. The overlay review rail composes and renders semantic details from overlapping sources.
   - Users see a short summary first, then a second stitched narrative that often repeats the same point.

## Examples Confirmed In Live Data

Observed in live run `e802ff1f-895a-4fab-aff1-4481243c995f`:

- `clear_answer_formatting`
- `faq_structure_opportunity`
- `faq_jsonld_generation_suggestion`
- `howto_schema_presence_and_completeness`
- `temporal_claim_check`
- `external_authoritative_sources`
- `claim_provenance_and_evidence`

Representative bad output pattern:

- short summary:
  - `The answer is a long paragraph without clear question-specific formatting like steps or bullets.`
- expanded detail:
  - repeats the same issue
  - adds malformed templating such as `checks Checks whether...`
  - appends generic fix filler

Target quality pattern:

- `The opening answer is one dense paragraph, so the main point is harder to scan and extract. Split it into shorter sentences or bullets so the direct answer stands out.`

## Scope

In scope:

- worker semantic issue packaging
- semantic explanation-pack enrichment
- semantic rail/detail rendering in overlay editor
- global copy policy for:
  - anchored issues
  - block-wide issues
  - document-scope issues
  - synthetic/incomplete semantic issues
- semantic payload de-duplication where duplicate fields are driving bad rail copy
- release filtering so synthetic/incomplete semantic checks are excluded from rail recommendations

Out of scope:

- deterministic explanation rewrite unless it shares the same renderer path
- scoring logic
- highlighting/anchoring accuracy itself

## Milestones

### Milestone 1: Canonical Semantic Message Contract

Goal:

- Define one canonical user-facing message for semantic issue records.

Status:

- implemented locally

Changes:

- worker serializer becomes the only place that authors final semantic rail copy
- semantic `issue_explanation` becomes the canonical review-rail message
- final message target:
  - 2 sentences max
  - issue + why it matters
  - one concrete fix
- frontend should stop rebuilding semantic detail from overlapping raw parts
- reduce top-level semantic copy overlap for rail-facing fields:
  - `message`
  - `rationale`
  - `explanation_pack.what_failed`
  - `issue_explanation`
- define an explicit rail-eligibility rule for semantic issues:
  - completed semantic issues only
  - no synthetic failure placeholders

Acceptance:

- semantic issue payload has one clean final message
- no semantic rail message depends on frontend composition for its main wording
- synthetic semantic failures are not rail-eligible

### Milestone 2: Scoped Copy and De-duplication

Goal:

- Remove generic, repeated, and malformed semantic phrasing globally.

Status:

- implemented locally

Changes:

- replace raw definition-description prose in semantic `why_it_matters`
- do not surface phrases like:
  - `checks Checks whether`
  - raw definition text fragments
  - repeated restatements of `message`
- de-duplicate:
  - `message`
  - `rationale`
  - `what_failed`
  - `issue_explanation`
- collapse overlapping fix guidance:
  - `action_suggestion`
  - `how_to_fix_steps`
- split copy behavior by semantic issue scope:
  - anchored
  - block-wide
  - document-scope
  - incomplete/synthetic for internal handling only, not rail display

Acceptance:

- no global semantic rail copy contains malformed definition templating
- no rail detail repeats the same sentence already shown in the summary
- block-wide issues read differently from precise inline issues
- no analyzer-incomplete semantic copy is visible in the rail

### Milestone 3: Frontend Rail Consumption Cleanup

Goal:

- Make the overlay review rail render semantic issues cleanly from the canonical payload.

Status:

- implemented locally

Changes:

- overlay rail consumes canonical semantic message directly
- detail view only adds value beyond the summary
- remove semantic reliance on:
  - stitched `what_failed + why_it_matters + steps + example`
- filter semantic recommendations before rail render:
  - exclude `failure_reason: chunk_parse_failure`
  - exclude synthetic incomplete semantic placeholders
- if details remain, they must be:
  - shorter
  - non-duplicative
  - clearly secondary

Acceptance:

- semantic rail entries do not show duplicated issue copy
- opening summary and expanded detail are distinct and useful
- no low-value filler like generic example-pattern dumps
- rail never shows analyzer-failed semantic placeholders

### Milestone 4: Regression Lock

Goal:

- Prevent semantic message quality regressions across check families.

Status:

- implemented locally

Changes:

- add fixture-backed regression coverage using live problematic semantic recommendations
- assert against:
  - duplicated summary/detail wording
  - malformed templating
  - excessively long semantic rail messages
  - generic example-pattern dumping into user-facing rail text
- assert that semantic payload de-duplication survives release
- assert that synthetic incomplete semantic issues are excluded from rail recommendations
- cover multiple semantic families, not only one check

Acceptance:

- regression suite fails if semantic rail copy falls back into current templated/bloated shape

## Files Likely To Change

- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [LIVE_RUN_e802ff1f_AI_EXPLANATIONS.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/LIVE_RUN_e802ff1f_AI_EXPLANATIONS.md)

## Notes From Additional Review

- The current semantic artifact is over-enriched for rail rendering.
- Some duplication is technical metadata and can stay if it serves anchoring or downstream lookup.
- The rail-quality problem is driven mainly by duplicate user-facing text fields and repeated explanation layers, not by metadata like `node_ref` or `analysis_ref`.
- Keep the semantic payload layered:
  - model/core finding
  - code-added metadata
  - one canonical user-facing rail message

## Reliability Notes

These are adjacent to this track because they reduce how often semantic checks drop out before release:

- keep chunk size conservative
  - prefer `4-5`, not larger batches
- if reliability remains poor after copy/filter fixes, test `3` as a fallback profile
- keep chunk temperature at `0`
- keep schema-enforced structured output
- reduce model-side semantic output shape to core fields only
- keep malformed chunk capture enabled for diagnosis
- prefer hidden synthetic fallback over noisy user-facing fallback
- reduce retry churn and model-switch churn where possible
  - avoid repeated expensive retries that still end in truncated JSON
  - prefer one cleaner salvage path over many noisy retries

## Recommended Rollout

Use multiple patches, not one giant patch.

Reason:

- one part is user-facing rail filtering and copy ownership
- another part is semantic reliability under provider pressure
- both should be verified independently so we do not hide one problem behind another

Recommended sequence:

1. rail-quality patch
   - canonical semantic rail message
   - de-duplication
   - hide synthetic/incomplete semantic checks from rail

2. reliability patch
   - tighten chunk runtime behavior
   - reduce retry churn
   - validate chunk-size tuning

3. verification patch only if needed
   - adjust thresholds or fallback policy after live telemetry review

If semantic coverage drops below threshold in a run:

- preserve it internally for telemetry and scoring safeguards
- do not surface synthetic incomplete issue messages in the rail

## Start Point

Start with Milestone 1.

Reason:

- the root problem is contract ambiguity
- until one canonical semantic rail message exists, frontend and serializer layers will keep duplicating or re-expanding copy
