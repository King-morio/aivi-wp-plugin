# Changelog

All notable public-facing changes to the **AiVI - AI Visibility Inspector** WordPress plugin are documented in this file.

## [1.0.45] - 2026-04-01

### Overlay Stability And Reliability Guardrails

- kept the overlay editor steady while you copy Copilot variants and added a one-click action to copy the full overlay draft
- preserved fuller analyzer explanations in Review Rail details and Copilot notes so issue guidance stays easier to understand and act on
- stopped low-reliability analysis runs from surfacing misleading partials, and now shows a clearer rerun message when reliability drops too far

## [1.0.44] - 2026-03-31

### Copilot Guidance And Scope Safety

- preserved clearer analyzer-led extractability explanations so flagged sections are easier to understand and act on
- stopped Copilot from returning unusable fallback variants when a requested rewrite scope is too wide, and now explains when the section needs a tighter snippet-level repair
- refined Copilot guidance so optional web-verification prompts appear only on issues that actually need source-aware help

## [1.0.43] - 2026-03-31

### Extractability Explanation Preservation

- preserved analyzer-led Answer Extractability explanations all the way into Review Rail so issue summaries no longer flatten into generic serializer wording
- aligned Copilot issue packets and analyzer notes with the preserved explanation pack so rewrite context stays closer to the analyzer's real reasoning
- kept the serializer guardrails, threshold scrub, and UI regression coverage while removing lingering question-style wording drift in section-intent cases

## [1.0.42] - 2026-03-31

### Headline Intent Cue Repair

- taught Analyzer to treat page titles, H1s, and headlines as bounded intent cues instead of automatic strict question anchors
- rewrote answer-extractability fallback wording so delayed openings are explained as headline or section promise fulfillment rather than rigid question-anchor failure
- added focused headline-led fixtures and proof coverage for direct-answer, broad multi-answer, and structured-surface articles
- tightened Copilot helper wording so optional web-verification prompts appear only on issues that actually require user consent

## [1.0.41] - 2026-03-31

### Copilot Messaging And Rhetorical Hook Repair

- refined stored Copilot helper and verification copy so the Review Rail reads calmer and more professionally
- cleared Copilot-owned Review Rail status text on close, dismiss, and focus changes so stale helper messages no longer linger
- aligned the live worker contract around rhetorical hooks, strict anchors, and bounded section intent so explainer-style intros no longer behave like false question-answer anchors

## [1.0.40] - 2026-03-31

### Copilot Validator, Structured Surface, And Section Intent Repair

- retired low-value numeric-claim blocking for verified evidence rewrites so web-backed Copilot variants can return when support is actually found
- normalized Copilot list and structured-surface rewrites into clean bullet text instead of raw HTML list tags
- hardened answer extractability around rhetorical hooks, heading intent, and nearby structured surfaces such as lists and tables

## [1.0.39] - 2026-03-31

### Copilot Consent And Extractability Repair

- repaired the Copilot consent handoff so `Verify first` and `Stay local` choices reliably reach rewrite generation and return three variants when the backend path is available
- tightened the verification wait contract so evidence checks stay quick, report clearer outcomes, and fall back more calmly when verifiable support cannot be confirmed in time
- taught answer extractability to treat rhetorical lead-in questions more intelligently and removed internal threshold math from user-facing guidance

## [1.0.38] - 2026-03-31

### Copilot Shell Alignment

- rebuilt the live Copilot rail shell so the pre-variant and variants-ready states share one calmer editorial surface
- kept Copilot inside the Review Rail takeover area so it no longer spills into the writing canvas during issue work
- removed credit-used chatter from the live Copilot surface and softened verification prompts so the UI feels cleaner and more premium

## [1.0.37] - 2026-03-30

### Copilot Validation Repair

- narrowed preservation enforcement so good Copilot rewrites are no longer rejected for low-value literal drift
- added exact validation diagnostics for missing literals, literal class, and provenance to speed up live diagnosis
- proved the repaired validator path across representative Copilot check families and live lambda gate runs

## [1.0.36] - 2026-03-30

### Copilot Separation And Deploy Safety

- separated Copilot more cleanly from Analyzer-owned diagnosis so the repair surface stays focused on scoped editorial fixes
- improved the Copilot bubble so variants are easier to read, copy, and review without re-showing Analyzer-style explanation
- hardened deploy and packaging safety around the Copilot rewrite route and critical backend modules

## [1.0.35] - 2026-03-30

### Copilot Expansion And Verification

- enabled the expanded Copilot flow so issue-scoped variant generation, evidence-aware help, and calmer guidance can work together more reliably
- added consent-based web verification for trust and support issues, while keeping local-only suggestion paths available when authors prefer them
- refined the Review Rail Copilot bubble so it feels roomier, calmer, and more aligned with the active issue during review

## [1.0.34] - 2026-03-29

### Fix Assist Alignment And Calmness

- improved Fix Assist so Review Rail issue counts and names stay aligned more reliably during review
- grounded Copilot help more cleanly in the selected issue and current article context before suggesting variants
- refined the attached Copilot card so it stays calmer and easier to read while you review findings

## [1.0.33] - 2026-03-29

### Fix Assist Flow Polish

- improved Fix Assist targeting so help follows the active issue more reliably
- made Fix Assist quieter to use by launching it from the Review Rail instead of covering article text by default

## [1.0.32] - 2026-03-29

### Reliability and Guidance

- restored analysis reliability after a live backend packaging regression
- improved the temporary-outage guidance shown in the plugin when AiVI is unavailable

## [1.0.31] - 2026-03-29

### Fix Assist Foundations

- introduced the first AiVI Fix Assist workflow for calmer issue-scoped rewrite help inside the overlay editor
- kept Fix Assist suggestions copy-only so authors stay in control before updating WordPress

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
