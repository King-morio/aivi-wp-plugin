Non-Analysis Issues: Findings & Recommended Fixes

- Scope: Developer-quality issues unrelated to the core analysis pipeline, identified during codebase review
- Goal: Stabilize preflight/UX contracts, tidy admin/dashboard behaviors, and remove minor sources of confusion before addressing analysis-specific bugs

1) Preflight response shape mismatch
- Symptoms
  - Preflight currently returns token_estimate, while various UI/test paths read tokenEstimate.
  - Example usage: aivi-sidebar auto-run references preResult.data.tokenEstimate.
  - Location: [class-rest-preflight.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-preflight.php#L207-L216)
- Impact
  - UI heuristics can fail to read the token value; tests may diverge depending on expectation.
- Recommendation
  - Return both keys for backward compatibility: tokenEstimate (camelCase) and token_estimate (snake_case).
  - Optionally add withinCutoff boolean for convenient UI gating.
- Implementation sketch
  - In success and “too long” branches, include both keys:
    - 'tokenEstimate' => $token_estimate, 'token_estimate' => $token_estimate
    - 'withinCutoff' => $token_estimate <= $cutoff
  - Do not rename existing keys to avoid breaking callers.

2) Empty content preflight contract
- Symptoms
  - Endpoint returns ok=false with reason=empty_content (current behavior).
  - Legacy unit test expects ok=true and tokenEstimate=0 for empty content.
  - Locations:
    - Behavior: [class-rest-preflight.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-preflight.php#L125-L135)
    - Test: [Test-Preflight.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/unit/Test-Preflight.php#L36-L49)
- Impact
  - Test failure if enabled; mismatch confuses expectations of consumers.
- Recommendation
  - Keep ok=false for empty content so the UI clearly blocks analysis.
  - Update or remove the legacy expectation in Test-Preflight to assert ok=false and reason=empty_content.
- Implementation sketch
  - Adjust Test-Preflight to require ok === false and reason === 'empty_content' for empty content.

3) I18n text domain consistency
- Symptoms
  - Mixed domains are used ('aivi' in plugin header vs 'ai-visibility-inspector' across strings).
  - Examples: [class-admin-settings.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php#L66) and many other includes.
- Impact
  - Translation tools and .pot extraction may miss strings; inconsistent domain reduces localization quality.
- Recommendation
  - Standardize on the plugin’s header text domain: aivi.
  - Replace 'ai-visibility-inspector' with 'aivi' everywhere the domain is specified.
- Implementation sketch
  - Grep through includes and update __()/esc_html__()/esc_js() domain arguments to 'aivi'.
  - Verify by extracting a .pot to ensure coverage.

4) Localized string encoding glitch
- Symptoms
  - The localized title contains a mojibake em-dash: “AiVI â€” AI Visibility Inspector”.
  - Location: [class-assets.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-assets.php#L151-L162)
- Impact
  - Visual glitch in the UI language pack and a low-grade quality issue.
- Recommendation
  - Replace with the proper em-dash “—” and ensure the file is UTF‑8 encoded.
- Implementation sketch
  - Update the 'text.title' string to “AiVI — AI Visibility Inspector”.

5) Analyze dispatch comment vs behavior
- Symptoms
  - Comment says “Non-blocking request to avoid PHP timeout” but code passes 'blocking' => true to wp_remote_post.
  - Location: [proxy_analyze](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-backend-proxy.php#L1099-L1110)
- Impact
  - Confusing to future maintainers; risk of incorrect refactors.
- Recommendation
  - Update the comment to reflect current intentional behavior (blocking = true to synchronously validate 202 and provide immediate run_id/poll_url).
  - Leave the request as-is unless we identify real timeout issues in-field.
- Implementation sketch
  - Edit comment above the request and remove references to “Non-blocking”.

6) Undefined variables in admin settings inline script
- Symptoms
  - Inline script in render_settings_page_static references $is_connected, $current_subscription_status_code, and $current_plan_code which are not defined within that method’s scope.
  - Locations:
    - Inline usage: [class-admin-settings.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php#L622)
    - Definitions exist in render_customer_dashboard_panel: [class-admin-settings.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php#L998-L1020).
- Impact
  - PHP notices in environments with display_errors or strict logging; potential wrong runtime values embedded in JS.
- Recommendation
  - Compute $account_state = self::get_account_state() early in render_settings_page_static and derive:
    - $is_connected, $current_plan_code, $current_subscription_status_code
  - Use those variables for the embedded JS echo.
- Implementation sketch
  - Before the <script> block in render_settings_page_static:
    - $account_state = self::get_account_state();
    - $is_connected = ! empty( $account_state['connected'] ) && ( $account_state['connection_status'] ?? '' ) === 'connected';
    - $current_plan_code = sanitize_text_field( (string) ( $dashboard_state['plan']['plan_code'] ?? $account_state['plan_code'] ?? '' ) );
    - $current_subscription_status_code = strtolower( sanitize_text_field( (string) ( $dashboard_state['plan']['subscription_status'] ?? $account_state['subscription_status'] ?? '' ) ) );
  - Retain server-escaped echo usage inside script.

7) Legacy settings test file (unused, stale class)
- Symptoms
  - tests/test-settings.php references AiVI_Admin_Settings (legacy), and is not included by phpunit.xml test suites.
  - Location: [tests/test-settings.php](file:///c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/test-settings.php#L1-L186)
- Impact
  - Confusing reference point for contributors; inconsistent API expectations.
- Recommendation
  - Either delete the file or update it to Admin_Settings and place it under tests/unit with the current contract.
  - Prefer removal if redundant with existing unit coverage.

Verification Plan
- JS
  - Run lint/tests: npm run lint && npm test
  - Validate sidebar auto-run reads tokenEstimate and respects withinCutoff when added.
- PHP
  - Run unit tests with WP test bootstrap (composer test). Ensure updated Preflight test passes.
  - Exercise admin settings page to confirm no PHP notices are emitted and inline JS receives correct values.

Milestones

- Milestone 1: API shape alignment and UI text polish
  - Changes
    - Add tokenEstimate alongside token_estimate in preflight responses and include withinCutoff.
    - Fix the “AiVI — AI Visibility Inspector” encoding in localized text.
    - Align unit test for empty-content preflight to expect ok=false with reason=empty_content.
  - Files Touched
    - includes/class-rest-preflight.php
    - includes/class-assets.php
    - tests/unit/Test-Preflight.php
  - Verification
    - npm run lint && npm test
    - composer test (focus on preflight tests)
  - Risk
    - Low; backward compatible response keys and text-only polish.

- Milestone 2: Admin settings inline variable safety
  - Changes
    - Define $is_connected, $current_plan_code, $current_subscription_status_code in render_settings_page_static before use in the embedded script.
  - Files Touched
    - includes/class-admin-settings.php
  - Verification
    - Open AiVI settings; ensure no PHP notices and the billing auto-refresh script evaluates consistently.
  - Risk
    - Low; scoped to admin settings rendering.

- Milestone 3: Maintenance clarity
  - Changes
    - Correct the analyze dispatch comment in proxy_analyze to reflect current blocking behavior.
    - Remove or modernize tests/test-settings.php referencing legacy classes; relocate under tests/unit if kept.
  - Files Touched
    - includes/class-rest-backend-proxy.php
    - tests/test-settings.php (remove or refactor)
  - Verification
    - composer test passes; grep for legacy class references.
  - Risk
    - Low; comment-only plus test cleanup.

- Milestone 4: I18n text domain consolidation
  - Changes
    - Standardize all translation calls to use the aivi text domain.
  - Files Touched
    - includes/**/*.php where translation functions appear.
  - Verification
    - Spot-check by extracting a .pot and confirming domain uniformity; run PHP tests.
  - Risk
    - Medium; broad search-and-replace across strings, functionally safe but wide-reaching.

Notes
- These changes are isolated from the analysis runtime and should not affect Lambda-side behavior.
- I will implement in small commits to simplify review and allow quick rollback if needed.
