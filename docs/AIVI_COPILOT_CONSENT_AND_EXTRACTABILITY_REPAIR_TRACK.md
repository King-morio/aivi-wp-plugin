# AiVI Copilot Consent And Extractability Repair Track

## Purpose

This track captures the live diagnosis for two related but distinct problems:

- Copilot consent-path requests (`Verify first` / `Stay local`) are not consistently leaving the UI.
- Answer Extractability can still overreact to rhetorical questions and leak internal threshold math into user-facing copy.

This track exists so those findings are not lost or mixed into unrelated Copilot work.

## Locked Diagnosis

### 1. The latest `Verify first` attempt did not reach backend

For the article:

- `How Modern Gadgets Help Students to Write College Essays`

The analysis run was:

- `73d00853-0321-46ff-a59e-63e6cd221fc1`

CloudWatch checks on **March 31, 2026** showed:

- the analyzer run completed successfully
- earlier rewrite requests for that run did reach `/aivi/v1/rewrite`
- the newest `Verify first` attempt in the last `10` to `20` minutes produced no orchestrator log activity at all
- the newest attempt also produced no worker log activity

Conclusion:

- the recent `Verify first` click almost certainly never left the UI

### 2. Earlier rewrites on the same run reached backend, but not with consent intent

Earlier rewrite requests for the same run were logged for checks such as:

- `intro_factual_entities`
- `immediate_answer_placement`
- `readability_adaptivity`
- `lists_tables_presence`

But each completed with:

- `verification_intent: null`
- `verification_status: null`

Conclusion:

- the backend rewrite path worked
- the explicit consent choice was not carried into the request

### 3. The backend verification pipeline itself is not globally dead

Past orchestrator telemetry confirmed successful `verify_first` generations with:

- `verification_intent: "verify_first"`
- `verification_status: "support_found"`
- `verification_provider: "duckduckgo_html"`

Past orchestrator telemetry also confirmed successful `local_only` generations with:

- `verification_intent: "local_only"`
- `variants_count: 3`

Conclusion:

- this is not a global backend rewrite failure
- this is not a global verifier failure
- the active fault is in the consent-path handoff and dispatch layer

### 4. `Stay local` likely shares the same broken path

The user symptom is:

- after choosing `Verify first` or `Stay local`, no `3` variants appear

Given the confirmed lack of backend traffic for the latest consent attempt, the most likely current diagnosis is:

- both buttons are vulnerable to the same UI-side dispatch break

### 5. Answer Extractability is over-anchoring rhetorical questions

The manifest for the article shows rhetorical/user-style lead-in questions like:

- `Do you find yourself struggling to write college essays?`
- `Do you feel like you don't have enough time to get them done?`

Worker logs for this run showed:

- `question_anchor_count: 3`
- `anchor_v2_enabled: false`

Conclusion:

- rhetorical intro questions are still being treated as strict question anchors
- this article behaves more like an explainer/list article than a true Q&A answer article
- that mismatch can trigger generic direct-answer-distance failures

### 6. Internal threshold math is still leaking into user-facing copy

Current serializer logic already scrubs some internal phrasing, but not all of it.

User-facing messages can still surface wording like:

- exact word counts
- explicit threshold references
- question-anchor distance math

Conclusion:

- the scrubber is too narrow
- user-facing extractability copy still needs broader editorial normalization

### 7. Validator is not the active cause in this lane

For the rewrites on this run that did reach backend, telemetry showed:

- `validator_pass: true`
- `fallback_used: false`

Conclusion:

- validator is not the current culprit for the consent-path failure
- do not mix validator removal or reform into this track unless a new diagnosis requires it

## Product Guardrails

- do not redesign Analyzer
- do not redesign Review Rail
- do not rename `View details`
- do not change working analyzer or rail copy for the sake of Copilot uniformity
- do not let Copilot re-analyze what AiVI already analyzed
- do not treat backend verification as mandatory for every evidence-sensitive repair
- do not surface internal threshold numbers in user-facing extractability explanations
- if any fix requires touching stable analyzer or rail behavior beyond the scoped items below, pause and realign first

## Repair Goal

Make the Copilot consent flow dependable and observable, while making Answer Extractability calmer and more editorially correct on rhetorical-question articles.

The target behavior is:

- `Verify first` sends a real rewrite request with `verification_intent: verify_first`
- `Stay local` sends a real rewrite request with `verification_intent: local_only`
- either path continues into normal `3` variant generation
- verification waits only for a bounded window before returning a calm outcome
- rhetorical lead-in questions stop being treated as strict answer anchors when the article is functioning as an explainer
- user-facing extractability explanations stay editorial, not numeric-internal

## Scope Boundaries

### In scope

- consent prompt dispatch and request handoff
- request-path telemetry for consent choices
- bounded verification timeout/result contract
- rhetorical-question anchor suppression
- serializer cleanup for threshold-language leakage

### Out of scope for this track

- validator retirement or validator redesign
- broad Copilot UI redesign
- analyzer scoring changes beyond question-anchor handling
- Review Rail copy or structural redesign

## Exact Files To Touch First

### Frontend consent path

- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)

### Rewrite orchestration and verification

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js)
- [evidence-verifier.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/evidence-verifier.js)

### Triage and contract context if needed

- [fix-assist-triage.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-triage.js)
- [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js)

### Extractability and user-facing copy cleanup

- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json)

## Milestones

### Progress Snapshot

- `M1` completed on March 31, 2026
- `M2` completed on March 31, 2026
- `M3` completed on March 31, 2026
- `M4` completed on March 31, 2026
- `M5` completed on March 31, 2026
- `M6` completed on March 31, 2026

## M1. Consent Dispatch Audit

### Goal

Prove exactly where `Verify first` and `Stay local` break between click and `/rewrite`.

### Required work

- trace the click handlers in the consent shell
- confirm whether issue key, rewrite context, and triage survive selection
- add request-path telemetry before `callRest('/rewrite')`
- distinguish these states:
  - user clicked `Verify first`
  - user clicked `Stay local`
  - request was assembled
  - request was sent
  - request failed before network

### Acceptance

- a fresh consent click produces unmistakable frontend telemetry showing whether the request was assembled and sent

## M2. Consent-To-Rewrite Handoff Repair

### Goal

Make both consent choices reliably produce the same downstream rewrite pipeline used by normal Copilot generation.

### Required work

- repair any stale-state, issue-key, or prompt-dismissal behavior that drops the request
- ensure consent mode does not clear or overwrite the pending suggestion packet before request dispatch
- ensure both intents survive into:
  - payload root `verification_intent`
  - payload `options.verification_intent`

### Acceptance

- `Verify first` reaches backend with `verification_intent: "verify_first"`
- `Stay local` reaches backend with `verification_intent: "local_only"`
- both choices return `3` variants when generation succeeds

## M3. Verification Wait Contract

### Goal

Make verification latency bounded, calm, and explicit.

### Required work

- keep verification strictly time-boxed
- confirm current backend timeout remains acceptable or tighten it if needed
- standardize terminal states:
  - `support_found`
  - `weak_support`
  - `no_verifiable_support`
  - `verification_unavailable`
  - `verification_skipped`
- ensure Copilot still produces variants after verification choice unless the generation call itself fails
- ensure helpful user-facing messaging appears when verification cannot find dependable support

### Acceptance

- `Verify first` never hangs indefinitely
- the user either receives verified variants or a calm fallback message plus variants that respect the selected mode

## M4. Rhetorical Question Anchor Repair

### Goal

Stop rhetorical and promotional lead-in questions from being treated as strict answer anchors in explainer-style articles.

### Required work

- define disqualifying patterns for rhetorical anchors
- distinguish:
  - genuine explicit user-facing question anchors
  - intro-hook rhetorical questions
  - CTA-style questions
  - broad thematic questions with no real direct-answer contract
- keep true Q&A articles working

### Acceptance

- the `How Modern Gadgets Help Students to Write College Essays` article no longer receives misleading anchor-driven Answer Extractability messaging from rhetorical intro questions alone

## M5. Threshold-Language Cleanup

### Goal

Remove exact internal threshold math from user-facing Answer Extractability copy.

### Required work

- broaden serializer normalization patterns
- convert all answer-anchor math into editorial explanations
- keep thresholds internal to check logic and tests, not visible in product copy

### Acceptance

- no user-facing extractability copy mentions exact word thresholds or anchor-distance math

## M6. Regression Proof

### Goal

Lock the repaired behavior with focused tests and one live sanity pass.

### Required work

- add or update tests for consent dispatch and payload intent preservation
- add or update tests for rhetorical-question suppression
- add or update tests for threshold-language scrubbing
- re-run one live evidence-assist scenario and one local-only scenario

### Acceptance

- both consent branches produce variants
- rhetorical-question explainer content no longer triggers the wrong style of answer-anchor message
- threshold numbers stay out of user-facing copy

## Test Evidence To Capture During Fix

- one backend log line showing `verification_intent: "verify_first"`
- one backend log line showing `verification_intent: "local_only"`
- one successful `verify_first` generation with a non-null `verification_status`
- one successful `local_only` generation with `3` variants
- one serializer test proving threshold numbers do not surface in user-facing copy
- one rhetorical-question fixture proving intro-hook questions do not become strict anchors by default

### Captured On March 31, 2026

- `verify_first` simulation gate passed for `external-authoritative-sources-epilepsy-source-gap`
- `local_only` simulation gate passed for `immediate-answer-placement-buried-prose`
- Lambda telemetry captured `verification_intent: "verify_first"` with `verification_status: "support_found"` and `variants_count: 3`
- Lambda telemetry captured `verification_intent: "local_only"` with `verification_status: null` and `variants_count: 3`

## Known Live Evidence Anchoring This Track

- Run ID: `73d00853-0321-46ff-a59e-63e6cd221fc1`
- Site: `ru.my-style.in`
- Article: `How Modern Gadgets Help Students to Write College Essays`

Confirmed live facts:

- analyzer run succeeded
- recent consent attempt did not reach backend
- earlier rewrites for that run reached backend without consent intent
- global `verify_first` works elsewhere
- global `local_only` works elsewhere

## Completion Standard

This track is complete only when:

- consent-path requests consistently leave the UI
- `Verify first` and `Stay local` both produce backend-visible intent
- both paths return variants reliably
- rhetorical questions stop polluting strict answer-anchor logic in explainer articles
- user-facing extractability copy sounds editorial, not internal
