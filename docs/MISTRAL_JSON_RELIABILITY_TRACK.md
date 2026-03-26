# Mistral JSON Reliability Track

## Goal
Drive malformed analyzer JSON below a practical production ceiling by reducing model output complexity, enforcing stronger structured output, and keeping prompt, parser, normalizer, scoring, and serializer behavior in sync.

## Related Locked UI Decision
- The overlay editor redesign is locked separately in:
  - [OVERLAY_EDITOR_REDESIGN_TRACK.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/OVERLAY_EDITOR_REDESIGN_TRACK.md)
- Chosen direction: `Option 3 - Review Studio`
- Constraints already locked there must be preserved while this reliability work proceeds:
  - left review rail
  - no paste/import panel
  - no prototype explainer copy
  - footer recommendations migrate into the rail

## Current Diagnosis
- Recent live runs completed successfully but took about 232 seconds because the worker repeatedly retried malformed Mistral chunk responses.
- Observed parse failures:
  - `Unterminated string in JSON ...`
  - `Expected ',' or ']' after array element ...`
- The current worker uses `response_format: { type: "json_object" }`, which is weaker than schema-enforced output.
- The prompt and validator still allow the model to emit optional rich fields that the serializer can already synthesize locally:
  - `why_it_matters`
  - `how_to_fix_steps`
  - `example_pattern`
  - `text_position_selector`
- Long selector strings plus repeated optional fields increase branch complexity and tail-break risk.

## Sync Audit
The following parts must stay compatible through this remediation:

### Prompt / Request
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `infrastructure/lambda/worker/index.js`

### Parse / Recovery / Normalization
- `infrastructure/lambda/worker/index.js`
  - `extractJsonFromResponse`
  - `extractPartialFindingsFromRaw`
  - `validateFindingsContract`
  - `normalizeChunkFindings`
  - `convertFindingsToChecks`

### Scoring / Result Contract
- `infrastructure/lambda/worker/index.js`
  - `scoreChecksForSidebar`
- scoring remains downstream of normalized checks, so any response-contract reduction must preserve:
  - `check_id`
  - `verdict`
  - `confidence`
  - anchoring/proof text
  - any guardrail metadata required for verdict adjustment

### Serialization / UI Consumption
- `infrastructure/lambda/worker/analysis-serializer.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.js`
- `assets/js/aivi-sidebar.js`

These serializers already generate user-facing guidance and compressed narratives, which is why the model does not need to keep producing rich guidance fields.

## What I Agree With
The external diagnosis is directionally correct:
- prompt/schema pressure is the main culprit
- output branching is too high
- long selector strings are risky
- batching fewer checks will help
- API-level structure enforcement matters more than prompt-only JSON discipline

## Additional Findings
- The current compact path still asks for more structure than necessary.
- We do not currently preserve malformed raw chunk output when a later compact/salvage recovery succeeds, which leaves a telemetry blind spot.
- The worker and orchestrator serializer stacks must remain aligned after contract reduction, or we will reintroduce another drift/regression class.

## Phases

### Phase 1: Shrink The Model Output Contract
Files:
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`
- `infrastructure/lambda/worker/index.js`

Changes:
- Reduce the model-emitted finding shape to the minimum required fields:
  - `check_id`
  - `verdict`
  - `confidence`
  - `scope`
  - `text_quote_selector`
  - `question_anchor_text` only when strictly required
  - `explanation`
- Remove model-side expectation for:
  - `why_it_matters`
  - `how_to_fix_steps`
  - `example_pattern`
  - `text_position_selector`
- Keep those as downstream synthesized fields only.
- Update `validateFindingsContract` accordingly.

Acceptance:
- A valid model response can be materially shorter for the same chunk.
- Normalizer and converter still produce the same check-level contract needed by scoring and serialization.

### Phase 2: Stronger Output Framing And Smaller Chunks
Files:
- `infrastructure/lambda/worker/index.js`
- `infrastructure/lambda/worker/prompts/analysis-system-v1.txt`

Changes:
- Prefer schema-enforced structured output over plain `json_object` if the current Mistral API path supports it cleanly.
- Reduce chunk size from `8` to `4-5` for semantic checks.
- Lower chunk temperature for structured extraction to `0` where practical.
- Tighten compact prompt rules further around selector brevity and one-line explanations.

Acceptance:
- Parse-error frequency drops materially in local simulation / live telemetry.
- Average chunk retry count falls.

Status:
- Completed locally on 2026-03-12.
- Worker requests now use schema-enforced structured output instead of plain `json_object`.
- Default semantic chunk size is reduced from `8` to `5`.
- Chunk extraction temperature is now `0` for normal and compact retry paths.
- Prompt and compact retry rules now push shorter explanations and shorter proof spans.

### Phase 3: Telemetry, Capture, And Safe Recovery
Files:
- `infrastructure/lambda/worker/index.js`
- tests under `infrastructure/lambda/worker/*.test.js`

Changes:
- Capture the first N malformed raw chunk responses per run to artifacts for diagnosis.
- Log `finish_reason`, chunk index, model, and parse-error class on malformed output.
- Keep partial recovery and salvage, but make it diagnostic instead of opaque.

Acceptance:
- We can inspect the exact malformed shape on future regressions.
- Parse churn becomes measurable by run, chunk, and model.

Status:
- Completed locally on 2026-03-12.
- The worker now captures the first malformed chunk responses per run into `malformed_chunks.json`.
- Each capture records chunk index, attempt label, model, finish reason, parse-error class, preview, and raw response slice.
- `partial_context` now carries malformed capture counts and the artifact S3 URI when capture succeeds.

### Phase 4: Regression Lock And Rollout
Files:
- `infrastructure/lambda/worker/worker-regression.test.js`
- `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
- `infrastructure/lambda/orchestrator/analysis-serializer.test.js`
- any new contract-specific tests needed

Changes:
- Add contract tests for the reduced model response schema.
- Add regression guards for:
  - no rich guidance fields required from model output
  - chunk request payload uses stricter structured output mode when enabled
  - malformed raw chunk capture fires on parse failure
  - downstream serializer behavior remains unchanged for user-facing output quality

Acceptance:
- Prompt, validator, normalizer, scoring, and serializers remain compatible.
- Rollout can happen in one clean backend deploy.

Status:
- Completed locally on 2026-03-12.
- Regression coverage now locks:
  - reduced minimal finding contract acceptance
  - schema-enforced request framing
  - malformed chunk capture shape and cap behavior
  - serializer compatibility when model-side rich guidance fields are absent
- Focused suites passed:
  - `tests/diagnostics/prompt-sync.test.js`
  - `infrastructure/lambda/worker/worker-regression.test.js`
  - `infrastructure/lambda/worker/analysis-serializer.worker.test.js`
  - `infrastructure/lambda/orchestrator/analysis-serializer.test.js`

## Success Criteria
- Malformed JSON rate reduced sharply from the current retry-heavy baseline.
- No user-visible regression in explanations, recommendations, or jump-to-block behavior.
- Slow-run false failures stay fixed in the plugin/sidebar.
- The engine remains internally consistent across prompt, parse, normalize, score, and serialize stages.
