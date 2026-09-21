---
title: How to run a flow without a server
description: Every run flag beyond the quickstart basics — context, targeting a flow, JSON events, cassette replay, human answers — and what each exit code means.
---

# How to run a flow without a server

## When you need this

[Quickstart](/start/quickstart/) already creates a project and calls `{{CLI_COMMAND}} run` once with
`--input` and `--context`. This page is the deeper reference: every other flag `run` accepts, what a
flow actually requires from `--context` and where that requirement comes from, how to target one flow
out of several, and what each of `run`'s exit codes means.

## Steps

- `{{CLI_COMMAND}} run FLOW_ID --input FILE_JSON` is the only required shape. `FLOW_ID` is a flow's id
  the way [`tree`](/engine/inspect-project/) lists it, not a file path — a project with more than one
  flow needs the right one named explicitly. Naming one that isn't there fails immediately: `flow
  no_such_flow is not in the project`.
- `--root` points `run` straight at a project without `cd`-ing into it first. Left out, `run` searches
  upward from the current directory for `aqven.yaml`, the same rule every other command follows.
- `--context KEY=VALUE` is repeatable and only accepts four keys: `date`, `time_zone`, `locale`,
  `tenant_id` — one shared shape across every flow. A given flow only needs the ones its nodes actually
  bind; `tree` prints exactly which on the flow's own row, as `run context: date, tenant_id`. Leave one
  of those out and `run` refuses to start the flow at all, naming what's missing rather than guessing a
  default — the engine invents nothing. Extra keys beyond what a flow needs are accepted and simply
  unused.
- `--format text` (the default) prints one line per event, the style [quickstart](/start/quickstart/)
  shows. `--format json` prints the same events as newline-delimited JSON instead — one compact object
  per line, in order, each carrying a `seq`, a timestamp, and a `type` that names the rest of its
  fields. Reach for it when something downstream is going to parse the stream, rather than a person
  reading it live.
- `--human-answers FILE_JSON` is a list of scripted answers for the flow's `human` nodes, each one
  naming the node's address, the attempt it answers, and a payload shaped like that node's `form` type
  — see [how to pause for a person](/engine/human-node/) for what `form` means and what a payload has
  to match. Without it, a run that reaches an open human wait suspends instead of continuing. The
  showcase project ships one of these files already, at `samples/answers.json`.
- `--cassettes DIR` replays or records model calls against a directory instead of always calling the
  real provider, and `--cassette-mode` picks how: `replay_strict` (the default once `--cassettes` is
  set) only ever replays — a call with no matching recording is a hard error naming the exact key, and
  it never falls back to a live call. `record` always calls live and (re)writes what it gets, ignoring
  anything already recorded. `record_new` replays whatever's already there and records only what
  isn't, so a rerun doesn't spend tokens on calls it's already captured. A `replay_strict` run against a
  directory that actually has the matching recordings never touches the network or needs an API key at
  all — the cassette lookup happens before the code path that would ask for one.
- `--data-dir` points at the same local data directory `dev`, `studio`, and `serve` use — the default is
  one shared location per machine. You only need to pass it if you deliberately keep more than one.
- Exit codes: `0` when the run completes, `1` when it fails — a bad `--input` file, a `--context` value
  the run's shape doesn't accept, a project that won't load, or the flow itself failing partway through
  all land here. `2` is a plain command-line mistake: a missing required flag or a malformed value,
  caught before anything runs. `3` means the run suspended waiting on a human answer it wasn't given.
- `run` always starts a brand-new run — there's no flag that resumes an existing run id, and running the
  same command again is a fresh attempt, not a retry of the last one. A run that suspends doesn't die
  when the CLI process exits: it stays open and gets answered through the project server or its MCP
  tools, not by running `run` again — see [`run_resume`](/reference/project-mcp-tools/). If you already
  know every answer a flow's human nodes will need, pass them up front with `--human-answers` so the run
  never has to suspend in the first place.

### Example

Create the showcase project if you don't already have one, same as quickstart:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

Save the same `case.json` as [quickstart's run step](/start/quickstart/) into this folder before trying
the commands below.

Leave out `--context` entirely and `run` tells you exactly what `support_case` needs, before it does
anything else:

```bash
{{CLI_COMMAND}} run support_case --input case.json
```

```text
CONTEXT_MISSING: flow support_case needs run context keys: date, tenant_id; pass them in context, the engine invents none
```

With both keys supplied, `--root` (so there's no need to already be inside the project) and
`--format json` together, this is the real output on a fresh showcase project with no API key set:

```bash
{{CLI_COMMAND}} run support_case --root my_project/my_project --input my_project/my_project/case.json \
  --context date=2026-09-21 --context tenant_id=demo --format json
```

```text
run 01a0c58c-4491-709c-be6d-395c955d6318
{"seq":2,"at":"2026-09-21T19:58:19.312140Z","run_id":"01a0c58c-4491-709c-be6d-395c955d6318","type":"node_started","address":{"node_id":"prepare","branch_key":null,"iteration":null,"item_index":null},"kind":"code","attempt":1,"queued_ms":0}
{"seq":4,"at":"2026-09-21T19:58:19.334206Z","run_id":"01a0c58c-4491-709c-be6d-395c955d6318","type":"node_started","address":{"node_id":"triage","branch_key":null,"iteration":null,"item_index":null},"kind":"llm","attempt":1,"queued_ms":0}
```

Each line stands alone as JSON — `node_started`, `node_finished`, `run_finished`, and the rest all share
`seq`, `at`, `run_id`, and `type`, then add whatever fields that event type carries. The run's last line,
pretty-printed here for readability, is the same failure quickstart shows in text form — no
`OPENROUTER_API_KEY` was set for this page either:

```json
{
  "seq": 7,
  "at": "2026-09-21T19:58:19.343777Z",
  "run_id": "01a0c58c-4491-709c-be6d-395c955d6318",
  "type": "run_finished",
  "status": "failed",
  "output_ref": null,
  "error": {
    "code": "provider_key_missing",
    "message": "no API key for provider openrouter (openrouter:google/gemini-2.5-flash-lite): set OPENROUTER_API_KEY in the project .env or the environment",
    "address": { "node_id": "triage", "branch_key": null, "iteration": null, "item_index": null },
    "hint": null,
    "details": null
  },
  "cost_usd": "0",
  "tokens_in": 0,
  "tokens_out": 0
}
```

That command exits `1` — check with `echo $?` right after it. Run the same command without `--context`
and it exits `1` too, but for the `CONTEXT_MISSING` reason above instead of a run that actually started.

The showcase project defines a second flow, `judge_panel`, and targeting it is just naming it instead.
Its input has nothing to do with `support_case`'s — save this as `panel_request.json`, shaped like its
own `PanelRequest` type:

```json
{
  "summary": "Customer's light strip controller overheats after ten minutes of use.",
  "candidates": [
    { "text": "Please unplug the controller and check for a firmware update before reconnecting.", "citations": [] },
    { "text": "We are sorry about the overheating. This unit qualifies for a warranty replacement.", "citations": [] }
  ],
  "chunks": [
    {
      "chunk_id": "kb_0000000001",
      "title": "Controller overheating troubleshooting",
      "text": "If the controller overheats, check for firmware updates and confirm the strip length matches the controller rating."
    }
  ]
}
```

```bash
{{CLI_COMMAND}} run judge_panel --input panel_request.json
```

```text
run 01a0c58c-dfc6-71d9-a83b-a9080805b2f3
· run_started
▶ judges
▶ judges__deepseek[branch=deepseek]
· inference_input_captured
■ judges__deepseek[branch=deepseek] failed 1 ms provider_key_missing: no API key for provider openrouter (openrouter:deepseek/deepseek-v4-flash-0731): set OPENROUTER_API_KEY in the project .env or the environment
▶ judges__qwen[branch=qwen]
· inference_input_captured
■ judges__qwen[branch=qwen] failed 7 ms provider_key_missing: no API key for provider openrouter (openrouter:qwen/qwen3-30b-a3b-instruct-2507): set OPENROUTER_API_KEY in the project .env or the environment
▶ judges__llama[branch=llama]
· inference_input_captured
■ judges__llama[branch=llama] failed 4 ms provider_key_missing: no API key for provider openrouter (openrouter:meta-llama/llama-3.1-8b-instruct): set OPENROUTER_API_KEY in the project .env or the environment
■ judges failed 90 ms E_JOIN_FAILED: ответили судей: 0, а для решения нужно 2
● run failed E_JOIN_FAILED: ответили судей: 0, а для решения нужно 2 cost $0 tokens 0/0
```

`judges` is a [`parallel`](/engine/parallel-node/) node with three branches, and every event's address
now carries `[branch=deepseek]` and the rest — the same address shape shows `iteration=` inside a loop
and `item=` inside a map. `judges` needs two of its three branches to succeed and none did, so it fails
with `E_JOIN_FAILED` once all three have reported in — the showcase's own descriptions are in Russian,
same as its `human` node forms. Naming a flow that doesn't exist at all fails before any of this starts:

```bash
{{CLI_COMMAND}} run no_such_flow --input case.json
```

```text
flow no_such_flow is not in the project
```

Pointing `--cassettes` at an empty directory in `replay_strict` mode — the default once `--cassettes` is
set — shows the offline path: this run never asked for an API key at all, because the miss happens
before anything would.

```bash
mkdir empty_cassettes
{{CLI_COMMAND}} run support_case --input case.json --context date=2026-09-21 --context tenant_id=demo \
  --cassettes empty_cassettes
```

```text
run 01a0c58d-209b-7124-a653-c8b1318b63f2
· run_started
▶ prepare
■ prepare ok 17 ms
▶ triage
· inference_input_captured
■ triage failed 1204 ms cassette_miss: cassette miss: key sha256-ed27df74080edfd1e00de08d367cd1a021a31563ac8e6aa777ff0760e1efcc56 for model openrouter:google/gemini-2.5-flash-lite at {'address': {'node_id': 'triage', 'branch_key': None, 'iteration': None, 'item_index': None}, 'attempt': 1} is not recorded; replay_strict never falls back to a live call
● run failed cassette_miss: cassette miss: key sha256-ed27df74080edfd1e00de08d367cd1a021a31563ac8e6aa777ff0760e1efcc56 for model openrouter:google/gemini-2.5-flash-lite at {'address': {'node_id': 'triage', 'branch_key': None, 'iteration': None, 'item_index': None}, 'attempt': 1} is not recorded; replay_strict never falls back to a live call cost $0 tokens 0/0
```

Pointing `--human-answers` at the project's own `samples/answers.json` parses cleanly and changes
nothing about this particular run — `case.json` never reaches a `human` node before `triage` fails
anyway — but a file that doesn't match `ScriptedAnswer`'s shape fails before the run even starts:

```bash
echo '{"not": "a list"}' > bad_answers.json
{{CLI_COMMAND}} run support_case --input case.json --human-answers bad_answers.json
```

```text
1 validation error for tuple[ScriptedAnswer, ...]
  Input should be a valid array [type=tuple_type, input_value={'not': 'a list'}, input_type=dict]
    For further information visit https://errors.pydantic.dev/2.13/v/tuple_type
```

A malformed `--context` entry is caught the same way, before any of this runs, and exits `2`:

```bash
{{CLI_COMMAND}} run support_case --input case.json --context notkeyvalue
```

```text
aqven run: error: argument --context: expected KEY=VALUE, got notkeyvalue
```

## See also

- [Quickstart](/start/quickstart/) — creating a project and the first, basic `run`.
- [How to check a project before committing](/engine/check/) — the offline pass that catches most
  mistakes before you spend a token on a real run.
- [How to see what's in a project and how it connects](/engine/inspect-project/) — `tree`'s run-context
  row, the source of the keys `--context` needs for a given flow.
- [How to pause for a person](/engine/human-node/) — the `form` shape a `--human-answers` payload has to
  match, and why a suspended run stays alive without holding the CLI open.
- [How to branch into parallel steps](/engine/parallel-node/) — the join policy behind `judge_panel`'s
  `E_JOIN_FAILED`, and the `branch=` address `run` prints for it.
- [Project MCP Tool Reference](/reference/project-mcp-tools/) — `run_resume`, for answering a run that
  suspended.
- [CLI commands](/reference/cli/) — every other command, including `check` and `generate`.
