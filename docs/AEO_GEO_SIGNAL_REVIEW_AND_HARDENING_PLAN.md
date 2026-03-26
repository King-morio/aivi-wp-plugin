# AEO/GEO Signal Review and Hardening Plan

## Purpose

Reconcile brittle or loosely defined checks against AiVI's real goal:

- optimize for answer engines and generative engines
- improve citability, extractability, and machine-readable trust
- avoid dragging legacy SEO heuristics into AEO/GEO scoring when they are weak or misleading

This document explains:

- which signals are worth keeping
- which ones need refactoring
- whether web lookups should be used
- how to harden the trust/citation checks without slowing the normal analysis path unnecessarily

## External Guidance

These sources are the strongest baseline for the direction below:

- Google Search Central: helpful, reliable, people-first content
  - https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google Search Central: FAQ structured data
  - https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Google Search Central: How-to structured data
  - https://developers.google.com/search/docs/appearance/structured-data/how-to
- Schema.org: `FAQPage`
  - https://schema.org/FAQPage
- Schema.org: `HowTo`
  - https://schema.org/HowTo

Industry corroboration:

- Neil Patel: AEO vs GEO vs LLMO
  - https://neilpatel.com/blog/aeo-vs-geo-vs-llmo/
- Search Engine Land: generative AI stack / GEO and technical GEO guidance
  - https://searchengineland.com/generative-ai-powered-stack-456079
  - https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142
  - https://searchengineland.com/technical-seo-geo-460898
  - https://searchengineland.com/canonicalization-seo-448161
- Semrush: AI Overviews and structured data / original-source guidance
  - https://www.semrush.com/blog/how-to-rank-in-ai-overviews/

## High-Level Conclusions

1. AiVI should prefer visible evidence quality over classic SEO surrogates.
2. Named, specific, nearby support matters more than vague "authority" scoring.
3. Structured data still matters for machine readability, but FAQ/HowTo rules must be narrower and candidate-based.
4. Web lookups are useful as an optional verification mode, not as the default analysis path.
5. Entity clarity, author context, canonical clarity, and content structure are consistently reinforced by both official and industry sources as citation-supporting signals.

## What The External Evidence Repeats

Across the official and industry sources above, the same patterns show up repeatedly:

- direct answers near the top help extractability
- clear headings, lists, steps, and compact answerable sections help machine parsing
- named sources, original evidence, and support close to claims improve trust and citability
- author identity and expertise signals help reliability
- schema helps when it reflects visible content truthfully
- canonical clarity and duplicate control matter because AI systems can ingest the wrong version otherwise
- freshness matters for freshness-sensitive topics, but not every page needs the same recency pressure

This supports AiVI's AEO/GEO framing strongly. It also suggests which checks are strong and which are still too SEO-shaped or too vague.

## Current AiVI Check Assessment

### Strong and Worth Keeping

These are aligned to AEO/GEO and should stay, with only normal threshold/copy maintenance:

- `immediate_answer_placement`
- `answer_sentence_concise`
- `question_answer_alignment`
- `clear_answer_formatting`
- `lists_tables_presence`
- `single_h1`
- `logical_heading_hierarchy`
- `appropriate_paragraph_length`
- `metadata_checks`
- `author_identified`
- `author_bio_present`
- `schema_matches_content`
- `intro_wordcount`
- `intro_readability`
- `intro_factual_entities`
- `intro_schema_suggestion`

### Keep, But Tighten

These are directionally right, but their current definitions are brittle enough to need hardening:

- `faq_structure_opportunity`
- `faq_jsonld_presence_and_completeness`
- `howto_jsonld_presence_and_completeness`
- `faq_jsonld_generation_suggestion`
- `howto_schema_presence_and_completeness`
- `howto_semantic_validity`
- `heading_topic_fulfillment`
- `temporal_claim_check`
- `semantic_html_usage`
- `citation_format_and_context`
- `claim_provenance_and_evidence`
- `external_authoritative_sources`

### Candidate For Retirement Or Demotion

These are the weakest fits for AiVI's AEO/GEO mission in their current form:

- `content_updated_12_months`
  - should not be universal
  - should be gated by topic freshness sensitivity if kept
- any rule that still depends on a classic "authority estimate" rather than visible source specificity

## Important Missing Signals To Consider Adding

These are not all required immediately, but they are strong AEO/GEO candidates:

### 1. Canonical Clarity / Preferred URL Integrity

Why:

- Search Engine Land explicitly ties canonical clarity to generative retrieval quality
- duplicate or splintered URLs can confuse which version is cited

Recommended check type:

- deterministic

What it would assess:

- canonical exists
- canonical resolves to preferred URL
- canonical is not obviously conflicting with visible page identity

### 2. AI Crawler Accessibility

Why:

- Search Engine Land explicitly recommends ensuring GPTBot / Google-Extended / CCBot access
- if AI crawlers cannot access content, citability suffers regardless of page quality

Recommended check type:

- deterministic, site-level or account-level

What it would assess:

- robots / crawl directives do not block major AI crawlers from public content

### 3. Original Evidence / First-Hand Value Signal

Why:

- Semrush and Search Engine Land both reinforce original research, first-hand experience, or expert commentary as citation-supporting advantages

Recommended check type:

- semantic

What it would assess:

- presence of original examples, firsthand insight, named expert commentary, or proprietary evidence that differentiates the page from generic summaries

### 4. Entity Presence / Entity Context Strength

Why:

- Neil Patel and Search Engine Land both emphasize entity clarity and consistent terminology

Recommended check type:

- partly already covered by current entity checks, but the cluster needs sharpening rather than broad removal

## Web Lookups: Final Recommendation

## Claim Provenance & Evidence

## Current Problem

The current shared definition says:

- fail if web lookups are disabled or evidence cannot be verified

That is brittle because the analyzer prompt is specimen-bound and explicitly forbids external inference.

## Recommendation

Do **not** make web lookups mandatory for normal analysis.

Instead split this into two layers:

1. **Default core check**  
   visible-claim support only
2. **Optional verification mode**  
   external web verification when the user explicitly enables it

### Recommended rule for default analysis

Rename or refocus the current check so it evaluates only what is visible in the specimen:

- does the claim have a named source nearby?
- does it have a concrete statistic, date, study name, publication, or example nearby?
- is the support directly attached to the claim, or only vaguely implied?

This keeps the check useful even with no web lookups.

### Recommended rule for web-lookup mode

When web lookups are enabled:

- verify whether the cited source or claim has credible external support
- allow stronger fail states for unsupported or misattributed factual claims

### UI recommendation

Expose web lookups as an **optional verification toggle** near the analyze action, not as a hidden background rule.

Suggested label:

- `Verify claims with web lookups`

Suggested help note:

- `Adds external verification and may increase analysis time.`

If you want an info tooltip, that is the right place to put it.

### Latency expectation

Yes, web lookups will likely increase analysis time and cost.

Why:

- external retrieval adds network latency
- extra verification logic adds more model work
- it can increase retry surface if providers rate-limit or return slow responses

So this should not be on by default for every analysis.

### Local implementation note

AiVI already has backend scaffolding for this:

- plugin/admin setting exists in [class-admin-settings.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-admin-settings.php)
- backend carries `enable_web_lookups`
- current sidebar path still sends it as `false`

That means the feature should be exposed intentionally, not silently enforced.

## Recommendation For `claim_provenance_and_evidence`

Keep the check, but redefine it around **visible support quality by default**.

Default analysis should ask:

- is the claim backed by a named source, statistic, dated study, or concrete example in the article itself?
- is the support close enough to the claim to be reusable?
- does the evidence actually belong to the claim, or is the article only gesturing vaguely toward support?

Web lookup mode should be optional and additive, not required for a normal pass.

Recommended direction:

- default mode: `Claim Support & Provenance`
- optional enhanced mode: web-verified provenance

## Recommendation For `external_authoritative_sources`

Keep the need, but replace the current concept.

Do not score on "domain authority estimate."

Instead score on:

- source specificity
- source recognizability
- claim-support proximity
- whether the source is meaningfully attached to the claim

Recommended replacement name:

- `Named External Source Support`

or

- `Specific External Source Support`

## External Authoritative Sources

## Current Problem

The current rule still uses:

- `Domain authority estimate`

That is too SEO-shaped for AiVI's real goal.

## Recommendation

Rename and refine the check around **source specificity and support quality**, not domain authority.

Recommended new name:

- `Named External Source Support`

or, if you want to keep "authoritative":

- `Specific External Source Support`

### Recommended evaluation basis

The check should ask:

- are external sources named explicitly?
- are those sources recognizable enough to be trusted and revisited?
- are they placed close to the claims they support?
- do they materially support the article's strongest factual claims?

Examples of stronger positive signals:

- named study, institution, publication, or expert
- direct link or visible citation nearby
- support attached to the claim rather than dumped in a bibliography

Examples of weaker signals:

- "experts say"
- "research shows"
- unnamed studies
- vague source gestures with no nearby support

### Why this is better for AEO/GEO

Answer engines care about whether claims can be trusted, re-traced, and reused.  
That is better served by:

- specificity
- recognizability
- claim-support proximity

than by an abstract "authority estimate."

## Other Brittle Checks Worth Fixing

### `faq_structure_opportunity`

Keep it semantic, but candidate-based only.

It should:

- pass when a piece is not a real FAQ candidate
- fail only when FAQ candidacy is strong but reusable Q&A structure is absent

It should not rely on topical headings alone.

### `faq_jsonld_presence_and_completeness`

Current definition uses:

- pass when FAQ style is not detected

That is safe internally, but conceptually muddy as a surfaced rule.

Recommendation:

- keep the behavior internally
- but treat it as conditional/neutral, not as an implicitly positive signal

### `howto_jsonld_presence_and_completeness`

Same issue as FAQ presence:

- safe internally
- but should be treated as conditional rather than an actual positive signal when no how-to candidacy exists

### `schema_matches_content`

This should remain deterministic, but it is fragile if content-type metadata is missing or stale.

Recommendation:

- only score when content type evidence is real
- stay neutral when content type is missing or uncertain

### `temporal_claim_check`

Current wording is too vague:

- "Flag time-sensitive words like recently"

Recommendation:

- narrow it to claims whose time-sensitive wording materially affects correctness or staleness
- do not fire on harmless recency language alone

### `content_updated_12_months`

This is currently a classic freshness rule.

Recommendation:

- keep it only for freshness-sensitive topics
- do not treat it as universally important for evergreen explainers

### `heading_topic_fulfillment`

This is acceptable as a semantic rule now that it is renamed, but it still needs a tighter definition of failure.

Recommendation:

- fail only when the section clearly fails to deliver on the heading promise
- avoid over-penalizing sections that are merely concise but still on-topic

## Recommended Fix Sequence

## Patch 1: Trust and source signal refactor

- refocus `claim_provenance_and_evidence` around visible support by default
- add optional web-lookup verification mode
- rename/refine `external_authoritative_sources`

## Patch 2: Conditional signal cleanup

- tighten `faq_structure_opportunity`
- keep FAQ/HowTo presence checks neutral when not triggered
- tighten `schema_matches_content`
- narrow `temporal_claim_check`
- gate `content_updated_12_months` by freshness-sensitive context

## Patch 3: Final wording and scoring reconciliation

- update prompt, definitions, runtime contract, serializers, scoring notes, and UI copy together
- confirm sidebar/review-rail surfaces stay aligned

## Implementation Principle

For AiVI, every check should answer one of these:

- can an answer engine extract the answer cleanly?
- can a generative engine trust and cite the content safely?
- is the structure machine-readable enough to preserve meaning?

If a check mostly measures an old SEO heuristic or a surrogate that does not clearly support one of those goals, it should be:

- narrowed
- demoted
- renamed
- or removed
