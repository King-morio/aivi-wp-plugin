# AiVI Super Admin Control Room Repair Track

## Purpose

This track repairs the first live lift of the `Control Room` super admin UI so the shell and the actual workspace behavior finally match.

Right now the new control-room skin is visible, but the console still behaves like the older stacked admin dossier underneath:

- the sidebar looks route-based, but it does not yet control real workspace slices
- the center canvas still renders a long universal account stack
- summary cards repeat the same account state in too many places
- the right rail is duplicating navigation instead of supporting it
- the hero area is still colliding with older layout rules

This is a UI-only repair track.

## Scope Boundaries

- do not change backend contracts, admin APIs, or data models
- do not change operator actions, diagnostics logic, or billing logic
- do not change Cognito or auth behavior
- do not package the WordPress plugin in this track
- do not redesign working account tools beyond layout, grouping, and presentation

## Core Diagnosis

The current strain is not mainly a color or spacing problem. It is a control-flow mismatch:

- the left rail suggests stable workspace routing
- the main canvas still renders nearly every account component at once
- the current view mostly decides which accordion section is open, not which workspace is active

That is why the UI still feels like a long admin form even after the control-room shell was applied.

## Primary Files

- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/styles.css`
- `control-plane/admin-console/src/index.html` only if font or shell boot polish becomes necessary
- `control-plane/admin-console/tests/diagnostics/admin-console-ui-contract.test.js`
- `control-plane/admin-console/tests/diagnostics/admin-console-runtime-config-contract.test.js`

## Milestones

### Progress Snapshot

- `M1` completed on April 1, 2026
- `M2` completed on April 1, 2026
- `M3` completed on April 1, 2026
- `M4` completed on April 1, 2026

## M1. Shell Pressure And Layout Collision Repair

### Goal

Remove the immediate layout pressure so the control-room shell reads clearly before deeper workspace routing changes land.

### Required Work

- fix the hero/container collision caused by older `.hero` grid assumptions still affecting the new control-room hero
- make the command header, alert block, and focus header stack predictably
- reduce the oversized summary pressure at the top of the page
- ensure the right rail and center canvas start from a calmer, cleaner baseline

### Primary Files

- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/styles.css`

### Acceptance

- the top hero area no longer creates a giant awkward blank or pale block
- the top header reads as one control-room command surface, not competing cards
- the page feels calmer before any deeper content restructuring

### Implementation Notes

- reset the control-room hero to a true single-column stack so it no longer inherits the older two-column `.hero` grid behavior
- tightened the alert, focus card, and system snapshot spacing so they stop competing for dominance at the top of the page
- softened top-level copy that was overpromising route behavior before the deeper workspace ownership repair lands

## M2. Sidebar-To-Workspace Ownership Repair

### Goal

Make each sidebar item control a real workspace slice instead of just opening one section inside a long stacked account panel.

### Required Work

- stop rendering the full account dossier for every view
- make `Dashboard`, `Accounts`, `Operations`, `Diagnostics`, `Billing`, and `Audit` each own their own main-canvas composition
- keep shared account context where needed, but only surface the components relevant to the selected workspace
- preserve existing working components and forms while reassigning where they render

### Primary Files

- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/styles.css`

### Acceptance

- clicking a sidebar item clearly changes the active workspace, not just the open accordion
- the center canvas stops behaving like one long universal stack
- each workspace becomes easier to scan because unrelated panels are no longer present

### Implementation Notes

- introduced view-owned workspace section building so the main canvas no longer renders every account panel on every route
- kept the existing working account components intact and reassigned them to narrower workspace slices:
  - `Dashboard` now focuses session/auth plus account summary
  - `Accounts` now focuses account summary plus connected sites
  - `Operations` now focuses lifecycle plus actions and recovery
  - `Diagnostics` now focuses diagnostics only
  - `Billing` now focuses billing only
  - `Audit` now focuses audit only

## M3. Summary Duplication And Right Rail Role Repair

### Goal

Reduce repeated account summaries and turn the right rail into a true support/context rail.

### Required Work

- choose one primary account summary surface in the main canvas
- remove or compress duplicated account state from the hero, account jump ribbon, right rail, and repeated overview panels
- remove right-rail navigation duplication where it competes with the left sidebar
- keep the right rail for context only:
  - selected account status
  - site snapshot
  - attention flags
  - recent activity

### Primary Files

- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/styles.css`

### Acceptance

- the selected account is not explained five different times
- the right rail supports the active workspace instead of fighting it
- card competition drops noticeably because each summary surface has a clearer job

### Implementation Notes

- removed the duplicate right-rail mini-navigation so the left sidebar remains the single workspace navigator
- compressed the right rail into true context support: selected account, site snapshot, attention flags, and recent activity
- reduced repeated selected-account detail in the hero and quick-switch ribbon so the main canvas can remain the primary account summary surface

## M4. Hierarchy Polish And Staging Bundle Readiness

### Goal

Finish the control-room repair with cleaner hierarchy, spacing, and upload-ready admin-console artifacts.

### Required Work

- tune spacing, surface hierarchy, and card weight after the structural repairs land
- remove remaining card-inside-card aggression where it is no longer needed
- run focused admin-console diagnostics
- rebuild the admin-console staging bundle for manual upload

### Primary Files

- `control-plane/admin-console/src/app.js`
- `control-plane/admin-console/src/styles.css`
- `control-plane/admin-console/package-admin-console.ps1`
- `control-plane/admin-console/tests/diagnostics/admin-console-ui-contract.test.js`
- `control-plane/admin-console/tests/diagnostics/admin-console-runtime-config-contract.test.js`

### Acceptance

- the console reads like a stable control room rather than a skinned form stack
- the sidebar, main canvas, and right rail each have a clear job
- focused admin-console tests pass
- a fresh admin-console upload bundle is ready for the staging console host

### Implementation Notes

- reduced the remaining card-inside-card aggression in the main canvas by flattening control-room section bodies and embedded panels
- anchored the context rail more clearly so it behaves like support context instead of another competing content column
- strengthened the active sidebar state and tightened summary surfaces so the layout reads more like one operating environment
- rebuilt the staging-ready admin-console bundle with `runtime-config.cognito.staging.js`

## Success Criteria

This track is successful when:

- operators can move between sidebar workspaces without feeling lost
- the main canvas stops presenting everything at once
- account state feels focused instead of repeated
- the right rail becomes useful context instead of duplicate navigation
- the control-room shell finally feels structurally true, not just visually themed
