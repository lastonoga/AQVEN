---
title: For AI Coding Agents
description: How to read these docs as an agent, the MCP tool contract, and workflow/model/schema rules.
---

If you're an AI coding agent working in an AQVEN project — or a developer setting one up for an agent to work
in — this page is the starting point.

## The MCP contract

Every AQVEN project exposes an `aqven` MCP server (`.mcp.json`, `uv run aqven mcp <project>`) with the tools an
agent needs to read and change the project without hand-editing every file:

| Tool | Use it for |
|---|---|
| `flow_list`, `flow_get` | Read the current plan |
| `flow_patch` | Structural and cross-file edits: renaming or moving a flow, node, agent, tool or type; adding or removing a node |
| `aqven_check` | Run after every edit — the project's gate |
| `prompt_preview` | Run after every prompt edit — see the exact messages a node will send |
| `pyright_check`, `pytest_run` | Type-check and test code changes |
| `run_start`, `run_get`, `run_events` | Run a flow and inspect what happened |

## Edit rules

- **Edit directly** (Read/Edit/Write) for prompt text, one node's settings, descriptions, point fixes.
- **Edit only through `flow_patch`** for anything structural or cross-file: renames, moves, adding or removing a
  node. It updates every reference and writes the rename journal that lineage tracking depends on.
- Optimistic locking is content-hash based (CAS): `flow_patch` answers `STALE_FILE` when the file changed under
  you — re-read it and repeat the intended change. Never overwrite by force.
- Never hand-edit a project's generated `types.py` — it's rebuilt from the YAML and every edit is overwritten.
  Change the YAML source and run `aqven generate`.

## The check loop

`aqven check` is the whole safety net in a project that has no test suite of its own: it validates every file
statically, then simulates every flow end to end with generated values — no network, no tokens spent — and
reports diagnostics with a code, a file path, and usually a hint that names the exact fix.

| Code prefix | Meaning |
|---|---|
| `E_` | Error — the project isn't runnable. Fix before finishing; `aqven check` exits 1 while any error remains. |
| `W_` | Warning — it runs, but something's unclear or unpinned. |
| `E_SIM_*` | A simulated run of a flow failed; the hint carries the input the simulation used. |
| `W_SIM_NODE_UNREACHED` | No simulated input reaches this node — check the branches above it. |

Run it after every edit, not just before finishing. In projects configured with Claude Code hooks, this happens
automatically: `PostToolUse` runs `aqven check --static` after each file edit, `Stop` runs the full check (static
plus simulated runs) before the turn ends.

## A working `AGENTS.md`

Every AQVEN project should ship an `AGENTS.md` a coding agent reads first. This is adapted from the real one in
the Lumen example — the full version also covers `.aqven/` and test-fixture rules — copy it as a starting point
and adjust the project-specific facts (module path, tool names):

```markdown
# Rules for coding agents

`lumen` is an aqven project: AI workflows are YAML files next to the Python code they use.

## Rules

1. **`aqven check` must pass after every change.** It is the gate of this project. Fix every error before you
   finish; do not ask a model to try the flow instead.
2. Never edit the generated `types.py`. Change the YAML instead.
3. Structural changes across files go through the `flow_patch` tool of the `aqven` MCP server. Edit by hand only
   inside one file: prompt text, descriptions, settings, one node. If `flow_patch` answers `STALE_FILE`, read the
   file again and repeat the change; never overwrite a file by force.
4. **After editing a prompt, run `aqven prompt preview <flow>.<node> --project <path>`** and read what the model
   will actually receive.
5. **Choose a model with `aqven models check`, not from memory.**
6. API keys live only in the project's `.env`, gitignored. Never read, print or edit `.env` files.
7. **Tests never call model providers.** They replace models with `FunctionModel` through the `aqven_engine`
   fixture; force a branch in a scenario test with a node output override, never by hoping a model answers a
   certain way.
```

## Where the rest of the rules live

This page is the index, not the whole story — the rules an agent needs for the decisions inside a flow live where
every reader finds them:

- [Models & Providers](/models-and-providers/) — which model class fits which node, and how to verify a choice
  instead of assuming it.
- [Structured Output & Types](/structured-output-and-types/) — field order, nesting, enums, unions, the rules that
  make a schema get good answers instead of just valid JSON.
- [Designing Reliable Workflows](/designing-reliable-workflows/) — when to split a node, when divergence helps,
  when a critic loop is worth its cost, and the compounding-error budget that caps how long a chain of LLM nodes
  should get before it needs a gate instead of another node.
