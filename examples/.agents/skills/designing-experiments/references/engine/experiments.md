# How to write an experiment

Write experiments/<id>/experiment.yaml — a falsifiable description, the subject, the cases by tags, the one factor its variants change, the checks and one of four questions — with an example from the showcase project for each question kind.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
- [The four questions](#the-four-questions)
  - [`look`: see the cases, no verdict](#look-see-the-cases-no-verdict)
  - [`threshold`: is a rate or a cost above or below a line](#threshold-is-a-rate-or-a-cost-above-or-below-a-line)
  - [`compare`: is the candidate better by more than the margin](#compare-is-the-candidate-better-by-more-than-the-margin)
  - [`noninferior`: is the candidate not worse by more than the margin](#noninferior-is-the-candidate-not-worse-by-more-than-the-margin)
- [What `aqven check` catches](#what-aqven-check-catches)
  - [Example](#example)
- [See also](#see-also)

## When you need this

One run proves one case. Write an experiment when you need a number you can act on:

- whether a failure stays rare enough;
- whether a change or another agent is better;
- whether a cheaper agent is not worse;
- whether a judge can be trusted.

The experiment is a file, and you write it before you look at any result. The file pins the question
before the data. A series then answers it: see How to run a series.

## Steps

- **Create the folder `experiments/<experiment_id>/`.** The folder name is the experiment id.
  `experiment.yaml` holds the question. `experiment.md` beside it is for people: the purpose, why these
  cases, how to read the result. Three folders hold what the variants plug in: `nodes/` for alternative
  nodes, `prompts/` for alternative prompt texts, and `flows/` for flows that only this experiment runs. A
  Python module for your own checks can sit here too. The server writes `findings/`, never you.

  ```text
  experiments/<experiment_id>/
    experiment.yaml
    experiment.md
    nodes/<alt>/...          alternative nodes: .node.yaml, .py, .inference.yaml, .prompt.md
    prompts/<name>.md        alternative prompt texts
    flows/<flow_id>/...      local flows: flow.yaml with nodes/, or flow.py
    findings/<series>.yaml   written by the server
  ```
- **`description` is one falsifiable sentence with a number.** Studio shows it as the **Hypothesis**, or
  as the **Goal** of a look. "The polish loop keeps the reply within the decision in more than 97% of
  attempts" can be refuted; "the reply is good" can't.
- **`failure_mode` names the failure the experiment tests**, as a snake_case id such as `overpromise` or
  `intent_misread`. It's optional. Several experiments can share one. `FINDINGS.md` groups findings by it,
  and Studio's Research list filters and groups by it.
- **`archived: true` sets an experiment aside.** It's optional and `false` by default. Studio's Research
  list folds an archived experiment into **Archived** at the end, and its page still opens.
  `aqven check` and series treat it like any other experiment, so it still has to pass the check.
- **`subject` is what runs.**
  - `flow: <flow_id>` names the flow. A local flow in `flows/<flow_id>/` of this experiment is found first,
    then a project flow. A local flow is written like any flow, as `flow.yaml` with its nodes or as a Python
    `flow.py` whose `build()` returns it. It stays out of the project's flow list, and its id can't be the id
    of a project flow.
  - Add `from` and `to` to narrow the run to a range of top-level nodes. The nodes above the range take
    their outputs from each case's `node_outputs`, and the subject's output is the output of `to`.
- **`cases` selects them by tags.** Set `dataset: <dataset_id>`, and optionally `tags: {<dimension>:
  <value>}`. A case is selected when it has every listed tag with that value. A project flow needs a
  dataset of that flow. A local flow can run a dataset bound to no flow, or a flow dataset with the same
  input and output types.
- **`varies` names the one factor the variants change.** `what` is the kind of change, and `nodes` lists
  the subject's nodes it touches, one or more, each once. A node is named by its local id, the name of its
  file: `revise` for the node in `nodes/polish/revise.node.yaml`, even inside a container. With more than
  one variant, `varies` is required.

  | `what` | Allowed on | A variant's value |
  |---|---|---|
  | `agent` | `llm` nodes | an agent id of the project |
  | `prompt` | `llm` nodes | the name of a file `prompts/<name>.md` of this experiment |
  | `use` | any node | the id of an alternative node in `nodes/` of this experiment |
  | `flow` | `call` nodes | a flow id: a local flow from `flows/` first, else a project flow |

  A `prompt` value replaces only the prompt text of that node: its inputs, output schema and inference
  checks stay. A `use` alternative takes the slot's id, so bindings like `$gather.out.present` keep working
  when it has the same outputs; its own child nodes are looked up among the alternatives first, then in
  the subject, and subject nodes nothing reaches any more are dropped. A `flow` value keeps the slot's
  input bindings and must have the same input and output types as the flow the slot calls now.
- **`variants` sets values of that factor.** Every variant has an `id`, and `nodes` maps nodes from
  `varies.nodes` to values. A variant without `nodes` runs the subject as written, and a factor node a
  variant leaves out stays as written too. A variant has no other keys. It never names a bare model,
  because the agent carries the model, its settings and its output mode.
- **`checks` are scored on every attempt.** Each has an `id` and a `kind`: `binary`, `ordinal` or
  `continuous`. Use the cheapest check that works:
  - a built-in `use:` with its `with:` parameters: `expected` (against the case's `expected_output`),
    `not_empty`, `max_words`, `language`, `no_pii`, `regex`, `unique_items`, `ids_in_allowed_set`,
    `citations_in_sources`, `cost_usd` or `latency_ms`;
  - your own function, `run: "<module>:<function>"`: see
    [How to write a custom evaluator](custom-evaluator.md);
  - a model as judge, with `inference:` and `agent:`. It costs tokens on every attempt and has its own
    errors, so give it `validated_by: <experiment_id>`: the experiment that measured it on planted
    defects. Without that, a judge only gives a signal.

  Parameters point into the attempt with paths: `$out.reply.text` is the subject's output, and
  `$in.customer.locale` is its input.
- **`question` picks the statistic and the verdict.** It is one of four kinds, each with an example
  below. A metric is a check id, or a metric every series measures: `success_rate`, `cost_usd`,
  `cost_of_pass`, `latency_p50_ms`, `latency_p95_ms`, `schema_valid_first_try` or `infra_error_rate`. A
  check id can't reuse one of those names. A check's metric counts as higher-is-better, and cost and
  latency as lower-is-better. For a check where lower is better, set `direction: "lower_is_better"` on
  the question or the guardrail that reads it.
- **`plan` is the size you recommend,** not a limit: `cases` (unset means every selected case) and
  `repeats`, at most 20. A series may run on fewer or more. Its launch plan shows how many cases the
  margin needs.
- **Run `aqven check`.** It validates every experiment before a series may run it. See the table
  at the end.

## The four questions

The examples come from the showcase project, which has an experiment for every question kind and every
kind of variant. Create it with `aqven new my_project --template showcase` and open its
`experiments/` folder.

### `look`: see the cases, no verdict

`reply_look` reruns only the `polish` loop on the cases tagged as regressions, after a change to the
revision prompt:

```yaml
subject:
  flow: "support_case"
  from: "polish"
  to: "polish"
cases:
  dataset: "support_case_cases"
  tags:
    regression: "yes"
variants:
- id: "current"
question:
  kind: "look"
```

A look shows every case with its checks, cost and trace, and writes no finding. Use it to read the
failures before you form a hypothesis. `panel_failure_scan` is a wider look: ten checks on every case of
the judge panel, for two tie-break agents.

### `threshold`: is a rate or a cost above or below a line

`reply_overpromise_risk` asks whether the revision step keeps its promises in more than 97% of attempts:

```yaml
checks:
- id: "promises"
  kind: "binary"
  run: "@root.code.support_case:reply_keeps_resolution"
question:
  kind: "threshold"
  metric: "promises"
  above: 0.97
  margin: 0.01
plan:
  cases: 12
  repeats: 20
```

Set exactly one of `above` and `below`. `variant: <id>` tests one variant. Without it, every variant is
tested, and all of them must clear the bound for a `confirmed`. `reply_stage_budget` works that way: it
asks whether each drafting line-up stays under one cent per case (`metric: "cost_usd"`, `below: 0.01`).
`critique_planted_defects` is the threshold that validates a judge: the critic's verdict must match the
planted label in more than 85% of cases.

### `compare`: is the candidate better by more than the margin

`intent_split_long_messages` asks whether condensing a long message first beats one step, without getting
more than 50% dearer per correct intent. Both ways of reading the intent are local flows of the experiment,
`flows/one_step/` and `flows/two_step/`, with the same input and output types. The subject is a third local
flow, `message_intent`, whose only node `classify` is a `call` node that calls `one_step` as written: the
slot the variants plug a flow into.

```yaml
subject:
  flow: "message_intent"
varies:
  what: "flow"
  nodes:
  - "classify"
variants:
- id: "one_step"
- id: "two_step"
  nodes:
    classify: "two_step"
checks:
- id: "intent"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "intent"
question:
  kind: "compare"
  baseline: "one_step"
  candidate: "two_step"
  primary: "intent"
  margin: 0.05
  guardrails:
  - metric: "cost_of_pass"
    direction: "lower_is_better"
    margin: 0.5
    relative: true
```

A guardrail is a metric the candidate must not worsen by more than its margin. `relative: true` reads the
margin as a share of the baseline. `panel_single_judge` compares on latency instead
(`primary: "latency_p50_ms"`, `margin: 1500`), with the winner, the success rate and the infrastructure
error rate as guardrails. It uses the same pattern: its subject `winner_pick` is a local flow whose `panel`
node calls the project's `judge_panel`, and a `flow` factor on `panel` plugs the local `single_judge` flow
into that slot. The models and prompts that already work stay fixed, and only the way the task is split
changes. `panel_aa_noise` measures the noise floor: both variants leave the flow as written, so the
experiment declares no `varies`, and a `compare` with `margin: 0` shows the spread between two identical runs.
An experiment whose variants all keep the subject is an A/A experiment: `aqven check` asks for no factor and
does not warn that the variants repeat each other.

### `noninferior`: is the candidate not worse by more than the margin

`reply_noninferior_mistral` asks whether mistral can revise the reply in place of gpt:

```yaml
subject:
  flow: "support_case"
  from: "polish"
  to: "polish"
varies:
  what: "agent"
  nodes:
  - "revise"
variants:
- id: "gpt"
- id: "mistral"
  nodes:
    revise: "mistral"
checks:
- id: "critique"
  kind: "continuous"
  inference: "critique"
  agent: "deepseek"
  validated_by: "critique_planted_defects"
question:
  kind: "noninferior"
  baseline: "gpt"
  candidate: "mistral"
  primary: "critique"
  margin: 0.05
  guardrails:
  - metric: "cost_of_pass"
    direction: "lower_is_better"
    margin: 0.2
    relative: true
```

`noninferior` needs a margin above 0. It answers the most common practical question: can a cheaper agent
take this step? `intent_escalation_agents` asks the same of a local flow narrowed to one node, with three
variants of an `agent` factor and a latency guardrail.

## What `aqven check` catches

| Code | What is wrong |
|---|---|
| `E_FLOW_UNKNOWN` | the subject or a `flow` value names a flow that is neither in the experiment's `flows/` nor in the project |
| `E_RANGE_INVALID` | `from` or `to` isn't a top-level node of the subject, or the range is reversed |
| `E_DATASET_UNKNOWN`, `E_DATASET_MISMATCH` | the dataset doesn't exist, belongs to another flow, or a local subject's input or output type differs from the dataset's |
| `E_FACTOR_MISSING` | there is more than one variant and no `varies` |
| `E_FACTOR_NODE_UNKNOWN`, `E_FACTOR_KIND` | a node in `varies.nodes` isn't in the subject, or doesn't fit `what`: `agent` and `prompt` need an `llm` node, `flow` a `call` node |
| `E_VARIANT_OUTSIDE_FACTOR` | a variant sets a node that isn't in `varies.nodes` |
| `E_ALTERNATIVE_UNKNOWN`, `E_ALTERNATIVE_ID_TAKEN` | a `use` value isn't in the experiment's `nodes/`, or an alternative has the id of a subject node |
| `E_PROMPT_MISSING` | a `prompt` value has no file `prompts/<name>.md` |
| `E_FACTOR_FLOW_CONTRACT` | a `flow` value takes or returns a different type than the flow the slot calls |
| `W_VARIANT_DUPLICATE`, `W_ALTERNATIVE_UNUSED` | two variants set the same values, or an alternative, prompt or local flow is used by no variant and isn't the subject |
| `E_ORPHAN_FILE`, `E_UNKNOWN_KEY` | a flow sits in the experiment folder outside `flows/` (such as a folder left from an older layout), or a variant still has a key of that layout, such as `agents` |
| `E_CASES_EMPTY`, `W_PLAN_EXCEEDS_CASES` | the tags select no case, or `plan.cases` is more than they select |
| `E_EXPECTED_MISSING` | an `expected` check reads a case without `expected_output`, or without the fields it compares |
| `E_AGENT_UNKNOWN`, `E_VARIANT_INVALID` | an `agent` value names an unknown agent; the question names an undeclared variant; a comparison has one variant |
| `E_ID_DUPLICATE`, `E_METRIC_UNKNOWN` | a repeated variant or check id, a local flow with a project flow's id, a check id that is a series metric name, or a metric that is neither |
| `E_EXPERIMENT_UNKNOWN` | `validated_by` names no experiment |
| `W_JUDGE_INPUT_UNBOUND`, `W_CHECK_CONTEXT_MISMATCH` | a judge needs an input nothing supplies, or a `run:` function's type hints don't fit the subject |
| `E_FINDING_TAMPERED`, `W_FINDINGS_STALE` | a finding file was edited, or `FINDINGS.md` doesn't match the findings |

Every variant is also assembled and compiled like any flow, so an alternative whose outputs don't fit the
nodes after it fails with the usual compiler code. Such an error points at `experiment.yaml`, at
`variants[i].nodes.<slot>`, and its message starts with `variant <id>: ` and names the file where the rule
fired.

### Example

A typo in a tag and in a metric, each in a different experiment of the showcase. This is real
output of `aqven check . --static`, trimmed to these errors:

```text
experiments/reply_look/experiment.yaml:10:3: error E_CASES_EMPTY cases.tags: experiment reply_look: tags regression=yess select no case of dataset support_case_cases
  hint: tag the cases of the dataset or relax the tag filter under cases.tags
experiments/reply_overpromise_risk/experiment.yaml:25:3: error E_METRIC_UNKNOWN question.metric: experiment reply_overpromise_risk: metric promise is neither a check id of the experiment nor a series metric
  hint: name a check id (promises, customer_language) or a series metric (success_rate, cost_usd, cost_of_pass, latency_p50_ms, latency_p95_ms, schema_valid_first_try, infra_error_rate)
```

Each hint names the values that would fit. A series refuses to start on a project with errors, so these
never cost a token.

## See also

- How to run a series: the next step, from Studio, the terminal or an agent.
- [How to write a custom evaluator](custom-evaluator.md): the `run:` check and what its `value` and
  `context` hold in an experiment.
- [Experiments, series and findings](../concepts/experiments-series-and-findings.md): why the question comes
  before the data.
- [Experiments reference](../reference/experiments.md), Datasets reference and
  Built-in policies and evaluators: every key, generated from the code.
- Diagnostic codes: the full message of every code above.
