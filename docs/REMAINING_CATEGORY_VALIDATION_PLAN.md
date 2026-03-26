# Remaining Category Validation Plan

## Why this plan exists

We already validated the question-anchor and FAQ-candidacy fix track. This plan focuses on the remaining category families with controlled A/B-style specimens and repeatable expected outcomes.

## Category map from current definitions

Remaining groups to validate:

1. Intro Focus & Factuality (AEO)
2. Structure & Readability (excluding already-tested FAQ/list edge behavior)
3. Schema & Structured Data
4. Freshness & Temporal Validity
5. Entities & Semantic Clarity
6. Trust, Neutrality & Safety
7. Citability & Verifiability (excluding already-tested no-link neutrality behavior)

## Batch strategy (3 / 2 / 2)

### Batch A (3 groups)

Groups:

- Intro Focus & Factuality
- Structure & Readability
- Entities & Semantic Clarity

Specimen:

- `TEST_BATCH_A_CLARITY_STRUCTURE_ENTITIES_2026.md`

Design:

- Intro intentionally long and broad with diffuse claims.
- Mixed heading quality (one vague heading, one off-topic subsection, one overlong paragraph).
- Entity set includes ambiguous terms and inconsistent labels.

Expected signal pattern:

- Intro checks produce at least one partial/fail in intro focus/readability/entity specificity.
- Structure checks trigger heading/topic/paragraph quality issues.
- Entity checks avoid over-generous pass on disambiguation and relationship clarity.

### Batch B (2 groups)

Groups:

- Schema & Structured Data
- Citability & Verifiability

Specimen:

- `TEST_BATCH_B_SCHEMA_CITABILITY_2026.md`

Design:

- Include one JSON-LD block with subtle mismatch to on-page claims.
- Include factual assertions with weak or distant support.
- Include near-duplicate phrasing in two sections.

Expected signal pattern:

- Schema checks detect mismatch/completeness gaps without malformed noise.
- Citability checks surface provenance/citation-context weaknesses.
- Duplicate-detection surfaces semantic overlap where intentional.

### Batch C (2 groups)

Groups:

- Freshness & Temporal Validity
- Trust, Neutrality & Safety

Specimen:

- `TEST_BATCH_C_TEMPORAL_TRUST_2026.md`

Design:

- Time-sensitive claims with stale references and unverifiable recency language.
- Missing or weak author/bio/metadata framing.
- Promotional or exaggerated phrasing mixed with numeric claims lacking clear provenance.

Expected signal pattern:

- Temporal checks flag stale/unsupported time claims.
- Trust/safety checks catch evidence and neutrality gaps while keeping PII behavior conservative.

## Execution protocol

For each specimen:

1. Run analysis 3 times with unique cache-busting markers.
2. Record run status and partial context fields.
3. Compare verdict stability at check level.
4. Classify each check as:
   - stable (same verdict all runs),
   - soft-variant (one-step shift pass/partial or partial/fail),
   - unstable (multi-step shifts or rationale drift).

## Stability guardrails

- Any deterministic check that flips across the 3 runs is treated as a bug.
- Semantic checks may soft-variant, but rationale must remain on the same issue family.
- If run status is partial, incomplete checks are excluded from logical pass/fail conclusions.

## Exit criteria

- All three batches executed.
- No deterministic instability.
- No fallback-collapse pattern in answer-family checks.
- No false-positive FAQ pass in dense inline Q&A.
- Partial-run diagnostics remain explicit and non-misleading.
