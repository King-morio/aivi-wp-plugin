# AiVI Documentation Surface Track

## Goal

Turn the Support-side Documentation action into a real in-product AiVI documentation surface that feels native to the settings page and works in packaged plugin builds.

## Principles

- Keep the experience inside the current AiVI settings shell.
- Make documentation usable without requiring an external hosted docs URL.
- Preserve external billing/support links where they are still the better destination.
- Package the markdown guides needed by the in-plugin documentation renderer.
- Keep the implementation public-safe and contributor-friendly.

## Milestones

### M1 - Routing and entry flow

- Add a first-class `Documentation` settings tab.
- Add internal documentation URLs that can deep-link to a specific article.
- Route Support category documentation actions into the internal docs surface where appropriate.

### M2 - Documentation surface and renderer

- Add the Option A-style documentation hub layout to the settings page.
- Render the current markdown guides inside WordPress with a lightweight safe formatter.
- Add grouped navigation, article metadata, and related actions.

### M3 - Packaging and validation

- Include the required documentation files in the plugin ZIP.
- Validate the settings page PHP, tab behavior, and packaging flow.
- Keep the public snapshot aligned with the same documentation baseline.

## Completion Notes

- Added a first-class `Documentation` tab to the AiVI settings shell.
- Routed support-side documentation actions into internal docs articles where that is now the better default.
- Added a lightweight markdown renderer so the current public guides can be read inside WordPress without a hosted docs URL.
- Updated the plugin package allowlist so the documentation files ship with the plugin ZIP.
- Validation passed with PHP lint, targeted settings diagnostics, and a packaged ZIP that now contains the bundled guides.
