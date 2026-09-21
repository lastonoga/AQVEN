---
title: A run survives a process crash
description: A flow run is one durable workflow that checkpoints as it goes, so a crash or restart resumes it automatically instead of losing it.
---

# A run survives a process crash

## In short

A flow run isn't a script that dies with the process running it — it's one durable workflow, and every
node it executes passes through a checkpoint before the run moves on. If the process crashes, gets
killed, or gets redeployed mid-run, the next time it starts it finds every run that didn't reach a final
state and picks each one back up on its own, with no command to run and no flag to pass. Only the one
piece of work that was genuinely in flight — running, but not yet returned — the instant the process
died gets redone; everything checkpointed before that just returns what it already produced.

## Checkpointing isn't one-per-node

It's tempting to picture "one node, one checkpoint," but the actual grain varies with what a node does:

- A `code` or `tool` node checkpoints once per attempt — the whole node's work lands as a single unit.
- An `llm` node checkpoints *finer* than that. A model call can take several turns and make several
  tool calls along the way, and each turn and each tool call gets its own separate checkpoint. A crash
  midway through a long tool-calling exchange only replays the one turn or call that was actually
  running — not the turns the model already finished.
- Nodes that only pick a branch or reshape a value — `switch`, `narrow`, `call` — don't get a checkpoint
  of their own at all. They have no side effect to lose, so there's nothing worth recording beyond what
  the surrounding run already tracks.

The practical effect: a node that talks to a model is the one most protected against redoing expensive
work after a crash, because it's checkpointed at the finest grain of any node kind.

## Restart recovery needs nothing from you

Recovery isn't something you trigger. It happens as a side effect of the process starting up: whatever
runs did not reach `completed`, `failed`, or `cancelled` before the crash get picked up again without
you asking, the same way whether the process was down for a second or a week. You don't resume a run by
its id, and there's no separate recovery command — the next launch simply continues where every
in-flight run left off.

## What a crash can and can't lose

Two different things can look like "the run failed," and only one of them is data loss:

- **A node failing on its own** — a tool call that errors, a model returning something that doesn't
  parse — isn't lost at all. That failure is itself the node's checkpointed outcome. It shows up in the
  run's history as a failed node, same as a success would, and a restart doesn't touch it.
- **A hard kill mid-step** — the process getting `SIGKILL`'d, an out-of-memory kill, the machine losing
  power — is the only thing that actually loses work, and only the work inside whichever checkpoint was
  open at that exact instant. Everything checkpointed earlier in the run stands; nothing after that point
  had happened yet to lose.

## Why a human wait can outlast the server

A `human` node's wait rides the same durable mechanism as every other checkpoint — it's just held open
instead of resolved right away. The engine enforces a one-second floor on how short that wait can be set,
but no ceiling at all: a wait can legitimately sit open for weeks, because holding it open doesn't mean
holding a thread, a process, or a server open for that whole stretch. See
[How to pause for a person](/engine/human-node/) for the node's fields and a worked example — this page
only adds the "why" behind how long it's allowed to wait.

## Example: checking a run's status across a crash

Say `support_case` is mid-run: `prepare`, a `code` node, has already finished, and `triage`, the `llm`
node right after it, is on its first model turn when the process gets killed. A status query sent in
that gap — process dead, nothing yet restarted — simply gets nothing back, because there's no server to
answer it.

Once the process restarts, recovery picks the run back up on its own, and the same query — `GET
/api/runs/{run_id}` over REST, or the `run_get` MCP tool — answers again, from where the run actually
is:

```json
{
  "run_id": "01a0c60d-453f-7753-a98b-cfd4364b6058",
  "status": "running",
  "node_counts": { "pending": 5, "running": 1, "ok": 1, "failed": 0, "skipped": 0, "suspended": 0, "cancelled": 0 },
  "executions": [
    { "address": { "node_id": "prepare", "branch_key": null, "iteration": null, "item_index": null }, "status": "ok" },
    { "address": { "node_id": "triage", "branch_key": null, "iteration": null, "item_index": null }, "status": "running" }
  ]
}
```

`prepare` still reads `ok` — its checkpoint survived the crash untouched. `triage` reads `running`
again: the turn that was in flight at the moment of the kill is the one piece of work redone, not the
whole node and not the run. Nothing about `prepare`'s place in the run's event log changes either — it
doesn't re-emit its `node_started`/`node_finished` events just because the run resumed; those events
keep the sequence numbers they were given the first time, and only the work from the crash point forward
adds anything new.

## How this shapes what you do

You don't add your own retry-and-resume logic around a run, and you don't write anything to detect a
crash and pick the run back up — that's the whole point of durable execution, and it comes from
[the same underlying layer](/concepts/what-this-is-built-on/) that checkpoints every step. Where it
actually changes what you do: you can treat "the process restarted" and "the process kept running" as
the same case when you query run status, and you can size a `human` node's timeout by how long the
answer should realistically take, not by how long you're willing to keep a server up — the wait doesn't
cost you anything while it's open.

## See also

- [What this is built on](/concepts/what-this-is-built-on/) — the durable-execution layer this page's
  checkpointing and recovery come from, and everything else AQVEN takes as-is.
- [How to pause for a person](/engine/human-node/) — the `human` node's own fields, timeout policy, and
  a full worked example.
- [How to start and follow runs as an agent](/mcp-cli/runs/) — `run_get`'s full response shape, and the
  rest of the run lifecycle over MCP.
