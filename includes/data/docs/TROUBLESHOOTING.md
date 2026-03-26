# AiVI Troubleshooting Guide

This guide covers the most common issues you may run into while using AiVI in WordPress and the best next step for each one.

The goal is to help you separate:

- normal async analysis behavior
- stale or superseded run behavior
- site connection issues
- missing highlight limitations
- support-worthy failures

## Start Here

Before diving into a specific issue, check these basics:

1. Save the post or page.
2. Make sure the content you want analyzed is actually visible in the editor.
3. Confirm the site is connected to the expected AiVI account if your environment uses plans, trials, or credits.
4. Re-run analysis only after meaningful edits.

## Problem: "No content to analyze yet"

### What it usually means

AiVI could not find usable content in the current editor state.

### What to check

- the post or page may not have been saved yet
- the editor may still be holding a temporary state that has not settled
- the content may be empty or nearly empty

### What to do

1. Save the post or page as a draft.
2. Confirm the content is present in the editor.
3. Run analysis again.

If this still happens on a clearly populated article, contact support.

## Problem: Analysis takes longer than expected

### What it usually means

AiVI uses an async run flow. The plugin submits the analysis and then polls for the finished result.

Longer waits can happen when:

- the article is large
- the service is busy
- a temporary network problem interrupts polling

### What to do

- wait a little longer before starting a new run
- avoid stacking repeated runs if the content has not changed
- refresh the editor and retry if the run appears stuck for too long

### When to escalate

Contact support if:

- multiple fresh runs remain stuck
- the same article repeatedly fails to complete
- the service status or account state also looks unstable

## Problem: "Analysis results are stale" or "Details are unavailable for this run"

### What it usually means

The current article state no longer matches the older run state, or the run has already been superseded by a newer one.

AiVI now uses stronger stale-result handling, so older run details should stop pretending to be current.

### What to do

1. Save the current article.
2. Click **Re-run analysis**.
3. Wait for the new run to finish before reviewing details again.

### Why this happens

Typical reasons include:

- you changed the article after the run completed
- a newer run replaced the one you were looking at
- older details expired and are no longer safe to reuse

## Problem: Older results seem to come back after a rerun

### What it usually means

This usually points to one of these situations:

- the latest run has not finished yet, so you are still seeing the previous report
- the editor was refreshed into an older state
- the article content was not actually updated before the rerun

### What to do

- confirm the latest run finished successfully
- save the article again before rerunning
- refresh the editor if the sidebar looks out of sync

### Good sign to look for

Fresh runs now supersede older runs for the same article. That means a genuine new run should take over as the current result rather than leaving the previous one in place.

## Problem: Overlay draft changes reappear unexpectedly

### What it usually means

AiVI can restore compatible unsaved overlay edits, but only when they still match the current content and run context.

If an older draft reappears unexpectedly, it usually means the overlay state and current content have not fully realigned yet.

### What to do

- close and reopen the overlay
- refresh the editor
- rerun analysis after saving the current article

### What should happen now

AiVI now invalidates incompatible overlay drafts more aggressively, so older unsaved overlay content should not keep reattaching to unrelated newer runs.

## Problem: A finding has no highlight

### What it usually means

Not every AiVI issue is naturally inline.

Some findings are:

- block-level
- section-level
- document-scope
- schema- or metadata-level

That means AiVI may give you:

- a nearby jump target
- a broader section reference
- a document-level explanation without an exact text span

### What to do

- read the issue explanation first
- use **Jump to block** when available
- open the overlay if you need more context
- check whether the issue is structural or document-scope rather than sentence-level

## Problem: Jump-to-block lands nearby but not exactly on the sentence

### What it usually means

AiVI anchored the issue to the closest safe structural reference rather than to an exact inline text span.

This is more common when the issue is about:

- headings
- schema
- FAQ or HowTo candidacy
- document metadata
- section-level trust or structure signals

### What to do

- inspect the surrounding section, not just the exact line you expected
- open the details and read the explanation closely
- use the overlay review rail if you need better context around the area

## Problem: A question-answer article still gets partial answer-family results

### What it usually means

The answer-family checks rely on a clean question-to-answer path.

You may see partial verdicts when:

- the question anchor is ambiguous
- the answer starts too indirectly
- the content answers the topic, but not the exact visible question
- the main answer is mixed with setup before it clearly resolves the question

### What to do

- make the question explicit near the answer
- answer it directly in the opening response
- keep the primary answer concise and easy to scan
- rerun analysis after making that opening path clearer

## Problem: Heading-related findings feel surprising

### What it usually means

AiVI separates two different structural ideas:

- **Heading Fragmentation** is about over-splitting the outline
- **Heading Topic Fulfillment** is about a heading not being meaningfully supported

So if a result feels like "this heading is not really fulfilled," that may be a fulfillment issue rather than a fragmentation issue.

### What to do

- check whether the heading introduces a real section
- make sure the section actually delivers on that heading promise
- add framing content under major headings before handing off to another heading

## Problem: FAQ or HowTo schema feedback seems off

### What it usually means

Schema checks are candidacy-sensitive now, but you may still need to confirm whether the article truly behaves like:

- a FAQ page
- a HowTo page
- a normal explainer

### What to do

For FAQ concerns:

- confirm whether the article really contains repeated visible question-answer pairs
- do not force FAQ schema onto a page that does not read like visible FAQ content

For HowTo concerns:

- confirm whether the article is truly procedural
- unordered tips or general advice do not automatically make it a HowTo

If the article is not genuinely FAQ- or HowTo-shaped, treat that as a candidacy question first, not a markup problem first.

## Problem: Freshness or time-based checks seem too aggressive

### What it usually means

Freshness should matter mainly when the content includes real recency expectations or time-sensitive claims.

### What to do

- look for phrases such as "latest," "updated," "today," "recent," or similar recency cues
- check whether the claim needs a visible date or time anchor to be trustworthy
- if the article is evergreen, focus on whether it accidentally introduces timing language without clarifying it

## Problem: Connection required / pending / needs attention

### What it usually means

The site account state is not currently healthy enough for the expected AiVI flow.

Typical states include:

- **Connection required**
- **Connection pending**
- **Connection needs attention**

### What to do

1. Open the **Connection** tab in AiVI settings.
2. Confirm the current account and site status.
3. Follow the connection or token flow that matches your environment.
4. Refresh the settings page after any connection change.

### When to use operational settings

Operational connection controls are for:

- advanced troubleshooting
- support-guided overrides
- controlled staging or development scenarios

They are not the normal customer path for most sites.

## Problem: Plans or credits do not look refreshed

### What it usually means

AiVI may still be waiting for confirmation of the latest billing or connection state.

### What to do

- refresh the settings page after plan or credit changes
- wait briefly if a payment or activation flow is still settling
- check the Overview, Plans, and Credits tabs again

### When to escalate

Contact support if:

- the balance does not refresh after a reasonable wait
- your subscription state appears inconsistent across tabs
- the site remains blocked even though the account should be active

## Problem: Backend connection test fails

### What it usually means

If support previously asked you to use a custom service URL, that custom setting may now be wrong or unreachable.

### What to do

- leave the advanced service URL setting empty on normal customer sites
- only use a custom service URL when support specifically asks you to
- if a custom service URL is set, verify it is correct or clear it and try again

## Problem: Support flow is needed

### What to include in a support request

The most helpful support reports include:

- what you were trying to do
- what happened instead
- the post or page involved
- the approximate time of the run
- whether the problem happened after a rerun or after changing content

### Where to start

Open the **Support** tab and choose the category that best matches the issue:

- Billing & Plans
- Connection & Setup
- General Support

## Quick Recovery Checklist

If you are unsure what to do next, use this quick reset sequence:

1. Save the article.
2. Refresh the editor.
3. Open AiVI again.
4. Re-run analysis.
5. Wait for the latest run to finish.
6. Review the latest result, not an older one.
7. If the issue persists, contact support with a short description of what changed and what you already tried.

## Related Documents

- `USER_GUIDE.md`
- `CHECK_REFERENCE.md`
- `SUPPORT.md`

This guide is meant to help with the most common runtime problems. For policy, trust, and data-handling questions, pair it with `PRIVACY.md` and `TERMS_OF_SERVICE.md`.
