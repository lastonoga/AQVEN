# How to start and follow runs as an agent

Call the 8 run_* MCP tools to start, watch, fork, and cancel a run — and the two places their shape genuinely differs from the same operations over REST.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [See also](#see-also)

## When you need this

You're connected to a project over MCP and need to run a flow, or check on one that's already running,
without opening Studio. Eight tools cover the whole lifecycle: start a run, read its status, list runs,
drill into one node's execution, page through its event log, answer a wait, fork it from a point, or
cancel it. Two of the eight behave differently over MCP than the REST route with the same name — worth
knowing before you build assumptions on one and hit the other.

## Steps

- **`run_start`** takes a `flow_id`, a `mode` (`live` for a real run that calls real models and tools),
  and exactly one of `input` or `dataset_item_id`. It validates that input against the flow's own input
  schema before anything runs, and fails with `INPUT_INVALID` and a `problems` list if it doesn't match.
  Otherwise it returns at once, without waiting for the run to finish: `run_id`, `status`, `last_seq`, a
  `ui_url` to open the same run in Studio, and `warnings` for anything the run will hit later, most
  commonly a missing secret. Call `run_get` or `run_events` next to follow it.
- **`run_get`** is the full snapshot: `status`, `mode`, cost and token totals, `node_counts` (how many
  nodes are pending, running, ok, failed, skipped, suspended, cancelled), the full `executions` list, and
  `error` if the run failed. If it's paused on a person, `waits` lists what's waiting and for whom — that's
  what responding to a review resolves, the same information
  [investigating a run](../studio/investigate-a-run.md) shows in its header.
- **`run_list`** pages through runs filtered by `flow_id`, `status`, `mode`, `assignee`, `parent_run_id`,
  and a `since`/`until` window, with `next_cursor` for the next page. For everything waiting on a person,
  filter `status: "suspended"`; for your own queue, add `assignee: "me"` (the local user),
  `overdue: true`, and sort by `deadline_at`.
- **`run_get_node`** is one node's execution, addressed the same way the engine itself addresses every
  execution: `node_id` plus `branch_key`, `iteration`, and `item_index` for a node that ran inside a
  branch, a loop, or a map. Leave the three optional fields out to reach a top-level node. The result
  carries the prompt, the response, every attempt, checks, and cost — the same fields the side panel in
  [investigating a run](../studio/investigate-a-run.md) is built from. A node still waiting on a person also
  carries `human`, with its form schema and the `attempt` value `run_resume` needs.
- **`run_events` behaves differently over MCP than the REST route with the same operation.** Call it with
  no `after_seq` over MCP and you get the *tail* — the last `limit` events, for catching up with a run
  that's already well underway. The REST route for that same operation
  (`GET /api/runs/{run_id}/events/log`) defaults the other way: no `after_seq` there means *from the
  start*. Pass `after_seq` explicitly on either side (`0` for the start, or a `seq` you've already seen)
  and both behave the same — it's only the *default* that diverges. REST also has a separate SSE push
  stream at `GET /api/runs/{run_id}/events` for a live feed; there's no MCP equivalent of that one, only
  the paged log both surfaces share.
- **`run_resume`** answers a wait: the `address` and `attempt` come from `run_get`'s `waits` or from
  `run_get_node`, `payload` has to match the wait's form schema, and `client_op_id` makes a retried call
  safe to send twice. Studio's review screen calls this same mechanism
  when a person clicks **Submit and resume**.
- **`run_fork`'s field name is the one other real divergence.** Start a new run from an existing one at a
  given execution address, replaying everything before that address and re-running it and everything
  after — over MCP the field carrying that address is called `address`; the REST route for the same
  operation expects the identical value under the key `"from"` instead. Same meaning, different JSON key
  depending which surface you're calling. Separately, that address value itself always needs all four
  fields present — `node_id`, `branch_key`, `iteration`, `item_index` — even when three of them are
  `null` for a top-level node; unlike `run_get_node`'s flat arguments, none of the three has a default, so
  leaving one out fails validation before the call does anything.
- **`run_cancel`** takes a `run_id` and a free-text `reason`. Like `run_resume`, its `run_id` travels in
  the request body over MCP; the REST route for the same operation puts it in the URL path instead and
  takes just `reason` in the body.
- **A failed `run_*` call is a real MCP tool error, not a normal result with a false flag inside it.**
  `INPUT_INVALID`, `RUN_STATE_CONFLICT`, `NOT_WAITING`, and the rest all come back with `is_error: true`,
  the failure itself in the same `{ok, op, code, message, problems, candidates, conflict}` shape every
  other failing call on this project uses. That's different from
  `aqven_check`, whose `ok: false` is a normal, successful call — check which
  kind of failure you're handling before you write an error branch around one of these.

### Example

Create the showcase project and connect an agent to it as in
How to connect AQVEN as an MCP server:

```bash
aqven new my_project --template showcase
cd my_project/my_project
```

Start a live run of `support_case` with a minimal case as input — this project has no
`OPENROUTER_API_KEY` set, which is deliberate here: it lets the run fail predictably right after its
first model call. The call returns immediately, `run_id` `01a0c6ab-fdeb-70af-b98a-b35177348d19`, with
`warnings` about every missing secret the flow could reach.

A moment later, the run has already finished — failed at `triage`, the first `llm` node, right after the
`prepare` code node ran fine. This is the real divergence: the same run, `run_events` called two ways.
With no `after_seq`, the tail — the run's last event:

```json
{
  "items": [
    {
      "seq": 7,
      "type": "run_finished",
      "status": "failed",
      "error": {
        "code": "provider_key_missing",
        "message": "no API key for provider openrouter (openrouter:google/gemini-2.5-flash-lite): set OPENROUTER_API_KEY in the project .env or the environment"
      }
    }
  ],
  "next_cursor": null,
  "total_estimate": 1
}
```

With `after_seq: 0` — same `run_id`, `limit: 1` — the start instead:

```json
{
  "items": [
    { "seq": 1, "type": "run_started", "flow_id": "support_case", "mode": "live" }
  ],
  "next_cursor": "1",
  "total_estimate": 7
}
```

Now fork that run from `prepare`, the one node that succeeded — over MCP, the address is `address`:

```json
{
  "run_id": "01a0c6ab-fdeb-70af-b98a-b35177348d19",
  "address": {"node_id": "prepare", "branch_key": null, "iteration": null, "item_index": null},
  "at": "original"
}
```

```json
{"run_id": "01a0c6ab-fea5-71ac-82c5-ee5ae39cdd20", "lineage_parent": "01a0c6ab-fdeb-70af-b98a-b35177348d19"}
```

The REST route for the same operation wants the identical value under `"from"` instead — sending
`"address"` to REST is rejected before it even looks at the run:

```json
{
  "ok": false,
  "op": "run_fork",
  "code": "REQUEST_INVALID",
  "message": "request failed validation",
  "problems": [
    {"path": ["body", "from"], "code": "missing", "message": "Field required"},
    {"path": ["body", "address"], "code": "extra_forbidden", "message": "Extra inputs are not permitted"}
  ]
}
```

## See also

- How to connect AQVEN as an MCP server — getting an agent connected in the
  first place.
- How to check and test a project as an agent — the other read-mostly tools,
  and why `aqven_check`'s own failures don't come back as MCP tool errors.
- The engineering loop — why every execution needs its own address, which
  is what `run_get_node` and `run_fork` both take as input.
- [How to investigate a run](../studio/investigate-a-run.md) — the same run data as `run_get` and
  `run_get_node`, read by a person instead of an agent.
- How to respond to a human-review request — the screen that calls
  `run_resume` when a person clicks Submit.
