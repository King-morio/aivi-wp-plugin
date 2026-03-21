# AiVI Development Guide

This guide covers the current development workflow for the **AiVI - AI Visibility Inspector** WordPress plugin.

It is written for contributors working on the plugin surface that powers the editor experience, settings pages, WordPress REST routes, packaging flow, and contributor-safe tests.

## Development Scope

AiVI has a broader product footprint than this plugin alone, but this guide stays focused on the WordPress plugin lane.

For development in this repository, treat these areas as the core public plugin surface:

- `ai-visibility-inspector.php` - plugin bootstrap and metadata
- `includes/` - runtime PHP classes, helpers, REST controllers, and admin integrations
- `assets/` - editor JavaScript, CSS, and UI runtime behavior
- `tests/js/` - frontend and editor regression coverage
- `tests/unit/` and `tests/integration/` - PHPUnit coverage for plugin-safe PHP logic
- `tools/package-plugin-release.ps1` - WordPress release packaging helper

If you are working from a fuller internal source tree, keep control-plane, billing, private backend, deploy, and operator-only systems out of public plugin changes unless they are strictly needed for packaging or contributor-safe documentation.

## Local Requirements

- WordPress `5.8+`
- PHP `7.4+`
- Node.js and npm
- Composer
- Git

## Local Setup

1. Clone the repository.
2. Install JavaScript dependencies:

   ```bash
   npm install
   ```

3. Install PHP development dependencies:

   ```bash
   composer install
   ```

4. Copy or symlink the plugin into a local WordPress install under `wp-content/plugins/`.
5. Activate **AiVI - AI Visibility Inspector** in WordPress admin.

## Repository Layout

The plugin is organized around a few predictable areas:

### Runtime plugin code

- `ai-visibility-inspector.php` - plugin header and bootstrap entrypoint
- `includes/class-plugin.php` - plugin wiring and runtime registration
- `includes/class-editor-sidebar.php` - editor integration and sidebar bootstrapping
- `includes/class-admin-settings.php` - settings pages, account surfaces, and admin UI
- `includes/class-rest-backend-proxy.php` - WordPress-to-managed-backend proxy routes
- `includes/class-rest-preflight.php` - WordPress-side extraction and preflight preparation
- `includes/class-rest-document-meta.php` - document metadata storage and retrieval
- `includes/class-rest-plugin-settings.php` - plugin setting routes such as web lookups

### Editor assets

- `assets/js/aivi-sidebar.js` - analysis sidebar, progress UI, and findings rendering
- `assets/js/aivi-overlay-editor.js` - overlay review and edit experience
- `assets/css/` - supporting styles for editor and overlay surfaces

### Test coverage

- `tests/js/` - Jest-based frontend and sidebar/overlay regressions
- `tests/unit/` - PHPUnit unit coverage
- `tests/integration/` - plugin integration coverage
- `tests/includes/` - shared PHP test helpers
- `tests/bootstrap.php` - PHPUnit bootstrap

### Build and packaging

- `package.json` - frontend dependencies and test scripts
- `composer.json` - PHP dependencies and PHPUnit scripts
- `phpunit.xml` - PHPUnit configuration
- `tools/package-plugin-release.ps1` - release ZIP packaging helper
- `bin/install-wp-tests.sh` - WordPress PHPUnit scaffold helper

## Public-Safe Development Boundaries

AiVI uses a managed backend for deeper analysis, but not every surrounding system belongs in the plugin surface or in a public plugin repository.

Keep plugin work focused on:

- editor UX
- settings and connection surfaces
- WordPress REST controllers
- extraction, metadata, and safe runtime behavior
- contributor-safe tests
- public documentation and packaging

Avoid adding or exposing:

- private deployment infrastructure
- operator-only admin or control-plane systems
- payment, Cognito, or super-admin internals that are not required for plugin operation
- environment inventories, replay dumps, temporary logs, or local scratch artifacts

If a change touches both public plugin behavior and private infrastructure, separate the plugin-safe portion from the private lane instead of blending them into one change.

## Daily Development Workflow

The safest contributor rhythm is:

1. Make a focused change in `includes/`, `assets/`, or plugin-safe tests.
2. Run the most relevant tests first.
3. Verify the affected WordPress screen or editor flow manually when possible.
4. Update docs when setup, behavior, or contributor workflow changes.
5. Package a fresh ZIP if you need a real installable plugin build for verification.

For UI work, always check the real WordPress interface before calling a change done. Narrow sidebars and admin card layouts often behave differently than standalone mockups.

## JavaScript Workflow

Frontend/editor work lives primarily in `assets/js/`.

Useful commands:

Run Jest:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Auto-fix lint issues when appropriate:

```bash
npm run lint:fix
```

Use targeted tests whenever possible before running a broader suite.

## PHP Workflow

PHP runtime work lives primarily in `includes/`.

Run PHPUnit:

```bash
vendor/bin/phpunit
```

Run the Composer test script:

```bash
composer test
```

If your local environment needs the WordPress PHPUnit scaffold helper:

```bash
bin/install-wp-tests.sh
```

For small PHP-only changes, a quick syntax check is still valuable even before the full suite:

```bash
php -l path/to/file.php
```

## Testing Strategy

Start with the smallest relevant validation:

- changed sidebar or overlay behavior -> targeted Jest tests in `tests/js/`
- changed PHP runtime behavior -> targeted PHPUnit coverage in `tests/unit/` or `tests/integration/`
- changed settings/admin UI -> sanity-check the real WordPress admin page
- changed packaging behavior -> run the packaging script and inspect the ZIP contents

Before release-oriented handoff, aim to cover:

- relevant automated tests
- real WordPress UI sanity check
- packaging success if the change affects the shipped plugin

## Manual Verification

Manual checks matter for AiVI because a lot of important behavior lives in real editor state:

- Gutenberg sidebar rendering
- Classic Editor meta box rendering
- settings tab layout and copy
- analysis progress states
- overlay editing behavior
- stale-result and rerun expectations

When verifying UI changes, use a real specimen article instead of only checking empty-state screens.

## Packaging a Release ZIP

To build the WordPress-ready release ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-plugin-release.ps1
```

The packaged ZIP is written to:

- `dist/AiVI-WP-Plugin.zip`

The packaging helper intentionally includes only the runtime files WordPress needs:

- plugin bootstrap
- `LICENSE`
- `readme.md`
- `assets/`
- `includes/`

Do not manually add debug artifacts, test output, local logs, or private infrastructure files to release ZIPs.

## Working Safely on the Public Plugin Repo

If you contribute through the public plugin repository, keep changes constrained to the plugin surface described in this guide.

That means:

- update plugin code, tests, and public docs
- avoid committing private implementation details that are not needed for public contributors
- keep the repo usable by someone who only has the WordPress plugin and not AiVI's private backend source tree

The public plugin repository should be understandable and buildable without requiring internal operator systems.

## Documentation Expectations

If your change affects setup, testing, packaging, or user-visible behavior, update the matching docs in the same change.

Important docs in this repo include:

- `readme.md`
- `CONTRIBUTING.md`
- `USER_GUIDE.md`
- `CHECK_REFERENCE.md`
- `TROUBLESHOOTING.md`
- `PRIVACY.md`
- `TERMS_OF_SERVICE.md`
- `SUPPORT.md`

## Release Handoff Checklist

Before handing off a plugin change for release or review, confirm:

- the code change is scoped and understandable
- relevant tests passed
- the affected WordPress screen was sanity-checked
- public docs were updated if needed
- the release ZIP packages cleanly when the change affects the shipped plugin

That discipline keeps the plugin easier to trust, easier to contribute to, and safer to publish.
