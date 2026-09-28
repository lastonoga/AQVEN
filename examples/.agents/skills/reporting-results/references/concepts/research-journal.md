# The research journal

EXPERIMENTS.md is the project's own record of what it learned, written after every series for a reader who wasn't in the conversation. Its sections, what an entry holds, and the rule for reporting results to a person.

## Contents

- [In short](#in-short)
- [Why a file](#why-a-file)
- [`FINDINGS.md` and `EXPERIMENTS.md`](#findingsmd-and-experimentsmd)
- [Sections](#sections)
- [An entry per series](#an-entry-per-series)
- [Reporting to a person](#reporting-to-a-person)
- [An example](#an-example)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

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

A coding agent's private memory is no substitute. It lives outside the project, and no other person, session
or model reads it. The owner's plans, hypotheses and data policies go into the journal the moment they are
said, and standing rules into the "Owner's rules" section of `AGENTS.md`. The agent's memory holds at most a
pointer to them.

## `FINDINGS.md` and `EXPERIMENTS.md`

| | `FINDINGS.md` | `EXPERIMENTS.md` |
|---|---|---|
| Written by | the engine, whenever a held-out series ends with a verdict | you or your agent |
| Holds | findings: verdicts on held-out cases, by failure mode | everything the project learned, with findings linked |
| Edited by hand | never: `aqven check` reports `W_FINDINGS_STALE` | always |
| Checked by the engine | yes | no |

## Sections

| Section | What goes in it |
|---|---|
| Now | the owner's current goal, and the stage of the flow being built with what "good" means for it |
| Planned | the owner's hypotheses, plans and data policies that no series has tested yet |
| What held-out series settled | each finding in one line, linked to `FINDINGS.md` and its finding file |
| What works | signals from working cases, marked as signals, with their numbers and n |
| What does not | approaches that failed, with the series that showed it |
| How we measure | the checks, the truths, the controls, and why each one measures its claim |
| Open questions | what is not known yet, including unverified claims and labels that need an expert |
| Spend | spend per series (`spend.usd` of `series_get`) and in total (`stats` of `series_list`: spend with judge checks, requests, tokens and wall time), against the cap |

Refuted ideas stay in the journal, marked with the date, the series that refuted them and its scope.
Deleting them invites the next session to try them again. A refutation of one implementation is
"implementation-level" until a strong version of the idea also fails: one weak intermediate record that
lowered accuracy says little about intermediate steps in general.

## An entry per series

After every series that finished, add one entry:

- the date, the experiment and the series id;
- the question, in one line;
- `verdict.text`, quoted as the server wrote it;
- the numbers that matter, each with its n;
- the scope: what the claim covers and what it does not;
- what you read: how many lost and won cases you opened side by side with their inputs, and what you saw;
- the spend the series measured, never an estimate;
- what it changes: a decision, a next experiment, `archived: true` on an answered experiment, or nothing.

```markdown
### 2026-09-24 · intent_escalation_agents · series 0199f1e2-… · holdout

Question: does Qwen as the escalation agent get the intent right at most 0.1 less often than DeepSeek, with no more invalid first outputs and at most 25% slower at p95?
Verdict: "<verdict.text as the series wrote it>"
Numbers: intent right 0.86 against 0.89 (-3 points, within the 10-point margin), valid first outputs 0.97 against 0.95, p95 12% faster, n = 40 support cases.
Scope: the `escalate` node only, with the recorded triage as its input; another agent or another triage needs its own series.
Read: on dev series 0199e5c4, 7 lost and 4 won cases side by side; the losses are messages whose defect claim the rest of the message takes back.
Spend: $0.42 measured.
Changes: the `escalate` node points at qwen; the experiment is archived.
```

Held-out outputs are read only as aggregates, never case by case: `series_get` never shows held-out case
rows, and `series_outputs` returns held-out attempts only when you leave out `split: "dev"`. So the Read
line of a held-out entry comes from the working-case series before it. An estimate of spend belongs before a run, labelled as one. After the
run, the journal carries what the series measured. When some calls had no price, that is a lower bound, and
the entry says so.

A signal from working cases is never called a finding. Only a held-out series makes one.

The journal is written by hand: an agent edits it with its editing tools, one change at a time, never by a
script that regenerates it. A script rewrites what it doesn't understand, and refuted entries and context
written by hand are the first to go.

## Reporting to a person

The journal is for a reader outside the conversation. So is a progress report to the owner of the flow,
and both follow the same rule:

- **Lead with the result on real data**: the number, the change in points against the baseline, and n.
  Synthetic tests only support it, after it.
- **Two or three sentences first**, for a result and for a question about a concept alike. Details on
  request.
- **Read before you report.** Open the cases a new variant lost and won against the current best, with
  their inputs, and say in one line what you saw.
- **Show n in every cell of a breakdown.** A breakdown by tag or label with a cell under 10 cases shows a
  direction there, not a result. A claim about one group needs its own experiment on that group.
- **Explain internal ids.** A variant or check id means nothing to a reader who didn't write it.
- **Keep held-out findings apart from signals** on working cases.
- **End with the next step and the spend.**

A summary or a table of statistics for a person is a Markdown file in the package, next to
`EXPERIMENTS.md`, unless they ask for another format. It is versioned with the project and opens anywhere.

## An example

A journal after a few rounds on the intent step of the showcase's support flow. It records what this
project tried; the designs in it are examples of entries, not recommendations:

```markdown
# Experiments

## Now

Goal: the intent a support lead would assign, on real tickets, within the latency
contract. Stage: the escalation step; "good" is the right intent, a valid first
output, and p95 no worse than today.

## Planned

- The owner's hypothesis: a cheaper triage agent keeps the intent as right. Not run yet.
- Data policy from the owner: tickets from the last quarter only; no customer names in
  the cases.

## What held-out series settled

- 2026-09-24 intent_escalation_agents, series 0199f1e2: Qwen on the escalation step
  got the intent right within 10 points of DeepSeek, with p95 12% faster (confirmed,
  n=40 cases). See FINDINGS.md. Experiment archived.

## What works

- Signal, dev: a rubric fragment that defines each intent by what separates it from
  its neighbours gets the intent right in 0.88 of cases against 0.75 as written
  (n=24 cases, series 0199e7a0).

## What does not

- Condensing a long message before the decision (2026-09-22, series 0199d3b4): on long
  messages it matched deciding from the whole message and cost 40% more per correct
  intent. Implementation-level: one condensing prompt was tried.

## How we measure

- intent: the built-in expected check on the intent a support lead assigned by the
  rubric. Truth: the lead's label, written before any run. Controls: cases with a clear
  intent, which every agent must get right.

## Open questions

- The escalation step only sees cases the earlier steps could not settle, and those are
  harder than the average case: a series on those cases alone is still to run.

## Spend

- $2.31 in 11 series (series_list stats: 396 attempts, 452 requests); project cap
  $1.00 per series.
```

And the report that goes with it:

```text
On real support tickets, Qwen as the escalation agent gets the intent right 86% of the
time against 89% for DeepSeek, 3 points lower and within the agreed 10-point margin,
and answers 12% faster at p95 (40 held-out cases, confirmed). The escalation step now
uses Qwen. Next: a series on the harder cases the escalation really sees. Spent so far:
$2.31 in 11 series.
```

## How this shapes what you do

- Write an entry after every finished series, with its scope, what you read and the measured spend, and
  keep refuted ideas with their date and scope.
- Write the owner's plans and rules down the moment they are said: Planned in the journal, standing rules in
  `AGENTS.md`.
- Keep "Now" current: the owner's goal and the stage of the flow being built.
- Read the journal and `FINDINGS.md` before a change and after a compaction.
- Report with real data first, in points, with n, in a few sentences, after reading lost and won cases.
- Give a person a summary as Markdown next to the journal, unless they ask for another format.
- Working on your own, stop at the number of experiments the owner allowed, and update the journal before
  the report.
- Once an experiment's question is answered, set `archived: true` in its `experiment.yaml` and say so in
  the entry. Studio moves it to Archived; it keeps its findings and still runs.

## See also

- [Experiments, series and findings](experiments-series-and-findings.md): findings and
  `FINDINGS.md`.
- When a stage is done: what "Now" tracks.
- [Findings reference](../reference/findings.md): every key of a finding file.
