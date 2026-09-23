---
title: How to read research in Studio
description: Browse a project's experiments, launch a series with its estimate, approve spend above the cap, and read a series' verdict, metric matrix and cases.
---

## When you need this

Use this once a fix has worked on the one case you saw and you need to know whether it holds up. An
experiment asks one question of a flow, a range of its nodes or a small arm. A series answers it by
running every selected case, for every variant, several times. Studio's **Research** section is where a
person reads those experiments and series, launches a series and approves its spend. This is the
[Test step of the engineering loop](/concepts/engineering-loop/).

:::caution[Research is being connected to the project server]
The project server already runs series ([the agent's side](/mcp-cli/experiments-and-series/) and
`{{CLI_COMMAND}} series` both work). Studio's Research screens don't read from it yet. Until they do,
approve a series that waits for approval with `POST /api/series/{series_id}/approve` on the project
server.
:::

## Steps

- **Open Research** from the project navigation, next to the flows. The list shows every experiment
  in the project: its question, its subject (a flow, a range like `support_case · polish`, or an arm),
  its variants, the verdict of its last series and how many series it has had and what they cost.
  Filter it by flow, by question or by failure mode.
- **An experiment page reads its file for you.** "What we run" names the subject, the cases (the dataset,
  and how many of its cases the tag filter selects), and the variants with the agent and model on every
  node, marking the nodes a variant overrides. "How we measure" lists the checks, each built-in, code or
  a judge. A judge shows the experiment it was validated by, or is flagged as an unvalidated judge. Below
  them are the metrics of the question with their role, direction and margin. **Show notes** opens the
  experiment's `experiment.md`.
- **Launch picks the size and shows the estimate before anything runs.** Choose the cases to run on
  (`dev` or `holdout`), N cases and R repeats. Studio shows the attempts (N × R × variants), the expected
  spend and time, and a recommended N with the reason. For example, "At 12 cases the expected interval is
  ±0.18, wider than the 0.05 margin: the verdict will likely be inconclusive." You can still start below
  the recommended size. If the estimate is above the project spend cap, the launch says so, and the series
  waits for your approval before it runs a single attempt.
- **Approve spend or stop a series from its page.** A series that waits for approval shows **Approve
  spend**. That button is the only way a series above the cap runs: an agent over MCP can start a series,
  but it can't approve one. **Stop** cancels a series. Queued attempts never start, and calls already
  running finish and are paid for.
- **The verdict comes first, as a sentence.** A finished series shows its verdict: confirmed, refuted,
  inconclusive, invalid, or a signal. The sentence is the one the server wrote, the same text an agent
  quotes. A look has no verdict, and a series on working (`dev`) cases gives at most a signal. Only a
  series on held-out (`holdout`) cases writes a finding into the project.
- **Variants × metrics is the matrix behind the verdict.** Each row is a variant. Each column is a
  metric: the primary metric first, then guardrails, the other checks, and the built-in metrics every
  series measures (success rate, cost per attempt, cost per pass, latency p50 and p95, valid on first
  try, infrastructure errors). A cell draws the value as a dot and the 95% interval as a whisker, on a
  scale shared by its column, colored by the cell's verdict.
- **Stability and cases show where the average hides something.** Stability counts, per variant, the
  cases that passed every repeat, never passed, or sometimes passed. The cases table lists every case
  with its per-variant tally and failed checks. Filter it to **Failures** or to **Variants disagree**,
  and open a case to see each attempt with a link to its own run.

### Example

Open the [showcase](/start/quickstart/) project's **Research** section and select
`reply_noninferior_mistral`: is mistral on the revision step of the `polish` loop no worse than gpt, by
the critic's score, within 0.05? Launch it on `dev`. The estimate shows the attempts across both variants
and the spend. It also warns that the dev half of this small dataset holds fewer cases than a 0.05 margin
needs, so the verdict will likely be inconclusive. Once the series finishes, it gives a signal rather than a finding,
because it ran on working cases. Its matrix shows the `critique` score of both variants with their
intervals, and the cases table filtered to **Variants disagree** lists the cases where the two agents
parted ways. When the change is final, launch it once on `holdout`: that series writes a finding under
`experiments/reply_noninferior_mistral/findings/` and adds a line to the project's `FINDINGS.md`.

## See also

- [How to run experiments and series as an agent](/mcp-cli/experiments-and-series/): the same series,
  started and read over MCP.
- [How to work with datasets in Studio](/studio/datasets/): where the cases an experiment selects come
  from.
- [How to write a custom evaluator](/engine/custom-evaluator/): a check an experiment scores on every
  attempt.
- [How to investigate a run](/studio/investigate-a-run/): what opens when you follow an attempt's run
  link.
