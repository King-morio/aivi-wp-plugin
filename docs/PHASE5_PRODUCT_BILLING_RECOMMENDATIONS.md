# Phase 5 Product, Billing, and Admin Recommendations

Updated: 2026-03-06

## Goal

Turn AiVI from a working analysis plugin into a sellable product with:

- a separate platform super admin control plane
- WordPress-side customer account and billing UX
- recurring plans plus credit-based usage
- clean feature gating based on real AiVI capabilities
- PayPal-based billing without exposing secrets in WordPress

## Executive Recommendation

Do not make Phase 5 a generic "payments pass." Make it a controlled productization pass with these decisions locked first:

1. Keep the control plane outside customer WordPress installs.
2. Use subscriptions for plans and one-time top-ups for extra credits.
3. Meter core usage by analysis credits, not by turning dozens of small UI features on and off.
4. Remove backend URL/API key setup from customer-facing settings and replace it with account connection.
5. Do not monetize `Fix with AI` yet. The rewrite path exists, but it is not stable enough to sell as a premium promise.

## Current AiVI Capability Inventory

These are the real product surfaces present in the codebase today.

### Core analysis engine

- 51 total checks
- 30 AI/semantic checks
- 21 deterministic checks
- verdict model aligned to `pass | partial | fail`
- semantic-only AI scope with deterministic merge
- AEO and GEO scoring in the editor sidebar
- analysis queueing, polling, and partial-result handling

### Categories covered today

- Intro Focus and Factuality
- Answer Extractability
- Entities and Semantic Clarity
- Citability and Verifiability
- Structure and Readability
- Schema and Structured Data
- Freshness and Temporal Validity
- Trust, Neutrality and Safety

### Editor and UX surfaces already present

- Gutenberg and Classic Editor support
- sidebar analysis flow
- analysis progress loader
- grouped issues in sidebar
- show-passed toggle in sidebar
- overlay editor
- inline issue highlighting
- recommendation bucket for non-inline issues
- jump-to-block
- details view
- apply changes back into the source editor
- copy to clipboard
- local draft restore for overlay edits

### Recommendation and assistive surfaces already present

- rich explanation packs for issues
- deterministic schema assistance already present for selected checks
- generate/copy/insert schema flows in overlay for supported recommendations
- export report / print analysis report

### Current settings surfaces

Customer-facing settings still expose product-internal configuration:

- backend URL
- API key
- web lookups
- token cutoff
- plugin enable/disable
- internal feature flags

That is acceptable for development, but wrong for a commercial plugin release.

## What AiVI Should Sell

AiVI should sell three things:

1. access to the analysis engine
2. a monthly allowance of credits
3. higher operational limits and account controls on higher plans

AiVI should not initially sell tiny feature fragments. Jasper, Surfer, and Grammarly all gate primarily around plan tier, usage, collaboration/admin controls, and advanced workflow value, not around dozens of micro-switches. That pattern fits AiVI better too.

## Recommended Product Model

### Billing model

- recurring subscription = plan access + included monthly credits
- one-time credit packs = top-ups
- free trial = all core product surfaces enabled, but limited credit bank and single-site cap

### Metering model

Recommend a token-cost-backed credit model with large visible balances.

### Recommended internal billing math

Use actual returned token usage from the model runtime, not just preflight word estimates.

Current production model configuration:

- primary model: `mistral-large-latest`
- fallback model: `magistral-small-latest`

As of 2026-03-06, official Mistral docs show the same pricing for the currently referenced large and fallback models:

- input: `$0.5 / 1M tokens`
- output: `$1.5 / 1M tokens`

Recommended formula:

```text
weighted_tokens = input_tokens + (3 x output_tokens)
raw_cost_usd = (input_tokens x 0.5 + output_tokens x 1.5) / 1,000,000
credits_used = ceil(raw_cost_usd x 30,000)
```

This means:

- `30,000 credits = $1` of raw model cost
- `1 credit = $0.0000333` of raw model cost

### How preflight should be used

Do not show credit estimates in normal UX.

Use preflight only for:

- silent reservation / affordability checks
- blocking runs when the balance is obviously insufficient
- protecting the platform from admitting runs that cannot be paid for

### What the user should see

Before run:

- current balance only

After run:

- `Credits used: X`
- `Balance: previous -> current`

Only show a pre-run warning when balance is insufficient.

Do not charge separately for:

- polling
- details fetch
- overlay opening
- recommendations viewing
- schema generation/copy/insert
- export/print

Charge only when an analysis job is admitted.

### UX recommendation

Do not pause analysis to ask the user to approve an estimate.

That would add friction and clutter to the sidebar. The better commercial UX is:

- silent reservation in the background
- exact debit shown after run completion
- low-balance messaging only when necessary

### Refund and fairness rules

Recommended:

- if preflight rejects content, charge `0`
- if run fails before usable analysis is produced, auto-refund full credits
- if run returns `success_partial`, charge the run unless failure is platform-caused and systematic
- if the same content is retried because of platform failure inside a short window, auto-credit or waive the rerun

This matters because otherwise long-form content and occasional provider failures will feel punitive.

## Recommended Plans

These are product recommendations, not locked economics. Final included credits should be checked against Phase 4 telemetry and actual AI cost per run before launch.

### 1. Free Trial

Recommend:

- price: `$0`
- included credits: `15,000`
- site limit: `1`
- duration: `14 days or until credits are exhausted`, whichever comes first
- features: all current core user-facing features

Reason:

- this gives a meaningful visible balance and allows multiple real analyses
- raw model-cost exposure at current pricing is about `$0.50`

### 2. Starter

Recommend:

- price: `$10/month`
- included credits: `60,000`
- site limit: `1`
- run history retention: `30 days`
- support: standard email support

Best for:

- solo site owners
- bloggers
- small affiliate sites

### 3. Growth

Recommend:

- price: `$22/month`
- first month discount: `50% off`
- included credits: `150,000`
- site limit: `3`
- run history retention: `90 days`
- web lookups/fact-check enriched mode: included
- priority queue: optional if backend supports it

Best for:

- content teams
- agencies with a few active sites
- publishers iterating more heavily

### 4. Pro

Recommend:

- price: `$59/month`
- included credits: `450,000`
- site limit: `10`
- run history retention: `365 days`
- priority processing: included
- team seats: `3` to `5`
- admin analytics and richer usage history: included

Best for:

- agencies
- in-house editorial teams
- multi-site operators

## Top-Up Credit Packs

Recommend top-ups in parallel with plans.

Example packs:

- `25,000 credits` at `$7`
- `100,000 credits` at `$25`
- `300,000 credits` at `$69`

Recommended rule:

- monthly included credits do not roll over
- paid top-up credits do roll over for `12 months`
- top-up packs remain intentionally less credit-efficient than subscriptions

This keeps subscription value simple while making extra usage feel fair.

## What To Gate and What Not To Gate

## Gate by plan or credits

- total monthly credits
- maximum connected sites
- usage history retention
- team/admin controls
- top-up pricing efficiency
- web lookup mode
- queue priority if introduced

## Keep available on all paid plans

- sidebar scoring
- full 51-check analysis
- overlay editor
- inline highlights
- recommendations
- jump-to-block
- rich issue details
- schema assist generation/copy
- apply changes and copy-to-clipboard
- export report

Reason:

These are the core product. If you fracture them too aggressively, the plugin will feel crippled rather than premium.

## Do not sell yet

- `Fix with AI` rewrite as a premium promise

Reason:

The rewrite path is still behaviorally unstable. It should remain off or soft-launched internally until quality is consistently strong.

## Super Admin Control Plane

This should not live inside customer WordPress sites.

Best architecture:

- separate admin app on your backend domain
- authenticated only for platform operators
- powered by the central AiVI backend database

### Minimum super admin capabilities

- view all accounts
- search by email, domain, site ID, PayPal customer/subscription ID
- view current plan, status, trial state, renewal date
- see monthly included credits, remaining credits, and top-up balance
- manually grant or deduct credits
- manually reset or extend trials
- suspend or reactivate an account
- cancel or force-plan-change an account
- view site connections and revoke a site binding
- resend/connect a site token
- inspect recent analysis runs and usage totals
- inspect webhook delivery state and replay failed webhooks
- add internal support notes
- apply per-account feature overrides
- see risk flags like repeated payment failure or abusive usage

### Recommended additional super admin capabilities

- read-only impersonation / view-as-customer
- CSV export of accounts and credit ledgers
- coupon/discount management
- refund marking and finance notes
- product analytics dashboard:
  - active trials
  - trial-to-paid conversion
  - monthly credit burn
  - churn/cancellation reasons

## Customer Dashboard Inside WordPress

This should replace most of the current developer-style settings page.

### What the customer should see

#### Account card

- plan name
- plan status
- trial status or active subscription status
- next renewal date
- connected site/domain

#### Credit usage card

- included credits this cycle
- remaining credits
- top-up credits remaining
- credits used by the last completed run
- usage this month

#### Billing actions

- upgrade plan
- downgrade plan
- buy credits
- manage billing
- view invoices / payment history

#### Usage insights

- recent analyses
- words analyzed this cycle
- average words per run
- top posts analyzed recently

#### Product/help card

- what each plan includes
- support link
- onboarding/help docs

### What should leave the customer UI

- raw backend URL
- raw API key
- internal feature flags
- token cutoff override

These belong to platform operations, not end users.

## Account and Site Model

Recommend this model:

- `account` = billing/customer identity
- `site` = one WordPress install connected to an account
- `subscription` = current plan state
- `credit_ledger` = immutable ledger of grants, usage, refunds, top-ups
- `usage_event` = per-analysis consumption record

Recommended early rule:

- Starter: 1 site
- Growth: 3 sites
- Pro: 10 sites

This maps naturally onto WordPress installs and existing `site_id` plumbing.

## Data Model Recommendation

Minimum backend tables/collections:

- `accounts`
- `sites`
- `plans`
- `subscriptions`
- `credit_ledger`
- `usage_events`
- `paypal_webhook_events`
- `feature_overrides`
- `support_notes`

Useful fields:

### accounts

- account_id
- owner_email
- display_name
- status
- created_at

### sites

- site_id
- account_id
- domain
- wp_version
- plugin_version
- status
- last_seen_at

### subscriptions

- subscription_id
- account_id
- plan_code
- provider (`paypal`)
- provider_subscription_id
- status
- current_period_start
- current_period_end
- cancel_at_period_end

### credit_ledger

- ledger_id
- account_id
- site_id
- event_type (`trial_grant`, `monthly_grant`, `topup_purchase`, `analysis_debit`, `refund`, `manual_adjustment`)
- amount
- balance_after
- reference_id
- metadata
- created_at

## Payment Recommendation: PayPal

Use PayPal in two modes:

1. `Subscriptions API` for recurring plans
2. `Orders/Checkout` for one-time credit packs

### Why this is the right split

- plans are recurring entitlements
- top-ups are one-off wallet events
- PayPal officially supports subscriptions, trial periods, and discounted introductory pricing

### Specific recommendation

- Starter, Growth, Pro = PayPal subscriptions
- Growth first-month 50% off = PayPal discounted trial / introductory pricing
- top-up credits = PayPal one-time order/capture flow

### PayPal environment scaffold

Recommended backend environment variable names:

- `PAYPAL_API_BASE`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_BRAND_NAME`
- `PAYPAL_RETURN_URL`
- `PAYPAL_CANCEL_URL`
- `PAYPAL_PLAN_ID_STARTER`
- `PAYPAL_PLAN_ID_GROWTH`
- `PAYPAL_PLAN_ID_PRO`

Recommended catalog codes:

- plans:
  - `starter`
  - `growth`
  - `pro`
- trial:
  - `free_trial`
- top-up packs:
  - `topup_25k`
  - `topup_100k`
  - `topup_300k`

### Webhook rule

Never trust the browser redirect as the source of truth.

Grant or revoke entitlements only after verified webhook processing.

## Competitor Pattern Guidance

### Jasper

Relevant pattern:

- keeps plans simple
- scales value through usage, brand/workspace features, and business controls
- reserves heavier admin/security controls for higher tiers

AiVI takeaway:

- do not over-fragment core editing and analysis surfaces
- move value differences into allowance, scale, history, and control

### Surfer

Relevant pattern:

- prices around usage capacity and team scale
- keeps plan messaging tied to output volume and operational scale

AiVI takeaway:

- credits + site count is a natural packaging model
- higher tiers should buy more throughput and broader management

### Grammarly

Relevant pattern:

- clear consumer tiers
- enterprise/admin value is in centralized billing, user grouping, analytics, and policy control

AiVI takeaway:

- your super admin and account admin surfaces are real product value
- operational visibility is a premium feature, not just a support convenience

## Strong Recommendation on Settings UX

Phase 5 should remove the current development-oriented settings from normal customer view.

Replace with:

- `Connect AiVI Account`
- `Plan and Credits`
- `Manage Billing`
- `Connected Site`
- `Support`

Keep advanced operational configuration hidden behind:

- platform-controlled backend defaults
- per-account entitlements
- internal admin-only overrides

## Recommended Phase 5 Milestones

### Milestone 1: Identity, Entitlements, and Site Connection

- account model
- site registration flow
- connected-site token model
- replace backend URL/API key with account connection

### Milestone 2: Credit Ledger and Usage Metering

- credit ledger
- silent preflight reservation and affordability checks
- analysis debit/refund logic
- post-run debit display in WordPress
- subscription included credits and top-up credits

### Milestone 3: Customer Dashboard in WordPress

- plan card
- credit meter
- billing actions
- remove developer-only settings from customer view

### Milestone 4: PayPal Billing

- subscription plans
- discounted first month for Growth
- top-up purchase flow
- webhook ingestion and reconciliation

### Milestone 5: Super Admin Control Plane

- account table
- credits controls
- subscription state
- site linking/revocation
- webhook replay and support notes

## Decisions I Recommend Locking Before Implementation

1. Super admin lives in the backend control plane, not in customer WordPress.
2. Plans include monthly credits.
3. Top-ups are one-time purchases and roll over.
4. Free trial = `15,000` credits, 14 days, 1 site.
5. Starter/Growth/Pro are differentiated mainly by credits, site count, history, and admin controls.
6. Credits are debited from actual model cost, then converted into large visible balances for UX.
7. Preflight reservation stays silent unless the balance is insufficient.
8. `Fix with AI` is not a paid feature in the first commercial release.
9. Customer settings stop exposing backend internals.

## Markup Math at Current Pricing

Using the recommended conversion:

- `30,000 credits = $1 raw model cost`

Plan economics before infrastructure, support, storage, retries, and payment fees:

### Starter

- price: `$10`
- included credits: `60,000`
- raw AI cost if fully consumed: `$2.00`
- gross markup on raw model cost: `4.0x`
- gross margin on revenue: `80%`

### Growth

- price: `$22`
- included credits: `150,000`
- raw AI cost if fully consumed: `$5.00`
- gross markup on raw model cost: `4.4x`
- gross margin on revenue: `77.3%`

### Pro

- price: `$59`
- included credits: `450,000`
- raw AI cost if fully consumed: `$15.00`
- gross markup on raw model cost: `3.93x`
- gross margin on revenue: `74.6%`

These are not final profit numbers. They still need to absorb:

- AWS compute and storage
- retries and refunds
- logging and artifact storage
- PayPal fees
- support overhead
- future control-plane infrastructure

## Internal Control Plane Recommendation

- Keep the super-admin console outside WordPress.
- Recommended auth: `AWS Cognito User Pool` with Hosted UI, PKCE, group claims, and MFA.
- Recommended internal roles:
  - `aivi-super-admin`
  - `aivi-support`
  - `aivi-finance`
- Recommended hosting:
  - `S3 + CloudFront`
  - or `AWS Amplify Hosting`
- Operator actions must be auditable and must never rely on customer WordPress as the source of truth.

## Reference Links

Official sources consulted on 2026-03-06:

- Jasper pricing: https://www.jasper.ai/pricing
- Surfer pricing: https://surferseo.com/pricing/
- Grammarly plans: https://www.grammarly.com/plans
- Mistral Large 3 pricing: https://docs.mistral.ai/models/mistral-large-3-25-12
- Magistral Small 1.2 pricing: https://docs.mistral.ai/models/magistral-small-1-2-25-09
- PayPal subscriptions overview: https://developer.paypal.com/docs/subscriptions/
- PayPal trial periods and discounted pricing for subscriptions: https://developer.paypal.com/docs/subscriptions/customize/trial-period/
- PayPal Orders/Checkout overview: https://developer.paypal.com/api/rest/integration/orders-api/
- PayPal webhook event names: https://developer.paypal.com/api/rest/webhooks/event-names/
