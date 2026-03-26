# AiVI Support Guide

This guide explains how to ask for help with AiVI, what information is most useful to include, and what you do **not** need to gather yourself before contacting support.

## Start With the Right Support Category

In the AiVI settings page, open the **Support** tab and choose the category that best matches your issue:

- **Billing & Plans**
  - use this for plan changes, credits, renewals, checkout issues, or billing-state confusion
- **Connection & Setup**
  - use this for site connection, connection tokens, onboarding, connection-required states, or setup problems
- **General Support**
  - use this for analysis behavior, editor issues, stale results, unexpected findings, or anything that does not fit the first two lanes

Choosing the closest category helps route the request faster.

## What to Include in a Good Support Request

The best support requests are short, concrete, and specific.

Include:

- what you were trying to do
- what happened instead
- the title of the post or page involved
- the approximate time the issue happened
- whether the issue happened in Gutenberg, Classic Editor, or the settings page
- whether this happened on the first run or after a re-run

Useful extras:

- a screenshot of the issue
- the exact error or warning text you saw
- the settings tab involved, if the issue is not about article analysis
- whether you had just changed connection, plan, credit, or support settings

## What You Do Not Need to Gather Manually

Normal users do **not** need to manually collect raw technical diagnostics before asking for help.

In most cases, you do not need to send:

- raw technical payloads
- secret tokens or keys
- hidden internal identifiers
- technical logs unless support specifically asks

If support needs something more specific, they should tell you exactly what to provide and why.

## Helpful Information for Common Issue Types

### Analysis Issues

Include:

- post or page title
- whether the issue is about:
  - stale results
  - wrong or surprising findings
  - missing highlights
  - analysis never finishing
  - overlay behavior
- whether the article had just been edited before the run

Example:

> I analyzed "How Fast Can a Mini Excavator Dig?" in Gutenberg around 2:15 PM Nairobi time. The answer-related results still looked partial after I rewrote the opening answer and re-ran analysis.

### Connection Issues

Include:

- whether the site shows:
  - Connection required
  - Connection pending
  - Connection needs attention
- whether you recently pasted a connection token
- whether this is the first site or an additional site on the account

Example:

> I connected a second site today, but the Connection tab still shows Connection pending after refresh.

### Billing and Credit Issues

Include:

- current plan, if you know it
- whether the issue is about:
  - trial
  - renewal
  - checkout
  - top-up credits
  - missing credits
  - plan activation not refreshing
- whether the issue appeared after PayPal checkout or another billing step

Example:

> I completed checkout, but the Plans and Credits tabs still show the old state after several refreshes.

### Support Tab Issues

Include:

- whether the support portal opened
- whether the wrong category or message appeared
- whether the contact email shown there looks wrong

## Screenshots: When They Help Most

Screenshots are especially useful for:

- surprising verdict wording
- stale-result banners
- missing or misplaced highlights
- connection status confusion
- settings screens that do not match expectations
- checkout or credit refresh problems

Good screenshot tips:

- capture the full relevant panel, not just one cropped line
- include the article title or settings tab when possible
- avoid including unrelated personal or secret information

## Safe Information to Share

It is usually safe and helpful to share:

- article title
- site URL or domain
- WordPress version if known
- plugin version if visible
- visible status text
- screenshots
- the support category you selected
- whether web lookups were enabled, if you know

Be cautious about sharing:

- API keys
- raw connection tokens
- private billing details that are not needed
- secrets copied from admin settings or browser storage

If support needs anything sensitive, they should give you a clear secure path and explain why it is needed.

## Information AiVI May Already Include

Depending on the support flow, AiVI may already attach helpful context such as:

- account label
- plan name
- connected domain
- site URL
- plugin version
- WordPress version
- connection status
- last result summary
- last sync status

That means you usually do not need to retype every environment detail manually.

## Before Contacting Support

Try this quick checklist first:

1. Save the post or page.
2. Refresh the editor or settings page.
3. Re-run analysis if the problem involves a stale or outdated result.
4. Check whether the issue is still present.
5. Capture a screenshot if it is.
6. Then send the support request with a short, concrete description.

## Response Expectations

Support requests are easier to resolve when they are:

- specific
- reproducible
- connected to one clear issue at a time

If multiple problems are happening, it is usually better to list them separately rather than blending them into one long report.

## Suggested Support Request Template

You can use this as a simple template:

> **Category:**  
> **Where it happened:** Gutenberg / Classic Editor / Settings  
> **Article or tab involved:**  
> **What I was trying to do:**  
> **What happened instead:**  
> **Approximate time:**  
> **What I already tried:**  
> **Screenshot attached:** Yes / No

## Related Documents

- `USER_GUIDE.md`
- `TROUBLESHOOTING.md`
- `PRIVACY.md`
- `TERMS_OF_SERVICE.md`

This guide is meant to help users send better requests without making them do technical digging first.
