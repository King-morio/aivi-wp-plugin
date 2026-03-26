# Answer Family and Heading Fragmentation Track

## Why this track exists

We confirmed two separate but related trust issues in live runs:

1. **Answer-family guardrails can downgrade valid AI findings to `partial`**
   - Recent example: `How Fast Can a Mini Excavator Dig?`
   - The model produced strong positive explanations for:
     - `answer_sentence_concise`
     - `question_answer_alignment`
     - `clear_answer_formatting`
   - But the strict question-anchor guardrail still rewrote all three to `partial`
   - Current result: good answer-family passes are effectively being featured as failures

2. **`heading_fragmentation` still behaves like a thin-support rule**
   - Recent example: `What Is AEO and GEO? A Complete Guide to Optimizing Content for AI-Driven Search`
   - The deterministic message and explanation still say:
     - `This heading sits in a fragmented section with thin support.`
     - `Section headings are fragmented by very thin supporting blocks.`
   - That means the rule is still enforcing section thinness, which belongs elsewhere and not in fragmentation semantics

## Confirmed evidence

### Answer-family guardrail drift
- Worker telemetry for run `032e6f07-be5f-4203-9e04-bacd0a87648e` showed:
  - `question_anchor_count = 5`
  - `question_anchor_guardrail_adjustments_total = 3`
  - reason = `invalid_or_missing_question_anchor`
- The answer-family highlights still anchored correctly to `block-3`
- Stored `guardrail_source_explanation` values were positive:
  - concise → `The answer is concise and self-contained within the ideal word range.`
  - alignment → `The answer directly resolves the question about digging speed.`
  - formatting → `The answer is clearly formatted as a single, concise sentence.`
- So the problem is not snippet length or visible anchoring; it is the guardrail’s local question binding logic

### Heading fragmentation drift
- The rule still emits thin-support language from:
  - `shared/schemas/deterministic-instance-messages-v1.json`
  - `shared/schemas/deterministic-explanations-v1.json`
- The live deterministic logic still fails based on:
  - average rolled-up support words per H2 section
- That is still a thin-support heuristic, even if hierarchy-aware roll-up is now working better than before

## Milestones

### M1 — Answer-family local anchor repair
- Make strict question-anchor validation section-local instead of relying on broad global anchor sets
- Preserve a valid answer-family verdict when the answer snippet clearly belongs to the local question window
- Lock with a regression using the mini-excavator shape

**Status:** Complete

- The worker now expands each strict question anchor into a local section window, not just the anchor text block
- That allows the guardrail to validate answer snippets against the real nearby answer span instead of falsely treating later headings as conflicting anchors
- Regression added for the mini-excavator pattern where repeated local question phrasing previously caused all three answer-family checks to degrade to `partial`

### M2 — Answer-family explanation surfacing hardening
- Ensure a real pass is never surfaced as a featured issue. (added comment: model should not provide explanation if check is pass. Only time explanation is allowed is if fail/partial. Check if there's any laxity in prompt file or check definitions that may give model space to explain why check passed. Which it shouldn't)
- Preserve model-side explanation context for diagnostics when guardrails still adjust
- Keep user-facing copy coherent and avoid losing legitimate AI reasoning unnecessarily

**Status:** Complete

- Tightened the worker prompt so answer-family pass findings must leave `explanation` empty
- Tightened the answer-family check definitions so pass verdicts are not justified in-model
- Relaxed the worker findings schema/validator so blank explanations are allowed for `pass` but still required for `partial` and `fail`
- Hardened conversion so pass findings do not preserve pass explanations even if the model still sends one
- Guardrail-adjusted findings now keep source verdict/confidence for diagnostics without surfacing pass rationale text

### M3 — Heading fragmentation semantic reset
- Remove thin-support semantics from `heading_fragmentation`
- Redefine fragmentation around over-segmentation / top-level outline splitting, not section thinness
- Move any remaining thin-support responsibility to the appropriate neighboring checks

**Status:** Complete

- Reframed `heading_fragmentation` around top-level H2 handoff behavior instead of rolled-up word counts
- A section now only contributes to fragmentation when the H2 branches into another heading before any framing content appears
- Updated deterministic instance messages and explanation catalogs so the user-facing language no longer talks about thin support
- Added regressions proving:
  - immediate H2 -> H3 handoffs fail as over-split outline behavior
  - nested H3 sections pass when the parent H2 is framed first
  - brief but framed H2 sections no longer fail just for being short

### M4 — Replay validation and rollout readiness
- Re-test the mini-excavator answer-family case
- Re-test a heading-fragmentation specimen
- Confirm release output, overlay behavior, and details payloads stay aligned
