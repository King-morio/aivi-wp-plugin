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
