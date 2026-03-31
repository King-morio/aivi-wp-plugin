# AiVI Copilot Preservation Source Audit

## Purpose

This audit closes `M1` of [AIVI_COPILOT_VALIDATION_REPAIR_TRACK.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_VALIDATION_REPAIR_TRACK.md).

Its job is to answer one question precisely:

- what inputs currently feed Copilot preservation rules, and which of them should remain hard blockers versus soft editorial guidance?

## High-Level Finding

There are two different preservation layers today:

- `prompt preservation`
  - shapes what the model is told to keep
  - not automatically a hard validator blocker
- `validator preservation`
  - becomes a hard pass/fail gate after generation

The current production failures are coming from the second layer, not the first.

## Source Map

### A. Prompt-only preservation sources

These feed the model instructions, but do not directly trigger `repair_contract_preservation_violation` on their own.

#### 1. Shared contract defaults

Source:

- [fix-assist-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/fix-assist-contract-v1.json)

Fields:

- `defaults.must_preserve`
- `defaults.tone_guard`
- `defaults.do_not_invent`

Current role:

- good baseline editorial guardrails
- not the main cause of current live failures

Classification:

- `soft preserve only`

#### 2. Per-check contract entries

Source:

- [fix-assist-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/fix-assist-contract-v1.json)

Fields:

- `contracts[check_id].must_preserve`
- `contracts[check_id].must_change`

Current role:

- check-specific editorial guidance
- can be valuable when the preserve instruction is explicit and intentional

Classification:

- `soft preserve only`
- can become `hard preserve eligible` only if later promoted deliberately and explicitly

#### 3. Repair intent preserve notes from serializer/resolver

Sources:

- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [rewrite-target-resolver.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-target-resolver.js)
- [sidebar-payload-stripper.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/sidebar-payload-stripper.js)

Examples:

- `Keep section intent and factual meaning.`
- `Keep surrounding sentence meaning and tone.`
- `Keep heading wording: "..."`

Current role:

- analyzer-era handoff hints
- useful as prompt notes
- too broad and too generic to act as hard validation blockers

Classification:

- `soft preserve only`

## B. Hard validator preservation sources

These are the inputs that currently drive `repair_contract_preservation_violation`.

#### 4. Numeric literals

Source builder:

- [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js#L83)

Validator use:

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js#L1409)

Current role:

- extracted from `literalSource`
- enforced as required text retention in every variant

What `literalSource` currently contains:

- `snippet`
- plus joined `heading_chain`

Classification:

- `hard preserve eligible`

Risk:

- years like `2023` are often meaningful, but not always mandatory in every local rewrite
- may need check-aware enforcement instead of universal enforcement

#### 5. Date literals

Source builder:

- [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js#L88)

Validator use:

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js#L1410)

Current role:

- extracted from `literalSource`
- enforced as required text retention

Classification:

- `hard preserve eligible`

Risk:

- current date extraction also treats plain years as dates
- some year tokens are important facts
- some are just contextual framing and should not always block a valid rewrite

#### 6. Entity literals

Source builder:

- [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js#L110)

Validator use:

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js#L1411)

Current role:

- extracted from capitalized tokens and short phrases across:
  - `snippet`
  - `heading_chain`
- enforced as required text retention

Observed live examples:

- `Now`
- `Keeping`
- `Whether`
- `Best Format`

Classification:

- currently treated as `hard preserve`
- should mostly be `ignore` unless promoted by a stronger entity-quality filter

This is the main overreach source.

## Actual Validator Gate

The hard rejection path is here:

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js#L1447)
- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js#L1487)

Current rule:

- if any required literal is missing from a generated variant
- mark the variant invalid
- if any variants fail this way, return:
  - `repair_contract_preservation_violation`

Important note:

- `must_preserve` text instructions are not what triggered the live failures
- `preservation_literals` did

## Upstream Data Flow

### Literal source construction

In [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js#L311), `literalSource` is currently:

- `snippet`
- plus `heading_chain.join(' ')`

That means heading text can directly contaminate hard-preserve extraction even for checks where the heading wording itself is not important.

### Snippet origin priority

`snippet` is currently drawn from:

- `suggestion.text`
- `issueContext.snippet`
- `rewriteTarget.target_text`
- `rewriteTarget.quote.exact`

This is mostly reasonable, but it still needs check-aware interpretation.

## Check-Family Matrix

### Answer extractability checks

Examples:

- `immediate_answer_placement`
- `answer_sentence_concise`
- `question_answer_alignment`
- `clear_answer_formatting`

What should be hard-preserve:

- truly central answer facts
- genuine entities required to keep the answer correct
- non-negotiable numbers/dates when they are part of the answer

What should be soft only:

- heading fragments
- discourse openers
- generic lead-in words

### Intro/support checks

Examples:

- `intro_factual_entities`
- `heading_topic_fulfillment`
- `readability_adaptivity`

What should be hard-preserve:

- supported named subjects
- critical quantities/dates if central to the claim

What should be soft only:

- paragraph openers
- framing transitions
- broad heading wording unless explicitly configured

### Evidence/source checks

Examples:

- `external_authoritative_sources`
- `claim_provenance_and_evidence`
- `citation_format_and_context`

What should be hard-preserve:

- supported source names
- supported dates/numbers that materially change the claim
- certainty boundaries when explicitly configured

What should be soft only:

- generic claim scaffolding
- rhetorical framing

### Structural transform checks

Examples:

- `faq_structure_opportunity`
- `lists_tables_presence`
- `howto_semantic_validity`

What should be hard-preserve:

- the underlying factual points
- ordered process details where sequence matters

What should be soft only:

- prose wording
- paragraph openers
- heading fragments unless the task is explicitly heading-bound

## Classification Summary

### Hard-preserve eligible

- explicit preserve values added intentionally by future contract design
- validated numeric claims
- validated date claims
- high-confidence named entities

### Soft-preserve only

- shared contract defaults
- per-check `must_preserve` instructions
- repair-intent `must_preserve` notes
- tone/meaning/intent guidance

### Ignore for hard validation

- generic capitalized openers
- heading fragments used only as framing
- discourse markers
- weak regex-derived pseudo-entities

## M1 Exit Conclusion

The current overreach is now located precisely:

- `preservation_literals.entities` is the highest-risk noisy input
- `preservation_literals.numbers` and `dates` are valid categories but still need check-aware enforcement
- `must_preserve` text guidance is not the live blocker and should remain prompt-oriented unless deliberately promoted later

That means `M2` should focus first on:

- literal quality filtering
- especially entity extraction quality
- and separating hard-preserve inputs from soft prompt guidance
