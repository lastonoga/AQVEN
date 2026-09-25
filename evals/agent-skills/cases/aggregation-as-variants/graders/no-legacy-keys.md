---
type: "regex"
target:
  source: "file"
  path: "experiments/tally_merge_rule/experiment.yaml"
match: "not_contains"
---
\barms?:|subject\.arm
