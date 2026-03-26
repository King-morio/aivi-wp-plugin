# Check Rule Reconciliation and Overlay Actions Track

## Purpose

Reconcile a set of review-rail checks and overlay actions before implementation so:

- user-facing rules match real AEO/GEO/editorial value
- deterministic vs semantic boundaries are clean
- schema-related actions are exposed only where they are useful and technically supportable
- the overlay details surface gains the right actions without breaking the existing editor flow

This track is active. Milestone 1 implementation starts from the assumptions locked below.

## External Constraints and Evidence

These should inform the rule changes:

- Google FAQ rich results are currently limited to authoritative health/government sites.
  - Source: Google Search Central FAQPage docs
- Google HowTo rich results are deprecated in Search.
  - Source: Google Search Central updates / How-to deprecation notice
- Meta descriptions should be unique and descriptive, not keyword lists.
  - Source: Google Search Central snippet/meta description guidance
- Article schema should align visible headline/title and article metadata.
  - Source: Google Search Central article structured data guidance

Implication for AiVI:

- FAQ / HowTo schema checks should remain useful as machine-readability and content-structure guidance
- but they should not be framed as universal SERP-win rules
- they should be framed for AEO/GEO citability and structured-answer readiness in AI answer engines
- their trigger logic must be narrower than it is now

## Current Landmines

1. `View details` in the review rail is visually always open because CSS forces `.aivi-overlay-review-details` to `display:flex`, overriding `hidden`.
2. `intro_first_sentence_topic` is approved for removal. It is not strong enough as a standalone AEO/GEO scoring rule.
3. `faq_structure_opportunity` is currently question-anchor gated and too eager for non-FAQ article types.
4. `faq_jsonld_generation_suggestion` is semantic today, but the desired behavior is really deterministic candidate detection plus generate/copy/insert.
5. `howto_schema_presence_and_completeness` currently overlaps conceptually with the deterministic `howto_jsonld_presence_and_completeness`.
6. `single_h1` counts only actual H1s in `content_html`, not the visible WordPress title rendered outside body content.
7. `metadata_checks` has no document-level fill UI yet, and the write-back target is unresolved.
8. `semantic_html_usage` has overlay generation plumbing nearby, but backend schema-assist wiring does not yet support that check.
9. `intro_schema_suggestion` already has deterministic draft support; any plan should reuse that instead of rebuilding a second path.
10. FAQ and HowTo rule changes touch prompt, check definitions, preflight detection, schema-assist generation, scoring neutrality, and rail rendering. They must move together.

## Milestones

### Milestone 1: Overlay/UI Fixes

Goal:

- fix clear UI bugs and document-level actions without changing semantic scoring behavior

Scope:

- fix `View details` hide/show behavior in review rail
- add metadata fill-in UI in details for `metadata_checks`
- define and implement the write-back target for metadata fields
- expose existing generate/copy/insert actions cleanly for:
  - `intro_schema_suggestion`
- wire new generate/copy/insert actions for:
  - `semantic_html_usage`

Decisions to lock during implementation:

- metadata write-back target:
  - preferred first target: plugin-managed document metadata state used by AiVI/REST and persisted through WordPress post meta
  - avoid writing directly into third-party SEO plugin fields in the first pass
- `semantic_html_usage` output form:
  - generate semantic markup plan first
  - allow copy
  - only allow insert if we can map safely to block transforms without corrupting content

Acceptance:

- `View details` only opens on click
- metadata details expose editable fields instead of only advice text
- intro schema suggestion supports generate/copy/insert in a stable way
- semantic HTML usage supports generate/copy, and insert only if safe

### Milestone 2: Intro and H1 Rule Reconciliation

Goal:

- remove or refine checks that are weak, confusing, or implemented against the wrong content surface

Scope:

- remove `intro_first_sentence_topic` entirely from rule definitions, scoring, release, and UI surfaces
- refine `intro_wordcount` detail copy so it states the actual bucket thresholds:
  - optimal `40-60`
  - acceptable `61-120`
  - too short `<10`
  - too long `>120`
- keep `intro_schema_suggestion` deterministic and make its recommendation basis clearer in UI copy
- fix `single_h1` so the visible WordPress title/H1 is included in the evaluated article body or manifest

Acceptance:

- `intro_first_sentence_topic` is gone from the product
- `single_h1` no longer fails when the article visibly has one title/H1
- intro word count messaging is explicit and useful
- sidebar category/release surfaces stay aligned after the intro-check removal

### Milestone 3: FAQ and HowTo Rule Tightening

Goal:

- separate FAQ and HowTo candidate detection from schema generation and from semantic structure evaluation

Scope:

- `faq_structure_opportunity`
  - keep semantic
  - make it appear only for real FAQ-candidate articles/sections
  - suppress it for non-FAQ article classes
- `faq_jsonld_generation_suggestion`
  - convert to deterministic candidate detection + schema generation path
  - require clear FAQ-ready patterns before it appears
- `howto_schema_presence_and_completeness`
  - make this deterministic-only
  - trigger only when article/section is clearly instructional
  - support generate/copy/insert
- `howto_semantic_validity`
  - keep semantic
  - evaluate whether content semantics really behave like ordered instruction flow
  - do not mix it with schema presence

FAQ candidate suppression classes to consider as default non-candidates:

- narrative opinion/editorial pieces
- news/opinion commentary without repeated user questions
- pure essays/explainers with topical subheadings only
- broad inspirational/thought-leadership content
- product/category landing copy without explicit Q&A intent
- single-answer definitional articles unless they clearly contain multiple reusable user questions

FAQ candidate positive patterns to require:

- multiple explicit user-question headings or sentences
- short answer blocks that directly answer those questions
- reusable Q&A pairs that stand alone without heavy narrative dependency
- compact answer spans, not long essay sections

HowTo candidate positive patterns to require:

- title or section intent clearly instructional (`how to`, `step`, `process`, `setup`, etc.)
- ordered steps or clearly sequential actions
- list or heading patterns that imply execution order
- section-level step support, not just general advice bullets

Landmine:

- Google no longer shows HowTo rich results in Search, so this should be framed as structure/schema quality and machine-readability help, not promised SERP gain

Acceptance:

- FAQ and HowTo checks no longer fire on weak topical lookalikes
- deterministic schema-generation checks and semantic validity checks are clearly separated
- FAQ/HowTo details can generate copy/insert only when candidacy is real

### Milestone 4: Schema/Metadata Consistency and Regression Lock

Goal:

- tighten document-level consistency checks and lock the revised behavior with tests

Scope:

- `schema_matches_content`
  - keep deterministic
  - ensure it is score-neutral when content type or schema evidence is unavailable
  - only influence scores when genuinely triggered
- `metadata_checks`
  - confirm score and UI behavior after fill-in support is added
- add regression coverage for:
  - rail details hide/show
  - title/H1 inclusion
  - FAQ candidate suppression
  - deterministic FAQ JSON-LD generation eligibility
  - deterministic HowTo schema eligibility
  - semantic HowTo validity remaining separate
  - semantic HTML usage generation support
  - intro wording improvements

Acceptance:

- conditional checks only score when actually triggered
- document-level actions do not regress overlay behavior
- the revised rule set is locked in tests across prompt/definitions/preflight/serializer/UI where applicable

## Components Likely To Change

Prompt and contract:

- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)

Deterministic detection:

- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js)
- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js)
- [class-rest-preflight.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-preflight.php)

Schema assist and rail/recommendation release:

- [schema-draft-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/schema-draft-builder.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)

Overlay/editor UI:

- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [aivi-overlay-editor.css](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/css/aivi-overlay-editor.css)

## Historical Start Point

Original execution order:

- Start with Milestone 1.

Reason at the time:

- there is a confirmed UI bug in `View details`
- metadata/schema actions can be improved without yet changing scoring rules
- it gives a stable UX surface before the FAQ/HowTo rule refactor begins

## Status

- Milestone 1: implemented locally
- Milestone 2: implemented locally
  - `intro_first_sentence_topic` removed from definitions, scoring, category maps, runtime contract, and release surfaces
  - `single_h1` now treats the visible WordPress title as the single H1 surface when body content has no H1
  - `intro_wordcount` copy now exposes the actual numeric thresholds in serializer/explanation output
  - sidebar-facing category/release tests were rerun after the removal
- Milestone 3: implemented locally
  - `faq_structure_opportunity` remains semantic but is now FAQ-candidate based instead of question-anchor gated
  - `faq_jsonld_generation_suggestion` is now a deterministic bridge check with schema-assist support
  - `howto_schema_presence_and_completeness` is now a deterministic bridge check separated from semantic instructional validity
  - FAQ/HowTo deterministic source checks remain internal/score-neutral where they serve only as bridge inputs
  - prompt, shared definitions, runtime contract, worker/orchestrator preflight, schema-assist, serializer wording, and sidebar data-flow were rechecked together
- Milestone 4: implemented locally
  - `schema_matches_content` conditional score-neutral behavior is now covered in deterministic regression tests
  - metadata/document action surfaces remain wired while sidebar/category integrity stays green after the rule changes
  - worker and orchestrator overlay serializers now drop unmapped/retired checks from recommendation paths, preventing removed checks from reappearing through stale artifacts
  - final regression lock passed across prompt sync, preflight, worker serializer, category integrity, overlay consumption, and sidebar data flow
- Current branch state carrying these changes was re-verified on 2026-03-16 and deployed to the dev lambdas the same day.
- This track is complete for the current branch and no longer blocks release decisions.
