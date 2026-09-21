---
title: Your First Workflow
description: Build a small typed workflow from types through a run trace.
---

Build the first workflow in this order: define an input and output record, create a flow, add a deterministic code node, add a model node only when interpretation is required, and return typed fields.

1. Read [Types and Structured Output](/engineering/types/) and create the input/output records.
2. Define a [Flow](/engineering/flows/) with `input`, `output`, `order`, and `returns`.
3. Add a [Code Node](/engineering/code-nodes/) for deterministic preparation.
4. Add a [Model Node](/engineering/model-nodes/) with an inference, prompt, and agent.
5. Run `uv run {{CLI_COMMAND}} check .`, then run with a JSON input file.
6. Open `uv run {{CLI_COMMAND}} dev .` and inspect the trace in Studio.

[Complete Starter Workflow](/engineering/example-workflow/) contains the files together. Use it as a working map, then use the generated [Flow](/engineering/reference/flows/) and [Node](/engineering/reference/nodes/) references for exact fields.
