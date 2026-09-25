---
type: "llm"
focus:
  source: "file"
  path: "experiments/critic_choice/experiment.yaml"
weight: 2
---
This is an AQVEN experiment.yaml. The dataset lead_reviewed_replies holds replies from the ticket archive with the
verdict a support lead gave them: four sent (`lead_verdict: "send"`) and four blocked (`"block"`). Pass only if all
of these hold:
- one factor `varies` with `what: "agent"` on the `critique` node, and one variant per critic: deepseek, qwen and
  llama;
- the cases are lead_reviewed_replies with both sent and blocked replies kept: no `cases.tags` filter that drops the
  sent replies, which are the negative control;
- a check scores the critic's verdict against the lead's verdict (for example the built-in `expected` check on the
  field `verdict`), the same check for every variant.
Fail if the cases are planted_defect_replies alone, if only blocked replies are selected, or if an `arms` or `arm`
key appears.
