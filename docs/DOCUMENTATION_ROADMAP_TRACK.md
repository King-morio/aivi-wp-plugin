# AiVI Documentation Roadmap Track

## Goal

Build a clean documentation set for AiVI that is public-facing, accurate to the current plugin shape, and useful to both end users and contributors without relying on internal-only plans or memory.

## Documentation Principles

- Keep the first documentation set practical, not bloated.
- Write public docs for real users first, then layer technical docs after that.
- Reflect the plugin as it exists now: WordPress plugin surface, managed backend integration, editor analysis workflow, settings experience, and contributor-safe packaging flow.
- Keep internal-only infrastructure, billing internals, control-plane systems, and private operator workflows out of the public documentation set.

## Screenshot Guidance

- The `USER_GUIDE.md` can be drafted as text first.
- I do **not** need screenshots to start writing it.
- Best workflow:
  - I draft the guide with explicit screenshot placeholders like `[Screenshot: Analyze button in Gutenberg sidebar]`
  - you add screenshots manually where needed
- This keeps writing unblocked and lets you use the exact latest UI when inserting visuals.

## Phase 1 — Core Public Docs

### M1 — README Baseline
- Confirm the public README stays aligned with the current plugin surface.
- Keep it focused on product overview, installation, setup, runtime flow, and contributor-safe development basics.

### M2 — User Guide
- Create `USER_GUIDE.md`.
- Cover:
  - where AiVI appears in the editor
  - how to run an analysis
  - how to read results in the sidebar
  - how the overlay/editor flow works
  - how to use settings tabs: Overview, Plans, Credits, Connection, Support
  - what to expect when rerunning analysis
- Add screenshot placeholders instead of blocking on visuals.

### M3 — Check Reference
- Create `CHECK_REFERENCE.md`.
- Cover:
  - each major check family
  - what it measures
  - what pass / partial / fail means
  - what is advisory vs what is surfaced as a real issue
  - common edge cases users may misread

### M4 — Troubleshooting Guide
- Create `TROUBLESHOOTING.md`.
- Cover:
  - stale result symptoms
  - overlay draft restore behavior
  - connection problems
  - rerun expectations
  - highlighting/jump-to-block limitations
  - when to refresh, when to reconnect, when to contact support

## Phase 2 — Trust, Policy, and Support Docs

### M5 — Privacy Policy
- Create `PRIVACY.md`.
- Cover:
  - what content/data is sent for analysis
  - what is stored and for how long at a high level
  - account/site data handling basics
  - public vs managed-service responsibilities
  -(My comment: Can we aksi add what info we capture for example admin email etc and how we use them and how they're stored? I have only mentioned admin email as an example. Cover any other info the plugin captures)

### M6 — Terms of Service
- Create `TERMS_OF_SERVICE.md`.
- Cover:
  - acceptable use
  - service scope
  - account responsibilities
  - availability and service changes
  - credit/plan boundaries at a high level
  - limitation/disclaimer language

### M7 — Support Guide
- Create `SUPPORT.md`.
- Cover:
  - how to request help
  - what to include in a useful support request
  - do not require normal users to provide run IDs manually; treat run references as support or internal context unless the product explicitly exposes them
  - safe debugging info to provide

## Phase 3 — Contributor and Technical Docs

### M8 — Development Guide
- Create `DEVELOPMENT.md`.
- Cover:
  - repository layout
  - plugin-safe public boundaries
  - test commands
  - packaging flow
  - how to work on the public plugin repo safely
- Status:
  - `DEVELOPMENT.md` drafted with current repo layout, contributor-safe boundaries, test commands, packaging guidance, and public plugin workflow notes.

### M9 — Architecture Overview
- Create `ARCHITECTURE.md`.
- Cover:
  - WordPress plugin responsibilities
  - managed backend relationship at a high level
  - analysis request lifecycle
  - sidebar and overlay output flow
  - public/private repo separation
- Status:
  - `ARCHITECTURE.md` drafted with the current plugin bootstrap flow, WordPress-side preflight and proxy responsibilities, editor/runtime layers, state model, and public/private repository split.

### M10 — Operations and Release Notes
- Create `OPERATIONS.md` and maintain `CHANGELOG.md`.
- Cover:
  - packaging/release basics
  - specimen-site verification expectations
  - public snapshot/public repo sync steps
- Status:
  - `OPERATIONS.md` drafted with packaging, release verification, public snapshot export, public repo sync, and post-release hygiene guidance.
  - `CHANGELOG.md` refreshed into a public-safe release notes format that matches the current plugin baseline and current unreleased work.

### M11 — Decision Log
- Create `DECISIONS.md`.
- Capture:
  - why major check-family rule changes happened
  - why public/private repo separation exists
  - why certain UI/runtime behaviors work the way they do
- Status:
  - `DECISIONS.md` drafted as an adopted-decision log covering the major rule, UI/runtime, artifact-retention, and public-repo choices that now define the current AiVI plugin surface.

## Recommended Execution Order

1. `M2 — User Guide`
2. `M3 — Check Reference`
3. `M4 — Troubleshooting Guide`
4. `M5 — Privacy Policy`
5. `M6 — Terms of Service`
6. `M7 — Support Guide`
7. `M8 — Development Guide`
8. `M9 — Architecture Overview`
9. `M10 — Operations and Release Notes`
10. `M11 — Decision Log`

## Status

- [x] M1 — README Baseline
- [x] M2 — User Guide
- [x] M3 — Check Reference
- [x] M4 — Troubleshooting Guide
- [x] M5 — Privacy Policy
- [x] M6 — Terms of Service
- [x] M7 — Support Guide
- [x] M8 — Development Guide
- [x] M9 — Architecture Overview
- [x] M10 — Operations and Release Notes
- [x] M11 — Decision Log
