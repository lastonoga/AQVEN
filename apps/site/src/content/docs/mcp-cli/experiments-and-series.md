---
title: How to run experiments and series as an agent
description: Write an experiment file, start a series with series_start, wait for its verdict with series_get, and stop one with series_cancel.
---

## When you need this

You're connected to a project over MCP and need a number you can act on: whether a failure stays rare
enough, whether a change or another agent is better, whether a cheaper agent is not worse. The question
lives in an experiment file, `experiments/<experiment_id>/experiment.yaml`. A **series** runs that
experiment live: every selected case, for every variant, `repeats` times. Every attempt is an ordinary
run with its own trace, and every attempt calls the models and costs money. Three tools cover it:
`series_start`, `series_get` and `series_cancel`. [How an agent takes a task to a reliable
flow](/mcp-cli/research-loop/) is the order to use them in, round after round.

## Steps

- **Write the experiment first, then run `aqven_check`.** There is no tool that creates an experiment:
  it is a file, and you write it like any other ([How to write an experiment](/engine/experiments/)).
  Give it a `failure_mode` and a falsifiable `description`. `aqven_check` validates the subject and its
  range, the variants' agents, the dataset and its tag filter, the checks and the fields they read, the
  metric names and `validated_by`. A series refuses to start on a project with errors, or when a case
  can't run for a variant. It fails with `NOT_RUNNABLE` and one problem per case and variant, before a
  single model call.
- **`series_start`** takes exactly one of `experiment_id` or `look` (below), plus `on` (`dev` or
  `holdout`, `dev` by default) and, optionally, `cases`, `repeats` (at most 20), `cap_usd` and a
  `client_op_id`. It returns at once with the series summary and the `estimate`: attempts, dollars,
  minutes, the expected interval half-width and the recommended number of cases. Sending the same
  `client_op_id` again returns the same series instead of starting a second one.
- **The status after `series_start` is `running` or `awaiting_approval`.** A series starts by itself,
  whatever its estimate, under the project spend cap (`research.spend_cap_usd` in `aqven.yaml`, $1.00 by
  default; a local override on the project server wins on that computer) or the `cap_usd` you pass. Only
  a `cap_usd` above the project cap waits for a person before anything runs. While it runs, a series whose
  spend reaches 90% of its cap starts no new attempts, lets the running ones finish and waits in
  `awaiting_approval` with `pause.reason` `spend_near_cap` and `pause.spent_usd`. There is no MCP tool for
  approving: tell the user what it spent, and they continue it with a higher cap in Studio or with
  `POST /api/series/{series_id}/approve`. There is no estimate-only tool either: the estimate is
  information. A person who wants it first reads it in Studio's Launch panel, or from
  `POST /api/experiments/{experiment_id}/estimate`.
- **`series_get`** takes a `series_id` and `wait_seconds` (0 to 50). With `wait_seconds` above 0 it
  holds the answer until the series is `done`, `cancelled`, `failed`, `awaiting_approval` or
  `waiting_human`, or until the time runs out, and then returns the current snapshot. Call it again
  until the status settles. The snapshot carries progress, spend against the cap, the per-variant
  matrix with 95% intervals, and the verdict. `spend.unpriced_attempts` counts the attempts that ran on
  a model without a known price: when it is above 0, `spend.usd` is a lower bound, so say so. A series
  is `failed` only when every attempt hit an infrastructure error, and then `error` names the first one.
- **Quote `verdict.text` as it is once the status is `done`.** The server writes that sentence from
  the interval and the margin declared in the file. Repeat it; don't round the numbers or put them in
  your own words. While a series is still running, its verdict is provisional.
- **`include_cases: true`** adds per-case rows to `series_get`, but only for `dev` cases: failing cases
  first, at most 50, and the rest counted in `hidden_cases`. Held-out cases are never shown to the agent
  one by one, so a change can't be tuned to them. Each row gives every variant's tally and failed checks,
  and each attempt its `outcome`, `error` and `run_id`: open that run with `run_get` and `run_events` to
  find the first node that failed.
- **A failure counts, an infrastructure error doesn't.** An attempt whose model broke its output type
  even after its retries (`MODEL_RETRIES_EXHAUSTED`, `MODEL_SCHEMA_MISMATCH`, invalid JSON) is a counted
  failure, like a provider refusing the output type as too complex (`OUTPUT_SCHEMA_REJECTED`), a failed
  check or a refusal. A missing provider key, a provider error, a timeout, a stalled stream
  (`MODEL_STREAM_STALLED`) or broken code is an infrastructure error. It stays out of the metrics, and above 5% of the attempts it makes the
  series `invalid`. See
  [How a series decides](/concepts/how-a-series-decides/#a-failure-or-an-infrastructure-error).
- **`series_cancel`** takes a `series_id` and an optional `reason`. Queued attempts never start. Model
  calls already running finish and are paid for. No finding is written. Cancelling a series that has
  already stopped fails with `SERIES_STATE_CONFLICT`.

### `dev` to search, `holdout` to decide

The server splits every dataset in half by a hash of the case `name`, the same way in every clone of the
project. Iterate on `dev` as often as you need: a series on `dev` gives at most a `signal`, never a
finding. Run `holdout` once, when the change is done and the question is fixed. A series on `holdout`
whose verdict is anything but `invalid` writes `experiments/<experiment_id>/findings/<series_id>.yaml`
once and regenerates `FINDINGS.md` at the module root. Both are generated files, so don't edit them;
`aqven check` reports an edited finding as `E_FINDING_TAMPERED` and a stale `FINDINGS.md` as
`W_FINDINGS_STALE`.

| Verdict | Meaning |
|---|---|
| `confirmed` | the 95% interval clears the bound, or beats the baseline, by more than the declared margin |
| `refuted` | the effect is within the margin or reversed |
| `inconclusive` | the interval is too wide to decide; `below_mde` means more cases would decide it |
| `signal` | the series ran on `dev`, or the deciding check is a judge without `validated_by` |
| `invalid` | cancelled, stopped by the spend cap, inputs changed during the series, more than 5% infrastructure errors, or no data |

### A look without an experiment

To see what a flow does on a few named cases, pass `look` instead of `experiment_id`:
`{"look": {"flow_id": "support_case", "dataset_id": "support_case_cases", "case_names": ["strip_flicker_credit"]}}`.
Each named case runs once, with no verdict and no finding, up to 500 cases. `start_node` and `end_node`
narrow the runs to a range of top-level nodes, and the nodes above the range take their outputs from the
case. A look runs the named cases on whichever side of the split they are. `include_cases` still shows
only the working ones and counts the rest in `hidden_cases`.

### Example

In the [showcase](/start/quickstart/) project, `reply_overpromise_risk` asks whether the `polish` range
of `support_case` keeps its `promises` check above 0.97 with a margin of 0.01. Before starting it on two
working (`dev`) cases, repeated twice, look at the estimate `series_start` would return. Studio asks the same
question with `POST /api/experiments/reply_overpromise_risk/estimate` and the body
`{"on": "dev", "cases": 2, "repeats": 2}`. The response below is real, trimmed, from AQVEN's example
project `lumen` with no price history and no provider key, on a machine without network. The showcase
template is the same project under your package name, and the salt of the split is the package name, so
your count of working cases can differ by one or two:

```json
{
  "on": "dev",
  "cases": 2,
  "repeats": 2,
  "variants": 1,
  "attempts": 4,
  "available": 6,
  "usd": "0.0047567880",
  "usd_source": "bound",
  "minutes": null,
  "half_width": 0.24352108850049436,
  "margin": 0.01,
  "recommended": {
    "cases": 1187,
    "repeats": 2,
    "reason": "short_of_cases",
    "text": "about 1187 cases are needed for a half-width within the 0.01 margin, but only 6 are available"
  },
  "below_recommended": true,
  "needs_approval": false,
  "project_cap_usd": "1.00",
  "project_cap_source": "project",
  "cap_usd": "1.00"
}
```

`usd_source` says where the dollars come from: `history` (earlier series of this experiment), `prices`
(the token counts of past runs of the flow at today's prices), `bound` or `unknown`. With no series of
this experiment yet, `usd_source` is `bound`: a rough estimate from the rendered prompt
of the largest planned case and a typical answer (the agent's `max_tokens`, at most 1,000 tokens), times
the loop caps and fan-out and a 1.5 margin, priced per token. OpenRouter's price list was out of reach here, so the price came from the `genai-prices` table
bundled with the engine. `project_cap_source` says where the project cap came from: `project` for
`aqven.yaml`, as here, `override` for a local override, `default` when neither sets it. No `cap_usd` was
passed, so `needs_approval` is `false` and the series cap is the project cap:
`series_start` with the same `on`, `cases` and `repeats` starts the series as `running` at once, with a
cap of $1.00, and every attempt calls the model live. Without a provider key those attempts fail as
infrastructure errors, and the series ends `failed` with the missing key named in `error`.

The `recommended.text` is the warning to pass on: with six working cases, no series of this experiment can
settle a margin that narrow. If a series is already running, `series_cancel` stops it: queued attempts
never start, the status becomes `cancelled`, and the verdict is `invalid` with the reason `cancelled`. A
second `series_cancel` on the same series fails with `SERIES_STATE_CONFLICT`.

The same series from a terminal is `{{CLI_COMMAND}} series reply_overpromise_risk --cases 2 --repeats 2`.
It starts the project server if it isn't running, then waits and prints the progress and the verdict.
It exits with 0 when the series is done, whatever the verdict, and with 1 when it was cancelled or failed.
It exits with 3, printing a Studio link, when the series waits for approval or paused near its cap, and with 4 when an attempt
waits for a person. `--cap` sets the series' own cap, and `--json` prints the final state as one JSON
line. [How to run a series](/engine/run-a-series/) lists every flag and exit code.

## See also

- [How an agent takes a task to a reliable flow](/mcp-cli/research-loop/) — the rounds these tools serve.
- [How to start and follow runs as an agent](/mcp-cli/runs/) — every attempt of a series is one of
  these runs, and `run_get_node` opens any of them.
- [How to use Research in Studio](/studio/research/) — the same experiments and series, read and
  approved by a person.
- [How to read a series](/engine/read-a-series/) — what to do after each verdict and reason.
- [How to write a custom evaluator](/engine/custom-evaluator/) — checks an experiment scores on every
  attempt.
- [Experiments reference](/reference/experiments/) and [Findings reference](/reference/findings/) — every
  key of `experiment.yaml` and of a finding file.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/) — why the question is
  written before the data, and what a series costs.
