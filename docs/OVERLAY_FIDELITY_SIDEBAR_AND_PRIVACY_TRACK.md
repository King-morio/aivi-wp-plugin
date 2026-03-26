# Overlay Fidelity, Sidebar, And Privacy Track

## Goal
- restore trust in the AiVI review rail by making the overlay faithfully mirror article structure, clearly separating editable vs read-only content, and preventing silent contact-email behavior that feels hidden or overreaching

## Guardrails
- keep AiVI's current `node_ref` wrapper model stable so anchoring does not drift while fidelity work lands
- render essential article blocks even when they are not safely editable
- only make safe text blocks editable until the apply/save contract is hardened
- do not silently fall back to WordPress admin email once the new explicit-contact model lands
- if privacy behavior changes, update [PRIVACY.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/PRIVACY.md) in the same track

## Milestones

### M1 - Overlay Fidelity Foundation
- widen overlay rendering fidelity for essential blocks:
  - images
  - tables
  - figures
  - embeds
  - buttons / button groups
  - audio / video / file
  - separators / spacers
- keep non-text/rich blocks visible but explicitly read-only
- preserve existing `data-node-ref` wrappers and highlight anchoring behavior
- add regression coverage so rich-block display support and read-only boundaries do not drift

Write set:
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [aivi-overlay-editor.css](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/css/aivi-overlay-editor.css)
- tests in [tests/js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js)
- this track doc

### M2 - Apply/Save Truth And Safe Rewrite Boundaries
- make the overlay honest about what `Apply Changes` does
- stop lossy structural coercion where prose can be unintentionally converted into lists
- ensure schema insert/apply states communicate that changes are in editor state until WordPress post save
- tighten unsupported-block protection so rail apply never mutates rich blocks indirectly

Write set:
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [aivi-overlay-editor.css](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/css/aivi-overlay-editor.css)
- tests in [tests/js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js)
- this track doc

### M3 - Sidebar Progress Shell Cleanup
- adopt:
  - `Option A` for live progress
  - `Option B` for queued / preflight
- remove duplicated live-category footer messaging
- rebalance message rows so the shell feels polished and intentionally spaced

Write set:
- [aivi-sidebar.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js)
- related sidebar JS tests
- [UX_UI_DECISIONS_BOARD.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/UX_UI_DECISIONS_BOARD.md)
- this track doc

### M4 - Explicit Contact Email And Silent Read Cleanup
- remove silent fallback from WordPress admin email for trial start / routine support prefill flows
- let free trial proceed without an email blocker
- stop auto-prefilling support email from admin email
- reduce routine backend summary/proxy email transmission unless an explicit contact email exists and the flow truly needs it

Write set:
- [class-admin-settings.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php)
- [class-rest-backend-proxy.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-backend-proxy.php)
- related diagnostics/tests
- this track doc

### M4B - Super Admin Trial Recovery Diagnosis And Decision
- diagnose the remaining `Wait for activation` blockage shown on paid plans even when free trial is still active
- review the current super-admin mutation actions against that blocked state
- verify whether the current `end free trial` action actually resolves the targeted account state end to end
- decide the safest operator recovery contract before patching:
  - `recheck activation`
  - `clear activation hold`
  - `end free trial`
  - or a narrower replacement action

Write set:
- inspection only across:
  - [super-admin-mutation-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-mutation-handler.js)
  - [billing-checkout-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/billing-checkout-handler.js)
  - [class-admin-settings.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php)
  - control-plane admin console files if needed
  - this track doc
- no implementation in this milestone

### M4C - Free Trial Abuse Guardrails Diagnosis And Policy
- review safe anti-abuse options for repeated free-trial creation across dummy sites
- explicitly avoid relying on invasive or unstable device fingerprinting as the first solution
- decide the privacy-safe policy before any implementation work begins
- recommend what to key limits against instead:
  - account/site relationship
  - verified contact identity
  - payment-readiness signals
  - operator review thresholds

Write set:
- inspection and policy only across:
  - billing/account state files
  - onboarding handlers
  - privacy docs touched by the decision
  - this track doc
- no implementation in this milestone

### M4D - Approved Recovery Or Abuse-Guard Implementation
- implement only the parts approved after `M4B` and `M4C`
- keep operator recovery and abuse guardrails as separate sub-slices if both are approved

Write set:
- exact files to be confirmed after `M4B` and `M4C`
- this track doc

### M5 - Privacy Policy And Acceptance Sweep
- update privacy documentation to match the final explicit-contact behavior
- run focused regressions across:
  - overlay fidelity
  - overlay apply/save truth
  - sidebar shell
  - privacy/email behavior

Write set:
- [PRIVACY.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/PRIVACY.md)
- [SUPPORT.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/SUPPORT.md) only if support copy materially changes
- [CHANGELOG.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/CHANGELOG.md) only at release time
- this track doc

## Status
- [x] M1 - Overlay Fidelity Foundation
- [x] M2 - Apply/Save Truth And Safe Rewrite Boundaries
- [x] M3 - Sidebar Progress Shell Cleanup
- [x] M4 - Explicit Contact Email And Silent Read Cleanup
- [x] M4B - Super Admin Trial Recovery Diagnosis And Decision
- [x] M4C - Free Trial Abuse Guardrails Diagnosis And Policy
- [x] M4D - Approved Recovery Or Abuse-Guard Implementation
- [x] M5 - Privacy Policy And Acceptance Sweep

## M1 Outcome
- essential rich-block fallback rendering is now explicit for:
  - tables
  - embeds
  - video
  - audio
  - file links
  - button/button groups
  - galleries
  - separators/spacers
  - preformatted/code/verse/html blocks
- overlay block shells now expose explicit editability state:
  - editable safe text blocks remain editable
  - non-text/rich blocks surface as `Read-only`
- the existing `data-node-ref` wrapper model was preserved, so this milestone does not widen or remap anchoring

Validation:
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- --runInBand tests/js/overlay-rich-block-fidelity-regression.test.js tests/js/overlay-redesign-regression.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js`

## M2 Outcome
- the overlay now tells the truth about persistence:
  - `Apply Changes` writes into the WordPress editor state
  - users are explicitly told to click `Update` or `Publish` to make edits live
- schema assist insert/replace messaging now uses the same persistence truth instead of implying live publication
- lossy prose-to-list coercion was removed:
  - explicit bullets, numbered lines, and true line-separated list text still convert
  - ordinary prose no longer gets split into synthetic bullet lists
- review-rail apply now refuses unsafe targets more clearly:
  - rich/read-only blocks return `Read-only block`
  - list-oriented rewrites without safe list markup return `Needs list formatting`
  - unsupported blocks stay untouched instead of being mutated indirectly
- the review rail now carries a persistent note explaining the editor-state behavior before the user clicks apply

Validation:
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- --runInBand tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-schema-assist.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js tests/js/overlay-rich-block-fidelity-regression.test.js tests/js/overlay-redesign-regression.test.js`

## M3 Outcome
- the live analysis shell now follows the approved `Option A` direction more closely:
  - a tighter live-category banner
  - calmer row spacing
  - a cleaner footer with no duplicated category echo
- the queued / preflight state now borrows the approved `Option B` treatment:
  - elapsed time appears inside the start card
  - phase pills make the waiting state feel intentional
  - footer copy explains what this early phase is doing instead of repeating category text
- the duplicated footer message that repeated the current live category was removed entirely
- regression coverage now locks the guided-start shell and the no-duplication contract

Validation:
- `node --check assets/js/aivi-sidebar.js`
- `npm test -- --runInBand tests/js/sidebar-score-ui-regression.test.js tests/js/frontend.test.js`

## M4 Outcome
- the plugin no longer silently falls back to the WordPress admin email for routine AiVI contact identity
- free-trial start no longer opens an email-blocking modal:
  - users can start the trial directly
  - the billing page now exposes an optional visible contact-email field instead
- support context now uses only explicitly stored contact email:
  - support prefill stops borrowing the site admin email automatically
  - support UI shows `Not added yet` when no explicit contact email exists
- routine account-summary refresh now sends contact email only when an explicit one exists, instead of transmitting it on every summary/proxy refresh
- the added note was formalized into:
  - `M4B` for super-admin recovery review
  - `M4C` for free-trial abuse guardrails review

Validation:
- `php -l includes/class-admin-settings.php`
- `php -l includes/class-rest-backend-proxy.php`
- `npm test -- --runInBand tests/diagnostics/billing-dashboard-controls.test.js tests/diagnostics/account-dashboard-contract.test.js`

## M4B Outcome
- the paid-plan blockage is confirmed to be driven by one field:
  - `subscription_status = created`
  - the plan cards treat that as `Awaiting activation` / `Wait for activation` for every non-current paid plan
- the affected live site `https://king.lovestoblog.com/` hit the exact stale-hold path:
  - a PayPal subscription checkout intent was created for account `acct_site_f6752f8380517baa6ddf8e0c`
  - the backend processed `BILLING.SUBSCRIPTION.CREATED`
  - the later return-path reconciliation logged `PayPal subscription return reconciliation lookup failed`
- the super-admin action that was actually used on that affected account was `end_trial`
- `end_trial` is not the correct recovery tool for this blockage:
  - it ends the trial window
  - it re-evaluates `analysis_allowed`
  - it does **not** clear `subscription_status = created`
  - so it cannot unblock paid-plan buttons that are specifically guarded by the activation hold
- the correct operator recovery contract is now clear:
  - primary action: `Recheck activation`
    - maps to `subscription_resync`
    - this should be the first support action because it attempts provider-aware recovery
  - fallback action: `Clear activation hold`
    - maps to `clear_activation_hold`
    - this should be used when the state is still a stale trial activation hold and reconciliation cannot safely resolve it
  - `End trial` should remain trial-state management only, not activation-hold recovery
- live evidence also shows the recovery actions already exist in the super-admin mutation layer and admin console action catalog, so the remaining work is not another diagnosis:
  - it is an implementation/UX follow-up to make the correct actions easier and safer to use for this exact stale-hold case

Validation:
- local inspection of:
  - `includes/class-admin-settings.php`
  - `infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
  - `control-plane/admin-console/src/app.js`
  - `control-plane/admin-console/src/api-client.js`
- live AiVI log inspection on `/aws/lambda/aivi-orchestrator-run-dev` using the default AWS profile only

## M4C Outcome
- the current self-serve free-trial path is already protected at the single-site level:
  - account identity is deterministic per `site_id`
  - local/private URLs are rejected by default for self-serve trial start
  - a site cannot restart a trial once that same account record has trial or paid-plan history
- the current gap is cross-site abuse, not same-site reuse:
  - `accountStartTrialHandler` derives the account only from `site_id`
  - it does **not** currently look for existing trial history by exact `connected_domain`
  - it does **not** maintain a cross-account trial-admission ledger
  - it does **not** throttle or route suspicious self-serve trial bursts into operator review
- that means a user can still create multiple self-serve trials across different public dummy sites, even though the same site cannot restart its own trial
- the privacy-safe policy decision is:
  - do **not** use invasive device fingerprinting
  - do **not** silently restore admin-email harvesting as an identity crutch
  - do **not** make contact email a hard blocker for free-trial start
- recommended anti-abuse policy for implementation:
  - keep self-serve eligibility keyed first by:
    - exact `site_id`
    - exact `connected_domain`
  - add a lightweight trial-admission record so AiVI can see prior self-serve trial claims across accounts
  - reject or divert new self-serve trial claims when the exact public domain already has prior trial history on another account
  - keep explicit contact email as a soft signal only:
    - useful for support consolidation and suspicious-pattern review when the user voluntarily supplies it
    - not required to start the trial
  - add operator-review thresholds instead of hidden surveillance:
    - repeated self-serve claims across many fresh domains in a short window should be surfaced for support/admin review
    - suspicious claims should move to operator-issued onboarding or paid-plan conversion, not silent plugin fingerprinting
- important boundary:
  - first-pass enforcement should use exact connected domain, not broad registrable-domain-family blocking
  - this avoids false positives on shared/free-host platforms where many legitimate users may live under the same parent domain
- recommended implementation shape for `M4D`:
  - add trial-admission lookup + persistence in the onboarding path
  - reuse existing conflict-style checks for exact-domain ownership/trial history
  - expose suspicious trial-admission history in super-admin diagnostics
  - keep the customer-facing trial flow simple and non-creepy

Validation:
- local inspection of:
  - `infrastructure/lambda/orchestrator/account-onboarding-handler.js`
  - `infrastructure/lambda/orchestrator/account-onboarding-handler.test.js`
  - `infrastructure/lambda/orchestrator/account-connect-handler.js`
  - `infrastructure/lambda/orchestrator/shared/billing-account-state.js`
  - `includes/class-rest-backend-proxy.php`
  - `includes/class-plugin.php`

## M4D Outcome
- exact-domain self-serve trial history is now tracked in account state through `trial_admissions`
- self-serve free-trial start now checks for prior exact-domain trial history on other accounts before granting a new trial
- the new domain-level gate is privacy-safe:
  - it uses exact `connected_domain`
  - it does not use device fingerprinting
  - it does not require silent admin-email fallback
- successful self-serve trial starts now persist a lightweight admission record with:
  - source
  - site ID
  - home URL
  - exact connected domain
  - admission timestamp
- the super-admin recovery slice is now safer too:
  - `end_trial` no longer pretends to fix stale activation holds
  - when an account is stuck in `subscription_status = created` with a retry-ready trial hold, `end_trial` now rejects with explicit guidance to use:
    - `Recheck activation`
    - or `Clear activation hold`
- admin-console guidance and preview behavior now match the backend:
  - `End trial` help text warns that it does not clear stale activation holds
  - preview mode now blocks that action for stale activation-hold states with the same guidance
- super-admin diagnostics now expose trial-admission history so exact-domain conflicts can be reviewed without guessing from account drift alone

Validation:
- `node --check infrastructure/lambda/orchestrator/account-onboarding-handler.js`
- `node --check infrastructure/lambda/orchestrator/shared/billing-account-state.js`
- `node --check infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- `node --check infrastructure/lambda/orchestrator/super-admin-diagnostics-handler.js`
- `node --check control-plane/admin-console/src/api-client.js`
- `node --check control-plane/admin-console/src/app.js`
- `npm.cmd test -- --runInBand infrastructure/lambda/orchestrator/account-onboarding-handler.test.js infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js infrastructure/lambda/orchestrator/super-admin-diagnostics-handler.test.js`

## M5 Outcome
- [PRIVACY.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/PRIVACY.md) now matches the current explicit-contact model:
  - it no longer claims the plugin silently falls back to the WordPress admin email as the default AiVI contact identity
  - it now explains that explicit preferred contact email is optional for free-trial and routine account flows
- the privacy document now also discloses the new lightweight self-serve trial-admission history used for exact-domain abuse prevention
- [SUPPORT.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/SUPPORT.md) did not need wording changes for this track
- the focused acceptance sweep passed across:
  - overlay fidelity
  - overlay apply/save truth
  - sidebar shell behavior
  - privacy/email contracts
  - onboarding abuse guard
  - super-admin recovery and diagnostics

Validation:
- `npm.cmd test -- --runInBand tests/js/overlay-rich-block-fidelity-regression.test.js tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-redesign-regression.test.js tests/js/sidebar-score-ui-regression.test.js tests/js/frontend.test.js tests/diagnostics/billing-dashboard-controls.test.js tests/diagnostics/account-dashboard-contract.test.js infrastructure/lambda/orchestrator/account-onboarding-handler.test.js infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js infrastructure/lambda/orchestrator/super-admin-diagnostics-handler.test.js`

Notes:
- Jest also ran the staged public-repo mirror JS suites in `dist/public-repo/_stage/...` during this sweep, and those passed too.
