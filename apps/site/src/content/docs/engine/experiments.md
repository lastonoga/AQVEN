---
title: How to write an experiment
description: Write experiments/<id>/experiment.yaml — a falsifiable description, the subject, the cases by tags, the variants, the checks and one of four questions — with an example from the showcase project for each question kind.
---

## When you need this

One run proves one case. Write an experiment when you need a number you can act on:

- whether a failure stays rare enough;
- whether a change or another agent is better;
- whether a cheaper agent is not worse;
- whether a judge can be trusted.

The experiment is a file, and you write it before you look at any result. The file pins the question
before the data. A series then answers it: see [How to run a series](/engine/run-a-series/).

## Steps

- **Create the folder `experiments/<experiment_id>/`.** The folder name is the experiment id.
  `experiment.yaml` holds the question. `experiment.md` beside it is for people: the purpose, why these
  cases, how to read the result. `arms/` holds small flows that only this experiment runs. A Python module
  for your own checks can sit here too. The server writes `findings/`, never you.
- **`description` is one falsifiable sentence with a number.** Studio shows it as the **Hypothesis**, or
  as the **Goal** of a look. "The polish loop keeps the reply within the decision in more than 97% of
  attempts" can be refuted; "the reply is good" can't.
- **`failure_mode` names the failure the experiment tests**, as a snake_case id such as `overpromise` or
  `intent_misread`. It's optional. Several experiments can share one. `FINDINGS.md` groups findings by it,
  and Studio's Research list filters by it.
- **`subject` is what runs.** Set exactly one of these:
  - `flow: <flow_id>` runs a project flow.
  - `arm: <arm_id>` runs a small flow in `arms/<arm_id>/`, written as `flow.yaml` with its nodes, or as a
    Python `flow.py` whose `build()` returns the flow. An arm stays out of the project's flow list, and its
    id only has to be unique within the experiment. Every arm has the subject's input and output types.
  - Add `from` and `to` to narrow the run to a range of top-level nodes. The nodes above the range take
    their outputs from each case's `node_outputs`, and the subject's output is the output of `to`.
- **`cases` selects them by tags.** Set `dataset: <dataset_id>`, and optionally `tags: {<dimension>:
  <value>}`. A case is selected when it has every listed tag with that value. A flow subject needs a
  dataset of that flow. An arm can run a dataset bound to no flow, or a flow dataset with the arm's input
  type.
- **`variants` is what differs between attempts.** Every variant has an `id`. A variant with only an id
  runs the subject as written. `agents: {<node_id>: <agent_id>}` puts other agents on `llm` nodes: a
  nested node is `<container>__<node>`, and in a range only nodes inside the range can change. `arm:
  <arm_id>` runs another arm. A variant never names a bare model, because the agent carries the model, its
  settings and its output mode.
- **`checks` are scored on every attempt.** Each has an `id` and a `kind`: `binary`, `ordinal` or
  `continuous`. Use the cheapest check that works:
  - a built-in `use:` with its `with:` parameters: `expected` (against the case's `expected_output`),
    `not_empty`, `max_words`, `language`, `no_pii`, `regex`, `unique_items`, `ids_in_allowed_set`,
    `citations_in_sources`, `cost_usd` or `latency_ms`;
  - your own function, `run: "<module>:<function>"`: see
    [How to write a custom evaluator](/engine/custom-evaluator/);
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
- **Run `{{CLI_COMMAND}} check`.** It validates every experiment before a series may run it. See the table
  at the end.

## The four questions

The examples come from the showcase project, which has an experiment for every question kind and every
kind of variant. Create it with `{{CLI_COMMAND}} new my_project --template showcase` and open its
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
more than 50% dearer per correct intent:

```yaml
subject:
  arm: "one_step"
variants:
- id: "one_step"
  arm: "one_step"
- id: "two_step"
  arm: "two_step"
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
error rate as guardrails. `panel_aa_noise` compares two identical variants with `margin: 0` to measure
the noise floor.

### `noninferior`: is the candidate not worse by more than the margin

`reply_noninferior_mistral` asks whether mistral can revise the reply in place of gpt:

```yaml
subject:
  flow: "support_case"
  from: "polish"
  to: "polish"
variants:
- id: "gpt"
- id: "mistral"
  agents:
    polish__revise: "mistral"
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
take this step? `intent_escalation_agents` asks the same of an arm narrowed to one node, with three
variants and a latency guardrail.

## What `{{CLI_COMMAND}} check` catches

| Code | What is wrong |
|---|---|
| `E_FLOW_UNKNOWN`, `E_ARM_UNKNOWN` | the subject or a variant names a flow or arm that doesn't exist |
| `E_RANGE_INVALID` | `from` or `to` isn't a top-level node of the subject, or of an arm a variant runs, or the range is reversed |
| `E_DATASET_UNKNOWN`, `E_DATASET_MISMATCH` | the dataset doesn't exist, belongs to another flow, or an arm's input or output type differs from the subject's |
| `E_CASES_EMPTY`, `W_PLAN_EXCEEDS_CASES` | the tags select no case, or `plan.cases` is more than they select |
| `E_EXPECTED_MISSING` | an `expected` check reads a case without `expected_output`, or without the fields it compares |
| `E_AGENT_UNKNOWN`, `E_VARIANT_INVALID` | a variant names an unknown agent or a node that isn't an `llm` node in range; the question names an undeclared variant; a comparison has one variant |
| `E_ID_DUPLICATE`, `E_METRIC_UNKNOWN` | a repeated variant or check id, a check id that is a series metric name, or a metric that is neither |
| `E_EXPERIMENT_UNKNOWN` | `validated_by` names no experiment |
| `W_JUDGE_INPUT_UNBOUND`, `W_CHECK_CONTEXT_MISMATCH` | a judge needs an input nothing supplies, or a `run:` function's type hints don't fit the subject |
| `E_FINDING_TAMPERED`, `W_FINDINGS_STALE` | a finding file was edited, or `FINDINGS.md` doesn't match the findings |

### Example

A typo in a tag, a metric and a node id, each in a different experiment of the showcase. This is real
output of `{{CLI_COMMAND}} check . --static`, trimmed to these errors:

```text
experiments/reply_look/experiment.yaml:10:3: error E_CASES_EMPTY cases.tags: experiment reply_look: tags regression=yess select no case of dataset support_case_cases
  hint: tag the cases of the dataset or relax the tag filter under cases.tags
experiments/reply_overpromise_risk/experiment.yaml:25:3: error E_METRIC_UNKNOWN question.metric: experiment reply_overpromise_risk: metric promise is neither a check id of the experiment nor a series metric
  hint: name a check id (promises, customer_language) or a series metric (success_rate, cost_usd, cost_of_pass, latency_p50_ms, latency_p95_ms, schema_valid_first_try, infra_error_rate)
experiments/reply_noninferior_mistral/experiment.yaml:15:5: error E_VARIANT_INVALID variants[1].agents.polish__revize: experiment reply_noninferior_mistral: variant mistral assigns agent mistral to polish__revize, which is not an llm node of flow support_case
  hint: use an llm node id (drafts__gemini, drafts__gpt, drafts__mistral, illustrate, intent__escalate, polish__critique, polish__revise, record__extract, route__resolve, triage, vote__ballot); a nested node is <container>__<node>
```

Each hint names the values that would fit. A series refuses to start on a project with errors, so these
never cost a token.

## See also

- [How to run a series](/engine/run-a-series/): the next step, from Studio, the terminal or an agent.
- [How to write a custom evaluator](/engine/custom-evaluator/): the `run:` check and what its `value` and
  `context` hold in an experiment.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/): why the question comes
  before the data.
- [Experiments reference](/reference/experiments/), [Datasets reference](/reference/datasets/) and
  [Built-in policies and evaluators](/reference/built-in-policies/): every key, generated from the code.
- [Diagnostic codes](/reference/diagnostics/): the full message of every code above.
