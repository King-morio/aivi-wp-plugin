# Stale Results and Overlay Draft Track

## Purpose

Keep a small evidence-backed record for the stale-results / stale-draft investigation so we can patch the right layer without losing the debugging artifacts that have been helping us diagnose deterministic issues.

## Confirmed Issues

- fresh analyses already get a new `run_id` every time, so this is **not** a same-run overwrite problem
- the likely drift is in **what the user keeps seeing**, not in how the newest run is scored
- when a new analysis starts, the sidebar clears `rawAnalysis`, but it does **not** immediately clear the current `report` or `overlayContent`
- the review rail can therefore keep showing older-looking findings until the new run fully replaces them
- the message `Restored 52 unsaved edits from draft` comes from AiVI overlay local draft restore, not from the backend
- overlay drafts are stored in browser `localStorage`, keyed by post/path identity
- analysis itself is still submitted from the editor content, not from the restored overlay draft
- this creates a dangerous mismatch:
  - the overlay / review surface may reflect old unsaved overlay edits
  - the analyzer may be scoring different live editor content
- the backend currently receives `post_id` from the WordPress proxy, but the async run metadata path does not yet carry that forward strongly enough to support article-level supersession logic
- immediate artifact deletion would make debugging much harder because run artifacts in S3 are still the cleanest source of truth for replay and forensic analysis

## Phases

### Phase 1: Frontend Result Invalidation

Goal:

- stop old report / overlay state from lingering visually when a new analysis starts

Scope:

- clear `report`
- clear `overlayContent`
- keep the queued / analyzing state stable
- do not disturb current polling behavior or successful run handoff

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js`

Acceptance:

- starting a new analysis immediately removes the previous issue rail / overlay surface
- the user never sees the old report masquerading as the next run while polling is still in progress

Status:

- complete in the current worktree
- landed behaviors:
  - starting a new analysis now clears the previous sidebar report immediately
  - starting a new analysis now clears the previous overlay content immediately
  - the queued / preflight flow still begins normally after the stale UI state is cleared
- validated with:
  - `tests/js/sidebar-stale-results-reset-regression.test.js`
  - `tests/js/frontend.test.js`

### Phase 2: Overlay Draft Restore Invalidation

Goal:

- stop stale local overlay drafts from being restored onto content they no longer belong to

Scope:

- tighten the overlay draft storage identity beyond just post/path where needed
- invalidate or ignore restored drafts when article content, run identity, or compatibility version no longer match
- keep legitimate unsaved overlay edits recoverable within the same editing session / article state

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js`

Acceptance:

- the overlay does not auto-restore old edits onto materially changed content
- the status message `Restored X unsaved edits from draft` only appears for drafts that still truly match the current article context

Status:

- complete in the current worktree
- landed behaviors:
  - overlay drafts are now versioned for compatibility-aware restore
  - restores now require a matching current article context before applying old unsaved overlay edits
  - compatibility now checks:
    - `post_id`
    - `run_id`
    - analyzed `content_hash`
    - current editor content signature
    - overlay schema version
  - incompatible drafts are cleared instead of being restored onto a newer or different article state
- validated with:
  - `tests/js/overlay-draft-compatibility-regression.test.js`
  - `tests/js/overlay-schema-assist.test.js`

### Phase 3: Article-Level Run Supersession

Goal:

- ensure a newer run for the same article supersedes older runs for UI purposes without destroying artifacts

Scope:

- carry article identity (`post_id` or a stable document identity) through run metadata
- mark older runs as superseded by the latest run for that article
- prevent superseded runs from being treated as current sidebar / overlay / details state

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-backend-proxy.php`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analyze-run-async-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/run-status-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-details-handler.js`

Acceptance:

- rerunning analysis on the same article always resolves to the latest run as the active UI source
- older runs remain available for debugging, but not as the article’s current visible state

Status:

- complete in the current worktree
- landed behaviors:
  - analysis requests now carry `post_id` through the sidebar into async run metadata
  - queued run records now persist `post_id` and `article_key`
  - a lightweight `article_latest::<site_id>::<post_id>` pointer now marks the newest run for each article without changing the runs-table schema
  - polling an older run now returns `status = superseded` with `superseded_by_run_id`, allowing the sidebar to switch to the latest run instead of continuing to trust stale status
  - details and raw-analysis fetches now reject superseded runs instead of surfacing stale payloads as current article truth
  - older run artifacts remain intact in storage for replay and debugging
- validated with:
  - `infrastructure/lambda/orchestrator/analyze-run-async-handler.test.js`
  - `infrastructure/lambda/orchestrator/run-status-handler.test.js`
  - `infrastructure/lambda/orchestrator/analysis-details-handler.test.js`
  - `infrastructure/lambda/orchestrator/index.raw-supersession-regression.test.js`
  - `tests/js/sidebar-run-supersession-regression.test.js`
  - `tests/js/frontend.test.js`
  - `infrastructure/lambda/orchestrator/index.test.js`

### Phase 4: Artifact Retention and Debug Safety

Goal:

- preserve our debugging capability while preventing stale user experience

Scope:

- keep run artifacts retained for replay / forensic work
- prefer TTL / retention policy over immediate deletion
- document the difference between:
  - UI supersession
  - artifact retention

Primary files:

- track / rollout notes first
- any retention policy code only if Phase 3 proves it is needed

Acceptance:

- debug artifacts remain usable for issue replay
- user-facing analysis does not quietly fall back to older runs

Status:

- complete in the current worktree
- conclusion:
  - **no additional runtime code is needed right now**
  - Phase 3 already solved the user-facing stale-results problem without sacrificing replay/debug artifacts
- confirmed retention behavior:
  - run records already expire from DynamoDB after **7 days** via `ttl`
  - details session tokens already expire after **1 hour**
  - result URLs are already served as **1-hour presigned URLs**
  - the application currently **does not delete** result, details, manifest, or raw-response artifacts during normal analysis flow
- landed policy:
  - user-facing UI now follows the latest article run
  - older runs are still blocked from current sidebar/raw/details rendering once superseded
  - older artifacts remain available for forensic replay and debugging during the retention window
  - any future artifact pruning should happen through **infrastructure lifecycle policy**, not by deleting artifacts inline during analysis
- validation notes:
  - inspected retention/supersession paths in:
    - `infrastructure/lambda/orchestrator/analyze-run-async-handler.js`
    - `infrastructure/lambda/orchestrator/run-status-handler.js`
    - `infrastructure/lambda/orchestrator/analysis-details-handler.js`
    - `infrastructure/lambda/worker/index.js`
  - confirmed Phase 3 already decouples **UI supersession** from **artifact retention**
