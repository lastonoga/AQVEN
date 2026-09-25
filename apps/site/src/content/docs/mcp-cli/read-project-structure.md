---
title: How to read a project's structure as an agent
description: There's no MCP tool that lists or fetches a project's structure — an agent reads the flow files directly, the same way it reads any other code.
---

## When you need this

You're connected to a project over MCP and you need to know what's in it — which flows exist, what a
node looks like, how one node feeds another — before you edit anything or call `flow_patch`. There's no
`catalog_list`, `catalog_get`, or any other MCP tool that lists or fetches this for you. Use your agent's
own file tools instead.

## Steps

- **A flow's files on disk are its actual definition** — the same YAML and prompt files the compiler and
  the runtime read, not a copy of them in a database. `flows/<flow_id>/flow.yaml` is the flow, each
  `nodes/<node_id>.yaml` is a node, and a prompt lives in its own `.prompt.md` file next to it. Reading a
  flow means reading these files, the same way you'd read any other source file in the project.
- **That's why there's no listing or fetching tool for this.** A `catalog_list`/`catalog_get` pair would
  just be a second, MCP-shaped way to read information your agent's file tools already read directly and
  more flexibly — list a directory, grep across every node for a field, open one file. AQVEN's MCP server
  says as much in its own instructions to a connecting agent: flow definitions are files in the project,
  read them with your own Read, Grep, and Glob. The 16 MCP tools this project exposes are for the things
  file tools can't do — running a check, starting a run or a series, applying a structural edit
  atomically — not for reading files a second way.
- **Read `FINDINGS.md` before you propose a change.** It sits at the module root, next to `aqven.yaml`,
  and it is what the project already knows: every finding of a series on held-out cases, grouped by
  failure mode, with the cases, repeats and models it holds for. Studio's chat agent gets it with
  `AGENTS.md` and `CLAUDE.md`. Experiments are files too: `experiments/<experiment_id>/experiment.yaml`
  with its notes in `experiment.md`, the values its variants plug in under `nodes/`, `prompts/` and
  `flows/`, and its findings in `findings/`.
  Datasets are `datasets/<dataset_id>.yaml`, and the media files their cases point at sit in
  `datasets/<dataset_id>/` or, when shared, under `@root/` paths such as `samples/`. See
  [How to keep case media as files in the project](/engine/dataset-media-files/).
- **Use whatever your agent calls "Read", "Grep", and "Glob".** List `flows/` to see what flows exist,
  glob `flows/*/nodes/*.yaml` to see every node across all of them, grep for a node id or a field name
  across the tree, read one `flow.yaml` or `<node_id>.yaml` to see its shape. This is the same file
  reading you'd already do to understand any other part of the project's code.
- **For a structured inventory instead of raw files, use the CLI, not MCP.** `{{CLI_COMMAND}} tree` lists
  every entity in the project grouped by kind, and `{{CLI_COMMAND}} refs KIND:ID` looks up one entity and
  shows its definition, what references it, and what it references. Run either from a terminal alongside
  your agent, or have the agent shell out to them. See
  [How to see what's in a project and how it connects](/engine/inspect-project/) for exactly what each
  command prints.
- **`flow_list` and `flow_get` exist, but only as REST routes for Studio's own UI** — they're not
  registered as MCP tools, so an agent connected over MCP can't call them. Don't reach for them from an
  agent context; read the files directly, or use `{{CLI_COMMAND}} tree`/`{{CLI_COMMAND}} refs` instead.
- Once you've found the node or field you need to change, edit the file directly for a point change, or
  call `flow_patch` for a structural or cross-file one — see
  [How to edit a flow's structure as an agent](/mcp-cli/edit-a-flow/).

### Example

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

An agent exploring this project for the first time might glob every flow file, then read one:

```text
Glob: flows/*/flow.yaml
  flows/judge_panel/flow.yaml
  flows/support_case/flow.yaml

Read: flows/support_case/flow.yaml
```

To find every node that reads a value from `triage`, grep across the tree instead of calling a tool for
it:

```text
Grep: "\$triage\." in flows/support_case/nodes/**/*.yaml
  flows/support_case/nodes/drafts/gemini.node.yaml:9:  from: "$triage.out.summary"
  flows/support_case/nodes/intent/escalate.node.yaml:9:  from: "$triage.out.summary"
  flows/support_case/nodes/panel/panel.node.yaml:8:  from: "$triage.out.summary"
  ...
```

For the same question with full references (file, line, and field), run `{{CLI_COMMAND}} refs
node:triage .` from a terminal — see how to read that output on
[How to see what's in a project and how it connects](/engine/inspect-project/).

## See also

- [How to see what's in a project and how it connects](/engine/inspect-project/) — `{{CLI_COMMAND}} tree`
  and `{{CLI_COMMAND}} refs`, with real output.
- [How to edit a flow's structure as an agent](/mcp-cli/edit-a-flow/) — what to do once you've found what
  to change.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/) — what a finding in
  `FINDINGS.md` holds, and why it is never edited by hand.
- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) — getting an agent connected in the
  first place.
- [Files as source of truth](/concepts/files-as-source-of-truth/) — why the files themselves, not a
  database, are what you're reading here.
