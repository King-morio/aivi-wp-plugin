# AiVI Co-Pilot Fix Assist Spec

## Goal

Add a disciplined, issue-scoped co-pilot to AiVI that appears only after analysis completes, follows the author as they move through flagged blocks, and offers on-demand help without reopening the old unsafe auto-apply path.

The co-pilot should:

- understand the full article context, not just the highlighted node
- understand the specific AiVI issue being surfaced
- decide whether a rewrite is required, optional, or not recommended
- generate high-quality, tightly constrained rewrite variants only on command
- remain copy-only in `v1`

The co-pilot should not:

- auto-rewrite content
- auto-apply content into WordPress
- behave like an open-ended chatbot
- rewrite a heading when the actual issue lives in the answer text below it
- push cosmetic rewrites when the current answer is already extractible

## Billing Policy

The co-pilot is not free-form UI sugar. If it triggers a new model generation, it should consume credits.

This includes:

- advisory generation on command
- rewrite variant generation
- copy-editing generation
- structure guidance generation when a model call is required

This does not include:

- already-available analysis explanations returned from the completed run
- static issue summaries already present in the sidebar or overlay payload
- local UI state changes such as opening, closing, or moving between flagged blocks

Practical rule:

- `Show 3 variants` should consume credits
- any on-demand `Help me fix this` generation should consume credits
- `Why this was flagged` should not consume credits if AiVI can answer from the existing analysis payload without a new generation request

## Product Position

This should be framed as an editorial co-pilot, not a rewrite bot.

Recommended product name:

- `AiVI Fix Assist`

Why:

- it sounds purposeful, not gimmicky
- it matches the current review-and-fix workflow
- it keeps AiVI in the foreground instead of inventing a separate mascot product

## Visual Identity

### Recommended v1 treatment

Use the existing AiVI icon/mark, not a separate bot image.

Why:

- it keeps the co-pilot feeling native to AiVI
- it avoids giving the impression that a second personality or separate AI system is taking over
- it feels more trustworthy in a professional editorial workflow

### When to consider a separate helper image later

Only introduce a helper/bot illustration if:

- the co-pilot becomes a major standalone feature surface
- you want a more conversational assistant personality
- the visual style can stay premium and non-cartoonish

For `v1`, the better move is:

- AiVI icon or badge
- `Fix Assist` label
- subtle status state such as `Ready`, `Reviewing`, `Variants prepared`

## Entry Conditions

The co-pilot appears only when all of the following are true:

- analysis has completed successfully
- AiVI has current `overlay_content` and recommendation data
- the current editor position or selected issue resolves to a flagged block or flagged section

The co-pilot remains quiet when:

- the current block is not tied to an issue
- the current issue is document-level and has no reasonable block-local repair scope
- the issue is not rewrite-eligible

## Core Interaction Model

### Default posture

The co-pilot is docked and quiet by default.

It should not open as a chat transcript.

It should appear as a compact assistance panel that updates when the user:

- jumps from the review rail
- clicks a flagged block
- moves to another flagged block

### Initial prompt style

The opening message should be calm, professional, and confident.

Example:

`This section was flagged for answer clarity. I can help tighten the answer without changing its meaning.`

Or, for optional improvements:

`This answer is already extractible. A list format could improve scanability, but it is optional.`

### Primary actions

Recommended first actions:

- `Show 3 variants`
- `Why this was flagged`
- `Keep as is`

Possible secondary actions:

- `Show scope`
- `Compare current answer`
- `Regenerate`
- `Copy variant`

## Two-Layer Targeting Model

The original rewrite-agent failure came from treating the highlighted node as the rewrite target.

This spec fixes that by separating:

- `anchor`
- `repair_scope`

### Anchor

The anchor is where AiVI surfaces the issue in the UI.

Examples:

- a heading
- a paragraph
- a list block
- a review-rail issue row

### Repair Scope

The repair scope is the actual text region the co-pilot should inspect and, if needed, rewrite.

The repair scope must be resolved from context, not blindly copied from the anchor.

## Grounding Priority

Fix Assist should ground itself in this order:

1. the selected Review Rail issue defines what is wrong and why it matters
2. the live article context in the editor defines where the repair should happen
3. analyzer-emitted anchors such as `rewrite_target`, `signature`, `node_ref`, and `text_quote_selector` act only as optional hints

Analyzer anchors may still help when they line up with the live article context, but they must never override clearer local evidence from the current draft.

Practical rule:

- `Review Rail issue` = what to fix and why
- `live local article scan` = where to fix it
- `rewrite_target` and `signature` = assistive metadata only

## Section Scope Resolution

For section-shaped issues, the co-pilot should inspect:

- the heading
- the first answer paragraph below it
- the next supporting paragraph or list
- the full section boundary until the next real heading or pseudo heading

### Pseudo Headings

Yes, pseudo headings should be treated as section boundaries too.

That means the resolver should stop not only at true heading blocks, but also at strong heading-like transitions such as:

- short standalone lead-in lines that behave like headings
- bold or emphasized intro lines that open a new section
- question-style lines that function as the section prompt
- paragraph blocks with heading-like length, punctuation, and visual isolation

This matters because many articles use informal structure instead of perfect heading blocks.

If the co-pilot ignores pseudo headings, it will over-read the next idea and generate low-trust fixes.

### Scope Resolver Output

For each issue, the resolver should produce:

- `anchor_node_ref`
- `primary_repair_node_ref`
- `repair_node_refs`
- `section_start_node_ref`
- `section_end_node_ref`
- `boundary_type`
  - `heading`
  - `pseudo_heading`
  - `document_end`
- `scope_confidence`

## Repair Necessity Triage

Before offering rewrites, the co-pilot should classify each issue into one of four states:

- `rewrite_needed`
- `optional_improvement`
- `structural_guidance_only`
- `leave_as_is`

This triage is essential.

Without it, the co-pilot will become noisy and over-prescriptive.

### Example: extractible sentence that could be a list

If the heading is:

`What are the three states of matter?`

And the answer is:

`The three states of matter are solid, liquid, and gas.`

Then the co-pilot should recognize:

- the answer is direct
- the entities are explicit
- the sentence is already extractible
- list conversion is an enhancement, not a necessary correction

Recommended response style:

`This answer is already clear and extractible. Converting it to a list may improve scanability, but it is optional. I would keep it as-is unless you want a more list-forward presentation.`

That is the tone target.

## Eligible Fix Modes

Not every issue should route to rewrite generation.

The co-pilot should support multiple fix modes:

- `rewrite`
- `tighten`
- `expand_support`
- `suggest_structure`
- `metadata_guidance`
- `manual_fix_steps`
- `no_change_recommended`

### Good rewrite/tighten candidates

- answer snippet not concise
- answer buried below filler
- vague heading
- indirect FAQ answer
- how-to step clarity
- bloated intro answer
- weak trust phrasing that needs tightening

### Better as guidance, not rewrite

- single H1
- missing alt text
- schema mismatch
- temporal freshness warning
- unsupported-claim patterns that need sourcing
- document-level structure issues

## Repair Contract

Every co-pilot generation must be driven by a repair contract, not a free-form prompt.

Required contract fields:

- `check_id`
- `check_name`
- `issue_summary`
- `repair_mode`
- `severity`
- `rewrite_necessity`
- `must_preserve`
- `must_change`
- `do_not_invent`
- `tone_guard`
- `scope_guard`
- `section_context`
- `article_context`

### Example guardrails

`must_preserve`

- factual claims
- named entities
- numbers
- dates
- required meaning

`must_change`

- verbosity
- indirect lead-in
- unclear answer shape
- unsupported softness

`do_not_invent`

- no new facts
- no new statistics
- no new claims of authority
- no fabricated sources

## Variant Generation

When the user asks for help, the co-pilot should produce exactly three disciplined variants.

Suggested labels:

- `Most concise`
- `Balanced`
- `Evidence-first`

Each variant should include:

- the proposed text
- a short note on what changed
- a short note on what was preserved
- a risk note only if needed

Example:

- `Changed: shortened the opening answer and made the entities explicit.`
- `Preserved: original claim, scope, and article intent.`

## UI Shape

### Placement

Best `v1` placement:

- docked panel inside the overlay/editor context
- visually attached to the current flagged issue
- persistent while the author moves through flagged areas

### Minimum states

- `idle`
- `available`
- `reviewing`
- `ready_with_variants`
- `guidance_only`
- `no_change_recommended`
- `error`

### Suggested panel anatomy

- AiVI icon + `Fix Assist`
- issue label
- short verdict line
- calm explanation
- action buttons
- variants list when requested

## Calm Language Standard

The co-pilot should sound:

- calm
- professional
- specific
- non-alarmist
- non-pushy

Avoid:

- `You must rewrite this`
- `This is bad`
- `Critical fix required` for optional opportunities

Prefer:

- `I’d tighten this`
- `This is already usable`
- `This is optional, not required`
- `I would keep this as-is unless you want a different presentation style`

## Safety Model

### `v1` output mode

`v1` should be `copy-only`.

The user can:

- review variants
- compare variants
- copy variants

The co-pilot must not:

- write directly into WordPress
- replace editor blocks automatically
- mutate content on block change

### Why this matters

AiVI already learned that automatic apply is the dangerous part.

This co-pilot should inherit the safer manual-copy posture from the current overlay model, not fight it.

## Telemetry

Recommended telemetry events:

- `copilot_panel_seen`
- `copilot_issue_bound`
- `copilot_help_requested`
- `copilot_variants_generated`
- `copilot_variant_copied`
- `copilot_keep_as_is_selected`
- `copilot_generation_failed`

Do not log:

- raw article text
- raw rewritten text
- user content snippets

Log only:

- check id
- repair mode
- rewrite necessity state
- node ref count
- success/failure state

## Implementation Milestones

### M1 - UI Shell

- add docked `Fix Assist` panel
- bind it to current issue/block context
- support quiet `available` and `guidance_only` states

### M2 - Scope Resolver

- separate anchor from repair scope
- resolve section windows
- support pseudo-heading boundaries
- emit scope confidence

### M3 - Triage Engine

- classify issues into:
  - `rewrite_needed`
  - `optional_improvement`
  - `structural_guidance_only`
  - `leave_as_is`

### M4 - Repair Contracts

- map eligible checks into strict repair contracts
- define preservation/change rules per check family

### M5 - Variant Generation

- generate 3 disciplined variants on command
- return structured notes for each variant
- keep everything copy-only

### M6 - Safety and Telemetry

- lock copy-only behavior
- add focused telemetry
- regression-test heading-anchor and pseudo-heading scope resolution

## Acceptance Criteria

The feature is ready when:

1. A heading-anchored issue can correctly target the answer paragraph below the heading.
2. A section boundary can stop at a pseudo heading, not only a real heading block.
3. The co-pilot can explicitly say a suggested rewrite is optional.
4. The co-pilot can explicitly say no rewrite is recommended when the current answer is already extractible.
5. Variants remain meaning-preserving and do not invent facts.
6. No generated text is auto-applied to the editor.
7. The author can copy a chosen variant manually into the correct block.

## Recommended Next Move

If we build this, the clean first implementation slice is:

- `M1 UI Shell`
- `M2 Scope Resolver`
- `M3 Triage Engine`

That sequence proves the intelligence model before any generation cost is introduced.
