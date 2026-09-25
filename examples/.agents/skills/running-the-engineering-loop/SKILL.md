---
name: running-the-engineering-loop
description: "Orders AQVEN work from request to reliable flow: measurable contract, simplest flow, cases, traces, hypotheses, Explore on dev, Confirm on holdout. Use first when starting to build or improve a workflow, when asked to skip cases or traces and go straight to tuning, and after a series or compaction."
---

## MUST

- When the owner asks to skip a stage, name its cost in one line and let the owner choose.
- Working autonomously, keep going through cheap steps inside the task. At the number of experiments the owner
  allowed, update the journal and report with `reporting-results`, then stop.
- After a compaction, re-read `<package>/EXPERIMENTS.md`, `<package>/FINDINGS.md` and the skill of the current
  stage before anything else. Engine facts from the summary stay unverified until a skill confirms them.
- Project Python reloads on the next run: a new step, check or type never needs a server restart and is never a
  reason to work around the engine with your own scripts.
- Before a series on `holdout`, tell the owner in one line which claim it tests, why now and what each verdict
  would mean.
- Keep what you promised as a list in your host's todo or plan tool, and report what you dropped. Give short
  statuses in the owner's language.
- Models, providers and any judge panel come from the "Owner's rules" section of `AGENTS.md`.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Contract in one message, asking only what is missing: purpose, input, output, "done" as a check and a number, budget per run and per series, latency per run. Go on in parallel with work that does not depend on the answers | "done" is measurable; the series budget is `research.spend_cap_usd` set to a number the owner named; the contract is in the Contract section of the look experiment's `experiment.md` |
| 2 | The owner's current goal and the pipeline stage: which part is built now and what "good" means for it (recall of a stage that proposes candidates, precision of a judge that filters them, cost) | the goal in one sentence under "Now" in `EXPERIMENTS.md`, checked again before every holdout series |
| 3 | Open 3 to 5 real inputs; for media load `preparing-media-inputs` | size, orientation, language and noise of the inputs are named |
| 4 | The simplest flow with `building-flows`, with the checklists of `hardening-flows`, `designing-output-contracts` and `choosing-models` | `aqven_check` clean; the preview of every llm node read; one live run on a real input finished and its output reads well in the run view |
| 5 | Cases with `building-datasets`, the project's labelled data first | the count of tag value × split is shown to the owner |
| 6 | Explore and read the failures with the owner: `analyzing-failures` | failure modes agreed with the owner |
| 7 | A specification gap (the prompt or the type never asked for it) is fixed in the prompt or the type, then step 6 again | the mode is gone, or it is a generalization gap |
| 8 | Hypotheses and experiments: order them with `analyzing-failures`, write them with `designing-experiments` | the validity gate passed |
| 9 | Explore on `dev`, confirm once on `holdout` with `running-series`; the one-line claim, reason and reading of each verdict before holdout | `verdict.text` quoted as it is |
| 10 | Apply: the winning variant goes into the project flow with `building-flows` or `hardening-flows`; the project flow stays flat; regression cases added; the Decision section of `experiment.md` written | `aqven_check` clean; a regression look on `dev` shows no new failures |
| 11 | Journal and report with `reporting-results` | `EXPERIMENTS.md` updated; the report leads with real data |
| 12 | Continue or stop: every "done" criterion confirmed on holdout, budget left, experiments run against the number allowed, risks left | a new round, or a report of findings, decisions, spend and risks |

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| A clean `aqven check` is taken for a working flow, one run for proof | `check` proves wiring, a run proves one case, only a holdout series proves a claim |
| Threshold hypotheses before the first run; a failure taxonomy before anyone read traces | run a look, let the owner read traces, then hypothesize |
| A holdout series started without saying why | the one-line claim, reason and verdict reading first; the owner may say no |
| A threshold meant for the whole pipeline is put on one stage | measure each stage by its own job: a stage that proposes candidates by recall, a judge that filters them by precision |
| The owner's sketch of an architecture (for example split a contract into clauses, group the clauses, then one checker per group) is built at once as a nested flow | the sketch is input to steps 2 and 8; the project flow stays flat until an experiment earns each level |
| A rule from a compaction summary ("new Python needs a restart") steers hours of work | re-read the journal and the skill; the engine reloads project Python by itself |
| The owner's "start from the riskiest hypotheses, read the literature" is treated as a detour | it is step 8: `analyzing-failures` orders hypotheses by risk |

## Tools and commands

- `aqven` MCP `aqven_check` after every change; `series_get` to read a finished series.
- `uv run aqven check <package>` when the MCP server is not connected.
- Your host's todo or plan tool for the list of promises.

## References

- `references/concepts/engineering-loop.md`: why each stage exists. Read at the start of a task.
- `references/mcp-cli/research-loop.md`: one round from the agent's side, how to find what to test, and the
  table from failure mode to experiment. Read before step 6 and before step 8.
- `references/concepts/stage-exit-criteria.md`: the exit criterion and the metric of every stage. Read at
  steps 2 and 12, and whenever you are unsure whether a stage is finished.
