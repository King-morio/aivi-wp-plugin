# AiVI — AI Visibility Inspector WordPress Plugin

AI Visibility Inspector WordPress Plugin (AiVI) is a WordPress plugin for analyzing how content is likely to perform in answer-driven and AI-assisted search experiences. It combines deterministic preflight checks in WordPress with a managed AiVI backend that handles deeper analysis, structured reporting, and guided editing flows.

## Public Repository Scope

This public repository contains the WordPress plugin surface only:

- plugin runtime code
- editor UI assets
- contributor-safe tests
- packaging and build helpers

Internal operator systems and private infrastructure are intentionally excluded, including:

- control-plane and super-admin applications
- backend infrastructure and deployment code
- billing, PayPal, Cognito, and operator-only integrations
- internal runbooks, environment inventories, and debug artifacts

## What the Plugin Includes

- Editor analysis UI for both Gutenberg and Classic Editor
- Deterministic preflight extraction before backend analysis
- Async run polling, detailed findings, and review-rail rendering
- Overlay review/editing support for guided content fixes
- Document metadata support for title, meta description, canonical URL, and language
- Account-aware settings pages for Overview, Plans, Credits, Connection, and Support
- Safe packaging tooling for release ZIP creation

## How AiVI Works

At a high level, the plugin does four things:

1. extracts and normalizes the current post content in WordPress
2. runs preflight checks such as manifest/block-map generation and token estimation
3. sends the article to the managed AiVI backend through WordPress proxy routes
4. renders the returned report, details, and editing flows inside the editor UI

When the managed backend is unavailable, AiVI reports that state clearly instead of inventing speculative results.

## Installation

### Option 1 — Install from a release ZIP

1. Download the latest plugin ZIP.
2. In WordPress admin, go to **Plugins → Add New → Upload Plugin**.
3. Upload the ZIP and activate the plugin.

### Option 2 — Install from source

1. Clone this repository.
2. Copy or symlink it into your WordPress `wp-content/plugins/` directory.
3. Activate **AiVI - AI Visibility Inspector** in WordPress admin.

## First-Time Setup

1. Open **AiVI** in WordPress admin.
2. Review the settings tabs:
   - `Overview`
   - `Plans`
   - `Credits`
   - `Connection`
   - `Support`
3. On normal customer installs, leave **Backend URL** empty so AiVI uses the built-in production backend endpoint.
4. Use account connection, trial, plan, or credit flows as supported in your AiVI environment.
5. Enable **Web Lookups** only when you want external verification for source-sensitive checks.

### Important Configuration Notes

- **Backend URL** is primarily for staging, development, support overrides, or controlled troubleshooting.
- **AiVI API Key** is optional and environment-dependent.
- The plugin can store operational settings in WordPress options, but provider secrets and private infrastructure credentials are intentionally kept out of the public plugin surface.

## Using AiVI

### In Gutenberg

1. Open a post or page in the Block Editor.
2. Open the **AiVI Inspector** sidebar.
3. Start analysis from the sidebar.
4. Review findings, details, and guided editing actions.

### In Classic Editor

1. Open a post or page in the Classic Editor.
2. Use the AiVI meta box in the side column.
3. Run analysis and review the returned findings.

## WordPress-Side Runtime Surface

The current public plugin surface includes:

- plugin bootstrap in `ai-visibility-inspector.php`
- runtime PHP classes in `includes/`
- editor assets in `assets/`
- category map data in `includes/data/`
- contributor-safe tests in `tests/js/`, `tests/unit/`, and `tests/includes/`
- release packaging helper in `tools/package-plugin-release.ps1`

## Runtime Routes

AiVI registers WordPress REST routes under `aivi/v1`.

Public plugin routes include:

- `POST /wp-json/aivi/v1/preflight`
- `GET /wp-json/aivi/v1/backend/proxy_ping`
- `POST /wp-json/aivi/v1/backend/proxy_analyze`
- `GET /wp-json/aivi/v1/backend/proxy_run_status/<run_id>`
- `POST /wp-json/aivi/v1/backend/analysis-details`
- `POST /wp-json/aivi/v1/backend/analysis-raw`
- `GET|POST /wp-json/aivi/v1/settings/web-lookups`
- `GET|POST /wp-json/aivi/v1/document-meta/<post_id>`

Additional account, connection, and billing-related proxy routes are part of the plugin runtime, but the internal backend implementations behind them are intentionally not part of this public repository.

## Development

### Requirements

- WordPress `5.8+`
- PHP `7.4+`
- Node.js and npm for frontend tests
- Composer for PHPUnit dependencies

### Local Development

1. Clone the repository.
2. Install JavaScript dependencies:

   ```bash
   npm install
   ```

3. Install PHP development dependencies:

   ```bash
   composer install
   ```

4. Activate the plugin in a local WordPress install.

### Running Tests

Run frontend tests:

```bash
npm test
```

Run PHPUnit:

```bash
vendor/bin/phpunit
```

Install the WordPress PHPUnit scaffold when needed:

```bash
bin/install-wp-tests.sh
```

### Packaging a Release ZIP

From the plugin root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-plugin-release.ps1
```

This creates a WordPress-ready release ZIP that includes only the runtime files needed by the plugin package.

## Security and Privacy Notes

- Runtime routes enforce WordPress capability checks where appropriate.
- The plugin sanitizes and validates user-provided settings and request payloads.
- The public repository does not include private backend infrastructure, deploy scripts, or operator-only credentials.
- Customer sites may store operational plugin settings such as backend overrides or an optional AiVI API key, depending on environment needs.

## Contributing

See `CONTRIBUTING.md` for contributor workflow, coding expectations, and testing guidance.

## Changelog

See `CHANGELOG.md` for release history.

## License

GPLv2 or later — see `LICENSE`.
