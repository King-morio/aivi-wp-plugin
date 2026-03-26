# UX/UI Decisions Board

Last updated: 2026-03-25

## Purpose

This file records active UX/UI decisions for AiVI so design-direction choices stay consistent during implementation.

It is meant to capture:
- public-facing labels and tone choices
- placement decisions for new UI signals
- scope boundaries that prevent clutter or aura drift

## Decision 001 - Review Rail Uses Impact Tiers, Not Confidence Scores

**Status:** Adopted

**Decision**

AiVI should not surface raw confidence scores on the review rail.

Instead, surfaced issues should use public-facing impact tiers that help the user decide what deserves action first.

**Why**

Users mainly need to know how much a finding matters if ignored, not how statistically confident the system is.

A visible confidence label could weaken trust by making the plugin feel like it is second-guessing itself.

**Effect**

- internal confidence can still exist as a private ranking or governance signal
- the public rail should speak in action-oriented editorial language
- the visible rail should help users triage, not decode model certainty

## Decision 002 - Impact Tiers Use Friendly Editorial Labels

**Status:** Adopted

**Decision**

The review rail should use these public-facing impact labels:

- `High impact`
- `Recommended`
- `Polish`

**Why**

This set fits AiVI's existing tone better than more mechanical labels such as `Core`, `Priority`, or explicit confidence percentages.

It keeps the product:
- supportive
- premium
- editorial
- calm rather than alarmist

**Placement**

- show the impact pill at the far end of the review-row header
- keep it on the same line as the check name when space allows
- keep instance counts visually secondary to the impact pill

**Scope**

- show the impact pill only for surfaced non-pass issues
- do not show it for pass states
- use compact pill styling, not large status banners

## Decision 003 - Global Score Gets The First Quality Pill

**Status:** Adopted

**Decision**

AiVI should add a single quality pill to the global score card before extending score-quality pills to the AEO and GEO circles.

**Why**

The global score is the user's primary summary signal.

Adding one quality pill there improves readability without crowding the score area or making the UI feel dashboard-heavy.

Adding pills to the global score, AEO circle, and GEO circle all at once would be more visually busy and could slightly dilute AiVI's current clean feel.

**Placement**

- place the global quality pill inside the hero score card
- center it above the `Last run` text
- keep it below the `AEO / GEO` mini row

This keeps the new signal close to the main score without interrupting the large score number itself.

## Decision 004 - AEO And GEO Stay Numeric-First For Now

**Status:** Adopted

**Decision**

The AEO and GEO score circles should remain numeric-first in the initial rollout.

Do not add quality pills to both circles in the first pass.

**Why**

The AEO and GEO circles already act as secondary diagnostic signals beneath the global score.

Keeping them visually lighter preserves:
- hierarchy
- scan speed
- focus on the primary global score

**Future Option**

If later testing shows users still need more interpretation at the AEO and GEO level, AiVI can add very small quality pills beneath each circle label in a later pass.

That should be treated as a separate design decision, not bundled into the first rollout.

## Decision 005 - Score Quality Labels Should Feel Supportive, Not Clinical

**Status:** Adopted

**Decision**

The first score-quality tier set to trial on the global score card should use friendly qualitative labels such as:

- `Fair`
- `Good`
- `Excellent`

If lower-score coverage needs a clearer floor later, a fourth lower tier can be added deliberately rather than forcing a harsh label into the first pass.

**Why**

AiVI should feel like a strong guide, not a grading machine.

Short, calm qualitative labels keep the score card easy to read while preserving the product's aura.

## Decision 006 - Option A Is The Approved First Rollout

**Status:** Adopted

**Decision**

The approved direction for the first impact-pill and score-pill rollout is `Option A - Calm Editorial`.

**Why**

It is the closest match to AiVI's current product feel:

- calm
- guided
- premium
- informative without looking overdesigned

It also introduces the new signals without making the sidebar feel crowded or more dashboard-like than it needs to be.

**Effect**

- the review rail gets compact impact pills
- the global hero score gets one quality pill
- the rest of the score area stays visually restrained

## Decision 007 - AEO And GEO Rings May Use Banded Score Colors

**Status:** Adopted

**Decision**

The AEO and GEO score rings may change color by score band in the first rollout, as long as the color logic stays simple and percentage-based.

**Why**

Right now the ring stroke color stays pleasant even when a score is extremely low, which can make weak category performance look healthier than it is.

Banded score colors make the circles more truthful at a glance without forcing extra pills or extra copy into the score area.

**Rule**

Use percentage bands, not raw score values, so AEO and GEO stay comparable despite different maximums.

Suggested band model:

- `0-24%` = red
- `25-49%` = amber
- `50-74%` = green
- `75-100%` = teal

**Boundary**

- keep the background track neutral
- change only the active score stroke color
- do not add animated gradients or multi-color arcs

## Decision 008 - Settings CTAs Must Land On The Real Destination

**Status:** Adopted

**Decision**

Any internal hyperlink or CTA inside AiVI Settings must land directly on the correct tab, panel, or documentation entry.

AiVI should not send users through an intermediate section that then asks them to click again.

**Why**

The current `Choose your plan` spotlight CTA in Overview uses a raw in-panel fragment instead of a tab-aware destination. That makes the user bounce inside the wrong tab instead of landing on Plans where the plan grid actually lives.

This creates unnecessary back-and-forth and slightly weakens trust in the settings UX.

**Effect**

- the spotlight CTA should open the `Plans` tab and land at the plan grid directly
- internal settings links should use the existing tab-state routing model rather than raw cross-tab fragment links
- support and documentation context links should continue using deep links that resolve to the right support category or documentation article

**Audit Note**

Current read:

- settings tab buttons are already routed correctly through tab-state URLs and JS activation
- support-category links are already routed correctly
- documentation entry links are already routed correctly
- the clearly broken case is the raw `#aivi-settings-plan-grid` spotlight CTA from Overview

## Implementation Note

When this work is implemented:

- the review rail should gain issue-level impact pills
- the global hero score should gain one quality pill
- the approved visual direction should follow `Option A - Calm Editorial`
- AEO and GEO rings may adopt simple percentage-band stroke colors
- settings CTAs should be cleaned so internal jumps land directly on the target tab or section
- the first rollout should avoid adding too many simultaneous pills to the score area
- any private confidence or weighting logic should remain internal unless a later UX decision explicitly changes that
