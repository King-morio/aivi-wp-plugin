# Temporal And Overlay Apply Clarity Track

## Goal
- tighten `temporal_claim_check` so locally anchored interval guidance does not get misread as an article-date problem
- make overlay article edits feel obvious and trustworthy by turning `Apply Changes` into the clear commit step into the WordPress editor

## Guardrails
- keep freshness/date pressure in the freshness layer instead of pushing article-date requirements into every temporal sentence
- do not weaken true recency-sensitive claims such as `currently`, `today`, `latest`, or `recently`
- preserve existing `node_ref` anchoring and supported block targeting while the apply model is simplified
- keep rich/read-only blocks visible and untouched unless they are explicitly supported

## Milestones

### M1 - Temporal Claim Tightening
- teach the semantic analyzer that locally anchored intervals can pass without an article publish/update date:
  - `after 48 hours`
  - `within 2 weeks`
  - `for the first 7 days`
- add one compact prompt pass example and one non-trigger rule for this pattern
- add a worker-side veto so `temporal_claim_check` does not fail only because a publication/update date is missing when the sentence already carries clear local timing
- lock the behavior with focused prompt and worker regressions

Write set:
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt)
- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js)
- [prompt-sync.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/diagnostics/prompt-sync.test.js)
- [worker-regression.test.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/worker-regression.test.js)
- this track doc

### M2 - Authoritative Overlay Apply
- keep direct article-body edits local inside the overlay until `Apply Changes`
- make `Apply Changes` the single obvious commit point into Gutenberg/editor state for supported blocks
- remove the hidden live-mirroring feel from input/blur-driven article edits
- keep schema insert behavior aligned with the same editor-state truth

Write set:
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- related overlay JS tests
- this track doc

### M3 - Post-Apply Reveal And Review Feedback
- after apply, make the result obvious in the WordPress editor:
  - reveal the applied location
  - scroll to the first changed block
  - briefly highlight changed blocks
- keep the publish step explicit:
  - `review in editor`
  - then `Update` or `Publish`
- refine overlay messaging so first-time users understand the flow without guessing

Write set:
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- [aivi-overlay-editor.css](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/css/aivi-overlay-editor.css)
- related overlay JS tests
- this track doc

### M4 - Focused Acceptance Sweep
- run the focused temporal and overlay regression chain
- verify no anchor drift, no rich-block mutation drift, and no publish-flow ambiguity regressions
- record the closeout in this track

Write set:
- focused tests only
- this track doc

## Status
- [x] M1 - Temporal Claim Tightening
- [x] M2 - Authoritative Overlay Apply
- [x] M3 - Post-Apply Reveal And Review Feedback
- [x] M4 - Focused Acceptance Sweep

## M1 Outcome
- `temporal_claim_check` is now taught and guarded against one specific false-positive shape:
  - locally anchored interval guidance such as `after 48 hours`, `within 2 weeks`, or `for the first 7 days`
- the worker now vetoes temporal failures that only complain about a missing publication/update date when the sentence already carries clear local timing and does not rely on currentness language
- the prompt now includes:
  - one compact non-trigger rule
  - one compact pass example for this interval pattern
- focused regressions now lock both the prompt wording and the worker-side veto path

## M2 Outcome
- direct article-body edits inside the overlay now stay local until `Apply Changes`
- the hidden input/blur-driven mirroring path into Gutenberg was removed for supported article blocks
- `Apply Changes` is now the single obvious commit point that flushes supported overlay edits into the WordPress editor state
- formatting commands inside the overlay now stay local too:
  - they change the overlay body immediately
  - they do not silently write into Gutenberg until apply
- persistence copy is now clearer in both places:
  - the rail note
  - the apply confirmation dialog
- draft capture/restore still works with the new local-first edit model

Validation:
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- --runInBand tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-schema-assist.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js tests/js/overlay-rich-block-fidelity-regression.test.js tests/js/overlay-redesign-regression.test.js tests/js/overlay-draft-compatibility-regression.test.js`

## M3 Outcome
- after a clean apply, AiVI now closes the overlay and immediately reveals the changed Gutenberg location in the WordPress editor
- the first changed block is selected, scrolled into view, and given a brief visual flash so the user can review exactly where the edit landed
- the success state now uses a WordPress snackbar message that explicitly tells the user to review in the editor and then click `Update` or `Publish`
- the reveal cleanup stays transient, so the editor is guided without leaving a persistent visual artifact behind

Validation:
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- --runInBand tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-redesign-regression.test.js tests/js/overlay-rich-block-fidelity-regression.test.js tests/js/overlay-schema-assist.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js tests/js/overlay-draft-compatibility-regression.test.js`

## M4 Outcome
- the focused temporal and overlay acceptance sweep passed end to end
- the combined sweep covered:
  - temporal prompt teaching
  - worker temporal veto behavior
  - local-first overlay apply behavior
  - post-apply Gutenberg reveal/highlight
  - rich-block fidelity
  - schema assist compatibility
  - rewrite/apply safety
  - draft compatibility
- no extra runtime changes were needed in M4 itself beyond closing the track

Validation:
- `npm test -- --runInBand tests/diagnostics/prompt-sync.test.js infrastructure/lambda/worker/worker-regression.test.js tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-redesign-regression.test.js tests/js/overlay-rich-block-fidelity-regression.test.js tests/js/overlay-schema-assist.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js tests/js/overlay-draft-compatibility-regression.test.js`

Acceptance note:
- Jest also exercised the staged public-mirror overlay suites under `dist/public-repo/_stage/...` during this run, and they passed too.
