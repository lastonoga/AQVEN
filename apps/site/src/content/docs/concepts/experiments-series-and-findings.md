---
title: Experiments, series and findings
description: A run proves one case. An experiment writes a question down before any data, a series answers it on many cases, and a finding records the answer in the project.
---

## In short

One run proves one case. `{{CLI_COMMAND}} check` proves the wiring. Neither says whether a flow works
reliably. For that AQVEN has three pieces:

- An **experiment** writes one question in a file, before anyone sees a number.
- A **series** answers it by running many cases, for every variant, several times.
- A **finding** records the answer in the project, where people and agents read it next time.

A flow gets reliable in rounds. You look at what it does and form a hypothesis about where it breaks. Then
you measure that on working cases and confirm it once on held-out cases. The finding changes the flow, and
the next round starts.

## The pieces

| Piece | What it is | Where it lives |
|---|---|---|
| Case | one input with its context, the upstream `node_outputs` a range needs, an optional `expected_output` and `tags` | `datasets/<dataset_id>.yaml` |
| Agent | a model with its settings and output mode | `agents/<agent_id>.yaml` |
| Check | a detector scored on every attempt: a built-in, your own function, or a model as judge | inside the experiment |
| Experiment | subject × variants × cases × checks × question | `experiments/<experiment_id>/experiment.yaml` |
| Series | one live execution of an experiment: every selected case, every variant, `repeats` times | the project database, `.aqven/aqven.sqlite` |
| Finding | the verdict of a series on held-out cases, written once | `experiments/<experiment_id>/findings/<series_id>.yaml`, summed up in `FINDINGS.md` |

The **subject** is what runs: a flow, or a range of its top-level nodes. The **question** picks the
statistic: `look`, `threshold`, `compare` or `noninferior`. What sits between them, the variants, is the
part that decides what an experiment can tell you, so it has its own section below.
[How to write an experiment](/engine/experiments/) covers every key.

Every attempt of a series is an ordinary run with its own trace. You open it the same way as a run you
started by hand. Raw attempts stay in the project database, outside git. The finding file carries
everything its verdict rests on.

## One factor per experiment

An experiment compares **variants** on **checks**. Picture a table: every variant is a row, every check is
a column, and a series fills the cells. The rows are the things you compare, and the columns are how you
measure them. When the thing you want to compare ends up as a column, a check that computes the other
method, the table can't rank it.

Each experiment changes **one factor** of its subject. `varies` names what kind of change it is and which
nodes it touches, and each variant only sets values for those nodes. A variant without values runs the
subject as written. Because only one kind of thing changes, a difference between rows has one cause: the
model, the prompt, the step or the logic, never a mix of them.

| `what` | The slot | A variant's value | What changes |
|---|---|---|---|
| `agent` | an `llm` node | an agent of the project | the node answers with another model, settings or output mode |
| `prompt` | an `llm` node | a file `prompts/<name>.md` of the experiment | the node's prompt text; its inputs, output schema and checks stay |
| `use` | any node | an alternative node from `nodes/` of the experiment | the node is replaced by the alternative, which takes the slot's id |
| `flow` | a `call` node | another flow: a local one from `flows/`, else a project flow | the flow the node calls; its input bindings stay, and the new flow has the same input and output types |

A variant never names a bare model. The agent carries the model, its settings and its output mode, so
`agent` is how you compare models.

Each kind has an experiment in the showcase project.

**`agent`: which model answers this step.** `reply_noninferior_mistral` puts `mistral` on the `revise` step
of `support_case`:

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
```

**`prompt`: which wording works better.** `panel_judge_prompt` gives the three judges of `judge_panel` other
prompt texts. They live in `experiments/panel_judge_prompt/prompts/claims_first.md` and
`anchored_scale.md`. Each judge keeps its inputs, output schema and checks, and the tie-break judge keeps
its own prompt:

```yaml
subject:
  flow: "judge_panel"
varies:
  what: "prompt"
  nodes:
  - "deepseek"
  - "qwen"
  - "llama"
variants:
- id: "as_written"
- id: "claims_first"
  nodes:
    deepseek: "claims_first"
    qwen: "claims_first"
    llama: "claims_first"
- id: "anchored_scale"
  nodes:
    deepseek: "anchored_scale"
    qwen: "anchored_scale"
    llama: "anchored_scale"
```

**`use`: which implementation of one step.** `panel_merge_rule` replaces the `aggregate` code step of
`judge_panel`. Each alternative is an ordinary node in `experiments/panel_merge_rule/nodes/<alt>/`, with its
own `.node.yaml` and code. It runs under the slot's id, so the nodes after it read `$aggregate.out` as
before:

```yaml
subject:
  flow: "judge_panel"
varies:
  what: "use"
  nodes:
  - "aggregate"
variants:
- id: "majority_and_spread"
- id: "majority_only"
  nodes:
    aggregate: "majority_only"
- id: "always_tie_break"
  nodes:
    aggregate: "always_tie_break"
```

**`flow`: which way of splitting the task.** This is the pattern for comparing logic. Fix what already
works, the models and the prompts, and give the part you want to rethink its own flow behind a `call`
node, the slot. In `panel_single_judge` the subject is `winner_pick`, a flow that lives only in
`experiments/panel_single_judge/flows/` and whose one node, `panel`, calls the project's `judge_panel`.
The other variant plugs in `single_judge`, a second local flow. Both flows in the slot take the same input
and return the same output, so the same cases and checks run on both:

```yaml
subject:
  flow: "winner_pick"
varies:
  what: "flow"
  nodes:
  - "panel"
variants:
- id: "panel"
- id: "single_judge"
  nodes:
    panel: "single_judge"
```

A factor can touch several nodes at once: `nodes` of `varies` may list three `llm` nodes, and a variant
gives each of them the same or a different agent. A combination of kinds, such as a cheaper model with a
prompt tuned for it, goes into one alternative node and is compared with `use`.

Everything an experiment needs sits in its folder:

```text
experiments/<experiment_id>/
  experiment.yaml          the question, the factor and the variants
  experiment.md            notes for people, optional
  nodes/<alt>/...          alternative nodes for use
  prompts/<name>.md        alternative prompt texts for prompt
  flows/<flow_id>/...      flows only this experiment runs, for flow or as the subject
  findings/<series>.yaml   written by the server
```

A local flow stays out of the project's flow list, and its id can't be the id of a project flow. When the
subject or a `flow` value names a flow, the experiment's `flows/` is searched first.

In Studio, the variants table of an experiment has a caption that names the factor, such as "Varies:
prompt of deepseek, qwen, llama", and a value column: what each variant puts in the slots. A variant with
no values reads **as written**.

## Working and held-out cases

The server splits every dataset in two halves by a hash of each case's `name`. The hash is salted with the
package name, so every clone of the project gets the same split, and nobody picks which case goes where.
Studio calls the two uses **Explore** and **Confirm**:

| | Working cases (`dev`) | Held-out cases (`holdout`) |
|---|---|---|
| Studio purpose | Explore | Confirm |
| What a series gives | numbers and a `signal`, never a finding | a verdict and a finding |
| How often | as often as you need, one change between series | once, when the change is done and the question is fixed |
| Case by case | failing cases are shown, to you and to an agent | never shown to an agent one by one |

Iterating on the same cases you decide on tunes the flow to those cases. Adding cases and recomputing
until the answer looks right inflates false confirmations too. So the held-out half is read once per
question. A finding counts every finished held-out series of its experiment on the same cases. When there
is more than one, `FINDINGS.md` says how many of them confirmed.

Two consequences for writing cases:

- Write about twice as many cases as a held-out series needs, because half of them land on the working
  side.
- Never rename a case. A renamed case is a new case and may switch sides.

A series asked for N cases takes the first N cases of its half, in file order.

## Verdicts and signals

A finished series has one of five verdicts. The server writes the verdict as a sentence from the 95%
interval and the margin in the file. People and agents quote that sentence; nobody recomputes it.

| Verdict | Meaning |
|---|---|
| `confirmed` | the interval clears the bound, or beats the baseline, by more than the declared margin |
| `refuted` | the effect is within the margin or reversed. It never means "no risk" |
| `inconclusive` | the interval is too wide to decide |
| `signal` | the series ran on working cases, or the deciding check is a judge without `validated_by` |
| `invalid` | cancelled, inputs changed during the series, more than 5% infrastructure errors, or no data |

A `look` has no verdict at all: it shows every case with its checks, cost and trace.

A **signal** is a number worth acting on during Explore, but it isn't evidence. It comes from working
cases, which you tuned against. Or it comes from a judge nobody measured, whose own errors go straight
into the metric. [How a series decides](/concepts/how-a-series-decides/) explains the intervals behind all
five verdicts.

## Findings and `FINDINGS.md`

A series on held-out cases writes a finding when its verdict is anything but `invalid`. Two files change in
one transaction:

- `experiments/<experiment_id>/findings/<series_id>.yaml`. It holds the verdict with its sentence, every
  decided cell with its estimate and interval, and the variants with the models that actually answered.
  It also holds the scope (cases, repeats, dates, engine version) and hashes of everything the series ran
  on. A later series with different hashes measured something else, so the finding doesn't speak for it.
- `FINDINGS.md` at the module root, regenerated from all finding files. It has one section per
  `failure_mode`, and in each section the shelves **On holdout cases** (confirmed and refuted),
  **Inconclusive** and **Signals**. Each line names the experiment, quotes the finding, gives its scope
  and links the file.

Both files are generated, and a finding is written once. `{{CLI_COMMAND}} check` reports an edited finding
as `E_FINDING_TAMPERED` and a `FINDINGS.md` that doesn't match the findings as `W_FINDINGS_STALE`. To
revise a finding, run a new series on held-out cases.

`FINDINGS.md` is what the project knows. Studio's chat agent reads it with `AGENTS.md` and `CLAUDE.md`
before your first message. An agent you start yourself should read it before it proposes a change.

## What a series costs

Every attempt calls the models, and what it costs depends on the models it calls, so a series has no
price before it runs. Its **launch plan** shows what it will run instead: the attempts (cases × repeats ×
variants), the recommended number of cases and the cap. The spend is counted as the attempts finish.

The cost of a finished call comes from the provider's own report first. Without one, the call is priced by
the provider's own price list (OpenRouter's public model list), then by the `genai-prices` table bundled
with the engine. A call that nothing prices is counted as unknown, not free. When some attempts ran on such
a model, the spend of the series is a lower bound, and every surface says so.

What a series actually spends decides when a person is asked. The project spend cap lives in `aqven.yaml` as `research.spend_cap_usd`, $1.00 in every new project and $1.00
when the block is missing. A local override with the same key on the project server wins on that computer
only.

The cap works like this:

- **Every series starts at once**, with the project cap as its own cap.
- **The first attempt runs alone.** What it actually cost becomes the reserve of every attempt that
  follows, and only then does the series run attempts side by side, so a first batch can't spend past the
  cap before any attempt has a price.
- **Near the cap it pauses.** When the spend plus a reserve for each running attempt (the most a finished
  attempt of the series has cost) reaches 90% of the
  series cap, the series starts no new attempts, lets the running ones finish and waits in
  `awaiting_approval`, with `pause.reason` `spend_near_cap` and `pause.spent_usd`. A person continues it
  with a higher cap (double the old one unless they type another) or stops it. An agent can start a series
  but never continue one.
- **With an explicit cap** (`cap_usd`, or `--cap` in the terminal), the series runs under that cap. A cap
  above the project cap waits for approval before anything runs (`pause.reason` `cap_above_project`).

## How this shapes what you do

Write the question before the data, and explore on working cases as often as you like. Confirm once on
held-out cases, then act on the finding and start the next round. These pages cover the mechanics:

- [How to write an experiment](/engine/experiments/)
- [How to run a series](/engine/run-a-series/)
- [How to read a series](/engine/read-a-series/)
- [How an agent takes a task to a reliable flow](/mcp-cli/research-loop/): the whole loop, round by round.

## See also

- [How a series decides](/concepts/how-a-series-decides/): intervals, margins, repeats and judges in plain
  words.
- [The engineering loop](/concepts/engineering-loop/): where experiments sit between finding a cause and
  shipping a fix.
- [Experiments reference](/reference/experiments/) and [Findings reference](/reference/findings/): every
  key of both files.
