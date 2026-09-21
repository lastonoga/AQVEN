---
title: Tool Nodes
description: Invoke a declared external capability through a typed project tool contract.
---

Use a tool node when the workflow needs a capability outside the flow: read a service, write to a system, or call a remote MCP tool. Define the tool once, declare its effect, and bind node values into it.

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "tool"
description: "Look up a customer order"
tool: "lookup_order"
in:
  - name: "order_id"
    from: "$input.order_id"
```

Use `effect: read`, `write`, or `external` on the Tool declaration. Add idempotency and approval before a write or external effect. [Tools Overview](/engineering/tools-and-human-steps/) and [External Effects](/engineering/external-effects/) cover the boundary.
