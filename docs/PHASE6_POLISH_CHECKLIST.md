# Phase 6 Polish Checklist

Updated: 2026-03-08

## Goal

Finish the remaining rollout polish after Phase 5 commerce validation without reopening the core billing, entitlement, or analysis work.

## Scope

- stable staging/public hostnames
- control-plane hosting and Cognito/JWT wiring
- final admin diagnostics cleanup
- production-safe rollout controls

## Step 1 - Stable staging hostnames

### Tasks

- replace temporary Cloudflare quick tunnels with stable public HTTPS hosts
- keep the locked admin hostnames:
  - `console-staging.dollarchain.store`
  - `console.dollarchain.store`
- move WordPress staging billing return/cancel URLs off temporary tunnel domains
- re-run one top-up and one subscription redirect against stable hostnames

### Acceptance

- PayPal return/cancel no longer depends on temporary tunnel DNS
- customer and admin staging URLs are stable enough for repeat validation

## Step 2 - Admin control-plane hosting and auth

### Tasks

- host the control plane on AWS
- wire Cognito user pool, groups, and MFA
- wire API Gateway JWT authorizer for admin routes
- disable staging bootstrap token once Cognito staging is working

### Acceptance

- admin console is reachable on the staging hostname
- bootstrap token is no longer needed for normal staging admin access
- admin routes are protected by Cognito/JWT instead of temporary bootstrap access

## Step 3 - Diagnostics and operator polish

### Tasks

- remove misleading `processed: false` raw views for already reconciled webhook paths
- tighten support/operator diagnostics wording where needed
- optionally purge stale sandbox checkout/subscription noise from the seeded staging account

### Acceptance

- admin/support views reflect actual reconciliation state clearly
- operator console is not cluttered by stale sandbox artifacts

## Step 4 - Final rollout guardrails

### Tasks

- confirm production env keeps:
  - the built-in production backend default enabled
  - hosted billing enabled by default for customer installs
  - staging/local overrides available only through constants/filters
  - `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN=false`
- confirm release package still excludes:
  - `control-plane/`
  - `docs/`
  - `tests/`
  - `infrastructure/`
- confirm no browser payload leaks billing/provider secrets

### Acceptance

- production enablement remains explicit and fail-closed
- release packaging and browser payload boundaries remain intact

## Step 5 - Final checkpoint

### Tasks

- run one final staging validation sweep:
  - analysis + credits
  - top-up
  - subscription
  - customer dashboard sync
  - admin diagnostics
- checkpoint docs and repo state

### Acceptance

- Phase 6 polish is complete
- rollout can proceed from a stable, documented baseline
