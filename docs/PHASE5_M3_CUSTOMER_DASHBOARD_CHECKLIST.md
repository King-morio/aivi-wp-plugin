# Phase 5 Milestone 3 Checklist

Updated: 2026-03-06

## Goal

Turn the AiVI WordPress admin/settings area into a customer-facing account dashboard without exposing raw infrastructure controls or destabilizing the working analysis flow.

## Step 1 - Dashboard contract and view-model scaffold

### Files

- `infrastructure/lambda/shared/schemas/account-dashboard-contract-v1.json`
- `includes/class-admin-settings.php`
- `includes/class-assets.php`

### Tasks

- define the canonical dashboard payload shape for:
  - account summary
  - plan summary
  - credit summary
  - subscription status
  - recent usage summary
  - support/help links
- add WordPress-side dashboard view-model normalization helpers
- keep this step read-only: no billing actions or plan mutation yet

### Acceptance

- dashboard data has one canonical contract
- WordPress has a single safe place to normalize dashboard state
- no customer-visible behavior changes yet

## Step 2 - Backend account dashboard summary endpoint

### Files

- `infrastructure/lambda/orchestrator/account-summary-handler.js`
- `infrastructure/lambda/orchestrator/index.js`
- `includes/class-rest-backend-proxy.php`
- `includes/config.php`

### Tasks

- add a backend summary handler that returns:
  - plan name
  - subscription state
  - renewal/cancel state
  - included credits
  - remaining credits
  - reserved credits
  - last run debit summary
  - recent usage counters
- route WordPress `account_summary` proxy calls to this canonical response
- preserve local fallback behavior until the control-plane backend is fully live

### Acceptance

- WordPress can fetch one canonical dashboard summary payload
- summary endpoint is safe to expose through the existing proxy
- disconnected or backend-unavailable states still degrade cleanly

## Step 3 - Customer dashboard UI in WordPress

### Files

- `includes/class-admin-settings.php`
- `includes/class-admin-menu.php`
- `assets/js/aivi-sidebar.js`

### Tasks

- replace the development-oriented settings emphasis with dashboard cards for:
  - current plan
  - credit balance
  - this-month usage
  - connected site
  - subscription status
  - support/help
- keep the existing analysis sidebar consistent with the same account/balance language
- make the dashboard clearly readable for:
  - connected active accounts
  - trial accounts
  - suspended / no-entitlement accounts
  - disconnected sites

### Acceptance

- a normal customer sees an account dashboard instead of raw backend setup
- core account/credit/subscription state is understandable at a glance
- no PayPal checkout controls are required yet

## Step 4 - Hide legacy operational settings from normal customers

### Files

- `includes/class-admin-settings.php`
- `includes/class-assets.php`
- any related settings helpers referenced by the dashboard

### Tasks

- hide backend URL, raw API-key setup, and internal migration-era fields from normal customer view
- keep operational/internal flags available only for safe internal fallback behavior
- preserve backward compatibility for existing installs during migration

### Acceptance

- customers no longer see infrastructure-level configuration controls
- existing connected sites do not lose functionality
- internal fallback behavior remains intact

## Step 5 - Recent usage and last-run debit visibility

### Files

- `includes/class-admin-settings.php`
- `assets/js/aivi-sidebar.js`
- `infrastructure/lambda/orchestrator/run-status-handler.js`

### Tasks

- show recent usage summary in the dashboard:
  - credits used this month
  - last analysis debit
  - last sync time
- keep sidebar post-run debit display aligned with dashboard wording
- avoid duplicate or noisy billing language between dashboard and sidebar

### Acceptance

- users can see plan/balance/usage in both the dashboard and the sidebar without conflicting copy
- recent usage is visible without exposing internal ledger rows

## Step 6 - Regression coverage and migration safety

### Files

- `tests/diagnostics/`
- `tests/js/`
- `includes/class-admin-settings.php`
- `includes/class-rest-backend-proxy.php`

### Tasks

- add regression tests for:
  - dashboard payload normalization
  - dashboard rendering for active / trial / suspended / disconnected states
  - hidden legacy settings for normal customers
  - local fallback summary behavior
  - consistent last-run debit visibility
- verify Milestone 1 and 2 account/credit behavior stays green

### Acceptance

- customer dashboard rollout does not regress analysis or billing behavior
- hidden settings do not break existing site connectivity
- account and credit information remains safe and consistent
