---
title: Canvas and Node Inspector
description: Read the flow graph and the contract of a selected node.
---

Open a flow and choose **Canvas** to see its nodes and connections. Select a node to inspect its definition: kind, input bindings, output fields, and related settings. Zoom and pan to follow a large flow.

![Studio Canvas shows each declared step and the connections between them.](/images/studio/canvas.png)

For a `parallel` node, follow each named child and inspect the join policy. For a `loop`, inspect the body, stop rules, and selected result. The graph makes these control steps easier to follow than a long flat list of YAML files.

The Canvas and node views currently inspect project definitions; edit the YAML and Python source in your editor, then run `{{CLI_COMMAND}} check`. Use [Nodes](/engineering/nodes/) to choose a kind and [Flows](/engineering/flows/) to understand a binding.

To see what a node did in a particular execution, open [Runs](/studio/runs/).
