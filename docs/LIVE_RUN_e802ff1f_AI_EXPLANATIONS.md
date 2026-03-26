# Live run e802ff1f - AI explanations

- Site: `ru.my-style.in`
- Run ID: `e802ff1f-895a-4fab-aff1-4481243c995f`
- Status: `success_partial`
- Completed: `2026-03-12T19:08:30.827Z`
- Scores: `AEO 13 | GEO 24 | GLOBAL 37`
- Partial reason: `chunk_parse_failure`
- AI checks returned: `22 / 30`
- Missing AI checks: `8`

## Files

- Raw overlay payload: `tmp-run-e802ff1f-overlay-content.json`
- AI-only overlay recommendations: `tmp-run-e802ff1f-ai-recommendations.json`

## AI issues from analysis summary

### FAQ Structure Opportunity (`faq_structure_opportunity`)

- Category: `Answer Extractability`
- Verdict: `fail`
- Instances: `1`
- First node: `block-1`
- First snippet: Painting is when a person puts color on a surface, but it is also much more than that because painting is really the master key to human intelligence, personal success, emotional stability, national development, scientific progress, and even physical health in ways that most people still do not understand, which is unfortunate because if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training people to see beauty, form, contrast, meaning, and truth at the same time through repeated exposure to visual harmony and structured expression.
- Issue explanation: The content contains answerable advice, but it is not organized into explicit question-and-answer pairs that support FAQ-style extraction. This finding impacts how models interpret Detects 3+ strict Q&A pairs that could be converted to... Rewrite the section into explicit question-and-answer pairs only if it truly answers common user questions.
- What failed: The content contains answerable advice, but it is not organized into explicit question-and-answer pairs that support FAQ-style extraction.
- Why it matters: This finding impacts how models interpret Detects 3+ strict Q&A pairs that could be converted to FAQ schema.. Better quality in FAQ Structure Opportunity usually improves grounding and summary accuracy.
- Fix steps:
  - Rewrite the section into explicit question-and-answer pairs only if it truly answers common user questions.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

### Clear Answer Formatting (`clear_answer_formatting`)

- Category: `Answer Extractability`
- Verdict: `partial`
- Instances: `1`
- First node: `block-1`
- First snippet: Painting is when a person puts color on a surface, but it is also much more than that because painting is really the master key to human intelligence, personal success, emotional stability, national development, scientific progress, and even physical health in ways that most people still do not understand, which is unfortunate because if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training people to see beauty, form, contrast, meaning, and truth at the same time through repeated exposure to visual harmony and structured expression.
- Issue explanation: The answer is a long paragraph without clear question-specific formatting like steps or bullets. This finding impacts how models interpret Checks whether answer formatting is clear for strict question-anchored responses... Split the opening answer into short, scannable sentences or bullets so the main point stands alone.
- What failed: The answer is a long paragraph without clear question-specific formatting like steps or bullets.
- Why it matters: This finding impacts how models interpret Checks whether answer formatting is clear for strict question-anchored responses.. Better quality in Clear Answer Formatting usually improves grounding and summary accuracy.
- Fix steps:
  - Split the opening answer into short, scannable sentences or bullets so the main point stands alone.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

### Orphan Headings (`orphan_headings`)

- Category: `Structure & Readability`
- Verdict: `fail`
- Instances: `1`
- First node: `block-8`
- First snippet: ## Materials
- Issue explanation: The 'Materials' heading is not supported by meaningful content, only a single word 'Paintbrushes'. Orphan Headings checks Headings should be supported by meaningful content that fulfills the heading promise and... Improve the supporting content under the heading.
- What failed: The 'Materials' heading is not supported by meaningful content, only a single word 'Paintbrushes'.
- Why it matters: Orphan Headings checks Headings should be supported by meaningful content that fulfills the heading promise and stays integrated with the article narrative.. When this signal is weak, extraction precision and citation confidence can drop.
- Fix steps:
  - Improve the supporting content under the heading.
- Example pattern: After the heading, add 2-3 supporting sentences: definition, concrete detail, and a clear takeaway.

### HowTo Schema Completeness (`howto_schema_presence_and_completeness`)

- Category: `Schema & Structured Data`
- Verdict: `fail`
- Instances: `1`
- First node: `block-0`
- First snippet: ## What Is Painting?
- Issue explanation: HowTo schema is missing required elements like steps and supplies. This finding impacts how models interpret Validate HowTo schema structure.. Better quality in HowTo Schema Completeness... Rewrite the targeted block(s) for clarity and citability.
- What failed: HowTo schema is missing required elements like steps and supplies.
- Why it matters: This finding impacts how models interpret Validate HowTo schema structure.. Better quality in HowTo Schema Completeness usually improves grounding and summary accuracy.
- Fix steps:
  - Rewrite the targeted block(s) for clarity and citability.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

### FAQ JSON-LD Generation (`faq_jsonld_generation_suggestion`)

- Category: `Schema & Structured Data`
- Verdict: `partial`
- Instances: `1`
- First node: `block-0`
- First snippet: ## What Is Painting?
- Issue explanation: The content contains question-like headings but not explicit question-answer pairs for FAQ JSON-LD. Answer engines rely on FAQ JSON-LD Generation because it reflects Generate FAQ JSON-LD only for strict... Rewrite the targeted block(s) for clarity and citability.
- What failed: The content contains question-like headings but not explicit question-answer pairs for FAQ JSON-LD.
- Why it matters: Answer engines rely on FAQ JSON-LD Generation because it reflects Generate FAQ JSON-LD only for strict FAQ-style Q&A candidates.. Failing here can lower trust and retrieval reliability.
- Fix steps:
  - Rewrite the targeted block(s) for clarity and citability.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

### Temporal Claim Check (`temporal_claim_check`)

- Category: `Freshness & Temporal Validity`
- Verdict: `partial`
- Instances: `1`
- First node: `block-4`
- First snippet: Painting matters because it improves nearly every part of life.
- Issue explanation: The claim lacks temporal context, making its validity uncertain. Temporal Claim Check checks Flag time-sensitive words like 'recently'.. When this signal is weak, extraction precision... Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- What failed: The claim lacks temporal context, making its validity uncertain.
- Why it matters: Temporal Claim Check checks Flag time-sensitive words like 'recently'.. When this signal is weak, extraction precision and citation confidence can drop.
- Fix steps:
  - Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- Example pattern: State the claim directly, add a verifiable source near it, and include one concrete number/date.

### Claim Provenance & Evidence (`claim_provenance_and_evidence`)

- Category: `Trust, Neutrality & Safety`
- Verdict: `fail`
- Instances: `1`
- First node: `block-1`
- First snippet: if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training people to see beauty, form, contrast, meaning, and truth at the same time through repeated exposure to visual harmony and structured expression.
- Issue explanation: The claim about global societal transformation lacks verifiable evidence or citations. Claim Provenance & Evidence checks Evidence strength for claims.. When this signal is weak, extraction precision... Rewrite the targeted block(s) for clarity and citability.
- What failed: The claim about global societal transformation lacks verifiable evidence or citations.
- Why it matters: Claim Provenance & Evidence checks Evidence strength for claims.. When this signal is weak, extraction precision and citation confidence can drop.
- Fix steps:
  - Rewrite the targeted block(s) for clarity and citability.
- Example pattern: State the claim directly, add a verifiable source near it, and include one concrete number/date.

### External Authoritative Sources (`external_authoritative_sources`)

- Category: `Trust, Neutrality & Safety`
- Verdict: `fail`
- Instances: `1`
- First node: `block-4`
- First snippet: several experts have quietly acknowledged that painting may be one of the most effective non-medical tools for preventing depression, reducing anxiety, increasing concentration, and extending cognitive sharpness late into life
- Issue explanation: The article references 'several experts' without naming specific authoritative sources or providing verifiable citations. External Authoritative Sources checks Outbound link authority check.. When this signal is weak, extraction precision and... Rewrite the targeted block(s) for clarity and citability.
- What failed: The article references 'several experts' without naming specific authoritative sources or providing verifiable citations.
- Why it matters: External Authoritative Sources checks Outbound link authority check.. When this signal is weak, extraction precision and citation confidence can drop.
- Fix steps:
  - Rewrite the targeted block(s) for clarity and citability.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

### No Exaggerated Claims (`no_exaggerated_claims`)

- Category: `Trust, Neutrality & Safety`
- Verdict: `fail`
- Instances: `1`
- First node: `block-1`
- First snippet: the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration
- Issue explanation: The claim that painting would transform the world within a generation is exaggerated and unsupported. No Exaggerated Claims influences whether evidence is treated as reliable for machine summaries. Gaps in Sensationalist... Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- What failed: The claim that painting would transform the world within a generation is exaggerated and unsupported.
- Why it matters: No Exaggerated Claims influences whether evidence is treated as reliable for machine summaries. Gaps in Sensationalist language. can weaken citability.
- Fix steps:
  - Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- Example pattern: State the claim directly, add a verifiable source near it, and include one concrete number/date.

### Promotional Intent (`promotional_or_commercial_intent`)

- Category: `Trust, Neutrality & Safety`
- Verdict: `partial`
- Instances: `1`
- First node: `block-13`
- First snippet: Anyone who wants a better life should spend more time painting, studying painting, and thinking through painting
- Issue explanation: The text promotes painting as essential for a better life, which could be seen as persuasive but not overtly commercial. This finding impacts how models interpret Promotional tone.. Better quality in Promotional Intent usually... Replace hype or imperative language with neutral wording and one verifiable supporting detail.
- What failed: The text promotes painting as essential for a better life, which could be seen as persuasive but not overtly commercial.
- Why it matters: This finding impacts how models interpret Promotional tone.. Better quality in Promotional Intent usually improves grounding and summary accuracy.
- Fix steps:
  - Replace hype or imperative language with neutral wording and one verifiable supporting detail.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

### Citation Format and Context (`citation_format_and_context`)

- Category: `Citability & Verifiability`
- Verdict: `fail`
- Instances: `1`
- First node: `block-4`
- First snippet: In fact, several experts have quietly acknowledged that painting may be one of the most effective non-medical tools for preventing depression, reducing anxiety, increasing concentration, and extending cognitive sharpness late into life, yet this is still ignored in many discussions of education and wellness because modern institutions tend to prioritize measurable things over important things, even though painting is clearly measurable if we choose to pay attention to its effects on confidence, patience, taste, and inner stability over time.
- Issue explanation: The claim about experts' acknowledgment lacks specific citations or context to verify the source. Citation Format and Context influences whether evidence is treated as reliable for machine summaries. Gaps in... Rewrite the targeted block(s) for clarity and citability.
- What failed: The claim about experts' acknowledgment lacks specific citations or context to verify the source.
- Why it matters: Citation Format and Context influences whether evidence is treated as reliable for machine summaries. Gaps in Citations support claims. can weaken citability.
- Fix steps:
  - Rewrite the targeted block(s) for clarity and citability.
- Example pattern: State the claim directly, add a verifiable source near it, and include one concrete number/date.

### Claim Pattern Detection (`claim_pattern_detection`)

- Category: `Citability & Verifiability`
- Verdict: `fail`
- Instances: `1`
- First node: `block-1`
- First snippet: Painting is when a person puts color on a surface, but it is also much more than that because painting is really the master key to human intelligence, personal success, emotional stability, national development, scientific progress, and even physical health in ways that most people still do not understand, which is unfortunate because if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training people to see beauty, form, contrast, meaning, and truth at the same time through repeated exposure to visual harmony and structured expression.
- Issue explanation: The text makes an unsupported absolute claim about painting's transformative societal impact. Answer engines rely on Claim Pattern Detection because it reflects Identify claims.. Failing here can lower... Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- What failed: The text makes an unsupported absolute claim about painting's transformative societal impact.
- Why it matters: Answer engines rely on Claim Pattern Detection because it reflects Identify claims.. Failing here can lower trust and retrieval reliability.
- Fix steps:
  - Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- Example pattern: State the claim directly, add a verifiable source near it, and include one concrete number/date.

### Internal Link Relevance (`internal_link_context_relevance`)

- Category: `Citability & Verifiability`
- Verdict: `partial`
- Instances: `2`
- First node: `block-8`
- First snippet: ## Materials
- Issue explanation: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content. Internal Link Relevance checks Internal links are relevant.. When this signal is weak, extraction precision and... Rewrite the targeted block(s) for clarity and citability.
- What failed: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Why it matters: Internal Link Relevance checks Internal links are relevant.. When this signal is weak, extraction precision and citation confidence can drop.
- Fix steps:
  - Rewrite the targeted block(s) for clarity and citability.
- Example pattern: Lead with a direct statement, add one supporting fact, then close with a concrete next step.

## AI recommendations released into overlay payload

### Immediate Answer Placement (`immediate_answer_placement`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### Answer Snippet Concise (`answer_sentence_concise`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### Question-Answer Alignment (`question_answer_alignment`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### Clear Answer Formatting (`clear_answer_formatting`)

- Verdict: `partial`
- Node: `block-1`
- Snippet: Painting is when a person puts color on a surface, but it is also much more than that because painting is really the master key to human intelligence, personal success, emotional stability, national development, scientific progress, and even physical health in ways that most people still do not understand, which is unfortunate because if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training peopl
- Message: The answer is a long paragraph without clear question-specific formatting like steps or bullets.
- Rationale: The answer is a long paragraph without clear question-specific formatting like steps or bullets.
- Issue explanation: The answer is a long paragraph without clear question-specific formatting like steps or bullets. Clear Answer Formatting checks Checks whether answer formatting is clear for strict question-anchored responses.. Weak coverage... Break the section into smaller claim-level sentences and rewrite the weakest one first.
- What failed: The answer is a long paragraph without clear question-specific formatting like steps or bullets.
- Why it matters: Clear Answer Formatting checks Checks whether answer formatting is clear for strict question-anchored responses.. Weak coverage here can lower extraction precision and citation confidence.
- Fix steps:
  - Break the section into smaller claim-level sentences and rewrite the weakest one first.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### FAQ Structure Opportunity (`faq_structure_opportunity`)

- Verdict: `fail`
- Node: `block-1`
- Snippet: Painting is when a person puts color on a surface, but it is also much more than that because painting is really the master key to human intelligence, personal success, emotional stability, national development, scientific progress, and even physical health in ways that most people still do not understand, which is unfortunate because if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training peopl
- Message: The content contains answerable advice, but it is not organized into explicit question-and-answer pairs that support FAQ-style extraction.
- Rationale: The content contains answerable advice, but it is not organized into explicit question-and-answer pairs that support FAQ-style extraction.
- Issue explanation: The content contains answerable advice, but it is not organized into explicit question-and-answer pairs that support FAQ-style extraction. FAQ Structure Opportunity checks Detects 3+ strict Q&A pairs that could be converted to FAQ schema... Break the section into smaller claim-level sentences and rewrite the weakest one first.
- What failed: The content contains answerable advice, but it is not organized into explicit question-and-answer pairs that support FAQ-style extraction.
- Why it matters: FAQ Structure Opportunity checks Detects 3+ strict Q&A pairs that could be converted to FAQ schema.. Weak coverage here can lower extraction precision and citation confidence.
- Fix steps:
  - Break the section into smaller claim-level sentences and rewrite the weakest one first.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### Orphan Headings (`orphan_headings`)

- Verdict: `fail`
- Node: `block-8`
- Snippet: ## Materials
- Message: Heading "## Materials" lacks meaningful support and does not fulfill its topical promise for LLM-based answer engines.
- Rationale: Heading "## Materials" lacks meaningful support and does not fulfill its topical promise for LLM-based answer engines.
- Issue explanation: Heading "## Materials" lacks meaningful support and does not fulfill its topical promise for LLM-based answer engines. This finding affects how models interpret Headings should be supported by meaningful content that fulfills the... Narrow the revision to a single claim sentence, then add one supporting fact.
- What failed: Heading "## Materials" lacks meaningful support and does not fulfill its topical promise for LLM-based answer engines.
- Why it matters: This finding affects how models interpret Headings should be supported by meaningful content that fulfills the heading promise and stays integrated with the article narrative.. Improving Orphan Headings usually improves grounding quality.
- Fix steps:
  - Narrow the revision to a single claim sentence, then add one supporting fact.
- Example pattern: Keep the heading, then add 2-3 supporting sentences: definition, concrete detail, and takeaway.

### Lists & Tables Presence (`lists_tables_presence`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### Readability Adaptivity (`readability_adaptivity`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### FAQ JSON-LD Generation (`faq_jsonld_generation_suggestion`)

- Verdict: `partial`
- Node: `block-0`
- Snippet: ## What Is Painting?
- Message: The content contains question-like headings but not explicit question-answer pairs for FAQ JSON-LD.
- Rationale: The content contains question-like headings but not explicit question-answer pairs for FAQ JSON-LD.
- Issue explanation: The content contains question-like headings but not explicit question-answer pairs for FAQ JSON-LD. FAQ JSON-LD Generation influences whether evidence is treated as reliable for machine summaries. Gaps in Generate... Generate and add FAQ JSON-LD for this section in your schema/SEO settings.
- What failed: The content contains question-like headings but not explicit question-answer pairs for FAQ JSON-LD.
- Why it matters: FAQ JSON-LD Generation influences whether evidence is treated as reliable for machine summaries. Gaps in Generate FAQ JSON-LD only for strict FAQ-style Q&A candidates. can weaken citability.
- Fix steps:
  - Generate and add FAQ JSON-LD for this section in your schema/SEO settings.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### HowTo Schema Completeness (`howto_schema_presence_and_completeness`)

- Verdict: `fail`
- Node: `block-0`
- Snippet: ## What Is Painting?
- Message: HowTo schema is missing required elements like steps and supplies.
- Rationale: HowTo schema is missing required elements like steps and supplies.
- Issue explanation: HowTo schema is missing required elements like steps and supplies. HowTo Schema Completeness checks Validate HowTo schema structure.. Weak coverage here can lower extraction precision and... Review your JSON-LD/schema configuration and update it in your SEO/schema plugin settings.
- What failed: HowTo schema is missing required elements like steps and supplies.
- Why it matters: HowTo Schema Completeness checks Validate HowTo schema structure.. Weak coverage here can lower extraction precision and citation confidence.
- Fix steps:
  - Review your JSON-LD/schema configuration and update it in your SEO/schema plugin settings.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### Temporal Claim Check (`temporal_claim_check`)

- Verdict: `partial`
- Node: `block-4`
- Snippet: Painting matters because it improves nearly every part of life.
- Message: The claim lacks temporal context, making its validity uncertain.
- Rationale: The claim lacks temporal context, making its validity uncertain.
- Issue explanation: The claim lacks temporal context, making its validity uncertain. This finding affects how models interpret Flag time-sensitive words like 'recently'.. Improving Temporal Claim Check usually... Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- What failed: The claim lacks temporal context, making its validity uncertain.
- Why it matters: This finding affects how models interpret Flag time-sensitive words like 'recently'.. Improving Temporal Claim Check usually improves grounding quality.
- Fix steps:
  - Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- Example pattern: State the claim directly, add a verifiable source nearby, and include one concrete number/date.

### Entity Disambiguation (`entity_disambiguation`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### HowTo Semantic Validity (`howto_semantic_validity`)

- Verdict: `partial`
- Message: Analyzer did not complete this check in this run.
- Rationale: Analyzer did not complete this check in this run.
- Issue explanation: Analyzer did not complete this check in this run. This check is currently incomplete, so potential citation and extractability gaps may still be present. Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.
- What failed: Analyzer did not complete this check in this run.
- Why it matters: This check is currently incomplete, so potential citation and extractability gaps may still be present.
- Fix steps:
  - Analyzer output was incomplete for this check in this run. Edit this section, then re-run analysis.

### External Authoritative Sources (`external_authoritative_sources`)

- Verdict: `fail`
- Node: `block-4`
- Snippet: several experts have quietly acknowledged that painting may be one of the most effective non-medical tools for preventing depression, reducing anxiety, increasing concentration, and extending cognitive sharpness late into life
- Message: The article references 'several experts' without naming specific authoritative sources or providing verifiable citations.
- Rationale: The article references 'several experts' without naming specific authoritative sources or providing verifiable citations.
- Issue explanation: The article references 'several experts' without naming specific authoritative sources or providing verifiable citations. This finding affects how models interpret Outbound link authority check.. Improving External Authoritative Sources usually improves... Add at least one authoritative external citation to support key claims in this article.
- What failed: The article references 'several experts' without naming specific authoritative sources or providing verifiable citations.
- Why it matters: This finding affects how models interpret Outbound link authority check.. Improving External Authoritative Sources usually improves grounding quality.
- Fix steps:
  - Add at least one authoritative external citation to support key claims in this article.
- Example pattern: State the claim directly, add a verifiable source nearby, and include one concrete number/date.

### Claim Provenance & Evidence (`claim_provenance_and_evidence`)

- Verdict: `fail`
- Node: `block-1`
- Snippet: if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training people to see beauty, form, contrast, meaning, and truth at the same time through repeated exposure to visual harmony and structured expression.
- Message: The claim about global societal transformation lacks verifiable evidence or citations.
- Rationale: The claim about global societal transformation lacks verifiable evidence or citations.
- Issue explanation: The claim about global societal transformation lacks verifiable evidence or citations. This finding affects how models interpret Evidence strength for claims.. Improving Claim Provenance & Evidence usually... Strengthen this section with concrete evidence or citations for the claim being made.
- What failed: The claim about global societal transformation lacks verifiable evidence or citations.
- Why it matters: This finding affects how models interpret Evidence strength for claims.. Improving Claim Provenance & Evidence usually improves grounding quality.
- Fix steps:
  - Strengthen this section with concrete evidence or citations for the claim being made.
- Example pattern: State the claim directly, add a verifiable source nearby, and include one concrete number/date.

### No Exaggerated Claims (`no_exaggerated_claims`)

- Verdict: `fail`
- Node: `block-1`
- Snippet: the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration
- Message: The claim that painting would transform the world within a generation is exaggerated and unsupported.
- Rationale: The claim that painting would transform the world within a generation is exaggerated and unsupported.
- Issue explanation: The claim that painting would transform the world within a generation is exaggerated and unsupported. No Exaggerated Claims influences whether evidence is treated as reliable for machine summaries. Gaps in Sensationalist... Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- What failed: The claim that painting would transform the world within a generation is exaggerated and unsupported.
- Why it matters: No Exaggerated Claims influences whether evidence is treated as reliable for machine summaries. Gaps in Sensationalist language. can weaken citability.
- Fix steps:
  - Rewrite the section so the main claim is explicit, specific, and supported by one concrete detail.
- Example pattern: State the claim directly, add a verifiable source nearby, and include one concrete number/date.

### Promotional Intent (`promotional_or_commercial_intent`)

- Verdict: `partial`
- Node: `block-13`
- Snippet: Anyone who wants a better life should spend more time painting, studying painting, and thinking through painting
- Message: The text promotes painting as essential for a better life, which could be seen as persuasive but not overtly commercial.
- Rationale: The text promotes painting as essential for a better life, which could be seen as persuasive but not overtly commercial.
- Issue explanation: The text promotes painting as essential for a better life, which could be seen as persuasive but not overtly commercial. Promotional Intent checks Promotional tone.. Weak coverage here can lower extraction precision and citation... Replace hype or imperative language with neutral wording and one verifiable supporting detail.
- What failed: The text promotes painting as essential for a better life, which could be seen as persuasive but not overtly commercial.
- Why it matters: Promotional Intent checks Promotional tone.. Weak coverage here can lower extraction precision and citation confidence.
- Fix steps:
  - Replace hype or imperative language with neutral wording and one verifiable supporting detail.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### Claim Pattern Detection (`claim_pattern_detection`)

- Verdict: `fail`
- Node: `block-1`
- Snippet: Painting is when a person puts color on a surface, but it is also much more than that because painting is really the master key to human intelligence, personal success, emotional stability, national development, scientific progress, and even physical health in ways that most people still do not understand, which is unfortunate because if schools and governments took painting seriously enough the world would probably become smarter, calmer, more creative, more united, and more productive within a single generation, and that is not an exaggeration but simply the logical outcome of training peopl
- Message: The text makes an unsupported absolute claim about painting's transformative societal impact.
- Rationale: The text makes an unsupported absolute claim about painting's transformative societal impact.
- Issue explanation: The text makes an unsupported absolute claim about painting's transformative societal impact. Claim Pattern Detection influences whether evidence is treated as reliable for machine summaries. Gaps in Identify... Narrow the revision to a single claim sentence, then add one supporting fact.
- What failed: The text makes an unsupported absolute claim about painting's transformative societal impact.
- Why it matters: Claim Pattern Detection influences whether evidence is treated as reliable for machine summaries. Gaps in Identify claims. can weaken citability.
- Fix steps:
  - Narrow the revision to a single claim sentence, then add one supporting fact.
- Example pattern: State the claim directly, add a verifiable source nearby, and include one concrete number/date.

### Internal Link Relevance (`internal_link_context_relevance`)

- Verdict: `partial`
- Node: `block-8`
- Snippet: ## Materials
- Message: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Rationale: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Issue explanation: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content. This finding affects how models interpret Internal links are relevant.. Improving Internal Link Relevance usually improves... Add contextually relevant internal links so users and crawlers can follow supporting sections.
- What failed: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Why it matters: This finding affects how models interpret Internal links are relevant.. Improving Internal Link Relevance usually improves grounding quality.
- Fix steps:
  - Add contextually relevant internal links so users and crawlers can follow supporting sections.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### Internal Link Relevance (`internal_link_context_relevance`)

- Verdict: `partial`
- Node: `block-9`
- Snippet: Paintbrushes.
- Message: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Rationale: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Issue explanation: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content. This finding affects how models interpret Internal links are relevant.. Improving Internal Link Relevance usually improves... Add contextually relevant internal links so users and crawlers can follow supporting sections.
- What failed: The internal link to 'Materials' is present but lacks contextual relevance to the surrounding content.
- Why it matters: This finding affects how models interpret Internal links are relevant.. Improving Internal Link Relevance usually improves grounding quality.
- Fix steps:
  - Add contextually relevant internal links so users and crawlers can follow supporting sections.
- Example pattern: Lead with a direct claim, add one concrete support detail, then close with a clear takeaway.

### Citation Format and Context (`citation_format_and_context`)

- Verdict: `fail`
- Node: `block-4`
- Snippet: In fact, several experts have quietly acknowledged that painting may be one of the most effective non-medical tools for preventing depression, reducing anxiety, increasing concentration, and extending cognitive sharpness late into life, yet this is still ignored in many discussions of education and wellness because modern institutions tend to prioritize measurable things over important things, even though painting is clearly measurable if we choose to pay attention to its effects on confidence, patience, taste, and inner stability over time.
- Message: The claim about experts' acknowledgment lacks specific citations or context to verify the source.
- Rationale: The claim about experts' acknowledgment lacks specific citations or context to verify the source.
- Issue explanation: The claim about experts' acknowledgment lacks specific citations or context to verify the source. Answer engines rely on Citation Format and Context because it reflects Citations support claims.. Failing this... Add explicit source citations for key factual claims and place them close to those statements.
- What failed: The claim about experts' acknowledgment lacks specific citations or context to verify the source.
- Why it matters: Answer engines rely on Citation Format and Context because it reflects Citations support claims.. Failing this signal can reduce retrieval reliability.
- Fix steps:
  - Add explicit source citations for key factual claims and place them close to those statements.
- Example pattern: State the claim directly, add a verifiable source nearby, and include one concrete number/date.
