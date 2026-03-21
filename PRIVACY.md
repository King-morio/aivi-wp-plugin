# AiVI Privacy Policy

This document explains, at a practical level, what information the AiVI WordPress plugin handles, how that information is used, and where it is stored.

It is written to match the current public plugin surface. Internal operator systems and private backend implementations are intentionally not part of this public repository, so backend retention and processor details may vary by AiVI environment.

## Scope

This privacy document covers the public AiVI WordPress plugin surface, including:

- editor analysis flows
- document metadata editing
- account, connection, plan, credit, and support surfaces inside WordPress
- browser-side draft and UI state related to the plugin

It does **not** publish private implementation details for:

- internal control-plane systems
- private billing infrastructure
- internal support tooling
- non-public backend deployment internals

## Roles and Responsibilities

In normal use, there are two main layers:

- **Your WordPress site** — where the plugin runs, stores local settings, and reads content from the editor
- **The managed AiVI service** — which receives analysis requests and returns deeper results, account state, and related service responses

Your WordPress site controls the plugin-side data described below. The managed AiVI service may also process and retain service data needed to fulfill analysis, account, support, or billing functions.

## Information the Plugin Handles

### 1. Article and editor content

When you run an analysis, the plugin may handle:

- the article title
- the current editor HTML/content
- a generated manifest and block map
- inferred content type
- token estimates
- optional document metadata such as:
  - meta description
  - canonical URL
  - language

This information is used to:

- build the WordPress-side preflight payload
- submit the analysis request
- anchor findings to blocks or sections
- render results in the sidebar and overlay

### 2. Document metadata

The plugin can read and update:

- post title
- meta description
- canonical URL
- language

These values are stored in WordPress as post title data and post meta where applicable.

### 3. Site identity and environment details

The plugin may collect or derive:

- site ID
- WordPress blog ID
- site home URL
- plugin version
- WordPress version
- connected domain

This information is used to:

- identify the site to the AiVI service
- support connection handshakes
- return the correct account/dashboard state
- help support and troubleshooting flows

### 4. Contact email and admin email

This is one of the most important pieces to call out clearly.

AiVI may use:

- the WordPress admin email as a default contact email
- a preferred contact email entered during onboarding or billing-related flows

The plugin uses this email to:

- identify the site during account onboarding
- support trial or account bootstrap flows
- populate site identity payloads
- help support or billing-related workflows

### How it is stored

- If you provide a preferred contact email, the plugin stores it in a WordPress option.
- If you do not provide one, the plugin can fall back to the WordPress admin email for site identity and onboarding flows.

### 5. Account, connection, and entitlement data

The plugin can store and display normalized account state such as:

- account ID
- account label
- connection status
- contact email
- plan code and plan name
- subscription status
- trial status
- site binding status
- credit balances
- entitlement flags
- latest connection token metadata
- connected sites summary

This information is used to:

- determine whether analysis is allowed
- power the Overview, Plans, Credits, Connection, Support, and Documentation tabs
- explain connection, plan, or credit issues in the editor/sidebar
- keep the local dashboard in sync with the managed service

### 6. Usage and run summary data

The plugin stores a local usage rollup that can include:

- last run ID
- recent counted run IDs
- last analysis time
- last run status
- credits used this month
- last run debit

This helps the plugin:

- show usage summaries in settings
- reflect local account state more accurately
- avoid double-counting the same run in local summaries

### 7. Billing and payment-related state

Depending on your AiVI environment, the plugin may handle:

- plan selections
- top-up selections
- billing return status
- hosted checkout redirects
- refreshed plan and credit state

The public plugin does **not** expose internal payment secrets in this repository. However, billing-related state and account status may still be exchanged between WordPress and the managed AiVI service.

### 8. Support request information

When you use the Support tab or an integrated support flow, the plugin may handle:

- support category
- priority
- subject
- message body
- contact email
- support destination/provider information

The plugin may also append useful context such as:

- account label
- plan name
- connected domain
- site URL
- site ID
- plugin version
- WordPress version
- connection/binding status
- last result
- last sync time

This context is used to make support requests easier to route and troubleshoot.

### 9. Browser-local draft and UI state

AiVI uses browser storage for some local editing convenience.

This can include overlay draft data such as:

- post ID
- run ID
- analysis content hash
- editor signature
- overlay schema version
- unsaved editable block HTML
- local save timestamp

This information is stored in the browser’s local storage, not in WordPress options, and is used only to restore compatible unsaved overlay edits.

## How AiVI Uses the Information

AiVI uses the handled information to:

- analyze content and return findings
- determine whether a site/account is connected and entitled to run analysis
- support the settings dashboard experience
- keep local and remote account state synchronized
- allow document metadata editing
- restore compatible unsaved overlay drafts
- troubleshoot service issues and support requests
- handle hosted billing, trial, or onboarding flows where applicable

AiVI is not intended to use your content for unrelated advertising or unrelated marketing behavior through the public plugin surface described here.

## Where Information Is Stored

### In WordPress

Depending on the feature in use, the plugin may store data in:

- WordPress options
- post meta
- post title fields

Examples include:

- backend URL override
- optional AiVI API key
- web lookups setting
- plugin enabled state
- preferred contact email
- local account/dashboard snapshots
- usage rollups
- document meta fields

### In the browser

The plugin may store limited local UI state in the browser, especially:

- compatible overlay draft content
- local view state tied to the current article/run context

### In the managed AiVI service

When you run analysis or use account/billing/support-connected flows, the plugin may send data to the managed AiVI service. That service may store:

- submitted analysis payloads
- run metadata
- account and connection state
- billing-related state
- support-related submissions

The exact backend retention schedule is environment-dependent and is not fully defined inside this public repository.

## What the Plugin Sends to the Managed Service

### During analysis

The plugin may send:

- title
- content HTML
- manifest/block map
- meta description
- canonical URL
- language
- run ID
- token estimate
- post ID
- content type
- site ID
- current WordPress user ID
- feature flags
- local account state needed for analysis admission and service behavior

### During account and connection flows

The plugin may send:

- site identity
- site URL
- site ID
- blog ID
- plugin version
- WordPress version
- admin or preferred contact email
- connection token when connecting a site

### During billing or support flows

The plugin may send:

- plan or top-up selections
- billing return parameters where relevant
- contact email
- support request content and support context

## Optional External Verification

If **Web Lookups** is enabled, the managed AiVI service may perform external verification for source-sensitive checks.

At a high level, this can mean:

- consulting public web sources
- checking external pages for verification support
- expanding network activity beyond the base specimen-only analysis path

If you want to keep analysis more strictly specimen-bound, leave web lookups disabled.

## Retention at a High Level

### WordPress-stored data

Data stored in WordPress generally remains until:

- you update it
- you clear it
- the plugin resets or overwrites the relevant state
- the content itself is changed or removed

### Browser-local draft data

Overlay drafts generally remain until:

- they are replaced
- they are cleared
- they become incompatible with the current run/content state
- the browser storage is cleared

### Managed service data

Analysis, account, support, and service records may be retained by the managed AiVI service for operational purposes such as:

- delivering results
- debugging
- abuse prevention
- account continuity
- billing and support workflows

Exact durations may vary by environment. If you need an exact retention commitment for your deployment, request that from the AiVI service operator.

## Security Notes

The plugin includes capability checks and sanitization for key settings and REST routes, but no WordPress plugin can replace responsible site administration.

You should:

- keep WordPress and the plugin updated
- restrict admin access appropriately
- use secure hosting and HTTPS
- avoid entering unnecessary overrides on production sites

### Important note about API keys

If you configure an optional AiVI API key, it is stored in WordPress and used in requests to the AiVI backend. Treat that key as sensitive operational data on your site.

## Your Controls

You can usually control plugin-handled data by:

- editing or clearing document metadata
- changing or removing the preferred contact email
- clearing or updating backend overrides
- disabling web lookups
- disconnecting the site from the current AiVI account
- clearing browser-local storage where needed

If you need deletion or correction of data handled by the managed AiVI service, contact the AiVI operator or support channel for your environment.

## Children’s Data

The plugin is intended for site operators, editors, and administrators. It is not designed as a service for children.

## Changes to This Policy

As AiVI evolves, this document may be updated to reflect changes in the public plugin surface, settings, support flows, and data handling behavior.

## Contact

For privacy or support questions related to your AiVI environment, use the Support tab in the plugin or the support path provided by your AiVI operator.
