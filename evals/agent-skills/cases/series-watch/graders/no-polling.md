---
type: "regex"
target: "trace"
match: "not_contains"
weight: 2
---
"command":\s*"[^"]*(\bsleep\s+\d|\bcurl\b[^"]*api/series)
