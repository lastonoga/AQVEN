---
type: "regex"
target:
  source: "file"
  path: "experiments/panel_grounding/checks.py"
match: "not_contains"
weight: 2
---
return\s+None\b|->\s*Verdict\s*\|\s*None|Optional\[Verdict\]
