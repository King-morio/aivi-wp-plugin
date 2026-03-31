# AiVI Copilot Check Coverage Audit

## Purpose

This audit maps the real AiVI analysis-engine catalog to the Copilot surface we want.

It answers:

- which checks Copilot can already help with under the current runtime contract
- which checks are still marked `manual_review` but should be opened up for Copilot help
- which checks should use local rewrite, structural transform, schema assist, or web-backed evidence assist

## Source of Truth

This audit is based on:

- [check-runtime-contract-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/check-runtime-contract-v1.json)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/schemas/checks-definitions-v1.json)
- [primary-category-map.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/data/primary-category-map.json)

## Catalog Summary

- total checks in the live contract: `55`
- AI / semantic checks: `29`
- deterministic checks: `26`
- checks currently marked `ai_rewrite`: `36`
- checks currently marked `manual_review`: `19`

Important note:

- `checks-definitions-v1.json` still says `54 checks total` in its description text, but the actual definitions and the live runtime contract both contain `55` checks

## Proposed Copilot Coverage Policy

Copilot should help across all issue families, but not always in the same way.

Recommended primary Copilot modes:

- `local_rewrite`
- `structural_transform`
- `schema_metadata_assist`
- `web_backed_evidence_assist`
- `limited_technical_guidance`

Mode definitions:

- `local_rewrite`
  - tighten, clarify, soften, split, merge, or reframe text using local article context only
- `structural_transform`
  - convert to list, convert to steps, fix heading shape, improve hierarchy, reshape answer formatting
- `schema_metadata_assist`
  - generate, repair, or suggest JSON-LD, metadata, canonical, and author/profile fields
- `web_backed_evidence_assist`
  - run web lookup for claims, freshness, provenance, and source support, then suggest safer or better-supported variants
- `limited_technical_guidance`
  - explain the issue and suggest manual action, but do not pretend Copilot can fully fix it from editor content alone

## Web-Backed Assist Policy

Web search should not be universal. It should be used only for checks where outside verification materially changes suggestion quality.

Recommended web-backed checks:

- `intro_factual_entities`
- `content_updated_12_months`
- `temporal_claim_check`
- `external_authoritative_sources`
- `claim_provenance_and_evidence`
- `numeric_claim_consistency`
- `original_evidence_signal`
- `citation_format_and_context`

Recommended fallback when no reliable support is found:

- `AiVI could not find verifiable support closely tied to this claim. Consider rewriting this section to avoid unsupported certainty, adding a trustworthy source, or narrowing the claim.`

Current implementation note:

- key trust, citability, and structural checks are now opened for local Copilot help in the runtime contract
- schema issues are already routed through `schema_metadata_assist`, but they still need a dedicated metadata-output surface before they should pretend to behave like normal text-variant rewrites

## Coverage by Category

### Intro Focus & Factuality

- `intro_wordcount` - Intro Word Count
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `local_rewrite`
- `intro_readability` - Intro Readability
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `local_rewrite`
- `intro_factual_entities` - Intro Factual Entities
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`
- `intro_schema_suggestion` - Intro Schema Suggestion
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`

### Answer Extractability

- `immediate_answer_placement` - Immediate Answer Placement
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `answer_sentence_concise` - Answer Snippet Concise
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `question_answer_alignment` - Question-Answer Alignment
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `clear_answer_formatting` - Clear Answer Formatting
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`
- `faq_structure_opportunity` - FAQ Structure Opportunity
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`

### Structure & Readability

- `single_h1` - Single H1
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`
- `logical_heading_hierarchy` - Logical Heading Hierarchy
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`
- `heading_topic_fulfillment` - Heading Topic Fulfillment
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `heading_fragmentation` - Heading Fragmentation
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`
- `appropriate_paragraph_length` - Appropriate Paragraph Length
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `lists_tables_presence` - Lists & Tables Presence
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`
- `readability_adaptivity` - Readability Adaptivity
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `heading_like_text_uses_heading_markup` - Heading-Like Text Uses Heading Markup
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`

### Schema & Structured Data

- `valid_jsonld_schema` - Valid JSON-LD Schema
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `article_jsonld_presence_and_completeness` - Article JSON-LD Presence & Completeness
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `schema_matches_content` - Schema Matches Content
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `canonical_clarity` - Canonical Clarity
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `semantic_html_usage` - Semantic HTML Usage
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `structural_transform`
- `supported_schema_types_validation` - Supported Schema Types Validation
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `faq_jsonld_presence_and_completeness` - FAQ JSON-LD Presence & Completeness
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `howto_jsonld_presence_and_completeness` - HowTo JSON-LD Presence & Completeness
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `faq_jsonld_generation_suggestion` - FAQ JSON-LD Generation
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `howto_schema_presence_and_completeness` - HowTo Schema Completeness
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `itemlist_jsonld_presence_and_completeness` - ItemList JSON-LD Presence & Completeness
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`

### Freshness & Temporal Validity

- `content_updated_12_months` - Content Updated in 12 Months
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`
- `no_broken_internal_links` - No Broken Internal Links
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `limited_technical_guidance`
- `temporal_claim_check` - Temporal Claim Check
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`

### Entities & Semantic Clarity

- `named_entities_detected` - Named Entities Detected
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `entities_contextually_relevant` - Entities Contextually Relevant
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `entity_relationships_clear` - Entity Relationships Clear
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `entity_disambiguation` - Entity Disambiguation
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `terminology_consistency` - Terminology Consistency
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `howto_semantic_validity` - HowTo Semantic Validity
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `structural_transform`

### Trust, Neutrality & Safety

- `author_identified` - Author Identified
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `author_bio_present` - Author Bio Present
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `metadata_checks` - Metadata Checks
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `schema_metadata_assist`
- `ai_crawler_accessibility` - AI Crawler Accessibility
  - engine: `deterministic`
  - current contract: `manual_review`
  - recommended Copilot mode: `limited_technical_guidance`
- `accessibility_basics` - Accessibility Basics
  - engine: `deterministic`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `external_authoritative_sources` - Named External Source Support
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`
- `claim_provenance_and_evidence` - Claim Provenance & Evidence
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`
- `numeric_claim_consistency` - Numeric Claim Consistency
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`
- `contradictions_and_coherence` - Contradictions & Coherence
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `no_exaggerated_claims` - No Exaggerated Claims
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `promotional_or_commercial_intent` - Promotional Intent
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `pii_sensitive_content_detector` - PII Detector
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`

### Citability & Verifiability

- `original_evidence_signal` - Original Evidence Signal
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`
- `claim_pattern_detection` - Claim Pattern Detection
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `factual_statements_well_formed` - Factual Statements Well Formed
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `internal_link_context_relevance` - Internal Link Relevance
  - engine: `ai`
  - current contract: `manual_review`
  - recommended Copilot mode: `local_rewrite`
- `duplicate_or_near_duplicate_detection` - Duplicate Detection
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `local_rewrite`
- `citation_format_and_context` - Citation Format and Context
  - engine: `ai`
  - current contract: `ai_rewrite`
  - recommended Copilot mode: `web_backed_evidence_assist`

## Recommended Product Decision

Copilot should be allowed to help on all `55` checks, but not all with the same privilege level.

Recommended rollout:

- `23` checks as primary `local_rewrite`
- `8` checks as primary `structural_transform`
- `14` checks as primary `schema_metadata_assist`
- `8` checks as primary `web_backed_evidence_assist`
- `2` checks as primary `limited_technical_guidance`

## Most Important Expansion Gap

The biggest product gap is not deterministic vs semantic.

It is this:

- several high-value trust and citability checks are still contract-labeled `manual_review`
- those are exactly the checks where users most expect Copilot to help
- they should move to a web-backed assist model rather than staying silent or timid

The most important checks to upgrade next are:

- `external_authoritative_sources`
- `claim_provenance_and_evidence`
- `original_evidence_signal`
- `citation_format_and_context`
- `temporal_claim_check`
- `numeric_claim_consistency`

## Practical Product Rule

If AiVI can identify:

- what is wrong
- where it is wrong
- and what kind of fix would improve it

then Copilot should offer help.

That help may be:

- a rewrite
- a structural transform
- a schema insert
- a source-backed variant
- or a limited manual guidance card

But it should not default to silence just because the current contract says `manual_review`.
