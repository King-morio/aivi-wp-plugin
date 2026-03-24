# Changelog

All notable public-facing changes to the **AiVI - AI Visibility Inspector** WordPress plugin are documented in this file.

This changelog is intentionally written for the public plugin surface. It excludes private operator systems, internal phase labels, and backend-only implementation details that do not belong in the public repository.

## [Unreleased]

### Documentation Expansion

- added a dedicated documentation set for the public plugin surface:
  - `USER_GUIDE.md`
  - `CHECK_REFERENCE.md`
  - `TROUBLESHOOTING.md`
  - `PRIVACY.md`
  - `TERMS_OF_SERVICE.md`
  - `SUPPORT.md`
  - `DEVELOPMENT.md`
  - `ARCHITECTURE.md`
  - `OPERATIONS.md`
- added a first-class `Documentation` settings tab that renders the bundled guides inside WordPress
- refreshed the public README and contributing guide to match the current plugin workflow

### Analysis and Editor Experience

- refined intro extraction, answer-family behavior, heading-fragmentation behavior, and freshness handling in the current plugin runtime
- improved stale-result invalidation and article-level supersession behavior
- improved overlay draft compatibility checks for reruns and changed content
- redesigned the analysis progress card and refreshed live analysis microcopy inside the editor sidebar

### Settings and UI Polish

- polished the Overview, Plans, Credits, Connection, and Support settings surfaces
- tightened the plans spotlight layout
- improved Credits tab card design and connection guidance presentation
- removed dormant debug-style controls from the visible sidebar UI

### Public Repository and Packaging

- added a public snapshot export workflow and allowlist-based publishing path
- kept the public repository limited to plugin-safe runtime code, tests, docs, and packaging helpers
- preserved the release ZIP packaging allowlist so only WordPress runtime files ship in plugin packages

## [1.0.12] - 2026-03-25

### Schema Insert Conflict Hardening

- hardened schema insertion so AiVI now checks existing editor and rendered-page schema before inserting new JSON-LD
- added safer insert outcomes across the overlay experience so schema assists can append, replace one clear AiVI-managed block, skip exact matches, or switch to copy-only when another schema source already exists
- improved schema-assist release messaging so the editor clearly shows whether AiVI is ready to insert, ready to replace, already present, or blocked by an external conflict

### Editor and Release Safety

- preserved duplicate awareness across reruns and later editing sessions by carrying stronger schema-assist identity metadata and conflict-policy hints through the release path
- kept the overlay draft compatibility and serializer release layers aligned so conflict-aware schema assists stay stable across worker and orchestrator output
- shipped the new overlay review states without adding a heavy schema management panel

## [1.0.11] - 2026-03-24

### Structural Detection and Deterministic Guidance

- improved ItemList detection so strong visible lists under real headings and heading-like section labels no longer get missed as schema candidates
- added a deterministic heading-markup check for bolded or otherwise heading-like text that should use real heading tags
- kept structural release behavior cleaner across sidebar and overlay surfaces for the new heading-markup and ItemList findings

### PayPal Retry Recovery

- restored failed or cancelled PayPal free-trial activation attempts back to a true retry-ready state from the return path when the provider confirms a terminal status
- cleared the stale blocked-plan messaging path so guarded plan cards show the right local explanation instead of the misleading billing-not-ready error
- preserved the existing free-trial access while removing the stuck `Wait for activation` state for retry-ready customers

## [1.0.10] - 2026-03-24

### Semantic Opportunity Governance and Release Stability

- taught opportunity-style semantic checks clearer pass shapes, non-trigger rules, and contrastive examples so they stop overreaching on acceptable content formats
- hardened shared structural truth for visible lists, pseudo-lists, question-led sections, FAQ candidacy, and procedural signals
- added worker-side semantic guardrails so list, FAQ, and HowTo opportunities respect structural evidence before release
- collapsed duplicate cross-block semantic releases into one canonical issue in sidebar, details, and overlay surfaces

### Billing and Deterministic Review Continuity

- preserved the recent PayPal pending-subscription safety fixes and deterministic review ownership cleanup in the current release package
- kept deterministic guidance, schema checks, and machine-readable release behavior aligned across worker and orchestrator paths

## [1.0.9] - 2026-03-23

### Billing Activation and Retry Safety

- kept customers on their existing trial or active plan until PayPal confirms subscription activation
- cleared failed or cancelled pending subscription attempts back into a retry-ready state
- improved billing status handling so stale "waiting for PayPal" states clear more reliably after failure or cancellation

### Check Ownership and Deterministic Guidance

- removed deterministic-owned checks from the AI analyzer surface so semantic analysis stays focused on judgment-heavy review
- retired the fake intro composite check and redistributed intro ownership and scoring cleanly
- expanded deterministic guidance coverage and added stronger machine-readable schema checks for article pages and strong visible lists

## [1.0.8] - 2026-03-06

### Packaging and Release Hygiene

- aligned plugin and package metadata on version `1.0.8`
- added a release packaging allowlist so infrastructure files, temp artifacts, and non-runtime files do not ship in the plugin ZIP
- cleaned the release candidate surface before packaging

### Security and Runtime Hardening

- removed unnecessary client-side runtime exposure for backend-related configuration
- tightened token and runtime handling used by analysis-result flows
- improved packaging and repository hygiene around local artifacts

### Editor and Runtime Refinements

- improved the analysis sidebar experience for the current `1.0.8` baseline
- preserved overlay/editor behavior while tightening release discipline and package boundaries
