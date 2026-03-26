# HowTo + FAQ Schema Scope and Bridge Track

## Purpose

Keep a single evidence-backed record for the deterministic schema false-positive work that started with the mini-excavator HowTo issue and now extends into sibling FAQ / schema-scope landmines.

This track exists so we do not rely on memory while patching:

- what was already fixed
- what is only partially fixed
- what still needs milestone-based work

## Ground Truth

Confirmed from the current worktree:

- unordered bullet tips no longer count as HowTo steps by default
- the internal HowTo bridge source check is suppressed before release
- document-scope HowTo issues now carry a usable jump target
- FAQ document-scope issues now carry a usable jump target too
- FAQ bridge semantics now derive from explicit scope truth instead of score-neutral drift
- score-neutral deterministic schema alignment diagnostics no longer surface as visible sidebar / overlay issues
- verification-unavailable deterministic internal-link diagnostics no longer surface as visible content defects
- FAQ detection no longer treats any two compact Q/A sections as sufficient evidence by themselves
- the bridge contradiction was being reinforced by shared-detail mutation:
  - internal source checks reused the same `details` object as the raw evaluator result
  - `markScoreNeutral(..., 'schema_bridge_internal')` then flipped `scope_triggered` to `false`
  - the user-facing bridge inherited that drift unless the source details were cloned first

## Status Against the Earlier HowTo Fix Plan

### Already in place

**M1 Detector Repair**

- landed in:
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js`
- confirmed behaviors now in place:
  - ordered list != unordered tips list
  - unordered bullet tips alone do not trigger HowTo
  - non-HowTo titles need stronger procedural evidence than simple bullets
  - true HowTo signals still survive:
    - `How to ...`
    - `Step 1 / Step 2`
    - explicit ordered procedural flows

**M3 Anchoring Hardening**

- landed for HowTo in:
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js`
  - `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js`
- confirmed behavior now in place:
  - document-scope HowTo issues can keep `jump_node_ref`
  - users can inspect the triggering list block instead of seeing a blank jump target

### No remaining partials in this track

- the earlier partials around FAQ bridge semantics, FAQ jump targeting, and score-neutral exposure are now closed in the current worktree
- the remaining validation work for this thread is rollout-time observation, not unpatched known drift

## Remaining Open Issues

- none confirmed in the current worktree for this track
- keep live post-rollout observation on FAQ candidacy, but there is no active unpatched defect recorded here now

## Milestones

### Milestone 1: Bridge Semantics Alignment

Goal:

- make FAQ and residual HowTo bridge checks derive their user-facing state from explicit scope truth, not inherited score-neutral ambiguity

Scope:

- harden FAQ bridge builder
- harden HowTo bridge builder
- keep internal source checks suppressed
- ensure bridge copy can never say `not needed` while behaving like a triggered failure

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.test.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.test.js`

Acceptance:

- FAQ bridge is safe from the old contradiction class
- residual HowTo bridge semantics are explicit and stable

Status:

- complete in the current worktree
- landed behaviors:
  - FAQ and HowTo evaluators now persist explicit `scope_triggered` truth on triggered and non-triggered states
  - FAQ and HowTo bridge builders now derive copy from `scope_triggered`, not inherited score-neutral ambiguity
  - internal bridge source checks now receive cloned `details`, so score-neutral mutation no longer rewrites the raw evaluator result
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`

### Milestone 2: FAQ Context Anchoring

Goal:

- give FAQ document-scope schema issues the same practical jump-target quality we now have for HowTo

Scope:

- thread FAQ `heading_node_ref` / context refs into serializer document-scope fallback
- keep document-scope honesty while avoiding blank jump targets

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js`
- matching serializer tests

Acceptance:

- FAQ schema issues remain document-scope
- FAQ issues still provide a useful `jump_node_ref`

Status:

- complete in the current worktree
- landed behaviors:
  - serializer document-scope fallback now inspects FAQ `detected_pairs`
  - stored `heading_node_ref` from FAQ candidacy can now become `jump_node_ref`
  - fallback can still recover from question / answer text when direct FAQ refs are missing
- validated with:
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`

### Milestone 3: Score-Neutral Exposure Policy

Goal:

- stop neutral deterministic schema / verification states from looking like content failures

Scope:

- define which score-neutral deterministic checks should:
  - be suppressed
  - be reframed
  - or surface only as neutral advisory state
- include schema-scope and verification-unavailable paths

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js`
- focused serializer regressions

Acceptance:

- neutral scope / unavailable-verification outcomes no longer erode trust

Status:

- complete in the current worktree
- landed behaviors:
  - `schema_matches_content` is now suppressed from sidebar and overlay release when it is deterministic, score-neutral, and only reporting neutral scope states such as:
    - `content_type_unavailable`
    - `schema_types_absent`
    - `schema_companion_only`
  - `no_broken_internal_links` is now suppressed from sidebar and overlay release when it is only reporting deterministic verification unavailability via `link_status_unavailable`
  - the suppression remains narrow and does not hide real deterministic schema mismatches or actual broken-link findings
- validated with:
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`

### Milestone 4: FAQ Replay Audit and Regression Lock

Goal:

- prove the sibling FAQ / schema paths hold up under live-shaped examples

Scope:

- add targeted regressions for:
  - live-shaped FAQ candidacy replay
  - non-FAQ Q/A-style false-positive guards
  - FAQ bridge + jump-target coverage as replay fixtures

Acceptance:

- replay-style tests lock the behavior before rollout

Status:

- complete in the current worktree
- replay audit finding:
  - the previous FAQ trigger condition was effectively too loose because once `compact_pairs >= 2`, the old `count >= 2` clause added no extra protection
  - that allowed two compact Q/A sections in a normal explainer to trigger FAQ schema need even without FAQ labeling
- landed behaviors:
  - two compact Q/A sections now need explicit FAQ intent signals such as:
    - FAQ title wording
    - FAQ/common-questions section heading
    - `content_type = faq`
  - unlabeled pages can still trigger FAQ need when they show three or more compact Q/A sections, preserving strong FAQ-like pages that omit explicit labeling
  - replay regressions now cover:
    - two-question non-FAQ explainer stays neutral
    - two-question FAQ section still triggers
    - three-question unlabeled FAQ-style page still triggers
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`
