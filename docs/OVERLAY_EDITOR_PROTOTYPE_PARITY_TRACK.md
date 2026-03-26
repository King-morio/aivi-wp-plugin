# Overlay Editor Prototype Parity Track

## Goal
Bring the live overlay editor much closer to the feel of [03-review-studio.html](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/editor-prototypes/03-review-studio.html), while preserving AiVI-specific navigation and block/apply behavior.

## Hard Constraints
- The overlay editor must not render any right-side panel, placeholder, reserve box, or empty chrome.
- The editor canvas must use the maximum practical width inside the overlay.
- The WordPress sidebar stays outside the overlay and should remain visible because the overlay does not consume that area.
- The only contextual editing chrome inside the canvas is:
  - the hover or focus-triggered three-dot handle
  - the menu opened from that handle
- The old top toolbar design must not return in any form.
- The contextual menu must feel like the prototype:
  - compact
  - row-based
  - calm
  - no chip-grid toolbar feel
- The menu should dismiss naturally when the user clicks away, scrolls, or changes block context.

## Current Problems To Correct
- The center document canvas is too narrow because the current shell still reserves width for an internal right column.
- A visible empty box is rendered on the right, which should not exist at all.
- Editing still feels trapped inside aggressive per-block boxes.
- The three-dot handle is not reliably clickable from hover because it sits outside the stable hover zone.
- The current floating menu still feels like the old toolbar was pushed into a popup rather than redesigned.
- The menu can linger, jump position, or feel sticky instead of disappearing cleanly.

## Design Lock
- Keep the left review rail.
- Keep the visible title or H1 at the top of the canvas.
- Keep `Jump to block` and `View details` in the review rail.
- Remove all right-side overlay content.
- Match the prototype feel more closely:
  - wider center document
  - fewer hard block walls
  - smoother reading and editing flow
  - lighter contextual controls

## Milestones

### Milestone 1: Layout Reset
- Remove the visible right placeholder or reserve panel from the live overlay.
- Rebalance the shell so the center editor gets materially more width.
- Keep only the left review rail and center document canvas inside the overlay.
- Ensure the title or H1 remains visible at the top of the document.
Status: implemented locally

### Milestone 2: Menu Parity
- Rebuild the block action menu to match the prototype interaction more closely.
- Replace the current chip-grid menu body with a row-based compact menu.
- Remove the visible `Close` control from the menu.
- Make the three-dot handle reliably clickable on hover or focus without first clicking inside the block.
Status: implemented locally

### Milestone 3: Continuous Editing Feel
- Reduce or remove the trapped block-island feel.
- Make scrolling and clicking feel like one document, not a stack of cells.
- Keep block sync and apply behavior intact while reducing the hard box effect.
Status: implemented locally

### Milestone 4: Regression Lock
- Add focused regressions for:
  - no right-side overlay panel
  - no top toolbar
  - title or H1 rendering
  - left review rail still present
  - prototype-style block menu contract
Status: implemented locally

## Acceptance Criteria
- No empty box appears on the right side of the overlay.
- The editor pane is visibly wider than the current implementation.
- Hovering a block is enough to use the three-dot handle reliably.
- The contextual menu opens and closes cleanly with no sticky or jumping behavior.
- The menu looks and behaves closer to the prototype than to the old toolbar.
- Scrolling feels materially less trapped inside block boxes.
