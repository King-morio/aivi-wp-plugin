# Contributing to AiVI

Thanks for your interest in contributing to **AiVI — AI Visibility Inspector**.

This public repository is the WordPress plugin surface for AiVI. It includes the plugin runtime, editor assets, contributor-safe tests, and packaging helpers. Private operator systems, backend infrastructure, billing internals, and control-plane code are intentionally excluded.

## Before You Start

Please keep contributions aligned with the public plugin scope:

- WordPress plugin runtime
- editor UX and admin settings UI
- plugin-safe tests
- packaging and contributor tooling
- documentation for public contributors and users

Do not add private infrastructure, deploy secrets, internal runbooks, or operator-only systems to this repo.

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

4. Add the plugin to a local WordPress install.
   - You can copy it into `wp-content/plugins/`
   - or symlink it during development

5. Activate **AiVI - AI Visibility Inspector** in WordPress admin.

## Project Shape

The public repo is centered around these areas:

- `ai-visibility-inspector.php` — plugin bootstrap
- `includes/` — runtime PHP classes and REST controllers
- `assets/` — editor JS/CSS
- `tests/js/` — frontend and sidebar/overlay regressions
- `tests/unit/` — PHPUnit coverage for public plugin logic
- `tools/package-plugin-release.ps1` — WordPress release packaging helper

## Contribution Guidelines

### Keep changes public-safe

This repository is public. Please avoid adding:

- private API credentials or tokens
- internal environment details that are not needed by contributors
- control-plane, Cognito, PayPal, super-admin, or deploy-only code paths
- debugging dumps, replay artifacts, or local scratch files

### Prefer focused changes

- keep pull requests small and reviewable
- fix root causes where possible
- avoid unrelated refactors in the same change
- update docs when behavior or setup changes

### Respect the current plugin behavior

The plugin currently relies on a managed AiVI backend for deeper analysis. Public-repo changes should improve the plugin surface without assuming private backend code is present in this repository.

That means:

- UI and REST changes should fail clearly when backend functionality is unavailable
- tests in this repo should stay runnable without private infrastructure
- public documentation should describe the plugin honestly and avoid internal-only implementation details

## Coding Expectations

### PHP

- follow WordPress coding patterns
- sanitize inputs and escape outputs
- keep REST permissions explicit
- prefer small, readable methods over large multi-purpose ones

### JavaScript

- keep Gutenberg and Classic Editor behavior consistent where the plugin supports both
- write UI changes defensively
- preserve clear user feedback for loading, failure, and success states

### CSS

- keep styles readable and restrained
- optimize for clarity inside narrow WordPress sidebars and admin layouts
- avoid visual changes that only work in one editor context

## Testing

Run frontend tests:

```bash
npm test
```

Run PHPUnit:

```bash
vendor/bin/phpunit
```

If you need the WordPress PHPUnit scaffold helper:

```bash
bin/install-wp-tests.sh
```

Before opening a PR, at minimum:

- run the tests relevant to your change
- verify the plugin still loads in WordPress
- sanity-check any editor UI changes in the real interface when possible

## Packaging

To build a WordPress-ready plugin ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-plugin-release.ps1
```

## Pull Requests

Please include:

- a clear summary of what changed
- why the change was needed
- what you tested
- screenshots for UI changes when relevant

If your change updates public-facing setup, behavior, or contributor workflow, please update `readme.md` or other public docs in the same PR.

## Security

- never commit secrets
- never commit private infrastructure details that do not belong in a public plugin repo
- use capability checks and nonce protection where appropriate
- keep failure modes explicit rather than silent

## License

By contributing, you agree that your contributions will be licensed under the same GPLv2-or-later terms used by this project.
