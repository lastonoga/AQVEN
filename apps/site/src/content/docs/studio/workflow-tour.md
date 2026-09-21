---
title: Explore a Workflow
description: Follow a project from its flow graph to a run result.
---

Start the project with `uv run {{CLI_COMMAND}} dev .`, then use this path for any flow:

![A flow opened in the Studio canvas.](/images/studio/canvas.png)

1. On **Project**, confirm the root directory and choose a flow.
2. Open **Canvas**. Follow the order from the first node to the returned fields. Select a node to read its bindings and output contract.
3. Open **Runs**. Start a run with a representative input or choose an existing run. Select each trace step to compare declared inputs with actual values.
4. If the flow uses a dataset, open **Datasets**. Run one case to reproduce a behavior, then a batch to compare cases.
5. If an evaluation is defined, open **Evals** and inspect per-case scores before judging the aggregate.
6. Open **Review** if a run is waiting for a human answer.

To change the flow, edit the project's YAML, prompt, or Python source and run `{{CLI_COMMAND}} check .`. [Project layout](/engineering/project-layout/) shows where each source file lives. The [complete starter workflow](/engineering/example-workflow/) is one small set of files you can inspect end to end.
