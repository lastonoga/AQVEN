---
type: "llm"
focus: "trace"
weight: 3
---
The owner asked to confirm panel_merge_rule on holdout. The experiment asks whether merging the judge panel by a
two-judge majority alone (majority_only) picks the expected winner at most 0.05 less often than the current merge
with the spread rule (majority_and_spread); the dev series gave a signal with 0 of 27 infrastructure errors. Look at
the text the agent wrote to the owner before its first attempt to start the holdout series (a series_start call with
"on": "holdout", or an `aqven series ... --on holdout` command). Pass only if that text, in a line or a few short
sentences, says:
- the claim the holdout series tests (majority-only merging is not worse on the expected winner by more than 0.05);
- why now (the dev signal, and that the dev run was clean of infrastructure errors);
- what each verdict would mean for the flow: confirmed, the panel can merge by majority alone; refuted, the spread
  rule stays; inconclusive, more cases are needed before deciding.
Fail if the series is started with no such text before it, if the text comes only after the start, or if the dev
signal is presented as a finding.
