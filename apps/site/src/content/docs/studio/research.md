---
title: How to use Research in Studio
description: Switch to Research, browse the experiments of every flow, read an experiment page block by block, launch a series to explore or confirm, and hand the next hypothesis to the chat.
---

## When you need this

Use Research once a fix has worked on the one case you saw and you need to know whether it holds. An
experiment asks one question of a flow, a range of its nodes or a small arm. A series answers it by running
the selected cases, for every variant, several times. Research is where you read experiments, launch a
series, approve its spend, and ask the chat for the next hypothesis.

## Steps

- **Switch to Research.** The project header has two modes, **Flow** and **Research**. Research has two
  tabs: **Experiments** and **Series**. Research opens on **Experiments** with every experiment of the
  project, so there is no flow to pick. The flow picker belongs to Flow mode and is hidden in Research. The
  chat panel stays open in both modes.
- **Browse the experiments.** The list has one section per flow, ordered by flow name. Each section is a
  heading with the flow name and the number of experiments, then a table. An experiment sits under the flow
  it tests, as a whole or as a range of nodes. Experiments on an arm come last, under **Arms**, even when
  their cases come from a flow. Each row shows the experiment id with its description, the question kind
  (look, threshold, better, not worse), the subject (a flow, a range like `support_case · polish`, or an
  arm), the variants, the state of the last series, and how many series ran and what they cost. Filter by
  **Question** or **Failure mode**. The filters apply to every section, and a flow with no matching
  experiment drops out of the list.
- **Suggest hypotheses** hands a prompt to the chat. The button in the page header asks about the whole
  project. The button in a flow's section heading asks the agent to focus on that flow. The prompt asks
  the agent to read the flows, their cases and the experiments already there, and to propose hypotheses.
  Each hypothesis comes with its failure mode, question, metric and margin, subject, variants as agents,
  checks and cases by tags. The agent writes no file until you pick one. Then it writes
  `experiments/<experiment_id>/experiment.yaml` and runs `{{CLI_COMMAND}} check`.
- **Open an experiment.** The header states the question in words and holds a **Run** button with the
  estimate. The page below reads top to bottom:

  | Block | What it shows |
  |---|---|
  | **What we test** | the **Hypothesis** card, or **Goal** for a look, with the experiment's description and its decision rule. Below it: the variants table (role, difference from the baseline, steps, agents and models), then the facts. |
  | Facts | the cases selected out of the dataset, with the working and held-out split and the tags; the checks, each built-in, code or judge, and whether a judge is validated; where the subject runs |
  | Graphs | one graph per variant. Steps outside the tested range are faded, and a swap line marks where a variant puts another agent. Click a step for its **Agents**, **Input**, **Prompt**, **Output** and **Results** from the latest series. |
  | **Answer** | the verdict of the latest series as its sentence, with **Run again on fresh cases**, **Ask the agent for the next hypothesis** and a link to the series |
  | **Comparison** | the primary metric of the latest series per variant: dot for the value, whisker for the 95% interval, cost per pass and stability, the difference against the margin |
  | **Cases where variants disagree** | each such case with every variant's tally |
  | **Launch** | purpose, cases, repeats, the estimate and the cap |
  | **Series history** | every series of this experiment, with its state and spend |
  | **Technical details** | the files, question, subject, plan, failure mode, and the notes from `experiment.md` |

- **Launch to explore or confirm.** **Purpose** is **Explore · working cases** or **Confirm · held-out
  cases**. Explore gives numbers without a finding. Confirm gives a verdict written to `FINDINGS.md`.
  Choose **Cases** out of the ones available on that side, and **Repeats**. The panel shows the attempts
  and the estimate with its source: ≈ from past series, ≈ at provider prices, ≤ upper bound, or no price
  estimate. It explains the recommended size, for example "At 12 cases the expected interval is ±0.18,
  wider than the 0.05 margin". Above the project spend cap, it says the series needs your approval.
  **Run** starts the series and opens it.
- **Approve spend or stop.** A series that waits for approval shows **Approve spend**, here and on its own
  page. That button is the only way a series above the cap runs: an agent can start a series but can't
  approve one. **Stop** cancels a running series. Calls already running finish and are paid for.
- **Use the answer.** **Run again on fresh cases** starts a series on the held-out cases at the plan's
  size. Every finished held-out series on the same cases is counted in the finding, so add new cases
  before you run it for a second answer. **Ask the agent for the next hypothesis** hands the chat the
  experiment, the latest verdict and the same answer format as **Suggest hypotheses**.

### Example

Open the showcase project, switch to **Research**, and open `reply_noninferior_mistral` in the
`support_case` section. The Hypothesis
reads "mistral in the revision step of the polish loop is not worse than gpt by the critic's score, and a
passing reply costs at most 20% more". The variants table shows one swap, `polish__revise: agent gpt →
agent mistral`. The facts show all twelve cases of `support_case_cases`, split between working and
held-out. The `critique` judge is marked as validated by `critique_planted_defects`.

In **Launch**, keep **Explore · working cases** and click **Run**. The series gives a `signal`, not a
finding, whatever its numbers, and you can repeat it after every change to the revision prompt. When the
change is final, switch to **Confirm · held-out cases** and run it once. That series writes a finding
under `experiments/reply_noninferior_mistral/findings/` and adds a line to `FINDINGS.md`.

## See also

- [How to follow and read a series in Studio](/studio/series/): the page a launch opens on, and the
  Series tab.
- [How to work with cases in Studio](/studio/cases/): where the cases an experiment selects come from.
- [How to write an experiment](/engine/experiments/): every key behind the blocks above.
- [How a series decides](/concepts/how-a-series-decides/): the intervals and margins behind the
  Comparison and the Answer.
- [How to use the AI chat in Studio](/studio/chat/): where **Suggest hypotheses** and **Ask the agent for
  the next hypothesis** land.
