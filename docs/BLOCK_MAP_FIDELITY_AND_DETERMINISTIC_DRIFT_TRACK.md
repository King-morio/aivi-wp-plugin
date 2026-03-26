# Block-Map Fidelity and Deterministic Drift Track

## Goal

Repair the Gutenberg `block_map` so deterministic checks, schema drafting, and highlighting evaluate the same structure the author actually wrote.

This track is intentionally focused on the confirmed drift we uncovered:

- missing list support in stored `block_map`
- false-positive `heading_fragmentation` failures caused by that missing support
- downstream risk to other deterministic consumers that rely on list-aware structural input

## What We Verified

### Confirmed article-level failure

- The article `What Is AEO and GEO? A Complete Guide to Optimizing Content for AI-Driven Search` was stored and analyzed successfully.
- Deterministic `heading_fragmentation` still failed against the current hierarchy-aware logic.
- The fail was reproducible from the stored artifact, not just a one-off UI rendering problem.

### Confirmed input drift

- The stored `content_html` for the article contains multiple Gutenberg list blocks (`<!-- wp:list -->`) directly under the sections that were flagged.
- The stored `block_map` for the same run contains:
  - `core/paragraph`
  - `core/h2`
  - `core/h3`
  - but **no `core/list` entries at all**
- This means deterministic evaluation is judging some sections with real support missing from the structural input.

### Root cause in extraction

- Gutenberg `block_map` generation currently happens in `includes/class-rest-preflight.php`.
- `extract_gutenberg_blocks()` currently derives block text from `innerHTML`.
- For Gutenberg `core/list`, the visible wrapper HTML can be nearly empty while the real text lives in descendant `innerBlocks` (`core/list-item`).
- As a result, list blocks can end up with `text_length === 0` and get skipped entirely.

### Why this is a landmine

- This is not only a `heading_fragmentation` issue.
- The same drift can affect any deterministic or structural consumer that expects `block_map` to contain list/support content, including:
  - heading-support rollups
  - HowTo/list detection
  - FAQ / schema draft generation
  - future structure-aware highlighting or rewrite targeting

### Important nuance

- Some sections in the stored article really were saved as sibling `H2` headings when analyzed, so not every flagged outcome is purely false positive.
- But the bigger confirmed drift is still the missing list support in `block_map`.

## Milestone 1 - Gutenberg Block-Map Fidelity Repair

Status: Complete

Scope:
- repair Gutenberg block extraction in `includes/class-rest-preflight.php`
- add a recursive text extraction path for blocks whose meaningful text lives in descendant `innerBlocks`
- preserve list content from `core/list` / `core/list-item`
- keep the existing `block_map` contract stable enough that downstream consumers do not need broad rewrites
- avoid double-counting wrapper + descendant text

Acceptance:
- Gutenberg list content is preserved in `block_map`
- `core/list` no longer disappears when it contains real list-item text
- block signatures, node refs, and snippets remain deterministic
- paragraph and heading extraction remain unchanged for already-correct content

Notes:
- The preferred fix is fidelity-first: make `block_map` match authored structure better, rather than weakening downstream checks.

Completed:
- repaired Gutenberg block extraction so blocks with empty wrapper HTML can recover meaningful text from descendant `innerBlocks`
- preserved list support from `core/list` / `core/list-item` without changing the broader `block_map` contract
- kept signatures, snippets, and node-ref ordering stable by continuing to emit one top-level block-map entry per top-level Gutenberg block
- added focused regression coverage proving Gutenberg list blocks now survive into `block_map` and the preflight manifest

Validation:
- PHP lint passed for:
  - `includes/class-rest-preflight.php`
  - `tests/unit/Test-Preflight.php`
- Targeted PHPUnit passed:
  - `tests/unit/Test-Preflight.php`

## Milestone 2 - Deterministic Consumer Hardening

Status: Complete

Scope:
- rerun `heading_fragmentation` against the corrected `block_map`
- confirm list-aware deterministic consumers now see the repaired input
- verify we do not create new inflation/double-counting in:
  - heading support rollups
  - HowTo/list detection
  - schema drafting helpers
- tighten only the rules that genuinely need follow-up after the input fix

Acceptance:
- article shapes like `H2 -> H3 + paragraphs + lists` are not falsely failed for thin support when the stored structure is actually healthy
- true fragmented outlines still fail
- list-aware consumers behave more truthfully without broad score drift
- no change in AI/semantic logic is required for this repair

Notes:
- We should resist patching `heading_fragmentation` in isolation if the corrected input already resolves the problem.

Completed:
- replayed the confirmed article shape through the repaired extractor and deterministic engine
- verified `heading_fragmentation` now passes on the corrected input without any further rule change
- confirmed the follow-up issue was not in `heading_fragmentation` logic, but in a downstream list-aware consumer that flattened list text too aggressively
- hardened schema drafting so list blocks preserve line structure for deterministic step extraction in both orchestrator and worker paths
- added list-backed regressions proving:
  - `heading_fragmentation` stays pass when preserved list blocks provide real section support
  - HowTo schema drafting can derive steps from preserved list blocks

Validation:
- Replay of the stored article after block-map rebuild produced:
  - `heading_fragmentation` verdict = `pass`
  - average rolled-up support = `58.89`
- Targeted Jest passed:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`
  - `infrastructure/lambda/orchestrator/schema-draft-builder.test.js`
- Syntax validation passed for:
  - `infrastructure/lambda/orchestrator/schema-draft-builder.js`
  - `infrastructure/lambda/worker/schema-draft-builder.js`

## Milestone 3 - Artifact Validation and Safe Rollout

Status: Complete

Scope:
- add focused regressions for Gutenberg list extraction and the confirmed article shape
- verify artifact parity from preflight to stored manifest expectations
- validate that highlights anchor to genuinely thin sections after the fix
- package/deploy only after the deterministic input is proven stable

Acceptance:
- regression tests cover the missing-list case explicitly
- a representative article fixture no longer fails because support was silently dropped
- rollout notes clearly state whether any observed verdict shifts came from better input fidelity rather than scoring rule changes

## Working Principle

We are treating this as an **input truthfulness** repair first, not a scoring workaround.

That keeps the system safer because:

- deterministic checks stay explainable
- false positives drop for the right reason
- future list-aware checks do not inherit the same hidden drift

Completed:
- validated the repaired extractor and deterministic consumers with targeted PHPUnit, Jest, and exact-article replay checks
- rebuilt the stored article shape locally and confirmed `core/list` now survives into `block_map`
- replayed the exact stored article through the repaired deterministic path and confirmed `heading_fragmentation` now passes without additional rule tuning
- prepared plugin packaging so the WordPress-side extractor repair can ship together with the backend consumer fixes
- completed one clean backend rollout after validation passed

Validation:
- PHP lint passed for:
  - `includes/class-rest-preflight.php`
  - `infrastructure/lambda/orchestrator/schema-draft-builder.js`
  - `infrastructure/lambda/worker/schema-draft-builder.js`
- Targeted PHPUnit passed:
  - `tests/unit/Test-Preflight.php`
- Targeted Jest passed:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`
  - `infrastructure/lambda/orchestrator/schema-draft-builder.test.js`
- Exact article replay after block-map rebuild produced:
  - `core/list = 13` preserved list blocks
  - `heading_fragmentation` verdict = `pass`
  - average rolled-up support = `58.89`
- Packaged plugin build:
  - `dist/AiVI-WP-Plugin.zip`
- Live post-deploy smoke passed:
  - `/ping` -> `Healthy Connection`
  - `/aivi/v1/worker/health` -> `ok: true`
  - `aivi-orchestrator-run-dev` last modified = `2026-03-18T17:45:45.000+0000`
  - `aivi-analyzer-worker-dev` last modified = `2026-03-18T17:45:55.000+0000`

Rollout Notes:
- The verdict shift for the confirmed article comes from better structural input fidelity, not from weakening `heading_fragmentation`.
- Plugin update is required because Gutenberg `block_map` generation lives in the WordPress-side preflight path.
- Backend deployment is required because schema-draft consumers live in Lambda.
- Milestone 3 closed only after live smoke confirmed both the API and worker were healthy.
