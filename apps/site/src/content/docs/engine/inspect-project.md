---
title: How to see what's in a project and how it connects
description: What {{CLI_COMMAND}} tree lists and what {{CLI_COMMAND}} refs shows for one entity — its definition, what references it, and what it references — with real output from the showcase project.
---

# How to see what's in a project and how it connects

## When you need this

Use `{{CLI_COMMAND}} tree` when you need an inventory of everything a project defines — every agent,
tool, type, flow, and node, with the file it lives in. Use `{{CLI_COMMAND}} refs` when you're looking at
one specific entity and need to know where it's defined, what points at it, and what it points at in
turn — before you rename it, delete it, or change its shape.

## Steps

- `{{CLI_COMMAND}} tree <path>` prints every entity in the project, grouped by kind: `project`, `agent`,
  `tool`, `mcp_server`, `type`, `inference`, `flow`, `node`, `dataset`, `eval`. Each row is the entity's
  id and the file it's defined in, relative to the project root. A kind with nothing defined in the
  project gets no heading at all.
- `{{CLI_COMMAND}} refs KIND:ID <path>` looks up one entity by kind and id and prints three things: the
  file it's defined in, every entity that references it ("referenced by"), and every entity it
  references itself. Each reference line names the other entity, the file, the line, and the YAML field
  the reference sits in.
- The kinds `refs` accepts are the same ones `tree` groups by, plus `code` for a Python function a node,
  tool, or eval calls into. A `code` entity only ever shows up as a target — its "definition" line always
  reads `—`, because no YAML file declares it, and that's also why `code` never gets a group in `tree`.
- For a `node`, you can pass either its full id (`flow_id.node_id`, or `flow_id.parent__child` for a
  node nested inside a group) or just its local name, as long as that name is unique across the project
  — `refs node:triage .` resolves to `node:support_case.triage` when `triage` exists in only one flow.
- A reference whose field reads `(by convention)` instead of a file and line isn't written anywhere in
  YAML — it's implied by a naming rule, such as a node picking up the inference file that shares its
  folder and stem. There's nothing in the file to point a line number at.
- For a `code` reference, pass the id the way it resolves, not the way you wrote it in YAML: a
  `run: "@root.tools.functions:lookup_order"` in the project's own YAML resolves to
  `<package_name>.tools.functions:lookup_order`, and that resolved form is what `refs code:...` expects.
- Neither command touches the network or validates the project. `refs` on an id that doesn't exist just
  says so and exits with an error; [`check`](/engine/check/) is what tells you whether the project as a
  whole is correct.

### Example

Create the showcase project if you don't already have one:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

`tree` lists the whole project, one group per kind. This is the real output on an unmodified showcase
project, trimmed here to the first few rows of the two largest groups — run it yourself for the
untruncated list:

```bash
{{CLI_COMMAND}} tree .
```

```text
project (1)
  my_project  aqven.yaml
agent (9)
  deepseek    agents/deepseek.yaml           output.mode auto -> tool (profile)
  gemini      agents/gemini.yaml             output.mode auto -> tool (profile)
  gpt         agents/gpt.yaml                output.mode auto -> tool (profile)
  llama       agents/llama.yaml              output.mode auto -> tool (profile)
  mistral     agents/mistral.yaml            output.mode auto -> tool (profile)
  painter     agents/painter.yaml            output.mode prompted -> prompted (declared)
  qwen        agents/qwen.yaml               output.mode tool -> tool (declared)
  researcher  agents/researcher.yaml         output.mode auto -> tool (profile)
  resolver    agents/resolver/resolver.yaml  output.mode native -> native (declared)
tool (6)
  find_tickets        tools/find_tickets.yaml
  issue_store_credit  tools/issue_store_credit.yaml
  lookup_order        tools/lookup_order.yaml
  render_clip         tools/render_clip.yaml
  search_kb           tools/search_kb.yaml
  synthesize_voice    tools/synthesize_voice.yaml
mcp_server (1)
  helpdesk  mcp/helpdesk.yaml
type (49)
  Agreement         types/enums/agreement.yaml
  ApprovalDecision  types/enums/approval_decision.yaml
  CascadeTier       types/enums/cascade_tier.yaml
  CaseIntent        types/enums/case_intent.yaml
  CaseOrigin        types/unions/case_origin.yaml
  ... 44 more types, run it yourself for the full list
inference (9)
  ballot           flows/support_case/nodes/vote/ballot.inference.yaml
  critique         flows/support_case/nodes/polish/critique.inference.yaml
  extract          flows/support_case/nodes/record/extract.inference.yaml
  illustrate       flows/support_case/nodes/illustrate/illustrate.inference.yaml
  research_policy  agents/resolver/research_policy.inference.yaml
  resolve          flows/support_case/nodes/route/resolve.inference.yaml
  revise           flows/support_case/nodes/polish/revise.inference.yaml
  tie_break        flows/judge_panel/nodes/decide/tie_break.inference.yaml
  triage           flows/support_case/nodes/triage/triage.inference.yaml
flow (2)
  judge_panel   flows/judge_panel/flow.yaml
  support_case  flows/support_case/flow.yaml  run context: date, tenant_id
node (38)
  judge_panel.aggregate          flows/judge_panel/nodes/aggregate/aggregate.node.yaml
  judge_panel.decide             flows/judge_panel/nodes/decide/decide.node.yaml
  judge_panel.decide__tie_break  flows/judge_panel/nodes/decide/tie_break.node.yaml
  judge_panel.judges             flows/judge_panel/nodes/judges/judges.node.yaml
  judge_panel.judges__deepseek   flows/judge_panel/nodes/judges/deepseek.node.yaml
  ... 33 more nodes, run it yourself for the full list
dataset (5)
  reply_cases                   evals/support_case/reply_cases.yaml
  support_case_cases            datasets/support_case_cases.yaml
  support_case_csv_review       datasets/support_case_csv_review.yaml
  support_case_csv_ui_demo      datasets/support_case_csv_ui_demo.yaml
  support_case_multimodal_demo  datasets/support_case_multimodal_demo.yaml
eval (1)
  reply_quality  evals/support_case/reply_quality.yaml
```

An agent row's third column, when present, is its resolved output mode: what you set (or `auto` if you
didn't), an arrow, then what it resolved to and why — `(profile)` means the provider's own defaults
picked it, `(declared)` means the agent's own file set the mode explicitly. A flow row's third column,
when present, lists the run context keys that flow declares, like `date` and `tenant_id` for
`support_case` here.

`refs` looks up one entity. `type:Money` is a small record, so both of its lists are short:

```bash
{{CLI_COMMAND}} refs type:Money .
```

```text
type:Money
definition: types/records/money.yaml
referenced by (4):
  tool:issue_store_credit  tools/issue_store_credit.yaml:20 in[2].type
  tool:issue_store_credit  tools/issue_store_credit.yaml:29 out[1].type
  tool:lookup_order        tools/lookup_order.yaml:24 out[3].type
  type:Resolution          types/records/resolution.yaml:14 fields[2].type
references (1):
  type:CurrencyCode  types/records/money.yaml:12 fields[1].type
```

Two tools and another type use `Money` as a field type, and `Money` itself has one field typed
`CurrencyCode`. Changing `Money`'s shape means checking all four of those call sites.

A node tells a different story — this is what `refs` is for before a rename. `record__extract` is a
small `llm` node partway through the flow, so its full picture in both directions still fits on screen:

```bash
{{CLI_COMMAND}} refs node:extract .
```

```text
node:support_case.record__extract
definition: flows/support_case/nodes/record/extract.node.yaml
referenced by (2):
  node:support_case.record            flows/support_case/nodes/record/record.node.yaml:6 body[0]
  node:support_case.record__validate  flows/support_case/nodes/record/validate.node.yaml:10 in[0].from
references (5):
  inference:extract            flows/support_case/nodes/record/extract.node.yaml inference (by convention)
  agent:gemini                 flows/support_case/nodes/record/extract.node.yaml:5 agent
  node:support_case.prepare    flows/support_case/nodes/record/extract.node.yaml:8 in[0].from
  node:support_case.triage     flows/support_case/nodes/record/extract.node.yaml:10 in[1].from
  node:support_case.case_form  flows/support_case/nodes/record/extract.node.yaml:12 in[2].from
```

That's `refs node:extract .` — just the local name, no flow prefix — resolving on its own to
`node:support_case.record__extract`, because no other flow in this project has a node called `extract`.
The `inference:extract (by convention)` line is the node picking up `extract.inference.yaml` by folder
and stem, not by anything written in `extract.node.yaml`.

Looking up something that isn't there fails instead of printing an empty result:

```bash
{{CLI_COMMAND}} refs type:NoSuchType .
```

```text
aqven refs: type:NoSuchType is neither defined nor referenced
```

## See also

- [How to check a project before committing](/engine/check/) — the command that validates the project;
  `tree` and `refs` only report what's there.
- [How to generate types and editor schemas](/engine/generate-types/) — the other everyday CLI command,
  for turning type YAML into `types.py` rather than inspecting it.
- [How to write a step in Python](/engine/code-node/) — the `run:` field whose resolved value is what
  `refs code:...` expects.
- [CLI commands](/reference/cli/) — every other command, including `check` and `generate`.
