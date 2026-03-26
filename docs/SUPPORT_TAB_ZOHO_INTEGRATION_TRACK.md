# AiVI Support Tab + Zoho Desk Integration Track

## Goal

Ship a calmer in-plugin `Support` experience that keeps customers inside WordPress, then connect it safely to Zoho Desk without damaging the existing billing, connection, or plans workflows.

## Milestone 1 - Support Tab UI Lift

Status: Complete

Scope:
- rename the customer-facing tab from `Help` to `Support`
- lift the approved `Option A` support layout into the real plugin
- keep the metadata strip flexible so `Plan`, `Site`, `Email`, and future fields can wrap without cramping
- preserve existing docs / billing / support links while the Zoho wiring is still pending
- avoid touching unrelated layouts or logic

Acceptance:
- the `Support` tab matches the approved calmer two-column layout
- category cards can switch the visible support lane without breaking the rest of the settings screen
- the right-side metadata row wraps cleanly and remains extensible
- no regressions in the existing `Overview`, `Plans`, `Credits`, or `Connection` sections

Completed:
- renamed the customer-facing tab label from `Help` to `Support` while preserving the existing internal tab key so we do not break older hashes or links
- lifted the approved `Option A` support shell into the live plugin
- added local category switching for `Billing & Plans`, `Connection & Setup`, `Analysis & Results`, and `General Support`
- implemented a flexible metadata strip that can expand and wrap without crushing long site or email values
- kept existing docs / billing / support links intact as the bridge until Zoho wiring lands in Milestone 2

## Milestone 2 - Zoho Desk Wiring

Status: Complete

Scope:
- connect the selected support lane to Zoho Desk
- prefill safe site/account context such as plan, site URL, site ID, plugin version, WordPress version, and contact email
- route category-specific support flows cleanly:
  - `Billing & Plans`
  - `Connection & Setup`
  - `Analysis & Results`
  - `General Support`
- keep secrets and privileged config out of unsafe client-side paths

Acceptance:
- the primary action opens or embeds the correct Zoho Desk flow
- category choice carries into the Zoho submission experience
- context is attached consistently and safely
- graceful fallback exists when Zoho is unavailable or not configured

Completed:
- extended the support payload so the plugin can receive safe Zoho Desk ASAP config without exposing secrets client-side
- wired the category-specific `Create ticket` actions to launch Zoho Desk when ASAP is configured, and fall back to the existing support portal when it is not
- attached subject, message, email, plan, site, WordPress version, plugin version, and category-specific context to each support request
- kept the right-side composer editable while moving only the submission step into Zoho Desk
- added focused regression coverage for the support payload shape and the new Support tab ticket hooks

Notes:
- Live Zoho activation still depends on environment values being present for `AIVI_SUPPORT_PROVIDER`, `AIVI_SUPPORT_ZOHO_SNIPPET_URL`, `AIVI_SUPPORT_ZOHO_DEPARTMENT_ID`, `AIVI_SUPPORT_ZOHO_LAYOUT_ID`, and optional `AIVI_SUPPORT_ZOHO_FIELD_MAP`.
- Deploy and plugin packaging remain deferred to Milestone 3, as planned.

## Milestone 3 - Hardening, Packaging, and Rollout

Status: Complete

Scope:
- verify empty, disconnected, and missing-link states
- polish the support copy and spacing only where needed
- package a fresh plugin zip for testing
- deploy only once if rollout is still needed after the Zoho wiring is complete

Acceptance:
- support tab remains stable across connected/disconnected customer states
- targeted diagnostics and PHP lint pass
- plugin package is ready for install
- rollout notes clearly state whether any deploy was required

Completed:
- verified the Support tab hardening path with focused diagnostics and PHP lint after the Zoho Desk wiring landed
- packaged a fresh plugin build for install/testing
- deployed the backend changes once, including the new support payload shape
- confirmed the live `GET /aivi/v1/account/summary` payload now exposes `provider = zoho_desk_asap` and the configured `zoho_asap` object end-to-end

Rollout Notes:
- Backend rollout was required because the live orchestrator was still serving the old support payload shape before deployment.
- Plugin install/update is still required on the customer site to see the in-plugin `Support` tab behavior and ticket actions.

## Notes

- We are deliberately keeping the first pass UI-focused so the Support tab becomes clean before we layer in the Zoho dependency.
- The flexible metadata strip is a first-class requirement, not a polish item, because support context tends to grow over time.
