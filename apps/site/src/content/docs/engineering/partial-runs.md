---
title: Partial Runs
description: Run a contiguous part of a flow with declared input, context, and upstream boundary fixtures.
---

Choose a start and end node when you need to test a prompt, tool, or downstream transformation without rerunning earlier work. Any reference to skipped output must be supplied as a `node_outputs` fixture in the run request or dataset case.

Use Studio’s range preview to see missing boundary values before starting. Fixtures apply only to a partial run; a whole-flow run executes the upstream nodes normally. Keep one whole-flow regression case too, because a fixture cannot prove upstream behavior.

[Datasets](/engineering/datasets/#start-in-the-middle-of-a-flow) documents fixture YAML and [Studio Runs](/studio/run-a-workflow/) documents the UI sequence.
