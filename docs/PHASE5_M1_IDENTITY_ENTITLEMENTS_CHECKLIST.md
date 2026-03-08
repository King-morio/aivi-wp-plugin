# Phase 5 Milestone 1 Checklist

Updated: 2026-03-06

## Goal

Build the identity, site-connection, and entitlement foundation without destabilizing the working Phase 4 analyzer flow.

## Step 1 - Shared contract and local connection scaffolding

### Files

- `infrastructure/lambda/shared/schemas/account-entitlement-contract-v1.json`
- `includes/config.php`
- `includes/class-admin-settings.php`
- `includes/class-assets.php`

### Tasks

- define a canonical account/site entitlement response contract
- add WordPress-side account-state option scaffolding
- add site identity payload builder for future connection handshakes
- localize only safe connection summary fields to the editor/admin UI

### Acceptance

- plugin has a stable normalized account-state shape
- no credentials or connection secrets are stored in browser payloads
- no analysis behavior changes yet

## Step 2 - WordPress proxy endpoints for account connection

### Files

- `includes/class-rest-backend-proxy.php`
- `includes/class-rest-ping.php`
- backend control-plane handlers when added

### Tasks

- add proxy route for account summary
- add proxy route for connect-site handshake
- add proxy route for disconnect/revoke state refresh if needed
- keep permission model at `edit_posts` for editor usage and `manage_options` for site-level connection actions

### Acceptance

- WordPress can request account summary through the existing proxy pattern
- WordPress can submit site registration payload safely

## Step 3 - Settings/admin connection UI

### Files

- `includes/class-admin-settings.php`
- `includes/class-admin-menu.php`

### Tasks

- add read-only account connection section
- show:
  - connection state
  - connected plan
  - site identity
  - last sync time
- keep existing backend config visible temporarily until account connection is ready

### Acceptance

- admin can see whether the site is connected without reading debug settings

## Step 4 - Editor/sidebar entitlement awareness

### Files

- `assets/js/aivi-sidebar.js`
- `assets/js/aivi-overlay-editor.js`
- `includes/class-assets.php`

### Tasks

- surface localized account connection summary in the editor
- block analysis only when the new entitlement state explicitly disallows it
- keep current backend-configured behavior as fallback until migration is complete

### Acceptance

- sidebar can distinguish disconnected vs connected-but-no-entitlement vs active plan

## Step 5 - Regression coverage

### Files

- `tests/js/`
- PHP tests if needed

### Tasks

- add tests for normalized account state
- add tests for localized safe payload fields
- add tests that analysis flow remains unchanged while connection scaffolding is inactive

### Acceptance

- Milestone 1 foundation can merge without changing analysis success paths
