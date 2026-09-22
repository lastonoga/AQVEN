---
title: Files as source of truth
description: A workflow project is a tree of files on disk — a node is a folder, and identity is a path, not a stored id.
---

## In short

An AQVEN project is a plain file tree, and that tree is the only copy of the truth. A node is a
*folder* holding all the files for that one step, and a node's identity is its own path, not a field
written inside it — nothing in the project has an `id` key. There's no separate database rebuilt from
these files: the server reads the tree straight off disk whenever it needs to know the current state
of the project.

## A node is a folder, not a file

`flows/<flow_id>/nodes/<node_id>/` is a directory, and everything that belongs to one node lives inside
it as sibling files sharing the node's stem: the node's own spec (`<node_id>.node.yaml`), and — for an
`llm` node — its call contract (`<node_id>.inference.yaml`) and its prompt (`<node_id>.prompt.md`) right
next to it. A prompt is never a string embedded in YAML; it's always its own file.

A flow's identity is its folder name under `flows/`. A node's identity is its filename up to the first
dot. Neither is stored as a field anywhere — you won't find an `id` key on a flow spec or a node spec.
Rename the folder or the file, and you've renamed the thing.

## Nested nodes sit flat, not nested

A parallel branch, a loop body, or a map body is still a node — but it doesn't get its own subfolder one
level deeper. It sits flat inside its parent node's folder, and its id is qualified as
`parent__child`. A folder one level deep never turns into two levels just because the node inside it
has children.

Here's the real `decide/` folder from `judge_panel`, a small complete flow in the [showcase](/start/quickstart/) project. It's
one parent node, `decide`, with one nested child, `tie_break`, that itself uses a full `llm` file set:

```
flows/judge_panel/nodes/decide/
  decide.node.yaml
  tie_break.node.yaml
  tie_break.inference.yaml
  tie_break.prompt.md
```

`tie_break.node.yaml`, `tie_break.inference.yaml`, and `tie_break.prompt.md` sit beside
`decide.node.yaml`, in the same `decide/` folder — not in a `decide/nodes/` folder of their own. The
child's full id is `judge_panel.decide__tie_break`, and it's complete with its own inference contract
and prompt file — a full `llm` node's file set, just nested.

The same rule holds when a node has several nested children instead of one: `judge_panel` also has a
`judges` node with three nested siblings sitting flat beside it in the same `judges/` folder —
`judges__deepseek`, `judges__llama`, and `judges__qwen`.

## What's actually on disk

A project's real top-level layout is `agents/`, `code/`, `datasets/`, `evals/`, `flows/`, `fragments/`,
`mcp/`, `samples/`, `tools/`, and `types/`, alongside the project's own `aqven.yaml` and an
`.env`/`.env.example` pair for secrets. Shared prompt text that more than one prompt file wants to reuse
lives in `fragments/*.md`, included from a prompt the same way any other Liquid include works — there's
no separate top-level `prompts/` folder, and no `components/`, `models/`, or `context/` either, whatever
older sketches of the layout may have suggested.

For the full map of ids to file paths in a real project, use `aqven tree` — see
[how to see what's in a project and how it connects](/engine/inspect-project/). This page only
establishes the shape; that how-to prints the actual listing, kind by kind, for any project you point it
at, including this one.

Prompts get the same treatment: this page just establishes that a prompt is always its own file, never a
string inside YAML. What decides whether that file is plain text, a Liquid template, or a Python
function is covered on [how to write a prompt](/engine/prompts/).

## Renames leave a trail

Because identity is a path, renaming a node or a flow means moving a file — and a moved file breaks the
link between "what this used to be called" and "what it's called now" for anything that reads history
by the old name. AQVEN keeps that link with one mechanism: an explicit, append-only `renames:` list
living inside the project's own `aqven.yaml`, one entry per rename, each recording the kind, the old
id, the new id, and when it happened. Here's a real entry from the showcase project:

```yaml
renames:
- kind: "node"
  from: "support_case.drafts__claude"
  to: "support_case.drafts__mistral"
  at: "2026-09-17T16:48:45Z"
```

That's the whole mechanism from the layout side: one list, appended to, never edited or trimmed. How
that list actually gets written — and the difference between an edit that's safe to make by hand and one
that isn't — is a separate topic; see
[two ways to change a project](/concepts/two-ways-to-change-a-project/) for that.

## No database to fall out of sync

There's no index or database sitting behind the files, rebuilt in the background, that could drift from
what's actually on disk. When the server needs to know the current state of a project — for `aqven
tree`, for an MCP tool call, for Studio's live view — it reads the tree fresh. Studio's live updates
come from watching the files themselves for changes, not from polling a cache. If it's not in a file,
it isn't part of the project; if it's in a file, that file is the answer, not a copy of it somewhere
else.

## How this shapes what you do

Because identity is the path, treat a rename as a real structural change, not a text edit — the id
changes the moment the file or folder does. Because a node is a folder, adding an `llm` node means
creating three sibling files with a shared stem, not one file. Because there's no database, whatever
tool you use to look at the project — `aqven tree`, `aqven refs`, Studio — is reading the same files you
would with a text editor and a terminal; there's no separate source to keep in sync or fall behind.
And because AQVEN itself is built on proven pieces rather than a homegrown storage layer, this file
layout is deliberately plain filesystem and YAML — see
[what this is built on](/concepts/what-this-is-built-on/) for the rest of that picture.

## See also

- [How to see what's in a project and how it connects](/engine/inspect-project/) — `aqven tree`'s real
  id-to-path listing for a whole project, and `aqven refs` for one entity's connections.
- [How to write a prompt](/engine/prompts/) — the three prompt levels, once you know a prompt is always
  its own file.
- [What this is built on](/concepts/what-this-is-built-on/) — the libraries AQVEN takes as-is versus
  what it adds itself.
