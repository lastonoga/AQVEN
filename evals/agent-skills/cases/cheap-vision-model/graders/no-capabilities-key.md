---
type: "regex"
target:
  source: "file"
  path: "agents/receipt_reader.yaml"
match: "not_contains"
weight: 2
---
capabilities\s*:
