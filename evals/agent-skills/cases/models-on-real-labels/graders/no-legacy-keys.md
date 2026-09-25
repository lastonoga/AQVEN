---
type: "regex"
target:
  source: "file"
  path: "experiments/critic_choice/experiment.yaml"
match: "not_contains"
---
\barms?:|subject\.arm
