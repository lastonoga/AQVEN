---
title: How to use Research in Studio
description: Switch to Research, find the experiments that moved last or need you, create an experiment and choose its cases, read an experiment page block by block, launch a series to explore or confirm, and hand the next hypothesis to the chat.
---

## When you need this

Use Research once a fix has worked on the one case you saw and you need to know whether it holds. An
experiment asks one question of a flow or a range of its nodes, and its variants change one factor of it:
the agent, the prompt, a node or the flow a `call` node runs. A series answers it by running the selected
cases, for every variant, several times. Research is where you create and read experiments, launch a
series, approve its spend, and ask the chat for the next hypothesis.

## Steps

- **Switch to Research.** The project header has two modes, **Flow** and **Research**. Research has two
  tabs: **Experiments** and **Series**. Research opens on **Experiments** with every experiment of the
  project, so there is no flow to pick. The flow picker belongs to Flow mode and is hidden in Research. The
  chat panel stays open in both modes.
- **Find what moved last.** The experiment that moved last is on top of every section. Each row says when
  that was: "changed 12m ago" when its files changed last, "last series 2h ago" when a series started or
  finished after that. The findings a series writes don't count as a change of the files. The list is
  grouped by activity, and an experiment sits in the first group it fits:

  | Group | Which experiments |
  |---|---|
  | **Running** | a series of it is running or waits for a person |
  | **Needs you** | a series waits for you to approve its spend, the last series is invalid, a file of the experiment other than `experiment.md` changed after its last finished series started, or `{{CLI_COMMAND}} check` reports an error in its files. The row says which |
  | **Changed today** | its files changed, or a series started or finished, today |
  | **Older (N)** | all the others, folded until you open it |

  Each row also shows the experiment id with its description, the question kind (look, threshold, better,
  not worse), the subject (a flow, a range like `support_case · polish`, or a local flow), the variants, the
  state of the last series, and how many series ran and what they cost. Click a row to open the experiment.
- **Group another way.** **Group by** switches between **Activity**, **Flow** and **Failure mode**. **Flow**
  has one section per flow, ordered by flow name. An experiment sits under the flow it tests, as a whole or
  as a range of nodes. Experiments whose subject is a flow local to the experiment come last, under **Flows
  of experiments**, even when their cases come from a project flow. A flow's name opens its canvas.
  **Failure mode** has one section per `failure_mode`, ordered by name, with the experiments that have none
  under **No failure mode**. A failure mode's name filters the list by it. Studio remembers the grouping
  in this browser.
- **Filter.** Filter by **Question** or **Failure mode**. The filters apply to every section, and a section
  with no matching experiment drops out of the list. You don't need to reload: when a series starts,
  progresses, waits for approval or for a person, or finishes, the lists and the open experiment or series
  page update in place, whether you, the chat agent or the CLI started it. They also update when an
  experiment's files or a finding change on disk.
- **Spot what is new.** A dot marks the experiments created or changed since you last opened the list in
  this browser, such as the ones the chat agent wrote while you were away. Studio moves the mark when you
  leave the list or after a few seconds on it, so the dots stay while you read and are gone next time. Your
  first visit shows no dots. A browser that keeps no site data shows the same list, without dots and
  without remembering the grouping.
- **Archive an experiment.** Add `archived: true` to its `experiment.yaml`. The experiment leaves every
  group and moves to **Archived (N)**, folded at the end of the list. Its page still opens, with an
  **Archived** tag next to the question. `{{CLI_COMMAND}} check` and series treat it like any other
  experiment. Delete the key to bring it back.
- **Suggest hypotheses** hands a prompt to the chat. The button in the page header asks about the whole
  project. With **Group by** set to **Flow**, the button in a flow's section heading asks the agent to focus
  on that flow. The prompt asks
  the agent to read the flows, their cases and the experiments already there, and to propose hypotheses.
  Each hypothesis comes with its failure mode, question, metric and margin, subject, the one factor its
  variants change and their values, checks and cases by tags. The agent writes no file until you pick one. Then it writes
  `experiments/<experiment_id>/experiment.yaml` and runs `{{CLI_COMMAND}} check`.
- **Create an experiment yourself.** **New experiment** in the page header opens a form. Its sections run
  top to bottom:

  | Section | What you fill in |
  |---|---|
  | **What you want to learn** | the question in words, saved as `description`, and the experiment id. The id follows the question until you type your own, and must not be taken |
  | **Subject and factor** | the flow, found by name with its input and output types, and what varies: **agent**, **prompt**, **node** or **called flow**. **Nodes it changes** offers only the nodes that fit: llm nodes for an agent or a prompt, call nodes for a called flow, any node for a node |
  | **Variants** | variant 1 runs the flow as written. Each further variant sets a value on the chosen nodes: an agent of the project, a flow with the same input and output types as the one the call node runs, or a prompt text saved as `experiments/<experiment_id>/prompts/<variant>.md` |
  | **Cases** | the dataset and its tags, as described in the next step |
  | **Checks** | built-in checks, such as `expected` with the output fields to compare, or none. A series always reports its built-in metrics |
  | **Question** | **look**, **threshold**, **better** or **not worse**, with the baseline, the candidate, the metric and the margin it needs. A sentence under the fields reads the question back |
  | **Plan** | how many of the selected cases a series runs, empty for all, and how many repeats |

  **Create experiment** writes `experiments/<experiment_id>/experiment.yaml` and the prompt files, runs
  `{{CLI_COMMAND}} check` on them and opens the new experiment. When the form is incomplete, it lists what
  to fix and writes nothing. When the check or the server rejects the experiment, the reasons appear under
  the form. A node factor needs alternative nodes, which are code, so the form doesn't write it: **Ask chat
  to write the alternatives** hands the form to the chat instead. **Ask chat to draft** does the same for
  any form, filled in or not, and the chat writes the file and runs the check.
- **Choose the cases.** The dataset picker lists the datasets of the flow, with how many cases each has.
  Under it, every tag of the dataset has a row of values: keep **any**, or pick one value to select only
  the cases that have it. Each value shows how many cases carry it. The count below updates as you pick,
  for example "5 of 12 cases", with the working and held-out split. **Open these cases** shows them on
  the flow's **Cases** tab.
- **Open an experiment.** The header states the question in words and holds a **Run** button. The line
  under the title names the cases: "Dataset: support_case_cases · channel=amazon · 4 of 12 cases", or
  "every case" when the experiment selects no tags. The dataset opens the **Cases** tab filtered by the
  dataset and the tags, and each tag opens the cases that have it. The page below reads top to bottom:

  | Block | What it shows |
  |---|---|
  | **What we test** | the **Hypothesis** card, or **Goal** for a look, with the experiment's description and its decision rule. Below it: the variants table, captioned with the factor, for example "Varies: prompt of deepseek, qwen, llama". Each row has the variant's role, a value column headed **Agent**, **Prompt**, **Alternative** or **Flow** with what the variant puts in the slots (one value when it puts the same one everywhere, `nodes: value` otherwise, **as written:** and the slot's own agent, inference, node or flow for the subject as written, such as "as written: tie_break"), and **Agents · models** its steps run on, left out when no variant runs an agent. Under the table, **What changes** has one closed block per variant and value. Then the facts. |
  | Facts | the cases selected out of the dataset, with the working and held-out split and the tags; the checks, each built-in, code or judge, and whether a judge is validated; where the subject runs |
  | Graphs | the subject's graph first, then each flow of the experiment, then any project flow a variant calls. Each graph names the variants that run it. Steps outside the tested range are faded, and a factor slot is marked with its kind and the values the variants put there, such as "prompt: claims_first · anchored_scale". Click a step for its **Agents**, **Input**, **Prompt**, **Output** and **Results** from the latest series. |
  | **Answer** | the verdict of the latest series as its sentence, with **Run again on fresh cases**, **Ask the agent for the next hypothesis** and a link to the series |
  | **Comparison** | the primary metric of the latest series per variant: dot for the value, whisker for the 95% interval, cost per pass and stability, the difference against the margin |
  | **Cases where variants disagree** | each such case with every variant's tally |
  | **Launch** | purpose, cases, repeats, the attempts, the recommended size and the cap |
  | **Series history** | every series of this experiment, with its state and spend |
  | **Technical details** | the files, question, subject, plan, failure mode, and the notes from `experiment.md` |

- **Change the cases of an experiment.** **Change cases** on the dataset line opens **Cases** at the top of
  the page, with the same dataset and tag picker as the form. It offers the datasets of the subject's flow,
  or every dataset when the subject is a flow of the experiment itself. Another dataset resets the tags.
  **Save** writes only `cases:` into `experiment.yaml` and shows what `{{CLI_COMMAND}} check` found in the
  file. A dataset or tags the check rejects are not written, and the reasons appear under the picker. If
  the file changed on disk after you opened the picker, nothing is written: **Reload** reads the new
  version and keeps your pick, so you can save again. **Close** drops the pick.
- **See what a variant runs.** Every value in the variants table is a button. An agent, a prompt or an
  alternative opens its block in **What changes**: the agent's model and settings; the prompt's text with
  the prompt as written below it; or the node's files (node, code, inference, prompt), each in its own
  scrolling box, with a link such as **Show aggregate on the graph**. A flow scrolls to its graph on this page and highlights
  it; a project flow without a graph here opens its canvas. The node names in the caption select that
  node on the graph. The address keeps what you opened, so a reload or a shared link returns to it.
- **Launch to explore or confirm.** **Purpose** is **Explore · working cases** or **Confirm · held-out
  cases**. Explore gives numbers without a finding. Confirm gives a verdict written to `FINDINGS.md`.
  Choose **Cases** out of the ones available on that side, and **Repeats**. The panel shows the attempts
  as cases × repeats × variants and the cap, and says that the series pauses near the cap for your
  approval. It shows no price: what a series costs depends on the models, and it is known only from the
  attempts as they finish. It explains the recommended size, for example "At 12 cases the expected
  interval is ±0.18, wider than the 0.05 margin". **Run** starts the series and opens it.
- **Continue or stop a paused series.** A series whose spend reaches 90% of its cap pauses, here and on its
  own page, with one line: "Spent $0.91 of $1.00 — the series paused. Continue up to $2.00?". Change the
  amount if you want, then click **Continue** to run the remaining attempts under the new cap, or **Stop**.
  An agent can start a series but can't continue one. **Stop** also cancels a running series. Calls
  already running finish and are paid for.
- **Use the answer.** **Run again on fresh cases** starts a series on the held-out cases at the plan's
  size. Every finished held-out series on the same cases is counted in the finding, so add new cases
  before you run it for a second answer. **Ask the agent for the next hypothesis** hands the chat the
  experiment, the latest verdict and the same answer format as **Suggest hypotheses**.

### Example

Open the showcase project, switch to **Research**, set **Group by** to **Flow**, and open
`reply_noninferior_mistral` in the `support_case` section. The Hypothesis
reads "mistral in the revision step of the polish loop is not worse than gpt by the critic's score, and a
passing reply costs at most 20% more". The variants table is captioned "Varies: agent of revise": its
**Agent** column reads **as written: gpt** for `gpt`, the flow as written, and `mistral` for the other variant.
Click `mistral` to see its model and settings under the table. The facts
show all twelve cases of `support_case_cases`, split between working and
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
