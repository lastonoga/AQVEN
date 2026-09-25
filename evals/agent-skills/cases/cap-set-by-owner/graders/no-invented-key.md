---
type: "regex"
target:
  source: "file"
  path: "aqven.yaml"
match: "not_contains"
---
\b(budget|max_spend|spend_limit|cap_usd|approval)\b
