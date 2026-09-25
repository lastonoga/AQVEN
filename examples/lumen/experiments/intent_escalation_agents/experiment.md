# Escalation agent of the intent cascade

**Purpose:** choosing an agent (a non-inferiority question on a range of a local flow).

In `support_case`, three cheap Llama ballots vote on the intent, and when they split, the `intent__escalate` step asks
DeepSeek to decide. Qwen is a smaller mixture-of-experts model that answers faster and costs less per call. The
hypothesis is that it can take over the escalation without misreading more cases.

**Subject.** The local flow `escalation` (`flows/escalation/`) is the escalation path on its own: the product's `prepare` and `triage` steps, then
`escalate`, the project's `ballot` inference with no perspective and the `deepseek` agent. It is a complete flow,
so it can run on fresh cases too. Here the range `escalate`..`escalate` runs only the last step: `prepare` and
`triage` come from the `node_outputs` recorded in `support_case_cases`. Every variant reads the same triage, the
Gemini parsing is not paid again on every attempt, and any difference comes from the escalation agent.

**Cases.** All twelve cases of `support_case_cases`. `expected_output.intent` is the intent a support lead assigned by
the rubric in `fragments/intent_rubric.md`: six defects, two delivery problems and four questions. Two of them are
hard on purpose: in `dimmer_buzz_advice` the customer claims a defect that the decision later turns into advice, and in
`nova_runtime_advice` the customer asks whether the battery is faulty without claiming it is.

**Variants.** The factor is the agent on `escalate` (`varies: what: agent`). `deepseek` is the flow as written, `qwen`
puts the Qwen agent on `escalate`, and `gpt` is measured on the same cases for the Pareto view; the verdict compares
only `deepseek` and `qwen`.

**Reading the result.** `qwen` passes when its `intent` pass rate is at most 0.1 below DeepSeek's. Two guardrails
keep the switch honest:

- `schema_valid_first_try` may drop by at most 0.05, absolute: Qwen answers in the tool output mode, DeepSeek in the
  prompted mode, and a retry costs the latency the switch is meant to save.
- `latency_p95_ms` may grow by at most 25% of DeepSeek's value: the escalation sits on the critical path of a case.

**Caveat.** The escalation only runs on cases where the ballots split, and those are harder than the average case.
All twelve cases run here, so a pass says the agent is good enough on a mixed set. Before switching, re-run it on
the split cases once the series records which ones they are.
