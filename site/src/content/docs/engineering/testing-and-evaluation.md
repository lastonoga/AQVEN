---
title: Evaluations
description: Check structure offline, then measure behavior on representative cases.
---

Use two layers of evidence. `check` finds invalid definitions, references, and type mismatches without a live model call. A dataset and evaluation measure whether the answer is useful on cases that matter to the product.

Start with [Datasets](/engineering/datasets/) for every case field, flow and inference dataset differences, node-range fixtures, splits, CSV imports, and Studio runs. This page covers the evaluation that consumes those cases.

## Check the project

From the directory with `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} check . --static
uv run {{CLI_COMMAND}} check .
```

The static pass is quick while editing. The full pass also simulates paths. Diagnostics beginning with `E_` are errors; `W_` are warnings. A passing check means the project is structurally consistent. It does not mean the selected model answers correctly.

## Keep cases that represent real behavior

This complete `evals/answer_question/answer_cases.yaml` tests a normal input and one that tempts an unsupported claim:

```yaml
apiVersion: "aqven/v1"
kind: "Dataset"
cases:
  - name: "plain definition"
    inputs:
      text: "What is a return window?"
      tone: "friendly"
    expected_output:
      reply: "A return window is the period when an item can be returned."
  - name: "unknown policy"
    inputs:
      text: "Can I return this after five years?"
      tone: "formal"
    expected_output:
      reply: "I cannot determine that without the store policy."
```

The dataset format can also store `context`, `node_outputs`, and `metadata` for targeted or repeatable cases. Add cases for missing input, a failed tool, each switch branch, an empty map, and any known customer-facing failure. A case name should explain why it exists. `expected_output` is available to scorers; it does not automatically compare with the actual output.

## Score an inference

This complete `evals/answer_question/answer_quality.yaml` names an inference, agent, dataset, and two scorers:

```yaml
apiVersion: "aqven/v1"
kind: "Eval"
description: "Answer length and cost on representative questions"
inference: "reply"
agent: "assistant"
dataset: "answer_cases"
scorers:
  - id: "length"
    kind: "binary"
    use: "max_words"
    with:
      field: "$out.reply"
      max: 120
  - id: "cost"
    kind: "continuous"
    use: "cost_usd"
```

Run it with `uv run {{CLI_COMMAND}} eval . --eval answer_quality`. An evaluation can make real provider calls and incur cost. A scorer can use a built-in evaluator, a Python function through `run`, or a judge inference paired with an agent. The generated [Built-in evaluators](/engineering/reference/built-in-policies/#evaluator) page lists names and `with` parameters.

## Decide whether a change is safe to release

An optional `gate` compares an evaluation with a recorded baseline across repeated runs. The following is the complete gate shape to add beneath an `Eval`:

```yaml
gate:
  baseline: "production"
  repeats: 3
  min_dataset: 200
  min_discordant: 25
  families:
    primary: ["length"]
    safety: ["cost"]
  alpha_primary: 0.05
  q_secondary: 0.1
  alpha_safety: 0.05
  ni_margin: 0.02
  bootstrap:
    method: "BCa"
    resamples: 10000
    seed: 20260920
  max_dropped_ratio: 0.05
  actions:
    pass: "release"
    warn: "require_approval"
    block: "reject"
    gate_unavailable: "reject"
```

Changing `min_dataset` or `min_discordant` changes when the gate has enough evidence. Changing `ni_margin` changes the tolerated regression. `actions` determines what happens for each verdict, including when a gate cannot be computed. Choose these numbers with the domain owner and review per-case failures; a strong aggregate score can hide a serious subgroup failure.

The `optimization` fields also exist in the schema, but the CLI `optimize` command is currently pending. Do not put it in a working release script yet. See the generated [Dataset and Eval reference](/engineering/reference/evaluations/) for all accepted fields, defaults, and bounds; [Studio Evaluations](/studio/evaluations/) shows recorded results.
