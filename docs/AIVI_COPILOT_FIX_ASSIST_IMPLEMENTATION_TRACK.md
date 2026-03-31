# AiVI Co-Pilot Fix Assist Implementation Track

## Goal

Implement `AiVI Fix Assist` as a disciplined, issue-scoped co-pilot that:

- appears only after analysis completes
- follows flagged block and section navigation
- understands real repair scope, not just the UI anchor
- can decide whether a rewrite is required, optional, or not recommended
- generates constrained variants only on command
- remains copy-only in `v1`
- consumes credits for any new model generation it triggers

## Locked Direction

- `AiVI Fix Assist` lives inside the overlay/editor workflow in `v1`.
- It is a docked assistance panel, not a chatbot.
- It uses the existing AiVI icon/brand, not a separate bot mascot.
- It must separate `anchor` from `repair_scope`.
- It must treat pseudo headings as real section boundaries for repair-scope resolution.
- It must be allowed to say:
  - `rewrite needed`
  - `optional improvement`
  - `leave as is`
- It must never auto-apply content into WordPress.
- It must remain copy-only in `v1`.

## Credit and Billing Decision

This is now locked:

- any on-demand co-pilot generation consumes credits
- this includes:
  - advisory generation
  - copy-editing generation
  - rewrite variant generation
  - generated structural guidance if it requires a new model call
- already-returned analysis explanations do not consume credits again
- static overlay/sidebar explanations do not consume credits again

Practical UX implication:

- `Why this was flagged` should be free when answered from existing payload
- `Show 3 variants` should consume credits
- `Help me fix this` should consume credits if it triggers generation

## Why This Track Exists

The original rewrite path failed in two visible ways:

1. It could treat a heading anchor as the rewrite target and miss the real answer paragraph below it.
2. It could over-prescribe rewrites for already extractible answers, turning optional improvements into noisy pseudo-errors.

This implementation track fixes both by:

- using section-aware repair scope resolution
- adding a rewrite-necessity triage layer before generation

## Existing AiVI Leverage

We are not starting from zero. AiVI already has useful primitives in place:

- overlay issue navigation and block jumping in:
  - `assets/js/aivi-overlay-editor.js`
- overlay open and analysis state handoff in:
  - `assets/js/aivi-sidebar.js`
- rewrite transport in:
  - `includes/class-rest-rewrite.php`
  - `infrastructure/lambda/orchestrator/rewrite-handler.js`
- rewrite target resolution in:
  - `infrastructure/lambda/orchestrator/rewrite-target-resolver.js`
- review-payload sanitization in:
  - `infrastructure/lambda/orchestrator/sidebar-payload-stripper.js`
- telemetry hooks in:
  - `infrastructure/lambda/orchestrator/telemetry-emitter.js`
- credit ledger infrastructure in:
  - `infrastructure/lambda/orchestrator/shared/credit-ledger.js`
  - `infrastructure/lambda/shared/schemas/credit-ledger-contract-v1.json`

Important existing advantage:

- `rewrite-target-resolver.js` already has heading-like and bold-boundary logic, so pseudo-heading-aware section targeting is a real extension path, not a speculative idea.

## Milestones

### M1 - Overlay Fix Assist Shell

#### Goal

Add the visible `Fix Assist` panel to the overlay so it can bind to the current flagged issue and stay quiet when no eligible issue is active.

#### What lands

- docked panel inside the overlay/editor workspace
- AiVI icon/badge + `Fix Assist` label
- calm status states:
  - `Ready`
  - `Reviewing`
  - `Guidance only`
  - `No rewrite recommended`
- first-level actions:
  - `Show 3 variants`
  - `Why this was flagged`
  - `Keep as is`

#### Exact files to touch first

- `assets/js/aivi-overlay-editor.js`
- `assets/js/aivi-sidebar.js`
- `tests/js/overlay-redesign-regression.test.js`
- `tests/js/frontend.test.js`

#### Acceptance

- the panel appears only after completed analysis
- it updates when the author jumps between flagged issues
- it stays hidden or compact on unflagged blocks
- no generation is triggered automatically

#### Status

Implemented locally.

What landed in the first slice:

- docked `Fix Assist` shell inside the overlay stage
- active issue binding from:
  - review-rail selection
  - jump-to-block actions
  - block focus when the node matches a flagged issue
  - inline highlight issue opening
- calm first-step states:
  - `Waiting`
  - `Ready`
  - `Guidance only`
- non-generative first actions:
  - `Show 3 variants`
  - `Why this was flagged`
  - `Keep as is`
- regression coverage in:
  - `tests/js/overlay-redesign-regression.test.js`

What is intentionally left for later milestones:

- true section-aware repair scope resolution
- optional vs required triage logic
- constrained variant generation
- credit settlement for on-demand co-pilot generation

### M2 - Repair Scope Resolver

#### Goal

Resolve the real repair area for each issue so AiVI stops lazily targeting only the highlighted heading or surface anchor.

#### What lands

- explicit separation between:
  - `anchor_node_ref`
  - `primary_repair_node_ref`
  - `repair_node_refs`
- section windows that can stop at:
  - real headings
  - pseudo headings
  - document end
- resolver confidence and boundary type

#### Exact files to touch first

- `infrastructure/lambda/orchestrator/rewrite-target-resolver.js`
- `infrastructure/lambda/orchestrator/rewrite-target-resolver.test.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/worker/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/sidebar-payload-stripper.js`

#### Follow-on files likely needed

- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `assets/js/aivi-overlay-editor.js`

#### Acceptance

- a heading-anchored issue can target the answer paragraph below it
- pseudo-heading boundaries stop section overreach
- overlay payload carries enough scope data for the UI to stay honest

#### Status

Implemented locally.

What landed in this slice:

- `rewrite-target-resolver.js` now emits explicit scope fields alongside the legacy target shape:
  - `anchor_node_ref`
  - `primary_repair_node_ref`
  - `repair_node_refs`
  - `section_start_node_ref`
  - `section_end_node_ref`
  - `boundary_type`
  - `boundary_node_ref`
  - `scope_confidence`
- heading-support routing now stops at pseudo headings as well as real headings
- section-aware routes now carry real section-boundary metadata instead of only a loose node window
- summary projections in the serializer now expose anchor-vs-repair metadata in a best-effort form
- the sidebar payload stripper now preserves the new sanitized rewrite-scope fields
- the overlay Fix Assist shell now reads the new scope fields so issue binding can follow the real repair area instead of only the old `primary_node_ref`

Validation that passed:

- `infrastructure/lambda/orchestrator/rewrite-target-resolver.test.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `infrastructure/lambda/orchestrator/sidebar-hard-separation.test.js`
- `tests/diagnostics/check-contract-sync.test.js`
- `tests/js/overlay-redesign-regression.test.js`

What is intentionally left for later milestones:

- constrained variant generation
- credit settlement for on-demand co-pilot generation

### M3 - Rewrite Necessity Triage

#### Goal

Teach AiVI to decide whether rewriting is actually needed before any generation happens.

#### What lands

- triage states:
  - `rewrite_needed`
  - `optional_improvement`
  - `structural_guidance_only`
  - `leave_as_is`
- calm professional language for each state
- explicit support for extractible-but-non-list answers that should not be nagged

#### Exact files to touch first

- `infrastructure/lambda/orchestrator/rewrite-handler.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/worker/analysis-serializer.js`
- `assets/js/aivi-overlay-editor.js`

#### Recommended new files

- `infrastructure/lambda/orchestrator/fix-assist-triage.js`
- `infrastructure/lambda/orchestrator/fix-assist-triage.test.js`

#### Acceptance

- AiVI can say `optional, not required`
- AiVI can say `leave this as-is`
- already extractible answers no longer get pushed into unnecessary rewrites

#### Status

Implemented locally.

What landed:

- added `fix_assist_triage` as an explicit payload field across:
  - orchestrator summary issues and highlights
  - worker summary issues and recommendations
  - rewrite-handler normalization and responses
- added the new triage engine in:
  - `infrastructure/lambda/orchestrator/fix-assist-triage.js`
- updated the overlay `Fix Assist` shell to surface:
  - `Rewrite needed`
  - `Optional improvement`
  - `Guidance only`
  - `Leave as is`
- aligned sidebar payload allowlists and runtime contracts on `fix_assist_triage`
- added regression coverage for:
  - triage rules
  - serializer propagation
  - rewrite-handler propagation
  - overlay triage rendering hooks

### M4 - Repair Contracts and Prompt Discipline

#### Goal

Replace broad rewrite prompting with strict repair contracts so variants stay meaning-preserving and check-specific.

#### What lands

- per-check repair contract mapping
- required fields such as:
  - `must_preserve`
  - `must_change`
  - `do_not_invent`
  - `tone_guard`
  - `scope_guard`
- issue-context packaging for:
  - article outline
  - local section context
  - repair scope
  - check-specific constraints

#### Exact files to touch first

- `infrastructure/lambda/orchestrator/rewrite-handler.js`
- `includes/class-rest-rewrite.php`
- `infrastructure/lambda/orchestrator/rewrite-handler.test.js`

#### Recommended new files

- `infrastructure/lambda/shared/schemas/fix-assist-contract-v1.json`
- `infrastructure/lambda/orchestrator/fix-assist-contract-builder.js`
- `infrastructure/lambda/orchestrator/fix-assist-contract-builder.test.js`

#### Acceptance

- variants preserve facts, entities, dates, and scope
- the model cannot free-wheel outside the repair contract
- issue-specific repair behavior is deterministic enough to test

#### Status

Implemented locally.

What landed:

- added the canonical contract schema in:
  - `infrastructure/lambda/shared/schemas/fix-assist-contract-v1.json`
- added the contract builder in:
  - `infrastructure/lambda/orchestrator/fix-assist-contract-builder.js`
- threaded `fix_assist_contract` through:
  - rewrite-handler normalization
  - rewrite prompt construction
  - rewrite responses
  - the WordPress REST rewrite bridge
- strengthened prompt discipline so the repair contract is treated as authoritative
- added contract-aware validation for:
  - dropped preservation literals
  - invented numeric claims when the source has none
- fixed the WordPress REST bridge to forward:
  - `issue_context`
  - `fix_assist_triage`
  - `fix_assist_contract`

Focused validation passed:

- `node --check infrastructure/lambda/orchestrator/fix-assist-contract-builder.js`
- `node --check infrastructure/lambda/orchestrator/rewrite-handler.js`
- `node --check assets/js/aivi-overlay-editor.js`
- `php -l includes/class-rest-rewrite.php`
- `npm test -- --runInBand infrastructure/lambda/orchestrator/fix-assist-contract-builder.test.js infrastructure/lambda/orchestrator/rewrite-handler.test.js tests/js/overlay-redesign-regression.test.js`

### M5 - On-Demand Variant Generation and Credit Settlement

#### Goal

Generate disciplined variants on command and charge credits for the generation path without disturbing the existing analysis billing model.

#### What lands

- `Show 3 variants` generation path
- exactly three labeled variants:
  - `Most concise`
  - `Balanced`
  - `Evidence-first`
- copy-only actions for each variant
- ledger settlement for co-pilot generations
- billing summaries that reflect the generation debit cleanly

#### Exact files to touch first

- `infrastructure/lambda/orchestrator/rewrite-handler.js`
- `infrastructure/lambda/orchestrator/telemetry-emitter.js`
- `infrastructure/lambda/orchestrator/shared/credit-ledger.js`
- `infrastructure/lambda/shared/schemas/credit-ledger-contract-v1.json`
- `includes/class-rest-rewrite.php`
- `assets/js/aivi-overlay-editor.js`

#### Follow-on files likely needed

- `infrastructure/lambda/orchestrator/shared/billing-account-state.js`
- `includes/class-admin-settings.php`
- `assets/js/aivi-sidebar.js`
- `infrastructure/lambda/orchestrator/rewrite-handler.test.js`

#### Billing rule for this milestone

- charge only when a new model generation is actually requested
- do not charge for reading existing issue explanations
- do not charge for local UI actions
- use a dedicated ledger reason code, recommended:
  - `copilot_generation`

#### Acceptance

- a user-requested generation creates a billable ledger event
- the debit does not interfere with normal analysis-run settlement
- the user can copy a variant without any automatic editor mutation

#### Status

Implemented locally.

What landed:

- `Show 3 variants` now triggers real on-demand Fix Assist generation from:
  - the docked Fix Assist panel
  - the inline issue panel
- variant output is now normalized into exactly three deterministic profiles:
  - `Most concise`
  - `Balanced`
  - `Evidence-first`
- each generation request now carries a distinct `generation_request_id` so repeated user-triggered generations remain billable without collapsing intentional retries
- the rewrite handler now settles a dedicated ledger event with:
  - `reason_code: copilot_generation`
- copilot billing now:
  - requires a connected AiVI billing account context
  - blocks generation cleanly when the billing account is missing or has no remaining credits
  - uses actual model usage from the provider response to compute the debit
  - returns a clean `billing_summary` alongside the variants
- the overlay keeps the flow copy-only:
  - no automatic editor mutation
  - `Copy variant` remains the only acceptance path
- the WordPress REST bridge now forwards:
  - `generation_request_id`
  - AiVI account/site identity headers needed for ledger settlement

Focused validation passed:

- `node --check infrastructure/lambda/orchestrator/rewrite-handler.js`
- `node --check assets/js/aivi-overlay-editor.js`
- `node --check infrastructure/lambda/orchestrator/telemetry-emitter.js`
- `php -l includes/class-rest-rewrite.php`
- `npm test -- --runInBand infrastructure/lambda/orchestrator/rewrite-handler.test.js tests/js/overlay-redesign-regression.test.js`

### M6 - Telemetry, Safeguards, and Regression Lock

#### Goal

Lock behavior so the co-pilot stays safe, quiet, and trustworthy as later AiVI work evolves.

#### What lands

- telemetry events for:
  - panel seen
  - help requested
  - variants generated
  - variant copied
  - keep-as-is selected
  - generation failed
- regression coverage for:
  - heading-anchor vs repair-scope separation
  - pseudo-heading boundaries
  - optional vs required messaging
  - copy-only behavior
  - credit charging on generation only

#### Exact files to touch first

- `infrastructure/lambda/orchestrator/telemetry-emitter.js`
- `assets/js/aivi-overlay-editor.js`
- `tests/js/overlay-redesign-regression.test.js`
- `tests/js/overlay-apply-safety-regression.test.js`
- `infrastructure/lambda/orchestrator/rewrite-handler.test.js`
- `infrastructure/lambda/orchestrator/rewrite-target-resolver.test.js`

#### Recommended new tests

- `tests/js/overlay-fix-assist-regression.test.js`
- `infrastructure/lambda/orchestrator/fix-assist-triage.test.js`

#### Acceptance

- no automatic apply path can reappear through the co-pilot
- pseudo-heading scope resolution stays locked
- optional improvements remain visibly optional
- model generation events and charges stay attributable

#### Status

Implemented locally.

What landed:

- added backend telemetry event helpers for:
  - `copilot_variants_generated`
  - `copilot_generation_failed`
- emitted overlay-side Fix Assist interaction telemetry for:
  - panel seen
  - help requested
  - variants generated
  - variant copied
  - keep-as-is selected
  - generation failed
- deduplicated `panel seen` emission per issue per overlay session
- tightened regression coverage for:
  - pseudo-heading boundaries on section-first routing
  - optional vs required triage messaging
  - copy-only Fix Assist acceptance
  - free guidance vs billable generation separation
  - no credit settlement on test-mode/non-generation flows

Focused validation passed:

- `node --check assets/js/aivi-overlay-editor.js`
- `node --check infrastructure/lambda/orchestrator/rewrite-handler.js`
- `node --check infrastructure/lambda/orchestrator/telemetry-emitter.js`
- `npm test -- --runInBand infrastructure/lambda/orchestrator/rewrite-handler.test.js infrastructure/lambda/orchestrator/rewrite-target-resolver.test.js infrastructure/lambda/orchestrator/fix-assist-triage.test.js tests/js/overlay-redesign-regression.test.js tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-fix-assist-regression.test.js`

## Recommended Build Order

The safest implementation order is:

1. `M1 UI Shell`
2. `M2 Repair Scope Resolver`
3. `M3 Rewrite Necessity Triage`
4. `M4 Repair Contracts`
5. `M5 Variant Generation and Credit Settlement`
6. `M6 Telemetry and Regression Lock`

Why:

- `M1-M3` prove trustworthiness before we spend tokens
- `M4` prevents free-wheeling generation
- `M5` turns the feature into a billable product surface only after the safety model is stable

## Explicit Non-Goals for v1

- no open-ended chat panel
- no whole-article rewriting
- no automatic apply into WordPress
- no separate mascot/bot branding
- no charging for static explanations already included in analysis output

## Done Means

This track is complete when all of the following are true:

1. The co-pilot follows flagged issue navigation cleanly.
2. Heading-anchored issues can repair paragraph text below the heading.
3. Pseudo headings are respected as section boundaries.
4. AiVI can say `optional` or `leave as-is` when appropriate.
5. On-demand generation produces three disciplined variants.
6. Generated outputs remain copy-only.
7. On-demand generation consumes credits with a dedicated ledger reason.
8. Regression coverage protects the safety model from future drift.
