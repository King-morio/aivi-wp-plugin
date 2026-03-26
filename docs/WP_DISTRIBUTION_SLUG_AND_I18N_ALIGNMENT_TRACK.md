# WordPress Distribution Slug And I18n Alignment Track

## Goal
- align AiVI's WordPress distribution slug, package/install shape, and i18n identity around one canonical value
- eliminate `WordPress.WP.I18n.TextDomainMismatch` noise before WordPress.org distribution review

## Canonical Decision
- canonical plugin slug: `ai-visibility-inspector`
- canonical text domain: `ai-visibility-inspector`

## Diagnosis
- the codebase already consistently uses `ai-visibility-inspector` in translation calls and plugin header metadata
- the mismatch is coming from the current package/install identity still using `AiVI-WP-Plugin`
- PCP is therefore inferring the expected text domain from the plugin slug/install shape instead of from AiVI's intended canonical domain

## Guardrails
- do not mass-replace working translation calls to `AiVI-WP-Plugin`
- do not let private repo folder naming dictate the public WordPress slug
- normalize the distribution/install surface instead of rewriting hundreds of i18n calls
- keep changes surgical and focused on WordPress distribution correctness

## Milestones

### M1 - Canonical Slug Decision
- lock the canonical WordPress slug and text domain as `ai-visibility-inspector`
- record that decision in this track so the remaining fixes have one stable target

Write set:
- this track doc

### M2 - Distribution And Packaging Normalization
- change release packaging so the installable plugin root folder is `ai-visibility-inspector`
- align ZIP/package naming and stage roots with the canonical WordPress slug where it affects install identity
- keep private repo naming untouched unless it directly affects distribution behavior

Write set:
- [package-plugin-release.ps1](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tools/package-plugin-release.ps1)
- related release/package diagnostics
- any packaging docs that describe the install root or release ZIP behavior
- this track doc

### M3 - I18n Bootstrap Hardening
- keep `Text Domain: ai-visibility-inspector`
- add `Domain Path: /languages`
- add or verify `load_plugin_textdomain(...)`
- ensure the bootstrap metadata and runtime i18n boot path are WordPress.org-ready

Write set:
- [ai-visibility-inspector.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/ai-visibility-inspector.php)
- any runtime i18n bootstrap helpers if needed
- related diagnostics/tests
- this track doc

### M4 - PCP And Distribution Verification Sweep
- run the focused diagnostics after the slug/package/i18n alignment changes
- verify the packaged plugin installs under the canonical slug shape
- confirm the text domain mismatch is resolved in the intended distribution path

Write set:
- focused tests and validation notes
- this track doc

## Status
- [x] M1 - Canonical Slug Decision
- [x] M2 - Distribution And Packaging Normalization
- [x] M3 - I18n Bootstrap Hardening
- [x] M4 - PCP And Distribution Verification Sweep

## M1 Outcome
- canonical WordPress slug is now locked as `ai-visibility-inspector`
- canonical text domain is now locked as `ai-visibility-inspector`
- the fix direction is therefore:
  - keep the existing translation domain
  - normalize package/install identity around that domain
  - avoid a high-risk mass replacement of translation calls

## M2 Outcome
- the release packaging script now emits the canonical WordPress distribution identity:
  - package name: `ai-visibility-inspector`
  - install root folder: `ai-visibility-inspector`
- release/package diagnostics were updated so the package safety contract now expects that canonical slug instead of the old repo-shaped install root
- contributor-facing release docs now describe the canonical installable ZIP path as `dist/ai-visibility-inspector.zip`

## M3 Outcome
- the plugin bootstrap now advertises the canonical i18n discovery path with:
  - `Text Domain: ai-visibility-inspector`
  - `Domain Path: /languages`
- bootstrap now explicitly loads plugin translations through `aivi_load_textdomain()` on `plugins_loaded`
- the release safety diagnostic now locks the full bootstrap i18n contract so future packaging/i18n work cannot drift silently

## M4 Outcome
- the packaged WordPress distribution artifact was rebuilt and verified at:
  - `dist/ai-visibility-inspector.zip`
- the fresh extracted install root now matches the canonical WordPress slug:
  - `ai-visibility-inspector/`
  - `ai-visibility-inspector/ai-visibility-inspector.php`
- the extracted packaged bootstrap now contains the expected i18n/distribution contract:
  - `Text Domain: ai-visibility-inspector`
  - `Domain Path: /languages`
  - `aivi_load_textdomain()`
  - `load_plugin_textdomain('ai-visibility-inspector', ...)`
- the focused release safety diagnostic passed after the packaging normalization and i18n bootstrap changes
- exact PCP rerun could not be executed in this local WordPress environment because the `plugin-check` plugin is not installed
- the currently active local development install still lives under the repo-shaped folder `AiVI-WP-Plugin`, so final PCP confirmation should be run against the packaged/install slug shape rather than that private dev folder

Track status:
- complete
