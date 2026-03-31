# AiVI Copilot Issue Packet Contract

## Purpose

This document defines the minimal issue packet that `AiVI Copilot` may consume.

It exists to keep `AiVI Analyzer` and `AiVI Copilot` cleanly separated.

Short form:

- `Analyzer diagnoses`
- `Copilot repairs`

## Packet Name

- `copilot_issue`

## Copilot Packet Rules

- one packet represents one selected flagged issue
- the packet is issue-scoped, not article-analysis-scoped
- the packet may carry local section context
- the packet must not carry conversational analyzer prose intended to be displayed as Copilot thought

## Required Fields

- `issue_key`
  - stable local issue identity
- `check_id`
  - canonical check identifier
- `check_name`
  - human-readable issue name
- `analyzer_note`
  - short analyzer-authored note about what is wrong
- `instance_index`
  - selected issue instance index
- `section_text`
  - local section text Copilot may work within

## Optional Fields

- `node_ref`
- `target_mode`
- `target_operation`
- `target_node_refs`
- `heading_chain`
- `surrounding_nodes`
- `section_range`
- `section_nodes`
- `snippet`
- `failure_reason`
- `category_id`
- `verdict`
- `post_context`
- `selected_issue`

## `selected_issue` Shape

If present, it should contain only:

- `check_id`
- `check_name`
- `instance_index`
- `analyzer_note`

## Allowed Analyzer Inputs

These may enter the Copilot packet because they help define the repair task:

- selected issue identity
- short analyzer note
- local excerpt/snippet
- local section bounds
- heading chain
- nearby nodes

## Disallowed Analyzer Inputs

These should not be used as Copilot voice or conversational payload:

- `review_summary`
- `issue_explanation`
- `explanation_pack`
- serializer-authored helper prose
- Analyzer UI labels intended for `View details`

## Hint-Only Fields

These may still travel separately, but they are not the authority:

- `rewrite_target`
- `signature`
- `node_ref`
- `text_quote_selector`

Copilot should treat them as locator hints only.

## Authority Order

1. selected Review Rail issue
2. `copilot_issue`
3. live local section context
4. analyzer anchor metadata as optional hints

## Non-Goals

- the packet does not let Copilot re-analyze the article
- the packet does not replace Analyzer explanation surfaces
- the packet does not justify changing `View details` or other working Analyzer UI
