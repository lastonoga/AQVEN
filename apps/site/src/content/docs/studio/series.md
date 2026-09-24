---
title: How to follow and read a series in Studio
description: Find a series on the Series tab, follow it live, approve its spend or stop it, and read its verdict, variants × metrics matrix, stability and cases down to each attempt's run.
---

## When you need this

A series is running or has finished: one you launched from an experiment, a look you started from the
Cases tab, or one an agent started over MCP. Its page is where you follow it live, approve its spend, and
read what it found down to a single attempt. The meaning of each number is on
[How to read a series](/engine/read-a-series/). This page covers where it sits on the screen.

## Steps

- **Find it on the Series tab.** In Research, **Series** lists every series of the project in one table,
  the newest first by start time, whether it is running or finished. The columns are **Status**,
  **Experiment** (a look shows as `look · <flow>`), **Flow** (a series of an arm shows **Arms**), **On**
  (dev or holdout), **N×R**, **Spend**, **Verdict** and **Started**. An experiment page lists its own
  series under **Series history**.
- **Read the header.** The title names the series: "Series … of this experiment", or "Look at N cases" with
  the dataset and the stages for a look. Tags show the status, and **live** while Studio follows it. Below
  them are the size and variants and when it started and finished. **Attempts** shows the progress.
  **Spend** shows the spend against the cap, and says "Lower bound" with a count when some attempts ran on
  a model without a known price.
- **Approve spend or stop it here.** A series in **AWAITING APPROVAL** shows **Approve spend**, the only
  way a series above the project spend cap runs. **Stop** cancels one that hasn't finished: queued
  attempts never start, calls already running finish and are paid for, and no finding is written.
- **Read the verdict first.** The **Verdict** block carries the state and its reason as tags, and the
  sentence the server wrote. For a comparison, it lists each difference behind the verdict: the metric,
  candidate − baseline, the 95% interval and the margin. A held-out series that wrote a finding shows
  "Finding written to …" with the path. An approved series shows who approved the spend. A look reads "A
  look has no verdict: read the cases below", and a running series "The verdict comes when the series
  finishes".
- **Read Variants × metrics.** One row per variant, one column per metric, with the metric's role, margin
  and direction under its name. The primary metric comes first, then the guardrails, the other checks and
  the built-in metrics. A dot is the value and a whisker the 95% interval, on a scale shared by the
  column. The color is the cell's verdict. **Stability** shows, per variant, the share of cases that
  passed every repeat, never, or sometimes.
- **Answer a waiting person inline.** When attempts wait at a `human` node, the page lists those reviews,
  and answering them lets the series continue.
- **Read the cases.** **Cases** lists every case with each variant's tally ("3 of 3"), its failed checks
  and its spend. Filter it to **Failures**, or to **Variants disagree** when there is more than one
  variant, or show **All cases**. Open a case to see each attempt: variant, repeat, outcome (passed,
  failed, error, waiting, running), failed checks, error, spend, latency, and a link to its run. Hover a
  failed check to see what it is: a code check shows its `module:function`, a built-in check its name and
  the fields it reads, and a judge its inference, its agent and the experiment that validated it.
- **Follow an attempt to its run.** The run link opens the ordinary run page for that attempt, with its
  timeline, the failed attempts of each node and the exact prompt. See
  [How to investigate a run](/studio/investigate-a-run/).

### Example

Launch `reply_noninferior_mistral` on its working cases from the experiment's **Launch** panel. The series
page opens and fills in live: the attempts count up, and the matrix gains a `gpt` row and a `mistral` row.
The `critique` column shows each variant's score with its interval. When the series ends, the Verdict
block carries `signal` with the reason "working cases, a signal not a finding", above the sentence that
starts "Signal on dev, not a finding:". Filter **Cases** to **Variants disagree** and open a case where
mistral failed: its attempt row links to the run, where the trace shows what the revision step wrote.

## See also

- [How to read a series](/engine/read-a-series/): what each verdict means and what to do next.
- [How to use Research in Studio](/studio/research/): the experiment page a series belongs to.
- [How to work with cases in Studio](/studio/cases/): where a look over selected cases starts.
- [How to respond to a human-review request](/studio/respond-to-a-review/): the reviews an attempt can
  wait on.
