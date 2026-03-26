# Check Ownership Canonical

Last updated: 2026-03-23

## Purpose

This file is the canonical ownership inventory for AiVI checks.

It records:
- every current check ID in the plugin
- its current ownership class: `semantic`, `deterministic`, or `hybrid`
- the current architecture decision that deterministic-owned checks must not be exposed to the AI analyzer

It is also the active home for:
- current check-ownership decisions
- deterministic vs semantic boundary decisions
- approved but not-yet-implemented check additions
- analyzer-load and deterministic guidance decisions

Source of truth used to compile this file:
- `infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json`
- `infrastructure/lambda/orchestrator/shared/schemas/check-runtime-contract-v1.json`

## Current Counts

- Total checks: `54`
- Semantic: `29`
- Deterministic: `25`
- Hybrid: `0`

## Target-State Counts

These are the adopted target-state counts after the current ownership cleanup is implemented.

- Total checks: `54`
- Semantic: `29`
- Deterministic: `25`
- Hybrid: `0`
- Retired check: `intro_focus_and_factuality.v1`

## Deterministic Ownership Lock

This is the target deterministic lock for AiVI after the ownership cleanup.

These checks are deterministic-owned.
AI should not evaluate them, should not receive them in prompt query blocks, and should not be asked to supply explanations for them.

- `accessibility_basics`
- `ai_crawler_accessibility`
- `article_jsonld_presence_and_completeness`
- `appropriate_paragraph_length`
- `author_bio_present`
- `author_identified`
- `canonical_clarity`
- `content_updated_12_months`
- `faq_jsonld_generation_suggestion`
- `faq_jsonld_presence_and_completeness`
- `heading_fragmentation`
- `howto_jsonld_presence_and_completeness`
- `howto_schema_presence_and_completeness`
- `itemlist_jsonld_presence_and_completeness`
- `intro_readability`
- `intro_schema_suggestion`
- `intro_wordcount`
- `logical_heading_hierarchy`
- `metadata_checks`
- `no_broken_internal_links`
- `schema_matches_content`
- `semantic_html_usage`
- `single_h1`
- `supported_schema_types_validation`
- `valid_jsonld_schema`

## Semantic Checks

These are currently AI-owned semantic checks.

- `answer_sentence_concise` - Answer Snippet Concise
- `citation_format_and_context` - Citation Format and Context
- `claim_pattern_detection` - Claim Pattern Detection
- `claim_provenance_and_evidence` - Claim Provenance & Evidence
- `clear_answer_formatting` - Clear Answer Formatting
- `contradictions_and_coherence` - Contradictions & Coherence
- `duplicate_or_near_duplicate_detection` - Duplicate Detection
- `entities_contextually_relevant` - Entities Contextually Relevant
- `entity_disambiguation` - Entity Disambiguation
- `entity_relationships_clear` - Entity Relationships Clear
- `external_authoritative_sources` - Named External Source Support
- `factual_statements_well_formed` - Factual Statements Well Formed
- `faq_structure_opportunity` - FAQ Structure Opportunity
- `heading_topic_fulfillment` - Heading Topic Fulfillment
- `howto_semantic_validity` - HowTo Semantic Validity
- `immediate_answer_placement` - Immediate Answer Placement
- `internal_link_context_relevance` - Internal Link Relevance
- `lists_tables_presence` - Lists & Tables Presence
- `named_entities_detected` - Named Entities Detected
- `no_exaggerated_claims` - No Exaggerated Claims
- `numeric_claim_consistency` - Numeric Claim Consistency
- `original_evidence_signal` - Original Evidence Signal
- `pii_sensitive_content_detector` - PII Detector
- `promotional_or_commercial_intent` - Promotional Intent
- `question_answer_alignment` - Question-Answer Alignment
- `readability_adaptivity` - Readability Adaptivity
- `temporal_claim_check` - Temporal Claim Check
- `terminology_consistency` - Terminology Consistency

## Deterministic Checks

These are currently deterministic-owned checks.

- `accessibility_basics` - Accessibility Basics
- `ai_crawler_accessibility` - AI Crawler Accessibility
- `article_jsonld_presence_and_completeness` - Article JSON-LD Presence & Completeness
- `intro_readability` - Intro Readability
- `intro_schema_suggestion` - Intro Schema Suggestion
- `intro_wordcount` - Intro Word Count
- `appropriate_paragraph_length` - Appropriate Paragraph Length
- `author_bio_present` - Author Bio Present
- `author_identified` - Author Identified
- `canonical_clarity` - Canonical Clarity
- `content_updated_12_months` - Content Updated in 12 Months
- `faq_jsonld_generation_suggestion` - FAQ JSON-LD Generation
- `faq_jsonld_presence_and_completeness` - FAQ JSON-LD Presence & Completeness
- `heading_fragmentation` - Heading Fragmentation
- `howto_jsonld_presence_and_completeness` - HowTo JSON-LD Presence & Completeness
- `howto_schema_presence_and_completeness` - HowTo Schema Completeness
- `itemlist_jsonld_presence_and_completeness` - ItemList JSON-LD Presence & Completeness
- `logical_heading_hierarchy` - Logical Heading Hierarchy
- `metadata_checks` - Metadata Checks
- `no_broken_internal_links` - No Broken Internal Links
- `schema_matches_content` - Schema Matches Content
- `semantic_html_usage` - Semantic HTML Usage
- `single_h1` - Single H1
- `supported_schema_types_validation` - Supported Schema Types Validation
- `valid_jsonld_schema` - Valid JSON-LD Schema

## Hybrid Checks

No checks remain in the live hybrid bucket after M3.

## Important Runtime Note

Current runtime ownership and current prompt exposure are not perfectly aligned.

Today:
- the 25 deterministic checks above are deterministic-owned in the runtime contract
- semantic checks remain on the AI analyzer surface
- deterministic checks no longer borrow AI explanations in the analyzer merge path

Current drift is now mostly limited to follow-on regression cleanup, not bucket ownership.

## Deterministic Guidance Confirmation

Deterministic checks already have deterministic user-facing guidance paths, so the AI analyzer does not need to carry explanation work for them.

Current deterministic guidance comes from a mix of:
- preflight-generated deterministic `explanation` fields
- `deterministic-instance-messages-v1.json` for deterministic review-rail leads
- `deterministic-explanations-v1.json` for structured overlay guidance packs
- `analysis-serializer.js` deterministic fallback messages and explanation packs

Coverage note:
- M4 and M5 left the deterministic message catalogs covering all current deterministic-owned checks, including `article_jsonld_presence_and_completeness` and `itemlist_jsonld_presence_and_completeness`
- serializer-level deterministic fallbacks remain in place as resilience, not as a substitute for missing catalog coverage

## Target Direction

The intended direction from this point is:

- semantic checks stay semantic
- deterministic checks stay deterministic
- hybrids should be reduced or split where possible
- deterministic-owned checks should be removed from AI prompt visibility entirely
- bridge checks should remain explicit bridge checks, not silent hybrids

## Notes For Future Refactor

When ownership cleanup work begins, use this file as the canonical reference for:
- prompt filtering
- runtime contract cleanup
- scoring ownership
- bridge-check design
- renaming or deprecating hybrid intro checks

## Target-State Buckets

These are the adopted target buckets for AiVI after the current ownership cleanup.

### Deterministic Bucket

- `accessibility_basics`
- `ai_crawler_accessibility`
- `article_jsonld_presence_and_completeness`
- `appropriate_paragraph_length`
- `author_bio_present`
- `author_identified`
- `canonical_clarity`
- `content_updated_12_months`
- `faq_jsonld_generation_suggestion`
- `faq_jsonld_presence_and_completeness`
- `heading_fragmentation`
- `howto_jsonld_presence_and_completeness`
- `howto_schema_presence_and_completeness`
- `itemlist_jsonld_presence_and_completeness`
- `intro_readability`
- `intro_schema_suggestion`
- `intro_wordcount`
- `logical_heading_hierarchy`
- `metadata_checks`
- `no_broken_internal_links`
- `schema_matches_content`
- `semantic_html_usage`
- `single_h1`
- `supported_schema_types_validation`
- `valid_jsonld_schema`

### Semantic Bucket

- `answer_sentence_concise`
- `citation_format_and_context`
- `claim_pattern_detection`
- `claim_provenance_and_evidence`
- `clear_answer_formatting`
- `contradictions_and_coherence`
- `duplicate_or_near_duplicate_detection`
- `entities_contextually_relevant`
- `entity_disambiguation`
- `entity_relationships_clear`
- `external_authoritative_sources`
- `factual_statements_well_formed`
- `faq_structure_opportunity`
- `heading_topic_fulfillment`
- `howto_semantic_validity`
- `immediate_answer_placement`
- `internal_link_context_relevance`
- `intro_factual_entities`
- `lists_tables_presence`
- `named_entities_detected`
- `no_exaggerated_claims`
- `numeric_claim_consistency`
- `original_evidence_signal`
- `pii_sensitive_content_detector`
- `promotional_or_commercial_intent`
- `question_answer_alignment`
- `readability_adaptivity`
- `temporal_claim_check`
- `terminology_consistency`

## Removed From AI Prompt Load

These checks are being removed from the AI analyzer prompt surface so semantic load stays focused on true judgment work.

Deterministic explanation borrowing removed:
- `accessibility_basics`
- `ai_crawler_accessibility`
- `article_jsonld_presence_and_completeness`
- `appropriate_paragraph_length`
- `author_bio_present`
- `author_identified`
- `canonical_clarity`
- `content_updated_12_months`
- `faq_jsonld_generation_suggestion`
- `faq_jsonld_presence_and_completeness`
- `heading_fragmentation`
- `howto_jsonld_presence_and_completeness`
- `howto_schema_presence_and_completeness`
- `itemlist_jsonld_presence_and_completeness`
- `logical_heading_hierarchy`
- `metadata_checks`
- `no_broken_internal_links`
- `schema_matches_content`
- `semantic_html_usage`
- `single_h1`
- `supported_schema_types_validation`
- `valid_jsonld_schema`

Former hybrid intro load removed:
- `intro_wordcount`
- `intro_readability`
- `intro_schema_suggestion`
- `intro_focus_and_factuality.v1`

Former hybrid intro load retained on semantic ownership:
- `intro_factual_entities`

## Working Decisions

### Decision 001 - This File Is The Active Source Of Truth For Check Decisions

- Current check-ownership and check-design decisions should be recorded here, not in `DECISIONS.md`.
- `DECISIONS.md` should be treated as the frozen archive log for stable product and repository decisions, not the live home for ongoing check-bucket/spec work.

### Decision 002 - Deterministic Checks Stay Off The AI Analyzer Surface

- Deterministic-owned checks must not be exposed to the AI analyzer.
- Deterministic-owned checks must not borrow AI explanations.

### Decision 003 - Deterministic Checks May Use Authored Variant Catalogs

- Deterministic checks may use authored message catalogs with multiple variants.
- Runtime should surface only one instance message and one detail explanation per issue.

### Decision 004 - Intro Ownership Resolves Cleanly

- `intro_wordcount` is assigned to the deterministic-only target bucket.
- `intro_readability` is assigned to the deterministic-only target bucket because current implementation is already metric-driven and deterministic.
- `intro_factual_entities` is assigned to the semantic target bucket because factual grounding requires real judgment beyond pattern detection.
- `intro_schema_suggestion` is assigned to the deterministic-only target bucket and remains advisory.
- `intro_focus_and_factuality.v1` is retired from the target-state check inventory.
- The intro category itself remains.
- Any future semantic intro-summary replacement should use a new ID and should judge topical relevance, trustworthiness, and snippet/citation readiness directly.
- M1 implementation note: `intro_wordcount`, `intro_readability`, and `intro_schema_suggestion` are now declared deterministic in the shared schema files.
- M3 implementation note: `intro_factual_entities` is now live semantic in executable schema declarations and `intro_focus_and_factuality.v1` is removed from live executable schema declarations.
- M3 implementation note: the intro category remains, but live intro scoring now belongs to `intro_wordcount`, `intro_readability`, and `intro_factual_entities`, while `intro_schema_suggestion` stays advisory and score-neutral.

### Decision 005 - Strong Visible Lists Need Their Own Machine-Readable Schema Check

Check ID: `itemlist_jsonld_presence_and_completeness`

- Bucket: `deterministic`
- Category: `schema_structured_data`
- Purpose: verify that strong visible list sections have matching `ItemList` JSON-LD when appropriate.
- Trigger: detect a strong visible list candidate with at least 3 substantive items.
- Trigger: prefer ranked, comparative, enumerated, or resource-style lists under a meaningful section heading.
- Trigger: exclude FAQ sections, HowTo/procedural sections, nav lists, breadcrumbs, and weak bullet-tip blocks.
- Evaluation: extract visible list heading, item count, item order, and item labels.
- Evaluation: parse JSON-LD and locate `ItemList`.
- Evaluation: compare visible list shape against schema items and positions.
- Verdict: `pass` when no strong list candidate exists, or when matching `ItemList` JSON-LD is present and aligned.
- Verdict: `partial` when `ItemList` exists but is incomplete or misaligned with the visible list.
- Verdict: `fail` when a strong visible list candidate exists but no matching `ItemList` JSON-LD is present.
- Assist mode: support deterministic schema assist with `generate_copy_insert`.

### Decision 006 - Article-Like Pages Need A Primary Article Schema Check

Check ID: `article_jsonld_presence_and_completeness`

- Bucket: `deterministic`
- Category: `schema_structured_data`
- Purpose: verify that article-like pages carry a primary article schema, not just syntactically valid JSON-LD.
- Trigger: visible content type resolves to article/post/news-style content.
- Trigger: do not trigger for pages whose primary intent is FAQ-only, HowTo-only, Product-only, Organization-only, or Person-only.
- Evaluation: detect whether a primary `Article`, `BlogPosting`, or `NewsArticle` schema exists.
- Evaluation: verify required core fields for the detected primary article type.
- Evaluation: compare article-schema presence separately from JSON-LD syntax validity.
- Evaluation: treat companion schemas like `FAQPage`, `HowTo`, `BreadcrumbList`, `ItemList`, `VideoObject`, and `ImageObject` as supportive, not as replacements for the primary article schema.
- Core field: `@context`
- Core field: `@type`
- Core field: headline/name
- Core field: author
- Core field: `datePublished` or `dateModified`
- Core field: `mainEntityOfPage` or a canonical-equivalent page reference when available
- Verdict: `pass` when an article-like page has a primary article schema with required core fields.
- Verdict: `partial` when article schema exists but is incomplete, or when only companion/supporting schemas are present.
- Verdict: `fail` when an article-like page has no primary article schema at all.
- Relationship: `valid_jsonld_schema` remains syntax-only.
- Relationship: `supported_schema_types_validation` remains type-support validation.
- Relationship: `schema_matches_content` remains alignment validation.
- Relationship: this new check answers the separate question of primary article-schema presence and completeness.

### Decision 007 - Readability Adaptivity Stays Wholly Semantic

Check ID: `readability_adaptivity`

- Bucket: `semantic`
- Category: `structure_readability`
- Decision: keep this check fully AI-owned and remove wording that implies deterministic metric scoring.
- Why: the check is meant to judge whether sentence style, density, clause stacking, and jargon fit the content type and scan cleanly for answer extraction. That is editorial judgment, not a pure score calculation.
- Drift to remove: schema-definition wording like `Flesch or similar scoring` should not remain as the primary evaluation description for this check.
- Ownership effect: no bucket/count change is needed because the runtime contract already treats `readability_adaptivity` as semantic.

Approved Messages:
accessibility_basics:
  instance: "An image here is missing alt text"
  details:
    - "One or more images in this section are missing descriptive alt text. That weakens accessibility for screen-reader users and removes a simple machine-readable cue about what the image contributes. Add concise, specific alt text for each meaningful image so the content is easier to interpret and support."
    - "This check is flagging image accessibility, not general page accessibility. Some images here do not expose clear alternative text, which makes the visual content harder for assistive technology and parsers to understand. Add accurate alt text that reflects the image's purpose without stuffing keywords or repeating nearby copy."
    - "At least one image in this block is missing alt text. When that happens, the section loses useful descriptive context for both accessibility tools and machine readers. Add short, relevant alt text for informative images, and keep decorative images intentionally empty only when they truly add no content."

ai_crawler_accessibility:
  instance: "Crawler access is restricted or unclear"
  details:
    - "This page is blocked, restricted, or inconsistent for compliant AI crawlers. If retrieval fails, the content is much less likely to be summarized, cited, or linked back in answer engines. Review robots directives, bot-specific restrictions, response headers, and server behavior so approved crawlers can fetch the page reliably."
    - "AI-focused crawlers may be hitting preventable access barriers on this page. That can make otherwise strong content effectively invisible to systems that generate cited answers. Check robots.txt, meta robots, firewall or CDN rules, status codes, and any rendering dependency that stops a normal crawler from reaching the content."
    - "The crawler-access signals on this page are restrictive or unclear enough to reduce reliable retrieval. When access breaks, citation systems cannot confidently evaluate or surface the page. Remove unintentional crawler barriers where appropriate and verify that approved bots can fetch the final article content without special handling."

appropriate_paragraph_length:
  instance: "This paragraph is too long"
  details:
    - "This paragraph is carrying too many ideas in one block. Dense paragraphs are harder for readers to scan and harder for AI systems to quote cleanly. Split it into shorter units, keep each paragraph focused on one point, and lead with the sentence that states the main idea."
    - "This paragraph is longer than it needs to be for easy scanning and extraction. Large text blocks can bury the strongest claim and make quotable passages less distinct. Break this paragraph into tighter pieces, trim extra buildup, and give each idea its own space to stand clearly."
    - "This paragraph packs too much information into a single block of text. That makes it harder to isolate the sentence or claim most worth citing. Shorten it into smaller paragraphs, keep each one centered on a single idea, and move supporting detail into its own follow-up block."

author_bio_present:
  instance: "Add an author bio"
  details:
    - "This article does not include an author bio. A short bio helps establish expertise, editorial context, and trust, all of which strengthen citation confidence. Add a concise bio near the byline or article footer that explains who the author is and why they are qualified to cover this topic."
    - "An author bio is missing from this article. Without that context, the piece loses a useful trust signal that helps answer engines evaluate source credibility. Add a brief, relevant bio that highlights the author's role, experience, and subject familiarity in a way that supports the article."
    - "This page identifies no author bio for the person behind the article. That makes the content feel less attributable and less grounded in expertise. Include a short bio with relevant credentials, experience, or domain knowledge so the article carries clearer authority and stronger citation signals."

author_identified:
  instance: "Identify the author clearly"
  details:
    - "This article does not clearly identify who wrote it. Clear authorship strengthens provenance and gives citation systems a stronger reason to trust the source. Add a visible byline with the author's full name and keep that identity consistent across the page and any supporting metadata."
    - "The author is not clearly named on this article. When authorship is unclear, the content becomes harder to attribute confidently in AI-generated answers. Add a visible author name, avoid generic labels, and make sure the same author identity is reflected consistently wherever the page describes authorship."
    - "This page is missing a clear author signal. That weakens attribution and removes an important trust cue for systems that evaluate whether a source is worth citing. Add a prominent byline with the author's real name and align it with the article's metadata or schema where possible."

canonical_clarity:
  instance: "Canonical signals need cleanup"
  details:
    - "This page is not sending a clear canonical signal. When multiple URLs compete, crawlers can index the wrong version or split authority across duplicates. Set one preferred canonical URL, make it consistent, and ensure alternate versions point back to the primary version meant to be cited."
    - "Canonical guidance on this page is missing, conflicting, or unclear. That makes it harder for machines to identify which URL should represent the content. Use a single canonical target, keep it stable, and remove any conflicting signals so citation systems can rely on the preferred page."
    - "This article does not provide clean canonical direction. Weak canonical setup can dilute indexing signals and create uncertainty around which version should be referenced. Add one clear canonical URL and make sure duplicate or variant pages consolidate to the version you want surfaced and cited."

content_updated_12_months:
  instance: "This article needs a refresh"
  details:
    - "This article has not been updated within the last 12 months. Older pages can still perform well, but freshness matters when facts, products, or recommendations change. Review the content, update outdated sections, and show a clear updated date once the article reflects current information."
    - "This page has gone more than a year without a visible content update. That can lower confidence when the topic depends on current accuracy. Recheck facts, links, examples, and recommendations, then refresh the article so answer engines see that the content has been actively maintained."
    - "This article is overdue for a review based on its update history. Stale content is less persuasive when citation systems look for current, dependable sources. Audit the piece for outdated claims, revise what has changed, and publish the refresh with a clear last-updated signal."

faq_jsonld_generation_suggestion:
  instance: "Generate FAQ JSON-LD for this FAQ-ready block"
  details:
    - "This section already exposes compact, FAQ-ready question-and-answer pairs, but that structure is still only visible to human readers. Generate FAQ JSON-LD that mirrors the exact questions and answers shown here so machines can recognize the block as a reusable FAQ set more confidently."
    - "This block behaves like a true FAQ candidate, yet the page is not surfacing it as FAQ JSON-LD. That leaves the question-and-answer pattern implicit instead of machine-readable. Add FAQ JSON-LD for the visible pairs in this section and keep the markup aligned with the on-page wording."
    - "This section qualifies for FAQ markup based on the visible question-and-answer format, but the machine-readable layer is missing. Add FAQ JSON-LD that matches the exact pairs readers see here so answer engines can parse the section as a structured FAQ rather than inferring it loosely."

faq_jsonld_presence_and_completeness:
  instance: "FAQ JSON-LD is missing or incomplete"
  details:
    - "The FAQ JSON-LD for this section is missing entirely or does not fully cover the visible question-and-answer pairs. Incomplete FAQ markup weakens machine understanding and can cause the structured data to be ignored. Add the missing entries, use the correct FAQPage structure, and keep it synchronized with the section shown here."
    - "The structured FAQ markup tied to this block is incomplete enough to create mixed signals. When visible questions or answers are missing from JSON-LD, answer engines cannot tell which version to trust. Complete the FAQPage entries for this section and make sure each pair matches the on-page wording."
    - "This FAQ section has absent, partial, or misaligned structured data. Machines rely on complete question-and-answer markup to extract FAQ content confidently. Fill in the missing FAQ JSON-LD, validate it, and keep it aligned with the visible section so the schema does not drift from what readers see."

heading_fragmentation:
  instance: "This section is over-fragmented"
  details:
    - "This section is broken into too many small headed chunks. That interrupts reading flow and weakens the context around each point, making citation candidates less coherent. Merge closely related sub-sections, remove unnecessary headings, and let the idea develop before introducing another structural break."
    - "This part of the article uses more headings than the content needs. When a section becomes too fragmented, both readers and machines lose the larger thread of the argument. Combine thin sub-sections, reduce heading density, and group related ideas into a more unified block."
    - "This section is split too aggressively by headings. That can make the content feel choppy and reduce the continuity answer engines rely on when selecting passages. Simplify the structure here by merging adjacent fragments and keeping headings only where a genuinely new idea begins."

howto_jsonld_presence_and_completeness:
  instance: "HowTo JSON-LD is missing or incomplete"
  details:
    - "This step-by-step content is missing HowTo JSON-LD or does not expose enough of the visible process. Without complete step markup, machines can miss the sequence, required details, or outcome of the procedure. Add full HowTo JSON-LD for this section and keep it aligned with the steps readers can see."
    - "This instructional block is present on the page, but its HowTo JSON-LD is missing or incomplete. That weakens the structure answer engines use to understand procedures. Complete the HowTo markup so the visible steps and any required supporting fields are clearly expressed in machine-readable form."
    - "This section explains a process, but the corresponding HowTo JSON-LD does not fully describe it. Incomplete markup makes step-by-step content harder to parse and cite accurately. Add the missing HowTo data here, validate it, and keep it tightly aligned with the instructions shown to readers."

howto_schema_presence_and_completeness:
  instance: "Generate complete HowTo schema for this step-by-step section"
  details:
    - "This section behaves like a clear how-to candidate, but the page is not surfacing complete HowTo schema for it. When the machine-readable process is partial, systems can misread the method or ignore the structure entirely. Generate or complete the HowTo schema so it fully reflects the visible steps."
    - "This block qualifies as instructional content, yet the schema support behind it is missing or incomplete. That weakens extraction for procedural answers because the action sequence is not expressed clearly enough. Add or complete the HowTo schema so the process, requirements, and step order match the visible content."
    - "This section presents a real method readers can follow, but the machine-readable HowTo layer is not complete enough yet. Citation systems rely on explicit step structure when evaluating procedural content. Fill in the missing schema details for this block and keep them synchronized with the instructions on the page."

logical_heading_hierarchy:
  instance: "This heading breaks hierarchy"
  details:
    - "This heading is out of sequence in the article's structure. When heading levels jump unexpectedly, machines have a harder time understanding how ideas relate to each other. Change this heading to the correct level so it fits the surrounding outline and preserves a logical content hierarchy."
    - "This heading does not match the hierarchy established by the surrounding sections. Structural jumps weaken the outline that readers and parsers use to follow the article. Adjust this heading level so it nests under the correct parent section and keeps the page structure consistent."
    - "This heading interrupts the logical order of the page. Skipped or misused heading levels can blur which points are main sections and which are subpoints. Update this heading to the right level so the article reads as a clean, predictable outline for both users and machines."

metadata_checks:
  instance: "Metadata needs cleanup"
  details:
    - "This page is missing or misusing key metadata such as the title, description, language, canonical signal, or visible update cues. Those fields help machines confirm what the page is about and how current it is. Clean them up so they are complete, accurate, and aligned with the visible article."
    - "Important metadata on this page is incomplete or inconsistent. That weakens the signals answer engines use to classify the page, assess freshness, and understand its purpose. Review the core metadata fields and update them so they describe the article clearly and match what readers actually see."
    - "This page's metadata is not strong enough in its current form. Weak or conflicting metadata makes the article harder to interpret and less dependable as a citation source. Fix the missing or inaccurate fields so the page description, timing, language, and identity are clear to machines."

no_broken_internal_links:
  instance: "This internal link is broken"
  details:
    - "This internal link does not resolve correctly. Broken links interrupt navigation, weaken trust, and cut off supporting context that crawlers may use to understand the article. Update this link to a working destination or remove it if the referenced page is no longer relevant."
    - "This internal link points to a page that is no longer available or reachable. That creates a dead end for readers and removes useful site context for answer engines. Fix the target URL, redirect it properly, or replace it with a live page that supports this section."
    - "This link is broken within your own site. When internal references fail, the article loses supporting pathways that help both users and machines verify surrounding context. Repair this URL or swap it for a valid internal destination so this section stays connected to the rest of the site."

schema_matches_content:
  instance: "Schema doesn't match this content"
  details:
    - "The structured data on this page does not match the visible content closely enough. When schema and page copy disagree, machines are more likely to distrust both. Update the schema so its type, fields, and claims accurately reflect what readers can actually see on the page."
    - "This page is sending structured data that does not fully align with the article itself. That creates confusion about what the content is and how it should be classified. Review the schema against the visible page and correct any mismatch in topic, entities, dates, or format."
    - "The schema attached to this page describes the content inaccurately or incompletely. Mismatched markup weakens trust and reduces the value of structured data for citation systems. Bring the schema back into alignment so it mirrors the visible article as closely as possible."

semantic_html_usage:
  instance: "Semantic structure is too thin here"
  details:
    - "This page is using too little semantic HTML to describe the roles of its major content blocks. When structure relies mostly on generic containers, machines get weaker signals about boundaries and purpose. Use more meaningful elements where appropriate so the page is easier to parse and segment."
    - "The semantic structure on this page is thinner than it should be. That does not necessarily mean every block is wrong, but it does mean machines get less help understanding major regions and content boundaries. Add more relevant semantic elements where they genuinely describe the page structure better."
    - "This page is light on semantic HTML, so too much of the structure depends on generic markup alone. Visual layout is not enough for machine interpretation. Strengthen the structural signals by using clearer semantic elements for major content areas, not just generic wrappers."

single_h1:
  instance: "Use one clear H1"
  details:
    - "This page does not have one clear H1 heading. A single H1 gives both readers and machines a strong signal about the main topic of the article. Keep one descriptive H1 for the primary title and move any other title-like headings into lower levels."
    - "The main heading structure on this page is unclear because the H1 setup is not clean. Multiple H1s or a missing H1 can blur the page's central topic. Use one specific H1 for the article title and organize the rest of the content beneath it."
    - "This article is missing a strong single H1 signal. That weakens the page's top-level structure and makes the main subject less explicit for citation systems. Add one clear H1 for the primary title and reserve H2s and below for supporting sections."

supported_schema_types_validation:
  instance: "This schema type isn't supported"
  details:
    - "This schema type is not a strong fit for the content or is not supported in the way it is being used. That reduces the value of the markup and can lead machines to ignore it. Replace it with a supported type that matches what this page actually contains."
    - "This markup uses a schema type that should not be used here. Inappropriate schema types create ambiguity instead of clarity and weaken structured data trust. Swap this type for one that accurately describes the content so citation systems can interpret the page more confidently."
    - "This schema type does not belong in this context. When the wrong structured data type is used, machines get a weaker signal about the page and may discard the markup. Use a supported schema type that reflects the visible content honestly and more precisely."

valid_jsonld_schema:
  instance: "This JSON-LD is invalid"
  details:
    - "This JSON-LD block contains technical errors that stop it from validating cleanly. Invalid syntax or structure can make machines ignore the markup entirely. Fix the parsing issues here, correct the structure, and validate the block again before relying on it to support citation signals."
    - "This JSON-LD is malformed or incorrectly structured. When structured data cannot be parsed, it loses nearly all of its value for answer engines. Repair the errors in this block, remove invalid properties, and confirm that the final markup validates without warnings or failures."
    - "This structured data block does not pass JSON-LD validation. That means machines may skip it rather than try to infer what it meant. Correct the syntax, nesting, or property usage in this block and rerun validation so the markup becomes usable again."

itemlist_jsonld_presence_and_completeness:
  instance: "Add complete ItemList JSON-LD"
  details:
    - "This visible list is not fully represented in ItemList JSON-LD. Without explicit list markup, machines may miss that the section is a defined collection or may lose the intended item order. Add complete ItemList JSON-LD for this section so the entries and their sequence are clearly expressed."
    - "This block presents a strong list candidate, but its ItemList JSON-LD is missing or incomplete. That makes the list harder to interpret as an ordered or bounded set of items. Complete the ItemList markup for this section and make sure it reflects the entries readers actually see."
    - "This list is clear to readers, but its machine-readable representation is incomplete. When ItemList markup leaves out entries, order, or positions, answer engines get weaker structural signals. Add the missing ItemList JSON-LD for this section so the list is easier to parse and cite accurately."

article_jsonld_presence_and_completeness:
  instance: "Add complete Article JSON-LD"
  details:
    - "This article is missing primary Article JSON-LD or does not include enough of it. That removes a strong machine-readable signal about what the page is, who published it, and when it was published or updated. Add complete Article markup that reflects the visible title, author, date, and article context accurately."
    - "The Article JSON-LD for this page is absent or incomplete. When article-level schema is thin, citation systems have less structured context for understanding the page as a publication rather than generic content. Complete the Article markup so the core publication details match what readers see."
    - "This page does not provide complete Article JSON-LD support for the article it contains. That weakens the structured signals around authorship, timing, publisher identity, and article type. Add full Article markup and keep it aligned with the visible page so machines can classify it with more confidence."
