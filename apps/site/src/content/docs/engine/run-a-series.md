---
title: How to run a series
description: Start a series of an experiment from Studio, the terminal or an agent — pick Explore or Confirm, choose the size, read the estimate, get the spend approved, stop it.
---

## When you need this

You have an experiment that `{{CLI_COMMAND}} check` accepts, and you need its answer. A series runs every
selected case, for every variant, `repeats` times. Every attempt is an ordinary run that calls the models
live and costs money. The series runs on the project server, and Studio, the terminal and an agent over
MCP are three ways to start the same thing.

## Steps

- **Pick the purpose.** Explore runs on the working cases (`dev`). Use it while you change the flow: it
  gives numbers and a `signal`, never a finding. Confirm runs on the held-out cases (`holdout`), once, when
  the change is done and the question is fixed. It gives a verdict and writes a finding.
- **Pick the size.** Without a size, the series uses the experiment's `plan`. `cases` takes the first N
  cases of the chosen half, in file order. `repeats` is at most 20. The estimate recommends how many cases
  the margin needs, and says when the half doesn't have that many. A size below the recommendation still
  runs, but expect `inconclusive`.
- **Read the estimate before anything runs.** It gives attempts (cases × repeats × variants), dollars with
  their source, minutes and the expected half-width of the interval. See
  [what a series costs](/concepts/experiments-series-and-findings/#what-a-series-costs).
- **Know who starts it.** At or below the project spend cap (`research.spend_cap_usd`, $1.00 by default),
  a series starts at once. Above it, or with no price estimate, it waits in `awaiting_approval` until a
  person clicks **Approve spend** in Studio. The same approval over REST is
  `POST /api/series/{series_id}/approve`. No agent tool approves spend. To change the cap, set the project
  setting on the project server: `PUT /api/settings/project/research.spend_cap_usd` with the body
  `{"kind": "value", "value": "5.00"}`.
- **Don't edit the subject while it runs.** A change to the flow, the experiment, the dataset or the code
  during a series ends it `invalid` with `inputs_changed`.
- **Stop it if you must.** Queued attempts never start. Model calls already running finish and are paid
  for. The series ends `cancelled`, and no finding is written.

### From Studio

Open **Research**, then the experiment. The **Launch** panel has **Purpose** (**Explore · working cases**
or **Confirm · held-out cases**), **Cases** and **Repeats**. It shows the attempts, the estimate with its
source (≈ from past series, ≈ at provider prices, ≤ upper bound, or no price estimate) and the cap. It also
says when the size is below the recommendation. **Run** starts the series and opens its page, which
follows it live. The **Run** button in the page header does the same with the current settings. See
[How to use Research in Studio](/studio/research/).

To run a few cases without an experiment, select them on a flow's **Cases** tab and click **Run** in the
selection bar. That starts a look: see [How to work with cases in Studio](/studio/cases/).

### From the terminal

```bash
{{CLI_COMMAND}} series reply_overpromise_risk --on dev --cases 2 --repeats 2
```

| Flag | What it does |
|---|---|
| `--on dev` or `--on holdout` | the working or the held-out cases; `dev` by default |
| `--cases N`, `--repeats R` | the size; the experiment's `plan` when left out |
| `--cap USD` | this series' own spend cap |
| `--json` | print the final state, with the dev case rows, as one JSON line on stdout; progress goes to stderr |
| `--path PATH` | the module folder with `aqven.yaml`, or a path inside it; the current folder by default |

The command starts the project server when it isn't running, prints the estimate, then waits and prints
the progress and the verdict. The exit code tells a script what happened:

| Exit | Meaning |
|---|---|
| 0 | the series is done, whatever its verdict |
| 1 | it was cancelled or failed, or the server didn't answer |
| 2 | the request was refused: unknown experiment, a project with errors (`NOT_RUNNABLE`) or a bad size |
| 3 | it awaits approval; the line carries a Studio link to approve it |
| 4 | an attempt waits for a person at a `human` node |

### From an agent

Over MCP, `series_start` takes `experiment_id`, `on`, and optionally `cases`, `repeats`, `cap_usd` and a
`client_op_id`. It returns at once with the estimate and the status. `series_get` with `wait_seconds` up to
50 waits for the series to settle, and `series_cancel` stops it. MCP has no estimate-only call:
`series_start` starts a series that fits under the cap. REST has `POST /api/experiments/{id}/estimate` for
that. See [How to run experiments and series as an agent](/mcp-cli/experiments-and-series/).

### Example

In the showcase project, explore `reply_noninferior_mistral` on the working cases with the plan's size,
then confirm it once:

```bash
{{CLI_COMMAND}} series reply_noninferior_mistral
{{CLI_COMMAND}} series reply_noninferior_mistral --on holdout
```

The plan asks for 12 cases, and each half of the twelve-case dataset has fewer, so each series runs every
case of its half, and the estimate warns that it is short of cases. The first command gives a `signal`
whatever the numbers say, and you can repeat it after every change to the revision step. The second
writes `experiments/reply_noninferior_mistral/findings/<series_id>.yaml` and regenerates `FINDINGS.md`,
unless the series ends `invalid`. If its estimate is above the project cap, the command exits with 3 and
prints the Studio link. Once someone approves the spend there, the series runs, and Studio shows it live.

## See also

- [How to read a series](/engine/read-a-series/): what the verdict, the matrix and the cases mean, and what
  to do next.
- [How to write an experiment](/engine/experiments/): the file a series runs.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/): working and held-out
  cases, spend and approval.
- [CLI commands](/reference/cli/): every other command.
