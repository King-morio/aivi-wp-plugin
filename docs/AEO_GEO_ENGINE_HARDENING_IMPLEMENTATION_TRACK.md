# AEO/GEO Engine Hardening Implementation Track

## Purpose

Implement the approved hardening work from:

- [AEO_GEO_SIGNAL_REVIEW_AND_HARDENING_PLAN.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AEO_GEO_SIGNAL_REVIEW_AND_HARDENING_PLAN.md)

This track is intentionally compact:

- fewer milestones
- each milestone is still bounded enough to verify cleanly
- every milestone lists the file surfaces that must stay in sync

The goal is a stronger end-to-end AEO/GEO engine:

- better source/trust logic
- fewer legacy SEO-shaped rules
- better AEO/GEO-specific signals
- cleaner scoring and release behavior
- no drift across prompt, definitions, runtime contract, preflight, serializers, sidebar, review rail, and scoring

## Locked Decisions

1. `claim_provenance_and_evidence` stays, but its default mode becomes visible-support quality, not mandatory external verification.
2. Web lookups become an optional verification mode, not the default path.
3. `external_authoritative_sources` is refactored around source specificity / recognizability / claim-support proximity, not domain authority.
4. FAQ / HowTo checks remain because AiVI optimizes for answer engines and generative engines, not just classic SEO.
5. `content_updated_12_months` must become conditional rather than a universal freshness penalty if retained.
6. New AEO/GEO signals are approved for consideration:
   - canonical clarity / preferred URL integrity
   - AI crawler accessibility
   - original evidence / first-hand value
   - stronger entity-context clarity
7. `lists_tables_presence` still appears to over-fragment one failing section into sub-item issues. That remains unresolved and requires direct artifact investigation before changing it again.

## Milestones

### Milestone 1: Trust and Source Signal Refactor

Goal:

- fix the two most philosophically mismatched trust checks without destabilizing the rest of the engine

Scope:

- refactor `claim_provenance_and_evidence`
  - default mode: visible support quality only
  - optional enhanced mode: web-verified provenance when lookups are enabled
- rename/refactor `external_authoritative_sources`
  - move away from `domain authority estimate`
  - score named source specificity, recognizability, and claim-support proximity
- expose optional web-lookup mode intentionally in UI/settings if current UX path does not already do so cleanly
- add a small user-facing latency note for optional web verification
- keep normal analysis fast and specimen-bound by default

Files likely to change:

Definitions and contracts:
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/check-runtime-contract-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json)
- [primary-category-map.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/data/primary-category-map.json)

Prompt and worker behavior:
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)

Serializers and review-rail release:
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [aivi-sidebar.js](/c:/Users/Administrator/Studio\aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js)
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio\aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)

Settings and request plumbing:
- [class-admin-settings.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php)
- [class-rest-backend-proxy.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-backend-proxy.php)
- [orchestrator/index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/index.js)
- [analyze-run-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analyze-run-handler.js)
- [analyze-run-async-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analyze-run-async-handler.js)

Scoring:
- [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/schemas/scoring-config-v1.json)
- [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/scoring-config-v1.json)
- [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/scoring-config-v1.json)

Tests:
- [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
- [check-contract-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js)
- [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)
- [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
- [sidebar-data-flow.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/sidebar-data-flow.test.js)
- [scoring-engine.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/scoring-engine.test.js)

Acceptance:

- no trust/source check requires external verification in default mode
- web lookup mode is optional and clearly marked as slower
- renamed/refined source-support check uses AEO/GEO-relevant logic
- review rail and sidebar copy stay coherent with the refactor

### Milestone 2: Conditional Rule Cleanup and New Signal Addition

Goal:

- tighten brittle conditional rules and add the highest-value missing AEO/GEO signals

Scope:

- tighten `faq_structure_opportunity`
- make FAQ / HowTo presence checks explicitly neutral/conditional when not triggered
- tighten `schema_matches_content`
- narrow `temporal_claim_check`
- gate or demote `content_updated_12_months` so it only matters where freshness is genuinely material
- add `canonical_clarity` (or equivalent preferred URL integrity signal)
- add `ai_crawler_accessibility`
- add `original_evidence_signal`
- strengthen entity-context clarity if the current entity cluster is still too loose after review

Files likely to change:

Definitions and contracts:
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/checks-definitions-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/check-runtime-contract-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json)
- [primary-category-map.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/data/primary-category-map.json)

Deterministic/preflight:
- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js)
- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js)
- [class-rest-preflight.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-preflight.php)

Prompt and semantic enforcement:
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)

Schema and assist plumbing:
- [schema-draft-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/schema-draft-builder.js)
- [schema-draft-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/schema-draft-builder.js)

UI/release surfaces:
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [aivi-sidebar.js](/c:/Users/Administrator/Studio\aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js)
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio\aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)

Scoring:
- [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/schemas/scoring-config-v1.json)
- [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/scoring-config-v1.json)
- [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/schemas/scoring-config-v1.json)

Tests:
- [worker/preflight-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.test.js)
- [orchestrator/preflight-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.test.js)
- [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
- [check-contract-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js)
- [sidebar-data-flow.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/sidebar-data-flow.test.js)
- [category-integrity.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/category-integrity.test.js)
- new focused tests for added signals and conditional neutrality

Acceptance:

- brittle conditional checks stop reading like universal SEO rules
- newly added AEO/GEO signals are wired through scoring, release, sidebar, and rail
- FAQ / HowTo / schema-related checks remain machine-readability focused, not old-school SEO gimmicks

Status:

- implemented locally
- focused verification passed for:
  - [check-contract-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/check-contract-sync.test.js)
  - [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
  - [preflight-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.test.js)
  - [preflight-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.test.js)
  - [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)
  - [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
  - [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
  - [category-integrity.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/category-integrity.test.js)
  - [sidebar-data-flow.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/sidebar-data-flow.test.js)
  - [scoring-engine.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/scoring-engine.test.js)
- residual non-blocking warning noise remains in scoring tests from stale fixture IDs and can be cleaned during final regression lock

### Milestone 3: Lists/Tables Over-Fragmentation Investigation and Final Lock

Goal:

- directly investigate why `lists_tables_presence` still explodes a section into sub-item issues in live artifacts even after the earlier block-scope refactor

Scope:

- inspect the latest run artifact that reproduces the issue
- trace where the multiple instances are being created:
  - raw AI findings
  - worker normalization
  - serializer release
  - sidebar / review rail consumption
- agree on the narrowest solid fix once the exact source is confirmed
- then lock the entire hardening set with final regression coverage and rollout

Files likely to inspect and possibly change:

Artifacts and diagnostics:
- latest stored `overlay_content` / analysis artifact for the reproduced run
- [worker/index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [aivi-sidebar.js](/c:/Users/Administrator/Studio\aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js)
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio\aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)

Definitions and contract if root cause is upstream:
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json)
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)

Tests:
- [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
- [overlay-pass-filter-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-pass-filter-regression.test.js)
- any new artifact-backed regression for the reproduced case

Acceptance:

- one failing section produces one `lists_tables_presence` issue
- other failing sections still get their own separate issues
- no sub-item or phrase-level fragmentation remains for this check
- final end-to-end hardening rollout is regression-locked

Status:

- latest local `_fresh_wp_probe` run state was identified from the SQLite-backed local WP rollup:
  - `last_run_id = d8f27cc2-2856-482c-976a-4666bacb7e6c`
  - `last_run_status = success_partial`
- the exact stored payload for that local run could not be fetched from this shell because:
  - the local backend proxy returned a connectivity failure
  - AWS credentials were unavailable here
- the fragmentation shape was still verified from real released artifacts already in the workspace, including:
  - [tmp-live-run-0831-aggregator.json](/c:/Users/Administrator/Studio/aivi/tmp-live-run-0831-aggregator.json)
  - [tmp-aggregator-499b3caa.json](/c:/Users/Administrator/Studio/aivi/tmp-aggregator-499b3caa.json)
  - [tmp-run-e802ff1f-overlay-content.json](/c:/Users/Administrator/Studio/aivi/tmp-run-e802ff1f-overlay-content.json)
- those artifacts showed `lists_tables_presence` still releasing as span-scoped/item-scoped content instead of one block-level issue per failing section
- local hardening is now in place:
  - prompt adds a check-specific rule for `lists_tables_presence`
  - both serializers force block-level release for `lists_tables_presence` only
  - recommendation dedupe for this behavior is limited to `lists_tables_presence`, so unrelated checks keep their existing scope/reason handling
- focused verification passed for:
  - [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
  - [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
  - [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)

## Rollout Rules

- deploy only after the milestone’s backend/shared work is complete
- package a plugin zip only when milestone work touches runtime plugin files in `assets/` or `includes/`
- preserve timestamped packages in `C:\Users\Administrator\Desktop\Avella`
- do not overwrite prior known-good packages

## Start Point

Start with Milestone 1.
