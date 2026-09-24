# Showcase: the Lumen example

> Status: design, 2026-09-17
> Law: the owner's decisions of 2026-09-17 (O1–O22, §1), [DECISIONS.md](../docs/DECISIONS.md),
> [ADR-0006](../docs/adr/0006-dynamic-allowed-sets.md), [ADR-0025](../docs/adr/0025-python-engine.md)–[ADR-0029](../docs/adr/0029-trust-and-quality-python.md),
> [23. Studio API](../docs/23-studio-api.md). The semantics of combinators, loops and judges are in [03](../docs/03-core-language.md), [04](../docs/04-ir-schema.md).
> The owner's decisions and the ADRs outrank this document and [06](../docs/06-registries.md).

The mark **"proposal — not in an ADR"** sits on a construct that neither the ADRs nor decisions O1–O22 fix. The owner
either accepts it (and then an ADR is written) or it changes.

## 1. The owner's decisions of 2026-09-17

| # | Decision | How it shows up here |
|---|---|---|
| O1 | One example covering every pattern and execution mode; reusable parts are part of the example | the `support_case` workflow and the `judge_panel` workflow it calls (§4–§5) |
| O2 | An `llm` node references an agent; the model and its settings live only on the agent (`provider:model`) | `agents/<id>.yaml`, `agents/resolver/resolver.yaml`, §6.2 |
| O3 | Agents, tools and MCP servers are module registry files; nodes do not configure tools; `aqven.yaml` holds the project and the providers; model capabilities come from a built-in profile table | §6.1–§6.4 |
| O4 | Limits and budgets are optional everywhere; no key means no limit | the `limits` key on the project, a workflow, a node and an agent; in the example, only on the `resolver` agent |
| O5 | Inference post-checks: built-in and your own, `on_fail: retry \| fail \| flag`; the engine uses `output_validator` + `ModelRetry` | §6.5 |
| O6 | Output is always structured JSON; there is no text mode | `E_TEXT_OUTPUT`, §9.4 |
| O7 | The prompt lives in the inference; the node says only `agent` plus input bindings (and `inference`, when the inference is shared) | §6.5, §7 |
| O8 | A level 1 or 2 prompt is `<inference>.prompt.md` beside `<inference>.inference.yaml`, picked up by convention (refined by O18, file names by O22) | §3, §6.5 |
| O9 | The place where an algorithm is chosen is a policy: exactly one of `use: <built-in>` and `run: module:function`, parameters in `with`; built-in and your own are interchangeable | §6.6: `join`, `stop`, `select`, `on_item_error`, evaluators; your own in `flows/judge_panel/nodes/judges/judges.py`, `flows/support_case/nodes/record/record.py` |
| O10 | Prompt variants are declared in `<inference>.inference.yaml` (`variants`: `on`, `cases`, `default`), the files are `<inference>.variants/<slot>/<variant>.md`, and the prompt prints `{{ variants.<slot> }}` | the `lamp_guide` slot on `revise` by `product.lamp_kind`, §6.5 |
| O11 | Node kinds are separate; an inference check and an experiment check are one evaluator; `loop` has no iteration block; the fields of control nodes are the same: `body`, `in`, `out` and policies | §4, §6.6, §10 |
| O12 | There is no cache layer: no `determinism`, `ttl_ms`, `ttl_seconds`; no `prepare` hook on nodes; `effect` stays | `code` and `tool` nodes and the tools carry none of those keys, §4, §6.3 |
| O13 | There is no Connection entity: connectors to data are `code` steps and tools | `tools/functions.py` |
| O14 | The loader looks for `*.yaml` with `apiVersion: aqven/v1` recursively and sorts them by `kind`; an id is the file name up to the first dot, and for `flow.yaml` it is the folder name (refined by O22) | §3 |
| O15 | An `llm` node with a `<node>.inference.yaml` beside it takes that one without an `inference` key; `inference: <id>` is only for a shared inference | `triage`, `vote__ballot`, `record__extract`, `route__resolve`, `polish__revise`, `polish__critique`, `illustrate`, `decide__tie_break`, §3 |
| O16 | The unit of layout is the step; an entity lives at the lowest common ancestor of its users | refined by O22: one place per kind, and a node folder belongs to a top-level node, §3 |
| O17 | Several workflows; the project folders `agents/`, `tools/`, `mcp/`; there is no separate "component" kind — a reusable subgraph is a workflow, called by a `call` node | `flows/judge_panel/` is the second workflow, and the `panel` node is a `call` with `flow: judge_panel` (§5) |
| O18 | Any location is the user's choice, and the layout standard is O22; convention with an explicit override: `prompt` is a path to a `.md` anywhere, or `module:function`, and a variant is an id or a path to a `.md` | the example has no explicit prompt path; the only `prompt` key is the `illustrate_prompt` function; `W_PROMPT_SHADOWED` is covered by `tests/test_check.py`, §3 |
| O19 | Layout by role. Types are YAML only, and `aqven generate` writes the Pydantic models into `types.py` at the module root; the place of every kind is O22 | §3, §9 |
| O20 | Short code references: `<function>` from `<id>.py` beside the declaring file, `@here.`, `@flow.`, `@<flow_id>.`, `@root.`, or a full path; the IR keeps only the absolute path | §3 |
| O21 | Subfolders by kind when there are many files | `types/enums/`, `ids/`, `records/`, `unions/`, `values/` (O22), §3, §8 |
| O22 | The standard layout, final for now: one place per kind. At the root — `aqven.yaml`, `agents/<agent>.yaml` (an agent with companion files gets the folder `agents/<agent>/`: `<agent>.yaml`, `<agent>.instructions.md`, the inferences of its subagents), `tools/<tool>.yaml` and `tools/functions.py` (referenced as `@root.tools.functions:<function>`), `mcp/<server>.yaml`, `types/{ids,enums,records,unions,values}/<type>.yaml`, `fragments/<fragment>.md`, `code/<module>.py` (Python used in several places), `datasets/<dataset>.yaml`, `experiments/<experiment>/experiment.yaml`, `flows/<workflow>/flow.yaml`. Every top-level node gets the folder `nodes/<node>/` with `<node>.node.yaml` and its `.inference.yaml`, `.prompt.md`, `.variants/`, `.py`; every descendant of that node, however deep, sits flat in the same folder under the same prefix rule, with no nested folders. `types.py` at the module root (beside the `types/` folder, which has no `__init__.py`, imported as `lumen.types`) holds the models of every type and of the inputs and outputs of every inference (`<Inference>In`, `<Inference>Out`), of every tool with `run` (`<Tool>In`, `<Tool>Out`) and of every `code` step (`<Workflow><Node>In`, `<Workflow><Node>Out`); there are no hand-written copies. An id is the file name up to the first dot; a bare name in `run` means `<id>.py` beside the declaring file, loaded by file path | §3, §8, §9 |

## 2. The scenario

**Lumen** is a smart lighting brand. A customer writes to support from the online store or a marketplace and attaches a
photo, a voice message, a video of the defect and an invoice. The product has a lamp kind (`LampKind`: mains,
rechargeable, smart Wi-Fi, smart Zigbee), and the advice in the reply depends on it. The `support_case` workflow parses
the case and its attachments, decides the intent by ballot with a cascade, fills the case form from the category form
with a check and a repair, routes it (an agent with tools decides a warranty case), writes a reply from the knowledge
base with three model families and advice for the lamp kind, hands the candidates to the `judge_panel` workflow,
polishes the winner in a critique loop, generates an instruction image, a voice track and a short clip, and waits for
the support lead and the brand editor to approve in parallel.

```
prepare → triage → vote(map) → tally → intent(switch: cascade) → case_form → record(loop) → to_record(narrow)
→ search_kb → route(switch: router, agent) → drafts(parallel) → panel(call judge_panel) → polish(loop)
→ illustrate → voice → clip(wait) → approvals(parallel humans) → finalize
```

## 3. Layout

The aqven project root is `lumen/` (the `lumen` package) at the project root. The paths below are relative to it,
except for the host.

The loader recursively finds every `*.yaml` with `apiVersion: aqven/v1` and sorts them by `kind`; only `aqven.yaml` at
the root is fixed (O14). **An entity's id is the file name up to the first dot:** `intent.node.yaml` is the node
`intent`, `revise.inference.yaml` is the inference `revise`, `support_case_cases.yaml` is the dataset
`support_case_cases`, and `resolver.yaml` is the agent `resolver`. There are two exceptions — `flow.yaml` (and the
builder `flow.py`): a workflow's id is the name of its folder; and `experiment.yaml`: an experiment's id is the name
of its folder. The suffixes `.node.yaml` and `.inference.yaml` are the O22 convention: the kind still comes from
`kind`, and a suffix that contradicts `kind` is `E_KIND_PATH_MISMATCH`. An id is unique among entities of one kind (a
duplicate is `E_ID_DUPLICATE`, with both paths). A node belongs to the workflow whose `flow.yaml` sits in the nearest
folder above it; node folders do not affect ids — the expanded id (`route__resolve`) is built from the parent's `body`
and `cases`.

**The standard layout: one place per kind (O22).** A kind's folder exists at exactly one level: `types/`,
`fragments/`, `code/`, `datasets/` and `experiments/` live only at the module root, and workflows and nodes have
none of them. The files that belong to an entity sit beside its own file under the same prefix: `<id>.instructions.md`,
`<id>.inference.yaml`, `<id>.prompt.md`, `<id>.variants/`, `<id>.py`. An agent with no companion files is the single
file `agents/<agent>.yaml`; an agent with them gets the folder `agents/<agent>/`. Every top-level node of a workflow
gets its own `nodes/<node>/` folder, and all of its descendants (`body` of `parallel`, `map`, `loop`, and `cases` of
`switch`), however deep, sit flat in that same folder under the same prefix rule, with no nested node folders.

| Kind | Place | In the example |
|---|---|---|
| project | `aqven.yaml` | providers and data policies |
| agent | `agents/<agent>.yaml` | nine agents, one file each |
| agent with companion files | `agents/<agent>/<agent>.yaml`, `<agent>.instructions.md`, the inferences of its subagents: `<inference>.inference.yaml`, `<inference>.prompt.md`, `<inference>.variants/` | `agents/resolver/`: the instructions and the `research_policy` subagent inference |
| tools | `tools/<tool>.yaml`, tool functions in `tools/functions.py`, referenced as `@root.tools.functions:<function>` | six tools |
| MCP servers | `mcp/<server>.yaml` | `helpdesk` |
| types | `types/`, with subfolders by type kind: `enums/`, `ids/`, `records/`, `unions/`, `values/` (constrained scalars) | all 49 types of both workflows and the tools |
| shared prompt fragments | `fragments/<fragment>.md` | `untrusted_input`, `safety_escalation`, `citation_rules`, `brand_voice`, `judge_protocol` |
| Python used in several places | `code/<module>.py` — several nodes, a node and an experiment, several workflows | `code/support_case.py`: the promise rules serve the evaluator `promises_match_resolution` (a check on the `revise` inference) and `reply_keeps_resolution` (the `promises` check of three `reply_*` experiments) |
| datasets | `datasets/<dataset>.yaml` — the cases of a workflow (`flow: <workflow>`) or of an experiment arm | `support_case_cases`, `judge_panel_cases`, `long_customer_messages`, `planted_defect_replies` |
| experiments | `experiments/<experiment>/experiment.yaml`, notes in `experiment.md`, arms in `arms/<arm>/flow.yaml`, the experiment's own code in `checks.py` | thirteen experiments, one for every question kind (§10) |
| workflow | `flows/<workflow>/flow.yaml` | `support_case`, `judge_panel` |
| top-level node | `flows/<workflow>/nodes/<node>/<node>.node.yaml` | `nodes/route/route.node.yaml` |
| a node's descendant, at any depth | flat in the top-level node's folder: `nodes/<node>/<child>.node.yaml` | `nodes/route/resolve.node.yaml`, `nodes/polish/revise.node.yaml` |
| the inference of an `llm` node | beside the node under the same prefix: `<node>.inference.yaml`, `<node>.prompt.md`, `<node>.variants/<slot>/<variant>.md` | `nodes/triage/triage.*`, `nodes/polish/revise.*` |
| a node's code | `<node>.py` beside the node — its step, its own checks on its inference, its own policies, a level 3 prompt | `nodes/prepare/prepare.py`, `nodes/judges/judges.py`, `nodes/polish/critique.py`, `nodes/illustrate/illustrate.py` |
| generated | `types.py` at the module root — the models of every type and of the inputs and outputs of every inference, tool and `code` step | `aqven generate`, in `.gitignore` |

**A shared inference.** The inference sits beside the node that owns it, under that node's name, and takes its id.
Other nodes, experiment checks and experiment arms reference it with `inference: <id>`. The owner is the first node
in workflow order that uses it and whose id does not match the agent's id:

| Inference | File | Who references it with `inference: <id>` |
|---|---|---|
| `ballot` | `flows/support_case/nodes/vote/ballot.inference.yaml` | `intent__escalate` |
| `revise` | `flows/support_case/nodes/polish/revise.inference.yaml` | `drafts__gpt`, `drafts__mistral`, `drafts__gemini` |
| `critique` | `flows/support_case/nodes/polish/critique.inference.yaml` | the `critique` judge check of the `reply_look` and `reply_noninferior_mistral` experiments, the `critique_only` arm |
| `tie_break` | `flows/judge_panel/nodes/decide/tie_break.inference.yaml` | `judges__deepseek`, `judges__qwen`, `judges__llama`, `decide__tie_break` |

**A subagent inference.** The `research_policy` inference belongs to no node: it is called by a subagent of the
`resolver` agent. So it sits in that agent's folder under its own name:
`agents/resolver/research_policy.inference.yaml` and `agents/resolver/research_policy.prompt.md`. There is no
`research_policy` node, and the inference is attached to no node.

```
aqven.yaml                                         kind Project
types.py                                           Pydantic models of every type and of inference, tool and code step inputs and outputs: aqven generate, in .gitignore
agents/
  <agent>.yaml                                     kind Agent, eight files: deepseek, gemini, gpt, llama, mistral, painter, qwen, researcher
  resolver/
    resolver.yaml                                  kind Agent: tools, an MCP tool, a subagent, approval, limits
    resolver.instructions.md                       agent instructions (level 1)
    research_policy.inference.yaml, .prompt.md     the research_policy subagent inference
tools/<tool>.yaml, functions.py                    kind Tool and the tool functions
mcp/helpdesk.yaml                                  kind McpServer
types/
  enums/                                           17 enums
  ids/                                             6 identifiers
  records/                                         23 records
  unions/                                          CaseOrigin, CaseRecord
  values/                                          Score
fragments/                                         untrusted_input, safety_escalation, citation_rules, brand_voice, judge_protocol
code/support_case.py                               promises_match_resolution: a check on revise; reply_keeps_resolution: the promises check of experiments
datasets/<dataset>.yaml                            kind Dataset: cases with inputs, node_outputs, expected_output and tags
experiments/<experiment>/                          kind Experiment in experiment.yaml, notes in experiment.md, arms/<arm>/
flows/
  support_case/                                    the case workflow
    flow.yaml                                      kind Flow: input, output, node order
    nodes/
      prepare/prepare.node.yaml, prepare.py        a code step, run: "prepare"
      triage/triage.node.yaml, .inference.yaml, .prompt.md  an llm step with its own inference: no inference key (O15)
      vote/vote.node.yaml                          map
      vote/ballot.node.yaml, .inference.yaml, .prompt.md  the ballot inference
      tally/tally.node.yaml, tally.py
      intent/intent.node.yaml                      switch
      intent/escalate.node.yaml                    inference: "ballot"
      case_form/case_form.node.yaml, case_form.py
      record/record.node.yaml, record.py           a loop with its own stop policy
      record/extract.node.yaml, .inference.yaml, .prompt.md
      record/validate.node.yaml, validate.py
      to_record/to_record.node.yaml                narrow
      search_kb/search_kb.node.yaml                tool
      route/route.node.yaml                        switch
      route/resolve.node.yaml, .inference.yaml, .prompt.md
      drafts/drafts.node.yaml                      parallel
      drafts/gpt.node.yaml, mistral.node.yaml, gemini.node.yaml  inference: "revise"
      panel/panel.node.yaml                        call judge_panel
      polish/polish.node.yaml                      loop
      polish/revise.node.yaml, .inference.yaml, .prompt.md, .variants/lamp_guide/
      polish/critique.node.yaml, .inference.yaml, .prompt.md, .py
      illustrate/illustrate.node.yaml, .inference.yaml, .py  a level 3 prompt — a function in illustrate.py
      voice/voice.node.yaml, clip/clip.node.yaml   tool
      approvals/approvals.node.yaml                parallel
      approvals/lead.node.yaml, brand.node.yaml    human
      finalize/finalize.node.yaml, finalize.py
  judge_panel/                                     the judge panel workflow, called by the support_case/panel node
    flow.yaml                                      input PanelRequest, output PanelOutcome, the requires contract
    nodes/
      judges/judges.node.yaml, judges.py           parallel, with its own join policy
      judges/deepseek.node.yaml, qwen.node.yaml, llama.node.yaml  inference: "tie_break"
      aggregate/aggregate.node.yaml, aggregate.py
      decide/decide.node.yaml                      switch
      decide/tie_break.node.yaml, .inference.yaml, .prompt.md  the tie_break inference
      pick/pick.node.yaml, pick.py
```

The short form `triage/triage.node.yaml, .inference.yaml` in the tree means the files `triage/triage.node.yaml` and
`triage/triage.inference.yaml`. `aqven tree` prints the entities by kind with their file paths (its output is in
[README.md](README.md)).

Conventions (O15, O20):

- **A node's inference.** `<node>.inference.yaml` beside `<node>.node.yaml` is that node's inference, with no
  `inference` key. The key `inference: <id>` references an inference under another name and is needed only when the
  inference is reused. Both at once is `E_SOURCE_CONFLICT`.
- **The prompt.** With no `prompt` key, `<inference>.prompt.md` beside `<inference>.inference.yaml` is taken. An
  explicit `prompt` is a path to a `.md` (from the inference folder, `@flow/` from the workflow folder, `@root/` from
  the module root) or a function reference (level 3). Neither resolving is `E_PROMPT_MISSING`; an explicit path while
  a `<inference>.prompt.md` sits beside it is `W_PROMPT_SHADOWED`. The example has no explicit prompt path: every
  templated inference has its own `.prompt.md` beside it, and the only `prompt` key is the `illustrate_prompt`
  function.
- **Variants.** A `cases`/`default` value is a variant id from `<inference>.variants/<slot>/<variant>.md` beside the
  inference, or an explicit path to a `.md`. A file under the inference prefix that the prompt cannot reach is
  `E_ORPHAN_FILE`.
- **Include.** The path is resolved from the including file, from the inference folder or from the module root, and
  `@root/` from the root: `{% include "fragments/brand_voice" %}` and `{% include "fragments/untrusted_input" %}` find
  the root `fragments/` from any node depth and from the agent folder. The `@flow/` prefix in `include` is not
  accepted by the framework yet (§14). A fragment is static text with no variables. There are no prompt parts in the
  standard: the static parts `brand_voice` and `judge_protocol` are shared fragments, and the part with variables (the
  previous reply and the critique) is inlined in `nodes/polish/revise.prompt.md` under `{% if previous %}`.
- **Code references (O20).** Every `run`, `wait.poll`, level 3 `prompt` and `checks[].run` reference
  is written in the shortest form that works. The loader resolves it into an absolute reference from the file's
  location; the IR, the hashes and the run records store only the absolute reference, so moving a file changes nothing
  but the resolution.

  | Form | Resolves to | In the example |
  |---|---|---|
  | `<function>` | `@root/<folder>/<id>.py:<function>` — the file named after the declaring file's id, beside it, loaded by file path | `code` steps (`run: "prepare"` → `nodes/prepare/prepare.py`, `run: "validate_record"` → `nodes/record/validate.py`), your own policies (`run: "no_issues"` → `nodes/record/record.py`, `run: "agreeing_verdicts"` → `nodes/judges/judges.py`), a check (`run: "critique_consistent"` in `critique.inference.yaml` → `nodes/polish/critique.py`), a level 3 prompt (`prompt: "illustrate_prompt"` → `nodes/illustrate/illustrate.py`) |
  | `@root/<path>.py:<function>` | as written: a file from the module root, loaded by file path | — |
  | `@here.<module>:<function>` | a module in the YAML's folder, by import path | — |
  | `@flow.<path>:<function>` | an import path from the workflow folder the YAML sits in | — |
  | `@<flow_id>.<path>:<function>` | an import path from the workflow folder named by its id | — |
  | `@root.<path>:<function>` | an import path from the package root — shared code in `code/` and `tools/` | tools: `run: "@root.tools.functions:search_kb"`; an evaluator: `run: "@root.code.support_case:promises_match_resolution"` in `revise.inference.yaml` and in the `promises` check of three `reply_*` experiments |
  | `<package>.<module>:<function>` | as written | not in the example YAML; this is how `aqven refs` prints an absolute reference: `lumen.code.support_case:promises_match_resolution` |

  Diagnostics: `E_ALIAS_UNKNOWN` (an unknown `@name`), `E_ALIAS_RESERVED` (a workflow id of `here`, `flow` or `root`),
  `E_ALIAS_OUTSIDE_PACKAGE` (the folder of a dotted form is not importable), `E_CODE_NOT_FOUND` (no `<id>.py` beside
  it, or no such function in it), `E_CODE_REF_UNRESOLVED` (any other form failed to resolve).
- **Python.** A node's code is loaded by file path (`importlib.util.spec_from_file_location`) rather than by import
  path, so modules of the same name in different folders do not clash and node folders need no Python-identifier
  names. Dotted import paths and the `@root.`/`@flow.` aliases are for shared code in `code/` and `tools/`:
  `lumen.code.support_case`, `lumen.tools.functions`. Types and the input and output models of inferences, tools and
  `code` steps reach the code only from `lumen.types` (§9). The suffixes `.node.yaml`, `.inference.yaml`,
  `.instructions.md`, `.prompt.md`, `.variants/`, the `<id>.py` file, and the names `functions.py`, `code/`,
  `fragments/` and the type-kind subfolders are fixed by O22.

The host lives in the module itself: `lumen/app.py` (the ASGI app, mounting into another application, and calling the
workflow in process) and `lumen/__main__.py` (starting the server). At the project root sit `tests/`, `.mcp.json`,
`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.gitignore` (`lumen/types.py`, `.env`) and `pyproject.toml` with the single
`lumen` package and the module at the root — the layout of a project created by `aqven new`. The YAML conventions are
ADR-0026 §1 (block style, quoted strings, `apiVersion` and `kind` first, camelCase only for JSON Schema keywords, a
`description` on every field, and never a prompt as a string). The code is Python 3.14, pyright strict, with no
comments and no docstrings, flat, and the network only through `httpx2` via `ctx.http`.

## 4. The `support_case` workflow

`flows/support_case/flow.yaml`: `input: "CaseRequest"`, `output: "CaseOutcome"`, `context: [date, tenant_id]`, `order`
is the 18 nodes below, and `returns` maps the `CaseOutcome` fields from `$finalize.out.<field>`. A top-level node is
`nodes/<node>/<node>.node.yaml`, and its descendants sit flat beside it as `nodes/<node>/<child>.node.yaml`; in the
"Node" column a descendant is written `<node>/<child>`. An execution address is the expanded id joined by `__`
(`route__resolve`, `approvals__lead`) with `branch_key`, `iteration` and `item_index`. The function of a `code` step
lives in `<node>.py` beside the node file, referenced by the bare function name: `run: "prepare"` →
`nodes/prepare/prepare.py` (O20).

| # | Node | Kind | What it does | Patterns and constructs |
|---|---|---|---|---|
| 1 | `prepare` | code `run: prepare` | normalizes the text and derives `channel`, the category signals, the marketplace intake fields and three voting perspectives | preprocessing; a union input, `CaseOrigin` |
| 2 | `triage` | llm, its own `triage` inference @ `gemini` | parses the text and every attachment | Image/Audio/Video/Document input; level 2; cases 3 and 4; an allowed set by code (`SignalKey`); `triage.inference.yaml` beside the node |
| 3 | `vote` | map over `$prepare.out.perspectives`, `body: ballot`, `concurrency: 3`, `on_item_error {use: skip}` | three ballots from a cheap open model | map; self-consistency; a built-in item-error policy |
| 3a | `vote/ballot` | llm, its own `ballot` inference @ `llama`, `perspective: $item` | a ballot for the intent | a cheap model through OpenRouter; few-shot |
| 4 | `tally` | code `run: tally` | agreement when a majority (at least two) votes with confidence ≥ 0.6, otherwise `split` and the intent of the most confident ballot | merging |
| 5 | `intent` | switch on `$tally.out.agreement`: `agreed` binds from `tally` with `tier: "cheap"`; `split` runs the `escalate` node with `tier: "strong"` | the cheap → strong cascade | cascade; `switch` over an enum |
| 5a | `intent/escalate` | llm `inference: ballot` @ `deepseek` (no `perspective`) | the stronger model decides | one inference, different agents |
| 6 | `case_form` | code `run: case_form`, `intent: $intent.out.intent` | the `FieldSpec[]` of the form by intent: the fields match the matching `CaseRecord` variant, and `order_id`, `symptom` and `damage` reference the registry types `OrderId`, `DefectSymptom`, `DeliveryDamage` | a dynamic form |
| 7 | `record` | loop `body [extract, validate]`, `max_iter: 3`, `stop [{run: no_issues, with {path: $iter.validate.out.issues}}]`, `select {use: last}`, `record ← $iter.extract.out.record` | the form with a check and a repair driven by `Issue[]` | extract-validate-repair; case 5; its own stop policy |
| 7a | `record/extract` | llm, its own `extract` inference @ `gemini`, `feedback: $acc.validate.out.issues` | a `Dynamic` form filled against the schema | Image?/Document? on Google through OpenRouter |
| 7b | `record/validate` | code `run: validate_record` (`validate.py`), `today: $run.context.date` | the business rules of the form | a check; `code` with a `Dynamic` input; the run context |
| 8 | `to_record` | narrow `$record.out.record` → `CaseRecord` | narrowing a data-driven form into a union | narrow |
| 9 | `search_kb` | tool `search_kb` | knowledge base chunks (≤ 80) and policies (≤ 20) | HTTP through `httpx2`; retrieve |
| 10 | `route` | switch on `$to_record.out`: `defect` runs the `resolve` node; `delivery` and `question` bind a literal | routing by union variant | router; union + switch (case 2), `$case` |
| 10a | `route/resolve` | llm, its own `resolve` inference @ `resolver` | an agent decides the warranty case | function tools, an MCP tool, a subagent, tool approval, `limits`; an allowed set by code (`PolicyId`); a whole `Dynamic` slot |
| 11 | `drafts` | parallel `body {gpt, mistral, gemini}`, `join {use: quorum, with {min_ok: 2, on_error: skip}}`; `candidates` from `$ok[*].reply` | three reply drafts | diverge-merge; OpenAI, Mistral, Google |
| 11a–c | `drafts/{gpt,mistral,gemini}` | llm `inference: revise` @ the agent of the same name, `product: $input.product` | a reply with citations and lamp-kind advice | selection by index (`KbChunkId`, > 50); post-checks; grounding; the `lamp_guide` prompt variant |
| 12 | `panel` | call `judge_panel` | picking the best candidate | calling another workflow with a contract; the judge panel |
| 13 | `polish` | loop `body [revise, critique]`, `init {revise: [previous ← $panel.out.winner]}`, `max_iter: 3`, `stop [{use: threshold, with {path: $iter.critique.out.score, gte: 0.85}}, {use: stagnation, with {path, window: 1, min_delta: 0.02}}]`, `select {use: best, with {path: $iter.critique.out.score}}` | revision from critique | critic-revise; a single judge; built-in stop and select policies |
| 13a | `polish/revise` | llm, its own `revise` inference @ `gpt`, `previous: $acc.revise.out.reply`, `critique: $acc.critique.out` | the revision | the same inference the drafts use |
| 13b | `polish/critique` | llm, its own `critique` inference @ `mistral`, `reply: $revise.out.reply` | scoring grounding, agreement with the decision and completeness | a single judge from another family; the same inference is the experiments' judge (§10) |
| 14 | `illustrate` | llm, its own `illustrate` inference @ `painter` | the instruction image | Image output; level 3 (`prompt: illustrate_prompt` → `illustrate.py`); a fallback model |
| 15 | `voice` | tool `synthesize_voice` | the voice version of the reply | Audio output from a tool; `external` plus idempotency |
| 16 | `clip` | tool `render_clip` | a short clip from the image | Video output; a long-running job with `wait` |
| 17 | `approvals` | parallel `body {lead, brand}`, `join {use: all}` | the approvals | parallel waits on people |
| 17a | `approvals/lead` | human `ReplyApproval`, `support_lead`, 14400 s, `escalate` → `support_manager`, 7200 s | the reply and the decision | a form; `escalate` |
| 17b | `approvals/brand` | human `MediaApproval`, `brand_editor`, 86400 s, `default {use_image: false, use_voice: true, use_clip: false}` | the reply media | `default` |
| 18 | `finalize` | code `run: finalize` | the case number, the closing time and the outcome | merging; time and randomness inside a step |

The third timeout policy, `fail`, sits on the tool approval of the `resolver` agent (§6.2). The `route` branch
literals: `delivery` → `{action: "reship", summary: "The order is shipped again at the store's expense", credit: null,
policy: null}`, `question` → `{action: "advice", summary: "A knowledge base answer with no compensation", credit:
null, policy: null}`.

**A loop with no iteration block (O11).** The state of a pass is the outputs of the body nodes: in the loop's `stop`,
`select` and `out` that is `$iter.<node>.out`, and inside the body it is `$acc.<node>.out`, the outputs of the previous
pass (`null` on the first). `init.<node>` binds the inputs of a body node on the first pass, over its own `in`:
`polish__revise` revises the panel winner on the first pass and its own previous reply from the critique after that.
`$loop.iterations` and `$loop.stop_reason` are available in `out`. The order in which `init` overlays `in` is a
**proposal — not in an ADR**.

`llm` and `tool` nodes declare no types: the inputs and outputs come from the inference or the tool, and the node file
holds only the bindings `{name, from | value}`. An optional input `T?` may be left unbound and arrives as `null`.
**Proposal — not in an ADR** (the binding form; O7 fixes only that a node binds inputs).

## 5. The `judge_panel` workflow

The project's second workflow (O17): a reusable subgraph with a contract, called by the `support_case/panel` node
(`node: call`, `flow: "judge_panel"`). There is no separate "component" kind: the contract is the workflow's input,
output and `requires`.

`flows/judge_panel/flow.yaml`: `input: "PanelRequest"` (`summary: Text` 600, `candidates: ReplyDraft[]` 3,
`chunks: KbChunk[]` 80), `output: "PanelOutcome"` (`winner: ReplyDraft`, `verdict: PanelVerdict`), `returns` maps
`winner` ← `$pick.out.winner` and `verdict` ← `$pick.out.verdict`, and `order: [judges, aggregate, decide, pick]`. The
nodes read the workflow input as `$input.<field>`; the `in` bindings of the `call` node are checked against the fields
of `PanelRequest`, and `$panel.out` is a `PanelOutcome` record.

| Node | Kind | What |
|---|---|---|
| `judges` | parallel `body {deepseek, qwen, llama}`, `join {run: agreeing_verdicts, with {min_agree: 2}}`, `verdicts` from `$ok` | three judges with `inference: tie_break` @ `deepseek`, `qwen`, `llama`; the custom join policy in `judges.py`: done as soon as two of them pick the same candidate (the third is cancelled), otherwise it waits for all; fewer than two answering is an error |
| `aggregate` | code `run: aggregate` | the majority by `best_index`, the median scores, the spread, and `level: Agreement` |
| `decide` | switch on `$aggregate.out.level`: `agreed` binds `verdict` with `tie_broken: false`; `split` runs the `tie_break` node with `tie_broken: true` | the panel's decision |
| `decide/tie_break` | llm, its own `tie_break` inference @ `gpt` , `panel: $judges.out.verdicts` | the tie-break by an OpenAI model |
| `pick` | code `run: pick` | the candidate by `best_index` and the final `PanelVerdict` |

The `requires` contract: `families_distinct {nodes: [judges__deepseek, judges__qwen, judges__llama], min: 3}`;
`family_disjoint_from_input {nodes: [judges__deepseek, judges__qwen, judges__llama], input: candidates}`;
`field_before {nodes: [judges__deepseek, judges__qwen, judges__llama, decide__tie_break], first: rationale, second:
scores}`. The tie-break is run by `gpt`, a family one of the authors also uses (`drafts__gpt`), so `decide__tie_break`
is excluded from `family_disjoint_from_input`: the owner's decision of 2026-09-17 about the cheapest models removed
the fifth-family `grok` agent. A node's family is the family of its agent's model and of its fallbacks, by the profile
table (§6.4). The `nodes` key on `field_before` is a **proposal — not in an ADR** (03 §4.3).

## 6. Module registries

### 6.1. `aqven.yaml` — `kind: Project`

Keys: `description`, `package: "lumen"`, `providers[]`, `policies`, `limits?`, `renames?`. A provider is
`{id, api_key: ref:env/…, base_url?, data_policy {allows_pii, allows_sensitive, retention}, routing?}`; `id` is the
Pydantic AI provider name and the prefix of the model string. The provider keys are a **proposal — not in an ADR**
(O3 names only secret references and the base URL).

The owner's decision of 2026-09-17: the example runs on the cheapest OpenRouter models, so `aqven.yaml` kept a single
provider.

| Provider | Secret | `allows_pii` | `retention` | Other |
|---|---|---|---|---|
| `openrouter` | `ref:env/OPENROUTER_API_KEY` | true | unknown | `routing {data_collection: deny, zdr: false}` |

**Why `zdr: false`.** By `GET /api/v1/models/{id}/endpoints` and `GET /api/v1/endpoints/zdr` as of 2026-09-17, the
cheapest endpoints of some of the example's models are not ZDR: `google/gemini-2.5-flash-lite` is Google AI Studio
flex ($0.05/$0.20 per 1M tokens against $0.10/$0.40 on the ZDR Vertex endpoint),
`qwen/qwen3-30b-a3b-instruct-2507` is StreamLake (0.048/0.193 against 0.09/0.30), and `openai/gpt-oss-20b` is
Darkbloom; the `painter` fallback `openai/gpt-5-image-mini` is served only by OpenAI without ZDR. With `zdr: true` the
fallback is unavailable and the rest of the requests go to more expensive endpoints. `data_collection: deny` stays:
providers that train on requests are never selected. Request retention by providers is not guaranteed, hence
`retention: unknown`. The `zdr` flag in a request ORs with the OpenRouter account setting: a request cannot switch off
ZDR that the account has on. In the recorded cassettes the requests were served by DeepInfra, Darkbloom, Amazon
Bedrock, Groq, CoreWeave, Io Net, Google, StreamLake, Relace, SiliconFlow, Alibaba and OpenAI.

`policies`: `pii {mask_in_traces: true, redact: [email, phone, card_number, iban]}`,
`trust {default_in: untrusted}`.

### 6.2. Agents — `agents/<id>.yaml` or `agents/<id>/<id>.yaml`, `kind: Agent`

Below is `agents/resolver/resolver.yaml`: an agent with companion files lives in a folder.

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Decides a warranty case: order, case history, policy through a subagent, store credit with approval"
model: "openrouter:openai/gpt-oss-20b"
settings:
  temperature: 0.2
  max_tokens: 4000
output:
  mode: "native"
  strict: false
  retries: 3
instructions: "./resolver.instructions.md"
tools:
- "lookup_order"
- "issue_store_credit"
- "find_tickets"
subagents:
- name: "research_policy"
  description: "Researches store policy and precedents for the question"
  agent: "researcher"
  inference: "research_policy"
approval:
  tools:
  - "issue_store_credit"
  assignee: "support_lead"
  timeout_seconds: 3600
  on_timeout:
    policy: "fail"
limits:
  requests: 12
  tool_calls: 10
  tokens: 60000
  usd_micros: 80000
```

Keys: `model`, `fallback_models?`, `settings? {temperature, top_p, max_tokens, seed, provider_options}` (the names are
Pydantic AI's `ModelSettings`),
`output? {mode = auto|tool|native|prompted, strict = true, retries = 1, on_error = retry|fail|fallback,
on_refusal = fail|retry|fallback, on_truncated = fail|retry|fallback}`,
`instructions?` (the path `./<agent>.instructions.md` from the agent file, level 1), `tools?`, `mcp_servers?`,
`subagents?[] {name, description, agent, inference}` (a subagent's inference sits in the folder of the agent that
calls it: `agents/resolver/research_policy.inference.yaml`), `approval? {tools, assignee, timeout_seconds, on_timeout}`
(`default` is forbidden), `limits?`, and `capabilities? {family, input, output, strict}` — an override of the profile
table. The set of keys is O2; their names are a **proposal — not in an ADR**.

| Agent | Model | Family | `output` | Notable | Where |
|---|---|---|---|---|---|
| `gemini` | `openrouter:google/gemini-2.5-flash-lite` | google | `auto → tool`, strict false, retries 2 | `capabilities.input: [text, image, audio, video, document]`; temperature 0.2 | `triage`, `record__extract`, `drafts__gemini` |
| `llama` | `openrouter:meta-llama/llama-3.1-8b-instruct` | meta | `auto → tool`, strict false | temperature 0.2 | `vote__ballot`, and in `panel`: `judges__llama` |
| `mistral` | `openrouter:mistralai/mistral-nemo` | mistral | `auto → tool`, strict false, retries 2 | temperature 0.2; formerly the `claude` agent | `drafts__mistral`, `polish__critique`; the candidate reviser of `reply_noninferior_mistral` |
| `gpt` | `openrouter:openai/gpt-oss-20b` | openai | `auto → tool`, strict false, retries 4 | temperature 0.3, max_tokens 4000 | `drafts__gpt`, `polish__revise`, and in `panel`: `decide__tie_break` |
| `resolver` | `openrouter:openai/gpt-oss-20b` | openai | `native`, strict false, retries 3 | tools, an MCP tool, a subagent, approval (`fail`), `limits` (requests 12) | `route__resolve` |
| `researcher` | `openrouter:mistralai/mistral-nemo` | mistral | `auto → tool`, strict false | `mcp_servers: [helpdesk]` | the `resolver` subagent |
| `deepseek` | `openrouter:deepseek/deepseek-v4-flash-0731` | deepseek | `auto → tool`, strict false | temperature 0 | `intent__escalate`, `judges__deepseek`; the critique judge of the experiments |
| `qwen` | `openrouter:qwen/qwen3-30b-a3b-instruct-2507` | qwen | `tool` explicitly, strict false | temperature 0 | `judges__qwen` |
| `painter` | `openrouter:google/gemini-3.1-flash-lite-image` | google | `prompted` explicitly, strict false | `fallback_models: [openrouter:openai/gpt-5-image-mini]`; `capabilities {input: [text, image], output: [text, image]}` | `illustrate` |

The agent model table was approved by the owner on 2026-09-17: the cheapest OpenRouter model with the capabilities the
agent's nodes need. The exceptions and their reasons:

- `record__extract` moved from the former `claude` to `gemini`: `mistralai/mistral-nemo` takes text only, and the node
  needs `Image?` and `Document?` (`E_MODALITY_UNSUPPORTED`).
- `decide__tie_break` moved from the removed `grok` to `gpt`, and `intent__escalate` from `claude` to `deepseek`; the
  node `drafts__claude` was renamed to `drafts__mistral` by a `flow_patch` operation (`rename_node`), and the entry is
  in `renames` in `aqven.yaml`.
- The `painter` fallback is `openai/gpt-5-image-mini`: the only other model with image output that is no more
  expensive than the primary one per image (in the cassettes $0.0216 against $0.0337 for
  `gemini-3.1-flash-lite-image`).
- Output mode. `aqven models check` without `--live` covers every agent; `--live` on 2026-09-17 showed:
  `gemini-2.5-flash-lite` — tool, native and prompted all work; `mistral-nemo`, `deepseek-v4-flash-0731` and
  `llama-3.1-8b-instruct` — tool and prompted work, and Pydantic AI rejects native; `gpt-oss-20b` (all three) and
  `qwen3-30b-a3b-instruct-2507` (tool) were checked the same day while `output.mode` was implemented. `qwen` is pinned
  to `tool` explicitly: aqven's known-model table gives it `tool`, and pinning removes `W_OUTPUT_MODE_RESOLVED`.
  `resolver` on `tool` did not hold the final answer (text instead of a tool call, foreign keys, truncated JSON), so
  it was pinned to `native` rather than moved to a bigger model. `gpt` on `tool` flattens `reply` into a string on
  some attempts, so its retries went to 4 rather than the model being upgraded. `painter` is pinned to `prompted`: the
  mode does not matter for image output, and pinning removes the warning.

The identifiers, modalities and `structured_outputs` were checked against `https://openrouter.ai/api/v1/models` and
the model endpoints on 2026-09-17 (444 models).

### 6.3. Tools and MCP — `tools/<id>.yaml` `kind: Tool`, `mcp/<id>.yaml` `kind: McpServer`

A tool is a typed function: `run` (code) **or** `mcp {server, tool}`; plus `effect`, `idempotency_key?` (names of `in`
fields, required for `write`/`external`), `secrets?[] {name, ref}`, `wait? {poll, interval_seconds, timeout_seconds}`,
`in[]` and `out[]` (an MCP tool writes no `in`/`out`: the server supplies the schema). There are no determinism
classes and no TTL (O12): there is no cache, and replay and fork take the recorded step outputs; `effect` drives
retries, fork safety, test mode and approval. One and the same tool serves as a `node: tool` step (only with `run`)
and as an agent tool. One entry for both is a **proposal — not in an ADR**. The functions of every tool live in
`tools/functions.py`: tools are a project folder, so the shared HTTP helpers live next to them. Every tool references
them as `@root.tools.functions:<function>` (O20, O22).

| Tool | Source | `effect` | `in` | `out` |
|---|---|---|---|---|
| `search_kb` | `@root.tools.functions:search_kb` | read, secret `kb_token` ← `ref:env/LUMEN_KB_TOKEN` | `query: Text` (600), `category: ProductCategory`, `locale: Locale`, `tenant: TenantId` | `chunks: KbChunk[]` (80), `policies: Policy[]` (20) |
| `synthesize_voice` | `@root.tools.functions:synthesize_voice` | external, `idempotency_key: [text, locale]`, `openai_api_key` ← `ref:env/OPENAI_API_KEY` | `text: Text` (1500), `locale: Locale` | `voice: Audio` |
| `render_clip` | `@root.tools.functions:start_clip`, `wait {poll: @root.tools.functions:poll_clip, interval_seconds: 20, timeout_seconds: 1800}` | external, `idempotency_key: [image, text, seconds]`, `together_api_key` ← `ref:env/TOGETHER_API_KEY` | `image: Image`, `text: Text` (1500), `seconds: Int` 4..8 | `clip: Video` |
| `lookup_order` | `@root.tools.functions:lookup_order` | read, `orders_token` ← `ref:env/LUMEN_ORDERS_TOKEN` | `order_id: OrderId` | `order_id: OrderId`, `placed_on: Date`, `delivered_on: Date?`, `total: Money`, `items: ProductRef[]` (20) |
| `issue_store_credit` | `@root.tools.functions:issue_store_credit` | write, `idempotency_key: [customer_id, order_id]`, `orders_token` | `customer_id: CustomerId`, `order_id: OrderId`, `amount: Money` | `credit_id: Text` `^cr_[a-z0-9]{12}$`, `amount: Money` |
| `find_tickets` | `mcp {server: helpdesk, tool: search_tickets}` | read | — | — |

`mcp/helpdesk.yaml`: `transport: "streamable_http"`, `url: "https://helpdesk.lumen.example/mcp"`,
`headers: [{name: Authorization, value: ref:env/LUMEN_HELPDESK_TOKEN}]`. Generation: the voice is OpenAI
`POST /v1/audio/speech`, the clip is Together `POST /v2/videos` with polling; the speech model and the polling path
have not been verified.

### 6.4. The model profile table

A model's capabilities (`family`, `input`, `output`, `strict`) come from the built-in table `aqven.spec.profiles`,
keyed by the model string; an unknown model gets the "text only, no strict" profile, and its family comes from the
provider or the vendor prefix (`meta-llama/` → meta, `x-ai/` → xai, `moonshotai/` → moonshot, `deepseek/`,
`deepseek-ai/` → deepseek, `qwen/`, `Qwen/` → qwen, `z-ai/` → zhipu, `mistralai/` → mistral). An agent overrides it
with the `capabilities` key. The shape of the table is a **proposal — not in an ADR** (O3).

None of the example's models are in the table: the text models get the default profile with a family from the vendor
prefix, and `gemini` and `painter` declare `capabilities` themselves.

| Model | `input` | `output` | `strict` | Source |
|---|---|---|---|---|
| `openrouter:google/gemini-2.5-flash-lite` | text, image, audio, video, document | text | false | the `capabilities` of the `gemini` agent |
| `openrouter:google/gemini-3.1-flash-lite-image`, `openrouter:openai/gpt-5-image-mini` | text, image | text, image | false | the `capabilities` of the `painter` agent |
| `openrouter:openai/gpt-oss-20b`, `openrouter:mistralai/mistral-nemo`, `openrouter:deepseek/deepseek-v4-flash-0731`, `openrouter:qwen/qwen3-30b-a3b-instruct-2507`, `openrouter:meta-llama/llama-3.1-8b-instruct` | text | text | false | the default profile |

### 6.5. Inferences — `<id>.inference.yaml`, `kind: Inference`

An inference's id is the file name up to the first dot. The inference sits beside the node that owns it, under that
node's name, and takes its id (`triage`, `ballot`, `extract`, `resolve`, `revise`, `critique`, `illustrate`,
`tie_break`); other nodes, experiment checks and arms name a shared inference with `inference: <id>` (§3). A
subagent's inference sits in the folder of the agent that calls it (`research_policy` in `agents/resolver/`). Below is
a fragment of `flows/support_case/nodes/polish/revise.inference.yaml`: the `product` and `chunks` inputs, the output
and every key except some of the checks.

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "A customer reply from the decision and the knowledge-base chunks, with citations; when a previous version exists, a revision from the critique"
in:
- name: "product"
  type: "ProductRef?"
  description: "The product of the case; the lamp kind picks the advice variant, null means no product was given"
- name: "chunks"
  type: "KbChunk[]"
  description: "Knowledge base chunks, the only source of facts and quotes"
  maxItems: 80
out:
- name: "reply"
  type: "ReplyDraft"
  description: "The reply text and the chunk quotes it relies on"
variants:
  lamp_guide:
    on: "product.lamp_kind"
    cases:
      mains: "mains"
      rechargeable: "rechargeable"
      smart_wifi: "smart_wifi"
      smart_zigbee: "smart_zigbee"
    default: "unknown"
allowed_sets:
- type: "KbChunkId"
  from: "$in.chunks[*].chunk_id"
  labels_from: "$in.chunks[*].title"
checks:
- use: "citations_in_sources"
  with:
    citations: "$out.reply.citations"
    sources: "$in.chunks"
    id: "chunk_id"
    quote: "quote"
    text: "text"
  on_fail: "retry"
- run: "@root.code.support_case:promises_match_resolution"
  on_fail: "retry"
```

Keys: `description`, `in[]`, `out[]` (at least one field, the output is bounded), `prompt?`, `variants?`,
`allowed_sets?[] {type, from, labels_from?}` rooted at `$in`, `examples?[] {name, in, out}` (the values are validated
by the `in`/`out` models, and the adapter inserts the user/assistant pairs after the system messages), and `checks?[]`.
`schema_from` on a `Dynamic` output is also a path from `$in`. An include path is resolved from the including file,
the inference folder or the module root (§3): `{% include "fragments/<name>" %}` is a shared root fragment (static
text). The set of keys is O7; their names, the `$in`/`$out` roots and the insertion of examples are a
**proposal — not in an ADR**.

**The prompt: convention and override (O8, O18).** With no `prompt` key, the level 1 or 2 prompt is
`<inference>.prompt.md` beside `<inference>.inference.yaml`, and the level follows from its content. An explicit
`prompt` is a path to a `.md` anywhere (from the inference file, `@flow/` or `@root/`, as `prompt: "@root/<path>.md"`)
or a level 3 function reference in any O20 form (`prompt: "illustrate_prompt"`). Neither resolving is
`E_PROMPT_MISSING`; an explicit path while a `<inference>.prompt.md` sits beside it is the warning
`W_PROMPT_SHADOWED`.

**Prompt variants (O10, O18).** `variants.<slot> {on, cases, default?}`: `on` is a path from the inference input
(`product.lamp_kind`), `cases` maps a value to a variant, and `default` is the variant for every other value and for
`null`. A variant is the id of the file `<inference>.variants/<slot>/<variant>.md` beside the inference, or an
explicit path to a `.md`; it is rendered with the same inputs and obeys the same level 2 rules;
`<inference>.prompt.md` prints the chosen variant through `{{ variants.<slot> }}` and contains no selection logic
(small differences in wording are `{% if %}` and `{% case %}` inside the prompt). Checks: every variant from `cases`
and `default` exists as a file, and every file is named (`E_VARIANT_MISSING`, `E_ORPHAN_FILE`); `on` is an enum or
Text input; an enum is covered by `cases` or there is a `default`, and for `T?` a `default` is required
(`E_VARIANT_NOT_EXHAUSTIVE`); the variants and the prompt read inputs only, and the prompt prints every slot; the
`on` selector counts as using that input. A run records the chosen variant per slot. A selection more complex than
equality on one input means a level 3 prompt.

**Post-checks are evaluators (O5, O9, O11).** A check is a reference to an evaluator: a built-in `use: <id>` with
`with`, your own `run: module:function` with an optional `with`, or a judge `inference` + `agent` (the judge's inputs
bind by name to the `in` and `out` of the inference under review, and the score is the `score` field of its output);
`on_fail` and an optional `threshold` sit beside it. The same reference without `on_fail`, with an `id` and a
`kind`, is an experiment check (§10).
The evaluator contract (`aqven.policies.Evaluator`) is
`(value: <out model>, context: EvalContext[<in model>, <out model>], params: <with model>) -> Verdict {passed, score?, reason?}`;
the `in` and `out` models are the generated `<Inference>In` and `<Inference>Out` from `lumen.types` (`ReviseIn`,
`ReviseOut`), and the parameter model is the function's last parameter, `NoParams` for your own checks with no
parameters. Order of execution: Pydantic validation → allowed set → the checks in declaration order. `retry` raises
`ModelRetry(reason)` against the agent's `output.retries`; `fail` fails the node; `flag` lets the value through and
writes a `CheckOutcome` into the execution.

| Built-in | `with` |
|---|---|
| `not_empty` | `field` |
| `max_words` | `field`, `max` |
| `language` | `field`, `locale` (a path to a `Locale`) |
| `no_pii` | `fields[]`, `detectors?[]` (every detector by default) |
| `regex` | `field`, `pattern` |
| `unique_items` | `field` (a list of records), `key` |
| `ids_in_allowed_set` | `field`, `allowed` |
| `citations_in_sources` | `citations`, `sources`, `id`, `quote`, `text` |
| `expected` | `fields?[]` — compares the output with the case's `expected_output` (experiment checks) |
| `cost_usd`, `latency_ms` | — (run metrics, for experiment checks) |

### 6.6. Policies (O9)

Every place where the language picks an algorithm has one reference form (Strategy + Registry): exactly one of
`use: <built-in>` and `run: module:function`, with the parameters in `with`. The built-ins are ordinary
`aqven.policies` functions under their own ids with the same slot contract, so a built-in and your own are
interchangeable. Policies are pure (no I/O, no time, no randomness): the executor records their inputs and decisions,
and replay and fork reproduce them.

| Slot | Node | Contract | Built-ins and their `with` | In the example |
|---|---|---|---|---|
| `join` | parallel | `(state: JoinState[T], params) -> Wait \| Done[T] \| Fail`; called after every finished branch, with `state` holding the finished branches in completion order (key, value or error) and the keys of those still pending; `Done` and `Fail` cancel the pending ones | `all`, `any`, `first_success`, `quorum {min_ok, on_error: skip \| fail}` | `drafts` uses `quorum`, `approvals` uses `all`, `judges` uses its own `agreeing_verdicts {min_agree}` |
| `stop[]` | loop | `(state: LoopState, params) -> Continue \| Stop(reason)`; the loop stops as soon as any policy returns `Stop`; `max_iter` is the structural limit | `threshold {path, gte \| lte}`, `stagnation {path, window, min_delta}` | `polish` uses `threshold` and `stagnation`, `record` uses its own `no_issues {path}` |
| `select` | loop | `(state: LoopState, params) -> int` — the index of the chosen pass | `last`, `best {path}` | `record` uses `last`, `polish` uses `best` |
| `on_item_error` | map | `(item: T, error: MapItemError, params) -> Skip \| Fail \| Default[O]` | `skip`, `fail`, `default {value}` | `vote` uses `skip` |
| `checks[]` | inference, experiment | an evaluator, §6.5 | §6.5 | §7, §10 |

There is no separate `on_branch_error`: handling branch errors is a parameter of the `join` policy. Checks: the
reference resolves (`E_POLICY_UNKNOWN`, `E_CODE_REF_UNRESOLVED`), exactly one of `use` and `run` is set, `with`
validates against the function's parameter model (`E_POLICY_PARAMS`, or `E_CHECK_PARAMS` for evaluators), and the
signature matches the slot contract and the node's types: `T` in `join` is the branch output, `O` in `on_item_error`
is the map body output, and an evaluator's `value` and `context` are the `out` and `in` models of the inference
(`E_CODE_SIGNATURE_MISMATCH`); the `RefPath` paths in `with` resolve in the node's scope, and for built-ins their type
is checked too (`threshold` wants a number, `max_words` wants Text).

The example's own policies live in `<node>.py` beside the node that uses them, referenced by the bare name:
`flows/judge_panel/nodes/judges/judges.py` —
`agreeing_verdicts(state: JoinState[JudgeVerdict], params: AgreementParams) -> JoinDecision[JudgeVerdict]`;
`flows/support_case/nodes/record/record.py` — `no_issues(state: LoopState, params: EmptyListParams) -> StopDecision`.

## 7. The inferences of the example

The paths in the "Files" column are relative to `flows/support_case/nodes/`, except for `tie_break` and
`research_policy`.

| Inference (files) | Level | `in` | `out` | Notable | Agents |
|---|---|---|---|---|---|
| `triage` (`triage/triage.inference.yaml`, `.prompt.md`) | 2 | `message: Text` (4000), `channel: Channel`, `customer: Customer`, `product: ProductRef?`, `signals: SignalDef[]` (20), `intake_fields: FieldSpec[]` (10), `photo: Image?`, `voice_note: Audio?`, `video: Video?`, `invoice: Document?` | `summary: Text` (600), `category: ProductCategory`, `observations: Observation[]` (12), `safety_risk: Bool`, `intake_extra: Dynamic` (`schema_from: $in.intake_fields`, `limits {max_fields 10, max_depth 1, max_text_length 200, max_items 5}`) | the allowed set `SignalKey` ← `$in.signals[*].key` / `label`; checks (parameters in `with`) `unique_items {field: $out.observations, key: key}` retry and `not_empty {field: $out.summary}` retry; `{% message %}`, `{% case channel %}`, `{% if %}` over the media and `product`, `{% for %}` over `signals` and `intake_fields`, and the fragments `fragments/safety_escalation`, `fragments/untrusted_input` | `gemini` |
| `ballot` (`vote/ballot.inference.yaml`, `.prompt.md`) | 2 | `summary: Text` (600), `observations: Observation[]` (12), `safety_risk: Bool`, `perspective: VotePerspective?` | `rationale: Text` (300), `intent: CaseIntent`, `confidence: Score` | `{% if perspective %}{% case perspective %}` with no `else`; two `examples` (`flicker_defect`, `crushed_box`); the fragment `fragments/untrusted_input` | `llama`, `deepseek` |
| `extract` (`record/extract.inference.yaml`, `.prompt.md`) | 2 | `message: Text` (4000), `summary: Text` (600), `form_fields: FieldSpec[]` (30), `feedback: Issue[]?` (10), `photo: Image?`, `invoice: Document?` | `record: Dynamic` (`schema_from: $in.form_fields`, `limits {max_fields 30, max_depth 2, max_text_length 400, max_items 10}`) | `{% for %}` over the form fields and the remarks; dates as YYYY-MM-DD; the fragment `fragments/untrusted_input` | `gemini` |
| `resolve` (`route/resolve.inference.yaml`, `.prompt.md`) | 2 | `customer: Customer`, `order_id: OrderId`, `symptom: DefectSymptom`, `purchased_on: Date?`, `safety_risk: Bool`, `intake_extra: Dynamic`, `policies: Policy[]` (20) | `resolution: Resolution` | the allowed set `PolicyId` ← `$in.policies[*].policy_id` / `title` (codes `prefixed_ordinal`); `{{ intake_extra }}` as a whole; the fragments `fragments/untrusted_input` and `fragments/safety_escalation` under `{% if safety_risk %}` | `resolver` |
| `research_policy` (`agents/resolver/research_policy.inference.yaml`, `.prompt.md`) | 1 | `question: Text` (500), `category: ProductCategory` | `answer: Text` (800), `sources: Text[]` (5 × 120) | one block of instruction text with no variables; the prompt sits beside the inference by convention | `researcher` |
| `revise` (`polish/revise.inference.yaml`, `.prompt.md`, `.variants/`) | 2 | `summary: Text` (600), `customer: Customer`, `locale: Locale`, `channel: Channel`, `product: ProductRef?`, `resolution: Resolution`, `chunks: KbChunk[]` (80), `previous: ReplyDraft?`, `critique: Critique?` | `reply: ReplyDraft` | selection by index over `KbChunkId`; the `lamp_guide` variant slot by `product.lamp_kind`: `revise.variants/lamp_guide/{mains,rechargeable,smart_wifi,smart_zigbee,unknown}.md`, `default: unknown`; checks `citations_in_sources` retry, `max_words {field: $out.reply.text, max: 220}` retry, `no_pii {fields: [$out.reply.text]}` fail, `language {field: $out.reply.text, locale: $in.locale}` flag, `run: @root.code.support_case:promises_match_resolution` retry; the fragments `fragments/brand_voice`, `fragments/citation_rules`, `fragments/untrusted_input`; the previous version and the critique sit under `{% if previous %}` | `gpt`, `mistral`, `gemini` |
| `tie_break` (`flows/judge_panel/nodes/decide/tie_break.inference.yaml`, `.prompt.md`) | 1 | `summary: Text` (600), `candidates: ReplyDraft[]` (3), `chunks: KbChunk[]` (80), `panel: JudgeVerdict[]?` (3) | `rationale: Text` (600), `scores: CriterionScore[]` (3), `best_index: Int` 0..2 | the reasoning comes before the scores | `deepseek`, `qwen`, `llama`, `gpt` |
| `critique` (`polish/critique.inference.yaml`, `.prompt.md`, `.py`) | 2 | `summary: Text` (600), `resolution: Resolution`, `chunks: KbChunk[]` (80), `reply: ReplyDraft` | `rationale: Text` (600), `score: Score`, `blocking: Text[]` (5 × 200) — the fields of `Critique` | the fragments `fragments/judge_protocol`, `fragments/citation_rules`, `fragments/untrusted_input`; the check `run: critique_consistent` (`critique.py`) flag; as the judge check of the experiments its inputs are found by name and the score is `score` | `mistral`, `deepseek` (experiments) |
| `illustrate` (`illustrate/illustrate.inference.yaml`, `.py`) | 3 | `text: Text` (1500), `category: ProductCategory`, `photo: Image?` | `image: Image` | `prompt: illustrate_prompt` (`illustrate.py` beside it); the adapter appends the media | `painter` |

Level 2 obeys the rules of ADR-0029 §8: every variable is an input, every input is used, `{{ output_format }}` appears
exactly once, media appear only inside conditions, `case` has no `else`, `for` is one level deep and only over an
array with `maxItems`, there are no filters, and `message` sits at the top level.

## 8. Types

A type file is `types/<kind>/<snake_name>.yaml`, and the id is the PascalCase name. There is one `types/` folder, at
the module root; workflows, nodes and inferences have none. The subfolder is the type kind (O21, O22):

| Folder | Types |
|---|---|
| `types/enums/` (17) | `Agreement`, `ApprovalDecision`, `CascadeTier`, `CaseIntent`, `CaseStatus`, `Channel`, `CurrencyCode`, `CustomerTier`, `DefectSymptom`, `DeliveryDamage`, `IssueSeverity`, `LampKind`, `Marketplace`, `ProductCategory`, `ReplyCriterion`, `ResolutionAction`, `VotePerspective` |
| `types/ids/` (6) | `CustomerId`, `KbChunkId`, `OrderId`, `PolicyId`, `SignalKey`, `SkuId` |
| `types/records/` (23) | `CaseOutcome`, `CaseRequest`, `Citation`, `CriterionScore`, `Critique`, `Customer`, `IntentBallot`, `Issue`, `JudgeVerdict`, `KbChunk`, `MediaApproval`, `Money`, `Observation`, `PanelOutcome`, `PanelRequest`, `PanelVerdict`, `Policy`, `ProductRef`, `ReplyApproval`, `ReplyDraft`, `ReplyMedia`, `Resolution`, `SignalDef` |
| `types/unions/` (2) | `CaseOrigin`, `CaseRecord` |
| `types/values/` (1, constrained scalars) | `Score` |

`Customer` is `pii: pii`, with `customer_id`, `display_name`, `email?`, `tier`, `locale`. `LampKind` is the enum
`mains`, `rechargeable`, `smart_wifi`, `smart_zigbee` (O10). `ProductRef` is `sku`, `name`, `category`,
`lamp_kind: LampKind?` (`null` for accessories). `Score` is a Float 0..1. `Issue` is `path: Text[]` (8 × 64), `code`,
`message`, `severity: IssueSeverity`, `expected?`, `observed?`, `repair_hint?`.

| Type | Kind | Fields or values |
|---|---|---|
| `Marketplace` | enum | amazon, ozon |
| `CaseOrigin` | union `kind` | `storefront {page: Text 200}`, `marketplace {marketplace: Marketplace, order_ref: Text 40}` |
| `CaseRequest` | record | `customer: Customer`, `origin: CaseOrigin`, `message: Text 4000`, `order_id: OrderId?`, `product: ProductRef?`, `tags: Text[]` (5 × 40), `urgent: Bool`, `photo: Image?`, `voice_note: Audio?`, `video: Video?`, `invoice: Document?` |
| `Channel` | enum | storefront, amazon, ozon |
| `SignalKey` | id | `pattern ^[a-z][a-z0-9_]{0,39}$`, `allowed_set: dynamic`, `code_format: identity` |
| `SignalDef` | record | `key: SignalKey`, `label: Text 80` |
| `Observation` | record | `key: SignalKey`, `value: Text 200` |
| `VotePerspective` | enum | words, evidence, risk |
| `CaseIntent` | enum | defect, delivery, question |
| `IntentBallot` | record | `rationale: Text 300`, `intent: CaseIntent`, `confidence: Score` |
| `Agreement` | enum | agreed, split |
| `CascadeTier` | enum | cheap, strong |
| `DefectSymptom` | enum | no_power, flicker, dead_segment, overheating, app_offline, physical_damage |
| `DeliveryDamage` | enum | crushed_box, broken_item, missing_item |
| `CaseRecord` | union `kind` | `defect {order_id: OrderId, symptom: DefectSymptom, purchased_on: Date?, safety_risk: Bool}`, `delivery {order_id: OrderId, damage: DeliveryDamage, carrier_ref: Text? 40}`, `question {topic: Text 200, order_id: OrderId?}` |
| `KbChunkId` | id | `pattern ^kb_[a-z0-9]{10}$`, `allowed_set: dynamic` |
| `KbChunk` | record | `chunk_id: KbChunkId`, `title: Text 120`, `text: Text 1500` |
| `PolicyId` | id | a UUID `pattern`, `allowed_set: dynamic`, `code_format: prefixed_ordinal` |
| `Policy` | record | `policy_id: PolicyId`, `title: Text 120`, `text: Text 1200` |
| `ResolutionAction` | enum | store_credit, replacement, reship, advice |
| `Resolution` | record | `action: ResolutionAction`, `summary: Text 400`, `credit: Money?`, `policy: PolicyId?` |
| `Citation` | record | `chunk_id: KbChunkId`, `quote: Text 300` |
| `ReplyDraft` | record | `text: Text 1500`, `citations: Citation[]` (6) |
| `Critique` | record | `rationale: Text 600`, `score: Score`, `blocking: Text[]` (5 × 200); the input `revise.critique` ← `$acc.critique.out` is the output of the `critique` inference with the same fields |
| `ReplyCriterion` | enum | grounded, helpful, tone |
| `CriterionScore` | record | `criterion: ReplyCriterion`, `score: Int` 1..5 |
| `JudgeVerdict` | record | `rationale: Text 600`, `scores: CriterionScore[]` (3), `best_index: Int` 0..2 |
| `PanelVerdict` | record | `verdict: JudgeVerdict`, `tie_broken: Bool`, `spread: Float` 0..4 |
| `PanelRequest` | record | `summary: Text 600`, `candidates: ReplyDraft[]` (3), `chunks: KbChunk[]` (80) — the input of the `judge_panel` workflow |
| `PanelOutcome` | record | `winner: ReplyDraft`, `verdict: PanelVerdict` — the output of the `judge_panel` workflow |
| `ApprovalDecision` | enum | approve, edit, reject |
| `ReplyApproval` | record | `decision: ApprovalDecision`, `edited_text: Text? 1500`, `note: Text? 400` |
| `MediaApproval` | record | `use_image: Bool`, `use_voice: Bool`, `use_clip: Bool` |
| `CaseStatus` | enum | sent, rejected |
| `ReplyMedia` | record | `image: Image?`, `voice: Audio?`, `clip: Video?` |
| `CaseOutcome` | record | `case_ref: Text` `^CASE-[0-9A-HJKMNP-TV-Z]{26}$`, `status: CaseStatus`, `intent: CaseIntent`, `tier: CascadeTier`, `record: CaseRecord`, `resolution: Resolution`, `reply: ReplyDraft?`, `media: ReplyMedia`, `closed_at: DateTime` |

## 9. The module's code

**One source of types (O19, O22).** Types are described only by `kind: Type` files; the Pydantic models for the code
are generated, never hand-written. `aqven generate` (which `aqven check` calls too) writes into `types.py` at the
module root the models of every type in the module and of the inputs and outputs of every inference —
`<Inference>In` and `<Inference>Out` (`TriageIn`, `ReviseOut`, `ResearchPolicyIn`, `TieBreakOut`); of every tool with
`run` — `<Tool>In` and `<Tool>Out` (`SearchKbOut`, `IssueStoreCreditOut`, `RenderClipOut`); and of every `code` step —
`<Workflow><Node>In` and `<Workflow><Node>Out` (`SupportCasePrepareOut`, `JudgePanelAggregateOut`), because a node id
is unique only within its workflow. A file that has drifted from the definitions is the warning `W_GENERATED_STALE`
(hand edits: the file is generated, edits are overwritten, change the YAML instead). The first line of the file is the
only comment allowed:
`# Generated by aqven generate. DO NOT EDIT: changes are overwritten; edit the YAML and run aqven generate.`
`types.py` is in the example's `.gitignore` and does go into the wheel (uv_build does not read `.gitignore`), so
`aqven generate` runs before `uv build`. The `types/` folder has no `__init__.py`: otherwise it shadows `types.py` and
`aqven check` reports `E_TYPES_PACKAGE`. The module folder itself must not be on `sys.path` or `PYTHONPATH`:
`types.py` would shadow the standard library's `types` module — `W_TYPES_SHADOWS_STDLIB`. Before the tests the file is
regenerated by the `aqven` pytest plugin from the host's `aqven_project` ini setting, before `tests/conftest.py` is
imported. The generator mirrors the grammar of type references: a record becomes a `BaseModel` with
`GENERATED_CONFIG` (`extra="forbid"`, `frozen=True`, `revalidate_instances="always"`, `serialize_by_alias=True`), an
enum becomes `type X = Literal[...]`, an id becomes `X = NewType("X", str)` plus
`type XField = Annotated[X, StringConstraints(...)]`, a value becomes `type X = Annotated[float, Field(...)]`, and a
union becomes variant classes `<Type><Variant>` (`CaseRecordDefect`) with the discriminator first plus
`type X = Annotated[A | B, Field(discriminator="kind")]`. The code imports types and the input and output models of
inferences, tools and steps from `lumen.types`; media, `FieldSpec`, `DynamicValue`, `Locale`, `TenantId`,
`RenderedPrompt` and `GENERATED_CONFIG` from `aqven.spec`; `EvalContext`, `Verdict`, `NoParams`, `RefPath`,
`JoinState`, `LoopState` and the policy decisions from `aqven.policies`; and `ToolContext`, `JobHandle`, `JobPoll`
from `aqven.runtime`. There are no hand-written copies of types or of input and output models anywhere, and
`aqven check` compares the normalized schemas of a function's annotations against `in`/`out`. A step whose output
schema equals a registry type returns that type: `pick` returns `PanelOutcome`, `finalize` returns `CaseOutcome`.
Hand-written models remain only for shapes the YAML does not declare: the parameters of your own policies
(`AgreementParams`, `EmptyListParams`) and the Together video API response in `tools/functions.py` (`VideoJob`,
`VideoOutputs`, `VideoError`). A `FieldSpec` in the code references a registry type by its id (`OrderId`,
`DefectSymptom`, `DeliveryDamage`): the constraints and enum values come from the type, and copies of them inside the
`FieldSpec` are `E_TYPE_CONSTRAINT_MISMATCH`.

A function lives in `<id>.py` beside the file of the entity that uses it; Python used in several places lives in
`code/<module>.py`; and the tool functions live in `tools/functions.py`. The node paths below are relative to
`flows/<workflow>/nodes/`:

| Module | Reference in the YAML | Functions |
|---|---|---|
| `tools/functions.py` | `@root.tools.functions:<function>` on every tool | `async search_kb(ctx, query, category, locale, tenant) -> SearchKbOut`, `async synthesize_voice(ctx, text, locale) -> SynthesizeVoiceOut`, `async start_clip(ctx, image, text, seconds) -> JobHandle`, `async poll_clip(ctx, job) -> JobPoll[RenderClipOut]`, `async lookup_order(ctx, order_id) -> LookupOrderOut`, `async issue_store_credit(ctx, customer_id, order_id, amount) -> IssueStoreCreditOut` |
| `code/support_case.py` | `@root.code.support_case:promises_match_resolution` — in the `checks` of the `revise` inference; `@root.code.support_case:reply_keeps_resolution` — the `promises` check of three `reply_*` experiments | the evaluators `promises_match_resolution(value: ReviseOut, context: EvalContext[ReviseIn, ReviseOut], params: NoParams) -> Verdict` and `reply_keeps_resolution(value: BaseModel, context: EvalContext[BaseModel, BaseModel], params: NoParams) -> Verdict`, which reads the reply text from the range output and the decision from `context.metadata["node_outputs"]["route"]` |
| `support_case`: `prepare/prepare.py` | `prepare` | `prepare(request) -> SupportCasePrepareOut` |
| `support_case`: `tally/tally.py` | `tally` | `tally(ballots) -> SupportCaseTallyOut` |
| `support_case`: `case_form/case_form.py` | `case_form` | `case_form(intent) -> SupportCaseCaseFormOut` |
| `support_case`: `record/record.py` | `no_issues` | the policy `no_issues(state: LoopState, params: EmptyListParams) -> StopDecision` |
| `support_case`: `record/validate.py` | `validate_record` | `validate_record(record: DynamicValue, fields, today) -> SupportCaseValidateOut` |
| `support_case`: `polish/critique.py` | `critique_consistent` | the evaluator `critique_consistent(value: CritiqueOut, context: EvalContext[CritiqueIn, CritiqueOut], params: NoParams) -> Verdict` |
| `support_case`: `illustrate/illustrate.py` | `illustrate_prompt` | the level 3 prompt `illustrate_prompt(text, category) -> RenderedPrompt` |
| `support_case`: `finalize/finalize.py` | `finalize` | `finalize(intent, tier, record, resolution, reply, lead, media, image, voice, clip) -> CaseOutcome` |
| `judge_panel`: `judges/judges.py` | `agreeing_verdicts` | the policy `agreeing_verdicts(state: JoinState[JudgeVerdict], params: AgreementParams) -> JoinDecision[JudgeVerdict]` |
| `judge_panel`: `aggregate/aggregate.py` | `aggregate` | `aggregate(verdicts) -> JudgePanelAggregateOut` |
| `judge_panel`: `pick/pick.py` | `pick` | `pick(candidates, verdict, tie_broken, spread) -> PanelOutcome` |

The parameters of a level 3 function are the non-media inputs of the inference; the parameters of a step are the
node's `in`; a tool takes `ctx` plus the tool's `in`; an evaluator takes `value`, `context` and `params`; and a policy
follows its slot contract (§6.6). **Proposal — not in an ADR** (ADR-0026 §5 fixes only the `code` step).

## 10. Quality, people and policies

- **PII and trust.** `Customer` is `pii`; slots that carry it go only to agents whose providers (the model and its
  fallbacks) allow PII. There is one provider, OpenRouter, with `allows_pii: true`; `llama` by construction receives
  only the summary, the observations and the candidates, and a negative test for `E_PII_PROVIDER` switches
  `allows_pii` off in a copy of `aqven.yaml`. `trust.default_in: untrusted` and the `untrusted_input` fragment appear
  in every prompt that carries customer text.
- **People.** The forms are `ReplyApproval` and `MediaApproval`; the policies are `escalate` (`lead`), `default`
  (`brand`) and `fail` (the approval of `issue_store_credit`, a wait with `wait_kind: tool_approval` at the address
  `route__resolve`, `branch_key: defect`). Scripted answers come from `ScriptedHuman`, and the fork happens at
  `approvals__lead` (`branch_key: lead`).
- **Cassettes.** `tests/cassettes/support_case/<scenario>/`, `replay_strict`, `ALLOW_MODEL_REQUESTS = False`
  (ADR-0029 §5). The `vote` ballots differ by their `perspective` input: identical requests within one run would share
  a cassette key (`AMBIGUOUS_REPLAY`, ADR-0029 §1), and O2 does not allow a seed on a node. All five scenarios were
  recorded on 2026-09-17 against the agents' own models with `AQVEN_LIVE=1` (`record_new`):

  | Scenario | Input | What it covers |
  |---|---|---|
  | `question_agreed` | a question about 5 GHz Wi-Fi from the storefront, with no attachments | the ballots agree → `tier: cheap`, a `question` form, `advice`, `sent` |
  | `defect_split_vote` | `lumen/samples/case_request.json`: a dented box, flicker and a warm controller, the question "did I wire it wrong or was it damaged in delivery?", an order date with the typo `03.09.2027`, and an invoice with no date | the ballots diverge: the test sets them directly through `node_output("vote__ballot", …, item_index=…)` — `defect`, `delivery`, `question` → `intent__escalate` @ `deepseek` → `tier: strong`; the first form takes the future date, `validate_record` reports `purchase_in_future`, and the second returns `null`: two passes of `record__extract`; `store_credit` after approval |
  | `tool_approval_denied` | the same input; the `issue_store_credit` approval is refused with a reason | a decision without `store_credit`; the `illustrate` node is replaced by a scripted `FunctionModel` (`test_denied_tool_approval_withholds_credit_with_scripted_painter`): the recording budget is at most three image generations |
  | `painter_fallback` | the same input, with a `provider_fault` on the primary `painter` model | `illustrate` is answered by `openai/gpt-5-image-mini` |
  | `fork_lead_reject` | the same input; the lead approves the reply through `resume`, and a fork from `approvals__lead` rejects it | `status: rejected`, `reply: null` |

  The four defect scenarios share every request up to the tool approval: the `defect_split_vote` cassettes were copied
  into the other three before recording, and the files left unused after recording were removed by following the
  replay load trace. The `clip` and `voice` tools stay `MockTransport` stubs, and the helpdesk MCP stays an
  `McpToolStub`. The engine is stopped after every test: DBOS installs its own thread pool as the event loop's
  default, and anyio closes it at the end of the test.
- **Experiments (ADR-0047).** An experiment is subject × variants × cases × checks × question, in
  `experiments/<experiment>/experiment.yaml`, with its id taken from the folder. The subject is a workflow
  (`flow`), a range of its top-level nodes (`from`, `to`; the nodes above the range take their outputs from the case
  `node_outputs`), or an arm — a small workflow in `experiments/<experiment>/arms/<arm>/` that only this experiment
  runs. A variant assigns agents to nodes (`agents: {<node>: <agent>}`) or picks another arm; it never names a bare
  model. The cases are a dataset in `datasets/`, selected by `tags`; `name` is the case key. The checks are the same
  evaluator references the inference checks use (O11), plus `id`, `kind` and, on a judge, `validated_by`. The
  question is `look`, `threshold`, `compare` or `noninferior`; `plan {cases, repeats}` is the recommended series
  size, not a limit. The example has thirteen experiments: `reply_look`, `reply_overpromise_risk`,
  `reply_stage_budget` and `reply_noninferior_mistral` on ranges of `support_case`; `judge_panel_agents`,
  `panel_aa_noise`, `panel_failure_scan` and `panel_single_judge` on `judge_panel`; and `intent_split_long_messages`,
  `intent_ballot_pair`, `intent_escalation_agents`, `critique_planted_defects` and `critique_recall_by_agent` on arms.
  The `critique` judge check (`inference: critique`, `agent: deepseek`) carries
  `validated_by: critique_planted_defects`, the experiment that measures that critic on planted defects; `promises`
  is `run: @root.code.support_case:reply_keeps_resolution`: on the `polish` range `$in` is the flow input
  `CaseRequest`, not the `revise` inference input, so the evaluator takes the reply from the range output and the
  decision from the `route` output in `context.metadata["node_outputs"]`, with the same promise rules as the `retry`
  check `promises_match_resolution` on `revise`. `aqven check` validates the experiments, including the types their
  checks read (`W_CHECK_CONTEXT_MISMATCH`, `E_CHECK_PATH_UNKNOWN`, `W_JUDGE_INPUT_UNBOUND`); a series runs them on the
  project server (`series_start`, `aqven series`), and a series on holdout cases writes a finding under
  `experiments/<experiment>/findings/` and regenerates `FINDINGS.md`.

## 11. The host and the execution modes

| Mode | Where |
|---|---|
| Import in process: `run` and `start` → `waits` → `resume` → `result` | `lumen.app.handle_case`: `Project.load(lumen)`, `flow_typed("support_case", CaseRequest, CaseOutcome)`; `tests/support.py` adds `resume_request` |
| ASGI application | `main.app` — `create_local_app`: API, Studio, MCP, chat, the engine in the lifespan, and the local token; `main.host_application()` mounts it at `/aqven` inside another FastAPI application through `local_app_lifespan`; `AQVEN_STUDIO`, `AQVEN_HOST`, `AQVEN_PORT` and `AQVEN_OPEN_BROWSER` are read after `.env` |
| Any HTTP client | the contract is in `/api/openapi.json` and `/api/schemas/events`, with SSE and `Authorization: Bearer`; the curl examples are in [README.md](README.md); our `AqvenClient` is only a convenience, and its tests live in `packages/aqven/tests/client/` |
| MCP and Claude Code | `.mcp.json` → `http://127.0.0.1:5180/mcp/`; the tools `run_start`, `run_list`, `run_get_node`, `run_resume`, `run_fork` (23 §13.4) |
| Studio | `aqven studio lumen` — a server on 127.0.0.1 with a launch token, plus a browser; `aqven dev lumen --dev-origin http://localhost:5173` — Studio development on Vite |
| CLI | working: `generate`, `check` (which generates the types first), `schema`, `tree` (entities by kind with file paths, output in [README.md](README.md)), `refs KIND:ID` (the definition plus incoming and outgoing references: `refs inference:revise`), `run support_case --root lumen --input lumen/samples/case_request.json --human-answers lumen/samples/answers.json` (a local run with no server, printing events as they appear), `serve`, `studio`, `dev`, `mcp` (the stdio bridge: it takes the project's running server or starts one in the background); answering "not implemented" with exit code 2 — `fmt`, `plan`, `build` |
| pytest with no network | `tests/test_check.py` (negatives, among them `E_SOURCE_CONFLICT`, `E_VARIANT_MISSING`, `E_POLICY_UNKNOWN`, `E_POLICY_PARAMS`, `E_CODE_NOT_FOUND`, `E_ALIAS_UNKNOWN`) and `tests/test_support_case.py` (`aqven_engine`: the five scenarios of §10 on `replay_strict` cassettes with `ALLOW_MODEL_REQUESTS = False`, `ScriptedHuman`, tool approval and refusal, the `painter` fallback through `provider_fault`, MCP stubs, HTTP tools on `MockTransport`, and a fork). Recording the cassettes takes `AQVEN_LIVE=1` with an OpenRouter key: `record_new` replays what exists and appends what is new, against the agents' own models — there is no test model profile — and each scenario is recorded by its own pytest run |

```
uv run aqven check examples/lumen
uv run aqven tree examples/lumen
uv run aqven serve examples/lumen --port 5180
claude mcp add aqven -- uv run aqven mcp examples/lumen
uv run pytest examples
```

## 12. Changes to the `aqven` library

The goal is less code: everything the example does not use is removed.

| Module | Change |
|---|---|
| `aqven.spec` | New kinds `Inference`, `Agent`, `Tool`, `McpServer` (the modules `inference.py`, `agent.py`, `tool.py`, `mcp.py`); `profiles.py` (the table of §6.4, `parse_model`, `resolve_profile`); `policy.py` (`PolicyRef {use \| run, with}`, `EvaluatorRef {use \| run \| inference + agent, with}`); `VariantSlot`; `CheckSpec` = `EvaluatorRef` plus `on_fail` and `threshold`; `ExperimentCheck` = `EvaluatorRef` plus `id`, `kind` and `validated_by`. `ProjectSpec` loses `defaults`, `models`, `roles` and `mcp_servers`; `ProviderSpec.id` is the provider name. An `llm` node is `inference?` (absent means `<node>.inference.yaml` beside `<node>.node.yaml`) plus `agent` plus bindings; `tool` is `tool` plus bindings; `call` is the called workflow plus bindings (O17). No `determinism` or `ttl_ms` on `code` nodes and tools (O12). One `Limits` instead of `Budget`, `AgentLimits`, `timeout_ms` and `retry`. `parallel {body, join}`, `map {over, body, concurrency, on_item_error}`, `loop {body, init, max_iter, stop, select, out}` — with no iteration block, `stop_when`, `stagnation`, `score`, `quorum` or `on_branch_error`; `max_iter` is required. `map` has no `max_items`. Removed: `OutputContract`, `Overrides`, `OutputMode`, `Archetype`, `SchemaProfile`, roles and the catalogue, `ToolCallRecord`, `via` projections, shared prompts by key, `MaxItemsAtMost`, `FlowPolicies`, `NodeDefaults`, `IdType.source`. The builder: `Inference` instead of `Signature`, `llm(node_id, *, inference, agent, bind, description)`, `tool(node_id, *, tool, bind, description)` |
| `aqven.policies` | The slot contracts (`JoinPolicy`, `StopPolicy`, `SelectPolicy`, `ItemErrorPolicy`, `Evaluator`), the decisions (`Wait`, `Done`, `Fail`, `Continue`, `Stop`, `Skip`, `Default`), `EvalContext`, `Verdict`, and the `BUILTINS` registry |
| `aqven.loader` | Done (O14, O15, O22): the recursive search for `*.yaml` with `apiVersion: aqven/v1`, sorting by `kind`, an id as the file name up to the first dot (the folder name for `flow.yaml`), `E_KIND_PATH_MISMATCH` from the suffix, uniqueness per kind, a node belonging to the nearest `flow.yaml` above it, the implicit `<node>.inference.yaml` beside `<node>.node.yaml`, the texts `<inference>.prompt.md` and `<inference>.variants/<slot>/*.md` by the inference prefix, includes resolved from the file, the inference folder or the root, and a bare name in `run` meaning `<id>.py` beside it, loaded by file path. Done (O17, O18, O20): calling a workflow from a `call` node (`CallNodeSpec.flow`, the `requires` contract on `FlowSpec`); an explicit `prompt` and variant as a path to a `.md`; `W_PROMPT_SHADOWED`; the code reference aliases in `aliases.py`. Left: `@flow/` in `{% include %}` (§14) |
| `aqven.codegen` | Done (O19, O22): `aqven generate` writes into `types.py` at the module root the type models, `<Inference>In`/`<Inference>Out` for every inference, `<Tool>In`/`<Tool>Out` for every tool with `run`, and `<Workflow><Node>In`/`<Workflow><Node>Out` for every `code` step; `aqven check` generates before checking; `W_GENERATED_STALE`; and the pytest plugin regenerates before conftest |
| `aqven.check` | `registry` (agents, tools, MCP, providers, fallbacks, subagents, approval), `inferences` (the prompt, variants, examples, allowed sets), `policies` (slot policies and the evaluators of inference and experiment checks) and `capabilities` (media, strict, PII by agent and fallbacks) instead of `catalog`, `strict`, `media` and `agents`; node bindings are checked against the inputs of the inference, the tool or the called workflow |
| `aqven.diagnostics` | New: `E_INFERENCE_UNKNOWN`, `E_AGENT_UNKNOWN`, `E_TOOL_UNKNOWN`, `E_INPUT_UNBOUND`, `E_INPUT_UNKNOWN`, `E_CHECK_PARAMS`, `E_EXAMPLE_INVALID`, `E_TEXT_OUTPUT`, `E_APPROVAL_TOOL`, `E_AGENT_RECURSION`, `E_SOURCE_CONFLICT`, `E_VARIANT_MISSING`, `E_VARIANT_NOT_EXHAUSTIVE`, `E_POLICY_UNKNOWN`, `E_POLICY_PARAMS`, `W_PROMPT_SHADOWED` (O18); removed `E_PROMPT_MISPLACED` and `E_PROMPT_AMBIGUOUS` (O18: a path in `prompt` is legal, and a `<inference>.prompt.md` beside it is a warning); `E_COMPONENT_UNKNOWN` and `E_COMPONENT_RECURSION` move to workflows (O17); removed `E_MODEL_ROLE_UNKNOWN`, `E_MODEL_UNKNOWN`, `E_LOOP_UNBOUNDED`, `E_MAP_UNBOUNDED`, `E_APPROVAL_MISSING`, `E_COMPONENT_BINDING`, `E_FLOW_SOURCE_CONFLICT`, and the reserved `W_DYNAMIC_EXCESS`, `W_LOCK_STALE`, `E_PROMPT_BUDGET` |
| `aqven.runtime` | `NodeExecution.agent`, `.inference`; `CheckOutcome {check, on_fail, passed, feedback, attempt}`; `ForkOverrides.agent` instead of `model_profile`; `ProviderFault.model` is a model string; removed `RecordedToolOutput`, `RawHumanMessage`, `narrowing.py`, `issues.py` |
| `aqven.testing` | removed `recorded_tool_output`, `ScriptedHuman.raw`, `DirectoryBlobStore`, and the `blob_store` fixture |
| `aqven.cli`, `aqven.client` | no change in shape; an experiment's judge check and its variants name agents, never bare models |

## 13. Ownership

Layout by role (O19, O22) makes the owner of a folder the owner of everything in it.

| Owner | Paths (from `examples/lumen/`; the project root is `examples/`) |
|---|---|
| config | `aqven.yaml`, `types/`, `agents/` (including the folder `agents/resolver/` and the subagent inference), `tools/`, `mcp/` |
| workflow | `flows/support_case/`, `flows/judge_panel/` — the workflows, their nodes, inferences, prompts, variants and code; plus `fragments/`, `code/`, `datasets/`, `experiments/` |
| host | `app.py`, `__main__.py`, `samples/`, and at the project root `tests/`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.gitignore`, `pyproject.toml` |

`types.py` at the module root belongs to nobody: `aqven generate` writes it. Other people's files are read only;
importing types and the input and output models of inferences, tools and steps from `lumen.types`, and shared code
from `lumen.code`, is allowed.

## 14. Open questions

1. `MCPToolset` in pydantic-ai-slim 2.43.0 requires `fastmcp-slim[client]` and imports encode `httpx`
   (`pydantic_ai/mcp.py`) — a conflict with the "httpx2 only" rule of ADR-0025. To be decided in the engine: our own
   MCP client on `mcp` 2.2.0, or an exception.
2. O2 cannot express a seed on a self-consistency ballot; the example separates the ballots by the `perspective`
   input. Whether an agent needs a sampling mechanism that does not change the input (and the cassette key) is the
   owner's call.
3. The speech model and the video polling path have not been verified. The agent models are OpenRouter only and were
   verified on 2026-09-17 (§6.2).
4. There is no shortened human wait in the tests (23 OQ 32): the `escalate`/`default` timeouts are never played out
   under pytest.
5. The example does not use a `Dynamic` input inside a registry record or in a workflow output; the rule for record
   fields is not described.
6. `init` sets the inputs of a body node only on the first pass, over its own `in` — the example's reading; O11 does
   not fix the overlay order.
7. O20 allows `@flow/` in prompt paths, but the framework's `{% include %}` understands only paths from the file, the
   inference folder and the root, plus the `@root/` prefix. This does not hinder the example: the fragments live in
   the root `fragments/` and are included as `fragments/<name>` from any depth.
8. Closed by O22: prompt fragments live only in the root `fragments/`.
9. Closed by O22: a subagent's inference lives in the agent's folder, `agents/resolver/research_policy.inference.yaml`.
10. O19 says "regenerates conftest"; the framework does it with the `aqven` pytest plugin
    (`pytest_load_initial_conftests` keyed on `aqven_project`), before `conftest.py` — which itself imports
    `lumen.types` — is imported. The example keeps no separate call in conftest.
11. The generator writes lines longer than 120 characters (`PolicyIdField`); the host disables only E501 for
    `lumen/types.py` and excludes the file from `ruff format` in its own `pyproject.toml`; ruff does not flag the
    header.
12. Repeated tool-approval rounds inside one `llm` execution (23 OQ 30) are unsolved: the second round opens a wait at
    the same address and attempt, a scripted answer into the same topic with the same DBOS idempotency key is not
    delivered, and the run waits until the timeout. The example works around it two ways: the engine does not ask for
    approval of a call with invalid arguments (it raises `ModelRetry` at once), and the refusal in
    `tool_approval_denied` carries a reason after which the model does not repeat the call.
13. In the defect scenarios `judges__qwen` does not keep `rationale` within 600 characters and truncates its JSON at
    `max_tokens: 1500`; the panel carries on with two judges under the `agreeing_verdicts` policy. Whether to raise
    the model or the limit is the owner's call.
14. The example's model strings are not in the built-in profile table `aqven.spec.profiles`; `gemini` and `painter`
    declare `capabilities` themselves.
