# AiVI Copilot Agreed Decisions Board

## Purpose

This board captures the currently agreed product, targeting, and UI decisions for `AiVI Fix Assist` so the next repair slice stays aligned with the intended direction.

This is the current source of truth for:

- what Copilot should rely on
- what Copilot should stop relying on
- how the Review Rail and Copilot should relate
- how calm the UI should feel

## Core Product Position

AiVI Copilot is an issue-scoped editorial helper, not a free-form rewrite bot.

It should:

- help with the issue the author actually selected
- stay grounded in the current article and visible section
- offer help on command
- remain copy-only in `v1`

It should not:

- auto-apply text
- take over the editor
- act like a general chatbot
- force rewrites for every issue

## Source of Truth

### Locked decision

Copilot should rely on the true flagged issues surfaced in the Review Rail.

That means:

- the selected Review Rail issue tells Copilot what to fix
- the Review Rail issue tells Copilot why the section was flagged
- local article scanning tells Copilot where the repair area really is

### Demoted to hint-only status

These may still help, but they are not the authority:

- `rewrite_target`
- `signature`
- `node_ref`
- `text_quote_selector`
- analyzer-emitted anchor metadata

Practical rule:

- `Review Rail issue = what and why`
- `local context scan = where`
- `rewrite_target/signature = optional hint`

## Repair Targeting

### Locked decision

Copilot should be local-context-first.

It should try to resolve the repair area in this order:

1. selected Review Rail issue
2. local matched highlighted block if available
3. local section scan using snippet/message/text overlap
4. heading chain and pseudo-heading boundaries
5. analyzer rewrite target as fallback hint only

If the repair area is still ambiguous, Copilot should say so calmly instead of pretending it knows exactly what to rewrite.

### Pseudo headings

Pseudo headings must be treated as real section boundaries when resolving repair scope.

### Important non-goal

Copilot should not depend on analyzer-provided rewrite nodes being perfect before it can help.

## Review Rail Relationship

### Locked decision

The Review Rail remains the canonical visible issue list.

That means:

- the Review Rail count should match the visible issue set the user already sees
- Copilot should not reduce the rail to only rewrite-ready issues
- rewrite-capable metadata can enrich rail items, but should not replace the rail dataset

### Required behavior

- no `Untitled issue` if a usable check name exists
- prefer `check_name`
- else use `name`
- else use canonical resolved check name
- else use `check_id`

## Rewrite Gating

### Locked decision

Copilot should not decide too early that an issue is guidance-only just because the shipped `rewrite_target` is missing or imperfect.

Instead, it should ask:

- can AiVI resolve a local section confidently enough to help?

not:

- did the analyzer give us a perfect rewrite target?

### State model

These states are still valid internally:

- `rewrite_needed`
- `optional_improvement`
- `structural_guidance_only`
- `leave_as_is`

### UI rule

State should not create noise.

So:

- do not loudly present `Guidance only` unless it helps the author
- use a small, quiet state pill only when useful
- if the state label adds clutter, suppress it in the compact UI

## Copilot UI

### Locked direction

Use the attached-stack pattern.

Behavior:

- Copilot stays closed by default
- a small launch pill/icon sits on the active issue card in the Review Rail
- when clicked, the Copilot card opens attached just above that issue
- it should feel like one connected component, not two distant cards

### Size and placement

- the Copilot card width should match the active issue card width
- the Copilot card height can match the issue-card footprint, with internal scrolling if needed
- the card should not float over article paragraphs by default

### Branding

Use:

- AiVI icon
- `Copilot`

Do not introduce a separate bot mascot in `v1`.

### Header behavior

The issue card already carries the issue identity.

So the Copilot card should use a calm top strip, not a second loud heading block.

Preferred top strip:

- AiVI icon
- `Copilot`
- quiet state pill only if useful
- small red `x`

### Check naming

Do not show the raw check ID as a visible headline.

Use the real check name only.

If the issue card title is already visible directly below, the Copilot card should avoid repeating a large duplicate heading unless needed.

## Message Behavior

### Locked decision

The opening helper message should disappear once rewrite variants are surfaced.

Example of acceptable calm helper copy before generation:

- `This section reaches the answer too late. I can suggest tighter openings if you want.`

Once variants are available:

- hide that helper lead
- show the variants area instead

### Copy tone

Copilot language should be:

- calm
- professional
- confident
- non-alarmist

Avoid language that sounds defensive, internal, or overly technical.

### Message rules

Copilot should explain help in product terms, not internal mechanics.

So:

- do not surface phrases about `local grounding`, `release mode`, or missing internal targets in normal user copy
- do not ask the author to do targeting work Copilot should be doing itself
- when Copilot cannot verify a claim, say what it found or did not find and what safer next step the author can take
- when Copilot cannot generate variants, give a short product-facing next step instead of an internal excuse

## Actions

### Locked direction

Actions should be tidy, pill-like, and low-noise.

Preferred actions:

- `Show 3 variants`
- `Why flagged`
- `Keep as is`

### Behavior

- actions should sit inline in a clean row when space allows
- supporting text should open only on click
- action-related explanations should not permanently pollute the compact Copilot card

## Variant and Guidance Display

### Locked direction

The card should prioritize one mode at a time:

- helper mode
- guidance mode
- variants mode

It should not try to show everything at once.

Practical rule:

- before generation: show one calm helper sentence
- on `Why flagged`: show guidance in a contained area
- on `Show 3 variants`: switch into variants mode and hide the helper sentence

## Close Behavior

### Locked decision

The Copilot card should close when:

- the user clicks outside it
- the user clicks the small red `x`
- the user moves away in a way that clears active issue focus

## Credits and Generation

### Locked decision

New Copilot generation consumes credits.

This includes:

- `Show 3 variants`
- any new command that triggers model generation

This does not include:

- already returned analysis explanations
- existing review-rail issue summaries
- local UI state changes

## What We Are Explicitly Avoiding

We are explicitly avoiding a repeat of the old rewrite-agent failure mode where:

- the heading anchor became the rewrite target
- the real problem below the heading was ignored
- signature drift or node drift broke targeting
- missing rewrite nodes caused the assistant to become useless

The Copilot repair model must remain:

- Review Rail issue first
- local context second
- analyzer targeting as optional hint only

## Immediate Implementation Consequences

The next repair slice should:

1. restore the Review Rail as the canonical issue list
2. stop using the rewrite-ready subset as the primary rail data source
3. normalize issue names so `Untitled issue` disappears when a real name exists
4. make Copilot eligibility local-context-first
5. demote `rewrite_target` and `signature` to hint status
6. keep the attached-stack UI but simplify the card header/body/actions
7. hide the helper sentence once variants are shown

## Status

This board reflects the currently agreed direction as of `2026-03-29`.
