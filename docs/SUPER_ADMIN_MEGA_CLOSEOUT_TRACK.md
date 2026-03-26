# Super Admin Mega Closeout Track

## Purpose

Close the remaining super-admin gaps in one launch-facing track, with the right order and truth boundaries:

1. keep the new Option C console experience intact
2. add real financial visibility without inventing revenue
3. finish the operator-side support / lifecycle gaps still missing from the current control plane
4. restore MFA **last**, after the remaining verification and UI work is done

This track is the post-audit consolidation of what is still missing after:

- the super-admin auth connection fix
- the billing closeout pass
- the multi-site + ownership hardening pass
- the Growth intro discount implementation
- the Option C parity / scroll / density UI refactor

## Current Confirmed State

Already in place on this branch / staging flow:

1. Cognito Hosted UI + PKCE admin access works in staging when the temporary verification relaxations are present.
2. Super-admin can read accounts, inspect detail, run actions, view diagnostics, and unbind sites.
3. Trial baseline is now `5,000` credits and `7` days, and trial expiry is enforced in entitlement resolution.
4. Growth / Pro multi-site state is real in backend/account state, and customer-side token application now exists on the plugin Connection tab.
5. Cross-account ownership guard is in place for `site_id` / domain conflicts.
6. Growth `50% off` intro pricing is implemented, and the operator has now validated that it works end to end.
7. The super-admin console now matches the approved Option C direction closely enough to use as the launch UI base.
8. A canonical backend financial overview now exists for admin use, with projected recurring value kept separate from observed checkout revenue.
9. The `Financials` KPI now opens a dedicated overlay in the live super-admin shell, backed by the canonical admin financial overview in preview mode and API mode.
10. The `Financials` overlay now includes operator-facing payment-failure visibility, recent manual credit adjustment history, and account watchlists for trial expiry, suspension, low-credit, and high-usage paid accounts.
11. The operator-side site lifecycle flow is now surfaced clearly in the console, with guided token issuance, copyable connection-token output, and explicit reassignment steps beside `site_unbind`.

## Locked Decisions

1. **Restore MFA last.** Do not turn staging Cognito MFA or backend `AIVI_ADMIN_REQUIRE_MFA` back on until the remaining super-admin/financial work is verified.
2. **Do not fake revenue.** Keep projected recurring value separate from realized checkout revenue until renewal collections are stored canonically enough to report them honestly.
3. **Do not overload the main workspace.** Financial reporting should expand from the KPI row into a dedicated overlay, not collapse the center account workspace.
4. **Treat Growth intro pricing as implemented.** The remaining work is doc truth sync and continued validation, not re-implementation.
5. **Do not widen scope into unrelated analysis/AEO work.** This track is only about super-admin, operator workflows, and truthful commercial visibility.

## Remaining Gaps From Audit

These are the gaps still open after the initial audit and truth-sync pass:

1. **Final release gates remain open**
   - the broader orchestrator `index.test.js` still has older billing expectation drift (`503` vs current `409`) that should be reconciled before the final validation sweep
   - true MFA-backed staging sign-in still needs to be revalidated after access to the enrolled authenticator device
   - final live/staging closeout pass still needs to be recorded honestly

## Milestones

### Milestone 1: Truth Sync and Baseline Freeze

Status: `complete`

Goal:

- align all super-admin closeout docs with the state we have actually reached before building the next layer

Files to touch first:

- `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_BILLING_CLOSEOUT_TRACK.md`
- `wp-content/plugins/AiVI-WP-Plugin/docs/COGNITO_JWT_PROJECT_TRACK.md`
- `wp-content/plugins/AiVI-WP-Plugin/docs/POST_COMMERCE_HARDENING_CHECKLIST.md`
- `wp-content/plugins/AiVI-WP-Plugin/docs/PHASE5_M6_E2E_VALIDATION_MATRIX.md`
- `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_CONSOLE_OPTION_C_PARITY_TRACK.md`

Tasks:

- mark Growth intro as operator-validated end to end
- record that the staging console upload now reflects the current Option C-based UI
- keep the temporary MFA relaxations visible as launch blockers, not as hidden drift
- record that `worker/health` API-route drift has already been fixed and durable protection is in place
- freeze the remaining gap list so future work is measured from one source of truth

Acceptance:

- all launch-facing docs agree on what is done, what is still open, and what must be restored before release

Validation recorded on `2026-03-16`:

- updated `SUPER_ADMIN_BILLING_CLOSEOUT_TRACK.md` so it no longer claims:
  - Growth intro sandbox validation is still missing
  - the staging console bundle is still unapplied
  - `PAYPAL_PLAN_ID_GROWTH_INTRO` is still absent
- updated `COGNITO_JWT_PROJECT_TRACK.md` so bootstrap-token retirement is recorded as complete while MFA restoration remains intentionally last
- updated `POST_COMMERCE_HARDENING_CHECKLIST.md` to reflect:
  - JWT authorizer cutover is complete
  - bootstrap-token retirement is complete
  - final MFA-backed hosted validation is still open
- updated `PHASE5_M6_E2E_VALIDATION_MATRIX.md` to record Growth intro pricing as already validated while preserving the scenario as a future regression gate
- updated `SUPER_ADMIN_CONSOLE_OPTION_C_PARITY_TRACK.md` to record the current staging bundle upload/verification as complete

### Milestone 2: Financial Data Contract and Admin Endpoint

Status: `complete`

Goal:

- add one authoritative backend summary for super-admin financial visibility without overstating what the current data model can prove

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/index.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/index.test.js`

Implementation intent:

- add a dedicated read route such as:
  - `GET /aivi/v1/admin/financials/overview`
- aggregate the current trustworthy admin/business metrics:
  - paid accounts
  - active trials
  - suspended / at-risk paid accounts
  - projected MRR from active paid account state
  - observed checkout revenue for week / month / year from stored subscription/top-up intent/order records
  - plan mix by active paid accounts
  - recent monetized events
  - financial watchlist summaries
- keep projected recurring value and observed collected revenue explicitly separate
- return placeholders only where we genuinely cannot compute a truthful number yet

Acceptance:

- there is one canonical backend payload for financials
- no UI code has to infer revenue from random account fragments
- the payload explicitly distinguishes:
  - projected recurring value
  - observed realized checkout revenue

Validation recorded on `2026-03-16`:

- added `GET /aivi/v1/admin/financials/overview` to the orchestrator read surface in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/index.js`
- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js` so the new route is billing-permission gated and returns one canonical financial payload
- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.js` with truthful financial aggregation:
  - active paid account counts
  - active trials
  - suspended paid counts
  - projected MRR from active paid account state
  - observed checkout revenue for trailing `7`, `30`, and `365` days
  - plan mix
  - recent monetized events
  - financial watchlist summaries
  - explicit truth-boundary notes excluding renewal revenue and plan-change collections
- added focused coverage in:
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/index.test.js`
- passed the focused suites / tests:
  - `super-admin-store.test.js`
  - `super-admin-read-handler.test.js`
  - targeted `index.test.js` route coverage for the new financial overview endpoint

### Milestone 3: Financials Overlay UI

Status: `complete`

Goal:

- wire the approved `Financials` KPI expansion into the live super-admin console without disturbing the current Option C workspace

Approved preview reference:

- `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_FINANCIALS_OVERLAY_PREVIEW.html`

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/api-client.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/styles.css`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/mock-data.js`
- `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/admin-console-ui-contract.test.js`

Implementation intent:

- rename KPI `MRR` to `Financials`
- make it clickable
- open an overlay/modal instead of a permanent page takeover
- show:
  - projected MRR
  - paid accounts
  - active trials
  - observed revenue week / month / year
  - plan mix
  - recent monetized events
  - financial watchlist / attention items
- keep the main account workspace intact underneath
- keep the overlay scrollable and readable on the same Option C design language

Acceptance:

- the `Financials` interaction is present in preview mode and API mode
- the overlay uses one clean dedicated surface
- the center account workspace remains focused and uncluttered

Validation recorded on `2026-03-17`:

- updated `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js` to:
  - replace placeholder `MRR` with a clickable `Financials` KPI
  - fetch the canonical admin financial overview in preview mode and API mode
  - open a dedicated overlay with:
    - projected MRR
    - paid / trial / at-risk counts
    - observed checkout revenue windows
    - plan mix
    - recent monetized events
    - watchlist summaries
    - explicit truth-boundary notes
- extended `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/api-client.js` with `getFinancialOverview()`
- added preview-mode financial payload support in `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/mock-data.js`
- added overlay / dialog styling in `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/styles.css`
- extended `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/admin-console-ui-contract.test.js` to lock the new interaction
- passed the focused admin-console diagnostics:
  - `admin-console-ui-contract.test.js`
  - `admin-console-runtime-config-contract.test.js`
  - `super-admin-rollout-safety.test.js`
  - `staging-rollout-prep.test.js`
- rebuilt the staging admin-console bundle with:
  - `control-plane/admin-console/package-admin-console.ps1 -RuntimeConfigPath runtime-config.cognito.staging.js`

### Milestone 4: Finance and Support Operations Surface

Status: `complete`

Goal:

- extend the admin surface from “financial snapshot” into “operable finance/support visibility”

Files likely involved:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/mock-data.js`
- diagnostics tests and UI contract tests

Tasks:

- add payment-failure visibility if current webhook/subscription state can support it truthfully
- add business-wide recent credit adjustment history using audit / ledger data already present
- add financial quick filters / watchlists for:
  - active trials
  - paid
  - suspended
  - near trial expiry
  - high-usage / low-credit accounts
- make the financials surface useful for routine operator checks, not just presentation metrics

Acceptance:

- super-admin can answer finance/support questions quickly without drilling one account at a time

Validation recorded on `2026-03-17`:

- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.js` so the canonical financial payload now includes:
  - payment-failure drilldown rows
  - watch-account lists for:
    - active trials
    - suspended paid
    - near trial expiry
    - low-credit paid
    - high-usage paid
- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-audit-store.js` with recent audit-event listing so business-wide manual credit adjustments can be surfaced safely
- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js` so the financial overview route now enriches the payload with recent manual credit adjustments
- extended the live financial overlay in:
  - `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`
  - `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/mock-data.js`
  - `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/styles.css`
  so operators can see:
  - payment failures
  - recent credit adjustments
  - account watchlists grouped by support/finance risk
- updated focused coverage in:
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/admin-console-ui-contract.test.js`
- passed the focused suites:
  - `super-admin-store.test.js`
  - `super-admin-read-handler.test.js`
  - `admin-console-ui-contract.test.js`
  - `admin-console-runtime-config-contract.test.js`
  - `super-admin-rollout-safety.test.js`
  - `staging-rollout-prep.test.js`

### Milestone 5: Account List Completion

Status: `complete`

Goal:

- bring the authoritative account list closer to checklist-complete operator usability

Files to touch:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/api-client.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`

Tasks:

- add email to the account list search haystack where authoritative email is available
- add real pagination / cursor support instead of hardcoded `next_cursor: null`
- keep the current Option C list usability intact while adding pagination controls only where needed

Acceptance:

- operators can search by the expected customer identifiers more reliably
- larger account sets no longer depend on a fake single-page list

Validation recorded on `2026-03-17`:

- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/billing-account-state.js`, `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/billing-account-state.js`, and `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/shared/billing-account-state.js` so authoritative account state now preserves `contact_email` where it is available
- updated onboarding/connect state writers in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/account-onboarding-handler.js` and `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/account-connect-handler.js` so future account rows retain that search anchor without exposing it through WordPress public payloads
- extended `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-store.js` with real cursor paging and contact-email-aware search, while keeping `listAccountStates()` intact for the existing financial overview path
- updated `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js` so `GET /aivi/v1/admin/accounts` now returns truthful page metadata instead of hardcoded `next_cursor: null`
- updated `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/api-client.js`, `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`, `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/mock-data.js`, and `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/styles.css` so the Option C account browser can search by email, show compact pagination controls, and preserve calmer list usability
- passed focused validation:
  - `infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
  - `infrastructure/lambda/shared/billing-account-state.test.js`
  - `infrastructure/lambda/orchestrator/account-onboarding-handler.test.js`
  - `infrastructure/lambda/orchestrator/account-connect-handler.test.js`
  - `tests/diagnostics/admin-console-ui-contract.test.js`

### Milestone 6: Operator Site Lifecycle Completion

Status: `complete`

Goal:

- finish the remaining operator-side lifecycle gap after `site_unbind` and ownership guard

Files likely involved:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-read-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/account-connect-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js`
- `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_BILLING_CLOSEOUT_TRACK.md`

Tasks:

- expose operator-side token issuance/read flow clearly enough in the console
- decide whether reassignment becomes:
  - guided operator workflow
  - explicit documented multi-step operator process
- make same-site reassignment less error-prone for support staff while keeping ownership protection in place

Acceptance:

- site lifecycle is not just technically possible in code; it is operationally usable by the admin/operator surface

Validation recorded on `2026-03-17`:

- kept the backend lifecycle contract intact and verified that `issue_connection_token` remains the canonical operator action in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-mutation-handler.js`
- extended `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/app.js` with a dedicated `Site lifecycle` workspace section, explicit `Issue connection token` / `Prepare site unbind` guided actions, reassignment instructions, and copyable token output
- extended preview/API parity in `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/api-client.js` so preview mode can exercise token issuance flow honestly
- updated `wp-content/plugins/AiVI-WP-Plugin/control-plane/admin-console/src/styles.css` so lifecycle guidance and token output remain readable within the Option C shell
- locked the lifecycle surface in:
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/admin-console-ui-contract.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/admin-console-runtime-config-contract.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/super-admin-rollout-safety.test.js`
  - `wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/staging-rollout-prep.test.js`

### Milestone 7: Final Validation and MFA Restore

Status: `in_progress`

Goal:

- close the remaining staging/release gate honestly and safely

Important sequence:

- this milestone comes **last**
- begin with pre-final validation cleanup while the temporary staging MFA relaxations remain in place
- restore Cognito MFA and backend `AIVI_ADMIN_REQUIRE_MFA` only after the remaining customer/super-admin drift checks are closed

Files / surfaces to validate:

- `wp-content/plugins/AiVI-WP-Plugin/docs/COGNITO_JWT_PROJECT_TRACK.md`
- `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_BILLING_CLOSEOUT_TRACK.md`
- staging Cognito pool `eu-north-1_nq3A1XRyo`
- staging backend env for `AIVI_ADMIN_REQUIRE_MFA`

Tasks:

- pre-final validation cleanup first:
  - reconcile the older full orchestrator billing expectation drift so the suite reflects the real hosted billing request contract
  - validate remaining customer-version / super-admin interaction drift while staging access stays unblocked
  - rerun the pre-final validation sweep with MFA still deferred
- only after the above is clean:
- restore Cognito MFA to the intended on-state
- restore backend `AIVI_ADMIN_REQUIRE_MFA=true`
- complete one fresh Hosted UI sign-in with the real enrolled authenticator device
- re-run admin API validation after the MFA-backed session is established
- confirm bootstrap/admin bypasses are not left open
- record final closeout validation, including:
  - trial lifecycle
  - Growth intro flow
  - financials surface
  - site lifecycle/operator flow

Acceptance:

- staging is no longer relying on temporary MFA relaxations
- launch-facing docs reflect the final verified state

Progress recorded on `2026-03-17`:

- began `Milestone 7` as a pre-final validation pass with MFA restore intentionally deferred
- reconciled the older orchestrator route-smoke drift in `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/index.test.js` by updating the billing checkout fixture to include a valid `https` site home URL so the route now exercises the intended PayPal-config validation path instead of failing earlier on hosted-billing preconditions
- passed the pre-final validation sweep with MFA still deferred:
  - `infrastructure/lambda/orchestrator/index.test.js`
  - `infrastructure/lambda/orchestrator/billing-checkout-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-store.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-read-handler.test.js`
  - `infrastructure/lambda/orchestrator/super-admin-mutation-handler.test.js`
  - `infrastructure/lambda/orchestrator/account-connect-handler.test.js`
  - `tests/diagnostics/admin-console-ui-contract.test.js`
  - `tests/diagnostics/admin-console-runtime-config-contract.test.js`
  - `tests/diagnostics/super-admin-rollout-safety.test.js`
  - `tests/diagnostics/staging-rollout-prep.test.js`
- current M7 scope remains:
  - validate any remaining customer-version / super-admin drifts while staging access stays open
  - restore Cognito MFA and backend `AIVI_ADMIN_REQUIRE_MFA` only after those drifts are closed

## Suggested Execution Order

1. `Milestone 1` — truth sync first so the track starts from reality
2. `Milestone 2` — backend financial contract
3. `Milestone 3` — live `Financials` overlay
4. `Milestone 4` — finance/support operations surface
5. `Milestone 5` — search + pagination completion
6. `Milestone 6` — operator lifecycle completion
7. `Milestone 7` — MFA restore and final closeout validation

## Acceptance Criteria

This mega track is complete when all of the following are true:

1. The docs no longer understate or overstate the actual current super-admin/billing state.
2. The `Financials` KPI exists and opens a dedicated overlay instead of showing placeholder MRR copy.
3. The overlay reports business-wide financial health using truthful, explicitly-scoped metrics.
4. Finance/support operators can see the most important commercial risk signals without drilling into every single account.
5. Account search/list behavior is closer to checklist parity, including better search coverage and real pagination.
6. Site lifecycle is operator-usable, not just technically possible in backend code.
7. MFA is restored only after all remaining staging verification is done, and one true MFA-backed sign-in is revalidated.

## Notes

- The current financial overlay preview is approved as the design direction:
  - `wp-content/plugins/AiVI-WP-Plugin/docs/SUPER_ADMIN_FINANCIALS_OVERLAY_PREVIEW.html`
- The current live console UI should be treated as the base shell to extend, not reworked again from scratch.
- Keep financial truth boundaries visible in both code and UI:
  - `Projected MRR` is not the same as `observed revenue`
  - `observed checkout revenue` is not the same as `full collected recurring revenue`
- The staging auth relaxations remain intentional temporary blockers, not acceptable steady-state config.
