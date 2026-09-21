---
title: Enum Types
description: Use controlled named values for routes, statuses, and model outputs that must remain bounded.
---

Use an enum when a workflow must choose one of a known set. Enums make switch coverage, output validation, datasets, and Studio forms more reliable than unrestricted text.

```yaml
apiVersion: "aqven/v1"
kind: "Enum"
description: "Support urgency"
values:
  - name: "low"
    description: "No immediate action"
  - name: "high"
    description: "Requires prompt attention"
```

Use the enum as a field type and make every route explicit in a [Switch](/engineering/switch/). The generated [Type Reference](/engineering/reference/types/#enumtype) lists the exact value shape.
