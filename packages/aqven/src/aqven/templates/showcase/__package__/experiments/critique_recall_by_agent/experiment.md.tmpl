# Which critic agent catches planted defects

**Purpose:** validating a judge and choosing its agent: the recall half (TPR) of `critique_planted_defects`, per agent.

`critique_planted_defects` measures the DeepSeek critic's overall agreement with the labels. This experiment asks a
narrower question for three agents at once: on replies that do carry a defect, how often does the critic stop them?

**Subject.** The local flow `critic` is a Python flow builder (`flows/critic/flow.py`) with one step: the project's `critique`
inference on a `ReplyReview`, returning the `Critique` as it is. There is no verdict step; the `blocked` check reads the
critique the way the polish loop does.

**Cases.** Only `planted: yes` from `planted_defect_replies`: eight replies, one defect each. Clean replies are left out
on purpose, so a critic that blocks everything scores 1.0 here. Read this result together with the clean-reply pass
rate of `critique_planted_defects` before trusting it.

**Variants.** The factor is the agent on the `critique` node (`varies: what: agent`). `deepseek` is the flow as written;
`qwen` and `llama` put the Qwen and Llama agents on `critique`. Both are cheaper panel families, so a pass would make the
critic cheaper too. The rows are agents, the columns are the two checks below.

**Checks.**

- `blocked`: a code check, passes when the score is below the loop's approval threshold of 0.85 or the critique has a
  blocking remark.
- `rationale_brief`: the rationale stays under 100 words, so the support lead can read why a reply was stopped.

**Reading the result.** There is no `variant` in the question, so each agent gets its own verdict: a confirmed agent
stops more than 80% of planted defects with a margin of 0.05. An agent that is confirmed here and fails on clean
replies is a critic that blocks everything, not a good critic.
