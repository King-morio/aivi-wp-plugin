# AiVI User Guide

AiVI helps you analyze WordPress content for AI search readiness, review structured findings, and work through fixes inside the editor.

This guide focuses on the current plugin experience in WordPress. It is written so you can use it as-is, then add screenshots later where they help most.

## Screenshot Placeholders

Replace these placeholder lines with screenshots when you are ready:

- `[Screenshot: AiVI sidebar open in Gutenberg]`
- `[Screenshot: Analysis in progress card]`
- `[Screenshot: Completed analysis with issue groups]`
- `[Screenshot: Overlay review editor open]`
- `[Screenshot: AiVI settings Overview tab]`
- `[Screenshot: AiVI settings Plans tab]`
- `[Screenshot: AiVI settings Credits tab]`
- `[Screenshot: AiVI settings Connection tab]`
- `[Screenshot: AiVI settings Support tab]`
- `[Screenshot: AiVI settings Documentation tab]`

## What AiVI Does

AiVI works inside WordPress to:

- analyze your current post or page content
- estimate how well the content is structured for answer-first and AI-assisted discovery
- surface grouped findings in the editor sidebar
- let you inspect issue details and jump to the affected block when available
- open a guided review overlay for deeper editing workflows

AiVI combines WordPress-side preflight checks with a managed backend analysis service. That means some findings are generated from the editor content immediately, and deeper findings arrive after the analysis run completes.

## Before You Start

For the smoothest experience:

- save your post or page as a draft before running analysis
- make sure the content you want analyzed is actually present in the editor
- confirm your site is connected to the right AiVI account if your environment uses plans, trials, or credits

If AiVI reports that there is no content to analyze yet, save the post first and try again.

## Where to Find AiVI

### Gutenberg

In the Block Editor, AiVI appears in the editor sidebar as **AiVI Inspector**.

`[Screenshot: AiVI sidebar open in Gutenberg]`

### Classic Editor

In the Classic Editor, AiVI appears in its own meta box. The experience is lighter than Gutenberg, but it still gives you access to analysis and findings.

## Running an Analysis

1. Open the post or page you want to review.
2. Open the AiVI panel.
3. Click **Analyze content**.
4. Wait while AiVI performs preflight checks and sends the run to the backend.

While the analysis is running, the sidebar shows a live progress card with rotating analysis messages.

`[Screenshot: Analysis in progress card]`

### What Happens During Analysis

At a high level, AiVI:

1. extracts the current editor content
2. builds a manifest and block map
3. estimates tokens and prepares the request
4. sends the analysis run through the WordPress proxy
5. polls for the finished result
6. replaces the in-progress state with the completed report

Each analysis gets its own run ID. New runs supersede older runs for the same article, so fresh results do not keep using stale UI state.

## Reading the Results

When the analysis finishes, AiVI groups findings into categories such as:

- Intro Focus & Factuality
- Answer Extractability
- Structure & Readability
- Schema & Structured Data
- Freshness & Temporal
- Entities & Semantic Clarity
- Trust, Neutrality & Safety
- Citability & Verifiability

`[Screenshot: Completed analysis with issue groups]`

### Verdicts

AiVI uses three main verdict states:

- **Pass** — the check is healthy enough not to be featured as a problem
- **Partial** — the content is on the right track, but improvement is still recommended
- **Fail** — the issue is strong enough to be surfaced clearly

Passed checks are not meant to dominate the review rail. AiVI focuses attention on findings that still need action.

### Details and Jump-to-Block

For many findings, AiVI can:

- show issue details
- highlight the related block or section
- jump you closer to the relevant content

Some findings are document-scope rather than inline. In those cases, AiVI may give you context and a nearby jump target instead of an exact highlight.

## Re-running Analysis After Edits

Re-run analysis whenever you make meaningful structural or content changes.

This is especially useful after:

- rewriting the intro
- improving the opening answer
- changing heading structure
- adding or adjusting schema markup
- tightening citations or evidence

AiVI now clears stale sidebar state more aggressively when a new run starts, so older results should not linger as if they are still current.

## Using the Overlay Review Experience

AiVI can open a review overlay that gives you a larger inspection surface for recommendations and content context.

`[Screenshot: Overlay review editor open]`

In the overlay you may see:

- grouped recommendations
- issue rationale
- content highlights
- jump targets
- review rail navigation

Depending on the issue type, the overlay may point to:

- a specific block
- a section heading
- a nearby structural anchor
- a document-level recommendation without a precise inline target

### Unsaved Overlay Changes

AiVI can restore compatible unsaved overlay edits, but only when they still match the current content/run context. If the content or run has changed materially, older overlay drafts should no longer be restored onto the wrong article state.

## Understanding the Settings Page

Open **AiVI** in WordPress admin to access the settings experience.

The current settings tabs are:

- Overview
- Plans
- Credits
- Connection
- Support
- Documentation

### Overview

The Overview tab gives you a top-level snapshot of:

- current account and site state
- usage summary
- account connection status
- quick navigation into the rest of the AiVI settings experience

`[Screenshot: AiVI settings Overview tab]`

### Plans

The Plans tab helps you review available AiVI plans and choose the one that fits your site or editorial workflow.

Use this tab when you want to:

- compare plan levels
- review what is included in each plan
- move into plan selection or upgrade flows

`[Screenshot: AiVI settings Plans tab]`

### Credits

The Credits tab shows available top-up options and helps you understand how credits fit into your account usage.

Use it when you want to:

- review credit pack options
- buy additional analysis capacity where supported
- understand how credits relate to current account access

`[Screenshot: AiVI settings Credits tab]`

### Connection

The Connection tab helps you confirm how the current site is attached to your AiVI account.

It can also be used for:

- reviewing site/account connection state
- checking connected domain and related status fields
- working with support-guided operational connection controls when needed
- adding another site to the same account where your plan allows it

`[Screenshot: AiVI settings Connection tab]`

For most sites, the account dashboard is the normal path. Operational fallback controls are there for troubleshooting and support-guided overrides, not as the default customer flow.

### Support

The Support tab gives you a guided way to contact AiVI support and route the request to the right queue.

Typical categories include:

- Billing & Plans
- Connection & Setup
- General Support

`[Screenshot: AiVI settings Support tab]`

### Documentation

The Documentation tab gives you an in-product knowledge surface for the current AiVI guides.

Use it when you want to:

- review the user guide without leaving WordPress
- look up the meaning of a check family
- work through troubleshooting steps for stale results or missing highlights
- read privacy, terms, support, development, architecture, operations, and decision docs from one place

Support-side documentation links now route into this internal docs surface where appropriate, so you can move from a support question into the right guide more quickly.

`[Screenshot: AiVI settings Documentation tab]`

When asking for help, it is useful to include:

- what you were trying to do
- what happened instead
- the post or page involved
- the approximate time of the run
- the run ID when available

## Common Situations

### “No content to analyze yet”

Usually means the editor content is empty or has not been saved into a usable state yet.

What to do:

1. save the post or page
2. confirm the content is present in the editor
3. run analysis again

### “Analysis in progress” takes a while

AiVI uses async analysis runs, so deeper results can take some time depending on article size and backend load.

What to do:

- wait for the current run to complete
- avoid repeatedly starting new runs unless you have changed the content
- if the status looks stuck for too long, refresh the editor and try again

### Older results seem to reappear

AiVI now uses better stale-result handling and run supersession, but if something still looks off:

- confirm you are looking at the latest run
- refresh the editor
- re-run analysis after saving the current article state

### A finding has no exact highlight

Some findings are not naturally inline. They may describe:

- document-level schema issues
- broad structural problems
- account/setup issues
- verification or support-related states

In those cases, AiVI may offer context without a perfect text-level highlight.

## Best Practices for Better Results

- save before analyzing
- make the intro clear and deliberate
- answer the main question early when the article targets a question
- use headings to organize real sections, not just labels
- keep lists, tables, and schema aligned to visible content
- rerun after meaningful edits instead of guessing whether the previous result still applies

## When to Contact Support

Contact support if:

- the site connection does not reflect the expected account state
- plan or credit behavior looks wrong
- results appear stuck after repeated fresh runs
- a run keeps failing unexpectedly
- the support or connection flow on your site looks incomplete

If possible, include the run ID and a short description of what changed between runs.

## Related Documents

- `readme.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

As the documentation set grows, this guide will be supported by dedicated check reference, troubleshooting, privacy, and terms documents.
