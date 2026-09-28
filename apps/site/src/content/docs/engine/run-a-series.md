---
title: How to run a series
description: Start a series of an experiment from Studio, the terminal or an agent — pick Explore or Confirm, choose the size, read the launch plan, get the spend approved, stop it.
---

## When you need this

You have an experiment that `{{CLI_COMMAND}} check` accepts, and you need its answer. A series runs every
selected case, for every variant, `repeats` times. Every attempt is an ordinary run that calls the models
live and costs money. The series runs on the project server, and Studio, the terminal and an agent over
MCP are three ways to start the same thing.

## Steps

- **Smoke it first.** Before a series of the planned size, run the same experiment on one working case
  once (`--cases 1 --repeats 1`). For a new output type, use about ten varied cases instead: `--cases 10`
  takes the first ten working cases in file order, so make sure those differ. Follow the smoke to its end.
  Collect every distinct error of every variant, fix them together, and run the smoke once more. An
  infrastructure error, or a variant three times slower than the others, stops the launch until it is
  fixed or the variant is dropped. The smoke is also the first call of each agent on the step's real input
  and output type, which [a provider check](/engine/check-providers/) doesn't make.
- **Pick the purpose.** Explore runs on the working cases (`dev`). Use it while you change the flow: it
  gives numbers and a `signal`, never a finding. Confirm runs on the held-out cases (`holdout`), once, when
  the change is done and the question is fixed. It gives a verdict and writes a finding.
- **Pick the size.** Without a size, the series uses the experiment's `plan`. `cases` takes the first N
  cases of the chosen half, in file order. `repeats` is at most 20. The launch plan recommends how many cases
  the margin needs, and says when the half doesn't have that many. A size below the recommendation still
  runs, but expect `inconclusive`.
- **Read the launch plan before anything runs.** It gives attempts (cases × repeats × variants), the
  expected half-width of the interval and the cap. It has no price: what a series costs is known only from
  its attempts as they finish. See
  [what a series costs](/concepts/experiments-series-and-findings/#what-a-series-costs).
- **Know who lets it spend more.** A series starts at once. When its spend reaches
  90% of its cap, it starts no new attempts, lets the running ones finish and waits in `awaiting_approval`
  until a person clicks **Continue** in Studio with a higher cap, or **Stop**. The same over REST is
  `POST /api/series/{series_id}/approve` with an optional body `{"cap_usd": "2.00"}`; without it the cap
  doubles. A `--cap` above the project cap waits for **Approve spend** before anything runs. No agent tool
  approves spend.
- **Set the cap in `aqven.yaml`.** The cap is `research.spend_cap_usd` in the project file, and
  `{{CLI_COMMAND}} new` writes $1.00 there:

  ```yaml
  research:
    spend_cap_usd: 1.00
  ```

  Edit the number, or use **Research budget** in Studio's [Settings](/studio/settings/), which writes the
  same key. Without a `research` block the cap is $1.00. `{{CLI_COMMAND}} check` rejects a negative cap or
  one that is not a number. The change goes into git with the rest of the project, so review it like
  code: whoever can edit `aqven.yaml` can raise the cap.
- **Override it on one computer if you must.** The local setting `research.spend_cap_usd` on the project
  server wins over `aqven.yaml` on that computer only, and stays out of git:
  `PUT /api/settings/project/research.spend_cap_usd` with the body `{"kind": "value", "value": "5.00"}`.
  Settings shows when an override is active and removes it. The launch plan says which one won in
  `project_cap_source`: `override`, `project` or `default`.
- **Don't edit the subject while it runs.** A change to the flow, the experiment, the dataset, a media
  file a case points at, a shared type or the code during a series ends it `invalid` with `inputs_changed`.
  The project server watches the whole project folder. Media files dropped there, even thousands at once,
  don't re-check the project or stall the server, but spec files among them (`.yaml`, `.yml`, `.md`,
  `.liquid`, `.py`) do re-check it. Keep raw downloads outside the project folder anyway, so unvetted files
  stay out of the package and out of git. See
  [How to keep case media as files in the project](/engine/dataset-media-files/).
- **Stop it if you must.** Queued attempts never start. Model calls already running finish and are paid
  for. The series ends `cancelled`, and no finding is written.

### From Studio

Open **Research**, then the experiment. The **Launch** panel has **Purpose** (**Explore · working cases**
or **Confirm · held-out cases**), **Cases** and **Repeats**. It shows the attempts as cases × repeats ×
variants and the cap, with the rule that the series pauses near it for your approval. It also explains the
recommended size and says when the size is below it. **Run** starts the series and opens its page, which
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

The command starts the project server when it isn't running, prints the attempts and the cap, and a line
when the size is below the recommendation, then waits and prints the progress and the verdict. The first
line, `series <series_id> started on dev: …`, comes within seconds. Each progress line reads
`<done>/<total> attempts, $<spent> of $<cap>, status <status>` and ends with the time left, the finish time
and the speed, such as `~5 min left, finishes ~18:42, 12 attempts/min`, or `estimating the time left` while
the first attempts finish.

Run it unpiped. In a script, or from an agent, run it in the background with its output going to a file, and
read the first line once. `| tail` shows nothing until the command ends, and `| head` stops the command
after its first lines, while the series goes on running on the server. The exit code tells a script what
happened:

| Exit | Meaning |
|---|---|
| 0 | the series is done, whatever its verdict |
| 1 | it was cancelled or failed, or the project server couldn't start |
| 2 | the request was refused: unknown experiment, a project with errors (`NOT_RUNNABLE`) or a bad size |
| 3 | it awaits approval, before it starts or paused near its cap; the line carries a Studio link to continue it |
| 4 | an attempt waits for a person at a `human` node |
| 5 | it lost contact with the project server and gave up after retrying for 300 s; the series keeps running there |

A slow or briefly frozen server doesn't end the command. On a network error, or a server error without an
API error body, it prints `lost contact with the project server (ReadTimeout), retrying in 1s` and tries
again, waiting 1, 2, 4 … up to 15 seconds between tries. Only after 5 minutes without an answer does it
give up with exit 5, naming the error and printing the series' Studio link.

To take the outputs of a series offline, export them:

```bash
{{CLI_COMMAND}} series export <series_id> --format csv --fields /label triage --out rows.csv
```

It writes one row per attempt: the case, variant, repeat, split, outcome, error code, cost, latency and
`run_id`, then one column per `--fields` entry (a JSON pointer such as `/label` into the flow output, a node
id such as `triage`, or `triage/summary`), and one `check:<id>` column per check. Without `--fields` the
whole flow output goes into one `output` column as JSON. `--format jsonl` (the default) writes the same rows
as JSON lines; `--variant`, `--outcome` and `--split` narrow them, and without `--out` they go to stdout. It
exits with 2 when the series doesn't exist and with 5 when it loses contact with the server.

Exit 5 means the command lost contact with the server, not that the series stopped: it runs on the
server. Look it up in Studio or with `series_get` before you start it again, or you pay for the same
attempts twice.

### From an agent

Over MCP, `series_start` takes `experiment_id`, `on`, and optionally `cases`, `repeats`, `cap_usd` and a
`client_op_id`. It returns at once with the launch plan and the status. `series_get` with `wait_seconds` up
to 50 waits for the series to settle, and `series_cancel` stops it. `series_get` with `view: "summary"`
reads a series of any size in a few KB, `series_outputs` pages through what its attempts produced, and
`series_list` gives an experiment's earlier series with their totals, so a finished one isn't paid for twice. MCP
has no plan-only call: the launch plan is information, and `series_start` starts the series. REST has
`POST /api/experiments/{id}/launch-plan` for that. See [How to run experiments and series as an agent](/mcp-cli/experiments-and-series/).

### Example

In the showcase project, explore `reply_noninferior_mistral` on the working cases with the plan's size,
then confirm it once:

```bash
{{CLI_COMMAND}} series reply_noninferior_mistral
{{CLI_COMMAND}} series reply_noninferior_mistral --on holdout
```

The plan asks for 12 cases, and each half of the twelve-case dataset has fewer, so each series runs every
case of its half, and the launch plan warns that it is short of cases. The first command gives a `signal`
whatever the numbers say, and you can repeat it after every change to the revision step. The second
writes `experiments/reply_noninferior_mistral/findings/<series_id>.yaml` and regenerates `FINDINGS.md`,
unless the series ends `invalid`. If its spend reaches 90% of the project cap, the series pauses, and the
command exits with 3 and prints the Studio link. Once someone continues it there with a higher cap, the
series runs the rest, and Studio shows it live.

## See also

- [How to read a series](/engine/read-a-series/): what the verdict, the matrix and the cases mean, and what
  to do next.
- [How to write an experiment](/engine/experiments/): the file a series runs.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/): working and held-out
  cases, spend and approval.
- [CLI commands](/reference/cli/): every other command.
