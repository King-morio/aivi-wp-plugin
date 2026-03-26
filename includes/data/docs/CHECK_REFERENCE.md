# AiVI Check Reference

This guide explains what a surfaced AiVI finding usually means and how to respond without needing to read internal scoring rules.

## How to Read AiVI Verdicts

AiVI uses three main verdict states:

- **Pass** - healthy enough that it should not be featured as a problem
- **Partial** - there is something useful in place, but the signal is still weaker than ideal
- **Fail** - the issue is strong enough to surface as a meaningful recommendation

Some findings are also more informational than urgent:

- they may provide context rather than a hard problem
- they may be document-level rather than tied to one sentence
- they should not be treated the same way as a strong fail

## What AiVI Checks

Most surfaced findings fall into a few simple buckets:

- **Opening answer and extractability** - whether the page answers the main question clearly and early enough to reuse
- **Structure and readability** - whether headings, paragraphs, and section flow are easy to scan
- **Schema and metadata** - whether visible content and markup tell the same story
- **Trust and support signals** - whether important claims look attributable, supported, and safe to reuse
- **Freshness and timing clarity** - whether timing-sensitive content is anchored clearly enough
- **Accessibility basics** - whether important basics such as alt text are missing

## How to Use a Finding

When reviewing results, this order usually works best:

1. Fix the strongest **fail** findings first.
2. Improve **partial** findings that affect the opening answer, headings, schema, or support for important claims.
3. Re-run analysis after meaningful changes instead of after every tiny edit.
4. Use jump and highlight tools when they are available, but remember that some findings are broader than one exact sentence.
5. Treat advisory or informational findings as guidance, not as proof that the page is broken.

## Common Patterns You Will See

### Opening answer too weak

AiVI may flag the opening when the page takes too long to answer the obvious question, or when the first answer is too vague to reuse cleanly.

Usually helps:

- answering the question earlier
- making the first answer more direct
- trimming filler before the main point

### Heading unsupported

AiVI may flag a heading when the section below it does not actually deliver on what the heading promises.

Usually helps:

- adding support under the heading
- renaming the heading to match the content
- merging thin sections that do not need to stand alone

### Schema does not match the visible page

AiVI may flag schema when the markup suggests one type of page but the visible content suggests another.

Usually helps:

- making sure the page is a real candidate for the schema you use
- aligning visible Q&A with FAQ schema only when the page truly reads like FAQ
- aligning visible steps with HowTo schema only when the page truly reads like a procedure

### Trust or evidence gap

AiVI may surface trust-related findings when important claims feel unsupported, unnamed, exaggerated, or too thinly sourced.

Usually helps:

- adding visible support near important claims
- naming the source more clearly
- toning down language that sounds inflated

### Timing is too vague

AiVI may flag timing when a claim depends on recency or change over time but does not show enough timing context.

Usually helps:

- adding a clear time anchor
- clarifying whether the claim is current, historical, or evergreen
- avoiding vague timing words when they do not help the reader

### Accessibility or metadata basics

AiVI may surface issues such as missing alt text or thin metadata even when the article itself reads well.

Usually helps:

- adding missing alt text to meaningful images
- checking title, description, canonical, and language basics
- treating these as important finishing steps before publication

## When a Result Feels Broader Than One Sentence

Some findings can feel "off" if you expect every result to point to one exact line.

That usually happens because:

- the issue is section-level or document-level
- the finding depends on visible structure, not just wording
- the content is only a weak candidate for a pattern such as FAQ or HowTo

So if a finding feels broader than one sentence, read it as guidance about the whole section or page shape, not only as a sentence edit request.

## Related Documents

- `USER_GUIDE.md`
- `TROUBLESHOOTING.md`
- `SUPPORT.md`

Use this guide when you want to understand what a finding means. Use the troubleshooting and support guides when you need help resolving a specific issue.
