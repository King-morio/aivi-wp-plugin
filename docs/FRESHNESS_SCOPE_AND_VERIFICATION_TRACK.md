# Freshness Scope and Verification Track

## Purpose

Keep a small evidence-backed record for the deterministic freshness / verification review so we do not patch from memory.

## Confirmed Issue

- freshness gating is currently too broad for evergreen explainers
- standalone topical words such as:
  - `pricing`
  - `statistics`
  - `trend`
  can trigger freshness-sensitive handling even when the page does not make a recency-dependent promise
- confirmed specimens:
  - `How SaaS Pricing Works`
  - `What Is Statistical Significance?`
- both currently route to:
  - `content_updated_12_months = partial`
  - `No visible update date was found for freshness-sensitive content.`

## Phases

### Phase 1: Freshness Gating Tightening

Goal:

- require a real recency signal before freshness becomes material for evergreen articles

Scope:

- keep automatic freshness scope for:
  - `news`
  - `newsarticle`
- keep explicit recency cues such as:
  - `latest`
  - `today`
  - `recently`
  - `as of`
  - `updated`
  - `forecast`
  - `market update`
  - `breaking`
- stop standalone evergreen topical vocabulary from triggering freshness by itself

Primary files:

- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js`
- `wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js`
- matching preflight regressions

Acceptance:

- evergreen pricing / statistics explainers stay neutral
- explicitly recency-led content still triggers freshness

Status:

- complete in the current worktree
- landed behaviors:
  - freshness now auto-triggers from explicit recency language, not from evergreen topical words alone
  - evergreen explainers that mention pricing or statistics without recency language now stay neutral
  - explicitly recency-led content like `Latest Pricing Trends` still triggers freshness scope
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`

### Phase 2: Replay Validation and Rollout Readiness

Goal:

- confirm the tightened freshness scope behaves correctly on live-shaped examples before rollout

Scope:

- replay-style regression confirmation
- confirm no new drift against internal-link verification handling
- decide rollout readiness for the bundled backend fixes

Acceptance:

- freshness no longer reads like a false positive on evergreen explainers
- verification-only internal-link states remain non-disruptive

Status:

- complete in the current worktree
- landed behaviors:
  - freshness gating remains narrowed to real recency cues on evergreen replay-shaped specimens
  - verification-only internal-link states with `link_status_unavailable` remain suppressed from sidebar and overlay release output
  - real broken internal-link failures still surface in release output:
    - sidebar categories keep the issue visible
    - overlay output keeps the issue visible through released findings / jumpable issue data
- validated with:
  - `infrastructure/lambda/orchestrator/preflight-handler.test.js`
  - `infrastructure/lambda/worker/preflight-handler.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
