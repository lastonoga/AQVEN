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

The **subject** is what runs: a project flow, a range of its top-level nodes, or an **arm**. An arm is a
small flow that only one experiment runs. A **variant** is what differs between attempts: other agents on
some `llm` nodes, or another arm. A variant never names a bare model, because the agent carries the model,
its settings and its output mode. The **question** picks the statistic: `look`, `threshold`, `compare` or
`noninferior`. [How to write an experiment](/engine/experiments/) covers every key.

Every attempt of a series is an ordinary run with its own trace. You open it the same way as a run you
started by hand. Raw attempts stay in the project database, outside git. The finding file carries
everything its verdict rests on.

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
| `invalid` | cancelled, stopped by the spend cap, inputs changed during the series, more than 5% infrastructure errors, or no data |

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

Every attempt calls the models, so a series shows its **estimate** before it runs: attempts, dollars and
minutes. The dollars have a source, and Studio labels it:

| `usd_source` | Where the number comes from | Studio shows |
|---|---|---|
| `history` | the average cost of the same variant's attempts in earlier series of this experiment | ≈ from past series |
| `prices` | the token counts of past runs of the flow, at today's token prices | ≈ at provider prices |
| `bound` | an upper bound when nothing has run yet: the rendered prompt of the largest case in, the agent's `max_tokens` out, times loop caps and fan-out | ≤ upper bound |
| `unknown` | a model of the series has no known price | no price estimate |

When variants differ, the series shows the least certain source of them. A token price comes from the
provider's own price list first (OpenRouter's public model list), then from the `genai-prices` table
bundled with the engine. The cost of a finished call comes from the provider's own report first. A call
that nothing prices is counted as unknown, not free. When some attempts ran on such a model, the spend of
the series is a lower bound, and every surface says so.

The project setting `research.spend_cap_usd` ($1.00 by default) decides who starts a series:

- **At or below the cap**, the series starts by itself. Its own cap is 1.25 × the estimate, rounded up to a
  cent, and never above the project cap.
- **Above the cap, or unknown**, the series waits in `awaiting_approval` until a person approves the spend.
  An agent can start a series but never approve one.
- **With an explicit cap** (`cap_usd`, or `--cap` in the terminal), the series runs under that cap. It
  waits for approval when that cap or the estimate is above the project cap, or when the estimate is
  unknown.

A series that reaches its cap stops and ends `invalid`, so no finding is written.

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
