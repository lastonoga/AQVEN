---
title: AQVEN Studio
description: The visual manual for exploring flows and reviewing runs.
---

Studio is the local UI for an AQVEN project. It reads the project's definitions and run data so you can see what a workflow did, which input each node used, and where a run needs attention.

![A Studio canvas with workflow nodes and connections.](/images/studio/canvas.png)

## Source of truth

Project files are the workflow source of truth. Studio renders those definitions and the selected project backend's local data; it does not create a parallel workflow format. Start both together with `uv run {{CLI_COMMAND}} dev .` from the project root.

## Navigation and terminology

Choose a project and flow first. **Canvas** shows the declared graph; **Nodes** shows definition details; **Runs** shows execution evidence; **Datasets** supplies repeatable cases; **Evals** shows scorer results; **Review** contains human and tool-approval waits; **Chat** connects a configured coding-agent backend.

## Start here

1. [Open Studio](/studio/quickstart/).
2. [Explore a workflow in the UI](/studio/workflow-tour/).
3. [Read a run trace](/studio/runs/).

| Area | Use it for |
| --- | --- |
| [Canvas](/studio/canvas/) | Explore the flow graph and inspect node definitions |
| [Start a Run](/studio/run-a-workflow/) | Start a manual run, follow its trace, and inspect a model call |
| [Read a Run](/studio/read-a-run/) | Inspect status, output, node attempts, prompt, response, tools, and cost |
| [Datasets](/studio/datasets/) | Manage cases and run one or a batch |
| [Evaluations](/studio/evaluations/) | Read scorer results and gate decisions |
| [Review](/studio/human-review/) | Answer a waiting human step |
| [Studio AI Assistance](/studio/chat/) | Work with a configured coding agent in project and flow context |

To change a flow's source files or use it in Python, see the [Engineering manual](/engineering/).
