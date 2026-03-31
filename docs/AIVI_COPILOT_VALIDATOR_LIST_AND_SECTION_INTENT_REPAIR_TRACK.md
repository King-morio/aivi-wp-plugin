# AiVI Copilot Validator, List Output, And Section Intent Repair Track

## Purpose

This track captures the next repair lane for Copilot after the consent-path work.

It exists because a new set of live failures has now been confirmed:

- `Verify first` can complete web verification but still lose the rewrite to validator fallback
- list rewrites can return raw HTML list markup instead of calm plain bullet lines
- rhetorical lead-in questions can still distort Answer Extractability behavior
- heading and pseudo-heading intent is still not being judged cleanly when support content delays the real answer

This track is diagnosis-grounded.

It is not speculative.

## Locked Product Decisions

- do not add an `Insert` button for Copilot variants inside the overlay editor
- keep Copilot copy-first for now
- do not start wrestling with selection-level insertion behavior
- retire `invented_numeric_claim` completely for verified evidence rewrites

## Locked Diagnosis

### 1. Web verification is firing, but validated rewrites can still be killed afterward

Live orchestrator telemetry on **March 31, 2026** showed:

- `rewrite_requested` for `external_authoritative_sources`
- `verification_intent: "verify_first"`
- `verification_status: "support_found"`
- `verification_provider: "duckduckgo_html"`

But the same run still ended with:

- `validator_pass: false`
- `fallback_used: true`
- `fallback_reason: "repair_contract_invented_numeric_claim"`

Conclusion:

- web verification is not the blocker here
- the validator still has enough authority to nullify good verified evidence rewrites

### 2. The validator is still fully active in Copilot rewrite generation

The active validation gate still runs in:

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js)

Specifically, the rewrite flow still:

- parses model variants
- runs `validateVariantsForTarget(...)`
- retries on failure
- falls back after repeated failure

Conclusion:

- validator was not actually retired
- it is still able to overrule model output after successful generation

### 3. List rewrite output currently permits raw HTML

The current list-mode prompt contract explicitly allows:

- list-form text
- or list HTML using `<ul>`, `<ol>`, `<li>`

The current overlay renderer then shows `variant.text` as literal text rather than rendering that HTML as a structured preview.

Conclusion:

- the raw HTML list output is not a random model drift
- it is allowed by the current backend output contract
- the current Copilot variant display then exposes it directly

### 4. Rhetorical-question suppression did not land as a hard behavior change

Prompt guidance now says:

- rhetorical hook questions should not be treated as strict question anchors

But the live analysis runs still showed:

- `anchor_v2_enabled: false`
- answer-extractability still framed around strict anchors

And the runtime check definition still says:

- `immediate_answer_placement` depends on a strict question anchor

Conclusion:

- the rhetoric-question improvement only landed as soft prompt guidance
- the hard runtime contract still leans heavily on strict-anchor logic
- live runs can therefore still behave like the old system

### 5. Heading and pseudo-heading intent is still a real blind spot

Current Answer Extractability behavior is mainly designed around:

- explicit question anchors
- early direct answers tied to those anchors

It is not yet cleanly designed around:

- heading promise
- pseudo-heading promise
- whether the first support content under that heading fulfills that promise quickly enough

This creates a real edge case for sections like:

- `What not to do to your resume`

Where the section may:

- clearly promise a list or direct answer
- then spend `100+` words warming up
- only surface the actual list later

Conclusion:

- this is not analyzer overload
- this is a missing section-intent rule
- it can be added cleanly if scoped to local heading support only

### 6. Insert-into-selection is technically possible, but not worth the risk right now

The overlay already has:

- active selection tracking
- active editable body state
- apply-to-editor block update paths

But selection-level insertion would introduce extra complexity around:

- inline selections
- list content
- block boundaries
- DOM stability inside the overlay

Conclusion:

- the feature is feasible
- it is not worth the product or implementation risk right now
- keeping Copilot as copy-only remains the better decision

## Repair Goal

Make Copilot more trustworthy in the following four ways:

- verified evidence rewrites should no longer be blocked by `invented_numeric_claim`
- list rewrites should return clean bullet lines instead of raw HTML list tags
- rhetorical questions should stop distorting Answer Extractability on explainer-style articles
- heading and pseudo-heading promise fulfillment should be judged locally, so delayed structured answers under list-style, table-style, and similar headings are surfaced correctly

## Scope Boundaries

### In scope

- validator authority reduction for verified evidence rewrites
- list-output contract cleanup
- rhetorical-question handling in answer-extractability checks
- heading and pseudo-heading intent extension for answer-placement style checks, including list, table, comparison, and similar structured-answer surfaces
- small targeted simulations or fixtures to prove the repaired behavior

### Out of scope for this track

- new Copilot insertion actions
- broad overlay editor UX redesign
- review rail redesign
- unrelated analyzer scoring changes
- broad validator retirement outside the specific failure classes named here

## Exact Files To Touch First

### Validator and rewrite contract

- [rewrite-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.js)
- [rewrite-handler.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/rewrite-handler.test.js)
- [fix-assist-contract-builder.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.js)
- [fix-assist-contract-builder.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/fix-assist-contract-builder.test.js)

### Copilot output formatting

- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [overlay-fix-assist-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js/overlay-fix-assist-regression.test.js)

### Answer Extractability and section-intent rules

- [checks-definitions-v1.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/shared/schemas/checks-definitions-v1.json)
- [prompt-manager.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/prompt-manager.js)
- [analyzer-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/prompts/analyzer-v1.txt)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [analysis-serializer.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.test.js)

## Live Evidence To Preserve

### Verified evidence rewrite still blocked by validator

For run:

- `cd069e88-808f-4bf9-92ab-e0fd596d859a`

CloudWatch confirmed on **March 31, 2026**:

- `verification_intent: "verify_first"`
- `verification_status: "support_found"`
- `verification_elapsed_ms: 1171`
- `verification_timeout_ms: 12000`
- `validator_pass: false`
- `fallback_reason: "repair_contract_invented_numeric_claim"`

### List rewrite passed validation but returned HTML-style structure

For the same run:

- `lists_tables_presence`
- `rewrite_operation: "convert_to_list"`
- `validator_pass: true`

And the surfaced variant looked like:

```html
<ul>
<li>Use a laptop to keep research material and documents in one place for easy access.</li>
<li>Use smartphone or tablet apps to organize and track notes and ideas.</li>
<li>Use online organizational tools to stay on top of the writing process.</li>
</ul>
```

Conclusion:

- generation worked
- validation passed
- output contract and rendering behavior are the real issue

### Live rhetorical-question behavior still ran with Anchor V2 off

Recent live analysis telemetry showed:

- `anchor_v2_enabled: false`

Conclusion:

- any rhetoric-question improvement that depends on Anchor V2 being active is not yet dependable on live runs

## Milestones

### Progress Snapshot

- `M1` completed on March 31, 2026
- `M2` completed on March 31, 2026
- `M3` completed on March 31, 2026
- `M4` completed on March 31, 2026
- `M5` completed on March 31, 2026
- `M6` completed on March 31, 2026
- `M7` completed on March 31, 2026

## M1. Verified Evidence Validator Retirement

### Goal

Remove `invented_numeric_claim` as a blocker for verified evidence rewrites.

### Required work

- identify every path where `invented_numeric_claim` can fail a verified evidence rewrite
- exempt verified evidence rewrites completely when:
  - `verification_intent` is `verify_first`
  - verification returned usable support
- keep telemetry explicit so the exemption is visible in logs

### Acceptance

- a verified evidence rewrite with `support_found` no longer falls back because of `invented_numeric_claim`

### Status

- completed on March 31, 2026
- `invented_numeric_claim` is now exempted when:
  - repair mode is `web_backed_evidence_assist`
  - `verification_intent` is `verify_first`
  - verification returns usable support
- validation metadata now surfaces `invented_numeric_claim_verified_evidence` as an explicit exemption for telemetry and response inspection
- focused proof passed:
  - `rewrite-handler.test.js` `36/36`

## M2. Validator Authority Narrowing For Evidence Rewrites

### Goal

Ensure verified evidence rewrites are guarded only by high-value safety checks.

### Required work

- keep protection for:
  - truly invented claims that cannot be justified by the verified support bundle
  - scope-breaking rewrites
  - malformed output
- remove low-value deterministic blocking for verified evidence rewrites
- preserve warning-level diagnostics without forcing fallback

### Acceptance

- verified evidence rewrites can complete with `validator_pass: true` unless a genuinely high-risk safety issue is present

### Status

- completed on March 31, 2026
- verified evidence rewrites now downgrade low-value deterministic failures into warning diagnostics for:
  - `structural_no_effect_rewrite`
  - `structural_output_too_thin`
- high-value safety failures still block:
  - scope-breaking span rewrites
  - malformed output contracts
- warning rules now surface in rewrite metadata and telemetry as:
  - `validation_warning_rules`
  - `validation_warning_count`
- focused proof passed:
  - `rewrite-handler.test.js` `39/39`

## M3. List Output Contract Cleanup

### Goal

Make list rewrites return clean normal bullet lines instead of raw HTML markup.

### Required work

- change the list rewrite contract to prefer plain bullet lines only
- stop instructing the model that HTML list tags are equally acceptable variant output
- keep editor-side conversion to real list markup internal when apply-to-editor is used later
- keep the visible Copilot variant card calm and readable

### Acceptance

- list-style variants display as normal bullet lines in the Copilot card
- raw `<ul>/<li>` strings no longer surface in normal Copilot variant text

### Status

- completed on March 31, 2026
- list-mode prompt and output contract now require plain bullet lines instead of HTML list tags
- parser normalization now converts stray `<ul>/<ol>/<li>` responses into clean bullet lines before validation and return
- overlay rendering and copy actions now normalize list-style variants defensively before display or clipboard copy
- focused proof passed:
  - `rewrite-handler.test.js` `41/41`
  - `overlay-fix-assist-regression.test.js` `12/12`

## M4. Rhetorical Question Hardening

### Goal

Make rhetorical lead-ins and self-assessment hooks stop behaving like real answer anchors.

### Required work

- move the rhetoric-question rule from prompt guidance into harder runtime/check-definition language
- ensure the analyzer can return `partial` instead of brittle direct-answer failure when no real strict anchor exists
- confirm the serializer stays editorial and calm when this branch is hit

### Acceptance

- explainer-style articles with rhetorical lead-ins stop producing false hard failures that behave like true Q&A misses

### Status

- completed on March 31, 2026
- answer-extractability check definitions now explicitly exclude:
  - rhetorical hook questions
  - self-assessment prompts
  - CTA-style questions
  - broad thematic lead-ins
  - topical headings treated as fake strict anchors
- analyzer prompt guidance now mirrors that harder contract and tells the model to return `partial` instead of forcing answer-distance, snippet, or alignment math from hook questions
- serializer guardrail scrubbing now catches rhetorical-hook style diagnostics and keeps the user-facing copy editorial and calm
- focused proof passed:
  - `analysis-serializer.test.js` `68/68`

## M5. Heading And Pseudo-Heading Intent Extension

### Goal

Teach the analyzer to judge whether the content directly below a heading or pseudo heading fulfills the heading’s promise quickly enough.

### Required work

- add a local section-intent rule for heading and pseudo-heading promise fulfillment
- inspect only bounded local context:
  - heading or pseudo heading
  - first answer paragraph
  - next support paragraph or visible list
  - stop at next heading or pseudo heading
- detect answer-intent or structured-surface headings whose real answer, list, table, or comparable support arrives too late

### Acceptance

- headings like `What not to do to your resume` can be flagged cleanly when the real list, table, or similar structured answer appears only after heavy setup

### Status

- completed on March 31, 2026
- answer-extractability check definitions now allow a bounded heading-intent fallback when no true strict question anchor exists
- that fallback is explicitly local:
  - heading or pseudo heading
  - first answer paragraph beneath it
  - next support paragraph, visible list, or visible table
  - stop at the next heading or pseudo heading
- `heading_topic_fulfillment` now uses the same bounded local-section rule so delayed list, table, comparison, or answer promises can be judged without scanning the whole article
- analyzer prompt guidance now tells the model to use heading or pseudo-heading intent only as a local cue, never as a replacement strict anchor
- a reusable delayed-list proof specimen now exists at:
  - [heading-intent-delayed-list-resume-donts.fixture.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/heading-intent-delayed-list-resume-donts.fixture.json)

## M6. Targeted Proof Runs

### Goal

Prove the repaired behavior with a very small number of targeted checks.

### Required work

- run only a small number of focused simulations or live checks
- include:
  - one verified evidence rewrite
  - one list conversion rewrite
  - one rhetorical-question specimen
  - one heading-intent delayed-list specimen

### Acceptance

- each specimen demonstrates the intended repaired behavior without needing a broad token-heavy simulation campaign

### Status

- completed on March 31, 2026
- verified evidence rewrite proof passed through the live gate at:
  - [external-authoritative-sources-epilepsy-source-gap.fixture.latest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/gate-reports/external-authoritative-sources-epilepsy-source-gap.fixture.latest.json)
  - result: `pass: true`, `transport_used: "lambda_invoke"`, `scorer_id: "external_authoritative_sources_gate"`
- heading-intent delayed-list proof passed through the live gate at:
  - [heading-intent-delayed-list-resume-donts.fixture.latest.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/gate-reports/heading-intent-delayed-list-resume-donts.fixture.latest.json)
  - result: `pass: true`, `transport_used: "lambda_invoke"`, `scorer_id: "heading_topic_fulfillment_gate"`
- rhetorical-question specimen proof passed through a focused local serializer run:
  - `analysis-serializer.test.js` filtered run passed `3/3`
- list conversion proof passed through the repaired current local code path:
  - focused `rewrite-handler.test.js` filtered run passed `5/5`
  - the repaired list fallback and scorer produced a passing structured-surface proof for:
    - [lists-tables-presence-dropshipping-mistakes.fixture.json](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/fixtures/copilot/lists-tables-presence-dropshipping-mistakes.fixture.json)
- direct local model generation remains blocked by the current AWS user policy:
  - `avi-sdk-user` is not authorized for `secretsmanager:GetSecretValue` on `AVI_MISTRAL_API_KEY`
  - because of that, live gate proofs that need current undeployed local model code were kept to the local code path instead of pretending the stale deployed lambda was enough

## M7. Release Packaging And Deploy

### Goal

Package and deploy this repair lane cleanly once the focused proofs pass.

### Required work

- package a fresh plugin ZIP if local plugin files changed
- deploy backend changes if orchestrator files changed
- verify runtime timestamps and release artifact naming

### Acceptance

- package and deploy complete with matching version markers and no stale artifact confusion

### Status

Completed on March 31, 2026.

Release evidence:

- plugin version bumped to `1.0.40` in `ai-visibility-inspector.php`, `readme.txt`, and `CHANGELOG.md`
- fresh plugin package built as `dist/ai-visibility-inspector-1.0.40.zip`
- packaged plugin header verified at `Version: 1.0.40`
- release package safety, deploy route drift, contract sync, rewrite handler, serializer, and overlay fix-assist regression tests passed in one focused release run (`132/132`)
- backend deployed through `infrastructure/deploy-rcl-7z.ps1` using the AiVI default AWS credential chain only
- live lambda timestamps after deploy:
  - `aivi-orchestrator-run-dev`: `2026-03-31T09:12:31.000+0000`
  - `aivi-analyzer-worker-dev`: `2026-03-31T09:12:40.000+0000`

## Immediate Non-Goals

- do not add an `Insert` action
- do not change Copilot from copy-first behavior
- do not broaden validator retirement beyond the scoped rewrite families in this track without a fresh diagnosis
