# Scoring Engine Remediation Track

## Goal
Make AiVI scoring conservative, reproducible, and contract-stable so incomplete or low-trust analysis output cannot inflate AEO, GEO, or global scores.

## Current diagnosis
- The orchestrator scoring path normalizes against only the checks present in `result.checks`, which can award full-category scores to a tiny surviving subset.
- The worker and orchestrator do not enforce the same denominator or fallback policy.
- Score release is contract-tolerant all the way to the sidebar, which hides upstream drift instead of surfacing it.
- Existing tests do not gate known-bad articles with a score ceiling.

## Primary patch plan

### Milestone 1: Baseline and Artifact Recovery
- Recover or reproduce at least one suspicious high-score article run end to end.
- Capture the exact replay inputs we will score against:
  - raw preflight `manifest.json`
  - analyzer-facing `content_html`
  - stored `result.checks`
  - released sidebar `scores`
- Add a repeatable replay harness so the same artifact can be rescored locally after each patch.

Current state:
- [x] A replayable local manifest fixture now exists at [how-to-improve-website-performance-fast.manifest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/how-to-improve-website-performance-fast.manifest.json).
- [x] A replay command now exists at [replay_scoring_baseline.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tools/replay_scoring_baseline.js).
- [x] The current baseline has been captured from the fixture:
  - `AEO: 0 / 55`
  - `GEO: 30.51 / 45`
  - `GLOBAL: 30.51 / 100`
- [ ] We still need one recovered live suspicious run with stored `result.checks` and released sidebar `scores`.

Acceptance:
- One replayable bad-article fixture is available in-repo.
- One command or test reproduces the pre-patch inflated score.

### Milestone 2: Core Score Math Correction
- Change the denominator policy so applicable-but-missing checks cannot silently disappear from scoring.
- Define one missing-check rule and apply it everywhere:
  - deterministic checks remain deterministic
  - AI-owned missing checks become explicit synthetic checks with penalty semantics
  - incomplete AI coverage must reduce score, not shrink the denominator
- Keep intro weighting, verdict multipliers, and confidence buckets only after denominator policy is corrected.

Current state:
- [x] The canonical orchestrator scoring engine now normalizes against the full applicable check set instead of only the returned subset.
- [x] The local manifest replay dropped from `30.51/100` to `13.1/100` after denominator hardening.
- [x] Regression coverage now exists for:
  - single surviving GEO pass inflation
  - the local bad-article manifest ceiling
- [x] Worker score normalization now matches orchestrator normalization for the same `checks` payload.
- [x] Worker scoring no longer depends on prior asset bootstrap just to load scoring config.
- [x] Orchestrator analysis storage now injects explicit synthetic AI coverage-gap checks into `result.checks` and records `partial_context.missing_ai_checks` plus `missing_ai_check_ids`.
- [x] Handler regression coverage now proves missing AI-owned checks are preserved in the stored result contract instead of disappearing silently.
- [ ] Release and UI layers still need a stricter contract decision on how directly to surface missing AI coverage gaps outside the stored result.

Acceptance:
- A single passing GEO check can no longer produce `45/45`.
- A partial or low-confidence single check can no longer normalize to an optimistic category score.
- Known-bad replay fixtures score within the target ceiling.
- Stored analysis results explicitly record missing AI coverage rather than inferring it only through reduced scores.

### Milestone 3: Engine Unification and Contract Lock
- Move worker and orchestrator onto one canonical scoring implementation or one shared scoring policy module.
- Standardize one canonical stored score shape and one canonical sidebar score shape.
- Stop relying on frontend score coercion to mask shape mismatches.
- Keep score normalization in one backend release point, not multiple loosely compatible points.

Current state:
- [x] Run-status now derives a sanitized `partial` summary from stored `partial_context` even on nominal `success` runs, so missing AI coverage survives the release boundary.
- [x] Sidebar payload stripping already preserves `expected_ai_checks`, `returned_ai_checks`, and `missing_ai_checks` at the top level.
- [x] Missing AI coverage now survives in the stored and released contract, but it is not surfaced as a primary sidebar notice by default.
- [x] New orchestrator results now persist a flat score contract: `scores = { AEO, GEO, GLOBAL }`.
- [x] Run-status is now the single backend compatibility shim for legacy nested score shapes.
- [x] The sidebar now reads only the flat score contract instead of coercing multiple backend shapes.
- [x] Worker and orchestrator now share the same scoring policy module for denominator logic, intro weighting, and flat score-contract emission.

Acceptance:
- Worker and orchestrator produce the same AEO, GEO, and GLOBAL for the same `checks`.
- Stored result, run-status payload, and sidebar consumer use one documented score contract.

### Milestone 4: Regression Gates and Rollout
- Add explicit score-ceiling tests for known-bad content.
- Add parity tests for worker vs orchestrator scoring.
- Add missing-check regression tests.
- Add contract tests for storage, run-status release, and sidebar consumption.

Current state:
- [x] Known-bad local fixture ceiling is enforced in orchestrator scoring tests.
- [x] Worker vs orchestrator parity is enforced against the replayable local fixture.
- [x] Missing AI coverage injection is regression-tested in the stored result contract.
- [x] Stored-result score contract is regression-tested in the handler path.
- [x] Run-status release is regression-tested for both flat canonical scores and legacy nested-score migration.
- [x] Sidebar consumption is regression-tested to use only the flat score contract and to avoid reintroducing noisy coverage banners.
- [x] The local replay harness still lands at `13.1/100`, so the Milestone 2 hardening survived Milestone 3 and 4 refactors.
- [x] A fixture-backed unsupported-claim guardrail now prevents optimistic answer-clarity checks from lifting the coffee replay above `58.16/100`.

Acceptance:
- Score inflation regressions fail CI.
- Known-bad fixtures remain below their documented ceiling.
- Good fixtures do not collapse unexpectedly after denominator hardening.

Verification:
- `cmd /c npm test -- --runInBand analyze-run-handler.test.js analysis-serializer.test.js scoring-engine.test.js run-status-handler.test.js`
- `cmd /c npm test -- --runInBand worker-scoring.test.js`
- `cmd /c npm test -- --runInBand tests/js/sidebar-score-ui-regression.test.js tests/diagnostics/sidebar-data-flow.test.js`
- `node wp-content/plugins/AiVI-WP-Plugin/tools/replay_scoring_baseline.js`

## Reference benchmark: coffee article

### Status
- Requested article: `Why Drinking 10 Cups of Coffee a Day Is Healthy`
- Observed score from user report: `75-76/100`
- Fixture-backed local replay now exists:
  - manifest: [coffee-10-cups-health.manifest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/coffee-10-cups-health.manifest.json)
  - optimistic semantic overlay: [coffee-10-cups-health.semantic-checks.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/coffee-10-cups-health.semantic-checks.json)
- Live artifact recovery state: still unrecovered from production storage/logs
- Benchmark type: fixture-backed local replay that models the observed failure mode of "clear structure plus unsupported claims"

### Fixture-backed replay
- Replay command:
  - `node wp-content/plugins/AiVI-WP-Plugin/tools/replay_scoring_baseline.js --manifest=wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/coffee-10-cups-health.manifest.json --semantic-overlay=wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/coffee-10-cups-health.semantic-checks.json`
- Current replay result after the unsupported-claim guardrail:
  - `AEO: 28 / 55`
  - `GEO: 30.16 / 45`
  - `GLOBAL: 58.16 / 100`
- Guardrail applied:
  - `unsupported_claims: severe`

### Accepted target
- Accepted replay target: `52-60/100`
- Hard ceiling during remediation: `60/100`
- Expected category range:
  - `AEO: 24-28 / 55`
  - `GEO: 27-32 / 45`

### Why this article should score low
- The title itself signals a likely unsupported health claim, so `no_exaggerated_claims` should not pass.
- A claim that `10 cups` is healthy should heavily pressure:
  - `claim_provenance_and_evidence`
  - `external_authoritative_sources`
  - `numeric_claim_consistency`
  - `contradictions_and_coherence`
  - `factual_statements_well_formed`
- If the article lacks strong sourcing, author identity, bio, or metadata, GEO should fall further.
- AEO may still earn meaningful credit if the article clearly answers the implied question and is formatted well, which is why the accepted ceiling is no longer near zero.

### Interpretation rule
- If the recovered live coffee artifact still lands above `60/100`, treat that as a scoring bug until proven otherwise.
- Once the real live artifact is recovered, compare it against this fixture-backed benchmark and replace the overlay if needed.

## Reference benchmark: local manifest article

### Artifact
- Title: `How to Improve Website Performance Fast`
- Analyzer-facing manifest fixture: [how-to-improve-website-performance-fast.manifest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/how-to-improve-website-performance-fast.manifest.json)
- Source artifact copy: [manifests_26bd4c46-fc64-4110-aa7a-651b3348d232_manifest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tools/artifacts_html/manifests_26bd4c46-fc64-4110-aa7a-651b3348d232_manifest.json)
- This artifact already contains the raw `content_html`, `plain_text`, metadata, and block map that the analyzer consumes.

### Observed baseline
- Pre-hardening deterministic-only replay landed at roughly `30.5/100`.
- Current post-hardening replay lands at `13.1/100`.
- Replay command:
  - `node wp-content/plugins/AiVI-WP-Plugin/tools/replay_scoring_baseline.js`
- That baseline is still too generous for the visible content quality because the article has:
  - no H1
  - no meta description
  - no links
  - no JSON-LD
  - no author bio
  - fragmented sections
  - an oversized paragraph
  - a failed intro quality composite
  - obvious exaggerated claims in the closing section

### Accepted remediation target
- Accepted replay target after scoring hardening: `15-30/100`
- Hard ceiling after remediation: `35/100`
- Expected category tendency:
  - `AEO` should stay low because the intro is long, generic, and weakly factual
  - `GEO` should not stay high once semantic trust, evidence, citation, and exaggeration checks are fully counted

### Why this artifact matters
- This is the best immediate fixture because it is already local and replayable.
- It gives us a real manifest-based benchmark while the coffee article remains unrecovered.
- If this article remains above `35/100` after denominator and missing-check fixes, the engine is still too generous.

## Secondary reference
- The existing known-bad internal gold sample already implies a much lower score regime than `76/100`.
- A forced replay of the current bad-article failure set scores around `16/100`, which is directionally consistent with the coffee article needing a much lower ceiling than the observed `76`.

## Implementation order
1. Recover a suspicious article artifact or generate a durable replacement fixture.
2. Patch denominator and missing-check handling in the canonical engine.
3. Unify worker and orchestrator scoring behavior.
4. Lock the storage, run-status, and sidebar contracts for coverage-gap visibility.
5. Add CI score-ceiling and parity tests.

## Notes
- The preferred replay input is the post-preflight manifest because it reflects the actual `content_html`, metadata, and block map the analyzer sees.
- If the coffee article artifact is recovered later, store both the manifest and final result beside this track so rescoring stays deterministic.
