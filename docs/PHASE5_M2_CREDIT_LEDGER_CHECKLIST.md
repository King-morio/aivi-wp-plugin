# Phase 5 Milestone 2 Checklist

Updated: 2026-03-06

## Goal

Add the credit system behind analysis without destabilizing the visible Phase 4 UX or prematurely wiring PayPal.

## Step 1 - Pricing catalog and credit math foundation

### Files

- `infrastructure/lambda/shared/schemas/credit-ledger-contract-v1.json`
- `infrastructure/lambda/orchestrator/credit-pricing.js`
- `infrastructure/lambda/orchestrator/credit-pricing.test.js`

### Tasks

- define the canonical rate snapshot and ledger event shape
- implement versioned model pricing lookup
- implement raw-cost, weighted-token, and credit conversion helpers
- keep this step side-effect free: no live run debits yet

### Acceptance

- billing math is centralized in one tested module
- model aliases like `mistral-large-latest` resolve to stable pricing snapshots
- no analysis behavior changes yet

## Step 2 - Ledger persistence scaffold

### Files

- `infrastructure/lambda/orchestrator/credit-ledger.js`
- `infrastructure/lambda/orchestrator/index.js`
- `infrastructure/lambda/shared/schemas/credit-ledger-contract-v1.json`

### Tasks

- add ledger write helpers for:
  - reservation
  - settlement
  - refund
  - manual adjustment
- define event IDs and idempotency keys
- keep persistence helper isolated from run handlers at first

### Acceptance

- the orchestrator has a single place to write billing events
- reservation/settlement/refund events have stable shapes

## Step 3 - Silent reservation at preflight admission

### Files

- `infrastructure/lambda/orchestrator/analyze-run-handler.js`
- `infrastructure/lambda/orchestrator/preflight-handler.js`
- `infrastructure/lambda/orchestrator/credit-ledger.js`
- account/entitlement handlers when added

### Tasks

- compute a bounded reservation amount before admitting a run
- block only when balance is insufficient
- store reservation metadata on the run record
- keep reservation invisible in normal sidebar UX

### Acceptance

- insufficient-credit runs fail fast with a clean blocker
- admitted runs carry reservation metadata for later settlement

## Step 4 - Post-run settlement and refund paths

### Files

- `infrastructure/lambda/orchestrator/analyze-run-handler.js`
- `infrastructure/lambda/orchestrator/run-status-handler.js`
- `infrastructure/lambda/orchestrator/credit-ledger.js`

### Tasks

- settle against actual `input_tokens` and `output_tokens`
- record:
  - model
  - pricing version
  - raw cost
  - credits used
  - previous balance
  - new balance
- refund or release reservation on failed/no-result runs
- attach settled usage summary to the run payload

### Acceptance

- successful runs create settled debit events
- failed runs produce zero-charge or refund paths
- usage summary is available to the sidebar without exposing internal ledger details

## Step 5 - Sidebar credit UX

### Files

- `assets/js/aivi-sidebar.js`
- `includes/class-assets.php`
- `includes/class-rest-backend-proxy.php`

### Tasks

- show post-run debit only:
  - credits used
  - previous balance
  - current balance
- show low-balance blocker only when reservation is denied
- do not show preflight estimates in normal analysis UX

### Acceptance

- normal users see only final debit information after a completed run
- low-balance copy appears only when analysis cannot be admitted

## Step 6 - Regression coverage

### Files

- `infrastructure/lambda/orchestrator/credit-pricing.test.js`
- `infrastructure/lambda/orchestrator/analyze-run-handler.test.js`
- `tests/js/`
- diagnostics tests as needed

### Tasks

- test credit math and model alias resolution
- test insufficient-credit blockers
- test settlement/refund behavior
- test post-run debit visibility and no-estimate UX

### Acceptance

- billing foundation is covered before PayPal wiring begins
- Phase 4 analysis success paths remain green
