# mistral in the revision step

**Purpose:** choosing an agent (a paired comparison with a non-inferiority question).

The revision step `polish__revise` runs on gpt. mistral already writes one of the three drafts and costs less per
token, so we want to know whether it can take over the revision without the reply getting worse.

**Variants.** The factor is the agent on the `revise` node inside the loop (`varies: what: agent`, the node named by its
own id). `gpt` is the flow as written, `mistral` puts the Mistral agent on `revise`.

**What we measure.** Only the `polish` loop runs, on each case of `support_case_cases`. The steps before it come from
the case `node_outputs`: the parsed case (`triage`), the channel (`prepare`), the knowledge base chunks (`search_kb`),
the decision (`route`) and the draft the panel picked (`panel`). Both variants therefore revise the same draft for the
same decision, and any difference comes from the reviser.

- `critique` is the primary metric: the DeepSeek critic's score of the final reply. The critic is a different family
  from both variants. Its verdicts are measured against planted defects in `critique_planted_defects`, and that
  experiment has to pass before this one counts as evidence.
- `promises` is the same code check that runs on the revision step at run time. A variant that promises a refund,
  a replacement or an amount the decision does not give fails it.
- `citations_in_sources` is not repeated here. It is declared on the `revise` inference, and the series counts how
  often it fails on the first attempt.

**Reading the result.** mistral passes when its critic score is at most 0.05 below gpt's and a passing reply costs
at most 20% more (`cost_of_pass`). Three repeats per case separate a steady difference from noise.

**Caveat.** Inside the loop, the in-flow critic `polish__critique` is also mistral. With this variant the loop's own
stop score becomes self-graded and may stop the loop early. The external DeepSeek check keeps the measurement
independent, but compare the iteration counts too.
