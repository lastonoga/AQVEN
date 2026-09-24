---
title: How an agent takes a task to a reliable flow
description: The loop a coding agent runs over MCP — contract, simplest flow, cases, a look, error analysis, hypotheses, Explore on working cases, Confirm on held-out cases, apply the finding — round after round until the flow holds.
---

## When you need this

You give a coding agent a task, and the agent builds the flow. It runs the flow, checks it, writes
experiments and repeats, until the findings show the flow works reliably. Each tool proves a different
thing. `{{CLI_COMMAND}} check` proves the wiring. One run proves one case. Only a series on held-out cases
proves a claim. This page is the order in which the agent uses them, and what you get back.

It assumes an agent connected over MCP: [set one up](/mcp-cli/set-up-an-agent-outside-studio/), or use
Studio's chat. You can follow along in Studio: every series the agent starts shows up in Research mode,
with a link from each attempt to its run.

## Hand it the task

Say what the flow is for and what "done" means in numbers, and give it a budget:

```text
Build a flow that reads an incoming support e-mail and returns its intent (defect, delivery or question) and a one-line summary.
Done means: the intent is right on more than 90% of held-out cases, and a case costs under $0.002.
Work in rounds: explore on working cases, confirm once on held-out cases. Stop when every "done" criterion is confirmed, or when you have spent $5.
Then report FINDINGS.md, the decisions you made and the risks that are left.
```

## The loop

| Stage | Move on when |
|---|---|
| 1. Contract | purpose, input, output and a measurable "done" (which check, which number) are agreed, asked in one message |
| 2. Simplest flow | one `llm` step per real decision, `code` for the rest; `{{CLI_COMMAND}} check` is clean; `{{CLI_COMMAND}} prompt preview` is read for every `llm` node |
| 3. Cases | a dataset with `expected_output` and tags exists; `{{CLI_COMMAND}} check` is clean |
| 4. Explore | a `look` experiment with deterministic checks ran on working cases, and every failing case is read (`include_cases: true`) |
| 5. Error analysis | every failure has its first failing node and a failure mode, and new failing traces stop adding modes |
| 6. Fix the spec | what the prompt never asked for is fixed in the prompt or the type, then stage 4 again |
| 7. Hypotheses | one experiment per remaining failure mode, written before any number |
| 8. Explore | series on working cases, one change between series, until the change is done and the question is fixed |
| 9. Confirm | one series on held-out cases, with `cases` from the estimate's recommendation when the half has them; `verdict.text` quoted |
| 10. Apply | the flow changes, regression cases are added, the decision is recorded; then stage 4 on fresh cases, or stop |

Stages 4 to 10 are one round. A series starts by itself when its estimate is within the project spend
cap. Above it, the agent tells you the amount and waits: only a person approves spend, in Studio.

## Finding what to test

- **Take the failing node from the run, not from the output.** A failing case row carries the attempt's
  error and its `run_id`; `run_get` and `run_events` show the first node that failed. Fix the first
  failure upstream, because later ones often cascade from it. In a multi-step flow, count failures by the
  last node that succeeded and the first that failed, and start with the biggest count.
- **Group the notes into failure modes.** Write one note per failing trace about its first failure. Then
  group the notes into failure modes: an id, a one-line definition, a count, and two or three `run_id`s.
  They go under "Failure modes" in the look experiment's `experiment.md`. The id becomes the
  `failure_mode` of every experiment that tests it, and the section of `FINDINGS.md` its findings land
  in. Stop when about 20 more failing traces add no new mode. Few failures means the cases are too easy,
  not that the flow is done.
- **Not everything deserves an experiment.** The prompt or type never asks for the behavior: fix the
  prompt. An empty or literal placeholder in the prompt preview: fix the binding. An infrastructure
  error: fix the key, the limit or the code. Only a failure on behavior the flow clearly asks for becomes
  a hypothesis.
- **Rank the modes by count, then by harm.** Never start from a generic list ("hallucination",
  "toxicity") before reading traces.

A real one: in a series over the showcase's support cases, `gemini-2.5-flash-lite` on the `triage` step
broke the 200-character limit of an observation three times in a row. That was its first answer and both
retries, so the run ended `MODEL_RETRIES_EXHAUSTED`. The engine refused the invalid output, as designed,
and the series counted a failure. The failure mode is "triage breaks its output contract". It is a
prompt fix if the prompt never states the limit, and a hypothesis about the agent if it does.

## From failure mode to experiment

| Category | Claim to test | Setup |
|---|---|---|
| Output contract and limits | agent A on step S passes its output contract in fewer than X of attempts | `threshold` on `success_rate`, `below`, `variant: A`, range `from: S, to: S`; read `schema_valid_first_try`; cases that push fields to their limits; `{{CLI_COMMAND}} models shapes <agent> --live` first |
| Instruction following | instruction I of the prompt is broken more often than X | one binary check per instruction (`regex`, `language`, `max_words`, `no_pii`, `run:`), `threshold` |
| Long or noisy input | on `length: very_long` the right answer drops below X; condensing first beats one step | `threshold` with `cases.tags` on one level; `compare` of two arms |
| Class boundaries | cases whose opening topic differs from the intent are decided right less than X | `expected` on the label field, cases selected by tags |
| Error propagation | a wrong output of S1 reaches the flow's output | a range below S1 with a planted wrong S1 output in `node_outputs`; checks for "noticed" and "final output right" |
| Judge reliability | judge J catches more than X of planted defects and passes more than Y of clean answers | an arm that runs the judge; clean answers and copies with one planted defect, tagged; one threshold per tag |
| Cost and latency | a variant stays under $X per case, or p95 under Y ms | `threshold` on `cost_usd` or `latency_p95_ms`, `below`, on the longest cases; p95 needs 20 attempts |
| Stability | a share of cases passes only sometimes | `repeats: 3` or more, read stability and pass^k; an A/A pair (two identical variants, `compare`, `margin: 0`) gives the noise floor |
| Agent per step | agent B on step S is not worse than A by more than m, and a pass costs less | `noninferior` on the range `from: S, to: S`, guardrails `cost_of_pass`, `schema_valid_first_try`, `latency_p95_ms`; one step at a time |
| Split a step | a chain S1 → S2 beats one call by more than m, and not only by calling more | `compare` against an arm of equal budget, with the single step as a third variant; guardrail `cost_of_pass`, `relative: true` |

The showcase project's experiments are worked examples of several rows:

- `reply_overpromise_risk`: a rare failure;
- `intent_split_long_messages`: long input;
- `critique_planted_defects`: a judge;
- `reply_stage_budget`: cost;
- `panel_aa_noise`: the noise floor;
- `reply_noninferior_mistral`: an agent per step.

[How to write an experiment](/engine/experiments/) covers every key.

## Cases and checks

- **Build cases from risk dimensions.** Pick about three dimensions aimed at the failure modes: length,
  opening topic, channel, a rare enum value. Write about 20 combinations by hand and generate the rest
  without duplicates. Then turn each combination into an input in a separate step. "Generate N examples"
  in one prompt yields near-identical happy paths.
- **Answer first, input second.** Build the expected record, then the input from it, and store the record
  as `expected_output`. Check that the answer can be recovered from the input, and that no second answer
  is plausible.
- **Tag every case with its dimensions, and add negative controls**: cases where the failure must not
  happen. Without them, a `refuted` means nothing, and a check that fires on everything goes unnoticed.
- **Mind the split.** The server splits cases 50/50 between working and held-out by a hash of `name`, so
  write twice as many as a held-out series needs. Never rename a case.
- **Use the cheapest check that works.** A series metric first, then a built-in `use:`, then your own
  `run:` function, and a judge only when nothing else can check it. Keep checks binary. A judge counts as
  evidence only with `validated_by`.

## Running and reading

- **Explore on working cases as often as you need**: a series there gives a `signal` at most. Freeze the
  metric, threshold, margin and guardrails before Confirm. Moving them afterwards makes a new experiment.
- **Don't edit the flow, the experiment, the dataset or the code while a series runs.** The series would
  end `invalid` with `inputs_changed`.
- **Quote `verdict.text`.** Don't restate, round or recompute it. `refuted` reads "the effect is within
  ±margin", never "no risk".
- **`inconclusive` with `below_mde`:** never rerun the same held-out cases for another answer. Write fresh
  cases and run a new held-out series of the recommended size. If that size is out of reach, the answer
  stays unclear, and a structural guard is the fix: a code check, a `switch`, a runtime `checks:` entry.
- **`inconclusive` with `uninformative` or `no_discordance`:** the cases are too easy or too hard to tell
  the variants apart. Write boundary cases, not more of the same.
- **Read stability, not only the mean.** A mean of 0.8 can be "a fifth of the cases always fail", which
  needs a fix in the step. It can also be "every case fails a fifth of the time", which a retry with a
  check, or a vote, handles. Lowering the temperature to look stable tests another product.
- **Report spend honestly.** With `spend.unpriced_attempts` above 0, `spend.usd` is a lower bound. Before
  a held-out series, give the developer the working series' spend and the recommended size.

## Applying a finding

| Finding | Change |
|---|---|
| step S breaks its output contract | first check the prompt states the limit; then another agent, more `output.retries`, or trimming in a `code` step; raise a limit only if the developer confirms it isn't a requirement |
| B is not worse and cheaper | point the node's `agent:` at B |
| the chain beats the equal-budget arm | move the arm's nodes into the flow with `flow_patch`; there's no tool that promotes an arm |
| a risk is real but no fix is proven | a structural guard, then a new hypothesis: "the guard keeps the risk below X" |
| the judge passes its planted-defect test | add `validated_by: <experiment_id>` to every check that uses it |

After every change, keep the cases it fixes in the dataset with `tags: {regression: "yes"}`. Run
`{{CLI_COMMAND}} check`, then a look over that tag on working cases. Record the decision under "Decision"
in the experiment's `experiment.md`: the finding path, the quoted verdict, what changed in which files,
and the risk that's left. A finding holds for the flow and the models it names. After the subject
changes, only a new held-out series speaks for the new flow.

## Never

- Change two things between series.
- Fix a downstream failure before the first upstream one.
- Drop hard cases so that a finding passes.
- Tune a prompt on held-out cases.
- Compare a multi-call arm only against a single call.
- Use a judge where `regex` or code can check.
- Weaken a type or a limit so that a series passes.
- Edit `findings/*.yaml` or `FINDINGS.md`.

## When to stop

The agent stops and reports `FINDINGS.md`, its decisions and the risks left when one of these holds:

- every "done" criterion from stage 1 is `confirmed` on held-out cases, and the regression look is clean;
- a fresh exploration round finds no failure mode seen twice;
- two rounds in a row moved neither quality, `cost_of_pass` nor p95;
- the needed number of cases is out of reach and a guard is in place;
- the agreed budget is spent.

It stops and asks you when a series waits for approval, or when variants trade quality against cost. It
also asks when "done" turns out not to be measurable.

## What the engine leaves to the agent

Some rules above are discipline, not enforcement:

- **Failure modes.** No file type holds them, so they live in the look experiment's `experiment.md`.
- **Equal budgets.** The server doesn't check that a multi-call arm is compared against an arm with the
  same number of calls.
- **Stability.** pass^k and the flaky share are shown but can't be a question's metric, so they never
  get a verdict.
- **Stale findings.** Nothing marks a finding stale when the flow changes. The hashes in the file tell
  what it measured.
- **Promoting an arm.** No tool moves a winning arm into the flow: the agent does it with `flow_patch`.

## See also

- [How to run experiments and series as an agent](/mcp-cli/experiments-and-series/): the three series
  tools and their fields.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/): working and held-out
  cases, verdicts and findings.
- [How a series decides](/concepts/how-a-series-decides/): intervals, margins, repeats and judges.
- [How to write an experiment](/engine/experiments/) and [How to read a series](/engine/read-a-series/).
- [The engineering loop](/concepts/engineering-loop/): the same loop, from a single incident.
