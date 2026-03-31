# AiVI Copilot Separation Investigation Track

## Purpose

This track documents the investigation needed to cleanly separate `AiVI Analyzer` from `AiVI Copilot`.

It is not a fix plan yet.

It exists to answer one question first:

- what parts of the current plugin still make Copilot behave like an analyzer-adjacent feature instead of an issue-scoped editorial helper?

## Locked Product Understanding

### Analyzer

- diagnoses the article
- flags issues
- scores and explains findings
- highlights relevant sections
- decides what is wrong

### Copilot

- does not analyze
- does not score
- does not surface prewritten analyzer copy as if it were thinking
- receives a selected issue plus the local text section to work on
- reasons live from that scoped payload
- helps the author fix the issue

Short form:

- `AiVI diagnoses`
- `Copilot repairs`

## Desired Copilot Behavior

- Copilot should think from its own live prompt, not serializer-authored helper strings.
- Copilot should be issue-scoped, not article-analysis-scoped.
- Copilot should only receive the text it needs, the issue it needs to fix, and the local context required to stay accurate.
- Copilot should not depend on analyzer rewrite nodes or signatures as authority.
- `Why flagged` belongs to AiVI Analyzer, not Copilot.
- Copilot should focus on:
  - what to improve
  - how to improve it
  - suggested variants
  - optional verification when explicitly approved

## Current Broken Parts

### 1. Copilot helper text is still deterministic UI copy

- In [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js), `buildFixAssistHelperText(...)` generates the opening Copilot message locally.
- That means the first Copilot message is not AI reasoning.
- This is why users see templated guidance such as:
  - structural/editor-side language
  - schema-assist language
  - evidence-assist language

Why this is broken:

- the Copilot surface looks intelligent, but the opening help is still hard-coded mode text
- this hides whether Copilot actually understands the selected issue

### 2. `Why flagged` is analyzer explanation, not Copilot reasoning

- The Review Rail detail text is built from analyzer explanation material in:
  - [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
  - [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- The serialized fields include:
  - `explanation_pack`
  - `issue_explanation`
  - `review_summary`
- The overlay then rehydrates that into `detailText` through `resolveRecommendationDetailText(...)`.

Why this is broken:

- Copilot is still visually sharing analyzer-authored explanation space
- users can mistake analyzer copy for Copilot thought
- Copilot is doing duplicate surface work instead of focused repair work

### 3. The Review Rail still mixes canonical issues with fallback recommendation shapes

- In [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js), `collectOverlayRecommendations(...)` still merges:
  - `recommendations`
  - `unhighlightable_issues`
  - `v2_findings`
- `v2_findings` carries richer actionable data, but the rail can still be driven by fallback recommendation objects first.

Why this is broken:

- Copilot can attach to a reduced or partially enriched issue shell
- that can cause wrong fix mode messaging
- that can cause rewrite-capable issues to sound like manual or structural-only issues

### 4. Copilot availability still depends on analyzer-derived repair metadata

- In [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js), `buildFixAssistAvailability(...)` still derives `actionable` and `variantsAllowed` from `rewrite_target`.
- Even with local context improvements, `rewrite_target` still has too much influence.

Why this is broken:

- Copilot is still partially gated by analyzer targeting quality
- that recreates the old rewrite-engine failure pattern the product is trying to escape

### 5. Copilot triage is still being synthesized as analyzer-adjacent metadata

- `fix_assist_triage` is built in:
  - [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
  - [fix-assist-triage.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-triage.js)
  - [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js)

Why this is broken:

- triage is being generated in multiple places
- Copilot behavior can drift depending on which version of triage survives the request path
- Copilot starts feeling like a serializer-controlled layer, not a self-contained assistant

### 6. Copilot contract building is still tied into analyzer-flavored preprocessing

- [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js) builds repair contracts from a mix of:
  - issue context
  - analyzer rewrite target
  - repair intent
  - triage
- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js) can also rebuild missing parts on the backend.

Why this is broken:

- Copilot is not yet receiving a clean single-purpose issue packet
- instead, it reconstructs repair intent from analyzer-era structures

### 7. The live AI brain exists, but the route to it has been unreliable

- The actual generation path is real in [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js):
  - builds a scoped prompt
  - uses manifest + issue context
  - sends to Mistral
  - validates outputs
- But live testing exposed a separate operational problem:
  - the dev API did not publish `POST /aivi/v1/rewrite`
  - so `Show 3 variants` returned `Not Found`

Why this is broken:

- users experience Copilot as dumb or fake because the actual AI route is unreachable
- this masks whether the real generation logic is good or bad

### 8. Deploy route reconciliation does not protect Copilot routes

- [deploy-rcl-7z.ps1](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/deploy-rcl-7z.ps1) currently reconciles only selected critical routes.
- It already protects:
  - `GET /aivi/v1/worker/health`
  - `GET /aivi/v1/admin/financials/overview`
- It does not currently guarantee:
  - `POST /aivi/v1/rewrite`
  - `POST /aivi/v1/apply_suggestion`

Why this is broken:

- Copilot generation can silently fall off the live API surface
- packaging and deploy can look healthy while the actual assistant route is absent

### 9. Serializer still carries too much Copilot-facing content

- The serializer currently emits Copilot-adjacent fields such as:
  - `fix_assist_triage`
  - `review_summary`
  - `issue_explanation`
  - `explanation_pack`
  - `rewrite_target`
  - `repair_intent`

Why this is broken:

- Analyzer output is doing too much UI authorship for Copilot
- Copilot should receive a compact issue packet, not a nearly pre-baked conversational surface

### 10. Copilot still has duplicated responsibilities with AiVI

- AiVI already explains:
  - what failed
  - why it failed
  - what the recommendation means
- Copilot currently still surfaces:
  - helper notes
  - `Why flagged`
  - mode labels
  - verification summaries

Why this is broken:

- Analyzer and Copilot responsibilities are visually and behaviorally entangled
- this increases noise and reduces trust

## Investigation Workstreams

### M1. Source Of Truth Audit

- identify the exact object Copilot should consume as its only issue input
- determine whether that should be:
  - a rail-selected canonical issue packet
  - a normalized live issue packet built only at click time

Questions:

- what is the minimum issue payload Copilot truly needs?
- what analyzer fields should be removed from the Copilot surface entirely?

### M2. Surface Ownership Audit

- map every visible Copilot string to its origin

Track:

- analyzer-authored
- serializer-authored
- overlay hard-coded
- backend-generated
- model-generated

Goal:

- no ambiguous ownership of user-facing copy

### M3. Repair Packet Design Audit

- define the minimal Copilot packet

Candidate fields:

- selected issue id
- check id and display name
- short issue note
- target text
- nearby section context
- preserve constraints
- do-not-invent constraints
- optional verification consent state

Goal:

- stop shipping analyzer-era baggage unless it is truly required

### M4. Live Route And Runtime Audit

- verify every live Copilot capability path end to end

Must include:

- `POST /aivi/v1/rewrite`
- `POST /aivi/v1/apply_suggestion` if kept
- any future verification or support route

Goal:

- no more `UI says it can help` while the live API route is missing

### M5. Rail Binding Audit

- verify that the active Review Rail issue is always the issue Copilot receives

Must prove:

- no fallback shell issue is taking precedence over the real actionable issue
- no drift between rail item, highlighted text, and Copilot payload

### M6. Prompt Ownership Audit

- inspect the exact Copilot prompt and ensure it is repair-only

Goal:

- Copilot should not be asked to analyze the article again
- Copilot should be asked to fix a scoped issue in scoped text

### M7. UI Ownership Audit

- remove or deprecate Copilot UI that belongs to Analyzer

Likely candidates:

- `Why flagged`
- prewritten helper note if kept deterministic
- verbose mode/state explanations

Goal:

- Copilot UI should feel like a repair tool, not a second analysis dashboard

### M8. End-To-End Proof Harness

- run live tests on:
  - one local rewrite issue
  - one structural issue
  - one schema issue
  - one trust/source issue with verification approval
  - one trust/source issue with no support found

Goal:

- confirm that users are testing the actual Copilot brain, not a layered illusion

## Immediate Investigation Conclusions

- The current live Copilot is still not separated enough from AiVI Analyzer.
- The most important current coupling points are:
  - serializer-authored explanation and triage fields
  - deterministic helper text in overlay
  - fallback issue-object mixing in the Review Rail
  - analyzer metadata still carrying too much authority
  - operational drift on the live rewrite route

## Exit Criteria For Separation

- Copilot no longer displays analyzer-authored explanation as if it were thinking.
- Copilot receives one clean issue-scoped repair packet.
- Copilot helper text and variants come from live reasoning, not prewritten UI strings.
- Analyzer keeps diagnosis ownership.
- Copilot keeps repair ownership.
- Live route publication guarantees the repair path is actually reachable.

## Working Rule

If a feature answers:

- `what is wrong?`

it belongs to AiVI Analyzer.

If a feature answers:

- `how can I improve this exact section?`

it belongs to Copilot.
