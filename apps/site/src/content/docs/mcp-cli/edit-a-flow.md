---
title: How to edit a flow's structure as an agent
description: Use flow_patch's 11 operations and a compare-and-swap file check to restructure a flow safely, and handle a stale-file conflict correctly.
---

## When you need this

A flow's files on disk are the actual definition — the same bytes the compiler and the runtime read.
Editing a prompt's text, or one field's value, is just editing that file directly, the same way you'd
edit any other file in the project. `flow_patch` is for the other kind of change: one that touches more
than one file, renames something other files reference, or needs to succeed completely or not at all.
Reach for it whenever you're adding, removing, renaming, or moving a node, rewiring which output feeds
which input, or renaming the flow or an agent — not by hand-editing several files and hoping they stay
consistent with each other.

## Steps

- Every `flow_patch` call names a `flow_id`, an `ops` list (1 to 50 operations, applied atomically — all
  of them land or none of them are written to disk), a `client_op_id` you generate, and `expects` — the
  compare-and-swap check described below. An optional `intent` string is a free-text label for the
  change, useful for anything else watching the project (a person with Studio open, another agent) that
  sees the files change and wants to know why.
- **The 11 real operations**, by `op`: `add_node`, `remove_node`, `rename_node`, `move_node`, `set`,
  `unset`, `bind`, `unbind`, `rename_flow`, `rename_agent`, `delete_agent`. There's no `replace` —
  changing one field's value is `set`. There's no node-level `delete` — removing a node is `remove_node`.
  - `add_node` — insert a node (`node_id`, `spec`, optional `inference` and `prompt`) at an optional
    `parent`/`index`.
  - `remove_node`, `rename_node` (`to`), `move_node` (`index` and/or `to_flow`) — the rest of a node's
    lifecycle.
  - `set` / `unset` — write or clear one field, addressed by a path like `nodes/triage/description` or
    `flow/description`.
  - `bind` / `unbind` — wire one node's input slot (`target`, e.g. `triage.customer`) to a `source`
    expression, or clear it.
  - `rename_flow` (`to`), `rename_agent` (`agent_id`, `to`), `delete_agent` (`agent_id`) — the flow- and
    agent-level renames.
- **`expects` is the compare-and-swap check.** It's a list of `{path, file_hash}` pairs, one per file
  you're relying on being in a known state. `file_hash` is `"sha256-"` plus the sha256 of that file's
  exact current bytes; `null` means you expect the file not to exist yet. Before writing anything, AQVEN
  re-hashes every path in `expects` and compares it to what you sent. Any mismatch fails the whole call
  with one of three codes, and nothing is written:
  - `FILE_EXISTS` — you expected the file to be absent (`file_hash: null`), but it's there.
  - `FILE_VANISHED` — you expected a hash, but the file is gone.
  - `STALE_FILE` — you expected one hash, but the file's current hash is different: someone else (a
    person, another agent, `git`) changed it since you last read it.
- **On any of the three, don't force it.** Re-read the file (or take the hash straight from the error's
  `conflict.current_hash`), decide whether your intended change still makes sense against the new
  content, and retry with an updated `expects`. There's no override flag.
- **`expects` has to name every file your `ops` end up touching, not just the ones you already know
  about** — a rename or a rebind can reach into files you didn't list. Leave one out and the call fails
  with `REQUEST_INVALID` before anything is written; the error's `candidates` field hands you exactly the
  missing paths with their current hashes, ready to drop straight into a retried `expects`.
- The tree is also validated before anything is written: if applying your `ops` would introduce a new
  blocking problem, the call fails with `BLOCKING_PROBLEMS` and nothing is written — the same
  all-or-nothing guarantee as a CAS conflict. On success, `problems` can still carry non-blocking warnings
  about the result.
- **`client_op_id` makes a retry safe.** Send the same ID twice — because the response was lost, or
  you're not sure the first call landed — and the second call returns the exact first result again,
  without re-checking `expects` or re-running the operations. Generate a new `client_op_id` only when you
  mean a genuinely different edit.
- **`dry_run: true` reports what would happen without writing to disk** — including any new validation
  problems the edit would introduce. It skips the compare-and-swap check and the coverage check
  entirely, so a clean `dry_run` result only tells you the operations would produce a valid tree; it
  doesn't confirm your `expects` are still accurate. A `dry_run` call also isn't remembered under its
  `client_op_id` — reusing that same ID for the real call runs it for real, it doesn't hand back the dry
  run's result.

### Example

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

Read `flows/support_case/nodes/triage/triage.node.yaml` and call `flow_patch` to change its
description, declaring the file's current hash in `expects`:

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

Real response — the write landed, and `version.files` carries the file's new hash:

```json
{
  "ok": true,
  "op": "flow_patch",
  "dry_run": false,
  "version": {
    "files": [
      {
        "path": "flows/support_case/nodes/triage/triage.node.yaml",
        "file_hash": "sha256-bbc6bc5182cefca01a1b07bad28f7353306bcbf6c17e7f83f8e5e0a02afd4396"
      }
    ],
    "dirty": true,
    "actor": { "kind": "agent", "id": "mcp" },
    "client_op_id": "01ARZ3NDEKTSV4RRFFQ69G5FA1"
  },
  "changed_paths": ["flows/support_case/nodes/triage/triage.node.yaml"],
  "problems": [],
  "candidates": []
}
```

Send the same op again with the same, now-outdated `expects` (a different `client_op_id`, so it isn't
just a replay this time) — the real conflict this page is about:

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
    { "op": "set", "path": "nodes/triage/description", "value": "A second, conflicting edit" }
  ],
  "client_op_id": "01ARZ3NDEKTSV4RRFFQ69G5FA2"
}
```

```json
{
  "ok": false,
  "op": "flow_patch",
  "code": "STALE_FILE",
  "message": "flows/support_case/nodes/triage/triage.node.yaml changed after it was read",
  "conflict": {
    "path": "flows/support_case/nodes/triage/triage.node.yaml",
    "your_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e",
    "current_hash": "sha256-bbc6bc5182cefca01a1b07bad28f7353306bcbf6c17e7f83f8e5e0a02afd4396"
  },
  "candidates": [],
  "retry_after_ms": null
}
```

Nothing was written — `current_hash` is exactly the hash the first call already produced. The fix is to
re-read the file, confirm the edit is still right, and retry with `current_hash` as the new `expects`
entry, not to force the write through.

One more real case — a `set` on `flow/description` alongside another `set` on the triage node, but
`expects` only lists `flow.yaml`:

```json
{
  "ok": false,
  "op": "flow_patch",
  "code": "REQUEST_INVALID",
  "message": "edit touches paths outside expects: flows/support_case/nodes/triage/triage.node.yaml; add them with their current hashes",
  "candidates": [
    {
      "path": "flows/support_case/nodes/triage/triage.node.yaml",
      "file_hash": "sha256-bbc6bc5182cefca01a1b07bad28f7353306bcbf6c17e7f83f8e5e0a02afd4396"
    }
  ],
  "conflict": null
}
```

Same fix as `STALE_FILE`: add the missing path to `expects` using the hash `candidates` just handed you,
and send the whole request again.

## See also

- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) — getting an agent connected in the
  first place.
- [How to check and test a project as an agent](/mcp-cli/check-and-test/) — run `aqven_check` after a
  patch to confirm the result the same way a human would before committing.
- [Two ways to change a project](/concepts/two-ways-to-change-a-project/) — why `flow_patch`'s
  before-the-write check exists, and when a direct file edit is the better choice instead.
