---
name: designing-experiments
description: "Writes AQVEN experiments: one factor (agent, prompt, use or flow), variants and checks, ground truth, negative controls, one population. Use first when asked whether one prompt, model, node or flow matches or beats another, before editing experiments/, and before claiming an effect."
---

## MUST

- Compared things are variants (rows); measures are checks (columns). Two ways to merge votes, two prompts or two
  models are variants of one factor, never two checks on one variant.
- An experiment changes exactly one factor, `varies` with `what` and `nodes`. Everything else that differs
  between variants (data, the set of questions, preprocessing, population) is listed before the run and is zero.
- Correctness is measured only against ground truth (known by construction, such as a planted defect, or a label
  from the source) with a negative control from the same population. Agreement of two readings is
  reproducibility, not correctness.
- One check, one claim. The property a claim is about comes from the case's tag.
- The primary metric is the job of the stage under test: recall for a step that must find everything,
  precision for a judge.
- The design is never cut to fit the spend cap: the cap is the owner's decision (`running-series`).
- A changed question, metric or factor gets a new experiment id.
- Restate the question in the owner's words and get a yes before building the experiment.

## The experiment folder

```text
experiments/<experiment_id>/
  experiment.yaml
  experiment.md          notes: Contract, Validity, Purpose, Falsifier, Decision, Failure modes
  nodes/<alt>/...        alternative nodes: .node.yaml, .py, .inference.yaml, .prompt.md
  prompts/<name>.md      alternative prompt texts
  flows/<flow_id>/...    local flows: flow.yaml with nodes/, or flow.py
  findings/<series>.yaml written by the server, never by you
```

A module of your own checks may sit in the folder too (`checks.py`, referenced as
`run: "@root.experiments.<experiment_id>.checks:<function>"`). A flow anywhere else in the folder is
`E_ORPHAN_FILE`.

| `varies.what` | Slot | A variant's value | Use it for |
|---|---|---|---|
| `agent` | an llm node | an agent id of the project | another model or model settings with the same prompt and schema |
| `prompt` | an llm node | the name of `prompts/<name>.md` | other prompt text with the same inputs, output schema and inference checks |
| `use` | any node | an alternative id from `nodes/` | another algorithm of a step; another container (`map` against `parallel`); a model with a prompt tuned for it, as one alternative llm node with its own agent, inference and prompt |
| `flow` | a `call` node | a flow id, local from `flows/` first, else a project flow | another split of the task into steps; the flow keeps the slot's input and output types |

- A variant sets only `nodes: {<slot>: <value>}`. A variant without `nodes` is the subject as written, and so is
  a factor node a variant leaves out. Keys are local node ids (file names), nested nodes included.
- A `use` alternative runs under the slot's id, so bindings below it (`$aggregate.out.level`) stay; its `in`
  and `out` match the slot, or the compiler error comes back prefixed with `variant <id>: `.
- `subject.flow` finds a local flow of the experiment first, then a project flow; `from` and `to` narrow the run.
- To compare a multi-node pattern: the subject is a local flow with one `call` slot, and `flow` variants plug in
  local flows with the same input and output. The project flow stays flat; the winner is written into it later
  (`building-flows`) and the slot leaves with the experiment. A pattern that fits one container node is compared
  with `use` on that node directly.
- An A/A experiment keeps every variant as written and declares no `varies`: `compare` with `margin: 0`
  measures the noise floor.
- One Lumen experiment per kind: `agent` in `judge_panel_agents` and `reply_noninferior_mistral`, `prompt` in
  `panel_judge_prompt`, `use` in `panel_merge_rule`, `flow` in `panel_single_judge` and
  `intent_split_long_messages` (a `call` slot), A/A in `panel_aa_noise`.
- A variant's fingerprint comes from the assembled flow: editing an alternative, a prompt from `prompts/` or a
  local flow makes earlier series of it stale.
- An experiment whose question is answered gets `archived: true` in `experiment.yaml`. Studio lists it under
  Archived; `aqven check` and series treat it as before. Never delete it or reuse its id for a new question.

Example, Lumen's `panel_merge_rule`: a `use` factor on the step that merges three judges' verdicts, each way of
merging a variant, the same checks on every row:

```yaml
apiVersion: "aqven/v1"
kind: "Experiment"
description: "Merging the panel by a two-judge majority alone, without the score-spread rule, picks the expected winner at most 0.05 less often than the current merge"
failure_mode: "panel_wrong_winner"
subject:
  flow: "judge_panel"
varies:
  what: "use"
  nodes:
  - "aggregate"
cases:
  dataset: "judge_panel_cases"
variants:
- id: "majority_and_spread"
- id: "majority_only"
  nodes:
    aggregate: "majority_only"
- id: "always_tie_break"
  nodes:
    aggregate: "always_tie_break"
checks:
- id: "winner"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "winner"
- id: "settled_by_panel"
  kind: "binary"
  run: "@root.experiments.panel_merge_rule.checks:settled_by_panel"
question:
  kind: "noninferior"
  baseline: "majority_and_spread"
  candidate: "majority_only"
  primary: "winner"
  margin: 0.05
plan:
  cases: 8
  repeats: 3
```

`nodes/majority_only/majority_only.node.yaml` and `nodes/always_tie_break/always_tie_break.node.yaml` have the `in`
and `out` of `flows/judge_panel/nodes/aggregate/aggregate.node.yaml`. `majority_and_spread` has no `nodes`: it is the
flow as written.

A check scores every case it runs on: it returns a `Verdict`, and anything else is an error attempt, not a skipped
case. A rate over part of the cases is an experiment of its own, selected with `cases.tags`. Lumen's
`critique_recall_by_agent` measures recall only on replies with a planted defect (`cases.tags` with
`planted: "yes"`); the clean copies of the same replies (`planted: "no"`) are the negative control, and a critic
that blocks everything is caught only there.

Questions: `look`, `threshold` (`metric`, `above` or `below`, `margin`, optional `variant`; without it every
variant must clear the bound), `compare` and `noninferior` (`baseline`, `candidate`, `primary`, `margin`,
`guardrails`). Metrics are check ids or series metrics: `success_rate`, `cost_usd`, `cost_of_pass`,
`latency_p50_ms`, `latency_p95_ms`, `schema_valid_first_try`, `infra_error_rate`.

## Validity gate

Write every item into the Validity section of `experiment.md`. No series starts while any item is "no".

| # | Step | Exit criterion |
|---|---|---|
| 1 | The question in the owner's words: "the experiment answers…; metric M means…" | the owner said yes |
| 2 | The stage and its metric: which part of the pipeline, what "good" means for it ("Now" in `EXPERIMENTS.md`) | the primary check measures that stage's job |
| 3 | The factor: kind from the table, slots, values; compared things are variants, measures are checks | `aqven_check` gives no factor code |
| 4 | Everything else that differs between variants: data, the questions or instructions the model gets (a case's category or file name must not choose them), preprocessing, population | the list is empty or the difference removed |
| 5 | The subject reproduces the production path: preprocessing, resolution, region crops, a prompt that asks for the measured behavior; the subject's `prompt_preview` matches production except for the factor; read the files in `prompts/` or `nodes/` for the variants | previews and files read |
| 6 | Ground truth: known by construction (a planted defect, a generated value) or labels from the source; a negative control from the same population; a synthetic case only when it really has the property it is labelled with (`preparing-media-inputs` for media) | truth and control named |
| 7 | One check per claim: the property from the case tag; a check always returns a `Verdict`, so a rate over part of the cases is its own experiment selected with `cases.tags`; a missing field reads as "unknown", never as "absent"; the unit of the metric is the unit of the claim | the check gives no `no_data` on saved outputs |
| 8 | Trivial baselines (a constant, the majority, "call everything") computed before the threshold | the threshold is above them |
| 9 | The margin is reachable: `launch.mde`, `launch.recommended.reason` (`no_margin`, `short_of_cases`, `wide`) and `below_recommended` from the `series_start` answer of a `dev` smoke | no `below_recommended`, or the owner agreed |
| 10 | Controls false by construction; a multi-call pattern against a variant of equal budget; a random list of the same length | the control cannot leak |
| 11 | A new check tried on outputs of an earlier series (`pytest_run` over outputs from `run_get_node`); an exact 0.000 or a zero-width interval is a bug until proven otherwise | the check's numbers are plausible |
| 12 | `dev` and `holdout` from one population; the threshold set before the data and never moved after | the splits look alike |
| 13 | Expected outcomes and how to read each written before the first number (Purpose, Falsifier, If confirmed) | written |
| 14 | A changed question, metric or factor | a new experiment id and folder |

## `aqven check` codes of the factor

| What is wrong | Code | Fix |
|---|---|---|
| more than one variant and no `varies` (unless every variant is as written) | `E_FACTOR_MISSING` | declare the factor |
| a node of `varies.nodes` is not in the subject | `E_FACTOR_NODE_UNKNOWN` | the local node id, the file name |
| `agent` or `prompt` on a node that is not llm; `flow` on a node that is not `call` | `E_FACTOR_KIND` | another factor kind or slot |
| a variant sets a node outside `varies.nodes` | `E_VARIANT_OUTSIDE_FACTOR` | add it to the factor or drop it from the variant |
| an alternative missing from `nodes/`; an alternative with a subject node's id | `E_ALTERNATIVE_UNKNOWN`, `E_ALTERNATIVE_ID_TAKEN` | the alternative's file name |
| no `prompts/<name>.md`; no such agent; no such flow in `flows/` or the project | `E_PROMPT_MISSING`, `E_AGENT_UNKNOWN`, `E_FLOW_UNKNOWN` | the file or the id |
| the plugged flow takes or returns other types than the slot's flow | `E_FACTOR_FLOW_CONTRACT` | align the input and output types |
| a local flow with a project flow's id | `E_ID_DUPLICATE` | rename the local flow |
| an assembled variant does not compile | the compiler's own code at `variants[i].nodes.<slot>`, message `variant <id>: …` | fix the file the message names |
| two variants with the same values; an alternative, prompt or local flow no variant uses | `W_VARIANT_DUPLICATE`, `W_ALTERNATIVE_UNUSED` | remove it |
| keys the variant or subject no longer has, a flow outside `flows/` | `E_UNKNOWN_KEY`, `E_ORPHAN_FILE` | follow the hint in the message |

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| Ways of merging votes written as checks on one variant | one variant per way, a `use` factor on the merging node |
| Local flows copied byte for byte just to change one prompt | a `prompt` factor with files in `prompts/` |
| The primary check measured "found anything", not the property the hypothesis is about | a check per claim, the property from the tag |
| A synthetic case lacked the property it was labelled with (a "blurry receipt" darkened overall, still sharp where the text is), and a model was nearly called blind | check the cases before the model; `preparing-media-inputs` for media |
| A case's category chose which instructions the model got, so variants differed in more than the factor | fix the instructions; list every difference |
| Many series measured agreement of two readings | ground truth and a negative control |
| Models compared on synthetic data while labelled data sat in the project | an `agent` factor on labelled data |
| A whole-pipeline threshold put on a step that must find everything | the stage's own metric |
| Hard cases only in the confirmation data: `dev` and `holdout` disagreed | one population |
| Repeats cut and a series split in two to stay under the spend cap | the design stays; the owner decides spend |
| A downstream decision measured (the ticket was escalated) instead of the claim (the fault was found) | the metric of the claim |
| The subject's prompt forbade the measured behavior | step 5 |
| Whole pages or images measured where production sends region crops | the production path |
| Half of the hypothesis tested | one check per part |
| An effect claimed from one run, against a variant whose inputs were empty | n and the inputs first |
| A margin that needs more cases than `dev` holds; a constant answer ("escalate everything") beat every model | step 8 and step 9 |
| Cases the claim does not cover scored as failures; pairs counted where the claim is about single answers | select the covered cases with `cases.tags`; the unit of the claim |
| A control that could pass by a shortcut; a "breakthrough" from a provisional verdict | controls false by construction; wait for `done` |
| The metric swapped inside the same `experiment.yaml` | a new id |

Good habits to keep: no guard threshold set at n=1; a new check smoked on `dev` before spending holdout; a
threshold fixed before the data is never moved; cases are never picked by the first model's result.

## Tools and commands

- `aqven` MCP `aqven_check`, `prompt_preview`, `pytest_run`, `series_start` (a `dev` smoke, see `running-series`).
- `uv run aqven refs experiment:<id> <package>`; `uv run aqven tree <package>` lists local flows and alternatives.

## References

- `references/engine/experiments.md`, `references/reference/experiments.md`: every key, every question kind, all
  `aqven check` codes of experiments. Read before writing `experiment.yaml`.
- `references/concepts/validity-gate.md`: the gate above with worked examples. Read before step 1 of the gate.
- `references/concepts/metrics-and-controls.md`: ground truth, negative controls, agreement against
  correctness, one check per claim, a stage and its metric. Read at steps 2, 6 and 7.
- `references/engine/lumen-patterns.md`: a real experiment of every factor kind. Read before the first
  experiment of a factor kind.
- `references/engine/call-node.md`: the `call` slot for a `flow` factor. Read before a `flow` factor.
- `references/concepts/experiments-series-and-findings.md`, `references/concepts/how-a-series-decides.md`: why
  the question comes first, intervals, margins, verdicts. Read at steps 8 and 9.
- `references/engine/custom-evaluator.md`: writing a `run:` check. Read at step 7.
