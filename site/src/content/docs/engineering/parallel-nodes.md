---
title: Parallel Nodes
description: Run a fixed named set of independent child nodes, then join their typed results through a policy.
---

Use `parallel` when the number of branches is known in the flow definition. Name each child in `body`, choose a join policy, and declare the output bindings that later work receives. Each branch can be code, model, tool, or another control node.

The join policy decides how child success, failure, and result collection affect the parent. Choose it deliberately; a partial result can be useful for independent reviews but unsafe for a required external action. Use [Map Nodes](/engineering/map-nodes/) when input determines the number of items.

The generated [Node Reference](/engineering/reference/nodes/#parallelnodespec) gives every field and policy slot.
