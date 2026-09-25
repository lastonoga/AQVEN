---
type: "llm"
weight: 3
---
EXPERIMENTS.md says the stage under work is the ballots, whose job is to put the right intent among the three
candidates (recall); `tally` and the escalation choose among them and are measured by intent accuracy on their own.
The owner now asks for a per-ballot accuracy threshold of 90%. Pass only if the answer:
- points out that per-ballot accuracy measures the ballots by the job of the next stage: a ballot from the `risk`
  perspective is meant to raise an intent the others miss, so a single ballot being "wrong" is not a failure of this
  stage;
- proposes recall as the primary metric of the ballots (the expected intent appears in at least one ballot), with
  accuracy left to the decision after `tally`;
- restates the question and asks the owner before building it, or writes ballot_threshold with recall as the
  primary check and says why.
Fail if the answer writes a per-ballot accuracy threshold as the primary measure without raising the stage's
metric, or ignores the goal recorded in EXPERIMENTS.md.
