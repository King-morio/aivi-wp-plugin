# Overlay Apply, Extractability, And Post-Body Images Track

## Goal
- make AiVI overlay edits apply safely and visibly in both Gutenberg and Classic editors
- eliminate the current block-loss / word-count-collapse risk after `Apply Changes`
- tighten `Answer Extractability` explanations so they stay anchored, sane, and non-templated
- keep image and alt-text scope limited to post-body content only while preserving post-body images in analysis and overlay rendering

## Confirmed Problems
- overlay edits can appear to apply, but the WordPress editor can lose later blocks after `Apply Changes`
- current symptom from live testing:
  - article started at `706` words
  - after apply, the editor dropped to `414` words
  - WordPress undo restored the missing content
- overlay apply currently relies heavily on Gutenberg store APIs and needs explicit compatibility hardening for both:
  - Gutenberg
  - Classic editor / TinyMCE / textarea flows
- `answer_sentence_concise` can fall back to off-target explanation text that does not match the anchored sentence it is describing
- question-like paragraph headings are already partly recognized, but the explanation/reasoning layer still needs tightening so badly formatted headings do not degrade answer-family judgments
- post-body images are not consistently preserved end to end in:
  - analysis-time visibility
  - overlay rendering
  - post-body missing-alt detection visibility

## Approved Decisions
- image / alt-text scope stays limited to post-body content only
- do not expand this track to featured images, theme-rendered media, or other non-body surfaces
- do not favor Gutenberg at the expense of Classic editor support
- if apply integrity is uncertain, fail closed instead of partially overwriting article content

## Guardrails
- preserve `node_ref` anchoring stability while patching apply behavior
- never silently truncate, collapse, or overwrite later content blocks during apply
- keep rich blocks visible in the overlay even when they remain read-only
- do not trust semantic word-count claims unless they are plausible against the anchored snippet
- keep answer-family question-anchor logic compatible with question-like paragraph headings and heading-like sections
- fix post-body image visibility without widening analysis scope beyond article body content

## Milestones

### M1 - Overlay Apply Integrity Diagnosis And Safety Contract
- isolate the exact overwrite/truncation path that causes later blocks to disappear after `Apply Changes`
- inspect both editor paths:
  - Gutenberg block-editor store flow
  - Classic editor / TinyMCE / textarea flow
- decide the safe commit contract:
  - what counts as success
  - what counts as failed verification
  - when AiVI must refuse to apply instead of risking data loss
- add focused regression coverage for the word-count-collapse symptom

Write set:
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- focused overlay JS tests in [tests/js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/tests/js)
- this track doc

### M2 - Cross-Editor Apply Fix
- harden Gutenberg apply so supported block edits commit deterministically and verify against edited editor state
- harden Classic apply so textarea / TinyMCE content updates verify cleanly before AiVI treats them as committed
- remove or replace any apply path that can overwrite the editor with an incomplete snapshot
- make post-apply feedback editor-mode aware without changing the user-facing simplicity

Write set:
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- related overlay JS tests
- this track doc

### M3 - Answer Extractability Explanation Hardening
- stop `answer_sentence_concise` from surfacing implausible threshold math or templated rationales that do not match the anchored snippet
- add a sanity filter so explanation text is checked against the actual anchored sentence before release
- keep support for question-like paragraph headings / heading-like sections in answer-family evaluation
- add one compact prompt or runtime refinement only where needed, without bloating the semantic prompt

Write set:
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/analysis-serializer.js)
- [analysis-serializer.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/analysis-serializer.js)
- [index.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/index.js) if runtime guardrails are needed
- [analysis-system-v1.txt](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/prompts/analysis-system-v1.txt) only if the prompt needs one compact refinement
- related worker / serializer tests
- this track doc

### M4 - Post-Body Image Fidelity And Missing-Alt Visibility
- trace post-body image handling end to end from WordPress extraction through analysis and overlay rendering
- preserve post-body image blocks in analysis/block inventory even when they have little or no text
- keep overlay rendering faithful for post-body images while respecting read-only safety
- ensure post-body missing-alt detection can still surface when the image actually exists in article-body content

Write set:
- [class-rest-preflight.php](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/includes/class-rest-preflight.php)
- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/orchestrator/preflight-handler.js)
- [preflight-handler.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/infrastructure/lambda/worker/preflight-handler.js)
- [aivi-overlay-editor.js](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/assets/js/aivi-overlay-editor.js)
- related tests
- this track doc

### M5 - Acceptance Sweep
- run the focused regression chain for:
  - Gutenberg apply integrity
  - Classic apply integrity
  - no block-loss / no word-count-collapse behavior
  - extractability explanation sanity
  - question-like paragraph heading compatibility
  - post-body image visibility and missing-alt detection
- close the track only after the combined sweep is green

Write set:
- focused tests only
- this track doc

## Status
- [x] M1 - Overlay Apply Integrity Diagnosis And Safety Contract
- [x] M2 - Cross-Editor Apply Fix
- [x] M3 - Answer Extractability Explanation Hardening
- [x] M4 - Post-Body Image Fidelity And Missing-Alt Visibility
- [x] M5 - Acceptance Sweep

## M1 Outcome
- the confirmed high-risk path is now isolated:
  - server-generated `highlighted_html` can no longer act as an editable apply source when AiVI does not have verified canonical editor content
- AiVI now classifies the editor runtime before deciding whether apply is safe:
  - `block_editor_blocks`
  - `classic_editor_html`
  - preview-only / blocked states
- when the block editor canvas exists but block data is not safely available yet, apply now fails closed instead of attempting a lossy fallback overwrite
- server preview rendering is now forced read-only in that unsafe state
- focused regression coverage now locks the new safety contract so fallback preview cannot silently drift back into an editable apply path

Validation:
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- --runInBand tests/js/overlay-apply-integrity-regression.test.js tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js`

## M2 Outcome
- Gutenberg apply now verifies the target block after dispatch before AiVI reports success
- Classic apply now verifies the edited editor state before AiVI reports success:
  - `core/editor` edited post content
  - textarea content
  - TinyMCE content
- `readEditorPost()` now prefers edited post content over stale current-post content when WordPress exposes it
- AiVI no longer treats a dispatch call alone as proof that content actually landed in the editor
- this gives both editor paths the same core contract:
  - apply
  - re-read
  - only then report success

Validation:
- `node --check assets/js/aivi-overlay-editor.js`
- `npm test -- --runInBand tests/js/overlay-apply-integrity-regression.test.js tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js tests/js/overlay-draft-compatibility-regression.test.js`

## M3 Outcome
- both serializer mirrors now validate `answer_sentence_concise` explanation math against the actual anchored snippet before releasing it to users
- implausible threshold claims like:
  - `22 words over the ideal 60-word threshold`
  - or other large claimed word-count mismatches against the anchored snippet
  now fall back to a calmer reusable-snippet explanation instead of leaking impossible math
- the anchored snippet is now passed into serializer explanation context directly, so sanity checks can work off the real surfaced content
- question-like paragraph heading compatibility remained intact; no prompt or worker-governance patch was needed for this milestone

Validation:
- `node --check infrastructure/lambda/orchestrator/analysis-serializer.js`
- `node --check infrastructure/lambda/worker/analysis-serializer.js`
- `npm test -- --runInBand infrastructure/lambda/orchestrator/analysis-serializer.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js`

## M4 Outcome
- PHP preflight now preserves textless post-body image blocks in `block_map` instead of dropping them when they have no visible text
- classic/body image handling is widened just enough to keep post-body images visible in:
  - top-level `img`
  - `figure`
  - image-only wrapper blocks that would otherwise look empty
- preserved image blocks now carry stable media metadata such as:
  - `image_src`
  - `image_alt`
  - `image_caption`
  - `image_label`
- deterministic missing-alt anchoring now matches those preserved image blocks directly instead of relying only on nearby paragraph text
- server-preview `highlighted_html` now renders preserved image blocks as real `<img>` previews instead of collapsing them into plain text-only fallback labels
- image/alt scope stayed limited to post-body content only; no featured-image or theme-surface widening was introduced

Validation:
- `node --check infrastructure/lambda/orchestrator/preflight-handler.js`
- `node --check infrastructure/lambda/worker/preflight-handler.js`
- `php -l includes/class-rest-preflight.php`
- `npm test -- --runInBand infrastructure/lambda/orchestrator/preflight-handler.test.js infrastructure/lambda/worker/preflight-handler.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js`

## M5 Outcome
- the focused acceptance chain passed end to end across the full track surface:
  - Gutenberg / Classic overlay apply integrity
  - no preview-only fallback apply path
  - extractability explanation sanity
  - question-like paragraph heading compatibility
  - post-body image visibility and direct missing-alt anchoring
- no extra runtime patching was needed in `M5`; the milestone closed on validation
- Jest also ran the staged public-mirror overlay suites under `dist/public-repo/_stage/...` during the same sweep, and they passed too

Validation:
- `npm test -- --runInBand tests/js/overlay-apply-integrity-regression.test.js tests/js/overlay-apply-safety-regression.test.js tests/js/overlay-rewrite-apply-modes-regression.test.js tests/js/overlay-draft-compatibility-regression.test.js tests/js/overlay-rich-block-fidelity-regression.test.js infrastructure/lambda/orchestrator/analysis-serializer.test.js infrastructure/lambda/worker/analysis-serializer.worker.test.js infrastructure/lambda/orchestrator/preflight-handler.test.js infrastructure/lambda/worker/preflight-handler.test.js`
- result:
  - `11` suites passed
  - `227` tests passed
