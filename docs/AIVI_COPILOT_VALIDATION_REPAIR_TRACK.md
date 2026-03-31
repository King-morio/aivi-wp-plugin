# AiVI Copilot Validation Repair Track

## Purpose

This track turns the live diagnosis of the Copilot variant failure into a focused repair plan.

It is intentionally global.

It does not assume the problem is limited to:

- `intro_factual_entities`
- `immediate_answer_placement`

Those were only the first visible failures.

The actual issue is broader:

- Copilot can generate strong variants
- the post-generation validator can still reject them for low-value literal drift
- that rejection then forces fallback variants and makes Copilot look weaker than it is

## Locked Understanding

- `AiVI diagnoses`
- `Copilot repairs`
- validator exists to protect safety, not to author or overrule editorial reasoning

The validator should stop:

- invented numbers
- dropped critical facts
- scope-breaking rewrites
- structurally invalid outputs

The validator should not force Copilot to keep:

- generic sentence openers
- heading fragments
- weak regex-picked "entities"
- low-value wording that a good rewrite should be free to improve

## Diagnosis Summary

### What the live run proved

On the `ru.my-style.in` run, Copilot did reach the model and return `3` variants.

The failure happened after generation.

CloudWatch showed:

- `validator_pass: false`
- `fallback_used: true`
- `fallback_reason: repair_contract_preservation_violation`

So this is not a route problem and not a "Copilot did not think" problem.

### What is actually breaking

The repair contract builder currently extracts preservation literals from weak heuristic signals in [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js).

The validator in [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js) then treats those literals as hard requirements.

That means a good rewrite can be rejected simply because it did not repeat low-value tokens such as:

- `Now`
- `Keeping`
- `Whether`
- `Best Format`

### Why this is global

This can affect any Copilot-capable check where the current literal extraction produces noisy preservation values from:

- capitalized openers
- heading text fragments
- generic lead-ins
- weak year/date matches

So the track must repair the validator system as a class, not just patch one or two checks.

## Guardrails

- do not redesign Analyzer
- do not redesign Review Rail
- do not relabel `View details`
- do not move diagnosis responsibility from AiVI to Copilot
- do not remove safety validation entirely
- do not narrow this fix to the two observed checks only

## Repair Goal

Keep validation, but narrow it to high-confidence safety checks.

The target model is:

- Copilot reasons live from the selected issue and local context
- validator confirms only critical safety and scope rules
- validator no longer rejects good rewrites for cosmetic or low-value literal drift

## What Must Change

### 1. Preservation extraction must become confidence-aware

Current problem:

- preservation literals are extracted too broadly

Required change:

- only promote literals to hard-preserve when they are genuinely critical

Hard-preserve candidates should be limited to things like:

- real numeric claims
- real dates
- clearly valid named entities
- explicitly declared preserve values from the contract

Weak candidates should not become hard blockers:

- sentence openers
- discourse markers
- heading fragments
- generic capitalized words

### 2. Preservation validation must become check-aware

Current problem:

- all preservation literals are enforced in one blunt way

Required change:

- apply narrower preservation rules per check family

Examples:

- answer-first rewrites should preserve answer facts, not heading fragments
- concise snippet rewrites should preserve core meaning, not every extracted token
- evidence/source rewrites should preserve supported claims and certainty boundaries, not arbitrary capitalized words

### 3. Missing-literal diagnostics must become explicit

Current problem:

- logs only show `repair_contract_preservation_violation`

Required change:

- log the exact missing literals
- log the literal class:
  - `number`
  - `date`
  - `entity`
  - `explicit_preserve`
- log whether the literal came from:
  - analyzer text
  - heading chain
  - issue packet
  - explicit contract config

### 4. Fallback should happen only after meaningful validation

Current problem:

- fallback is triggered even when the variants may be editorially correct

Required change:

- only trigger fallback when the violation is truly safety-relevant
- do not fallback on low-value lexical drift

### 5. Prompt/contract separation must stay intact

Current problem:

- over-strict validation can effectively reintroduce deterministic authorship

Required change:

- keep Copilot as the reasoning layer
- keep validator as a narrow guardrail layer
- do not let validator behave like a second rewrite engine

## Milestones

### M1. Preservation Source Audit

- inventory every source feeding `preservation_literals`
- classify each source as:
  - hard-preserve eligible
  - soft-preserve only
  - ignore
- produce a short matrix by literal type and check family

Exit condition:

- we know exactly which preservation values are currently overreaching

Status:

- completed locally
- audit captured in [AIVI_COPILOT_PRESERVATION_SOURCE_AUDIT.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/AIVI_COPILOT_PRESERVATION_SOURCE_AUDIT.md)

### M2. Literal Quality Filter

- tighten entity extraction
- strip weak opener/heading-fragment values
- stop promoting generic capitalized tokens into hard-preserve entities
- separate:
  - hard-preserve literals
  - soft guidance literals

Exit condition:

- noisy values like `Now`, `Keeping`, `Whether`, `Best Format` no longer enter the hard-preserve path

Status:

- completed locally
- hard-preserve filtering now strips weak sentence openers and question-heading fragments before they can reach validator enforcement

### M3. Check-Aware Validation Rules

- make preservation enforcement depend on check family and repair mode
- define safe relaxed behavior for:
  - answer extractability checks
  - intro/support checks
  - evidence/source checks
  - structural transform checks

Exit condition:

- validator keeps critical facts but stops blocking valid editorial compression and refactoring

Status:

- completed locally
- hard validation now enforces only source-scoped literals for each rewrite, which removes heading-only contamination while still protecting real supported facts inside the target specimen

### M4. Diagnostic Logging Upgrade

- log which literals failed
- log their source
- log their class
- log which validator rule actually failed

Exit condition:

- future CloudWatch diagnosis can identify the real blocker in one pass

Status:

- completed locally
- preservation failures now carry exact missing literals, literal class, and source metadata through validator results and handler metadata/logging

### M5. Global Fixture Sweep

- build or update fixtures across several Copilot-capable families
- include at minimum:
  - answer-first rewrite
  - concise snippet rewrite
  - intro factual support rewrite
  - source/evidence assist
  - structural support rewrite

Rule:

- do not use only the two observed checks as proof

Exit condition:

- the validator behaves correctly across a representative Copilot spread

Status:

- completed locally
- representative fixture coverage now spans:
  - `immediate_answer_placement`
  - `answer_sentence_concise`
  - `intro_factual_entities`
  - `external_authoritative_sources`
  - `heading_topic_fulfillment`
- the scorer gate and validator sweep both pass across that spread

### M6. Live Proof Gate

- rerun at least one local rewrite case and one evidence-oriented case against the deployed path
- confirm:
  - `variants_count: 3`
  - `validator_pass: true`
  - `fallback_used: false`

Exit condition:

- live telemetry proves the validator is no longer suppressing good variants

Status:

- completed against the deployed lambda path
- local rewrite proof:
  - fixture: `immediate-answer-placement-buried-prose`
  - generation request: `immediate-answer-placement-buried-prose-1774873067254`
  - telemetry/result: `variants_count=3`, `validator_pass=true`, `fallback_used=false`
- evidence-oriented proof:
  - fixture: `external-authoritative-sources-epilepsy-source-gap`
  - generation request: `external-authoritative-sources-epilepsy-source-gap-1774873130684`
  - telemetry/result: `variants_count=3`, `validator_pass=true`, `fallback_used=false`, `verification_status=support_found`
- saved reports:
  - [immediate-answer-placement-buried-prose.fixture.latest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/gate-reports/immediate-answer-placement-buried-prose.fixture.latest.json)
  - [external-authoritative-sources-epilepsy-source-gap.fixture.latest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/gate-reports/external-authoritative-sources-epilepsy-source-gap.fixture.latest.json)

### M7. Package And Deploy

- package a clean plugin build
- deploy backend
- verify health
- verify rewrite route

Exit condition:

- the validator repair is live and ready for full-article user testing

Status:

- completed with release package + live deploy
- packaged builds:
  - [ai-visibility-inspector-1.0.37.zip](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/dist/ai-visibility-inspector-1.0.37.zip)
  - [ai-visibility-inspector.zip](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/dist/ai-visibility-inspector.zip)
- packaged metadata verified:
  - `Version: 1.0.37`
  - `Stable tag: 1.0.37`
- deployed to:
  - `aivi-orchestrator-run-dev`
  - `aivi-analyzer-worker-dev`
- live verification:
  - ping: `Healthy Connection`
  - worker health: `ok=true`
  - rewrite route present: `POST /aivi/v1/rewrite`
- deploy script handoff hardening:
  - [deploy-rcl-7z.ps1](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/deploy-rcl-7z.ps1) now captures AWS CLI upload output safely instead of letting PowerShell native stderr handling fail an otherwise successful deploy

## Acceptance Standard

This track is complete only when all of the following are true:

- Copilot still blocks invented or dangerous rewrites
- Copilot no longer falls back because of low-value literal drift
- logs clearly explain real validation failures
- at least one live run shows:
  - `validator_pass: true`
  - `fallback_used: false`
- the fix is demonstrated across multiple Copilot-capable check families, not just one example

## Out Of Scope For This Track

- Analyzer redesign
- Review Rail redesign
- Copilot UI redesign beyond any tiny logging/debug exposure needed for diagnosis
- Mistral built-in web search migration

That can happen later if needed.
