# Super Admin Console Option C Parity Track

## Purpose

Bring the live super-admin console into close structural parity with the approved `Option C` preview in:

- `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_CONSOLE_OPTION_C_COMPACT_OPERATIONS.html`

This track is intentionally **UI-only**. It must not change backend logic, admin actions, billing behavior, or API contracts.

## Ground Truth

Approved direction:

- compact KPI strip
- one calm left workspace card for search + account list
- one center accordion-style detail workspace
- one slim right action rail made of small focused cards
- independent scrolling where needed
- cleaner spacing so clicks are not blocked and actions stay isolated

Observed drift in the current live console:

1. left workspace is split into multiple stacked cards instead of one unified Option C-style list card
2. the center and right areas are still oversized and fight for height/space
3. some cards overlap visually and interfere with clicking
4. text and controls are squeezed in places that increase operator error risk
5. the footer/status note still competes with the active workspace instead of staying out of the way

## Scope

In scope:

- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/styles.css`
- focused admin-console UI diagnostics
- staging console bundle rebuild after each accepted milestone

Out of scope:

- backend API logic
- Cognito auth behavior
- mutation/recovery logic
- WordPress plugin runtime/package contents

## Milestones

### Milestone 1: Layout Parity

Status: `complete`

Goal:

- make the live console structurally resemble approved Option C before polishing density

Acceptance:

- left side becomes one unified search + account-list workspace card
- center remains the main accordion workspace
- right side becomes a compact action/context rail instead of one oversized competing panel
- the footer/status note no longer overlaps or visually cuts across active content
- no click targets are blocked by layout overlap

Validation recorded on 2026-03-16:

- unified the left side into one account-browser workspace card in `control-plane/admin-console/src/app.js`
- moved the action/context rail into compact stacked cards instead of one oversized competing shell
- removed the footer/status note from the active workspace flow
- reduced the KPI strip back toward the approved Option C shape
- passed focused admin-console diagnostics:
  - `tests/diagnostics/admin-console-ui-contract.test.js`
  - `tests/diagnostics/admin-console-runtime-config-contract.test.js`
  - `tests/diagnostics/super-admin-rollout-safety.test.js`
  - `tests/diagnostics/staging-rollout-prep.test.js`

### Milestone 2: Click Safety

Status: `complete`

Goal:

- eliminate squeeze/overlap behavior that makes controls hard to use, especially in the authenticated loaded state

Acceptance:

- column widths/heights stop cards from colliding
- buttons remain fully clickable
- each scrollable region has clear available height
- account list, center workspace, and action/context rail can all be used without accidental cross-panel interference
- the authenticated post-login layout no longer “crumbles” after real account/detail data loads
- fixed-height workspace constraints no longer starve loaded cards and controls of space
- the pre-login and post-login layout shells stay consistent enough that logging in does not trigger a visual collapse

Validation recorded on 2026-03-16:

- moved the authenticated workspace away from a single fixed-height parent trap and onto pane-level height constraints in `control-plane/admin-console/src/styles.css`
- rebalanced the 3-column layout so the center workspace keeps more room after real account data loads
- restored safe per-pane scrolling for the account browser, center workspace, and action rail without cross-panel click interference
- restacked the account-list header row so timestamps stop compressing the main label in the loaded state
- passed focused admin-console diagnostics:
  - `tests/diagnostics/admin-console-ui-contract.test.js`
  - `tests/diagnostics/admin-console-runtime-config-contract.test.js`
  - `tests/diagnostics/super-admin-rollout-safety.test.js`
  - `tests/diagnostics/staging-rollout-prep.test.js`
- rebuilt the staging console bundle under `control-plane/admin-console/dist/`

### Milestone 3: Readability and Density

Status: `complete`

Goal:

- make the console calmer and easier to scan without changing its data model

Acceptance:

- account cards stop cramping timestamps, IDs, and pills into one tight row
- action rail copy is short and secondary
- headings, KPI cards, and detail cards have enough breathing room
- placeholder SaaS metrics remain clearly marked where real rollups are not yet wired

Validation recorded on 2026-03-16:

- converted the left browser controls into a calmer Option C-style surface with always-visible search plus collapsible advanced filters in `control-plane/admin-console/src/app.js`
- reduced the amount of always-open filter chrome so the account list stays surfaced instead of feeling hidden behind the upper controls
- tightened helper copy and browser spacing in `control-plane/admin-console/src/styles.css` so the left workspace reads more like the approved compact operations mock
- kept all changes UI-only and preserved the existing admin data/actions contract
- passed focused admin-console diagnostics:
  - `tests/diagnostics/admin-console-ui-contract.test.js`
  - `tests/diagnostics/admin-console-runtime-config-contract.test.js`
  - `tests/diagnostics/super-admin-rollout-safety.test.js`
  - `tests/diagnostics/staging-rollout-prep.test.js`
- rebuilt the staging console bundle under `control-plane/admin-console/dist/`

### Milestone 4: Validation and Bundle Refresh

Status: `complete`

Goal:

- verify the UI contract stayed intact and prepare the next staging upload

Acceptance:

- focused admin-console diagnostics pass
- fresh bundle is rebuilt under `control-plane/admin-console/dist/`
- re-upload guidance remains staging-console only; no WordPress plugin package is needed unless plugin runtime files change

Validation recorded on 2026-03-16:

- rebuilt the latest staging bundle under `control-plane/admin-console/dist/`
- uploaded the current staged console bundle to the staging bucket root and refreshed the hosted console
- operator validation confirms the current staging console now reflects the approved Option C-based shell closely enough to use as the live super-admin base
- confirmed this track remains control-plane only; no WordPress plugin package was required

## Notes

- Treat the approved HTML preview as the visual anchor, not just “inspiration.”
- Preserve existing render function names and user-facing contract strings that current diagnostics lock.
- Keep the work reversible and incremental: structural parity first, then click safety, then density polish.
