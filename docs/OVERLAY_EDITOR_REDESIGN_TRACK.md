# Overlay Editor Redesign Track

## Goal
Replace the jumpy block-card overlay with a calmer review workspace that keeps navigation reliable while letting the document read like one continuous editing surface.

## Locked Direction
- Chosen direction: `Option 3 - Review Studio`
- This direction is now the production target for the AiVI overlay editor.

## Production Constraints
- Review rail lives on the **left** side of the editor.
- The center column is the clean writing/review canvas.
- The existing WordPress or AiVI score sidebar remains visible on the **right**.
- Do **not** ship the prototype paste/import panel.
- Do **not** ship the prototype explainer strip or mock instructional copy.
- Remove the always-visible formatting toolbar at the top of the overlay editor.
- Footer recommendations migrate into the left review rail.
- `Jump to block` remains available from the rail.
- `View details` remains available from the rail.

## Why This Direction Won
- It keeps the document surface calmer than stacked block cards.
- It makes recommendations the primary navigator instead of a footer dump.
- It preserves jump-to-block utility without making overlay highlighting the only path.
- It fits AiVI's real workflow better than a pure writing canvas because review and navigation stay visible.

## Current Diagnosis
- The overlay currently renders from `getBlocks()` and does not inject the WordPress post title field into the document canvas.
- In WordPress/Gutenberg, the post title often lives outside block content, so the overlay can omit the specimen article H1/title entirely.
- The current top toolbar also adds visual noise and reinforces the “editor inside cards” feeling instead of a calmer review surface.

## Layout Lock
- Left: AiVI review rail
  - failed and partial issues
  - `Jump to block`
  - `View details`
- Center: clean editor canvas
  - visible article title/H1 at the top
  - minimal chrome
  - no hard card walls between blocks
  - soft structural cues only
- Right: existing WordPress or AiVI results sidebar
  - may be visually overlaid by transient block-action menus when needed

## Block Interaction Lock
- Replace the current always-visible top formatting toolbar with a contextual block handle.
- Each editable block gets a three-dot handle only on hover/focus.
- Clicking the handle opens a compact action menu for that specific block.
- The action menu should support:
  - paragraph or heading style changes
  - insert line/block
  - move line/block
  - return to block or cancel
  - copy link if needed later
- The menu should appear to the right side of the screen so it can float over sidebar space instead of crowding the canvas.
- The menu disappears when focus leaves the block context.

## Title/H1 Plan
- Treat the WordPress post title as first-class specimen content in the overlay.
- Source the title from the editor title field, not only from block content.
- Render it as the visible top heading in the center canvas even when no `core/heading` block exists.
- Keep title updates and block updates distinct internally:
  - title field sync remains separate from block-body sync
  - title should not be silently dropped because it is not part of `getBlocks()`

## Implementation Notes
- Recommendation records remain the canonical issue list.
- Overlay highlights become a secondary affordance derived from the same issue contract.
- Scrolling should target the main document canvas only, not nested block cells that trap focus.
- Clicking inside a block must not make the user feel constrained inside a separate card.
- The contextual block menu should be the only formatting chrome in the center canvas.
- The review rail replaces the old footer recommendation stack.

## Milestones

### Milestone 1: Shell and Title Foundation
- Replace the single-column overlay body with a three-zone shell:
  - left review rail
  - center document canvas
  - right sidebar reserve
- Surface the WordPress post title as the visible top heading even when it does not exist as a block.
- Keep current editing behavior intact while establishing the new layout foundation.
Status: implemented locally

### Milestone 2: Review Rail Migration
- Move footer recommendations into the left review rail.
- Make the review rail the primary issue navigator.
- Preserve `Jump to block` and `View details` from the rail.
Status: implemented locally

### Milestone 3: Contextual Block Actions
- Remove the always-visible top formatting toolbar.
- Add the per-block three-dot handle on hover/focus. (I have added this: Make the three-dot handle on hover/focus sit at the right of the screen as the compact floating menu. In the prototype, it sits at the left)
- Open a compact floating action menu on the right side of the screen.
Status: implemented locally

### Milestone 4: Smoothness and Polish
- Reduce block-card feel with softer canvas styling.
- Improve jump and focus behavior so scrolling feels continuous, not trapped.
- Add regression coverage for title rendering, rail population, and toolbar/menu behavior.
Status: implemented locally

## Start Point
- Start with `Milestone 1`.
- Do not lose the production constraints above while implementing later milestones.
