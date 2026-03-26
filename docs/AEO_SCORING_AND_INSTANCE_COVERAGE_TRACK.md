# AEO Scoring And Instance Coverage Track

## Goal
Remove inflated AEO credit from no-question scenarios, correct inverted "opportunity" semantics, retire legacy `not_applicable` handling, and verify whether repeated issues receive distinct highlighting and recommendation treatment.

## Current diagnosis

### 1. Question-anchor checks are over-generous
- In the worker prompt, question-anchored checks are currently instructed to return `pass` when `anchor_count` is `0` in [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt).
- The runtime guardrail reinforces that by rewriting `fail`/`partial` to `pass` when no strict anchor exists in [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js).
- This is the main reason low-trust articles still retain large AEO scores.

### 2. `faq_structure_opportunity` is semantically inverted
- Current live behavior can award `pass` when no explicit Q&A or FAQ structure exists.
- For editorial quality, that should be treated as a missed opportunity, not a success state.

### 3. Legacy `not_applicable` still exists behind the prompt contract
- The prompt bans `not_applicable`, but backend code still injects it in anchoring fallbacks in [analyze-run-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analyze-run-handler.js).
- Shared scoring still accepts it in [scoring-policy.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/shared/scoring-policy.js) and scoring config in [scoring-config-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/schemas/scoring-config-v1.json).
- The sidebar still has a display branch for it in [aivi-sidebar.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-sidebar.js).

### 4. Multi-instance issue coverage is only partially realized
- Data model support exists:
  - checks can carry multiple `candidate_highlights` and `failed_candidates`
  - serializer tracks `instances`
  - details drawer supports `instanceIndex`
- Deterministic layer already emits multiple highlights for some checks, for example intro factual entity spans in [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js).
- But the semantic prompt still says `One Finding Per Check` in [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt), which suppresses repeated semantic instances at source.
- Recommendation assembly often privileges the first candidate/highlight, so repeated failures do not consistently get separate recommendation attention in [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js).

### 5. Live proof from the recent dropshipping run
- Live run: `499b3caa-0fbd-462d-8899-af2f6a3fb89c`
- Stored result score: `AEO 28`, `GEO 23.03`, `GLOBAL 51.03`
- The run already failed major trust checks, but these AEO checks still passed by absence:
  - `immediate_answer_placement`
  - `answer_sentence_concise`
  - `question_answer_alignment`
  - `clear_answer_formatting`
  - `faq_structure_opportunity`
- That makes this run the primary regression fixture for the next fix.

## Milestone 1: Retire Default-Pass Anchor Semantics
- Change prompt instructions so no strict question anchor does not yield automatic `pass`.
- Change runtime guardrail in worker so missing/invalid anchors do not rewrite verdicts to `pass`.
- Re-evaluate verdict policy for:
  - `immediate_answer_placement`
  - `answer_sentence_concise`
  - `question_answer_alignment`
  - `clear_answer_formatting`
- Status: complete
- Note: when a run is already clamped by the severe `unsupported_claims` guardrail, this milestone may improve semantics without visibly lowering the capped final score until Milestone 2 also removes inverted FAQ/opportunity credit.

Acceptance:
- No-question articles can no longer earn full AEO answer-credit by default.
- The dropshipping regression run falls materially below `51.03`.

## Milestone 2: Fix Opportunity Check Semantics
- Reconfigure `faq_structure_opportunity` so a missing helpful FAQ/Q&A structure is negative, not positive.
- Review `faq_jsonld_generation_suggestion` semantics to ensure "opportunity absent" does not read as a clean pass where structure is obviously weak.
- Re-test coffee and dropshipping fixtures after this change.
- Status: complete
- Replay note: applying the new FAQ semantics to the saved dropshipping regression run projects a score drop from `51.03` to approximately `44.8`.

Acceptance:
- `faq_structure_opportunity` can no longer award full credit just because the structure is absent.
- AEO scores on unsupported content settle into a defensible range.

## Milestone 3: Remove Legacy `not_applicable`
- Remove backend injections of `not_applicable`.
- Collapse scoring and UI contracts to the three supported verdicts only:
  - `pass`
  - `partial`
  - `fail`
- Update tests and serializers to treat any legacy `not_applicable` as migration-only input, not a live runtime verdict.
- Status: complete
- Compatibility note: any legacy `not_applicable` input is now normalized to `fail` during scoring and UI serialization; no live runtime path should emit it.

Acceptance:
- No live path emits `not_applicable`.
- Shared scoring config and policy no longer require a fourth verdict state.

## Milestone 4: Audit And Expand Multi-Instance Coverage
- Build a per-check matrix of whether repeated failures are:
  - detectable multiple times
  - stored multiple times
  - highlighted multiple times
  - represented as multiple recommendation targets
- Decide which semantic checks should support multiple instances instead of "one finding per check".
- Patch prompt, worker normalization, serializer, and sidebar/details behavior where multi-instance coverage is worth preserving.
- Status: complete
- Diagnosis summary:
  - Deterministic checks were already capable of carrying repeated highlights.
  - Semantic checks were blocked by prompt guidance and chunk normalization that collapsed repeated findings to the first `check_id`.
  - Sidebar issue counts also underreported repeated non-inline semantic instances because `instances` was derived from anchored highlights only.
- Implemented behavior:
  - Semantic `fail` and `partial` checks may now emit up to 3 distinct findings per `check_id`.
  - Chunk normalization and single-check salvage now preserve repeated findings instead of collapsing them.
  - Worker conversion now keeps the strongest top-level verdict while storing repeated instances in `candidate_highlights`.
  - Sidebar summary and details navigation now count and resolve repeated non-inline instances, not just anchored highlights.

Acceptance:
- We have a documented matrix of instance behavior for deterministic and semantic checks.
- Chosen repeated-instance checks surface individual highlights or recommendation entries instead of collapsing to the first occurrence.

## Milestone 5: Regression Gates And Rollout
- Add fixture-backed regression for run `499b3caa-0fbd-462d-8899-af2f6a3fb89c`.
- Add focused tests for:
  - no-anchor AEO checks
  - `faq_structure_opportunity` semantics
  - legacy `not_applicable` rejection
  - multi-instance serialization where supported
- Deploy backend after replay and live verification.
- Status: complete locally
- Fixture assets:
  - `fixtures/scoring/dropshipping-live-run.manifest.json`
  - `fixtures/scoring/dropshipping-live-run.analysis.json`
- Replay command:
  - `node wp-content/plugins/AiVI-WP-Plugin/tools/replay_scoring_baseline.js --analysis="wp-content/plugins/AiVI-WP-Plugin/fixtures/scoring/dropshipping-live-run.analysis.json" --normalize-legacy-no-anchor-semantics`
- Current replay result:
  - `AEO: 22.24 / 55`
  - `GEO: 22.56 / 45`
  - `GLOBAL: 44.8 / 100`
  - guardrail: `unsupported_claims: severe`

Acceptance:
- The dropshipping fixture remains below the new ceiling in CI.
- Coffee and other known-bad fixtures do not regress upward.

## Deterministic follow-on sweep

### Goal
Remove deterministic pass-by-absence score inflation and make repeated deterministic failures surface with instance-specific wording and recommendation entries where applicable.

### Completed fixes
- Scope-not-triggered deterministic checks now stay within the `pass|partial|fail` contract but mark themselves as `score_neutral` instead of earning free points.
- Neutral deterministic checks currently include absent-schema, absent-date, absent-image, absent-internal-link, and untriggered FAQ/HowTo schema requirement paths.
- Deterministic explanation packs now preserve instance-specific highlight wording like `This paragraph...` when a real offending instance exists.
- Recommendation-only/non-inline checks now emit one recommendation per stored instance instead of collapsing to the first representative instance.

### Current regression benchmark
- Bad live dropshipping fixture deterministic-only replay now scores:
  - `AEO: 0 / 55`
  - `GEO: 3.98 / 45`
  - `GLOBAL: 3.98 / 100`
- Prior to the deterministic neutrality sweep, the same deterministic-only replay sat around `12.86 / 100`.
- Current neutral deterministic checks on that fixture:
  - `valid_jsonld_schema`
  - `accessibility_basics`
  - `supported_schema_types_validation`
  - `schema_matches_content`
  - `faq_jsonld_presence_and_completeness`
  - `howto_jsonld_presence_and_completeness`
  - `content_updated_12_months`
  - `no_broken_internal_links`

### Acceptance
- Deterministic scope absences no longer inflate scores.
- Inline-capable deterministic failures use local instance wording in explanation output.
- Recommendation-only deterministic checks preserve repeated instances as separate recommendation items.
