# Changelog

All notable public-facing changes to the **AiVI - AI Visibility Inspector** WordPress plugin are documented in this file.

## [1.0.30] - 2026-03-27

### Final Validation Cleanup

- cleaned final packaging compatibility details for a smoother WordPress.org validation pass

## [1.0.29] - 2026-03-27

### Validation Compatibility Polish

- refined WordPress admin compatibility and packaging validation polish for a smoother release check

## [1.0.28] - 2026-03-27

### Compatibility And Validation Polish

- improved WordPress.org compatibility and admin safety handling across the settings and backend flows
- cleaned packaging compatibility details for a smoother validation pass

## [1.0.27] - 2026-03-27

### Documentation Delivery Polish

- kept the bundled walkthrough screenshots clear while making the plugin package much lighter to install and distribute
- preserved the customer-facing documentation flow and image guidance inside WordPress admin

## [1.0.26] - 2026-03-27

### Documentation And Guidance Polish

- refined the in-plugin guides so the privacy, support, and user-help content read more clearly for everyday users
- kept the Documentation tab focused on customer-facing help content by default while preserving advanced docs for explicit enablement later
- simplified connection guidance and reduced technical wording in the plugin interface

## [1.0.25] - 2026-03-26

### Documentation Refresh

- improved the in-plugin documentation experience with bundled walkthrough screenshots
- revised documentation rendering so guide images and list markers display more reliably inside WordPress admin

## [1.0.24] - 2026-03-26

### Submission Copy Polish

- refined the distributed plugin description, public author, and WordPress.org contributor metadata
- simplified readme and changelog language so the submission package stays focused on user-facing changes
- kept the current overlay, sidebar, and submission-readiness fixes intact in the clean release package

## [1.0.23] - 2026-03-26

### Overlay Block Actions Regression Fix

- restored the block actions popover to a slimmer footprint so it no longer dominates the editorial pane
- fixed outside-click dismissal so the block actions menu closes reliably when authors click away
- kept the wider writing stage and review-rail readability improvements from `1.0.22` intact

## [1.0.22] - 2026-03-26

### Overlay Layout Rebalance

- widened the overlay editorial stage so authors have more room to read and write comfortably
- reduced the review rail width just enough to stop it crowding the document area while keeping issue details readable
- kept the safer manual-copy overlay model and restrained sidebar edge glow intact in the same release

## [1.0.21] - 2026-03-26

### Safer Overlay Editing UX

- replaced the risky top overlay apply controls with a calmer manual copy-and-paste guidance flow
- changed inline rewrite variants to copy revised text for manual paste instead of auto-applying into the editor
- aligned overlay guidance copy with the safer manual-review workflow

### Sidebar Visual Polish

- added the approved restrained edge glow treatment to the live analysis banner and progress rows
- kept the glow CSS-only and static so the panel feels more premium without adding noisy neon motion

## [1.0.20] - 2026-03-26

### Overlay Apply Hotfix

- fixed a regression where `Apply Changes` could rewrite or wipe unchanged blocks below the edited area
- changed overlay apply to commit only blocks that were actually edited inside AiVI
- normalized editable list round-tripping so list blocks no longer collapse into broken placeholder output
- tightened apply messaging so the confirmation dialog matches the safer staged-block behavior

## [1.0.19] - 2026-03-26

### Overlay Apply And Extractability Hardening

- hardened overlay apply integrity across both Gutenberg and Classic editor paths so AiVI verifies committed content before reporting success
- blocked unsafe preview-only apply paths that could otherwise risk lossy editor overwrites
- tightened `Answer Extractability` explanation release so impossible templated word-count math is replaced with calmer snippet guidance

### Post-Body Image Fidelity

- preserved textless post-body image blocks through preflight, serializer preview output, and missing-alt anchoring
- improved overlay-visible image fidelity while keeping image and alt-text scope limited to post-body content only

## [1.0.18] - 2026-03-26

### Final WordPress.org Package Readiness

- improved packaging, translation loading, and readme alignment for WordPress.org submission
- moved bundled documentation into runtime-safe locations while keeping the in-plugin Documentation tab working
- removed update-suppression behavior from the distributed plugin package

## [1.0.17] - 2026-03-26

### WordPress Distribution Readiness

- tightened text-domain and translators-comment discipline so release packages stay WordPress.org-friendly
- aligned the packaged plugin around the `ai-visibility-inspector` install slug
- cleaned up placeholder-bearing strings and distribution metadata for submission readiness

## [1.0.16] - 2026-03-25

### Temporal And Overlay Apply Clarity

- tightened `temporal_claim_check` so locally anchored interval advice like `after 48 hours` no longer gets treated like a missing article-date problem
- made `Apply Changes` the clear commit point into the WordPress editor for supported overlay edits instead of silently mirroring article text as you type
- added a post-apply reveal flow that closes the overlay, scrolls Gutenberg to the changed block, briefly highlights it, and reminds the author to `Update` or `Publish`

## [1.0.15] - 2026-03-25

### Overlay And Sidebar Fidelity

- improved the overlay editor so rich article blocks like tables, embeds, galleries, code, and separators stay visible in context instead of disappearing during review
- clarified that `Apply Changes` writes into the WordPress editor and still requires the normal `Update` or `Publish` action to make changes live
- removed unsafe paragraph-to-list coercion and tightened apply safety around unsupported rich blocks
- refined the live analysis sidebar with a calmer progress shell, better queued-state presentation, and less duplicated messaging

### Privacy And Trial Controls

- stopped silently using the WordPress admin email as AiVI's default contact email
- made the billing contact email visible and optional so free trial can begin without a hidden email fallback
- hardened self-serve trial admission checks with exact-domain history while keeping the approach privacy-safe and explicit in the bundled privacy guide

## [1.0.14] - 2026-03-25

### Live Analysis And Review Rail Fixes

- activated live semantic guardrails earlier so question-led list sections are less likely to misfire as FAQ opportunities during async analysis
- restored verdict-oriented issue badges in the editor sidebar and moved `High impact`, `Recommended`, and `Polish` to the overlay review rail where they were intended to appear
- rebalanced the live analysis progress panel and added a clearer time expectation note for longer runs

### Billing Recovery And Support Controls

- improved PayPal activation recovery so cancelled or invalid trial upgrade attempts can return to retry-ready state instead of remaining stuck on `Wait for activation`
- added a safer support recovery path in the admin console with `Recheck activation` and `Clear activation hold`

## [1.0.13] - 2026-03-25

### Review And Score UX

- added review-rail impact pills so surfaced issues now read as `High impact`, `Recommended`, or `Polish` instead of feeling equally urgent
- added a global score quality pill so the main score is easier to interpret at a glance
- updated AEO and GEO ring colors to use simple score bands, making weak category scores look more honest without adding extra clutter

### Settings Flow Cleanup

- fixed the Plans spotlight CTA so `Choose your plan` now lands directly on the Plans tab and plan grid
- kept the rest of the in-settings routing aligned with the existing tab-state model so internal jumps land where users expect

## [1.0.12] - 2026-03-25

### Schema Insert Conflict Hardening

- hardened schema insertion so AiVI now checks existing editor and rendered-page schema before inserting new JSON-LD
- added safer insert outcomes across the overlay experience so schema assists can append, replace one clear AiVI-managed block, skip exact matches, or switch to copy-only when another schema source already exists
- improved schema-assist release messaging so the editor clearly shows whether AiVI is ready to insert, ready to replace, already present, or blocked by an external conflict

### Editor and Release Safety

- preserved duplicate awareness across reruns and later editing sessions by carrying stronger schema-assist identity metadata and conflict-policy hints through the release path
- kept the overlay draft compatibility and serializer release layers aligned so conflict-aware schema assists stay stable across worker and orchestrator output
- shipped the new overlay review states without adding a heavy schema management panel

## [1.0.11] - 2026-03-24

### Structural Detection and Deterministic Guidance

- improved ItemList detection so strong visible lists under real headings and heading-like section labels no longer get missed as schema candidates
- added a deterministic heading-markup check for bolded or otherwise heading-like text that should use real heading tags
- kept structural release behavior cleaner across sidebar and overlay surfaces for the new heading-markup and ItemList findings

### PayPal Retry Recovery

- restored failed or cancelled PayPal free-trial activation attempts back to a true retry-ready state from the return path when the provider confirms a terminal status
- cleared the stale blocked-plan messaging path so guarded plan cards show the right local explanation instead of the misleading billing-not-ready error
- preserved the existing free-trial access while removing the stuck `Wait for activation` state for retry-ready customers

## [1.0.10] - 2026-03-24

### Semantic Opportunity Governance and Release Stability

- taught opportunity-style semantic checks clearer pass shapes, non-trigger rules, and contrastive examples so they stop overreaching on acceptable content formats
- hardened shared structural truth for visible lists, pseudo-lists, question-led sections, FAQ candidacy, and procedural signals
- added worker-side semantic guardrails so list, FAQ, and HowTo opportunities respect structural evidence before release
- collapsed duplicate cross-block semantic releases into one canonical issue in sidebar, details, and overlay surfaces

### Billing and Deterministic Review Continuity

- preserved the recent PayPal pending-subscription safety fixes and deterministic review ownership cleanup in the current release package
- kept deterministic guidance, schema checks, and machine-readable release behavior aligned across worker and orchestrator paths

## [1.0.9] - 2026-03-23

### Billing Activation and Retry Safety

- kept customers on their existing trial or active plan until PayPal confirms subscription activation
- cleared failed or cancelled pending subscription attempts back into a retry-ready state
- improved billing status handling so stale "waiting for PayPal" states clear more reliably after failure or cancellation

### Check Ownership and Deterministic Guidance

- removed deterministic-owned checks from the AI analyzer surface so semantic analysis stays focused on judgment-heavy review
- retired the fake intro composite check and redistributed intro ownership and scoring cleanly
- expanded deterministic guidance coverage and added stronger machine-readable schema checks for article pages and strong visible lists

## [1.0.8] - 2026-03-06

### Packaging and Release Hygiene

- improved packaging hygiene so release ZIPs ship a cleaner runtime surface
- tightened the public plugin baseline before distribution

### Security and Runtime Hardening

- removed unnecessary client-side runtime exposure for backend-related configuration
- tightened token and runtime handling used by analysis-result flows
- improved packaging and repository hygiene around local artifacts

### Editor and Runtime Refinements

- improved the analysis sidebar experience for the current `1.0.8` baseline
- preserved overlay/editor behavior while tightening release discipline and package boundaries
