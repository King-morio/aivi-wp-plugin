# AiVI Copilot Separation Fix Plan

## Purpose

This plan turns the investigation findings in [AIVI_COPILOT_SEPARATION_INVESTIGATION_TRACK.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_SEPARATION_INVESTIGATION_TRACK.md) into a clean fix sequence.

Its job is to get AiVI Copilot to the intended operating model:

- `AiVI diagnoses`
- `Copilot repairs`

This plan is intentionally brain-first.

It does not treat UI polish as success until Copilot can already:

- receive a selected flagged issue
- read the right local article section
- reason live from a clean prompt payload
- return `3` strong fix variants
- demonstrably solve the flagged issue before the next milestone proceeds

## Locked Product Behavior

### AiVI Analyzer

- analyzes the article
- flags issues
- scores and prioritizes them
- explains why they were flagged
- owns `why flagged`

### AiVI Copilot

- does not analyze
- does not score
- does not re-explain the analyzer diagnosis
- receives one selected flagged issue plus the local text it needs
- reasons live from that scoped input
- helps the author repair the issue

### Copilot non-goals

- no serializer-authored conversational copy
- no templated helper text pretending to be intelligence
- no dependence on `rewrite_target` or `signature` as authority
- no auto-apply in `v1`
- no UI/body work accepted as complete if the generation brain is still weak

## What Must Be Fixed

### Broken coupling we are explicitly removing

- deterministic Copilot helper strings in the overlay
- analyzer-authored `Why flagged` inside the Copilot surface
- Review Rail fallback issue shells driving Copilot behavior
- Copilot gating that depends too heavily on analyzer rewrite metadata
- serializer-authored Copilot-facing explanation material
- deploy drift that allows the live rewrite route to disappear

### Behavior we are explicitly introducing

- one selected issue drives one Copilot session
- one local section is resolved from live editor context
- one focused repair goal is sent to the model
- the model returns fix-oriented output, not analyzer-like explanation
- web-backed verification is optional and consented, never automatic

## Hard Acceptance Rule

No milestone after the prompt-and-brain validation section may be considered complete unless Copilot proves it can fix a simulated flagged issue with `3` usable variants.

That proof is not:

- a mock response
- a templated helper string
- a serializer-authored explanation
- a UI screenshot

That proof is:

- a real model call
- using the intended Copilot prompt payload
- against a scoped flagged issue packet
- returning `3` variants
- each variant judged against the flagged issue

## Fix Principles

- keep Analyzer and Copilot payloads separate
- keep Copilot issue-scoped
- prefer live editor context over analyzer anchor metadata
- use analyzer output as notes, not as Copilot voice
- validate the brain before polishing the body
- if Copilot cannot help, say so in product language, not internal failure language

## Copilot Input Contract

The Copilot request payload should be intentionally small and issue-scoped.

### Copilot should receive

- selected issue ID
- selected issue name
- flagged issue summary in analyzer-note form
- local target excerpt
- nearby section context
- heading chain
- preserve constraints
- do-not-invent constraints
- desired repair mode
- optional verification consent and results

### Copilot should not receive as conversational content

- serializer-authored helper prose
- `review_summary`
- `issue_explanation`
- `explanation_pack`
- `Why flagged` display copy
- analyzer-flavored mode labels intended for UI

### Copilot may receive as hint-only metadata

- `rewrite_target`
- `node_ref`
- `signature`
- `text_quote_selector`

These are hints only.

They do not decide whether Copilot can help.

## Prompt Payload Standard

The Copilot prompt must be customized cleanly for the selected issue and should read like a focused editorial assignment, not like a generic rewrite request.

### Required prompt sections

- `Task`
  - one sentence describing the exact repair objective
- `Selected issue`
  - issue name
  - short analyzer note about what is wrong
- `Target text`
  - exact local excerpt to repair
- `Local section context`
  - nearby supporting sentences or section text
- `Constraints`
  - what must stay true
  - what must not be invented
  - tone and factual safety rules
- `Success target`
  - what a fixed result must achieve for this specific issue
- `Output contract`
  - return exactly `3` variants
  - each variant must be materially different
  - each variant must directly address the flagged issue

### Prompt quality rules

- no generic "improve this text" phrasing
- no vague "make it better" instructions
- no multi-issue repair in one request
- no analyzer-style explanation dump inside the prompt
- no lazy default framing that can produce templated filler

### Example of the intended style

Instead of:

- `Improve the answer so it is more concise.`

Use:

- `The selected issue is Answer Snippet Concise. The opening answer is reusable in meaning but too overloaded for clean quoting. Rewrite only the opening answer so it stands alone as a concise, directly quotable answer. Keep the facts intact. Do not add claims, numbers, or sources not already supported by the provided context. Return 3 variants that differ in rhythm and compression, but all solve the snippet problem.`

## Proof Harness Before UI Work

This is the critical gate.

### Simulation scenario

Use a known issue type:

- `Original answer buried deep in prose`

### Example simulation input

Issue:

- `Immediate Answer Placement`

Analyzer note:

- `The section reaches the answer only after setup instead of leading with it.`

Source prose:

- `Solar eclipses happen for a number of reasons tied to orbital motion, observation position, and the relationship between the Earth, Moon, and Sun. Because these bodies move continuously and because the Moon's path is tilted relative to Earth's orbit, the exact geometry has to line up very precisely. When that alignment happens, the Moon passes between Earth and the Sun, blocking all or part of the Sun from view.`

Repair goal:

- produce an opening answer that states the answer directly, cleanly, and in a reusable way

### Required Copilot output

Copilot must return `3` variants such as:

- a direct concise answer
- a slightly fuller answer with one support sentence
- a balanced answer optimized for quote reuse

### Variant gate

The team may proceed only if all `3` variants:

- answer the question directly in the opening
- remove the burial problem
- stay faithful to the provided text
- avoid invented facts
- can plausibly stand alone for AI quoting and citation reuse

### Failure conditions

The simulation fails if any returned variant:

- still buries the answer in setup prose
- adds new unsupported claims
- becomes generic filler
- sounds like template sludge
- solves a different issue than the one selected

### Evidence required to pass the gate

- stored test fixture input
- raw prompt payload used
- raw model output
- scored pass/fail notes against the flagged issue
- updated regression test covering the same scenario

## Milestones

### M1. Define the clean Copilot issue packet

- identify the single normalized issue packet Copilot should consume
- remove conversational Copilot authorship from serializer outputs
- keep Analyzer explanation fields for Analyzer surfaces only
- document the exact fields Copilot may and may not consume

Reference:

- [AIVI_COPILOT_ISSUE_PACKET_CONTRACT.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_ISSUE_PACKET_CONTRACT.md)

Exit criteria:

- Copilot has a documented minimal input contract
- no Copilot UI copy depends on serializer-authored helper prose

### M2. Rewire the Review Rail to hand off real selected issues

- make the selected flagged Review Rail issue the only user-facing authority
- stop using fallback recommendation shells as the main Copilot source
- ensure the selected issue always carries a stable name and issue identity

Exit criteria:

- no `Untitled issue` when a usable name exists
- selected rail issue maps to one stable Copilot packet

### M3. Build local-first section resolution

- resolve the repair area from live editor content
- use selected issue notes plus local excerpt matching
- use heading and pseudo-heading boundaries
- demote analyzer `rewrite_target` and `signature` to hint-only status

Exit criteria:

- Copilot can resolve a repair area from live article context without depending on analyzer anchor perfection

### M4. Build the dedicated Copilot prompt composer

- create a dedicated prompt builder only for Copilot
- do not reuse analyzer/serializer explanation framing
- separate prompt sections cleanly
- lock the output contract for `3` strong variants

Exit criteria:

- Copilot prompt payload is issue-scoped, compact, and repair-oriented
- prompt text is customized, not generic

### M5. Run the simulation gate and block progress until it passes

- create a test fixture for `Immediate Answer Placement`
- run real generation through the Copilot prompt path
- inspect the raw variants
- score each variant against the flagged issue
- refine prompt and payload until all `3` variants pass

Exit criteria:

- all `3` variants clearly fix the simulated flagged issue
- pass evidence is stored in tests or fixtures

M5 close-out note:

- `M5` is complete for the core separation proof gate.
- the required live simulation for `Immediate Answer Placement` now passes end to end through the deployed Copilot rewrite path with `3` passing variants
- proof assets now exist in:
  - `tools/run-copilot-simulation-gate.js`
  - `tools/copilot-simulation-gate-lib.js`
  - `fixtures/copilot/immediate-answer-placement-buried-prose.fixture.json`
  - `fixtures/copilot/gate-reports/immediate-answer-placement-buried-prose.fixture.latest.json`
- the Copilot prompt composer is now grounded in check-definition rules for the answer/snippet family instead of relying on generic rewrite framing
- no Analyzer or Review Rail surface redesign was required to reach this proof point

Supplemental note carried forward:

- a verify-first named-source fixture was also added as an early evidence-assist probe:
  - `fixtures/copilot/external-authoritative-sources-epilepsy-source-gap.fixture.json`
- that verify-first path already proved two important things:
  - AiVI can obtain live related web support through the current verifier flow
  - Copilot can turn that support into source-aware repair variants
- one small scorer-normalization cleanup remains around recognizing long-form authority names from verification results
- that cleanup is useful, but it is part of the broader evidence-assist path and does not block `M6`
- full verification hardening remains owned by `M7`

### M6. Expand fix-mode coverage after the brain is proven

- route deterministic and semantic checks into repair modes
- allow Copilot to attempt repair for any issue type it can genuinely help with
- keep schema and technical issues in truthful assist modes where appropriate

Exit criteria:

- Copilot can attempt real assistance across the supported check set
- supported modes are explicit and not mislabeled as “guidance only” when repair is possible

M6 close-out note:

- `M6` is complete locally.
- Copilot mode routing is now explicit across the supported repair families instead of leaning on brittle implicit fallbacks.
- the core separated mode map now covers:
  - `local_rewrite`
  - `structural_transform`
  - `schema_metadata_assist`
  - `web_backed_evidence_assist`
  - `limited_technical_guidance`
- key repairs from this milestone:
  - intro cleanup issues like `intro_wordcount` and `intro_readability` now route into real local rewrite assistance
  - heading-support issues like `heading_topic_fulfillment` now route into local repair instead of sounding like the wrong structural mode
  - clearly technical issues like `no_broken_internal_links` stay in truthful technical guidance even when a block is selected
  - author/schema-style issues stay in metadata/schema assist instead of pretending to be normal prose rewrites
  - freshness and source-backed checks route into evidence assist rather than generic rewrite fallback
- the Copilot prompt composer now adds family-level repair standards for newly expanded categories, so broader supported checks are less likely to collapse into generic fix language

M6 validation note:

- focused tests now cover:
  - intro rewrite routing
  - heading-support routing
  - technical-guidance truthfulness
  - schema-assist truthfulness
  - evidence-assist routing
- the `Immediate Answer Placement` simulation gate remains green after the M6 coverage work

Carry-forward note:

- `M6` does not yet harden full verify-first source behavior as a milestone blocker
- deeper verification-specific behavior, consent flow hardening, and fallback wording remain owned by `M7`

### M7. Add consented web-backed evidence assist

- only for issue types where verification materially helps
- require explicit user consent before search/verification
- if support is found, use it to shape safer variants
- if support is not found, return a calm, clean message explaining that no verifiable support was found

Example safe fallback:

- `I could not find verifiable support for that claim from the current context and quick verification step. Consider tightening the wording, adding a named source, or removing the unsupported claim.`

Exit criteria:

- no automatic web verification
- evidence-backed issues can take either local-only or verify-first paths

M7 close-out note:

- `M7` is complete.
- web-backed evidence assist remains consented only. `local_only` keeps the request fully local, while `verify_first` performs the bounded evidence check before generation.
- the live proof fixture at [external-authoritative-sources-epilepsy-source-gap.fixture.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/external-authoritative-sources-epilepsy-source-gap.fixture.json) now passes end to end against the deployed Copilot path, with all `3` variants scoring cleanly.
- the latest stored report is [external-authoritative-sources-epilepsy-source-gap.fixture.latest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/gate-reports/external-authoritative-sources-epilepsy-source-gap.fixture.latest.json).
- regression coverage now locks both halves of the milestone:
  - `local_only` performs no web verification
  - `verify_first` returns source-aware variants when closely related support is found

M7 validation note:

- focused tests pass for:
  - [evidence-verifier.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/evidence-verifier.test.js)
  - [rewrite-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.test.js)
  - [copilot-simulation-gate.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/copilot-simulation-gate.test.js)
- live verify-first simulation passes through the deployed lambda using the default AiVI AWS identity.

### M8. Rebuild the Copilot surface around the brain

- remove `Why flagged` from Copilot
- keep `Why flagged` in Analyzer surfaces only
- ensure the opening Copilot message is live and issue-aware if shown at all
- use a calm attached bubble over the Review Rail with enough room for results
- optimize the variants view for actual reading and copying

Exit criteria:

- Copilot UI is a repair surface, not an analyzer duplicate
- no internal-system phrasing leaks into user copy
- variants are readable without cramped, self-defeating scrolling

M8 close-out note:

- `M8` is complete locally.
- Copilot no longer surfaces `Why flagged` inside its own bubble. Analyzer and Review Rail diagnosis surfaces remain intact, including `View details`.
- the opening Copilot line is now repair-oriented and issue-aware instead of acting like a second analyzer summary.
- the attached bubble now has more room over the Review Rail, and the variants view is optimized for reading and copying instead of stacking cramped controls and explanation text in one row.
- variant cards now separate:
  - label
  - main rewritten text
  - short explanation
  - copy/dismiss actions

M8 validation note:

- focused overlay regressions pass for:
  - [overlay-fix-assist-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-fix-assist-regression.test.js)
  - [overlay-redesign-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-redesign-regression.test.js)
  - [overlay-pass-filter-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-pass-filter-regression.test.js)
- the Copilot surface no longer contains the `Why flagged` label in runtime code.

### M9. Lock deploy and route safety

- guarantee `POST /aivi/v1/rewrite` stays live in dev deploys
- guarantee any future Copilot route remains covered by route reconciliation
- keep packaging tests aware of Copilot-critical files and modules

Exit criteria:

- live route drift cannot silently disable the Copilot brain

M9 close-out note:

- `M9` is complete locally.
- the deploy script now treats `POST /aivi/v1/rewrite` as a critical reconciled HTTP API route on the dev API instead of leaving the Copilot brain path implicit.
- critical route reconciliation now runs from one route list so Copilot and admin safety routes are visible in one place.
- orchestrator archive assertions now explicitly protect Copilot-critical modules:
  - `rewrite-handler.js`
  - `rewrite-target-resolver.js`
  - `fix-assist-contract-builder.js`
  - `evidence-verifier.js`
  - `fix-assist-triage.js`

M9 validation note:

- focused deploy diagnostics pass for:
  - [deploy-route-drift-guard.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/deploy-route-drift-guard.test.js)
  - [release-package-safety.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/release-package-safety.test.js)
- the separation plan is now fully closed through `M9` on the local code path.

## Validation Matrix

### Functional validation

- selected issue opens the correct Copilot session
- Copilot reads the correct local section
- Copilot returns `3` variants on supported issues
- variants materially repair the selected issue

### Separation validation

- analyzer copy does not appear inside Copilot as if it were live thought
- Copilot does not re-explain diagnosis that Analyzer already owns
- serializer does not author Copilot opening messages

### Safety validation

- no invented facts in variants
- no unsupported evidence inserted without verification
- no auto-apply behavior

### UX validation

- Copilot stays quiet until invoked
- bubble has enough room for content
- helper copy disappears once variants are shown
- user is never shown internal mechanics or excuse text

## Recommended Build Order

1. `M1`
2. `M2`
3. `M3`
4. `M4`
5. `M5`

Stop here and prove the brain.

Only after `M5` passes:

6. `M6`
7. `M7`
8. `M8`
9. `M9`

## Definition Of Success

Copilot is successful when a user can:

- click a flagged issue
- open Copilot
- receive `3` live, strong, issue-specific repair variants
- trust that those variants are grounded in the selected issue and local article context
- copy one without feeling they were given generic filler or analyzer leftovers

Short form:

- AiVI says what is wrong
- Copilot helps fix it
- the fix is proven before the polish ships
