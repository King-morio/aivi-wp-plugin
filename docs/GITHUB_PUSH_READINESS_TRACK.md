# GitHub Push Readiness Track

## Purpose

Keep the final cleanup, validation, and GitHub push disciplined now that the latest specimen-site verification has passed.

## Current Status

### M1 — Visual sanity check
**Status:** Complete

Confirmed on specimen site:

- analysis loader card passes
- Credits tab passes
- Plans spotlight passes
- Support tab passes
- Connection tab passes

## Remaining Milestones

### M2 — Repo cleanup
**Status:** Complete

Scope:

- review `git status`
- separate permanent files from temporary preview/mockup files
- confirm which `.html` preview files should remain tracked
- make sure no throwaway/debug artifacts are left behind

Outcome:

- removed local `.trae/`
- confirmed `.cursor/`, `.windsurf/`, and `antigravity/` are not present locally
- confirmed none of those tool folders are tracked in the current Git index
- added ignore protection for:
  - `/.cursor/`
  - `/antigravity/`
- kept existing ignore protection for:
  - `/.trae/`
  - `/.windsurf/`
- removed the temporary docs `.html` preview/mockup files from the working tree

Note:

- if any of those tool folders were pushed in older GitHub history, removing them from history would require a separate history-rewrite operation (`git filter-repo` / BFG + force push)
- that is **not required** for the current branch cleanup, because they are not tracked in the current tree

### M3 — Final validation sweep
**Status:** Complete

Scope:

- rerun focused frontend validation
- rerun the most relevant diagnostics touched in the latest passes
- optionally re-lint changed PHP files if any final PHP edits land before commit

Outcome:

- frontend validation passed:
  - `tests/js/frontend.test.js`
  - `tests/diagnostics/sidebar-progress-sequence-contract.test.js`
  - `tests/js/sidebar-stale-results-reset-regression.test.js`
  - `tests/js/overlay-draft-compatibility-regression.test.js`
  - `tests/diagnostics/billing-dashboard-controls.test.js`
  - `tests/diagnostics/account-dashboard-contract.test.js`
- analysis-engine regression suites passed:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `infrastructure/lambda/orchestrator/analyze-run-async-handler.test.js`
  - `infrastructure/lambda/orchestrator/analysis-details-handler.test.js`
  - `infrastructure/lambda/orchestrator/run-status-handler.test.js`
- PHP lint passed:
  - `includes/class-admin-settings.php`
  - `includes/class-rest-preflight.php`
- sweep totals:
  - frontend and diagnostics: `15/15`
  - analysis-engine regression suites: `175/175`

### M4 — Diff review and commit grouping
**Status:** Complete

Scope:

- group changes into clean commit boundaries
- separate:
  - backend analysis hardening
  - stale-results and supersession fixes
  - settings/UI polish
  - sidebar loader redesign and microcopy

Outcome:

- reviewed the current diff footprint and confirmed the branch is wider than the latest specimen-tested fixes
- grouped the GitHub-ready work into these commit buckets:
  1. `analysis-engine-hardening`
     - deterministic and hybrid rule fixes
     - serializer and guardrail surfacing fixes
     - block-map, intro, freshness, HowTo/FAQ, and heading-fragmentation corrections
     - run supersession plumbing and supporting backend tests
  2. `editor-and-sidebar-runtime`
     - stale-results reset
     - overlay draft compatibility and highlight/runtime UI fixes
     - analysis progress card redesign and approved microcopy refresh
  3. `settings-and-dashboard-polish`
     - Plans / Credits / Connection / Support tab polish
     - approved settings-shell refinements
     - safe removal of dormant sidebar controls from the visible UI
  4. `docs-and-release-scaffolding`
     - cleanup notes, active track docs, changelog updates, ignore rules, and packaging/deploy script adjustments

Release note:

- a larger account, billing, PayPal, super-admin, and admin-console change stream is also present in the branch
- that stream should be treated as a separate commit lane unless we explicitly choose to include and review it during `M5`

### M5 — GitHub-ready pass
**Status:** Complete

Scope:

- confirm no accidental debug-only code remains
- confirm whether packaged zip stays untracked
- confirm docs set is intentional

Outcome:

- switched the public-push strategy from “push this branch” to “push a clean public snapshot”
- created a public-safe allowlist manifest at `tools/public-repo-allowlist.json`
- created snapshot tooling at `tools/export-public-repo-snapshot.ps1`
- generated a clean snapshot here:
  - `dist/public-repo/_stage/AiVI-WP-Plugin-public`
- generated a ready-to-share archive here:
  - `dist/public-repo/AiVI-WP-Plugin-public.zip`
- verified the snapshot keeps only plugin runtime and contributor-safe build/test files
- added a public-scope note to `readme.md` so the public repo explains why internal systems are excluded
- verified the snapshot excludes:
  - `control-plane/admin-console`
  - `infrastructure/lambda`
  - deploy scripts tied to private infrastructure
  - internal billing / PayPal / Cognito / super-admin docs and code
  - temp/debug/replay artifacts
- excluded `tests/js/execution-failure-states.test.js` from the public snapshot because it depends on private infrastructure modules
- snapshot result:
  - file count: `64`
  - zip size: `0.35 MB`

Public push rule:

- do **not** push the current private repo history to the public remote
- push from the generated public snapshot (or from a brand-new clean repo created from that snapshot) so private/internal history never rides along

### M6 — Commit and push
**Status:** Complete

Scope:

- create final commits
- push to GitHub

Outcome:

- published the clean public snapshot to:
  - `https://github.com/King-morio/aivi-wp-plugin-public`
- first public content commit:
  - `4fcbbb1` — `Add initial public plugin snapshot`
- confirmed the public repo remote is clean and attached to:
  - `origin https://github.com/King-morio/aivi-wp-plugin-public.git`

Note:

- the local public working copy currently lives at:
  - `C:\Users\Administrator\Studio\public\aivi-wp-plugin\aivi-wp-plugin`
- that nested path is safe and working, but we can flatten it later if you want a tidier local structure

## Recommended Execution Order

1. `M2` Repo cleanup
2. `M3` Final validation sweep
3. `M4` Diff review and commit grouping
4. `M5` GitHub-ready pass
5. `M6` Commit and push
