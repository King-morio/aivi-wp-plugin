# Production Audit - 2026-03-09

## Scope

This audit covers the customer WordPress plugin, the commercial/billing path, the super-admin control plane, release packaging, and the current staging rollout state.

## File groups

### 1. Customer runtime

- `ai-visibility-inspector.php`
- `includes/`
- `assets/`

Responsibilities:
- plugin bootstrap
- customer dashboard/settings
- sidebar, overlay, and editor UX
- WordPress proxy routes
- customer-side account, billing, and analysis flows

### 2. Commerce and entitlement backend

- `infrastructure/lambda/orchestrator/`
- `infrastructure/lambda/shared/`
- `infrastructure/lambda/worker/`

Responsibilities:
- analysis admission and settlement
- credit reservations, refunds, and ledger writes
- PayPal checkout, return, webhook, and reconciliation
- authoritative account/billing state

### 3. Super-admin control plane

- `control-plane/admin-console/`

Responsibilities:
- hosted admin console
- account inspection
- billing diagnostics
- recovery and operator actions

### 4. Packaging and release boundaries

- `tools/`
- `dist/`
- `.distignore`
- `.gitattributes`

Responsibilities:
- customer-safe zip creation
- exclusion of control-plane, tests, docs, and internal infrastructure

### 5. Quality gates

- `tests/`
- `docs/`

Responsibilities:
- regression coverage
- rollout runbooks
- milestone tracking

## Audit criteria used

The review was anchored on:

- WordPress Plugin Developer Handbook production expectations:
  - capabilities and permission checks
  - sanitization/escaping
  - nonces for privileged mutations
  - operational separation between customer UI and internal tooling
- WordPress Plugin Check / production readiness patterns
- PayPal subscriptions and webhook validation flow requirements
- current AiVI rollout constraints:
  - customer installs should be zero-config
  - billing and credits must stay coherent with analysis
  - internal control-plane code must not ship in the customer zip

## Findings

### Fixed in this pass

#### 0. Customer zip root did not use the canonical plugin slug

Risk:
- high install/activation risk on some hosts

Problem:
- the release zip used `AiVI-WP-Plugin/` as its internal root directory while the main plugin file is `ai-visibility-inspector.php`
- WordPress activation tracks plugins as `directory/file.php`
- some hosts and plugin-install flows behave more reliably when the directory slug matches the plugin basename convention

Fix:
- changed the release package script so the internal plugin root is now:
  - `ai-visibility-inspector/`
- kept the external zip filename unchanged for convenience

Touched:
- `tools/package-plugin-release.ps1`
- `tests/diagnostics/release-package-safety.test.js`

#### 1. Customer installs still required manual environment wiring

Risk:
- medium usability / adoption risk

Problem:
- customer installs still depended on manual backend and billing constants for a clean hosted-billing experience

Fix:
- added a built-in production backend default
- made hosted billing enabled by default for customer installs
- preserved constants and filters as staging/dev/support overrides only

Touched:
- `includes/config.php`
- `includes/class-admin-settings.php`

#### 2. Hidden UI text had mojibake / encoding damage

Risk:
- low usability / polish risk

Problem:
- inline highlight and billing notice text contained broken dash/ellipsis characters

Fix:
- replaced broken strings with ASCII-safe text

Touched:
- `assets/js/aivi-highlight-manager.js`
- `includes/class-admin-settings.php`

#### 3. Rollout docs and diagnostics were stale after the zero-config commercial model change

Risk:
- medium operator/support risk

Problem:
- multiple rollout docs still described `AIVI_BILLING_READY=false` as the customer default
- one validation matrix still referenced a removed sidebar debit card

Fix:
- updated rollout docs/tests to reflect:
  - customer installs use the production backend by default
  - hosted billing is on by default for customer installs
  - staging/local can still force `AIVI_BILLING_READY=false`
  - sidebar now shows a single account-state balance view

Touched:
- `docs/PHASE5_M4_PAYPAL_SANDBOX_RUNBOOK.md`
- `docs/PHASE5_M6_AWS_ENV_IAM_INVENTORY.md`
- `docs/PHASE5_M6_E2E_VALIDATION_MATRIX.md`
- `docs/PHASE5_M6_HARDENING_ROLLOUT_CHECKLIST.md`
- `docs/PHASE5_M6_STAGING_SANDBOX_RUNBOOK.md`
- `docs/PHASE6_POLISH_CHECKLIST.md`
- `tests/diagnostics/staging-rollout-prep.test.js`
- `tests/diagnostics/paypal-rollout-safety.test.js`
- `tests/test-settings.php`

### Already validated before this pass

These were re-reviewed and remain in good shape:

- PayPal top-up flow:
  - checkout
  - return capture
  - webhook reconciliation
  - single credit grant
- PayPal subscription flow:
  - checkout
  - activation
  - authoritative account-state update
- analysis plus credit consumption:
  - reservation
  - settlement
  - customer balance sync
- customer dashboard sync after billing/account changes
- hosted admin console on `console-staging.dollarchain.store`
- release package exclusions

## Remaining watchlist

These are not blockers for rebuilding the customer zip, but they remain the next rollout polish tasks:

1. replace the temporary customer-side tunnel path with a stable public WordPress staging hostname
2. retire staging bootstrap-token admin auth after Cognito/JWT staging is live
3. optionally clean old sandbox noise from seeded admin diagnostics data

## Audit result

- functionality: pass
- usability: pass after zero-config default and text cleanup
- packaging: pass
- risk profile: acceptable for staging/customer distribution, with the remaining Phase 6 polish items still tracked separately
