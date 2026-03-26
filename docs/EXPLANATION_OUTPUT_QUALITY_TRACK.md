# Explanation Output Quality Track

## Goal
Make user-facing issue explanations concise, non-repetitive, and check-aware so they consistently explain:
- what failed
- why it matters
- what to change next

Target outcome:
- final `issue_explanation` usually lands in the 40-60 word band
- no internal/debug phrasing
- no vague `Revise the quoted passage` style instructions
- no repeated sentence fragments across `what_failed`, `why_it_matters`, and fix guidance

## Diagnosis

### 1. The problem is mostly serializer-side, not prompt-side
- The worker serializer currently composes final prose by concatenating:
  - `what_failed`
  - `why_it_matters`
  - up to 3 fix steps
  - `example_pattern`
- That happens in [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js) and allows very long, repetitive explanations.

### 2. Inline recommendation paths are reusing explanation text as fix text
- Some inline paths pass `check.explanation` back into `buildIssueExplanationPack()` as `actionSuggestion`.
- That creates direct repetition when the same sentence becomes both:
  - the failure summary
  - the fix step scaffold

### 3. Generic scaffolding is overpowering issue-specific guidance
- Fallback text like:
  - `Revise the quoted passage first`
  - `Start from the quoted passage`
  - `Re-run analysis and confirm...`
- adds length and sameness without much editorial value, especially because the UI already provides `Jump to block`.

### 4. There is no real 40-60 word enforcement today
- Current char budgets allow much longer prose.
- Final narratives can easily exceed 80-100 words.

## Milestone 1: Compress and de-duplicate final narratives

Files:
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)

Change group:
- Replace paragraph-style concatenation with a two-sentence final narrative:
  - sentence 1: issue + why it matters
  - sentence 2: fix
- Add word-aware compression and repetition filtering.
- Stop appending `example_pattern` into final `issue_explanation`.

Acceptance:
- Final `issue_explanation` stays concise and avoids repeated sentence fragments.
- Final `issue_explanation` no longer grows by dumping every structured field into one paragraph.

Status:
- Completed locally on 2026-03-12.
- Final `issue_explanation` is now assembled as a compressed two-sentence narrative with a 60-word ceiling.
- `example_pattern` remains in the structured pack but is no longer dumped into the final narrative.
- Repeated fragments across `what_failed`, `why_it_matters`, and fix guidance are now filtered.

## Milestone 2: Replace vague/generic fix scaffolding with check-aware fix hints

Files:
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)

Change group:
- Stop using `check.explanation` as `actionSuggestion` in inline paths.
- Add check-aware fix hints for the highest-impact repetitive families:
  - direct-answer gated checks
  - FAQ/Q&A structure checks
  - paragraph length
  - list formatting
  - source/evidence/citation checks
- Remove low-value scaffold phrases like:
  - `Revise the quoted passage`
  - `Start from the quoted passage`
  - `Re-run analysis and confirm...`

Acceptance:
- Fix language tells the user what to change, not where they already know to look.
- Similar checks still feel related, but not copy-pasted.

Status:
- Completed locally on 2026-03-12.
- Low-value scaffold phrases like `Revise the quoted passage` and `Re-run analysis` are removed from normal final narratives.
- Inline paths no longer recycle `check.explanation` as fix guidance.
- Check-aware fix hints now cover the main repetitive families:
  - direct-answer gated checks
  - FAQ/Q&A checks
  - paragraph length
  - evidence/citation checks
  - HowTo and semantic-structure checks

## Milestone 3: Regression lock and rollout

Files:
- [analysis-serializer.worker.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.worker.test.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)
- this track doc

Change group:
- Add regression coverage for:
  - 40-60 word target ceiling behavior
  - anti-repetition
  - no `quoted passage` scaffolding
  - check-aware fix language
- Deploy only after focused suites are green.

Acceptance:
- Focused tests pass locally.
- One clean deploy is sufficient for live verification.

Status:
- Focused serializer suites passed locally on 2026-03-12:
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- Deploy is still pending by design.

## Start point
- Start with Milestones 1 and 2 together.
- Keep deploy as the last step.
