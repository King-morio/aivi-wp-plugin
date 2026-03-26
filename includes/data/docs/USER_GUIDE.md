# AiVI User Guide

AiVI helps you review WordPress content for AI visibility, answer readiness, structure, schema, and trust before publishing.

This guide focuses on the day-to-day plugin experience inside WordPress and uses screenshots that match the main AiVI workflow.

## What AiVI Does

AiVI works inside WordPress to:

- analyze the content currently in your post or page editor
- surface grouped findings in the editor sidebar
- let you inspect issue details and jump closer to the affected area when available
- open a guided review overlay for deeper inspection

Some findings appear quickly from the current editor content, while deeper results arrive once the analysis finishes.

## Before You Start

For the smoothest experience:

- save your post or page as a draft before running analysis
- make sure the content you want analyzed is actually present in the editor
- confirm your site is connected to the right AiVI account if your environment uses plans, trials, or credits

If AiVI reports that there is no content to analyze yet, save the post first and try again.

## Where to Find AiVI

### Gutenberg

In the Block Editor, AiVI appears in the editor sidebar as **AiVI Inspector**.

![Open AiVI from the eye icon in the editor chrome.](assets/img/docs/user-guide-open-sidebar.jpg)

### Classic Editor

In the Classic Editor, AiVI appears in its own meta box. The experience is lighter than Gutenberg, but it still gives you access to analysis and findings.

## Running an Analysis

1. Open the post or page you want to review.
2. Open the AiVI panel.
3. Click **Analyze content**.
4. Wait for AiVI to finish reviewing the current page.

![Launch analysis from the Analyze content button in the AiVI sidebar.](assets/img/docs/user-guide-run-analysis.jpg)

While the analysis is running, the sidebar shows a live progress card with rotating analysis messages.

![Watch the live progress panel while AiVI runs the analysis.](assets/img/docs/user-guide-analysis-progress.jpg)

## Reading the Results

When the analysis finishes, AiVI groups findings into clear sections such as:

- opening answer quality
- structure and readability
- schema and structured data
- timing clarity and freshness
- trust and support signals

![Review the surfaced findings and act on the recommendations that matter most.](assets/img/docs/user-guide-review-results.jpg)

### Verdicts

AiVI uses three main verdict states:

- **Pass** - healthy enough not to be featured as a problem
- **Partial** - there is useful structure in place, but improvement is still recommended
- **Fail** - the issue is strong enough to surface clearly

Passed checks are not meant to dominate the review rail. AiVI focuses attention on findings that still need action.

### Details and Jump-to-Block

For many findings, AiVI can:

- show issue details
- highlight the related block or section
- jump you closer to the relevant content

Some findings are broader than one exact sentence. In those cases, AiVI may give you context and a nearby jump target instead of a perfect inline highlight.

## Re-running Analysis After Edits

Re-run analysis whenever you make meaningful structural or content changes.

This is especially useful after:

- rewriting the intro
- improving the opening answer
- changing heading structure
- adding or adjusting schema markup
- tightening citations or evidence

## Using the Overlay Review Experience

AiVI can open a review overlay that gives you a larger inspection surface for recommendations and content context.

![Open the AiVI overlay editor from the completed analysis surface.](assets/img/docs/user-guide-open-overlay.jpg)

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

AiVI can restore compatible unsaved overlay edits only when they still match the current article state. If the article has changed too much, older overlay drafts should not be restored onto the wrong content.

## Understanding the Settings Page

Open **AiVI** in WordPress admin to access the main settings experience.

The current settings tabs are:

- Overview
- Plans
- Credits
- Connection
- Support
- Documentation

### Overview

The Overview tab gives you a quick snapshot of:

- current account and site state
- usage summary
- connection status
- quick navigation into the rest of AiVI

### Plans

Use the Plans tab when you want to:

- compare plan levels
- review what is included in each plan
- move into plan selection or upgrade flows

### Credits

Use the Credits tab when you want to:

- review credit pack options
- buy additional analysis capacity where supported
- understand how credits relate to current account access

### Connection

The Connection tab helps you confirm how the current site is attached to your AiVI account.

It can also help with:

- checking connection state
- reviewing the connected domain
- adding another site to the same account where your plan allows it
- following support guidance if a connection needs attention

### Support

The Support tab gives you a guided way to contact AiVI support and route the request to the right queue.

Typical categories include:

- Billing & Plans
- Connection & Setup
- General Support

### Documentation

The Documentation tab keeps the main AiVI guides inside WordPress.

Use it when you want to:

- review the user guide without leaving WordPress
- understand what a finding means
- work through troubleshooting steps
- read the current support, privacy, and terms guidance

When asking for help, it is useful to include:

- what you were trying to do
- what happened instead
- the post or page involved
- the approximate time of the issue

## Common Situations

### "No content to analyze yet"

Usually means the editor content is empty or has not been saved into a usable state yet.

What to do:

1. save the post or page
2. confirm the content is present in the editor
3. run analysis again

### "Analysis in progress" takes a while

Some analyses take longer depending on article size and current service load.

What to do:

- wait for the current run to complete
- avoid repeatedly starting new runs unless you changed the content
- if the status looks stuck for too long, refresh the editor and try again

### Older results seem to reappear

If something still looks off:

- confirm you are looking at the latest result
- refresh the editor
- re-run analysis after saving the current article state

### A finding has no exact highlight

Some findings are broader than one sentence. They may describe:

- document-level schema issues
- broad structural problems
- account or setup issues
- timing or support-related states

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

If possible, include a short description of what changed between attempts.

## Related Documents

- `CHECK_REFERENCE.md`
- `TROUBLESHOOTING.md`
- `SUPPORT.md`
- `PRIVACY.md`
- `TERMS_OF_SERVICE.md`

Use this guide as your main workflow reference, then move into the other guides only when you need more help on a specific issue.
