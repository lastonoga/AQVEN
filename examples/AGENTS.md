<!-- aqven:begin 0.0.2 -->
# Rules for coding agents

`<package>` in this file is `lumen`, the aqven project root with `aqven.yaml`; every command takes it.
Engine: aqven 0.0.2. The `aqven` MCP server of `.mcp.json` and `.codex/config.toml` is connected here.

## Load the skill before you write

Skills of this engine version hold its facts. Load one before the first file of its kind; without skills, read
`.agents/skills/<skill>/SKILL.md`. Never learn the engine from memory, the web, compaction summaries or its source.

| Before you | Skill |
|---|---|
| start or resume a task that builds or improves a workflow | `running-the-engineering-loop` |
| write `flows/` or `experiments/<id>/nodes/`, `prompts/`, `flows/` | `building-flows` |
| decide what a step does when it fails | `hardening-flows` |
| write `types/` or an inference output | `designing-output-contracts` |
| write `agents/`, a provider in `aqven.yaml`, or an agent factor | `choosing-models` |
| touch photos, scans, PDFs, audio or video | `preparing-media-inputs` |
| write `datasets/` | `building-datasets` |
| write a hypothesis or a check | `analyzing-failures` |
| write `experiment.yaml` | `designing-experiments` |
| start, watch or read a series | `running-series` |
| look at anything that failed or hangs | `debugging-runs` |
| report progress or write `EXPERIMENTS.md` | `reporting-results` |

## Invariants

- The path is the identity: there is no `id:` key. Prompts are Markdown files; YAML carries no comments.
- Every shape is declared once under `types/`; `<package>/types.py` is generated, never edit it.
- Structure goes through `flow_patch`: add, remove, rename or move a node; rename a flow or an agent; delete an
  agent. One file goes through Edit or Write. Never `rm`, `mv`, `cp -r` or one regex over several project files;
  the two exceptions are in `building-flows`. On `STALE_FILE`, read the file again and repeat the change.
- `aqven check` passes after every change. Read the `prompt_preview` of every changed llm node in full.
- Never touch `.aqven/`, `experiments/*/findings/` or `FINDINGS.md`. Read `FINDINGS.md` and
  `<package>/EXPERIMENTS.md` before you design a change, and again after a compaction.
- No comments and no docstrings in project code, and never a docstring moved into a `#` line (`E_DOCSTRING`).
- Project Python reloads on the next run: a new step or check never needs a server restart.

## Working with the owner

- Restate an experiment's question in the owner's words and get a yes before you build it.
- Compared things are variants of one factor, measures are checks; correctness needs ground truth and a control.
- The models, providers and data the owner chose stay. If a check contradicts what runs show, report it as a
  likely engine bug; change the set only after the owner agrees.
- One run proves one case; a `dev` or provisional verdict proves nothing. Quote `verdict.text` as it is.
- Before a holdout series, say in one line what claim it tests, why now and what each verdict would mean.
- Lead a report with the result on real data and the change in points; synthetic tests only support it.
- When the owner asks to skip a stage, name its cost in one line and let him choose.
- Working autonomously, go on through cheap in-scope steps; at the experiment count the owner allowed, stop,
  report and update `EXPERIMENTS.md`. Report what you promised and dropped; try a dependency with `uv run --with`.

## Spend, series and the server

- Never raise `research.spend_cap_usd` in `aqven.yaml` to get past a pause; set it only to a number the owner
  names. A series paused at 90% of its cap waits for a person in Studio: report the spend and wait.
- Never cut repeats, cases or variants to fit the cap. Never cancel over 429: the engine pauses that model.
- Wait for a series in the background: `uv run aqven series` as a background command, or `series_get` with
  `wait_seconds`; say so in one line. Never poll with `sleep` or raw HTTP. Do not edit the project while it runs;
  cancel only a series the owner asked you to cancel.
- Never start, stop, kill or restart the project server. Use the `aqven` MCP tools, not raw HTTP calls.
- Keys live in Studio settings or `<package>/.env`. If your host blocks `.env`, do not retry: use the MCP tools.

## Commands

| Command | What it does |
|---|---|
| `uv run aqven check <package>` | static check plus a simulated run of every flow |
| `uv run aqven prompt preview <flow>.<node> --project <package>` | the exact messages an llm node sends |
| `uv run aqven models check <agent> --project <package> --live` | output modes each model really supports |
| `uv run aqven models shapes <agent> --project <package> --live` | how deep and wide an output a model holds |
| `uv run aqven tree <package>`, `uv run aqven refs <kind>:<id> <package>` | entities and who uses them |
| `uv run aqven series <experiment> --path <package> --on dev` | start a series and wait for its verdict |
| `uv run aqven skills sync <package>` | refresh skills and this block after an engine upgrade |

<!-- aqven:end -->

## Owner's rules

Your rules: language, providers and models, what never changes without asking. `aqven skills sync` keeps them.
