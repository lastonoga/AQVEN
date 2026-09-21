---
title: Read a Run
description: Use a run trace and call sheet to inspect status, nested execution, model calls, tools, cost, and output.
---

Open a run to see its status, saved source version, cost, elapsed time, tokens, waits, error or output, and execution timeline. Select a node execution to inspect its call sheet.

![The run header records status, source state, and execution metrics.](/images/studio/runs.png)

For a model step, inspect input, rendered prompt, response, and checks together. For a tool step, inspect the bound input, effect, result, and failure. An execution address distinguishes a branch, loop iteration, or map item. Switch between formatted and raw views when trace presentation hides a field you need.

Use [Debug a Failure](/studio/debug-a-failure/) when the trace shows an unexpected result.
