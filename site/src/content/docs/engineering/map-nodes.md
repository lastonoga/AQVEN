---
title: Map Nodes
description: Apply one child node to each item in a data-driven list with a declared error policy and bounded concurrency.
---

Use `map` when a list input determines how many child executions run. Set `over` to the source list, `body` to one node, choose `concurrency`, define `on_item_error`, and bind the collected output.

The child reads `$item` and `$index`. Choose concurrency from the capacity of the provider or external system. An item-error policy determines whether one failure stops, skips, or is represented in the collection. Test empty, partial-failure, and large-list behavior.

Read [Parallel Nodes](/engineering/parallel-nodes/) for fixed fan-out and the generated [Node Reference](/engineering/reference/nodes/#mapnodespec) for fields.
