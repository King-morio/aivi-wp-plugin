# Check Ownership Implementation Track

Last updated: 2026-03-23

## Purpose

This file tracks the staged implementation of the approved ownership, analyzer-load,
deterministic-guidance, and schema-check decisions recorded in:

- `docs/CHECK_OWNERSHIP_CANONICAL.md`

Guardrail:
- Do not use `DECISIONS.md` as the working source for this implementation.
- Keep each milestone narrow enough that regressions can be isolated quickly.
- If implementation needs a file that is not listed in the milestone write set below,
  stop and update this track before editing that file.

## Milestones

### M1 - Ownership Alignment

**Status:** Complete

**Goal**

Make declared check ownership match the approved target buckets without yet changing
prompt exposure or analyzer merge behavior.

**Planned write set**

- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/worker/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json`
- `docs/CHECK_OWNERSHIP_CANONICAL.md`
- `docs/CHECK_OWNERSHIP_IMPLEMENTATION_TRACK.md`

**Scope**

- align intro-family ownership with adopted decisions
- mark `readability_adaptivity` as wholly semantic in definition wording
- align deterministic intro declarations immediately where that does not change prompt exposure
- record that `intro_factual_entities` semanticization and `intro_focus_and_factuality.v1`
  runtime retirement remain deferred until analyzer-flow cleanup
- prepare ownership truth before touching runtime analyzer flow

**Out of scope**

- prompt filtering
- merge-path changes
- changing executable prompt selection for `intro_factual_entities`
- scoring redistribution
- new checks

**Outcome**

- `intro_wordcount`, `intro_readability`, and `intro_schema_suggestion` are now declared deterministic in orchestrator and worker shared schema files.
- `readability_adaptivity` definition wording now reflects wholly semantic editorial judgment instead of deterministic metric scoring.
- `intro_factual_entities` and `intro_focus_and_factuality.v1` remain transitional in executable schema declarations until M2/M3, because changing them in M1 would alter prompt selection before analyzer isolation lands.

### M2 - Analyzer Isolation

**Status:** Complete

**Goal**

Remove deterministic-owned checks from AI prompt/query/explanation flow so semantic
budget is reserved for judgment-heavy analysis only.

**Planned write set**

- `infrastructure/lambda/orchestrator/analyze-run-handler.js`
- `infrastructure/lambda/orchestrator/analyze-run-handler.test.js`
- `infrastructure/lambda/orchestrator/prompt-manager.js`
- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `docs/CHECK_OWNERSHIP_IMPLEMENTATION_TRACK.md`

**Scope**

- stop deterministic-owned checks from being exposed in AI query blocks
- remove deterministic explanation borrowing from the analyzer merge path
- keep deterministic verdicts and deterministic guidance intact

**Out of scope**

- intro scoring cleanup
- new schema checks

**Outcome**

- `analyze-run-handler.js` now treats deterministic ownership using the runtime contract instead of raw definition type when deciding what stays off the AI analyzer surface.
- AI prompt definitions are now filtered to AI-eligible checks only, so transitional runtime-deterministic intro checks no longer leak into `CHECK DEFINITIONS` or query blocks.
- The orchestrator prompt no longer asks the model to provide placeholder responses or borrowed explanations for deterministic checks.
- Deterministic checks now keep their own deterministic explanations during merge; AI explanation borrowing was removed.
- `analyze-run-handler.test.js` now covers both prompt isolation and the no-borrowing rule.
- `prompt-manager.js`, `worker/index.js`, and `worker/prompts/analysis-system-v1.txt` were reviewed during M2 and required no edits because they were already aligned closely enough with the target contract behavior.
- Jump-to-block safety was verified during M2 without code changes: deterministic findings still carry block anchors from preflight via `node_ref` plus `signature` fallback, and the overlay serializer still resolves `jump_node_ref` from those anchors for review-rail navigation.

**Validation**

- Focused Jest run passed: `npm test -- --runInBand analyze-run-handler.test.js` from `infrastructure/lambda/orchestrator`

### M3 - Intro Cleanup And Scoring

**Status:** Complete

**Goal**

Resolve intro drift cleanly after ownership and analyzer isolation are stable.

**Planned write set**

- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/orchestrator/analyze-run-handler.js`
- `infrastructure/lambda/orchestrator/analyze-run-handler.test.js`
- `infrastructure/lambda/orchestrator/shared/scoring-policy.js`
- `infrastructure/lambda/shared/scoring-policy.js`
- `infrastructure/lambda/orchestrator/scoring-engine.test.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`
- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/worker/shared/scoring-policy.js`
- `infrastructure/lambda/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/worker/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/scoring-config-v1.json`
- `infrastructure/lambda/worker/shared/schemas/scoring-config-v1.json`
- `infrastructure/lambda/orchestrator/schemas/scoring-config-v1.json`
- `infrastructure/lambda/orchestrator/schemas/primary-category-map.json`
- `infrastructure/lambda/worker/schemas/primary-category-map.json`
- `includes/data/primary-category-map.json`
- `assets/js/aivi-sidebar.js`
- `tools/scoring-fixture-normalizers.js`
- `tools/verify_scoring.js`
- `docs/CHECK_OWNERSHIP_CANONICAL.md`
- `docs/CHECK_OWNERSHIP_IMPLEMENTATION_TRACK.md`

**Scope**

- retire `intro_focus_and_factuality.v1` as a live scored composite check
- preserve the intro category itself
- ensure intro score ownership remains coherent after retiring the fake composite
- keep intro deterministic checks deterministic and intro semantic checks semantic

**Out of scope**

- authored message catalog expansion
- new schema checks

**Write-set amendment note**

- Added shared definition and runtime-contract files to M3 because fully retiring
  `intro_focus_and_factuality.v1` and moving `intro_factual_entities` to semantic
  ownership cannot be completed safely through preflight/scoring files alone.
- Added `docs/CHECK_OWNERSHIP_CANONICAL.md` to M3 because the live current counts
  and intro-family status notes must stay aligned once the composite is retired in
  executable runtime files.
- Added analyzer, worker-index, shared scoring-policy, and canonical category-map
  copy files to M3 because the retired composite is still referenced in intro merge
  constants, AEO intro weighting logic, worker/category-map copies, and the sidebar
  intro step list.
- Added `infrastructure/lambda/shared/*` scoring-policy and schema files to M3
  because those remain the common build/source layer for generated runtime copies,
  so leaving them untouched would reintroduce intro drift later.
- Added `tools/scoring-fixture-normalizers.js` and `tools/verify_scoring.js` to M3
  for the post-M3 warning cleanup because the remaining console noise came from a
  mix of legacy fixture IDs and the old single-intro-check assumption in scoring
  support tooling rather than from live runtime ownership.
- Removed `infrastructure/lambda/shared/schemas/scoring-config-v1.json` from the
  M3 write set after verification because that file does not exist in this repo;
  the live scoring-config copies are the orchestrator and worker shared files plus
  the orchestrator runtime schema copy already listed above.

**Outcome**

- `intro_focus_and_factuality.v1` is retired from live executable check definitions,
  runtime contracts, category maps, and the sidebar intro step list.
- `intro_factual_entities` is now live semantic in executable definitions and
  runtime contracts, while intro preflight still records support data in
  `manifest.preflight_intro` for downstream semantic use.
- Deterministic intro preflight now emits only `intro_wordcount`,
  `intro_readability`, and `intro_schema_suggestion`, and both orchestrator and
  worker intro preflight tests now assert that split explicitly.
- Intro AEO scoring was redistributed from the retired composite to
  `intro_wordcount`, `intro_readability`, and `intro_factual_entities`, while
  `intro_schema_suggestion` stays advisory and score-neutral.
- Shared, orchestrator, and worker scoring-policy logic now normalize the intro
  category by the configured intro check group instead of a single retired check ID.
- `CHECK_OWNERSHIP_CANONICAL.md` now reflects the live M3 state: `52` total checks,
  `29` semantic, `23` deterministic, `0` hybrid.
- The scoring regression ceiling for the recovered dropshipping fixture was updated
  from `23` to `23.5` AEO to match the redistributed intro weighting while keeping
  the corrected low-score guard intact.

**Validation**

- Focused Jest run passed: `npm test -- --runInBand preflight-handler.test.js` from `infrastructure/lambda/orchestrator`
- Focused Jest run passed: `npm test -- --runInBand analyze-run-handler.test.js` from `infrastructure/lambda/orchestrator`
- Focused Jest run passed: `npm test -- --runInBand scoring-engine.test.js` from `infrastructure/lambda/orchestrator`
- Focused Jest run passed: `npm test -- --runInBand preflight-handler.test.js` from `infrastructure/lambda/worker`

**Post-completion cleanup**

- Cleared the stale scoring-suite warning path before M4 by fixing two residue sources:
  `scoreChecksAgainstConfig` was warning on checks that were known but merely
  inapplicable for the current content type, and the legacy dropshipping scoring
  fixture normalizer was still leaving retired IDs like
  `intro_focus_and_factuality.v1`, `intro_first_sentence_topic`, and
  `orphan_headings` in the scored check set.
- Updated scoring support tooling so `tools/verify_scoring.js` now follows the
  live intro-group weighting model instead of assuming the retired
  `intro_focus_and_factuality.v1` composite still owns intro AEO normalization.
- Re-ran `scoring-engine.test.js` and `analyze-run-handler.test.js` after that cleanup.
  The old fixture-driven unknown-check warnings are gone; the only remaining
  `Unknown check ID` output in `analyze-run-handler.test.js` is the intentional
  synthetic `test_check` used by the test itself.

### M4 - Deterministic Message Parity

**Status:** Complete

**Goal**

Ensure deterministic-owned checks have complete deterministic guidance coverage with
no dependency on AI explanation lanes.

**Planned write set**

- `infrastructure/lambda/orchestrator/shared/schemas/deterministic-instance-messages-v1.json`
- `infrastructure/lambda/worker/shared/schemas/deterministic-instance-messages-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/deterministic-explanations-v1.json`
- `infrastructure/lambda/worker/shared/schemas/deterministic-explanations-v1.json`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `docs/CHECK_OWNERSHIP_CANONICAL.md`
- `docs/CHECK_OWNERSHIP_IMPLEMENTATION_TRACK.md`

**Scope**

- expand instance-message coverage across all deterministic-owned checks
- expand explanatory-message coverage across all deterministic-owned checks
- keep one surfaced instance message and one surfaced detail explanation per issue
- align runtime fallback behavior with the approved authored messages

**Out of scope**

- analyzer ownership changes
- new schema detection logic

**Outcome**

- deterministic instance-message catalogs were regenerated from the approved
  `Approved Messages:` block in `docs/CHECK_OWNERSHIP_CANONICAL.md`, and no
  non-approved wording was introduced for the newly covered deterministic checks
- review-rail recommendation cards now use approved short review leads via the
  deterministic instance catalog while preserving specific per-instance evidence
  inside deterministic explanation packs where that detail helps explain the
  exact failure
- deterministic explanation catalogs now carry approved long-form
  `issue_explanation` text for the approved deterministic checks, while the
  existing intro deterministic explanation packs were preserved and left outside
  the approved-message regeneration path
- orchestrator serializer tests were updated to reflect the new split between
  approved review-rail messaging and preserved instance-specific deterministic
  detail

**Validation**

- `npm.cmd test -- --runInBand analysis-serializer.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  Run from `infrastructure/lambda/worker`

### M5 - New Deterministic Schema Checks

**Status:** Complete

**Goal**

Add the two approved deterministic schema checks without colliding with existing
semantic list/table judgment logic. (Added comment: With the added checks, please check how scoring is done so they fit like gloves and affect scoring cleanly where applicable)

**Planned write set**

- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/worker/shared/schemas/check-runtime-contract-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/deterministic-instance-messages-v1.json`
- `infrastructure/lambda/worker/shared/schemas/deterministic-instance-messages-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/deterministic-explanations-v1.json`
- `infrastructure/lambda/worker/shared/schemas/deterministic-explanations-v1.json`
- `infrastructure/lambda/orchestrator/schema-draft-builder.js`
- `infrastructure/lambda/orchestrator/schema-draft-builder.test.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `infrastructure/lambda/orchestrator/schemas/primary-category-map.json`
- `infrastructure/lambda/worker/schemas/primary-category-map.json`
- `includes/data/primary-category-map.json`
- `infrastructure/lambda/orchestrator/shared/schemas/scoring-config-v1.json`
- `infrastructure/lambda/orchestrator/schemas/scoring-config-v1.json`
- `assets/js/aivi-overlay-editor.js`
- `CHECK_REFERENCE.md`
- `docs/CHECK_OWNERSHIP_CANONICAL.md`
- `docs/CHECK_OWNERSHIP_IMPLEMENTATION_TRACK.md`

**Scope**

- add `itemlist_jsonld_presence_and_completeness`
- add `article_jsonld_presence_and_completeness`
- keep `lists_tables_presence` semantic and unchanged in role
- keep `valid_jsonld_schema` syntax-only
- keep `schema_matches_content` and `supported_schema_types_validation` in their
  existing roles
- keep schema-assist insert behavior honest by updating any schema-kind allowlists
  that gate `generate_copy_insert`

**Out of scope**

- broader schema-assist UX changes beyond what is required by the new checks

**Write-set amendment note**

- Added `infrastructure/lambda/shared/schemas/checks-definitions-v1.json` and
  `infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json` to M5
  because the serializer acceptance suite and shared schema inventory still read
  from the common shared schema layer. Leaving those files untouched would keep
  a hidden `52`-check drift behind even after the orchestrator and worker copies
  are updated to `54`.

**Outcome**

- Added live deterministic runtime support for `itemlist_jsonld_presence_and_completeness` in both orchestrator and worker preflight, including score-neutral handling when no strong list candidate exists plus fail/partial/pass handling for missing, misaligned, and aligned `ItemList` JSON-LD.
- Added live deterministic runtime support for `article_jsonld_presence_and_completeness` in both orchestrator and worker preflight, including score-neutral handling for non-article content types plus fail/partial/pass handling for missing, companion-only, incomplete, and complete primary article schema.
- Added both new checks to the orchestrator, worker, and shared schema-definition and runtime-contract layers so ownership, analyzer isolation, and schema-assist contracts stay aligned.
- Added both new checks to the schema category maps and raised the live schema inventory to `54` total checks across orchestrator, worker, shared, and PHP-consumed category-map copies.
- Added scoring entries so the new checks fit cleanly into GEO scoring without distorting non-candidate pages:
  - `article_jsonld_presence_and_completeness`: `5` max points for article-like content types
  - `itemlist_jsonld_presence_and_completeness`: `4` max points, with score-neutral behavior when no strong visible list candidate exists
- Added deterministic schema-assist generation for both checks in `schema-draft-builder.js`, with insertable `article_jsonld` and `itemlist_jsonld` kinds plus matching overlay-editor insert allowlist updates.
- Added serializer reason/fix-hint support for the new non-inline reasons so the new checks keep clean deterministic guidance without borrowing semantic explanation lanes.
- Kept message discipline intact: the implementation reused the already approved deterministic catalogs and did not introduce non-approved wording for the new checks.
- Updated the canonical and reference docs so the live current state now matches the implemented `54`-check inventory.

**Validation**

- `npm.cmd test -- --runInBand preflight-handler.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  Run from `infrastructure/lambda/worker`
- `npm.cmd test -- --runInBand schema-draft-builder.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand analysis-serializer.test.js`
  Run from `infrastructure/lambda/orchestrator`

**Post-M5 lookaround cleanup**

- Added `infrastructure/lambda/worker/schema-draft-builder.js` because the worker
  serializer imports that local mirror directly, and the quick lookaround found
  it still lacked the new Article and ItemList schema-assist builders.
- Added `infrastructure/lambda/worker/analysis-serializer.js` because the worker
  serializer also needed matching non-inline reason and fix-hint coverage for
  those two checks once the worker builder mirror was brought up to date.
- Added `infrastructure/lambda/worker/worker-regression.test.js` and
  `infrastructure/lambda/worker/analysis-serializer.worker.test.js` so the worker
  mirror cannot silently drift again on supported schema-assist checks or emitted
  insertable schema-assist payloads.
- Added `tests/diagnostics/check-contract-sync.test.js` because the quick
  lookaround exposed one stale hard-coded `53` check expectation after M5 raised
  the live inventory to `54`.

### M6 - Focused Regression Sweep

**Status:** Complete

**Goal**

Run only the tests needed to prove ownership cleanup, analyzer isolation, intro
cleanup, deterministic guidance parity, and the two new checks did not drift.

**Planned write set**

- `infrastructure/lambda/orchestrator/analyze-run-handler.test.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- `infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `infrastructure/lambda/worker/preflight-handler.test.js`
- `infrastructure/lambda/orchestrator/schema-draft-builder.test.js`
- `docs/CHECK_OWNERSHIP_IMPLEMENTATION_TRACK.md`

**Scope**

- ownership bucket assertions
- prompt exposure assertions
- intro score/category assertions
- deterministic explanation coverage assertions
- positive and negative cases for the two new deterministic schema checks

**Outcome**

- The focused M6 regression sweep passed across the planned ownership, analyzer,
  intro, deterministic-guidance, and new-schema-check surfaces.
- No additional runtime or schema edits were required during M6; the milestone
  closed as a validation-only pass after the M5 lookaround cleanup.
- The orchestrator analyzer and serializer suites both confirmed the live
  `54`-check state, the deterministic isolation rules, the intro cleanup, and
  the insertable `Article`/`ItemList` schema-assist paths.
- The worker preflight sweep confirmed that the worker runtime still matches the
  orchestrator on intro ownership, deterministic schema checks, and
  heading-fragmentation behavior after the M5 mirror cleanup.

**Validation**

- `npm.cmd test -- --runInBand analyze-run-handler.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  Run from `infrastructure/lambda/worker`
- `npm.cmd test -- --runInBand preflight-handler.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand schema-draft-builder.test.js`
  Run from `infrastructure/lambda/orchestrator`
- `npm.cmd test -- --runInBand analysis-serializer.test.js`
  Run from `infrastructure/lambda/orchestrator`

**Intentional test-output note**

- `analyze-run-handler.test.js` still prints the synthetic `Unknown check ID: test_check`
  warning during specific fixture paths. That warning is expected test data, not
  leftover implementation drift.

## Completion Rule

Implementation is complete only when:

- deterministic-owned checks no longer leak into the AI analyzer surface
- intro ownership and scoring are stable after the composite retirement
- deterministic message coverage is complete enough to stand without AI help
- both approved schema checks are live and tested
- the focused regression sweep passes
