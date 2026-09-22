---
title: How to run datasets and evals as an agent
description: Call the 5 dataset and eval MCP tools, and the one place eval_run_start's shape genuinely differs from the same call over REST.
---

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

Start `reply_quality`, the showcase project's eval for `support_case`, with no baseline. Real response
over MCP — the full record, immediately, before any case has run:

```json
{
  "eval_run_id": "01a0c6a9-e7da-75a5-9652-f9be5d8dc06c",
  "eval_id": "reply_quality",
  "dataset_id": "reply_cases",
  "inference": "revise",
  "agent": "gpt",
  "status": "running",
  "spec_hash": "",
  "started_at": "2026-09-22T01:10:18.842100Z",
  "finished_at": null,
  "repeats": 3,
  "seeds": [],
  "cases_total": 0,
  "cases_ok": 0,
  "cases_failed": 0,
  "dropped_cases": [],
  "cost_usd": "0",
  "tokens_in": 0,
  "tokens_out": 0,
  "scorers": [],
  "baseline_run_id": null,
  "deltas": [],
  "gate": null,
  "notes": [],
  "error": null
}
```

The identical call over REST (`POST /api/eval-runs`, HTTP 202) answers with the slim shape instead —
this is the real divergence, not just different encoding of the same fields:

```json
{
  "eval_run_id": "01a0c6a9-e92b-764b-9c05-c10ec5d5b0ac",
  "eval_id": "reply_quality",
  "status": "running",
  "poll": "/api/eval-runs/01a0c6a9-e92b-764b-9c05-c10ec5d5b0ac"
}
```

The run finishes seconds later — every case fails without a model key. Call `eval_gate` on the MCP run
now, with no baseline ever given: a real tool error, not a plain result.

```json
{
  "ok": false,
  "op": "eval_gate",
  "code": "NOT_FOUND",
  "message": "eval run 01a0c6a9-e7da-75a5-9652-f9be5d8dc06c has no gate report: it ran without a baseline"
}
```

Start `reply_quality` again with `baseline_run_id` set to that first run, and call `eval_gate` once it
finishes. The showcase dataset has far fewer cases than the eval's own `min_dataset: 200`, so the gate's
own statistics refuse to give a verdict — but this time `eval_gate` succeeds, a plain 200 with a real
reason:

```json
{
  "decision": "GATE_UNAVAILABLE",
  "reason_code": "dataset_too_small"
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
