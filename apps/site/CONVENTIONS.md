# Documentation conventions for `apps/site`

This is the public product documentation, not the design documentation in `docs/` (which has its own
[CONVENTIONS.md](../../docs/CONVENTIONS.md) for internal decisions). These conventions are for pages read by an
engineer bringing AQVEN into their work and by an LLM agent reading them in fragments. The structural decision
is [2026-09-21-aqven-docs-ia-design.md](../../docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md).

**Published pages in `apps/site/src/content/docs/` are always in English.** Below is why and how.

## Language of a published page

- Plain English. Short sentences, ordinary words, no nested clauses for their own sake. The reader is an
  engineer for whom English is not necessarily a first language; complex vocabulary and long constructions
  are a barrier, not a sign of expertise.
- Identifiers, command and tool names, schema fields and code stay exactly as in the code, untranslated.
- No comments in code examples: names explain themselves (a project rule that applies here too).
- A fact appears once, in one place. Other pages link to it instead of repeating it.

## Write for the persona, not for yourself

The reader was not in this conversation, has not read the ADRs, has not seen
`docs/research/site-ia-feature-inventory.md` and does not know our internal class names. They are the engineer
(AI, backend, staff or technical founder) from `docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md` §1:
they already write code, call models, run into unpredictable behavior of an AI pipeline in production, and
cannot explain to colleagues why something broke.

In practice:

- **No links to ADRs, ADR numbers, `docs/adr/*`, `docs/research/*` or `file:line` in the text of a published
  page.** Those links are the author's working tool: they check a fact before writing it. Once the author has
  checked, the citation disappears and only the fact remains, in plain words.
- **Internal class and module names stay out of the prose** (`OutcomeGateModel`, `WrapperModel`,
  `CassetteModel` and so on). Describe only the behavior they give the reader: "every model call either
  succeeds, is refused, or gets cut off, and AQVEN tells you which", not "passes through a chain of five
  wrappers".
- **The vocabulary is the persona's, not ours.** Write in terms like "trace", "reproduce", "root cause",
  "regression", "reliable" and "workflow", the same ones as in the persona's core pains and desired gains, not
  in terms of AQVEN's internal implementation.
- The "under the hood" line is the exception: it is the only place that names a real third-party library
  (Pydantic AI, DBOS and so on), because that is part of the persona's vocabulary too. An engineer asks "what is
  this built on" in their own words, and the answer should name things directly.

## A page stands on its own

A page is a retrieval unit for an LLM agent, not a chapter of a book. It does not rely on what "was said above"
on a neighboring page. If a fact is needed to understand the page, give either a short quote with a link, or a
link in the first line of the section, but never "as discussed earlier".

## The truth about what actually works

A page describes what the code in `packages/aqven/` confirms, not the design intent in `docs/adr/`. If a feature
is designed but not implemented (for example trace export to Langfuse, or placeholder CLI commands), the page is
not written at all, rather than written as "how it will work". The author checks the fact against
`docs/research/site-ia-feature-inventory.md` **before** writing, not after; the link to the inventory itself
never appears on a published page (see "Write for the persona" above).

## Heading template by page type (Diátaxis)

The headings themselves are in English: they are part of the published page.

Starlight renders the `<h1>` itself from the frontmatter `title`. A page does not write `# <Title>` in its body,
or the heading appears twice (checked on a real build). The body starts with the first `##`.

### Tutorial (H1 is an action, for example "Quickstart"; it is the frontmatter `title`, not a line in the body)

```
## What you'll have at the end
## Before you start
## 1. <First action>
## 2. <Second action>
...
## What's next
```

The steps are a linear sequence, with no "if your case is A" branches: one path from start to result. If a step
contains a "did it work" check, it is a `### Check` inside that step.

### How-to (H1 is a task, for example "How to connect an external MCP server"; the frontmatter `title` has the
form "How to <task>", not a line in the body)

```
## When you need this
## Steps
### Example
## Under the hood            (only when a specific third-party library is behind it; see below)
## See also
```

`## When you need this` is 1 to 3 sentences, not a paragraph of background. `### Example` is a runnable fragment,
by default built on the showcase flow (`aqven new`, then `support_case`), not on made-up data.

### Explanation or concept (H1 is a statement or a question, for example "What happens when you call a model";
the frontmatter `title`, not a line in the body)

```
## In short
## <Sections about the substance, with English headings>
## How this shapes what you do
## See also
```

`## In short` is 2 to 3 sentences that answer right away, before the details: an agent that retrieves only this
block should get a working answer. `## How this shapes what you do` is required: a concept does not hang on its
own, it explains what it changes in the how-tos.

### Reference

Not written by hand: `tools/generate_reference.py` generates it from the code (already in English, like the rest
of the generator's output). The conventions in this document do not apply to generated pages, except for the
`## Under the hood` heading when the generator adds it to a provider or node page.

## The "Under the hood" rule

An `## Under the hood` subsection lives only on a page where AQVEN really wraps a specific third-party library
(Pydantic AI, DBOS, the `mcp` SDK, FastAPI, python-liquid, model providers). Two lines in plain language: what we
take as is, and what AQVEN adds on top. The full table is not here but on the anchor page "What this is built on"
(Concepts); the subsection links to it instead of repeating it.

## Example density

- A tutorial is an example itself; no separate rule is needed.
- A how-to has at least one runnable fragment per page. The default source is the showcase flow; if the task is
  not covered by the showcase, a separate minimal snippet that also runs, not pseudocode.
- A concept page has at least one example that illustrates a fact, but the example is not the structure of the
  page: the explanation stays an explanation, and the example confirms it rather than replacing it.
- Reference pages get no hand-written examples; if the generator does not provide one, the page points to the
  relevant how-to.

## `llms.txt`

`scripts/generate_llms.mjs` generates `llms.txt` and `llms-full.txt` from the actual tree of pages; the
conventions in this file do not change them. The order of pages in `llms.txt` follows
[2026-09-21-aqven-docs-ia-design.md §4](../../docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md): start,
then the surface the reader chose, then the concepts for the task at hand.
