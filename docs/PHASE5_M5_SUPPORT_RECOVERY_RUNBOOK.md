# Phase 5 Milestone 5 Support Recovery Runbook

Updated: 2026-03-07

## Scope

This runbook covers the Step 5 support diagnostics and recovery tooling in the AiVI super-admin control plane.

## Diagnostics Surfaces

- Account diagnostics route:
  - `GET /aivi/v1/admin/accounts/{account_id}/diagnostics`
- Recovery route:
  - `POST /aivi/v1/admin/accounts/{account_id}/diagnostics/recovery`

## What operators can inspect

- webhook delivery history relevant to the selected account
- replay eligibility for stored webhook payloads
- checkout intent lookup by lookup key
- recent subscription and top-up reconciliation state
- recent run failures tied to the connected site
- current admission blockers
- site binding conflicts

## Recovery actions

- `retry_reconciliation`
  - allowed roles: `super_admin`, `support_operator`, `finance_operator`
- `replay_failed_webhook`
  - allowed roles: `super_admin`, `support_operator`

Both actions require:

- `reason`
- `webhook_event_id`
- authenticated operator context
- audit logging

## Replay eligibility rules

A stored webhook is replay-eligible only when:

- the stored record still has `raw_event`
- `processed !== true`
- `verification_status` is not failed

## Operator notes

- use `subscription_resync` from the Step 4 operator actions panel for account-state refresh cases
- use recovery actions only for webhook/reconciliation failures
- every recovery attempt is written to the admin audit log

## Backend table expectations

- `ACCOUNT_BILLING_STATE_TABLE`
- `BILLING_CHECKOUT_INTENTS_TABLE`
- `BILLING_SUBSCRIPTIONS_TABLE`
- `BILLING_TOPUP_ORDERS_TABLE`
- `PAYPAL_WEBHOOK_EVENTS_TABLE`
- `CREDIT_LEDGER_TABLE`
- `ADMIN_AUDIT_LOG_TABLE`
- `RUNS_TABLE`

## Rollback rule

Disable recovery UI and routes from the control-plane build if:

- webhook replay starts mutating the wrong account state
- audit events are missing for recovery actions
- stored webhook payloads are absent in live tables
