---
title: How to run datasets and evals as an agent
description: Call the 5 dataset and eval MCP tools, and the one place eval_run_start's shape genuinely differs from the same call over REST.
---

# How to run datasets and evals as an agent

## When you need this

You're connected to a project over MCP and need to run a batch of dataset cases, or run an eval and
read its gate verdict, without opening Studio. Five tools cover it: start and check a dataset batch,
start and check an eval run, and read an eval run's gate report on its own.

## Steps

- **`dataset_batch_start`** takes a `flow_id`, a `dataset_id` — a dataset that declares a `flow`, the
  kind [Studio's Datasets tab](/studio/datasets/) lists under that flow, not the dataset a co-located
  eval scores — and `case_names`, at least one. `selected_nodes`, or a `start_node`/`end_node` pair,
  scope every case's run the same way `run_start` scopes a single run. It returns at once: `batch_id`,
  `status: "running"`, and `cases_total` with `cases_completed`/`cases_failed` both still `0`.
- **`dataset_batch_get`** takes that `batch_id` and returns the same record, refreshed: `status`
  (`running`, `completed`, or `failed`), `cases_completed`, `cases_failed`, and `cost_usd` so far. Poll
  it until `status` leaves `running`. This one has no REST/MCP divergence — the same record comes back
  either way.
- **`eval_run_start`** takes an `eval_id` — the file name of the eval under `evals/<flow_id>/` — plus an
  optional `dataset_id` to score a different dataset than the one the eval declares, a `baseline_run_id`
  to request a gate against an earlier run, and a `repeats` override. Like the batch tool, it returns at
  once, before any case has finished.
- **This is the one real shape divergence in this group.** Over MCP, `eval_run_start` returns the full
  eval run record — the same shape `eval_run_get` returns later: `status`, `cases_total`, `scorers`,
  `gate`, all still empty or zero because nothing has run yet, but the full shape. The REST route for the
  identical operation (`POST /api/eval-runs`) answers with HTTP 202 and a much smaller body instead: just
  `eval_run_id`, `eval_id`, `status`, and `poll` — the URL to check next. If you call this over REST
  expecting the same fields MCP gives you, they aren't there; call the `poll` URL, which is the same
  operation as `eval_run_get`, to get the full record.
- **`eval_run_get`** takes an `eval_run_id` and returns the full record either way, MCP or REST, no
  divergence here: `status`, `cases_total`/`cases_ok`/`cases_failed`, cost and tokens, a `scorers` list
  with each scorer's mean and pass rate, and — only once a run has finished and a baseline was given —
  `deltas` per scorer and the `gate` report inline.
- **`eval_gate`** takes an `eval_run_id` and returns just the gate report on its own, the same shape as
  the `gate` field above. A run can fail to produce a gate in two genuinely different ways, and the tool
  tells them apart:
  - **No baseline was ever given.** `eval_gate` fails outright — a real MCP tool error, not a result
    with a false flag inside it — `NOT_FOUND`, message "... has no gate report: it ran without a
    baseline". There was nothing to compare against, so nothing was computed.
  - **A baseline was given, but its statistics don't support a verdict** — too few cases, too many
    dropped, or not enough of a binary metric's outcomes changed to test. `eval_gate` succeeds normally
    here: a plain 200 result, `decision: GATE_UNAVAILABLE`, and a `reason_code` naming exactly which
    check stopped it. This is the same `GATE_UNAVAILABLE` verdict
    [Studio's eval screen](/studio/evals/) shows in gray as one of its four gate colors — the report
    exists, it just has no scorer rows, because none were computed.

### Example

Create the showcase project and connect an agent to it as in
[How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/):

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

Start a batch over two cases of `support_case`'s dataset. This project has no `OPENROUTER_API_KEY` set,
so both cases fail predictably, which keeps this example short. Real response:

```json
{
  "batch_id": "01a0c615-7518-7741-aa0c-64f863a75592",
  "flow_id": "support_case",
  "dataset_id": "support_case_cases",
  "case_names": ["strip_flicker_credit", "bulb_app_offline_advice"],
  "mode": "live",
  "status": "running",
  "cases_total": 2,
  "cases_completed": 0,
  "cases_failed": 0,
  "cost_usd": "0"
}
```

A moment later, `dataset_batch_get` with that `batch_id` shows both cases failed to start, as expected
without a model key:

```json
{
  "batch_id": "01a0c615-7518-7741-aa0c-64f863a75592",
  "status": "failed",
  "cases_total": 2,
  "cases_completed": 0,
  "cases_failed": 2,
  "cost_usd": "0"
}
```

Now start `reply_quality`, the showcase project's eval for the same flow, with no baseline. Real
response over MCP — the full record, `scorers` and `gate` both still empty because nothing has run yet:

```json
{
  "eval_run_id": "01a0c615-bbdd-70a5-ae6b-f7c31bee96c2",
  "eval_id": "reply_quality",
  "dataset_id": "reply_cases",
  "status": "running",
  "cases_total": 0,
  "scorers": [],
  "baseline_run_id": null,
  "gate": null
}
```

The identical call over REST (`POST /api/eval-runs`, HTTP 202) answers with the slim shape instead —
this is the real divergence, not just different encoding of the same fields:

```json
{
  "eval_run_id": "01a0c616-7d3a-72ae-b75d-8375df0de76f",
  "eval_id": "reply_quality",
  "status": "running",
  "poll": "/api/eval-runs/01a0c616-7d3a-72ae-b75d-8375df0de76f"
}
```

The run finishes seconds later — every case fails for the same missing-key reason as the batch above.
Call `eval_gate` on it now, with no baseline ever given: a real tool error, not a plain result.

```json
{
  "ok": false,
  "op": "eval_gate",
  "code": "NOT_FOUND",
  "message": "eval run 01a0c615-bbdd-70a5-ae6b-f7c31bee96c2 has no gate report: it ran without a baseline"
}
```

Start `reply_quality` again, this time with `baseline_run_id` set to that first run. The showcase
dataset only has 3 cases, well under the eval's own `min_dataset: 200`, so the gate's own statistics
refuse to give a verdict — but this time `eval_gate` succeeds, a plain 200 with a real reason:

```json
{
  "decision": "GATE_UNAVAILABLE",
  "reason_code": "dataset_too_small",
  "seeds": [0, 1, 2],
  "repeats": 3,
  "per_test": [],
  "dropped_cases": []
}
```

## See also

- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) — getting an agent connected in
  the first place.
- [How to start and follow runs as an agent](/mcp-cli/runs/) — the same "returns at once, poll for the
  result" shape `dataset_batch_start` and `eval_run_start` both follow, and the other tool whose REST and
  MCP shapes genuinely diverge.
- [How to read an eval and its gate](/studio/evals/) — the same gate verdicts and both "no gate" reasons,
  read by a person in Studio instead of an agent over MCP.
- [How to work with datasets in Studio](/studio/datasets/) — where a flow dataset like the one
  `dataset_batch_start` runs comes from.
- [The engineering loop](/concepts/engineering-loop/) — what a real gate verdict is for, and why
  `GATE_UNAVAILABLE` isn't the same as a passing or failing one.
