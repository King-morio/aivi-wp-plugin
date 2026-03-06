# Phase 4 Commit/Tag/Push Prep

## Current Git State
- Branch: `feature/phase3-harden-plugin`
- Remote: `origin https://github.com/King-morio/AiVI-WP-Plugin.git`
- Release package exclusions added and verified.
- Local verification gate passed.

## Commit Prep Blockers
1. The working tree is not commit-safe yet.
   - Remaining untracked areas:
     - `infrastructure/` (83 paths)
     - `tests/` (16 paths)
     - root scratch files (36 paths)
     - `assets/` (4 paths)
     - `docs/` (5 paths)
2. Runtime and scratch files are still mixed together in the same status view.
3. Version drift was resolved during closeout:
   - `package.json`: `1.0.8`
   - `ai-visibility-inspector.php`: `1.0.8`

## Safe Stage Buckets
### Bucket A — Runtime + Plugin UI
Stage these together:
- `ai-visibility-inspector.php`
- `assets/`
- `includes/`
- `package.json`
- `tests/js/`
- `tests/diagnostics/`
- `tests/test-json-serialization.php`
- `.gitattributes`
- `.gitignore`
- `.distignore`
- `tools/package-plugin-release.ps1`

### Bucket B — Backend / Infra Runtime
Commit these as source-of-truth:
- `infrastructure/lambda/worker/`
- `infrastructure/lambda/shared/`
- `infrastructure/lambda/orchestrator/`
- `infrastructure/deploy-rcl-7z.ps1`
- `infrastructure/terraform/`
- `infrastructure/cdk/lib/`
- `infrastructure/cdk/package.json`
- `infrastructure/cdk/package-lock.json`

Archive or ignore these instead of treating them as runtime:
- `infrastructure/archive/legacy-scripts/`
- `infrastructure/archive/legacy-runtime/`
- `infrastructure/lambda/worker_temp/`
- `infrastructure/lambda/worker_deploy/`
- `infrastructure/tmp/`
- `infrastructure/cdk/cdk.context.json`

### Bucket C — Cleanup / Archive
Stage deletions and archive moves together:
- `docs/archive/`
- `infrastructure/archive/`
- deletions of stale milestone/docs files
- `docs/PHASE4_CLOSEOUT_CHECKLIST.md`

## Do Not Stage Until Reviewed
These still look like scratch or local-only files:
- root reports and notes such as `COMPREHENSIVE_DIAGNOSIS.md`, `DEBUG_REPORT.md`, `DEEP_AUDIT_REPORT.md`, `Master Redesign.md`, `RAW_HTML_IMPLEMENTATION_PLAN.md`, `REWRITE_INTEGRATION_COMPLETE.md`
- root debug/test helpers such as `debug-sidebar.html`, `debug-wp-encoding.php`, `direct_test.php`, `test-*.js`, `test-*.php`, `test-*.html`
- local config/tooling files such as `config.json`, `fetch-config.ps1`, `revert-model.ps1`, `update-model.ps1`
- policy scratch files such as `s3-prompts-policy.json`

## Recommended Pre-Commit Cleanup Before Any Tag/Push
1. Root scratch bucket archived/deleted.
2. Infrastructure source-of-truth narrowed to runtime trees + canonical deploy/IaC files.
3. Version metadata aligned to `1.0.8`.
4. Re-run `git status --short` and confirm only intended runtime/cleanup files remain.

## Suggested Commit Strategy
1. Commit 1: `chore: close out phase 4 packaging and cleanup`
2. Commit 2: `feat: checkpoint phase 4 analyzer and overlay baseline`

## Suggested Tag Strategy
Use a non-release checkpoint tag unless versioning is unified first.
- Safe checkpoint tag: `phase4-closeout-2026-03-06`
- If version is aligned first: `v1.0.8-phase4`
