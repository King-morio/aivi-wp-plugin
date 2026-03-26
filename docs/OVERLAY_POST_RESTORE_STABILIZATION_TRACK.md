## Purpose

Stabilize the restored overlay editor after rolling back to the last known-good UI package.

This track is intentionally narrow. It exists to avoid mixing:

- the restored overlay shell/layout
- the `View details` toggle regression
- the later reintroduction of rail-side schema/document actions

## Scope

Only handle these in order:

1. restore correct details hide/show behavior in the review rail
2. verify the restored overlay remains visually stable after that fix
3. then evaluate which schema/document actions from the earlier rule-reconciliation work should be reintroduced safely

Do not use this track to redesign the overlay again.

## Current Diagnosis

### 1. `View details` / `Hide details` is broken because of CSS

The rail renderer correctly toggles:

- `details.hidden = true`
- `details.hidden = nextHidden`

But the restored CSS still forces the container visible with:

- `.aivi-overlay-review-details { display: flex; ... }`

and is missing:

- `.aivi-overlay-review-details[hidden] { display: none !important; }`

So the DOM state changes, but the panel does not visually collapse.

### 2. Rail-side schema/metadata actions were backed out by the restore

The restore intentionally removed the plugin-side rail additions from the earlier `Check Rule Reconciliation and Overlay Actions Track`, including:

- metadata fill panel in rail details
- schema assist panel in rail details
- rail status box

Backend rule changes remain live, but the restored overlay no longer exposes those detail actions in the review rail.

That is acceptable for now, because the first priority is restoring the stable overlay UX.

## Milestones

### Milestone 1: Restore Details Toggle

Status:

- Complete locally on March 13, 2026.

Goal:

- make `View details` / `Hide details` behave correctly again without changing the restored overlay structure

Scope:

- add the missing hidden-state CSS rule for `.aivi-overlay-review-details`
- verify the rail detail section collapses by default and opens only on click

Acceptance:

- details are hidden initially
- clicking `View details` opens them
- clicking `Hide details` closes them
- no overlay layout regression

Verification completed:

- `node --check assets/js/aivi-overlay-editor.js`
- `tests/js/overlay-pass-filter-regression.test.js`
- `tests/js/overlay-prototype-parity-regression.test.js`
- `tests/js/overlay-redesign-regression.test.js`

### Milestone 2: Reconcile Rail Detail Actions

Status:

- Complete locally on March 13, 2026.

Goal:

- reintroduce only the rail-side schema and document actions that already have stable backend support, without disturbing the restored overlay shell

Scope:

- confirm the current restored overlay has no active schema/metadata detail panels
- compare against `CHECK_RULE_RECONCILIATION_AND_OVERLAY_ACTIONS_TRACK.md`
- restore rail detail actions only for checks whose backend payloads already ship `schema_assist`
- keep all actions hidden until `View details` is opened
- support these check families first:
  - `intro_schema_suggestion`
  - `faq_jsonld_generation_suggestion`
  - `howto_schema_presence_and_completeness`
  - `schema_matches_content`
  - `valid_jsonld_schema`
- support `semantic_html_usage` as generate + copy plan, and insert only if the backend explicitly marks it safe
- keep `metadata_checks` out of this milestone unless its fill-in UI is reintroduced as a separate, non-schema document panel
- keep the restored review-rail card structure intact:
  - summary first
  - `View details` / `Hide details`
  - `Jump to block`
  - detail body only after expand
- place schema actions inside the existing detail body, not in a new floating panel, modal, or always-visible card
- preserve the current restored interaction model:
  - no sticky schema controls
  - no always-open draft area
  - no changes to overlay shell, rail sizing, or card spacing beyond what the detail body needs
- treat the schema controls as subordinate actions:
  - first line explains the issue
  - then show generate/copy/insert controls only when the detail section is open
  - only reveal draft text after generation, or when a draft is already available in payload

Acceptance:

- action reintroduction is explicit and scoped
- no schema/document action chrome is visible before details are opened
- generate/copy/insert buttons appear only for checks whose backend payloads support them
- no re-entry into overlay shell/layout regressions
- `View details` / `Hide details` continues to collapse and expand normally after schema actions are added
- opening one schema-enabled detail section does not make buttons sticky, duplicated, or globally visible in other cards
- `Jump to block` continues to behave exactly as it does in the restored overlay
- schema controls inherit the existing rail visual language instead of introducing a second UI style

Implementation notes:

- This is mainly a frontend overlay task, but it depends on backend serializer/schema-draft support that already exists.
- Current backend support confirmed in serializer/draft builders for:
  - `intro_schema_suggestion`
  - `faq_jsonld_generation_suggestion`
  - `howto_schema_presence_and_completeness`
  - `schema_matches_content`
  - `valid_jsonld_schema`
  - `semantic_html_usage`
- The restored overlay currently still contains core schema-assist helper functions:
  - `resolveSchemaAssist(...)`
  - `stringifySchemaDraft(...)`
  - `isSchemaAssistInsertAllowed(...)`
  - `insertSchemaAssistIntoEditor(...)`
- What is missing is the rail-detail UI that exposes those actions after expand.
- Implementation approach to keep risk low:
  - reuse existing overlay helper functions for schema assist
  - add one compact rail-detail renderer for schema-enabled checks
  - avoid adding new global state beyond what the restored rail already uses
  - do not modify non-schema checks in this milestone

Verification completed:

- `node --check assets/js/aivi-overlay-editor.js`
- `tests/js/overlay-pass-filter-regression.test.js`
- `tests/js/overlay-prototype-parity-regression.test.js`
- `tests/js/overlay-redesign-regression.test.js`
- `tests/js/overlay-schema-assist.test.js`

## Files Likely To Change

- [aivi-overlay-editor.css](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/css/aivi-overlay-editor.css)
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [overlay-pass-filter-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-pass-filter-regression.test.js)

## Start Point

Start with Milestone 1.

Reason:

- the bug is isolated
- the fix is low risk
- it restores expected behavior without reopening the overlay redesign surface
