---
title: Code Nodes
description: Run deterministic Python transformations behind a typed node contract.
---

Use a code node for deterministic parsing, validation, normalization, data shaping, or a local calculation. The node declares its inputs and outputs; the referenced Python function must accept and return that contract.

```yaml title="flows/<flow_id>/nodes/normalize.node.yaml"
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Normalize a customer question"
run: "@root.logic:normalize"
in:
  - name: "question"
    type: "Text"
    description: "Original question"
    from: "$input.question"
out:
  - name: "cleaned"
    type: "Text"
    description: "Normalized question"
```

Keep model reasoning out of a code node and side effects out of a deterministic transformation. Use a [Tool Node](/engineering/tool-nodes/) for an external capability. [Code References and Aliases](/engineering/code-references-and-aliases/) explains `run` resolution.
