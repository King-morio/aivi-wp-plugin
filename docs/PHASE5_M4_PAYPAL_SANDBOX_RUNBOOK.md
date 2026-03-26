# Phase 5 Milestone 4 PayPal Sandbox Runbook

Updated: 2026-03-06

## Purpose

Validate PayPal plan checkout, webhook reconciliation, credit grants, and entitlement updates in a controlled sandbox before enabling hosted billing in WordPress.

## Rollout Gate

Customer builds now ship with hosted billing enabled by default. For sandbox/staging validation, explicitly override `AIVI_BILLING_READY` to `false` until all checks in this runbook pass.

Hosted billing should only be enabled after:
- PayPal environment variables are set
- DynamoDB billing tables exist
- webhook delivery is verified end to end
- subscription and top-up grants reconcile correctly
- WordPress shows only safe hosted actions and status

## Required Environment

Set these backend environment variables:
- `PAYPAL_API_BASE`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_BRAND_NAME`
- `PAYPAL_RETURN_URL`
- `PAYPAL_CANCEL_URL`
- `PAYPAL_PLAN_ID_STARTER`
- `PAYPAL_PLAN_ID_GROWTH`
- `PAYPAL_PLAN_ID_GROWTH_INTRO`
- `PAYPAL_PLAN_ID_PRO`

## Required Tables

Provision these tables before sandbox testing:
- `BILLING_CHECKOUT_INTENTS_TABLE`
- `PAYPAL_WEBHOOK_EVENTS_TABLE`
- `BILLING_SUBSCRIPTIONS_TABLE`
- `BILLING_TOPUP_ORDERS_TABLE`
- `ACCOUNT_BILLING_STATE_TABLE`

Accepted fallback alias:
- `BILLING_ACCOUNT_STATE_TABLE`

## Preflight Checklist

1. Confirm WordPress shows billing controls as disabled while the staging override `AIVI_BILLING_READY=false` is active.
2. Confirm browser payload does not expose:
   - PayPal secret
   - webhook ID
   - provider subscription IDs
   - provider order IDs
3. Confirm backend checkout routes respond through WordPress proxy only.
4. Confirm webhook endpoint is reachable and signature verification is enabled.

## Sandbox Validation Scenarios

### 1. trial -> paid

1. Start from a trial-linked account with no active subscription.
2. Open hosted checkout for `starter` or `growth`.
   - for `growth`, confirm the environment includes `PAYPAL_PLAN_ID_GROWTH_INTRO`
3. Complete sandbox PayPal approval.
4. Wait for verified webhook processing.
5. Confirm:
   - subscription record is stored
   - `ACCOUNT_BILLING_STATE_TABLE` shows active subscription state
   - monthly included credits are granted once
   - WordPress dashboard updates plan and credit summary
   - analysis admission uses backend entitlements

### 2. top-up purchase

1. Start from an active paid account.
2. Launch a top-up purchase.
3. Complete sandbox PayPal capture.
4. Wait for verified webhook processing.
5. Confirm:
   - top-up order is stored as credited
   - credits are granted once only
   - total remaining balance increases correctly
   - dashboard shows updated top-up balance

### 3. payment failure

1. Use sandbox conditions that trigger failed or suspended subscription payment state.
2. Confirm verified webhook ingestion.
3. Confirm:
   - subscription status changes to failed/suspended state
   - analysis entitlement is reduced or blocked as designed
   - WordPress dashboard shows clear billing status
   - sidebar blocked state links back to billing actions

### 4. cancelled subscription

1. Cancel an active sandbox subscription.
2. Confirm verified webhook ingestion.
3. Confirm:
   - subscription status reflects cancelled state
   - current-cycle credits remain consistent
   - renewal messaging changes in WordPress
   - no duplicate monthly grant occurs on repeated events

## Idempotency Checks

For each scenario above, replay the same webhook payload and confirm:
- no duplicate subscription mutation
- no duplicate top-up grant
- no duplicate monthly credit grant
- webhook event record is marked duplicate/idempotent-safe

## WordPress UI Checks

Confirm in WordPress:
- billing plan cards show only safe catalog data
- top-up cards show only safe pack data
- `Manage billing` uses hosted/backend flow only
- sidebar CTA links go back to dashboard anchors, not provider URLs

## Rollback Rule

Do not enable hosted billing if any of the following are true:
- webhook verification fails
- credit grants duplicate
- account billing state does not reconcile
- browser payload leaks provider secrets or raw provider identifiers
- analysis admission blocks legitimate entitled users

If any fail:
- keep the staging override `AIVI_BILLING_READY=false`
- fix the failing path
- rerun sandbox validation before retrying rollout
