---
title: The research journal
description: EXPERIMENTS.md is the project's own record of what it learned, written after every series for a reader who wasn't in the conversation. Its sections, what an entry holds, and the rule for reporting results to a person.
---

## In short

`FINDINGS.md` records what held-out series settled, and the engine writes it. Most of what a project
learns never reaches it: signals from working cases, what failed, how you measure, which questions are
open. `EXPERIMENTS.md` is where that goes. You or your agent write it after every finished series, next to
`FINDINGS.md` at the root of the project's package. A conversation gets compacted and a session ends. A
file survives both, so the next session, person or model starts from what the project knows, not from a
summary. Reports to a person follow one rule: lead with the result on real data.

## Why a file

A chat agent holds knowledge in its context, and a long session compacts that context into a summary. A
summary can carry a rule that was never true. "New Python needs a server restart" survived one compaction
and cost hours of measuring the wrong thing, although the engine reloads project code on the next run.
A file is written on purpose, read in full, and versioned in git with the flow it describes.

Read `EXPERIMENTS.md` and `FINDINGS.md` before you design a change, and again after a compaction. Treat
engine facts from a summary as unconfirmed until the documentation confirms them.

## `FINDINGS.md` and `EXPERIMENTS.md`

| | `FINDINGS.md` | `EXPERIMENTS.md` |
|---|---|---|
| Written by | the engine, whenever a held-out series ends with a verdict | you or your agent |
| Holds | findings: verdicts on held-out cases, by failure mode | everything the project learned, with findings linked |
| Edited by hand | never: `{{CLI_COMMAND}} check` reports `W_FINDINGS_STALE` | always |
| Checked by the engine | yes | no |

## Sections

| Section | What goes in it |
|---|---|
| Now | the owner's current goal, and the stage of the flow being built with what "good" means for it |
| What held-out series settled | each finding in one line, linked to `FINDINGS.md` and its finding file |
| What works | signals from working cases, marked as signals, with their numbers and n |
| What does not | approaches that failed, with the series that showed it |
| How we measure | the checks, the truths, the controls, and why each one measures its claim |
| Open questions | what is not known yet, including unverified claims and labels that need an expert |
| Spend | spend per series and in total, against the cap |

Refuted ideas stay in the journal, marked with the date and the series that refuted them. Deleting them
invites the next session to try them again.

## An entry per series

After every series that finished, add one entry:

- the date, the experiment and the series id;
- the question, in one line;
- `verdict.text`, quoted as the server wrote it;
- the numbers that matter, each with its n;
- what it changes: a decision, a next experiment, `archived: true` on an answered experiment, or nothing.

A signal from working cases is never called a finding. Only a held-out series makes one.

## Reporting to a person

The journal is for a reader outside the conversation. So is a progress report to the owner of the flow,
and both follow the same rule:

- **Lead with the result on real data**: the number, the change in points against the baseline, and n.
  Synthetic tests only support it, after it.
- **Two or three sentences first.** Details on request.
- **Explain internal ids.** A variant or check id means nothing to a reader who didn't write it.
- **Keep held-out findings apart from signals** on working cases.
- **End with the next step and the spend.**

## An example

A journal after a few rounds on the showcase's support flow, where a panel of three judges picks the best
draft reply and a critic stops replies that should not go out:

```markdown
# Experiments

## Now

Goal: the panel picks the reply a support lead would send, on real tickets. Stage: the
panel's merge step; "good" is the expected winner at the lowest cost per correct pick.
The critic comes later.

## What held-out series settled

- 2026-09-24 panel_merge_rule, series 0199f1e2: merging by a two-judge majority alone
  picked the expected winner as often as the spread rule (confirmed, n=40 cases).
  See FINDINGS.md. Experiment archived.

## What works

- Signal, dev: a judge prompt that checks every claim against the chunks first picks
  the expected winner in 0.88 of cases against 0.75 as written (n=24 cases,
  series 0199e7a0).

## What does not

- A judge asked only "which reply is best?" without the rubric (2026-09-24, series
  0199d3b4): it preferred the longest reply, whatever it promised.

## How we measure

- winner: the built-in expected check on the winner a support lead picked. Truth: the
  lead's pick, written before any run. Controls: cases with a clear winner, which every
  sound merge must get right.

## Open questions

- Close contests are few: the lead's picks on them need a second reader.

## Spend

- $2.31 in 11 series; project cap $1.00 per series.
```

And the report that goes with it:

```text
On real support tickets, checking every claim against the sources first makes the panel
pick the reply a support lead chose 88% of the time, up 13 points from the current prompt
(24 cases, working half). That is a signal, not yet confirmed on held-out cases. Next:
confirm it on held-out cases. Spent so far: $2.31 in 11 series.
```

## How this shapes what you do

- Write an entry after every finished series, and keep refuted ideas with their date.
- Keep "Now" current: the owner's goal and the stage of the flow being built.
- Read the journal and `FINDINGS.md` before a change and after a compaction.
- Report with real data first, in points, with n, in a few sentences.
- Working on your own, stop at the number of experiments the owner allowed, and update the journal before
  the report.
- Once an experiment's question is answered, set `archived: true` in its `experiment.yaml` and say so in
  the entry. Studio moves it to Archived; it keeps its findings and still runs.

## See also

- [Experiments, series and findings](/concepts/experiments-series-and-findings/): findings and
  `FINDINGS.md`.
- [When a stage is done](/concepts/stage-exit-criteria/): what "Now" tracks.
- [Findings reference](/reference/findings/): every key of a finding file.
