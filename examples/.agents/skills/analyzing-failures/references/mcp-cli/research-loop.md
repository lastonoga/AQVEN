# How an agent takes a task to a reliable flow

The loop a coding agent runs over MCP — contract, simplest flow, cases, a look, error analysis, hypotheses, Explore on working cases, Confirm on held-out cases, apply the finding — round after round until the flow holds.

## Contents

- [When you need this](#when-you-need-this)
- [Hand it the task](#hand-it-the-task)
- [The loop](#the-loop)
- [Finding what to test](#finding-what-to-test)
- [From failure mode to experiment](#from-failure-mode-to-experiment)
- [Cases and checks](#cases-and-checks)
- [Running and reading](#running-and-reading)
- [Applying a finding](#applying-a-finding)
- [Never](#never)
- [When to stop](#when-to-stop)
- [What the engine leaves to the agent](#what-the-engine-leaves-to-the-agent)
- [See also](#see-also)

## When you need this

You give a coding agent a task, and the agent builds the flow. It runs the flow, checks it, writes
experiments and repeats, until the findings show the flow works reliably. Each tool proves a different
thing. `aqven check` proves the wiring. One run proves one case. Only a series on held-out cases
proves a claim. This page is the order in which the agent uses them, and what you get back.

It assumes an agent connected over MCP: set one up, or use
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
| 2. Simplest flow | one `llm` step per real decision, `code` for the rest; `aqven check` is clean; `aqven prompt preview` is read for every `llm` node |
| 3. Cases | a dataset with `expected_output` and tags exists; `aqven check` is clean |
| 4. Explore | a `look` experiment with deterministic checks ran on working cases, and every failing case is read (`include_cases: true`) |
| 5. Error analysis | you have read and noted the first traces; every failure has its first failing node and a failure mode you agreed; new failing traces stop adding modes |
| 6. Fix the spec | what the prompt never asked for is fixed in the prompt or the type, then stage 4 again |
| 7. Hypotheses | one experiment per remaining failure mode, written before any number |
| 8. Explore | series on working cases, one change between series, until the change is done and the question is fixed |
| 9. Confirm | one series on held-out cases, with `cases` from the launch plan's recommendation when the half has them; `verdict.text` quoted |
| 10. Apply | the flow changes, regression cases are added, the decision is recorded; then stage 4 on fresh cases, or stop |

Stages 4 to 10 are one round. A series starts by itself, and pauses when its spend reaches 90% of the
project spend cap. Then the agent tells you what it spent and waits: only a person lets it spend more, in
Studio.

## Finding what to test

- **Take the failing node from the run, not from the output.** A failing case row carries the attempt's
  error and its `run_id`; `run_get` and `run_events` show the first node that failed. Fix the first
  failure upstream, because later ones often cascade from it. In a multi-step flow, count failures by the
  last node that succeeded and the first that failed, and start with the biggest count.
- **You read the first traces, not the agent.** After the first look, the agent hands you the failing
  runs first, then a few passing ones: about 30 traces in total, or all of them if there are fewer. Each
  comes with its `run_id` and where to open it in Studio. You write one short note per trace about the
  first thing that went wrong, or "fine". The agent prepares and you judge: it may attach the first
  failing node of each failure, but what went wrong is your note.
- **The agent groups your notes into failure modes**: an id, a one-line definition, a count, and two or
  three `run_id`s. It shows you the list, and writes it under "Failure modes" in the look experiment's
  `experiment.md` only after you agree. The id becomes the `failure_mode` of every experiment that tests
  it, and the section of `FINDINGS.md` its findings land in.
- **Later rounds bring you only what's new.** The agent reads new failing traces itself and maps them to
  the known modes. It brings you only the traces that fit no known mode, and adds a new mode only after
  you have read them. Stop when about 20 more failing traces add no new mode. Few failures means the
  cases are too easy, not that the flow is done.
- **Not everything deserves an experiment.** The prompt or type never asks for the behavior: fix the
  prompt. An empty or literal placeholder in the prompt preview: fix the binding. An infrastructure
  error: fix the key, the limit or the code. Only a failure on behavior the flow clearly asks for becomes
  a hypothesis.
- **Rank the modes by count, then by harm.** Never start from a generic list ("hallucination",
  "toxicity") before you have read traces.

A real one: in a series over the showcase's support cases, `gemini-2.5-flash-lite` on the `triage` step
broke the 200-character limit of an observation three times in a row. That was its first answer and both
retries, so the run ended `MODEL_RETRIES_EXHAUSTED`. The engine refused the invalid output, as designed,
and the series counted a failure. The failure mode is "triage breaks its output contract". It is a
prompt fix if the prompt never states the limit, and a hypothesis about the agent if it does.

## From failure mode to experiment

| Category | Claim to test | Setup |
|---|---|---|
| Output contract and limits | agent A on step S passes its output contract in fewer than X of attempts | `threshold` on `success_rate`, `below`, `variant: A`, range `from: S, to: S`; read `schema_valid_first_try`; cases that push fields to their limits; `aqven models shapes <agent> --live` first |
| Instruction following | instruction I of the prompt is broken more often than X | one binary check per instruction (`regex`, `language`, `max_words`, `no_pii`, `run:`), `threshold` |
| Long or noisy input | on `length: very_long` the right answer drops below X; condensing first beats one step | `threshold` with `cases.tags` on one level; `compare` with a `flow` factor: the reading step behind a `call` node, one local flow per way of reading |
| Class boundaries | cases whose opening topic differs from the intent are decided right less than X | `expected` on the label field, cases selected by tags |
| Error propagation | a wrong output of S1 reaches the flow's output | a range below S1 with a planted wrong S1 output in `node_outputs`; checks for "noticed" and "final output right" |
| Judge reliability | judge J catches more than X of planted defects and passes more than Y of clean answers | a local flow that runs only the judge as the subject; clean answers and copies with one planted defect, tagged; one threshold per tag |
| Cost and latency | a variant stays under $X per case, or p95 under Y ms | `threshold` on `cost_usd` or `latency_p95_ms`, `below`, on the longest cases; p95 needs 20 attempts |
| Stability | a share of cases passes only sometimes | `repeats: 3` or more, read stability and pass^k; an A/A pair (two identical variants, `compare`, `margin: 0`) gives the noise floor |
| Agent per step | agent B on step S is not worse than A by more than m, and a pass costs less | `noninferior` with an `agent` factor on S, on the range `from: S, to: S`, guardrails `cost_of_pass`, `schema_valid_first_try`, `latency_p95_ms`; one step at a time |
| Split a step | a chain S1 → S2 beats one call by more than m, and not only by calling more | a `flow` factor on a `call` slot: the chain, a local flow of equal budget and the single step as three variants; `compare` the chain against the equal-budget flow; guardrail `cost_of_pass`, `relative: true` |

Every experiment changes one factor, named in `varies`, and each variant only sets its values. Pick the
factor from what the hypothesis is about:

| The hypothesis is about | `varies.what` | The variants set |
|---|---|---|
| which model or agent takes a step | `agent` | an agent per `llm` node |
| how a step is worded | `prompt` | a file from the experiment's `prompts/` per `llm` node |
| how one step is implemented: a different algorithm, or a cheaper model with a prompt tuned for it | `use` | an alternative node from the experiment's `nodes/` |
| how the task is split into steps | `flow` | a flow for a `call` node, local from the experiment's `flows/` or from the project |

For a question about the logic, fix what already works (the models and the prompts) and give the part you
want to rethink its own flow behind a `call` node. Each variant plugs a different flow into that slot. A
way of combining results that you want to rank is a variant, never a check: checks are the columns every
variant is measured on.

The showcase project's experiments are worked examples of several rows:

- `reply_overpromise_risk`: a rare failure;
- `intent_split_long_messages`: long input;
- `critique_planted_defects`: a judge;
- `reply_stage_budget`: cost;
- `panel_aa_noise`: the noise floor;
- `reply_noninferior_mistral`: an agent per step.

How to write an experiment covers every key.

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
| the chain beats the equal-budget flow | a project flow in the slot: point the `call` node at the winning flow, moving a local flow into `flows/` of the project with `flow_patch`; a winning `prompt`, `agent` or `use` value is copied into the node the same way. No tool promotes a variant |
| a risk is real but no fix is proven | a structural guard, then a new hypothesis: "the guard keeps the risk below X" |
| the judge passes its planted-defect test | add `validated_by: <experiment_id>` to every check that uses it |

After every change, keep the cases it fixes in the dataset with `tags: {regression: "yes"}`. Run
`aqven check`, then a look over that tag on working cases. Record the decision under "Decision"
in the experiment's `experiment.md`: the finding path, the quoted verdict, what changed in which files,
and the risk that's left. A finding holds for the flow and the models it names. After the subject
changes, only a new held-out series speaks for the new flow.

## Never

- Change two things between series, or two kinds of thing in one experiment.
- Fix a downstream failure before the first upstream one.
- Drop hard cases so that a finding passes.
- Tune a prompt on held-out cases.
- Compare a multi-call flow only against a single call.
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

It stops and asks you when traces are ready for your notes, when a series waits for approval, or when
variants trade quality against cost. It also asks when "done" turns out not to be measurable.

## What the engine leaves to the agent

Some rules above are discipline, not enforcement:

- **Failure modes.** No file type holds them, so they live in the look experiment's `experiment.md`.
  Nothing checks that you read the first traces or agreed the list.
- **Equal budgets.** The server doesn't check that a multi-call flow is compared against a flow with the
  same number of calls.
- **Stability.** pass^k and the flaky share are shown but can't be a question's metric, so they never
  get a verdict.
- **Stale findings.** Nothing marks a finding stale when the flow changes. The hashes in the file tell
  what it measured.
- **Promoting a variant.** No tool moves a winning value into the flow: the agent does it with `flow_patch`.

## See also

- How to run experiments and series as an agent: the three series
  tools and their fields.
- Experiments, series and findings: working and held-out
  cases, verdicts and findings.
- How a series decides: intervals, margins, repeats and judges.
- How to write an experiment and How to read a series.
- The engineering loop: the same loop, from a single incident.
