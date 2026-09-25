---
title: Hypotheses by category
description: Which failures deserve an experiment, a claim template for each category of failure seen in traces, how to set each one up with one factor, and which hypothesis to test first.
---

## In short

A hypothesis is a claim with a number that a series can refute. It comes from a failure you saw in
traces, not from a generic list. First filter out what an experiment can't help with: a prompt that never
asks for the behavior, a broken binding, an infrastructure error. Then pick the category the failure
belongs to, write the claim from its template, and test the riskiest claim first: the one that could make
the product useless.

## Not every failure is a hypothesis

| What you see | Kind of gap | What to do |
|---|---|---|
| the prompt, a fragment or the type never asks for the behavior you expect | specification | fix the prompt or the type, then look again; no experiment |
| the prompt preview shows an empty or literal placeholder | wiring | fix the `in:` binding; it isn't the model |
| the attempt is an infrastructure error: a provider key, a timeout, broken code | infrastructure | fix the environment or the code; such attempts make a series `invalid`, they don't make a model look bad |
| the behavior is clearly asked for, and the model gets it wrong on part of the inputs | generalization | a hypothesis and an experiment |

Only generalization gaps become experiments. An experiment on behavior the prompt never asks for spends
budget and proves nothing.

## Categories and claim templates

Every template is a claim with a number. The "setup" column names the question kind and the factor. Each
experiment changes one factor: `agent`, `prompt`, `use` or `flow`.

| Category | What you see in traces | Claim to test | Setup | Cases and checks | If confirmed |
|---|---|---|---|---|---|
| Output contract and limits | `MODEL_RETRIES_EXHAUSTED`, `MODEL_SCHEMA_MISMATCH`, repair retries in the events | agent A on step S passes its output contract in fewer than X of attempts | `threshold` on `success_rate`, `below`, `variant: A`; range `from: S`, `to: S`; a second variant with an `agent` factor gives a reference number; read `schema_valid_first_try` | inputs that push fields to their limits, rare enum values, deep nesting; probe with `{{CLI_COMMAND}} models shapes --live` first | is the limit in the prompt? If not, it's a specification gap. Otherwise another agent, more `output.retries`, or trimming in a `code` step |
| Instruction following | the output is valid but breaks a rule of the prompt: language, length, a ban, a format | instruction I is broken more often than X | `threshold` on one binary check per instruction | `language`, `max_words`, `regex`, `no_pii`, or your own `run:` check; cases where the instruction fights the input | reorder or simplify the instruction, add a runtime check with `on_fail: retry`, split the step |
| Long or noisy input | errors grow with length, a distracting opening, noise, the position of the key fact | on `length: very_long` the right answer drops below X; condensing first beats one step by m | `threshold` with `cases.tags` on one level; `compare` with a `flow` factor: the reading step behind a `call` node, one local flow per way of reading | ordered levels of one tag with the same truth; `expected` on the decision field | a `switch` on length, a condensing step, less context in the prompt |
| Class boundaries | neighboring classes get confused; the decision follows the first topic of a message | on cases whose opening topic differs from the intent, the right class drops below X | `threshold` on `expected` with a tag filter; `compare` with a `prompt` factor for a new rubric | truth by construction: label first, then text; boundary pairs, with clear cases as negative controls | sharpen the rubric in a fragment, add an escalation class |
| Error propagation | the first failing node is above the node where the failure shows; a critic notices but doesn't fix | a wrong output of S1 reaches the flow's output more often than X; the critic notices the defect but the fixed output is right less than Y | `threshold` on the range below S1, with a planted wrong S1 output in the cases' `node_outputs`; two checks: "noticed" and "final output right" | pairs of cases: a clean and a broken S1 output, tagged `planted` | fix S1; a code check between the steps; don't count on the critic |
| Tools | the wrong tool or parameter; an answer that ignores the tool's result | with a missing parameter the step invents a value more often than X | `threshold` on a check of the result | checks see the step's output and the outputs of other nodes, not the tool calls inside an `llm` step: read those in the run events on working cases | a `tool` node instead of the agent's tool, parameters from a `code` step, a check before the call |
| Judge reliability | the judge misses a clear defect or blocks a good answer | judge J catches more than X of planted defects and passes more than Y of clean answers | a local flow that runs only the judge as the subject; `threshold` on `expected`; one experiment per tag value | clean answers and copies with one planted defect each, tagged `planted` and `defect`; defects written by a model of another family than the judge | `validated_by: <experiment_id>` on every check that uses the judge |
| Cost and latency | expensive cases, long answers, a slow p95 | the variant stays under $X per case; p95 stays under Y ms | `threshold` on `cost_usd` or `latency_p95_ms`, `below` | the longest cases; p95 needs 20 attempts | another agent, a smaller `max_tokens`, one step less |
| Stability | a case passes on some repeats and fails on others | the share of cases that pass only sometimes is above X; two variants differ by less than the A/A noise | any question with `repeats: 3` or more; read stability and pass^k; an A/A pair: two variants as written, `compare`, `margin: 0` | fixed working cases | always failing: fix the step; sometimes failing: a retry with a check, or a vote. Don't lower the temperature to look stable |
| Agent per step | an expensive agent on a simple step | agent B on step S is not worse than A by more than m, and a pass costs less | `noninferior` with an `agent` factor on S, range `from: S`, `to: S`; guardrails `cost_of_pass`, `schema_valid_first_try`, `latency_p95_ms` | cases carry the outputs of the nodes above S | point the node's `agent:` at B |
| Split a step | one step fails on complex inputs | a chain S1 → S2 beats one call by more than m, and not only because it calls more | a `flow` factor on a `call` slot: the chain, a local flow of equal budget, and the single step as variants; `compare` the chain against the equal-budget flow; guardrail `cost_of_pass` with `relative: true` | the same cases for every variant; every flow in the slot has the slot's input and output types | the winning flow goes into the project flow. If the chain only beats the single step, the gain came from more calls: keep one step with a vote or a retry |

The Lumen example project has a worked experiment for several of these rows. Each changes one factor, and
the A/A pair keeps every variant as written:

| Category | Lumen experiment | Setup |
|---|---|---|
| Long or noisy input, Split a step | `intent_split_long_messages` | `compare` with a `flow` factor on the `classify` call slot: one step against condense-then-decide |
| Judge reliability | `critique_planted_defects`, `critique_recall_by_agent` | `threshold` over replies with planted defects: the first on `expected`, the second on its own `blocked` check with an `agent` factor |
| Agent per step | `reply_noninferior_mistral` | `noninferior` with an `agent` factor on the `revise` step |
| A new rubric | `panel_judge_prompt` | `compare` with a `prompt` factor on the panel judges |
| An algorithm in a `code` step | `panel_merge_rule` | `noninferior` with a `use` factor on the `aggregate` node |
| Cost and latency | `reply_stage_budget`, `panel_single_judge` | `threshold` on `cost_usd`; `compare` of the panel against one judge with a `flow` factor |
| Stability | `panel_aa_noise` | an A/A pair: `run_a` and `run_b`, `compare` with `margin: 0` |

The full files are on [Lumen patterns](/engine/lumen-patterns/).

**Invariance** ("a typo or a reordering must not change the answer") has no question kind of its own. Put
a `code` step in front of the step you test, one that passes its input through unchanged. Add an
alternative of it that corrupts the input on purpose, and compare the two with a `use` factor, as a
`noninferior` question on the decision field. Read the effect against the A/A noise. Unit-test the
corrupting function before the series: a corruption that changes the right answer isn't a test of
invariance.

## Which hypothesis first

1. **The one that could kill the product.** If the first step can't read the input at all, nothing
   downstream matters: tuning a judge over invoice totals that were never extracted is wasted. Test that
   before tuning thresholds.
2. **Then by count.** Failure modes with the largest count from error analysis. In practice, three modes
   often cover more than half of the problems.
3. **Then by harm.** A wrong amount, a promise the decision doesn't give, unsafe advice rank above
   wording and style.
4. **Cheap structural guards need no experiment.** A code check, a `switch` or a trim that can't break
   goes in without one. An experiment answers "does it help", not "does the code run".
5. **Hypotheses from the literature** without a failure you saw go last, and only with a tag dimension that
   provokes them.

Before you pay for new runs, test a premise on the outputs you already have. Every attempt of an earlier
series is a run whose output you can read back, and a unit test can call a new check function on those
outputs. Some questions get answered without a single new model call.

Answers on an ordinal scale deserve a quick look first. A model that squeezes every answer toward the
middle of a scale makes every comparison look like "no effect".

## One claim, one check

A hypothesis often bundles two claims, such as "the critic blocks a reply with a planted defect" and "the
critic lets a clean reply through". Each claim gets its own check that could refute it, on the cases it is
about. The defect a claim is about comes from the case's tag, not from what the model happened to say.
"Found a problem" doesn't measure "found this defect". See
[Correctness needs ground truth and a control](/concepts/metrics-and-controls/).

## Writing the hypothesis down

| Where | What | What breaks without it |
|---|---|---|
| `description` in `experiment.yaml` | the claim with its number: who, on what, which metric, which bound or margin | every outcome "confirms" the hypothesis |
| `failure_mode` | the id of the failure mode from error analysis | the finding misses its section of `FINDINGS.md` |
| `question` | kind, metric, bound or margin, guardrails | the metric gets picked after the data |
| `plan` | the default cases and repeats | the size gets fitted to the result you want |
| `experiment.md` | Purpose, Cases, Reading the result, Falsifier (which outcome refutes it), If confirmed (what changes in the flow), Caveat | knowledge never turns into a change, or gets applied to inputs it doesn't cover |

### Example

The failure mode `triage_contract_broken`: the triage step broke the 200-character limit of an
observation on its first answer and both retries. The claim is that the current agent passes the output
contract in fewer than 95% of attempts. A second agent on the same inputs gives a reference number:

```yaml
apiVersion: "aqven/v1"
kind: "Experiment"
description: "gemini on triage passes the output contract in fewer than 95% of attempts, with gpt on the same inputs as a reference"
failure_mode: "triage_contract_broken"
subject:
  flow: "support_case"
  from: "triage"
  to: "triage"
varies:
  what: "agent"
  nodes:
  - "triage"
cases:
  dataset: "support_case_cases"
variants:
- id: "gemini"
- id: "gpt"
  nodes:
    triage: "gpt"
question:
  kind: "threshold"
  metric: "success_rate"
  variant: "gemini"
  below: 0.95
  margin: 0.02
plan:
  cases: 12
  repeats: 3
```

`confirmed` means the high end of the interval for `gemini` is below 0.93: the risk is real. `refuted`
means the success rate is not below the bound, give or take the margin. It never means "no risk". Twelve
cases give about six per half, so on held-out cases this only confirms a large risk. The launch plan says
so with `short_of_cases` or `wide`.

## How this shapes what you do

- Read traces and agree on failure modes before you write a single hypothesis.
- Fix specification, wiring and infrastructure gaps directly. Experiment only on generalization gaps.
- Write the claim with a number, pick its category, and set it up with one factor.
- Test the riskiest claim first, and test a premise on outputs you already paid for.
- Write the Falsifier and If confirmed before the first number.

## See also

- [How an agent takes a task to a reliable flow](/mcp-cli/research-loop/): where hypotheses sit in the loop.
- [Scanning the literature before you test](/concepts/literature-scan/): where outside evidence comes in.
- [The validity gate](/concepts/validity-gate/): the checklist before a series.
- [How to write an experiment](/engine/experiments/): every key of `experiment.yaml`.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/): the four kinds of factor.
