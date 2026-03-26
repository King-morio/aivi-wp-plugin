# AiVI Decision Log (Frozen Archive)

This file captures historical product, runtime, and repository decisions that shaped earlier versions of the **AiVI - AI Visibility Inspector** plugin.

It exists so future work can understand **why** older choices were made, not as the active home for new check-spec or ownership decisions.

## How to Use This Log

- add decisions that materially change product behavior, contributor workflow, or release policy
- record the reason in plain language
- prefer stable product decisions over one-off implementation details
- update the related docs when a decision changes public behavior

## Frozen Status

This file is frozen for current check-design work.

New decisions about:
- check ownership
- deterministic vs semantic boundaries
- analyzer-load rules
- approved but not-yet-implemented check additions

must be recorded in:

- [CHECK_OWNERSHIP_CANONICAL.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/CHECK_OWNERSHIP_CANONICAL.md)

## Boundary For Check Decisions

Current check-ownership, deterministic-vs-semantic, analyzer-load, and approved check-spec decisions must be recorded in:

- [CHECK_OWNERSHIP_CANONICAL.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/CHECK_OWNERSHIP_CANONICAL.md)

Do not add new working decisions about check buckets, check ownership, or pending check specifications to this file.

This file should remain the archival log for stable product, repository, and release decisions.

## Decision 001 - Public Plugin Scope Stays Narrow

**Status:** Adopted

**Decision**

The public AiVI plugin repository should contain only what a WordPress user or contributor needs to:

- install the plugin
- understand the plugin
- build and package the plugin

Private operator systems, control-plane code, managed backend implementation, and internal billing/auth infrastructure do not belong in the public plugin repository.

**Why**

The plugin is public-facing, but the wider AiVI product includes internal systems that would add security, maintenance, and contributor-noise risk if they were published together.

**Effect**

The public repository stays focused on:

- plugin runtime code
- editor assets
- contributor-safe tests
- packaging helpers
- public documentation

## Decision 002 - Public Releases Publish from a Clean Snapshot

**Status:** Adopted

**Decision**

The public GitHub repository should be published from an allowlist-based snapshot, not from the full private repository history.

**Why**

Simply omitting files in a later commit is not enough if private history has already carried internal paths. A clean snapshot avoids accidental leakage of private repository lanes and keeps the public repo understandable.

**Effect**

AiVI now uses:

- `tools/public-repo-allowlist.json`
- `tools/export-public-repo-snapshot.ps1`

to build the public-safe repository surface before syncing to the public GitHub repo.

## Decision 003 - Latest Run Wins for UI, Artifacts Stay Retained

**Status:** Adopted

**Decision**

When a new analysis supersedes an older run for the same article, the UI should follow the newest run while older artifacts remain available for debugging and replay.

**Why**

Deleting artifacts inline would make debugging much harder. The real problem was stale UI state and old-run surfacing, not the existence of historical artifacts themselves.

**Effect**

- sidebar and overlay now stop treating superseded runs as current truth
- details/raw fetches reject superseded runs
- artifacts remain available during the retention window for replay and forensic analysis

## Decision 004 - Overlay Draft Restore Must Be Compatibility-Aware

**Status:** Adopted

**Decision**

Unsaved overlay drafts should restore only when they still match the current article context.

**Why**

Blindly restoring old overlay edits onto changed content creates a dangerous mismatch between what the user sees and what the analyzer is actually scoring.

**Effect**

Overlay draft compatibility now checks:

- `post_id`
- `run_id`
- analyzed content hash
- current editor-content signature
- overlay schema version

Incompatible drafts are cleared instead of restored.

## Decision 005 - Intro Extraction Is Structural, Not “First Few Paragraphs”

**Status:** Adopted

**Decision**

The intro should be defined as the content between the title/H1 and the first in-body `H2` or `H3`, not as an arbitrary first few paragraphs or first few words.

**Why**

The older heuristic could drift into the first real section and cause intro-family checks to flag content that did not actually belong to the opening.

**Effect**

- intro checks now stop at the first real section boundary
- immediate `H2` or `H3` after the title is treated as a missing or too-thin intro, not as an invitation to read deeper into body content

## Decision 006 - Intro Scoring Should Reflect Real Editorial Openings

**Status:** Adopted

**Decision**

Intro word-count scoring should use broader, more realistic editorial thresholds.

**Why**

The earlier bands were too narrow and over-penalized healthy openings that were longer than `60` words but still normal for real articles.

**Effect**

The current intro-length policy is:

- `40-150` = pass
- `20-39` and `151-200` = partial
- below `20` and above `200` = fail

## Decision 007 - Advisory Schema Signals Must Not Quietly Act Like Scored Defects

**Status:** Adopted

**Decision**

Advisory schema signals should remain advisory, and score-neutral deterministic states should not surface as visible content failures.

**Why**

Users should not lose trust because neutral or advisory schema checks are presented as if they were real article defects.

**Effect**

- `intro_schema_suggestion` no longer drags the scored intro composite
- neutral schema-alignment states stay suppressed from visible issue rails
- verification-unavailable internal-link states stay suppressed from visible issue rails

## Decision 008 - Answer-Family Guardrails Must Validate Against Local Question Context

**Status:** Adopted

**Decision**

Answer-family guardrails should validate snippets against the local question window, not against a broad global set of possible anchors.

**Why**

The broader guardrail was downgrading clearly valid answer findings to `partial` even when the answer was concise, direct, and correctly anchored in its local section.

**Effect**

- answer-family guardrails now use local section context
- valid answer snippets are less likely to be rewritten into false partials

## Decision 009 - Pass Checks Must Not Be Surfaced as Featured Issues

**Status:** Adopted

**Decision**

Checks that pass should not surface as issues, and pass verdicts should not carry user-facing explanatory prose that can later muddy diagnostics.

**Why**

When pass explanations survive into guardrail-adjusted flows, users can end up seeing confusing mixtures of pass-like reasoning and issue-like surfacing.

**Effect**

- pass findings keep `explanation` blank
- pass findings are not intentionally featured as visible issues
- diagnostics can still retain source verdict context internally when needed

## Decision 010 - Heading Fragmentation Means Over-Segmentation, Not Thin Support

**Status:** Adopted

**Decision**

`heading_fragmentation` should measure over-split outline behavior, not whether a section has “thin support.”

**Why**

Thin support is a separate editorial problem. Treating it as fragmentation created misleading explanations and pushed the rule into the wrong semantic territory.

**Effect**

The rule now focuses on top-level heading handoff behavior, especially when one `H2` branches immediately into another heading before any framing content appears.

## Decision 011 - HowTo and FAQ Scope Need Real Intent Signals

**Status:** Adopted

**Decision**

HowTo and FAQ schema candidacy should require meaningful intent signals rather than triggering from weak structural resemblance alone.

**Why**

Unordered bullet tips and a couple of compact Q/A blocks can appear in many normal explainers. Treating those patterns as automatic schema candidates created false positives and contradictory guidance.

**Effect**

- unordered bullet tips do not trigger HowTo by themselves
- non-HowTo titles need stronger procedural evidence
- two compact Q/A sections need explicit FAQ-style intent to trigger FAQ schema need
- unlabeled FAQ-style pages can still trigger when the signal is strong enough

## Decision 012 - Freshness Scope Requires Recency, Not Just Topic Vocabulary

**Status:** Adopted

**Decision**

Freshness-sensitive handling should be triggered by true recency cues, not by evergreen topical words alone.

**Why**

Words like `pricing`, `statistics`, or `trend` can appear in evergreen explainers. Treating them as freshness triggers created false positives on pages that did not make a recency-dependent promise.

**Effect**

Freshness now keys off:

- explicit recency phrasing
- recency-led article types such as news/newsarticle

Evergreen explainers without recency cues stay neutral.

## Decision 013 - Public-Facing Copy Must Avoid Internal Rollout Language

**Status:** Adopted

**Decision**

Public plugin copy, metadata, and documentation should avoid internal phase names, milestone language, and private planning references.

**Why**

Internal rollout vocabulary does not help public users or contributors understand the plugin. It makes the product feel less mature and leaks unnecessary internal context.

**Effect**

README, CONTRIBUTING, changelog language, settings copy, and other public-facing surfaces are being kept product-focused, contributor-friendly, and free of internal-only terminology.

## Decision 014 - Documentation Should Be Layered, Not Hidden in Track Notes

**Status:** Adopted

**Decision**

AiVI should maintain a stable documentation set for users and contributors, with track docs reserved for active work rather than as the long-term source of truth.

**Why**

Track docs are excellent for implementation discipline, but they are not a good long-term replacement for stable documentation.

**Effect**

AiVI now maintains dedicated public docs for:

- user guidance
- check reference
- troubleshooting
- privacy
- terms
- support
- development
- architecture
- operations

Track docs remain useful, but they no longer need to carry the full burden of product memory.

## Decision 015 - Primary Article Schema Needs Its Own Presence Check

**Status:** Adopted

**Decision**

AiVI should add a deterministic check named `article_jsonld_presence_and_completeness` so article-like pages are evaluated for primary article schema presence and completeness, not just JSON-LD syntax validity.

**Why**

`valid_jsonld_schema` answers only whether JSON-LD is syntactically valid. It does not answer whether an article page actually has a primary `Article`, `BlogPosting`, or `NewsArticle` schema that answer engines and crawlers can use as the main machine-readable page representation.

**Effect**

- AiVI will treat `article_jsonld_presence_and_completeness` as a deterministic schema check
- `valid_jsonld_schema` remains syntax-only
- detailed trigger, field, and verdict spec for this check now lives in [CHECK_OWNERSHIP_CANONICAL.md](/c:/Users/Administrator/Studio/aivi/wp-content/plugins/AiVI-WP-Plugin/docs/CHECK_OWNERSHIP_CANONICAL.md)
