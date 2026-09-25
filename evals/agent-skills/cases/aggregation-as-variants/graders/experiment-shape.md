---
type: "llm"
focus:
  source: "file"
  path: "experiments/tally_merge_rule/experiment.yaml"
weight: 3
---
This is an AQVEN experiment.yaml. Pass only if all of these hold:
- It declares one factor: `varies` with `what: "use"` and `nodes` naming only `tally`.
- It has exactly three variants, one per merging rule. The rule as written is a variant with no `nodes` map; each of
  the other two maps `tally` to an alternative node by name.
- Every variant is measured by the same checks. Intent accuracy is one check on the expected `intent` (for example
  `use: "expected"` with the field `intent`), not one check per merging rule.
- `cases` names a dataset of the support_case flow.
Fail if the merging rules appear as separate checks, if an `arms` or `arm` key appears, or if the factor is `agent`,
`prompt` or `flow`.
