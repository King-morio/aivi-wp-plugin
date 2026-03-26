# Check Message And Structure Follow-Up Track

## Purpose

Tighten a small group of checks after the recent rule reconciliation and overlay stabilization work so that:

- document-level metadata actions return safely to the review rail
- heading support checks match the intended meaning
- list/table opportunities are flagged at the right granularity
- HowTo semantic validity is scoped to true procedural content only
- deterministic intro checks surface clearer, more helpful messages

This track is intentionally narrow. It should not reopen overlay redesign work or unrelated backend reliability work.

## Confirmed Decisions

1. `metadata_checks`
- stays deterministic
- gains a fill-in UI in review-rail details
- user writes values manually
- no AI generation
- write-back target remains plugin-managed document metadata / post meta

2. `orphan_headings`
- current semantic behavior is too subjective for the intended use
- if kept semantic, it will be renamed to `heading_topic_fulfillment`
- recommended path: rename and keep semantic intent explicit
- semantic meaning:
  - heading promise is not fulfilled by the section beneath it
  - not merely a word-count rule

3. `lists_tables_presence`
- remains semantic
- must flag one failing section/block per instance
- must not flag every item/line/phrase inside the same listable section
- rewrite target remains block-level

4. `howto_semantic_validity`
- remains semantic
- must only evaluate content that genuinely suggests procedural intent
- must stay separate from schema completeness

5. intro checks
- `intro_wordcount`
- `intro_readability`
- `intro_factual_entities`
- `intro_schema_suggestion`
- rules mostly stay as they are
- user-facing messages need to become more explicit and useful

## Current Landmines

1. The restored overlay currently does not expose the `metadata_checks` fill-in UI.
2. `orphan_headings` is still AI-owned and word-count alone does not explain its failures.
3. `lists_tables_presence` currently allows `span|sentence|block`, which is why it can over-fragment one listable section into multiple instances.
4. `howto_semantic_validity` can still drift into weak instructional lookalikes unless candidacy is tightened.
5. Intro check explanations are deterministic but still too generic for users.
6. Sidebar/release surfaces must be checked whenever these checks are renamed, re-scoped, or reworded.

## Milestones

### Milestone 1: Metadata Details Form

Goal:

- restore the `metadata_checks` details UI cleanly in the review rail

Scope:

- reintroduce a non-schema document form only for `metadata_checks`
- fields:
  - title
  - meta description
  - canonical URL
  - language
- keep it hidden until `View details`
- reuse the existing plugin-managed document-meta REST path
- keep schema action UI separate from metadata UI

Acceptance:

- `metadata_checks` shows manual fill fields after expanding details
- save/write-back works through plugin-managed metadata only
- no overlay layout regression
- no effect on schema-assisted checks

Status:

- implemented locally
- Acceptance was re-verified on 2026-03-16 against overlay metadata details, prompt/contract sync, sidebar data flow, worker regressions, and orchestrator serializer coverage.
- This track is complete for the current branch and no longer blocks packaging or deploy decisions.
- overlay now restores a manual metadata form inside review-rail details for `metadata_checks`
- plugin bootstrap now loads the document-meta REST controller again
- sidebar/analysis requests now hydrate saved plugin-managed metadata so re-analysis can reuse:
  - `meta_description`
  - `canonical_url`
  - `lang`

### Milestone 2: Heading And List Rule Tightening

Goal:

- make heading-support and list-opportunity checks reflect the intended editorial meaning

Scope:

- rename `orphan_headings` to `heading_topic_fulfillment`
- update:
  - check definitions
  - runtime contract
  - prompt wording
  - serializer/release surfaces
  - category/consumer references
- keep it semantic, but make the name match what the model is actually judging
- tighten `lists_tables_presence` so it is block-scope only
- require one failing section/block = one instance
- prevent item-level sub-findings inside the same failing section

Acceptance:

- no `orphan_headings` label remains in product/runtime surfaces
- `heading_topic_fulfillment` copy clearly describes unmet topical promise
- `lists_tables_presence` no longer explodes one section into multiple sub-item issues
- sidebar and overlay stay aligned with the renamed check

### Milestone 3: HowTo Candidacy And Intro Message Quality

Goal:

- tighten procedural semantic scope and improve deterministic intro messaging

Scope:

- refine `howto_semantic_validity` so it only evaluates real procedural candidates
- keep it separate from `howto_schema_presence_and_completeness`
- tighten prompt/check-definition guidance for:
  - when to evaluate
  - when to suppress
  - what counts as fail/partial
- refine user-facing messages for:
  - `intro_wordcount`
  - `intro_readability`
  - `intro_factual_entities`
  - `intro_schema_suggestion`
- use clearer thresholds and more concrete instructions
- allow message rotation only within tight, high-signal templates

Acceptance:

- `howto_semantic_validity` does not trigger on weak instructional lookalikes
- intro messages expose useful thresholds or concrete next actions
- no vague filler remains in those deterministic intro explanations

Status:

- implemented locally

### Milestone 4: Regression Lock And Rollout

Goal:

- lock behavior across backend, overlay, and sidebar before rollout

Scope:

- add/refresh regression coverage for:
  - metadata details form visibility and persistence
  - renamed `heading_topic_fulfillment`
  - list block-level instance behavior
  - tightened `howto_semantic_validity` candidacy
  - improved intro message wording
  - sidebar data-flow compatibility

Acceptance:

- all touched checks behave consistently in:
  - preflight / AI runtime
  - serializer release
  - review rail
  - sidebar consumption
- no overlay regression from reintroducing metadata details

Status:

- implemented locally

## Components Likely To Change

Overlay/UI:

- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [aivi-overlay-editor.css](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/css/aivi-overlay-editor.css)
- [aivi-sidebar.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js)

Plugin REST/document metadata:

- [class-rest-document-meta.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-document-meta.php)
- [class-assets.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-assets.php)

Prompt and contract:

- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)
- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json)

Semantic and deterministic runtime:

- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js)
- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js)
- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)

Shared explanation text:

- [deterministic-explanations-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/deterministic-explanations-v1.json)
- [deterministic-instance-messages-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/deterministic-instance-messages-v1.json)

## Historical Start Point

Original execution order:

- Start with Milestone 1.

Reason at the time:

- it is the least risky UI reintroduction
- it restores an agreed document-level action without reopening overlay shell changes
- it stays separate from the semantic renaming/refinement work that needs broader contract updates
