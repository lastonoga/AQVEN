# Agent skill evals

These cases measure whether the `aqven` skills change what a coding agent does. Each case is a short task with
graders, run by `claude plugin eval` of the CLI bundled with `claude-agent-sdk` (2.1.274). The CLI in `PATH` (2.1.221)
lacks mocks, `-j`, `--no-publish` and `--trust-plugin`, so never use it here.

The suite runs by hand before a release that changes skills, not in CI: every run is a full Claude session on the
owner's credentials.

There are two suites. `tools/build_eval_plugin.py --suite` picks one, and each suite builds its own wrappers, so one
suite never blocks the other:

| Suite | Folder | Question | Status |
|---|---|---|---|
| `triggers` | `triggers/` | does the right skill fire first on a realistic request | **ready**: 24 cases, 2 per skill; the main check for now |
| `cases` | `cases/`, `mocks/`, `fixtures/` | does the agent behave better with the skills | **draft**: see below |

> **Draft.** The behaviour cases under `cases/` are half-written on purpose: the owner stopped that stage on
> 2026-09-25, and it is the next stage. Only `aggregation-as-variants` and `pause-not-design` were checked to load.
> Do not finish, fix or delete the others as a side task, and do not read their scores as results.
> `mise run evals:skills` builds and runs them anyway; the trigger suite leaves `cases/` out.

## Skill trigger test

Each case of `triggers/` is one short user request in a generic domain (support tickets, invoices, contracts, product
photos, meeting audio, code review) that should make the agent load exactly one skill. The run has the core
`AGENTS.md`, the Studio host block and the 12 skills, as setup C below, in an empty working folder: no fixture, no
scaffold, no MCP mocks, so the `aqven` server does not start and its tools do not exist. The agent may use only
`Skill`, `Read`, `Glob` and `Grep`, and it stops after 4 turns: the skill has to fire at the start.

| Command | What it does |
|---|---|
| `mise run evals:skills:triggers` | checks the cases, builds `build/eval-plugin-triggers`, runs every case 3 times |
| `bash evals/agent-skills/triggers/run.sh --build-only` | checks and builds, runs nothing |
| `bash evals/agent-skills/triggers/run.sh --case "building-flows--*" --runs 1` | other `plugin eval` options pass through |
| `uv run --frozen python evals/agent-skills/triggers/check_triggers.py` | checks every case against the skills of the plugin |
| `uv run --frozen python evals/agent-skills/triggers/check_triggers.py --write` | renders the graders again, after a skill is added or renamed |

`run.sh` uses `claude-haiku-4-5`, `--ablation none`, `-j 2` and `--max-cost-usd 5`, without `--scaffold` or
`--allow-tools`. Results land in `build/eval-plugin-triggers/results.json` and
`build/eval-plugin-triggers/evals/results/<timestamp>/`. Check that the cases load without spending by running the
bundled CLI on the built wrapper with `--ablation none --trust-plugin --no-publish --max-cost-usd 0`; every case then
prints a notice that the `aqven` server has no mock and is not started, which is expected here.

A case is `triggers/<skill>--<scenario>/`: the part before `--` is the expected skill.

- `prompt.md`: `description`, `tags` (exactly `"trigger"` and the skill name, so `--tag <skill>` runs one skill),
  `runs: 3`, `max_turns: 4`, `timeout_seconds: 180`, `allowed_tools`, and the request as the body. The request never
  asks the agent to write a file.
- `graders/skill-fired.md` (weight 2): `tool_used` `Skill` whose input names the skill, with or without the `aqven:`
  prefix.
- `graders/no-other-skill-first.md` (weight 1): `regex` over `trace`, `not_contains`: no other `aqven` skill is invoked
  before the expected one. Built-in skills of the CLI do not count.

`check_triggers.py --write` renders both graders from the folder name and the skill list, so never edit them by hand.
The check fails when a case names a skill the plugin lacks, a skill has fewer than 2 cases, a front matter key is
unknown, a value holds `---`, a tool beyond `Skill`, `Read`, `Glob`, `Grep`, `TodoWrite` is allowed, or a grader is
stale.

Reading a run's score: 1 means the expected skill fired and no other `aqven` skill came before it; 0.67 means it
fired after another `aqven` skill; 0.33 means it never fired. Pass: every case at 1 in 3 runs of 3. Under
`--ablation with-without` the `Skill` grader turns into an unscored indicator, so this suite always runs with `none`.

Limits of the graders:

- `no-other-skill-first` fails only when another skill comes before *some* call of the expected one. A run that loads
  the expected skill, then another, then the expected one again is also read as "another came first". Reloading a
  skill is rare; read the trace when a case scores 0.67.
- The empty working folder is on purpose: the request carries everything the choice of a skill needs. An agent that
  explores the folder first still has turns left for the skill.

## Three setups

`tools/build_eval_plugin.py` builds three wrappers under `build/`. All of them are named `aqven`, carry the same
cases and declare the `aqven` MCP server, so tool names are the same everywhere.

| Setup | Wrapper | In context | Ablation |
|---|---|---|---|
| A. Before skills | `build/eval-plugin-template` | the frozen 40 KB `AGENTS.md` of the showcase template, `baseline/AGENTS.md.tmpl` | `none` |
| B. Core only | `build/eval-plugin-core` | the core `AGENTS.md` of `agent_plugin/project/` and the Studio host block | `none` |
| C. Core and skills | `build/eval-plugin` | B plus the 12 skills | `with-without` |

The wrapper writes the system text of its setup into `append_system_prompt` of every case, before the case's own
text. In A and B it drops the `tool_used: Skill` graders. Pass criteria: C scores at least 0.67 on every case, C beats
B by at least +0.25 over the suite and on 80% of the cases, C is never worse than A and beats it by +0.3 over the
suite, and in C the expected skill fires in 3 runs of 3.

## Running

| Command | What it does |
|---|---|
| `mise run evals:skills` | builds the fixtures and the three wrappers, then runs every case in each |
| `mise run evals:skills:core` | the same with `--tag core` |
| `bash evals/agent-skills/run.sh --build-only` | builds everything and runs no case |
| `bash evals/agent-skills/run.sh --case <glob>` | any other `plugin eval` option is passed through |
| `SKILL_EVAL_SETUPS="eval-plugin" bash evals/agent-skills/run.sh` | only the named wrappers |

`run.sh` uses `claude-haiku-4-5` for the agent and the judge, `-j 2`, `--max-cost-usd 20` per wrapper, `--scaffold`
and `--allow-tools Write Edit Bash`. Results land in `build/<wrapper>/results.json` and
`build/<wrapper>/evals/results/<timestamp>/`.

**Check a case without spending.** After `run.sh --build-only`, run the bundled CLI on a wrapper with
`--max-cost-usd 0`. The CLI loads and validates every case, grader and mock, prepares the mocks, then stops before the
first run because the ceiling is already reached:

```bash
.venv/lib/python3.14/site-packages/claude_agent_sdk/_bundled/claude plugin eval build/eval-plugin \
  --scaffold --allow-tools Write Edit Bash --trust-plugin --no-publish --max-cost-usd 0 --case <name>
```

A case that fails to load prints `✗ <path>: <reason>`. Run it from a terminal, not from inside a Claude Code session,
or unset the `CLAUDECODE` and `CLAUDE_CODE_*` variables first.

## Layout

```text
evals/agent-skills/
  README.md
  run.sh                      builds and runs the three setups
  mcp_tools.py                writes mocks/aqven/_tools.json from the real MCP catalogue; --check
  check_mocks.py              validates every fixed mock body against the tool's real output model
  host_block.py               writes the Studio host block for Claude that setups B and C carry
  baseline/AGENTS.md.tmpl     setup A: the showcase AGENTS.md as it was before skills, frozen
  fixtures/
    make_fixture.py           copies examples/lumen into lumen_trimmed/lumen/ (generated, git-ignored)
    make_images.py            PEP 723 script with Pillow: writes media/ (generated, git-ignored)
    stage.sh                  the shared scaffold: stages the project into the run's working folder
  mocks/aqven/_tools.json     tool listing shared by every case
  cases/<case>/               one folder per behaviour case (draft)
  triggers/
    run.sh                    checks, builds and runs the trigger suite
    check_triggers.py         checks the trigger cases; --write renders their graders
    <skill>--<scenario>/      one folder per trigger case
```

## The fixture

Every case runs in an empty working folder with a throwaway home. Its `scaffold.sh` calls `fixtures/stage.sh`, which
copies `fixtures/lumen_trimmed/lumen/` into that folder, so **the working folder is the package folder**: `aqven.yaml`,
`flows/`, `experiments/` and the rest sit at its top, the way the Studio chat sees a project. Write every path in a
prompt or a grader relative to it: `experiments/panel_merge_rule/experiment.yaml`, never `lumen/experiments/...`.

- `lumen_trimmed` is `examples/lumen` without the server entry points (`app.py`, `__main__.py`), the sample binaries
  (`samples/`), `.env.example` and caches. It passes `aqven check --static` with no diagnostics. It is regenerated on
  every build, so it follows Lumen.
- `media` holds one neutral image: `receipt_photo.jpg`, a shop receipt stored 3088×2316 with EXIF orientation 6
  (upright 2316×3088), and `receipt_photo.boxes.json`, the box of its totals block in the upright frame. Pass
  `media` to `stage.sh` and both land in `inbox/`:
  `exec bash "$here/../../fixtures/stage.sh" "$here" media`.
- **Overlay.** Files under `<case>/overlay/` are copied over the staged project last, keeping their paths. Use it for
  what one case needs: an `EXPERIMENTS.md`, a broken check, a changed agent, a series summary to read.

The eval sandbox has no `aqven` and no provider keys, and Bash runs confined. A case never depends on a command
succeeding; it grades what the agent decides, writes and calls.

## Case format

A case is a folder `cases/<name>/`; the folder name is the case name.

```text
cases/<name>/
  case.yaml         schema_version, name, context.scaffold_script; nothing else
  scaffold.sh       stages the fixture
  prompt.md         front matter and the user's message
  graders/*.md      one file per grader
  overlay/          optional files copied over the fixture
  mocks/aqven/      level 2 only: responders of the aqven MCP tools
```

`case.yaml` exists because `context` (the scaffold, `add_dirs`, `history_file`) is read only from `case.yaml`. The CLI
merges it with `prompt.md` and `graders/`:

```yaml
schema_version: "1.0"
name: "<name>"
context:
  scaffold_script: "scaffold.sh"
```

`scaffold.sh` is the same three lines in every case; add `media` after `"$here"` to stage the image:

```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/../../fixtures/stage.sh" "$here"
```

### `prompt.md`

The body is the user's message, written the way an owner would type it. The front matter takes only these keys; any
other key fails the case:

| Key | Use |
|---|---|
| `description` | the lesson in one sentence |
| `tags` | `core` when the case gates a release, plus exactly one group tag: `group-a` … `group-d` |
| `runs` | 3 |
| `max_turns`, `timeout_seconds` | 20–30 turns, 300–600 s |
| `allowed_tools` | always `Read`, `Glob`, `Grep`, `Skill`, `TodoWrite`; add `Write`, `Edit`, `Bash` only when the case needs them |
| `append_system_prompt` | only for text that belongs to the case, such as a compaction summary; the wrapper puts the setup's text first |
| `schema_version`, `name`, `plugins`, `expected_outcome`, `model`, `env`, `artifact_publish`, `growthbook_overrides` | not used here |

Write lists in block style with double-quoted strings. **Never put `---` anywhere in a front matter value**: the CLI
ends the front matter at the first `---` it meets, even in the middle of a line.

Mocked MCP tools are allowed automatically; never list them. `Write`, `Edit` and `Bash` need both the case's
`allowed_tools` and the operator grant `--allow-tools` that `run.sh` passes.

### `graders/*.md`

The file name is the grader name. The front matter holds `type` and its fields, and optionally `weight` (default 1).
For `regex` the body is the pattern; for `llm` and `baseline` the body is the criteria.

| `type` | Fields | Checks |
|---|---|---|
| `regex` | `target`, `match` (`contains`, `not_contains`, `count:N`), `flags` (JavaScript) | the pattern against the target |
| `tool_used` | `tool`, `input_match` (regex over the input JSON), `min`, `max` | how often a tool was called |
| `tool_order` | `before`, `after` (each a tool name or `{tool, input_match}`) | that one call came before the other |
| `file_exists` | `path` (glob, `*` stays in one folder, `**/` crosses them), `exists` | a file the run created |
| `llm` | `focus` (same values as `target`) | a Haiku judge, three votes, on the criteria |
| `baseline` | `baseline_file`, `criteria` | a comparison with a reference answer |

What each `target` holds, read from the CLI:

| `target` | Text |
|---|---|
| `last_message` (default) | the agent's last answer |
| `trace` | the whole transcript, one JSON object per line: tool calls with their inputs and results |
| `files` | **only the paths** of the files the run created, one per line; neither their contents nor edited files |
| `{source: "file", path: "<path>"}` | the content of one file of the working folder at the end of the run; no glob |
| `mock_calls` | the calls the mocks answered, with inputs and outputs |

So a grader over the content of a new file needs its exact path: the prompt names the id (`Call the experiment
tally_merge_rule`) and the grader reads `experiments/tally_merge_rule/experiment.yaml`. A file that must stay as it
was is checked the same way, with a pattern its original text matches. A missing file fails the grader.

Tool names inside a run are `mcp__plugin_aqven_aqven__<tool>`. The skill indicator is
`tool_used` with `tool: "Skill"` and `input_match: "<skill name>"`; under `with-without` it is reported but not scored,
and the wrapper drops it in setups A and B. Name the skill the case is about, one indicator per case.

Prefer free graders (`regex`, `tool_used`, `tool_order`, `file_exists`) for facts and one `llm` grader, weight 3, for
judgement. Every `llm` criteria text says what passes and what fails.

### Level 1 and level 2

**Level 1** has no MCP: judgement and the files the agent writes. It has no `mocks/`, so the `aqven` server is not
started and its tools do not exist in the run.

**Level 2** mocks the `aqven` MCP server with fixed responders in `<case>/mocks/aqven/<tool>.md`. The CLI layers
`mocks/` folders from the eval folder down to the case: `mocks/aqven/_tools.json` at the top gives every tool its real
schema and description, and the case's responders answer. **Only tools with a responder exist in the run**; give one
to every tool the agent should be able to call, including the ones it must not call (`series_cancel` when the lesson
is not to cancel).

A responder file:

```markdown
---
expect:
  series_id: "0199a1c4-7e2b-7c3d-9a10-3b4c5d6e7f80"
---
{"series": {"series_id": "{{input.series_id}}", "status": "awaiting_approval", ...}, "cases": null, "hidden_cases": 0}
```

| Front matter key | Meaning |
|---|---|
| `type` | `fixed` (default): the body is the answer. `agent`: a model plays the tool from the body's description, which costs calls; avoid it |
| `expect` | arguments the call must carry; a mismatch aborts the run |
| `error` | `true`: the body is an error answer, an `ApiError` (`op`, `code`, `message`, …) |
| `tools`, `abort_when` | for `agent` responders and `_server.md` only |

The body is the JSON of the tool's real output model. `{{input.<argument>}}` echoes an argument of the call. A
responder gives the same answer on every call; a case that needs two different snapshots of one tool is out of reach
of fixed responders. `uv run --frozen python evals/agent-skills/check_mocks.py` validates every fixed body against the
output model (or `ApiError`) and every `expect` key against the tool's arguments; `run.sh` runs it before a build.
When the MCP tools change, regenerate the listing with `uv run --frozen python evals/agent-skills/mcp_tools.py`.

## Rules for case content

- **General lessons, generic domains.** A case teaches a general mistake. Use Lumen (support cases, the judge panel,
  the critic, the intent ballots) or a plainly generic domain: invoices and receipts, support tickets, product
  catalogue images, meeting audio, contracts, code review. Never a word of one owner's project; the list of banned
  words is `OWNER_DOMAIN` in `tools/check_skills.py`, and the same guard applies here.
- **Current engine vocabulary (ADR-0056).** One factor per experiment, `varies.what` is `agent`, `prompt`, `use` or
  `flow`; compared things are variants, measures are checks; local flows in `experiments/<id>/flows/`, alternatives in
  `nodes/`, prompts in `prompts/`. Never `arm`, `arms/`, `subject.arm`, `series_estimate`, `usd_source` or an agent
  `capabilities:` key, except in a negative grader that fails on them.
- **Truth over the design doc.** Every command, MCP tool, argument, YAML key, status and diagnostic code in a prompt,
  a mock or a grader exists in the code now: `console/` for commands, `server/mcp/` for tools, `diagnostics.py` for
  codes, `spec/` for keys, `series/` for statuses and outcomes. When the design names something that does not exist,
  write the case with what does and say so.
- **English**, in prompts, graders and mocks.
- **Name cases by the lesson**, in kebab-case: `pause-not-design`, not the incident it came from.

## Cases to write (draft, next stage)

This stage is stopped: the folders under `cases/` are drafts, see the note at the top. Four writers, one group each.
`core` marks the cases that gate a release. Paths are relative to the staged project. The two cases checked to load
are marked **done**.

### Group A: experiments and reporting (`group-a`)

| Case | Level | Lesson | Prompt and setup | Graders |
|---|---|---|---|---|
| `aggregation-as-variants` (core) **done** | 1 | ways of merging are variants of a `use` factor, not checks | compare three merge rules for `tally` in `support_case`; name the experiment | `experiment.yaml` has `what: "use"` on `tally`; alternatives under `experiments/tally_merge_rule/nodes/`; no `arms`; `llm` on the file and the answer |
| `validity-inputs` | 1 | the experiment's subject must see what production sees | a hypothesis about how `drafts` handles long multi-intent messages, while production feeds it `$triage.out.summary`; overlay: a draft experiment on the raw message | `llm`: names the mismatch, restates the question and asks for a yes before writing |
| `check-measures-the-claim` | 1 | a check measures the labelled property, not "returned something" | overlay: a critic experiment whose check passes whenever the critic flags anything; ask whether recall grows as planted defects get subtler | `llm`: the check must match the planted defect of the case (its tag or `expected_output`), and a rate over part of the cases is its own experiment selected with `cases.tags`; `regex` on `trace`: no `curl`, no script in `/tmp` |
| `confound-listed` | 1 | a label that also chooses the instructions confounds the result | overlay: an experiment on `revise` where the `lamp_guide` variant slot is chosen by the same product category the check scores | `llm`: names the confound and proposes holding the slot fixed or balancing it |
| `same-population` | 1 | dev and confirmation cases come from one population | overlay: a holdout dataset full of long multi-intent messages that dev never had | `llm`: names the population gap before any series |
| `compaction-summary` | 1 | files outlive a compaction summary | `append_system_prompt` carries a summary claiming "a new .py needs a server restart" and "the critic check is useless"; overlay `EXPERIMENTS.md` refutes the second | `tool_used` `Read` with `input_match: "EXPERIMENTS.md"`; `llm`: does not rely on either claim |
| `ten-then-report` | 2 | at the experiment count the owner allowed, stop and report | "run at most 3 experiments, then call me"; mocks: `series_start`, `series_get` done | `tool_used` `series_start` `max: 3`; `file_exists` `EXPERIMENTS.md`; `llm`: stops and reports |
| `lay-summary-real-data` (core) | 1 | lead with real data and the change in points with n | overlay `EXPERIMENTS.md` with real and synthetic results; "2–3 sentences for someone outside the project" | `llm`: the first sentence is the real-data result with the change in points and n; synthetic results only after |

### Group B: series and failure analysis (`group-b`)

| Case | Level | Lesson | Prompt and setup | Graders |
|---|---|---|---|---|
| `pause-not-design` (core) **done** | 2 | a series paused near its cap waits for the owner | a series "not moving"; mocks: `series_get` in `awaiting_approval` with `pause.reason: "spend_near_cap"`, `series_cancel` | `series_get` called; `series_cancel` never; `aqven.yaml` cap and the experiment plan unchanged; no raw HTTP; `llm` on the answer |
| `holdout-invalid-infra` (core) | 2 | an invalid verdict from infrastructure errors is fixed at the cause, not the threshold | mocks: `series_get` done, verdict `invalid`, many attempts with upstream 429 in their errors; overlay: `qwen` with `provider_options` `allow_fallbacks: false` | `llm`: cause is the disabled fallbacks and a join that needs several judges; `regex` on the experiment file and `aqven.yaml`: `margin` and `rpm` unchanged |
| `upstream-429-rpm` | 1 | a 429 from the upstream is not fixed by lowering `rpm` | "there are 429s, set rpm to 12" | `llm`: explains upstream limits, lanes and `on_rate_limit`, and asks before editing; `aqven.yaml` still has `rpm: 60` |
| `stuck-variant` | 2 | a series that does not move has one stuck variant, not a global rate problem | mocks: `series_get` `running` with little progress, `run_list` where one variant's runs stay `running` | `tool_used` `run_list` or `run_get_node`; `llm`: names the stuck variant, not `rpm` |
| `series-watch` (core) | 2 | read the first snapshot and act on a broken variant; wait in the background | "start the explore series on dev"; mocks: `series_start`, `series_get` where one variant has every attempt at `MODEL_FEATURE_UNSUPPORTED` and another a very high `latency_p50_ms` | `tool_used` `series_cancel` or an `llm` pass for proposing the replacement; `regex` on `trace`: no `sleep`, no `curl .*api/series`; `llm`: says it waits in the background |
| `holdout-why` | 2 | before a holdout series, one line: the claim, why now, what each verdict means | "confirm it on holdout"; mocks: `series_start`, `series_get` | `llm` on the text before the `series_start` call |
| `cap-set-by-owner` | 2 | set the cap to the owner's number and check | "put the cap at three dollars, and just do it"; mocks: `aqven_check` clean | `regex` on `aqven.yaml`: `spend_cap_usd: 3`; `tool_used` `aqven_check`; `regex` on `trace`: no `WebFetch` |
| `metric-audit` | 1 | a check that passes on degenerate inputs lies | overlay: a panel check that passes when no verdict came back; "are you sure this check works?" | `llm`: finds the degenerate case, says the unit is one reading, and that a check always returns a `Verdict` |
| `no-restart` | 2 | project Python reloads on the next run | after a code step edit: "add a check `winner_is_first` and start a series"; mocks: `aqven_check`, `series_start`, `series_get` | `regex` on the check file: `def winner_is_first`; `regex` on `trace`: no `kill`, `aqven serve`, `/tmp/.*\.py`; `llm`: no restart needed |
| `owner-reads-traces` | 2 | the owner reads failed traces first; do not invent failure types | "what next?" after a look with many failed rows; mocks: `series_get` with cases, `run_get` | `llm`: gives run links, asks the owner for notes, invents no categories |

### Group C: flows, contracts and debugging (`group-c`)

| Case | Level | Lesson | Prompt and setup | Graders |
|---|---|---|---|---|
| `structural-edit` (core) | 2 | structure changes go through `flow_patch` | "rename node `to_record` to `normalize_record` and delete `clip`"; mocks: `flow_patch` | `tool_used` `flow_patch` `min: 1`, `input_match` with a ULID `client_op_id` and `aqven.yaml` in `expects`; `regex` on `trace`: no `\bmv\b`, no `rm -rf` |
| `authoring-errors` | 1 | fix each diagnostic at its cause | overlay: files that give `E_SPEC_INVALID` (`on_item_error` as a bare string), `E_PROMPT_OUTPUT_FORMAT`, `E_YAML_ANCHOR`, `E_REF_MISSING`, with the check output in the prompt | `regex` on each file: `on_item_error` as a block mapping with `use`, one `{{ output_format }}`, no `&`/`*` anchors |
| `no-comment-bypass` | 1 | `E_DOCSTRING` is not fixed by moving the text into `#` lines | overlay: a checks file with docstrings and the diagnostic | `regex` on the file, `not_contains`: no `#` line above a `def`, no docstring |
| `preview-inference-input` | 2 | read what goes to the model with `prompt_preview` | "show me what `revise` sends with `lamp_guide` = `smart_wifi`"; mocks: `prompt_preview` | `tool_used` `prompt_preview` with `flow_id`, `node_id`, `variants` |
| `prompt-per-slot-variant` | 1 | per-kind prompt text is a variant slot, not a prompt built in Python | "a different instruction per channel for `triage`" | `regex` on the inference file: `variants:`, `on:`, `cases:`, `default:`; on the prompt: `{{ variants.`; no prompt text in `.py` |
| `flat-over-nested` | 1 | read the parts of an input with a flat `map`, not a nested flow per part | "process every attachment of a case separately, and I want to see each in the run" | `regex` on `trace`, `not_contains`: a written `node: \"call\"` (the trace is JSON, so quotes are escaped); `llm`: ids name role and kind |
| `display-cards` | 1 | display templates are declared by an llm step's inference (`display`) | "show the ballots as cards in Studio instead of JSON" | `file_exists` of a `*.output.display.liquid` next to the ballot inference; `llm` |
| `schema-rejected` | 1 | repeated `OUTPUT_SCHEMA_REJECTED` means the output is too big or deep for the model | overlay: a series summary with many `OUTPUT_SCHEMA_REJECTED` on a judge; "the series is invalid, fix it" | `llm`: reduce the state space, bound lists, `models shapes`, do not just repeat; `regex` on `trace`: no `sed -i` |
| `tool-to-prompted` | 1 | `MODEL_SCHEMA_MISMATCH` with a passing probe: try `prompted` and measure | overlay: errors `MODEL_SCHEMA_MISMATCH: … Field required` on a judge whose probe passed | `regex` on the agent file: `mode: "prompted"`; `llm`: measure `schema_valid_first_try`, do not swap the model first |
| `missing-is-not-no` | 1 | a missing answer is unknown, not "no" | overlay: a code step that reads a missing field as `false` | `llm`: an unknown state, required fields, a completeness check |
| `quorum-is-race` | 1 | `quorum` takes the first answers, so a slow judge never counts | overlay: the panel with `join: run: "quorum"`, `min_ok: 2`; "why is llama never in the verdicts?" | `llm`: explains the race; proposes a join that waits for all with fallbacks, or reporting who answered |
| `debug-truncation` | 2 | read the node, not the whole run | "some model errors in run X"; mocks: `run_get` with a very long payload, `run_get_node` whose error is `truncated: finish_reason=length max_tokens=…` | `tool_used` `run_get_node` `min: 1`; `llm`: the diagnosis is `max_tokens` |

### Group D: models, media, datasets and the engineering loop (`group-d`)

| Case | Level | Lesson | Prompt and setup | Graders |
|---|---|---|---|---|
| `media-first-design` (core) | 1 | media first: orientation, native resolution, region crops, the simplest shape | stage `media`; "I want to read totals from receipt photos like `inbox/receipt_photo.jpg`; do not write files, propose the input and its preparation" | `llm`: EXIF orientation applied, a native-resolution crop of the totals block as `Image`, one message; `regex` with `flags: "i"`: `exif\|orientation` |
| `cheap-vision-model` (core) | 1 | choose a cheap vision model from the catalogue and prove it on an image | stage `media`; overlay: a saved OpenRouter catalogue and endpoints; "a cheap model that reads the totals block, no frontier models" | `llm`: filters on `input_modalities`, price, reasoning, endpoints; `provider_options`; a fallback; `models check --live` and one run with the image; `regex` on the new agent: no `capabilities:` |
| `synthetic-case-has-property` | 1 | a synthetic case must have the property it is labelled with | overlay: a "blurry receipt" generator that only darkens the whole image | `llm`: names the mismatch before any run; proposes blur where the text is, on a clean base |
| `agreement-is-not-accuracy` (core) | 1 | agreement between runs is reproducibility, not correctness | "pick the judge model by how stable its answers are" | `llm`: asks for ground truth and a negative control |
| `models-on-real-labels` | 1 | compare models on real labelled cases with a control | "which cheap judge is really better?"; `planted_defect_replies` (synthetic) and `judge_panel_cases` (real winners) | `regex` on the new experiment: `what: "agent"`, the real dataset; `llm`: clean replies as the negative control |
| `live-probe-before-series` | 2 | probe a new model live before a series | overlay: a new agent in an agent factor; "go"; mocks: `series_start`, `series_get` | `tool_order`: `Bash` with `models check .* --live` before `series_start` |
| `check-contradicts-evidence` (core) | 1 | a check that contradicts many good runs is reported as a likely engine bug | overlay: `E_MODALITY_UNSUPPORTED` on an agent next to a series of passing image runs | `llm`: reports it and keeps the owner's models; `regex` on `trace`: no `Edit`/`Write` under `agents/` |
| `stage-metric` | 1 | a stage that proposes candidates is measured by recall | "put a threshold on the ballots"; overlay `EXPERIMENTS.md` names recall as the goal | `llm`: recall of the proposing stage is primary, precision belongs to the next stage |
| `split-thins-graded-series` | 1 | a dev/holdout split can empty the levels of a graded series | overlay: a dataset of 8 levels, one case each, split 50/50 | `llm`: doubles the cases or stratifies by level, counts level × split |
| `skip-stage` | 1 | a skipped stage has a cost; the owner decides | "go straight to experiments, skip reading traces" | `llm`: one line on the cost, the choice left to the owner |
