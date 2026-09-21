---
title: Runs and Traces
description: Start a run and read the path it took.
---

The **Runs** view lists executions of the selected flow. Open one to see its status, source version, metrics, waits, output, and execution trace. A trace shows which nodes ran, which branches were taken, and where an error or human wait occurred.

![A completed run with cost, duration, token, and node metrics.](/images/studio/runs.png)

## Start a whole flow

Choose **Start a run**, keep the range set to the whole flow, then fill the generated form from the flow input schema. Studio shows only the declared run-context keys, such as date, locale, time zone, or tenant ID. It will not infer required input values for you.

A live run can call providers or external tools. Use a [dataset case](/studio/datasets/) when you need a repeatable input or want to compare a change with an earlier execution. The selected source state is recorded with the run, so a later edit can be identified as a definition change.

## Start part of a flow

Use the start and end controls to run a contiguous range of nodes. Studio previews whether the selected range is available before it starts. If the first selected node reads an earlier result, Studio asks for a JSON fixture for the missing top-level node output. You can paste a value or copy an output from a previous successful run.

This is useful for prompt or downstream debugging. It does not prove that the skipped nodes would produce the same fixture in a complete flow. Keep a whole-flow case for release evidence.

## Read a run from top to bottom

1. Read the status, source hash, cost, elapsed time, token counts, and failed-node count in the run header.
2. Read the final output or error. Keep the run ID and node ID when reporting a failure.
3. Select a trace step to open its call sheet. For a model call, inspect **Input**, **Prompt**, **Output**, and **Checks** together.
4. Switch between formatted and raw values when a renderer hides a field that matters to the investigation.
5. Compare the source version to the current project. A definition-changed marker means the current files no longer match the run's saved source.

A surprising answer may come from the wrong bound input, a prompt that omitted context, a provider response, or an output check that rejected the result. The trace separates these possible causes.

Traces also show `parallel`, `map`, `loop`, and `call` executions. Their addresses include the branch, iteration, or item when it matters. When a run pauses for a person or a protected tool action, its wait appears in the run overview and the [Review](/studio/human-review/) queue.

## Cancel, fork, and reproduce

Cancel a run only when its outcome is no longer needed; the trace remains available for diagnosis. Fork an existing run from an execution address when you want to re-run that node and everything after it while retaining earlier recorded work. A forked run creates a new lineage entry and repeats any human wait it reaches.

For a durable regression test, turn the input and relevant boundary data into a [dataset case](/studio/datasets/) after you understand the trace. To fix source, follow [Debugging a workflow](/engineering/debugging/) and verify with `{{CLI_COMMAND}} check` before relying on another live run.
