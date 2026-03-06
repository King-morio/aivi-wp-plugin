# Phase 4 Closeout Checklist

## Goal
Close Phase 4 as a stable baseline without breaking the working plugin. This closeout is about:

- preserving the current working analyzer + overlay behavior
- removing temporary/debug/prototype clutter
- superseding stale plans with one current closeout record
- preparing a clean checkpoint before Phase 5

## Closeout Rules

- Do not change working runtime behavior during cleanup.
- Delete only files that are clearly temporary, generated, or debug-only.
- Archive historical plans/reports instead of deleting them if they may still be useful for reference.
- Keep `docs/OVERLAY_EDITOR_SMOOTH_3_OPTIONS_EDITABLE.html`.
- Exclude non-runtime material from release packaging even if it stays in the repo.

---

## 1. Verification Gate Before Cleanup

- [ ] Confirm sidebar analysis runs successfully end to end.
- [ ] Confirm overlay editor opens and preserves editor content fidelity.
- [ ] Confirm inline highlights still render.
- [ ] Confirm recommendations render cleanly.
- [ ] Confirm `Jump to block` works.
- [ ] Confirm pass checks are not highlighted in overlay.
- [ ] Confirm `Show passed checks` still works in sidebar.
- [ ] Confirm `Apply Changes` still writes back into the WP editor.
- [ ] Confirm no stale-alert regression on completed runs.
- [ ] Confirm one default-profile deploy smoke still works.

---

## 2. Keep Bucket

These stay in the repo as active references or runtime-critical material.

### Runtime / operational keep

- [ ] Keep `assets/`
- [ ] Keep `includes/`
- [ ] Keep `infrastructure/lambda/`
- [ ] Keep `infrastructure/deploy-rcl-7z.ps1`
- [ ] Keep `infrastructure/README.md`
- [ ] Keep `tests/`

### Docs keep

- [ ] Keep `docs/PHASE4_CLOSEOUT_CHECKLIST.md`
- [ ] Keep `docs/phase4_implementation_decisions.md`
- [ ] Keep `docs/GUIDANCE_OUTPUT_POLICY.md`
- [ ] Keep `docs/NAVIGATION_MODEL.md`
- [ ] Keep `docs/OVERLAY_EDITOR_SMOOTH_3_OPTIONS_EDITABLE.html`
- [ ] Keep `docs/schema/analyzer_aggregator_schema.json`

### Infrastructure keep-by-default pending later consolidation

These are not part of the immediate trash pass. Leave them in place for now.

- [ ] Keep all remaining `infrastructure/*.ps1`
- [ ] Keep all remaining `infrastructure/*.sh`
- [ ] Keep `infrastructure/mappings.json`

---

## 3. Archive Bucket

Move these into an archive folder instead of deleting them. Recommended target:

- `docs/archive/phase1-4/`
- `infrastructure/archive/`

### Archive docs - obsolete plans, reports, and sprint notes

- [ ] Archive `docs/43-checks-complete-list.md`
- [ ] Archive `docs/ai-analysis-disable-report.md`
- [ ] Archive `docs/ai-disable-implementation-notes.md`
- [ ] Archive `docs/AI_UNAVAILABLE_STABILIZATION_PATCH_ORDER.md`
- [ ] Archive `docs/analysis-anchoring-fix-plan.md`
- [ ] Archive `docs/complete-technical-report.md`
- [ ] Archive `docs/comprehensive-analysis.md`
- [ ] Archive `docs/crash-recovery-summary.md`
- [ ] Archive `docs/critical-error-fix.md`
- [ ] Archive `docs/critical-error-resolution.md`
- [ ] Archive `docs/DIAGNOSTIC_REPORT_2026-02-11.md`
- [ ] Archive `docs/ELLIPSIS_INVESTIGATION_2026-02-11.md`
- [ ] Archive `docs/error-timeline.md`
- [ ] Archive `docs/HIGHLIGHT_DISCIPLINE.md`
- [ ] Archive `docs/inline-evidence-sprint-checklist.md`
- [ ] Archive `docs/INVALID_JSON_POSTMORTEM.md`
- [ ] Archive `docs/journey-analysis.md`
- [ ] Archive `docs/LATENCY_90S_PATCH_DEPLOY_CHECKLIST.md`
- [ ] Archive `docs/LONG_TERM_RECOMMENDATIONS.md`
- [ ] Archive `docs/MILESTONE3_PRODUCT_DEFAULTS_CHECKLIST.md`
- [ ] Archive `docs/milestone_4_2_mini_milestones.md`
- [ ] Archive `docs/mini-milestone-4-2-0-progress.md`
- [ ] Archive `docs/OVERLAY_EDITOR_PLAN.md`
- [ ] Archive `docs/OVERLAY_HIGHLIGHTING_3_MILESTONE_PLAN.md`
- [ ] Archive `docs/OVERLAY_HIGHLIGHTING_V2_ROADMAP.md`
- [ ] Archive `docs/OVERLAY_HIGHLIGHT_PRECISION_3_MILESTONE_PLAN.md`
- [ ] Archive `docs/OVERLAY_OPTIONC_FIDELITY_TASK_TRACK.md`
- [ ] Archive `docs/papa_fuego_plan.md`
- [ ] Archive `docs/phase4_milestones.md`
- [ ] Archive `docs/PLUGIN_AUDIT_REPORT.md`
- [ ] Archive `docs/post-edit-error-fixes.md`
- [ ] Archive `docs/PRICING_ANALYSIS.md`
- [ ] Archive `docs/rawanalysis.md`
- [ ] Archive `docs/REWRITE_RESOLVER_PATCH_ORDER.md`
- [ ] Archive `docs/REWRITE_SECTION_FIRST_SMALL_RISK_PATCH_ORDER.md`
- [ ] Archive `docs/SCHEMA_ASSIST_EXPANSION_SPRINT.md`
- [ ] Archive `docs/SCHEMA_ONLY_PATCH_CHECKLIST.md`
- [ ] Archive `docs/sidebar-complete-explanation.md`
- [ ] Archive `docs/sidebar-ui-debugging.md`
- [ ] Archive `docs/sidebar-visual-guide.md`
- [ ] Archive `docs/SPRINT_GUIDE_OVERLAY_HIGHLIGHTS_2026-02-09.md`
- [ ] Archive `docs/STABILITY_RELEASE_MODE_CHECKLIST.md`
- [ ] Archive `docs/ui_refactor_milestones.md`
- [ ] Archive `docs/wordpress-error-fixes.md`

### Archive docs - retained design/prototype history

- [ ] Archive `docs/ANALYSIS_PROGRESS_5_OPTIONS.html`
- [ ] Archive `docs/EXPLANATION_UX_PREVIEW.html`
- [ ] Archive `docs/OVERLAY_PREMIUM_3_OPTIONS.html`
- [ ] Archive `docs/OVERLAY_PREMIUM_PREVIEW.html`
- [ ] Archive `docs/OVERLAY_TOPBAR_3_OPTIONS.html`
- [ ] Archive `docs/sidebar-loader-options.html`

### Archive infrastructure reports

- [ ] Archive `infrastructure/HOUSEKEEPING_REPORT.md`
- [ ] Archive `infrastructure/KNOWN_ISSUES.md`
- [ ] Archive `infrastructure/MILESTONE2_DEPLOYMENT_STATUS.md`
- [ ] Archive `infrastructure/MILESTONE3_1_DEPLOYMENT_STATUS.md`
- [ ] Archive `infrastructure/MILESTONE3_2_COMPLETION_REPORT.md`
- [ ] Archive `infrastructure/MILESTONE3_3_COMPLETION_REPORT.md`
- [ ] Archive `infrastructure/MILESTONE4_1_COMPLETION_REPORT.md`
- [ ] Archive `infrastructure/MILESTONE4_1_PHASE1_COMPLETION_REPORT.md`

---

## 4. Delete Bucket

Delete these from the repo/workspace once verification passes.

### Delete from plugin docs

- [ ] Delete `docs/debug_details_1.json`
- [ ] Delete `docs/debug_details_2.json`
- [ ] Delete `docs/debug_details_verify.json`
- [ ] Delete `docs/debug_summary.json`
- [ ] Delete `docs/overlay-editor-mockup.png`
- [ ] Delete `docs/overlay-positioning.png`

### Delete from infrastructure

- [ ] Delete `infrastructure/orchestrator-deploy.zip`
- [ ] Delete `infrastructure/orchestrator-test-payload.json`
- [ ] Delete `infrastructure/out.json`
- [ ] Delete `infrastructure/response.json`
- [ ] Delete `infrastructure/test-analyze.json`
- [ ] Delete `infrastructure/test-event.json`
- [ ] Delete `infrastructure/test-invoke-payload.json`
- [ ] Delete `infrastructure/test-simple.json`
- [ ] Delete `infrastructure/verification-report.json`
- [ ] Delete `infrastructure/worker-response.json`
- [ ] Delete `infrastructure/worker-test-payload.json`

### Delete workspace-root temporary artifacts

Delete by pattern from the workspace root, not from the plugin directory:

- [ ] Delete `_tmp_*`
- [ ] Delete `_tmp_wp_server.pid`
- [ ] Delete `_tmp_wp_server_stdout.log`
- [ ] Delete `_tmp_wp_server_stderr.log`
- [ ] Delete `logs.json`
- [ ] Delete `response.json`
- [ ] Delete `response_final*.json`
- [ ] Delete `response_verify*.json`

### Delete workspace-root ad hoc helper files if not referenced anywhere

Run a final reference check first, then delete:

- [ ] Delete `debug_entities.php`
- [ ] Delete `update_settings.php`
- [ ] Delete `update_settings*.php`
- [ ] Delete `update_url.php`
- [ ] Delete `_tmp_wp_ping.php`
- [ ] Delete `_tmp_wp_runstatus*.php`

---

## 5. Exclude-from-Release Bucket

These may remain in the repo but must not ship in the customer-facing plugin package.

- [ ] Exclude `docs/**`
- [ ] Exclude `docs/archive/**`
- [ ] Exclude `tests/**`
- [ ] Exclude `infrastructure/**`
- [ ] Exclude `infrastructure/archive/**`
- [ ] Exclude `infrastructure/cdk/cdk.out/**`
- [ ] Exclude `**/*.zip`
- [ ] Exclude `**/node_modules/**`
- [ ] Exclude `**/coverage/**`
- [ ] Exclude `**/_tmp_*`
- [ ] Exclude `**/*.log`
- [ ] Exclude `**/*debug*.json`
- [ ] Exclude `**/*response*.json`
- [ ] Exclude `**/*payload*.json`
- [ ] Exclude `**/*mockup*.png`
- [ ] Exclude `**/*positioning*.png`
- [ ] Exclude `**/*OPTIONS.html`
- [ ] Exclude `**/*PREVIEW.html`

---

## 6. Packaging / Release Hardening

- [ ] Confirm the release zip contains only runtime plugin files.
- [ ] Confirm no `docs/`, `tests/`, `infrastructure/`, or `archive/` files ship in the release zip.
- [ ] Confirm no generated zips or JSON payload files ship in the release zip.
- [ ] Confirm packaging does not recurse into `infrastructure/cdk/cdk.out`.
- [ ] Confirm default AWS profile behavior remains locked in `infrastructure/deploy-rcl-7z.ps1`.

---

## 7. Final Phase 4 Verification

- [ ] Run targeted JS/PHP tests relevant to sidebar, overlay, serializer, and rewrite flow.
- [ ] Run one local sidebar analysis smoke.
- [ ] Run one overlay editor smoke.
- [ ] Run one deploy smoke.
- [ ] Confirm loader UI still works after cleanup.
- [ ] Confirm no runtime import/reference points to deleted or archived files.

---

## 8. Git / Versioning Closeout

- [ ] Commit cleanup separately from behavior changes.
- [ ] Create one Phase 4 baseline tag.
- [ ] Push the Phase 4 baseline to GitHub.
- [ ] Treat that pushed baseline as the starting point for Phase 5.

---

## 9. Completion Criteria

Phase 4 is considered cleanly closed only when all of the following are true:

- [ ] Plugin behavior is unchanged and verified.
- [ ] One canonical closeout checklist exists.
- [ ] Stale plans/reports are archived.
- [ ] Temporary/debug/generated clutter is deleted.
- [ ] Release packaging excludes non-runtime material.
- [ ] A clean Phase 4 baseline is committed, tagged, and pushed.
