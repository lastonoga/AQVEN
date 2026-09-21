---
title: Run Lifecycle
description: Follow a workflow from start through completion, suspension, recovery, cancellation, or a fork.
---

A run is one execution of a flow against a checked project version. AQVEN records its input, definition hash, node executions, events, costs, and any wait for a person or approved tool action.

## Statuses

| Status | Meaning | Next action |
| --- | --- | --- |
| `pending` | The run has been created but has not started all planned work. | Follow events or inspect the run. |
| `running` | AQVEN is executing nodes. | Follow the trace. |
| `suspended` | A human form or approval needs an answer. | Answer or resume through Studio or the API. |
| `completed` | The flow produced its declared output. | Inspect output and evaluation evidence. |
| `failed` | A node, binding, tool, model call, or policy stopped the run. | Inspect the first failing node and make a regression case. |
| `cancelled` | A user or control path stopped remaining work. | Inspect partial work if needed. |

## Start a run

The CLI starts a local flow from JSON:

```bash
uv run {{CLI_COMMAND}} run answer_question --input samples/question.json
```

Studio and the HTTP API can also start a run from a dataset case. A run has exactly one input source: direct input or a dataset item. A range run additionally names a start and end node and provides any required earlier node outputs.

## Read progress

Run events include node starts, output deltas, retries, suspension, completion, and final cost and token usage. Studio presents these as a trace. The HTTP API exposes an SSE event stream; the Python client reconnects from the latest sequence number.

## Resume, fork, and cancel

Resume supplies a valid human or approval answer to a suspended run. Fork starts a new run from an execution address and can apply supported input, agent, or prompt overrides. Cancel stops outstanding work with a recorded reason. These are deliberate run operations; they do not alter the flow source files.

## Durable behavior

AQVEN uses DBOS for the flow workflow and node steps. A human wait, a completed node, and a recorded event survive a process interruption. This is why a resumption belongs to a specific run and address rather than merely rerunning the CLI command. [Durable Execution](/engineering/durable-execution/) explains the boundary; [Studio Runs](/studio/runs/) shows the trace.
