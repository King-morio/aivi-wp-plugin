# AiVI Architecture Overview

This document explains the current high-level architecture of the **AiVI - AI Visibility Inspector** WordPress plugin.

It focuses on the plugin surface and its managed backend relationship without exposing private operator infrastructure.

## Architecture Goals

AiVI is designed to do three things well:

- extract and normalize editor content inside WordPress
- send structured analysis requests to a managed AiVI backend
- render actionable findings back inside the editor and admin UI

The plugin is intentionally opinionated about what belongs in WordPress and what belongs outside it.

## Core Layers

At a high level, AiVI is split into four layers:

1. **WordPress plugin bootstrap and runtime**
2. **WordPress-side extraction and REST surface**
3. **Managed AiVI backend**
4. **Editor and settings UI**

## 1. WordPress Plugin Bootstrap and Runtime

The plugin entrypoint is:

- `ai-visibility-inspector.php`

The main runtime class is:

- `includes/class-plugin.php`

That class is responsible for:

- loading plugin dependencies
- registering admin and editor integrations
- registering WordPress REST controllers
- applying local HTTP hardening in local development environments

The plugin loads these major runtime components:

- `includes/class-admin-settings.php`
- `includes/class-admin-menu.php`
- `includes/class-assets.php`
- `includes/class-editor-sidebar.php`
- `includes/class-rest-preflight.php`
- `includes/class-rest-analyze.php`
- `includes/class-rest-rewrite.php`
- `includes/class-rest-ping.php`
- `includes/class-rest-backend-proxy.php`
- `includes/class-rest-document-meta.php`
- `includes/class-rest-plugin-settings.php`

This gives AiVI a single WordPress-native runtime surface for editor features, settings, and managed-backend communication.

## 2. WordPress-Side Extraction and REST Surface

AiVI does not send editor content blindly. It performs WordPress-side preparation before deeper analysis.

### Preflight

The preflight controller lives in:

- `includes/class-rest-preflight.php`

Its responsibilities include:

- validating that content exists
- estimating token load
- extracting plain text and metadata
- building the `manifest`
- detecting basic deterministic conditions like:
  - H1 count
  - JSON-LD presence
  - internal links
- generating a `block_map` for later anchoring and navigation

The `block_map` is especially important because it gives later findings a stable reference surface for:

- jump-to-block behavior
- highlight anchoring
- content-type awareness for Gutenberg vs Classic-style content

### Managed Backend Proxy

The managed backend proxy controller lives in:

- `includes/class-rest-backend-proxy.php`

This layer is the plugin’s bridge to the managed AiVI service.

It proxies and normalizes:

- connectivity checks
- analysis dispatch
- async run polling
- deferred details/raw requests
- account summary and onboarding flows
- connection and disconnect flows
- billing-related site requests

In architectural terms, the proxy layer exists so the editor UI talks to WordPress REST routes, while WordPress handles:

- capability checks
- request sanitization
- site identity packaging
- backend URL resolution
- API header construction
- fallback behavior when the managed service is unavailable

### Document Metadata and Plugin Settings

Additional runtime controllers support the editor experience directly:

- `includes/class-rest-document-meta.php`
- `includes/class-rest-plugin-settings.php`

These routes handle:

- title, meta description, canonical URL, and language storage
- web lookup operational settings

This keeps document-level editorial metadata and plugin operational settings inside WordPress instead of pushing everything into the remote service.

## 3. Managed Backend Relationship

The managed backend is intentionally outside the public plugin surface, but the plugin is built around it.

At a high level, the managed service is responsible for:

- deeper deterministic and model-assisted analysis
- async run orchestration
- structured summaries and details payloads
- overlay/review payload generation
- managed account, plan, and connection responses

The WordPress plugin is responsible for collecting and shaping requests, then rendering the returned results safely.

That division matters because it keeps:

- WordPress focused on editor integration and safe local state
- the managed backend focused on heavier analysis and orchestration

## 4. Editor and Settings UI

### Asset Registration

The plugin registers editor/admin assets in:

- `includes/class-assets.php`

That class:

- registers JS and CSS assets
- localizes runtime config into `AIVI_CONFIG`
- exposes the WordPress REST base, nonces, account state, feature flags, and check-category map

This localized configuration is the bridge between PHP state and the in-browser editor runtime.

### Sidebar and Analysis UI

The main editor runtime lives in:

- `assets/js/aivi-sidebar.js`

This script handles:

- Gutenberg sidebar registration
- Classic Editor meta box UI mounting
- preflight submission
- async analysis dispatch
- run polling
- findings rendering
- details requests
- stale-result handling
- progress microcopy and loader states
- review rail and result grouping

### Overlay Review and Editing

The guided review/editor overlay lives in:

- `assets/js/aivi-overlay-editor.js`

This layer is responsible for:

- overlay draft storage
- overlay compatibility checks
- review/edit state handling
- local browser draft restoration rules

The overlay works alongside the sidebar rather than replacing it. The sidebar is the analysis and findings surface; the overlay is the focused editing surface.

### Settings and Account Surfaces

The AiVI settings/admin experience is centered in:

- `includes/class-admin-settings.php`

This area manages:

- Overview
- Plans
- Credits
- Connection
- Support
- Documentation

It also stores and normalizes key WordPress-side operational data such as:

- backend URL overrides
- account state
- dashboard summary state
- connection status
- credits usage rollups
- preferred contact email
- site identity payload
- feature flags

## Analysis Request Lifecycle

From the plugin’s point of view, a normal analysis follows this path:

1. The editor UI gathers current post content and metadata.
2. WordPress preflight builds a manifest and block map.
3. The plugin sends the analysis request through the backend proxy.
4. The managed backend returns a run ID and accepts async processing.
5. The sidebar polls run status through WordPress.
6. AiVI renders the returned report, issue groupings, and review state.
7. Deferred details are requested on demand when the user expands a finding.

This flow is intentionally async because the deeper analysis stage is heavier than a normal WordPress request cycle should try to complete inline.

## State and Storage Model

AiVI uses several different state layers, each with a different role.

### WordPress options

Stored in WordPress options:

- plugin settings
- operational settings
- connection state
- account/dashboard state
- local usage rollups

### Post-level state

Stored per post:

- title
- meta description
- canonical URL
- language

### Browser-local state

Stored in the browser:

- overlay draft data
- compatibility metadata tied to post/run/content state
- transient UI state for the current editor session

### Managed service state

Stored or computed outside the plugin:

- analysis runs
- deferred details payloads
- managed account responses
- heavier analysis orchestration

This split helps AiVI keep the editor responsive while still supporting deeper analysis workflows.

## Gutenberg and Classic Editor Support

AiVI supports both major editing contexts:

- Gutenberg via the sidebar/plugin runtime
- Classic Editor via a side meta box

The underlying analysis logic aims to stay consistent across both, but the rendering surfaces are different.

That is why the plugin keeps:

- extraction logic aware of Gutenberg and Classic structures
- block mapping aware of different content shapes
- UI logic defensive about editor APIs and availability

## Public and Private Repository Separation

AiVI’s public plugin repo is intentionally narrower than the full product.

Public plugin scope includes:

- plugin runtime code
- editor assets
- contributor-safe tests
- packaging helpers
- public documentation

Private/internal scope stays out of the public plugin repo, including:

- control-plane and operator applications
- managed backend implementation details
- deployment tooling tied to private infrastructure
- private billing/auth/provider internals

That separation protects both contributors and the product:

- contributors get a cleaner plugin-focused repository
- private service internals stay out of public version control

## Design Principle Behind the Architecture

AiVI works best when each layer does one job well:

- WordPress knows the editor and site context
- preflight shapes clean analysis input
- the managed backend performs deeper analysis
- the sidebar and overlay turn results into usable editorial actions

That division is what keeps the system understandable, maintainable, and safe to evolve over time.
