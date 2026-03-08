# Changelog

All notable changes to the AiVI WordPress Plugin will be documented in this file.

## [Unreleased]

### Phase 5 Closeout

- formally closed the Phase 5 commerce rollout work after validating:
  - sandbox top-up grant
  - sandbox subscription activation
  - analysis admission and credit settlement
- updated closeout and rollout docs to move the remaining work into a dedicated Phase 6 polish track

### Billing UI and State Sync

- refreshed local WordPress account/dashboard state from authoritative backend summary after completed runs
- removed the duplicate post-run credit/debit card from the analysis sidebar
- kept sidebar and settings credit balances aligned after live credit consumption

## [1.0.8] - 2026-03-06

### Phase 4 Closeout

- aligned plugin and package metadata on version `1.0.8`
- added a release packaging allowlist so docs, infrastructure, archives, and temp artifacts do not ship in the plugin zip
- cleaned Phase 4 repo clutter and removed obsolete helper/debug files from the commit candidate set

### Security Hardening

- removed hardcoded backend API fallback from plugin bootstrap
- stopped localizing unnecessary client config values (`siteId`, `tokenCutoff`, full backend URL)
- changed details-token signing to require real secret material instead of a predictable fallback
- quarantined local artifact captures and leaked presigned worker code URL files from version control

### UI and Analysis Runtime

- finalized sidebar analysis loader refinements for the current Phase 4 baseline
- preserved overlay/editor runtime behavior while tightening packaging and commit hygiene

## [1.5.0] - 2026-01-29

### Execution & Failure States (Hard Abort, Stale-Run Invalidation)

**Feature:** Professional, predictable behavior when analysis fails or content changes.

#### Abort Behavior (Strict)

When any of these occur, the entire analysis run is aborted:
- AI service returns timeout
- AI service returns HTTP error (5xx) or model unavailable
- Analyzer produces invalid/unparseable JSON
- Any unexpected exception during server-side analysis pipeline

**Abort Response (exact shape):**
```json
{
  "version": "1.2.0",
  "run_id": "<run_id>",
  "status": "aborted",
  "reason": "ai_unavailable|timeout|invalid_output|internal_error",
  "message": "Analysis aborted — no partial results shown",
  "trace_id": "<trace id>"
}
```

#### Sidebar Behavior on Abort

- Sidebar is emptied of all analysis cards (no categories, no issues)
- Prominent non-modal banner with exact copy: **"Analysis aborted — no partial results shown"**
- Single CTA button: **"Retry analysis"**

#### Details Endpoint Behavior

- **Aborted run**: Returns HTTP 503 Service Unavailable
- **Stale run**: Returns HTTP 410 Gone

**503 Response (aborted):**
```json
{
  "status": "aborted",
  "code": "analysis_aborted",
  "reason": "<reason>",
  "message": "Analysis aborted — no partial results shown",
  "trace_id": "<trace id>"
}
```

**410 Response (stale):**
```json
{
  "status": "stale",
  "code": "results_stale",
  "message": "Analysis results stale — please re-run analysis",
  "run_id": "<run_id>"
}
```

#### Stale-Run Invalidation

On any editor content modification after analysis completes:
- Run marked stale locally
- Active highlights cleared
- Navigation controls disabled
- Toast displayed: **"Analysis results stale — please re-run analysis"**
- Single-action button: **"Re-run analysis"**

#### Telemetry Events (PII-safe)

- `analysis_started` { run_id, user_id_anonymized, timestamp }
- `analysis_completed` { run_id, duration_ms, issues_count }
- `analysis_aborted` { run_id, reason, trace_id, duration_ms }
- `analysis_marked_stale` { run_id, user_action, timestamp }
- `details_request_aborted` { run_id, check_id?, instance_index? }
- `details_request_stale` { run_id, check_id?, instance_index? }

#### Files Added/Modified

- `infrastructure/lambda/orchestrator/analysis-serializer.js` - Abort response generation
- `infrastructure/lambda/orchestrator/run-status-handler.js` - Proper abort analysis_summary
- `infrastructure/lambda/orchestrator/analysis-details-handler.js` - 503/410 responses
- `infrastructure/lambda/orchestrator/telemetry-emitter.js` - PII-safe telemetry events
- `assets/js/aivi-sidebar.js` - Abort banner, stale banner, content change detection
- `tests/js/execution-failure-states.test.js` - 6 acceptance tests

---

## [1.4.0] - 2026-01-29

### Editor Coupling & Highlight Discipline

**Feature:** Deterministic anchor resolution with single active highlight for trustworthy editor integration.

#### Anchor Resolution (Deterministic)

- **Primary**: `node_ref` from details endpoint maps directly to Gutenberg block
- **Fallback**: Exact substring match only (no fuzzy/heuristic search)
- **No Match**: "Unable to locate instance" popover with "Open details" action

#### Single Active Highlight

- Only one highlight visible at any time
- Previous highlight cleared before showing new one
- Highlight persists until next navigation or content edit

#### Stale-Run Handling

- Content edits invalidate the current analysis run
- Navigation disabled when stale (returns 410 from endpoint)
- Non-modal toast: "Analysis results stale — please re-run analysis."
- Highlights auto-cleared on content edit

#### Visual Specification

Semantic style tokens for verdict-based highlighting:
- `fail` → Critical (red border: `#dc2626`, light background)
- `partial` → Warning (amber border: `#d97706`, light background)
- `pass` → Success (green, details drawer only)

#### Accessibility

- Smooth scroll to highlighted block
- Keyboard focus inside highlighted element
- WCAG AA compliant contrast ratios
- Screen reader labels: `aria-label`, `role="mark"`

#### Telemetry (PII-safe)

Events logged without raw snippet content:
- `highlight_shown` - navigation success
- `highlight_cleared` - highlight removed
- `anchor_resolution_failed` - with reason (no snippet)

#### Files Added/Modified

- `assets/js/aivi-highlight-manager.js` - HighlightManager, AnchorResolver, DetailsClient, PopoverManager
- `assets/js/aivi-sidebar.js` - NavigationController integration with HighlightManager
- `assets/css/aivi-highlights.css` - Semantic style tokens, popover/toast styles
- `tests/js/highlight-discipline.test.js` - 7 acceptance tests
- `docs/HIGHLIGHT_DISCIPLINE.md` - Internal documentation

---

## [1.3.0] - 2026-01-29

### Navigation Model (Fast Editing, No Cognitive Load)

**Feature:** Fast, deterministic navigation between issue instances in the editor.

#### Navigation Controls

- **Instance Display**: `< 1 / 5 >` format showing current position
- **Cyclic Navigation**: Wraps from last→first and first→last
- **Keyboard Shortcuts**: `[` = previous, `]` = next instance
- **Click to Focus**: Clicking issue row sets it as the active issue for keyboard nav

#### Editor Integration

- **Smooth Scroll**: Editor scrolls to target block on navigation
- **Highlight**: Blue outline + tint for ~1.8 seconds
- **Block Focus**: Gutenberg block selection (when supported)

#### Tooltips

Hover on verdict icons for static UI copy:
- `✕` → "This issue must be fixed for extractability."
- `⚠️` → "This issue partially meets extraction criteria."

#### Files Modified

- `assets/js/aivi-sidebar.js` - NavigationController, keyboard nav, tooltips, highlighting
- `docs/NAVIGATION_MODEL.md` - Internal documentation

---

## [1.2.0] - 2026-01-29

### Sidebar Noise Elimination

**Breaking Change:** The WordPress editor sidebar now shows **only fail/partial issues** with a minimal, icon-only presentation.

#### What Changed

- **Fail/Partial Only**: Sidebar issues list now displays only checks with `ui_verdict === "fail"` or `ui_verdict === "partial"`. Pass and not_applicable checks are hidden from the list view.

- **Icon Mapping**:
  - `fail` → ✕ (X icon, red)
  - `partial` → ⚠️ (warning icon, yellow)
  - `pass` → ✓ (hidden in list, visible only in details drawer)
  - `not_applicable` → hidden

- **Single-Line Issue Rows**: Each issue row now shows only:
  - Verdict icon
  - Check name
  - Instance navigation (`< count >`) if `instances > 1`

- **Ordering**: Issues within each category are now ordered:
  1. All `fail` items first (alphabetical by name)
  2. Then `partial` items (alphabetical by name)

- **No Prose in Sidebar**: The following fields are **never** included in `analysis_summary`:
  - `explanation`
  - `highlights`
  - `suggestions`
  - `snippets`
  - `confidence`
  - `score`
  - `offsets`

- **Instance Navigation**: Click `<` / `>` to navigate between instances. The sidebar calls the details endpoint to fetch highlight offsets for each instance. `instance_index` is **zero-based** (0..instances-1).

#### Schema Version

`analysis_summary.version` is now `1.2.0`:

```json
{
  "version": "1.2.0",
  "run_id": "string",
  "categories": [
    {
      "id": "answer_extractability",
      "name": "Answer Extractability",
      "issue_count": 2,
      "issues": [
        {
          "check_id": "direct_answer_first_120",
          "name": "Direct Answer in First 120 Words",
          "ui_verdict": "fail",
          "instances": 2,
          "first_instance_node_ref": "block-123"
        }
      ]
    }
  ]
}
```

#### Files Modified

- `infrastructure/lambda/orchestrator/analysis-serializer.js` - Filter to fail/partial, ordering logic
- `infrastructure/lambda/orchestrator/sidebar-payload-stripper.js` - Validation for ordering and forbidden verdicts
- `assets/js/aivi-sidebar.js` - Icon mapping, single-line rows, instance navigation
- `infrastructure/lambda/orchestrator/sidebar-noise-elimination.test.js` - 19 automated tests

---

## [1.1.0] - 2026-01-29

### Canonical Primary Category Mapping (Presentation Lock)

- **7 Canonical Categories**: Sidebar results are now grouped exclusively by 7 primary categories
- **No AEO/GEO Grouping**: AEO/GEO are aggregate scores only, never used for grouping
- **Stable Ordering**: Categories displayed in fixed `display_order` (1-7)
- **Single Source of Truth**: `primary-category-map.json` defines all category→check mappings

---

## [1.0.0] - 2026-01-29

### Sidebar-Payload Hard Separation

- **Stripper Layer**: Server-side removal of all forbidden fields before sending to sidebar
- **PII Scrubbing**: Emails, SSNs, phones, credit cards redacted before S3 persistence
- **Stale Content Detection**: Details endpoint returns 410 Gone if content changed since analysis
- **Result Contract Lock**: Minimal `analysis_summary` payload for sidebar, full analysis stored server-side
