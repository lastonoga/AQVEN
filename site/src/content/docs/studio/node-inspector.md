---
title: Node Inspector
description: Read a node's bindings, prompt, and output contract.
---

Open **Nodes** for a flow and select a node from the list. The detail panel shows its kind, bindings, output shape, and settings. For an LLM node, inspect the inference and prompt sections to see which agent and template are attached.

![A selected model node in Studio, with its definition and bound inputs.](/images/studio/node-inspector.png)

When a run produces an unexpected answer, start with the node that returned it. Compare its bound inputs with the prompt and output contract, then open the [run trace](/studio/runs/) for the actual values. If it is inside a control node, inspect the parent policy as well.

The inspector reads project files. To change a binding or prompt, edit the source, run `{{CLI_COMMAND}} check`, and reload the view. [Flows](/engineering/flows/) explains reference syntax; [Prompts](/engineering/prompts/) explains previewing model requests.
