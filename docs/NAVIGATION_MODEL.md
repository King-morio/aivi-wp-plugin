# Navigation Model - Fast Editing, No Cognitive Load

This document describes the issue instance navigation system implemented in the AiVI WordPress plugin sidebar.

## Overview

The Navigation Model enables fast, deterministic navigation between detected issue instances inside the WordPress editor. Users can navigate using `<` and `>` controls in the sidebar or keyboard shortcuts `[` and `]`.

## Single-Line Issue Row Format

Each issue row renders as exactly one line:

```
[✕|⚠️] Issue Name                    < 1 / 5 >
```

### Components

| Element | Description |
|---------|-------------|
| **Verdict Icon** | `✕` (fail, red) or `⚠️` (partial, yellow) |
| **Issue Name** | Static text, no wrapping, ellipsis on overflow |
| **Instance Nav** | `< current / total >` - only shown if `instances > 1` |

### Rules

- No inline text expansion
- No explanation text in sidebar
- No highlights preview in sidebar
- No counts other than `current / total`
- Single instance issues: `< >` controls hidden, row still clickable

## Navigation Controller

Located in `assets/js/aivi-sidebar.js`, the `NavigationController` object manages all navigation logic:

```javascript
NavigationController = {
    // Cyclic navigation (wraps around)
    cyclicPrev(current, total)  // first → last
    cyclicNext(current, total)  // last → first

    // Navigate to specific instance
    navigateToInstance(checkId, instanceIndex, totalInstances, nodeRefs, detailsToken)

    // Keyboard navigation
    setFocusedIssue(issue, instanceIndex, setInstanceIndexFn, detailsToken)
    initKeyboardNav()
    destroyKeyboardNav()
}
```

### Cyclic Navigation

Navigation wraps around:
- At first instance, `<` jumps to last instance
- At last instance, `>` jumps to first instance

## Editor Highlighting

When navigating to an instance:

1. **Scroll**: Editor smoothly scrolls to target block
2. **Highlight**: Target receives `.aivi-nav-highlight` class
   - Blue outline (2px solid)
   - Subtle blue background tint
   - Duration: ~1.8 seconds
3. **Focus**: Block is selected in Gutenberg (if supported)

### CSS Classes

```css
.aivi-nav-highlight {
    outline: 2px solid #2563EB;
    outline-offset: 2px;
    background-color: rgba(37, 99, 235, 0.08);
}
```

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `[` | Previous instance (same as `<`) |
| `]` | Next instance (same as `>`) |

### Activation

1. User clicks an issue row
2. That issue becomes the "focused issue"
3. Keyboard shortcuts now navigate that issue's instances
4. Clicking a different issue changes the focused issue

### Restrictions

- Disabled when user is typing in input/textarea
- Only works when an issue is focused
- Only works for multi-instance issues

## Tooltip Support

Hovering over verdict icons shows a static tooltip:

| Verdict | Tooltip |
|---------|---------|
| `fail` | "This issue must be fixed for extractability." |
| `partial` | "This issue partially meets extraction criteria." |

Tooltips are:
- Static UI copy (not AI-generated)
- One short sentence maximum
- No mentions of AEO/GEO, thresholds, or word counts

## State Management

### Per-Issue State

Each issue tracks its own `current_instance_index`:

```javascript
const [instanceIndex, setInstanceIndex] = useState({});
// { "check_id_1": 0, "check_id_2": 2, ... }
```

### Rules

- Switching issues: index resets to 0 only for new issue
- Switching categories: does NOT reset instance index
- State is local to editor session
- State is NOT persisted to database
- State resets on page reload

## Data Flow

```
User clicks < or >
    ↓
NavigationController.cyclicPrev/Next(current, total)
    ↓
Update instanceIndex state
    ↓
NavigationController.navigateToInstance(...)
    ↓
If nodeRef cached → highlightEditorBlock(nodeRef)
Else → fetchInstanceHighlight() from details endpoint
    ↓
Editor scrolls + highlights block
```

## Details Endpoint Integration

For instances without cached `node_ref`:

```javascript
POST /backend/analysis-details
{
    "details_token": "...",
    "check_id": "single_h1",
    "instance_index": 2  // zero-based
}
```

Response includes `highlight.node_ref` for navigation.

## Files Modified

| File | Purpose |
|------|---------|
| `assets/js/aivi-sidebar.js` | NavigationController, IssueAccordion, CSS |

## Files NOT Modified

- Analyzer prompts
- Check definitions
- Analysis serializer (already locked)
- Category grouping logic
