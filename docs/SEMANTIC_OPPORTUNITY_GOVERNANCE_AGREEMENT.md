# Semantic Opportunity Governance Agreement

Last updated: 2026-03-23

## Purpose

This agreement defines how AiVI should govern opportunity-style semantic checks so the
semantic layer stays grounded, does not overreach, and does not duplicate or fight
deterministic structure checks.

This agreement is approved before patching.

## Core Rule

AiVI must use contrastive governance for opportunity-style semantic checks.

That means each such check must define:

- what it is judging
- valid content shapes that should pass
- the real trigger condition for fail or partial
- common false positives that must not trigger
- overlap boundaries with sibling checks
- one-finding-per-section anchoring discipline unless there are truly separate instances

## Where Each Part Lives

Do not put the full teaching payload into one place.

Use this split:

1. `docs/SEMANTIC_OPPORTUNITY_GOVERNANCE_AGREEMENT.md`
- canonical agreement and approved behavior
- human-readable source of truth

2. `shared/schemas/checks-definitions-v1.json`
- concise per-check evaluation wording only
- enough to state the boundary cleanly
- do not turn definitions into a long tutorial or giant example catalog

3. `worker/prompts/analysis-system-v1.txt`
- compact operational rules for the semantic analyzer
- contrastive examples for checks that commonly drift
- pass-shape examples, not only fail examples

4. `worker/index.js`
- post-model runtime governance
- veto rules
- mutual-exclusion rules
- duplicate-instance collapse rules
- no-release rules when structural truth contradicts the semantic finding

5. regression tests
- golden examples that lock expected behavior
- every approved false-positive guard should be test-backed

## Clean Prompting Rule

Do not overload the analyzer with long prose for every check.

Instead:

- keep shared global rules in the prompt once
- add targeted compact rules only for checks with known drift
- add short contrastive examples for those checks
- keep hard boundaries in runtime validators rather than trusting the model alone

## Opportunity-Style Semantic Checks In Scope

The first governance scope covers:

- `lists_tables_presence`
- `faq_structure_opportunity`
- `clear_answer_formatting`
- `howto_semantic_validity`
- `readability_adaptivity`

This pattern may later be extended to other semantic checks when needed.

## Governance Template

Each opportunity-style semantic check should be defined using this structure:

### 1. What This Check Judges

One narrow question only.

### 2. Valid Shapes That Should Pass

Multiple acceptable formatting patterns for the same informational goal.

### 3. What Actually Triggers Opportunity

The true fail or partial threshold.

### 4. What Must Not Trigger

Known false positives and acceptable variants.

### 5. Mutual Exclusions

Cases where this check must yield to another check instead of double-flagging the same section.

### 6. Anchoring Rule

One finding per section unless there are truly separate instances.

## Approved Check-Level Agreements

### `lists_tables_presence`

What it judges:
- whether multiple sibling ideas are buried in prose when they would be materially easier to scan as a list or table

Valid pass shapes:
- real visible bullet or numbered lists
- bullet-glyph blocks already separated one item per line or block
- short labeled lines under a heading
- concise comparison tables
- a short intro sentence followed by a visible list

Actual trigger:
- 3 or more sibling ideas are packed into dense prose
- the section is clearly listable, comparative, enumerative, or grouped by parallel items
- visible separation is weak or missing

Must not trigger:
- when the real list already exists below a short lead-in sentence
- when the prose is short and already scannable
- when the section is truly procedural and belongs to HowTo judgment
- when the section is truly FAQ-shaped and belongs to FAQ judgment

Mutual exclusions:
- do not fail this check on a section that already has recognized visible list structure
- do not co-flag the same section with `faq_structure_opportunity` unless there is an independently valid list-formatting problem

Anchoring rule:
- one finding per failing section, not one finding per list item or adjacent block

### `faq_structure_opportunity`

What it judges:
- whether visible repeated user questions are answered in a way that should become reusable FAQ pairs

Valid pass shapes:
- not FAQ-shaped at all
- only one explicit question heading with one answer
- a question heading followed by examples, tips, or subtopics rather than repeated Q&A
- already separated reusable question-answer pairs

Actual trigger:
- 2 or more explicit user-style questions are answered in the same visible section or block
- answers are densely inline or not reusable as separated pairs

Must not trigger:
- when there is only one question heading
- when a question heading introduces a list or explainer rather than repeated Q&A
- when topical headings are mistaken for FAQ candidacy

Mutual exclusions:
- do not co-flag the same section with `lists_tables_presence` unless both thresholds are independently satisfied
- do not let deterministic FAQ bridge diagnostics overstate candidacy from a single question heading plus prose

Anchoring rule:
- one finding per failing FAQ-candidate section

### `clear_answer_formatting`

What it judges:
- whether the answer is easy to extract in the form it already uses

Valid pass shapes:
- one direct sentence
- two short direct sentences
- compact bullets
- short labeled lines

Actual trigger:
- the answer is buried
- the main point does not stand alone
- formatting materially hides extraction

Must not trigger:
- when the answer is already direct and self-contained even if it is not bulletized
- when the content is merely not styled in the model's preferred format

Mutual exclusions:
- do not use this check as a back door for list, FAQ, or HowTo conversion unless extraction clarity is the real issue

Anchoring rule:
- one finding per answer block or section

### `howto_semantic_validity`

What it judges:
- whether the content is genuinely step-by-step procedural content

Valid pass shapes:
- true sequential steps
- action-led procedural guidance
- visible task flow with ordered dependency

Actual trigger:
- the content claims or appears to be a how-to but does not behave like a real procedure

Must not trigger:
- on explainers
- on tips lists
- on option lists
- on idea collections that are not truly sequential

Mutual exclusions:
- do not compete with `lists_tables_presence` when the content is just a list of ideas rather than steps

Anchoring rule:
- one finding per failing procedure section

### `readability_adaptivity`

What it judges:
- whether a section reads clearly enough for its purpose and content type

Valid pass shapes:
- concise expert prose
- slightly dense prose that is still controlled and easy to follow
- compact technical explanation with clear sentence flow

Actual trigger:
- clause stacking, jargon load, sentence density, or transitions make the section materially harder to parse than needed

Must not trigger:
- just because a different format might also work
- just because the model would prefer bullets

Mutual exclusions:
- do not use this check to force structural conversions that belong to `lists_tables_presence`, `faq_structure_opportunity`, or `howto_semantic_validity`

Anchoring rule:
- one finding per materially hard-to-read section

## Runtime Governance Requirement

Prompting alone is not enough.

AiVI must add runtime governance for opportunity-style semantic checks:

- veto impossible findings when deterministic structure truth contradicts them
- enforce mutual-exclusion rules between sibling checks
- collapse duplicate section-level findings that were spread across adjacent blocks
- suppress releases that are only anchoring artifacts rather than distinct issues

## Regression Requirement

Every approved false-positive guard must be covered by regression tests.

Required test style:

- one fail example
- one partial example
- at least two pass examples of different valid shapes

## Current Priority Diagnosis This Agreement Addresses

This agreement is specifically intended to prevent:

- `lists_tables_presence` failing sections that already contain visible list structure
- `faq_structure_opportunity` firing on a single question heading plus prose
- one semantic section finding being released as multiple duplicated block highlights
- opportunity checks competing for the same section without clear boundaries
