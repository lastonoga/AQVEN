---
title: Two ways to change a project
description: A direct file edit is checked after the write by a project hook; flow_patch is checked before the write by a compare-and-swap that can reject it outright.
---

# Two ways to change a project

## In short

You can change an AQVEN project two ways, and both are real. **Direct edit**: open a file with
ordinary file tools and change it — nothing on disk stops you, even for a change that should touch
several files at once. Whatever validates that change runs *after* the write, if anything runs at
all. **`flow_patch`**: an MCP tool (and REST route) that checks the change *before* writing a single
byte, and refuses the whole thing if that check fails. Point edits — a prompt's wording, one field's
value — are fine as a direct edit. Anything structural or cross-file — a rename, adding or removing a
node, rewiring a binding — should go through `flow_patch` instead.

## Direct edit: checked after the fact, if at all

A file tool has no idea what a `node.yaml` field means. Rename a node by hand, and every other file
that referenced its old id is now silently wrong — nothing on disk objects, and the broken tree saves
and commits without complaint.

What catches this is `{{CLI_COMMAND}} check`, described in full on
[how to check a project before committing](/engine/check/). Run by hand, it's a normal CLI command.
The showcase project also shows how to run it for you automatically: a couple of agent-harness
configuration files that add a hook, firing after every file write and again when the agent finishes,
that blocks with `check`'s real error output if the tree is now invalid. That hook is a convention a
project sets up for its own agent, not a property of AQVEN itself — a project that hasn't wired one up
gets no automatic check at all, and even with one wired up, the broken intermediate state was already
written and committable before the hook ever ran. An invalid tree just can't be released —
`{{CLI_COMMAND}} check` is also what CI runs before a build can ship.

## `flow_patch`: checked before the write, or not written at all

`flow_patch` takes the opposite order: it validates first, and only writes if that validation passes.
Two mechanisms make this work, both real and both tested against a real project.

**Compare-and-swap.** Every call declares the exact file hash you last read for every file your
change touches. Before writing anything, AQVEN re-hashes those files on disk and compares. Any
mismatch — the file changed, vanished, or turned out to exist when you expected it not to — fails the
whole call with zero bytes written. You get the current hash back in the error, so you can re-read,
decide whether your change still makes sense, and retry. There's no override.

**A retry-safe id.** Every call also carries an id you generate. Send the same id twice — because the
response never arrived, say — and the second call returns the first result again, without
re-checking anything or writing anything a second time. Replaying a call is safe by construction.

The full operation list, the complete field-by-field shape of the compare-and-swap check, and real
request/response JSON for every case are on
[how to edit a flow's structure as an agent](/mcp-cli/edit-a-flow/) — this page only establishes the
shape of the split, not the mechanics. As of this writing `flow_patch` covers node, flow, and agent
operations — renaming or moving a node, renaming a flow, renaming or deleting an agent, and the fields
and bindings between them. It doesn't reach every kind of rename a project has; renaming a shared
type or a tool, for instance, isn't one of its operations today.

## A rename through `flow_patch` leaves a trail; a hand-edit doesn't

[Files as source of truth](/concepts/files-as-source-of-truth/) covers the `renames:` list that lives
in a project's own `aqven.yaml` — the append-only record that keeps "what this used to be called"
connected to "what it's called now." A structural rename made through `flow_patch` writes that entry
in the same transaction as the rename itself, verified and atomic with it. Rename the same file by
hand and there's no such entry — the file moved, but nothing recorded that it used to be something
else. Any tool that resolves history by the old id, including AQVEN's own, loses that connection.

## Why this split matters more for an agent

A person editing files one at a time in an editor tends to notice when something looks wrong before
committing. An agent can fire off many fast edits in a row with no one watching each individual diff —
exactly the situation compare-and-swap exists to catch: two changes landing on the same file, one of
them silently overwriting the other's assumptions about what the file contained.

This is also why an MCP-connected agent isn't left to infer the split on its own. The server's very
first message to a connecting agent states it directly: flow definitions are files, read them with
your own file tools; structural and cross-file edits go through `flow_patch`; run a check after every
edit.

### Example

A `flow_patch` call declaring the hash it read, and a clean write:

```json
{
  "flow_id": "support_case",
  "expects": [
    {
      "path": "flows/support_case/nodes/triage/triage.node.yaml",
      "file_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e"
    }
  ],
  "ops": [
    { "op": "set", "path": "nodes/triage/description", "value": "Classifies the case and its attachments" }
  ],
  "client_op_id": "01ARZ3NDEKTSV4RRFFQ69G5FA1"
}
```

```json
{ "ok": true, "op": "flow_patch", "changed_paths": ["flows/support_case/nodes/triage/triage.node.yaml"] }
```

Retry the same edit with that now-stale hash, and nothing gets written:

```json
{
  "ok": false,
  "op": "flow_patch",
  "code": "STALE_FILE",
  "message": "flows/support_case/nodes/triage/triage.node.yaml changed after it was read",
  "conflict": {
    "your_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e",
    "current_hash": "sha256-bbc6bc5182cefca01a1b07bad28f7353306bcbf6c17e7f83f8e5e0a02afd4396"
  }
}
```

`current_hash` is exactly the hash the first write produced. The full version of this pair — every
field, every conflict code — is on
[how to edit a flow's structure as an agent](/mcp-cli/edit-a-flow/).

## How this shapes what you do

Reach for a direct edit only for a point change you can hold in your head — a prompt's wording, one
field on one node — and run `{{CLI_COMMAND}} check` yourself right after, whether or not a hook does
it for you; don't rely on the hook existing. Reach for `flow_patch` for anything structural or
cross-file: a rename, adding or removing a node, rewiring which output feeds which input. Read the
current file before you patch it, so the hash you declare in `expects` is real, and if a call comes
back `STALE_FILE`, re-read and retry instead of trying to force it through — there's no override for a
reason. And if what you need is a rename to a type or a tool rather than a node, flow, or agent, that's
outside what `flow_patch` covers today — make the change by hand and check it, the same as any other
direct edit.

## See also

- [How to edit a flow's structure as an agent](/mcp-cli/edit-a-flow/) — every `flow_patch` operation,
  the full compare-and-swap breakdown, and real request/response JSON.
- [How to check a project before committing](/engine/check/) — what `{{CLI_COMMAND}} check` actually
  validates.
- [How an agent reads a project's structure](/mcp-cli/read-project-structure/) — reading files
  directly before you decide which of these two paths to take.
- [Files as source of truth](/concepts/files-as-source-of-truth/) — what a project looks like on disk,
  and the `renames:` list this page builds on.
