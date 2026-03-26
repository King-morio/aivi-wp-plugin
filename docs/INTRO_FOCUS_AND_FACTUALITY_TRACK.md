# Intro Focus and Factuality Track

## Purpose

Keep a tight, evidence-backed record for the intro-family repair so we patch the real drift points instead of reacting from memory.

## Confirmed Issues

- intro extraction is currently too broad
- it is derived from:
  - first `3` paragraph blocks
  - else first `3` HTML `<p>` tags
  - else first `200` plain-text words
- that allows the intro slice to drift past the real opening and into the first body section
- confirmed consequence:
  - `intro_factual_entities` can flag content that actually lives under the first real `H2`
- the current intro word-count bands are too narrow for real editorial openings
- `intro_schema_suggestion` is advisory but still participates in the scored composite
- factual support is currently too coarse because any link anywhere in the intro is treated as support for every factual span

## Phases

### Phase 1: Structural Intro Boundary

Goal:

- redefine the intro as the visible content between the title / `H1` and the first in-body `H2` or `H3`

Scope:

- stop using `first 3 paragraphs` as the primary intro boundary
- use the first in-body `H2` or `H3` as the structural stop point
- if the article starts with `H2` / `H3` immediately, treat that as a missing / too-thin intro instead of silently falling back deeper into body content
- keep the implementation deterministic and highlight-safe

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js`
- matching intro preflight tests

Acceptance:

- intro checks no longer read text from beneath the first real `H2` / `H3`
- immediate `H2` / `H3` after title still produces intro-family output instead of skipping the family entirely

Status:

- complete in the current worktree
- landed behaviors:
  - intro extraction now stops at the first in-body heading boundary instead of scanning an arbitrary first `3` paragraphs
  - the structural stop point uses the first heading level `>= H2`, which safely covers the `H2` / `H3` cases we care about without drifting into deeper sections
  - articles that jump straight from title into `H2` now still emit intro-family checks and are treated as missing / too-thin intros instead of silently falling back into later body text
  - intro factuality no longer sees spans that only exist beneath the first real section heading
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`

### Phase 2: Intro Threshold Recalibration

Goal:

- align intro-length scoring with real editorial practice

Scope:

- move from the narrow `40-60 optimal / 61-120 acceptable` model
- adopt:
  - `40-150` = pass
  - `151-200` = partial
  - `200+` = fail
- keep a meaningful penalty for extremely short intros

Acceptance:

- healthy article openings no longer get dragged down just for exceeding `60` words

Status:

- complete in the current worktree
- landed behaviors:
  - intro wordcount now passes across `40-150` words
  - intros at `20-39` words and `151-200` words now degrade to partial instead of being over-penalized
  - intros above `200` words now fail cleanly as genuinely overlong openings
  - serializer and deterministic guidance copy now reflect the new thresholds so user-facing advice stays aligned with runtime behavior
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`

### Phase 3: Factual Support Locality and Composite Cleanup

Goal:

- make intro factual grounding and composite scoring behave like trustworthy editorial signals

Scope:

- stop treating any single intro link as support for every factual span
- tighten support to local / proximate evidence
- remove `intro_schema_suggestion` from the scored composite or otherwise neutralize its score impact

Acceptance:

- factual-entity failures are tied to the actual intro slice
- advisory schema language no longer suppresses an otherwise strong intro family score

Status:

- complete in the current worktree
- landed behaviors:
  - intro factual support now uses local paragraph-level link context instead of treating one link anywhere in the intro as support for every factual span
  - intro factual details now expose both supported and unsupported factual counts under a `paragraph_link_locality` strategy
  - `intro_schema_suggestion` remains available as an advisory signal, but it no longer changes the scored intro composite verdict
  - the composite still records schema suggestion in `advisory_components` so the signal stays visible without dragging the score
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`

### Phase 4: Replay Validation and Rollout Readiness

Goal:

- replay real article shapes and confirm the intro family no longer drifts across section boundaries

Scope:

- regression coverage for:
  - intro ends before first `H2`
  - intro ends before first `H3`
  - immediate `H2` after title yields missing-intro behavior
  - intro factual entities do not anchor beneath the first real section heading

Acceptance:

- intro-family findings stay inside the actual opening
- rollout can be bundled confidently with the other backend fixes

Status:

- complete in the current worktree
- landed behaviors:
  - replay-style intro coverage now confirms the intro ends before the first real `H2`
  - matching coverage now confirms the intro also ends before the first real `H3`
  - immediate `H2` after title remains treated as missing / too-thin intro behavior
  - intro factual entities no longer drift beneath the first real section heading in the replay regressions
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`
