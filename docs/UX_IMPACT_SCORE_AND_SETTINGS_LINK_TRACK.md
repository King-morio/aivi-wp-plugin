# UX Impact, Score, And Settings Link Track

Last updated: 2026-03-25

## Purpose

Ship the approved `Option A - Calm Editorial` UX improvements without widening into a larger redesign.

This track covers only:

- review-rail impact pills
- global score quality pill
- banded AEO / GEO ring colors
- settings CTA landing cleanup

## Guardrails

- keep this UI-only unless a tiny serializer payload adjustment is absolutely required
- do not add visible confidence scores
- do not add AEO / GEO quality pills in the first rollout
- use the existing settings tab-routing model instead of inventing a second navigation path
- if a file outside a milestone write set becomes necessary, amend this track first

## M1 - Review Rail Impact Pills

**Status:** Complete

**Goal**

Add `High impact`, `Recommended`, and `Polish` pills to surfaced non-pass issue rows in the sidebar review rail.

**Planned write set**

- `assets/js/aivi-sidebar.js`
- `tests/js/sidebar-score-ui-regression.test.js`
- `tests/js/frontend.test.js`

**Acceptance**

- pills appear only for surfaced non-pass issues
- pill sits at the far end of the issue row
- instance count stays visually secondary

**Outcome**

- the sidebar now replaces the generic `Needs review` badge with the approved impact pills
- impact tiers are resolved client-side from:
  - aligned raw check severity / impact when available
  - a small check-aware fallback heuristic when summary payloads stay compact
- no serializer changes were needed for this milestone

**Validation**

- `node --check assets/js/aivi-sidebar.js`
- `npm.cmd test -- --runInBand tests/js/sidebar-score-ui-regression.test.js`
- `npm.cmd test -- --runInBand tests/js/frontend.test.js`

## M2 - Global Score Pill And Ring Bands

**Status:** Complete

**Goal**

Add one global score quality pill and switch AEO / GEO active ring strokes to simple percentage-band colors.

**Planned write set**

- `assets/js/aivi-sidebar.js`
- `tests/js/sidebar-score-ui-regression.test.js`
- `tests/js/frontend.test.js`

**Acceptance**

- global hero score shows one quality pill only
- pill sits below the AEO / GEO mini row and above `Last run`
- AEO and GEO rings use percentage-band colors:
  - `0-24%`
  - `25-49%`
  - `50-74%`
  - `75-100%`

**Outcome**

- the global hero score now shows one qualitative pill:
  - `Fair`
  - `Good`
  - `Excellent`
- the pill sits in the approved position between the mini `AEO / GEO` row and the `Last run` line
- AEO and GEO active ring strokes now use simple percentage-band colors while the neutral track stays unchanged
- no extra pills were added to the AEO or GEO circles in this first rollout

**Validation**

- `node --check assets/js/aivi-sidebar.js`
- `npm.cmd test -- --runInBand tests/js/sidebar-score-ui-regression.test.js`
- `npm.cmd test -- --runInBand tests/js/frontend.test.js`

## M3 - Settings CTA Landing Cleanup

**Status:** Complete

**Goal**

Fix internal settings hyperlinks so they land directly on the correct destination tab or panel.

**Planned write set**

- `includes/class-admin-settings.php`
- `tests/diagnostics/admin-console-ui-contract.test.js`
- `tests/diagnostics/billing-dashboard-controls.test.js`

**Acceptance**

- `Choose your plan` lands on the Plans tab and the plan grid
- other internal settings CTAs are reviewed and corrected if needed
- no extra back-and-forth routing remains inside AiVI settings

**Outcome**

- the broken `Choose your plan` CTA now uses a real billing-tab URL with the plan-grid anchor instead of a raw cross-tab fragment
- the existing settings router now honors valid in-tab hashes after switching tabs, so future internal settings deep links can land on the right section directly
- the rest of the audited settings tab, support, and documentation links were already following the correct tab-state model and did not need changes

**Validation**

- `npm.cmd test -- --runInBand tests/diagnostics/billing-dashboard-controls.test.js`
- `php -l includes/class-admin-settings.php`

## M4 - Focused Regression Sweep

**Status:** Complete

**Goal**

Prove the UX changes landed cleanly without widening scope.

**Planned write set**

- `docs/UX_IMPACT_SCORE_AND_SETTINGS_LINK_TRACK.md`

**Validation set**

- `tests/js/sidebar-score-ui-regression.test.js`
- `tests/js/frontend.test.js`
- `tests/diagnostics/admin-console-ui-contract.test.js`
- `tests/diagnostics/billing-dashboard-controls.test.js`

**Outcome**

- the focused UX sweep passed without needing extra runtime patching
- the sidebar score and impact-pill updates held cleanly
- the settings CTA routing cleanup held cleanly
- the public snapshot mirror tests also stayed green

**Validation**

- `npm.cmd test -- --runInBand tests/js/sidebar-score-ui-regression.test.js tests/js/frontend.test.js tests/diagnostics/admin-console-ui-contract.test.js tests/diagnostics/billing-dashboard-controls.test.js`

## Done Definition

This track is complete when:

- the review rail shows the approved impact pills
- the global score card shows the approved quality pill
- AEO / GEO rings use honest banded colors
- internal settings CTAs land on the right destination directly
- the focused regression set passes
