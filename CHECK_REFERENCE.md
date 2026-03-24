# AiVI Check Reference

This guide explains the major check families AiVI uses, what each family is trying to measure, and how to interpret common verdict patterns in practice.

It is meant to help users and contributors understand the current plugin behavior without needing to read internal scoring code.

## How to Read AiVI Verdicts

AiVI uses three main verdict states:

- **Pass** — healthy enough that it should not be featured as a problem
- **Partial** — there is useful structure or intent, but the signal is still weaker than ideal
- **Fail** — the issue is strong enough to surface as a meaningful recommendation

Some checks are also effectively **advisory**:

- they may influence internal guidance
- they may appear as informational context
- they are not always meant to surface as hard user-facing problems

## Check Types

AiVI uses three broad check types:

- **Deterministic** — rule-based checks derived from the article structure, manifest, metadata, or markup
- **Semantic** — model-assisted checks that judge meaning, alignment, support quality, or extractability
- **Hybrid** — checks that combine deterministic signals with a composite or model-shaped interpretation

## Important Interpretation Notes

- Not every check has a precise inline highlight.
- Some checks are **document-scope** and may point you to a nearby section instead of an exact sentence.
- Pass checks are not supposed to dominate the sidebar or review rail.
- Some schema and verification states are intentionally kept score-neutral when they are not materially required.

## Intro Focus & Factuality

This family evaluates how well the article opens.

### What AiVI looks at

- whether the intro exists before the first real in-body section heading
- whether the intro length is appropriate
- whether the intro is readable
- whether factual claims in the intro have nearby support
- whether the intro shows useful schema cues

### Current intro boundary

AiVI treats the intro as the content between the title/H1 and the first in-body `H2` or `H3`.

That means:

- intro checks are no longer supposed to drift into deeper sections
- factual-entity flags should stay inside the true opening section

### Checks in this family

- **Intro Focus & Factuality Composite**
  - rolls up the core opening-quality signals
- **Intro Word Count**
  - current behavior:
    - pass at `40–150` words
    - partial at `20–39` or `151–200`
    - fail under `20` or over `200`
- **Intro Readability**
  - looks at sentence length, passive voice, and readability fit
- **Intro Factual Entities**
  - checks whether intro-level factual claims have nearby visible support
- **Intro Schema Suggestion**
  - advisory schema guidance based on intro intent and content type

### Common edge cases

- A strong intro can still get a partial if it is readable but too short or too long.
- Schema suggestion is advisory and should not by itself make the intro composite look broken.
- A fact deeper under the first real section heading should not be judged as part of the intro.

## Answer Extractability

This family checks how well AiVI can identify and reuse the article’s opening answer.

### What AiVI looks at

- whether the answer appears quickly
- whether the answer snippet is concise
- whether the answer directly resolves the question
- whether the format is easy to extract
- whether repeated question-answer content should be split into FAQ structure

### Current answer-family behavior

These checks rely heavily on a **strict question anchor** when the article is clearly answering a question.

If the article has no clean question anchor, AiVI may return a partial rather than a strong pass, even when the topic is relevant.

### Checks in this family

- **Immediate Answer Placement**
  - pass when the direct answer appears early enough after the question anchor
- **Answer Snippet Concise**
  - pass when the primary answer snippet is complete, reusable, and within the current ideal band
- **Question-Answer Alignment**
  - checks whether the first answer actually resolves the same question
- **Clear Answer Formatting**
  - checks whether the answer is easy to scan in the format the question calls for
- **FAQ Structure Opportunity**
  - checks whether repeated visible Q&A should be separated into reusable FAQ pairs

### Common edge cases

- A good answer can still get a partial when the question-to-answer path is too ambiguous.
- A short factual answer does not need bullets to pass formatting.
- FAQ opportunity should not fire just because a topic mentions questions once; it needs visible repeated Q&A shape.

## Structure & Readability

This family looks at how well the article is organized and how easy it is to scan.

### Checks in this family

- **Single H1**
  - checks that the article has exactly one H1
- **Logical Heading Hierarchy**
  - checks for heading-level skips such as `H2` to `H4`
- **Heading Topic Fulfillment**
  - checks whether a heading is actually fulfilled by the section beneath it
- **Heading Fragmentation**
  - checks whether the top-level outline is over-split into sections that hand off too quickly without framing
- **Lists & Tables Presence**
  - looks for helpful structured support where appropriate
- **Readability Adaptivity**
  - checks whether sentence style and structure are readable for the content type
- **Appropriate Paragraph Length**
  - checks whether paragraphs are becoming too long or awkward to scan

### Important distinction

AiVI now treats these two checks differently:

- **Heading Fragmentation** = outline over-segmentation
- **Heading Topic Fulfillment** = a specific heading is not meaningfully supported

So if the problem is “this heading is unsupported,” that belongs more to **Heading Topic Fulfillment** than **Heading Fragmentation**.

### Common edge cases

- A short but properly framed section should not automatically count as fragmented.
- If a heading introduces a section but the support underneath changes topic, that is a fulfillment problem.

## Schema & Structured Data

This family checks whether visible content and structured data are aligned.

### Checks in this family

- **Valid JSON-LD Schema**
  - checks whether JSON-LD is syntactically valid
- **Article JSON-LD Presence & Completeness**
  - checks whether article-like pages expose a primary `Article`, `BlogPosting`, or `NewsArticle` schema with the core fields needed to identify the page as a citable article
- **Schema Matches Content**
  - checks whether visible content and schema intent agree
- **Canonical Clarity**
  - checks whether the canonical URL is present and well-formed
- **Semantic HTML Usage**
  - checks whether HTML structure uses meaningful semantic elements
- **Supported Schema Types Validation**
  - checks whether the schema types in use are supported and appropriate
- **FAQ JSON-LD Presence & Completeness**
  - checks whether visible FAQ content has complete FAQPage schema when genuinely needed
- **HowTo JSON-LD Presence & Completeness**
  - checks whether visible procedural content has complete HowTo schema when genuinely needed
- **FAQ JSON-LD Generation**
  - suggests FAQ schema when visible FAQ structure exists
- **HowTo Schema Completeness**
  - bridges visible how-to content and schema completeness expectations
- **ItemList JSON-LD Presence & Completeness**
  - checks whether strong visible list sections are mirrored by aligned `ItemList` JSON-LD when appropriate

### Current candidacy behavior

AiVI is more selective now about when FAQ, HowTo, article, or ItemList schema is actually required.

- FAQ schema should be driven by real visible Q&A structure
- HowTo schema should be driven by real procedural intent, not just generic bullet lists
- Article schema should be checked separately from JSON-LD syntax validity
- ItemList schema should only be checked for strong visible list candidates, not for every paragraph or weak bullet block

### Common edge cases

- A normal explainer with unordered tips should not be treated as a HowTo just because it has bullets.
- Two short Q&A-style blocks do not automatically mean the page should fail FAQ schema.
- A page can pass JSON-LD syntax validation and still fail the primary article-schema check if no real article schema is present.
- A visible list should not trigger ItemList requirements when it is really FAQ, step-by-step HowTo, breadcrumbs, nav, or a weak two-item note block.
- Some schema checks are intentionally score-neutral when the content is not a real candidate.

## Freshness & Temporal

This family checks recency-sensitive content and timing clarity.

### Checks in this family

- **Content Updated in 12 Months**
  - checks for a visible freshness signal when recency materially matters
- **No Broken Internal Links**
  - checks whether internal links resolve cleanly
- **Temporal Claim Check**
  - checks whether time-sensitive claims include enough timing context

### Current freshness behavior

AiVI is more selective now about what counts as freshness-sensitive.

Freshness is meant to matter when the article contains real recency cues such as:

- explicit update language
- time-sensitive claims
- clearly recency-driven topics

It should not fire just because the article mentions evergreen topics like pricing or statistics.

### Common edge cases

- If link verification is temporarily unavailable, AiVI should not treat that as the same thing as a confirmed broken link.
- A claim can be accurate and still get flagged if the timing context is too vague.

## Entities & Semantic Clarity

This family checks whether the article names things clearly and uses them consistently.

### Checks in this family

- **Named Entities Detected**
  - informational entity detection
- **Entities Contextually Relevant**
  - checks whether the named entities actually belong to the topic
- **Entity Relationships Clear**
  - checks whether relationships between entities are understandable
- **Entity Disambiguation**
  - checks whether ambiguous names are clear in context
- **Terminology Consistency**
  - checks whether key terms are used consistently
- **HowTo Semantic Validity**
  - checks whether clearly procedural content truly reads like a coherent instructional flow

### Common edge cases

- General explainers should not be treated as how-to content just because they mention actions.
- Entity ambiguity can surface even when the writing feels obvious to the author if the surrounding context is too thin.

## Trust, Neutrality & Safety

This family checks whether the article is trustworthy, attributable, and safe to reuse.

### Checks in this family

- **Author Identified**
  - checks for a visible author signal
- **Author Bio Present**
  - checks for author-context markup or content
- **Metadata Checks**
  - checks title, description, canonical, and language basics
- **AI Crawler Accessibility**
  - checks whether page directives block indexing or snippet reuse
- **Accessibility Basics**
  - checks basics such as missing image alt text
- **Named External Source Support**
  - checks whether claims cite recognizable sources
- **Claim Provenance & Evidence**
  - checks whether claims are visibly supported nearby
- **Numeric Claim Consistency**
  - checks whether numbers conflict internally
- **Contradictions & Coherence**
  - checks for internal logical conflicts
- **No Exaggerated Claims**
  - checks for sensational or inflated language
- **Promotional Intent**
  - checks whether the article becomes overly commercial
- **PII Detector**
  - checks for sensitive personal data

### Common edge cases

- A well-written article can still get trust-related findings if it makes important claims without nearby support.
- Accessibility findings are often deterministic and do not always point to a single sentence.
- Promotional intent is often more advisory than binary unless the tone becomes clearly distorted.

## Citability & Verifiability

This family checks whether claims are easy to quote, verify, and support.

### Checks in this family

- **Original Evidence Signal**
  - checks whether the article contributes first-hand or original supporting material
- **Claim Pattern Detection**
  - informational claim-identification pass
- **Factual Statements Well Formed**
  - checks whether factual statements are clear and stand alone well
- **Internal Link Relevance**
  - checks whether internal links support the surrounding claim
- **Duplicate Detection**
  - checks for duplicate or near-duplicate overlap
- **Citation Format and Context**
  - checks whether citations actually support nearby claims in a usable way

### Common edge cases

- An article can be accurate and still look generic if it contributes no original evidence signal.
- Internal-link relevance should only judge links that actually exist in the visible content.
- Citation context is about support quality, not just whether a link appears somewhere on the page.

## What AiVI Surfaces vs What It Keeps Quiet

In normal use:

- strong user-facing problems should surface as partials or fails
- document-scope issues may surface without exact inline anchors
- score-neutral internal bridge states should not be shown like hard failures
- pass findings should not be featured like problems

That is especially important in these areas:

- FAQ and HowTo schema candidacy
- freshness checks when recency is not material
- answer-family checks when the article lacks a clean question anchor

## Practical Reading Tips

When reviewing results, it helps to ask:

1. Is this check judging the **content itself**, the **structure**, or the **markup**?
2. Is the issue **inline**, **section-level**, or **document-scope**?
3. Is the verdict pointing to a real defect, or to an improvement opportunity that is only partial?
4. Is the article actually a candidate for the pattern being checked, such as FAQ or HowTo?

## Related Documents

- `USER_GUIDE.md`
- `readme.md`
- `CONTRIBUTING.md`

As the public documentation set grows, this guide should be paired with a dedicated troubleshooting guide, privacy policy, and terms of service.
