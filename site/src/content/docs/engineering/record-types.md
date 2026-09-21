---
title: Record Types
description: Define named, typed fields for flow inputs, outputs, model responses, and human forms.
---

Use a record when downstream code or a later node needs named fields. Give each field a type and a description that explains its business meaning, not its storage shape.

```yaml
apiVersion: "aqven/v1"
kind: "Record"
description: "A support request"
fields:
  - name: "question"
    type: "Text"
    description: "Customer question"
  - name: "order_id"
    type: "Text?"
    description: "Order identifier when supplied"
```

Use `?` when the field can be absent or null according to the declared type semantics. See [Schema Design](/engineering/schema-design/) for uncertainty fields and the generated [Type Reference](/engineering/reference/types/#recordtype) for every accepted property.
