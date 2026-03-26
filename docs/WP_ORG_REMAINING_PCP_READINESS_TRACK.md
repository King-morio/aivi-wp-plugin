# WordPress.org Remaining PCP Readiness Track

## Goal
- eliminate the remaining PCP errors and warnings that block clean WordPress.org distribution readiness
- keep AiVI runtime behavior intact while making the packaged plugin look like a normal WordPress.org plugin

## Remaining PCP Buckets
- unexpected markdown files in plugin root
- `Domain Path` points to a missing `languages/` folder
- runtime plugin updater / update-routine modification hooks
- root `readme.md` is not WordPress.org-compatible

## Decisions
- remove the local update-blocking code from plugin runtime entirely
- move bundled in-plugin documentation out of plugin root instead of deleting the Documentation tab
- keep bundled docs inside the runtime package under a runtime-safe path
- convert the distribution readme to `readme.txt`

## Milestones

### M1 - Root Packaging Cleanup
- move bundled documentation markdown out of plugin root into a runtime-safe location
- update the Documentation tab loader to use the new file paths
- add a real `languages/` folder to the runtime package
- update package/public allowlists and diagnostics to match

Write set:
- [class-admin-settings.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php)
- [package-plugin-release.ps1](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tools/package-plugin-release.ps1)
- [public-repo-allowlist.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tools/public-repo-allowlist.json)
- [release-package-safety.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/release-package-safety.test.js)
- bundled documentation files
- new `languages/` runtime placeholder
- this track doc

### M2 - Remove Updater Runtime Hooks
- delete the WordPress update-blocking / transient override code from runtime
- keep `class-plugin.php` WordPress.org-safe

Write set:
- [class-plugin.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-plugin.php)
- related diagnostics if needed
- this track doc

### M3 - WordPress.org Readme Conversion
- replace root `readme.md` with a WordPress.org-ready `readme.txt`
- add `Tested up to`, `License`, and `Stable Tag`
- align the plugin name with the plugin header and remove the restricted `plugin` term from the display name

Write set:
- root readme
- package/public allowlists if needed
- this track doc

### M4 - Verification And Release Build
- run the focused diagnostics after the cleanup
- rebuild the plugin package
- verify the package reflects the cleaned root structure

Write set:
- focused validation notes
- this track doc

## Status
- [x] M1 - Root Packaging Cleanup
- [x] M2 - Remove Updater Runtime Hooks
- [x] M3 - WordPress.org Readme Conversion
- [x] M4 - Verification And Release Build

## M1 Outcome
- bundled Documentation tab markdown now lives under `includes/data/docs/` instead of plugin root
- the Documentation tab catalog was rewired to that runtime-safe path, so the in-plugin docs surface still works
- the root markdown files that PCP flagged are no longer present in plugin root
- a real `languages/` folder now exists in runtime with a placeholder `index.php`
- packaging and public snapshot allowlists were updated to reflect the new runtime-safe doc paths
- the rebuilt package now has this cleaner root shape:
  - `ai-visibility-inspector.php`
  - `assets/`
  - `includes/`
  - `languages/`
  - `LICENSE`
  - `CHANGELOG.md`
  - `readme.md`

Validation:
- `npm test -- --runInBand tests/diagnostics/release-package-safety.test.js tests/diagnostics/text-domain-guard.test.js tests/diagnostics/translators-comments-guard.test.js`
- `powershell -ExecutionPolicy Bypass -File .\\tools\\package-plugin-release.ps1`
- PHP lint passed for [class-admin-settings.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php)

## M2 Outcome
- removed the local update-blocking and WordPress.org request suppression logic from [class-plugin.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-plugin.php)
- runtime no longer registers:
  - `pre_site_transient_update_core`
  - `pre_site_transient_update_plugins`
  - other related transient/update suppression hooks
- this keeps the distributed plugin aligned with WordPress.org expectations instead of modifying core/plugin update routines at runtime

Validation:
- grep verification confirmed the flagged update-routine hook strings are gone from runtime
- PHP lint passed for [class-plugin.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-plugin.php)

## M3 Outcome
- replaced root `readme.md` with a WordPress.org-style [readme.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/readme.txt)
- aligned the readme display name to `AiVI - AI Visibility Inspector`
- added the missing distribution headers:
  - `Tested up to: 6.9.4`
  - `Stable tag: 1.0.17`
  - `License: GPLv2 or later`
  - `License URI: https://www.gnu.org/licenses/gpl-2.0.html`
- shortened the readme short description and removed the restricted `plugin` term from the readme display name
- packaging/public allowlists now point to `readme.txt` instead of `readme.md`

Validation:
- `npm test -- --runInBand tests/diagnostics/release-package-safety.test.js tests/diagnostics/text-domain-guard.test.js tests/diagnostics/translators-comments-guard.test.js`
- `powershell -ExecutionPolicy Bypass -File .\\tools\\package-plugin-release.ps1`
- verified rebuilt package root contains `readme.txt` and no longer contains `readme.md`

## M4 Outcome
- the focused WordPress.org readiness sweep passed after the remaining PCP cleanup work
- runtime/package safety now has explicit guards for:
  - text domain drift
  - translators comments on placeholder-bearing strings
  - packaged slug/readme/languages expectations
  - updater-hook regression in runtime
- plugin root no longer contains the markdown files PCP flagged
- rebuilt package still resolves to the canonical distribution artifact:
  - `dist/ai-visibility-inspector.zip`

Validation:
- `npm test -- --runInBand tests/diagnostics/release-package-safety.test.js tests/diagnostics/text-domain-guard.test.js tests/diagnostics/translators-comments-guard.test.js`
- `powershell -ExecutionPolicy Bypass -File .\\tools\\package-plugin-release.ps1`

Track status:
- complete
