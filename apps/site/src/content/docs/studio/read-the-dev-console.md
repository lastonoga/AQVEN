---
title: How to read the dev console
description: What the terminal running the project server prints for runs, steps, retries, series and file changes, how to see more or less of it, and where the full log is kept.
---

## When you need this

You started Studio with `{{CLI_COMMAND}} dev` (or the server with `{{CLI_COMMAND}} serve`) and want the
terminal to tell you what is going on: which run started, which step retried and why, which file to fix,
and which lines are safe to ignore.

## Steps

- Keep the terminal next to Studio. Every run you start — from Studio, from the chat, or from an agent
  over MCP — prints a line when it starts, a line for each finished step, a line for each retry, and a
  line when it ends.
- Read a line from left to right: the time, a mark, then the facts, joined by `·`.

  | Mark | What happened |
  | --- | --- |
  | `▶` | A run started: the last 8 characters of its id, the flow, the mode, and the Studio link to the run. |
  | `✓` | A step finished: the node (with `[item=N]` inside a map or `[branch=K]` inside a parallel), the agent, the model, the time, tokens in→out, and the cost. |
  | `↻` | A model attempt failed and AQVEN repairs or retries it: the attempt, the next action, the error code. The lines below give the message, the `hint`, and the agent file. |
  | `✗` | A step failed: the error code, the first line of the message, and the `hint` below it. |
  | `⏸` | A step waits for a person to answer. |
  | `■` | The run ended: its status, how many steps failed if it still completed, the time, tokens, and cost. |
  | `◆` | A series started, reached another 10% of its attempts, or ended with its verdict. |
  | `✎` | A project file changed and the project was reindexed, or a flow's check result changed. |
  | `▲` | A warning, from AQVEN or from a library. A library name before the text says where it came from. |

- Follow the `hint`. Retry and failure lines name the change to make and the file to make it in, for
  example `set output.mode: native or prompted in agents/looker_nano.yaml`.
- Read a Python warning once. Each warning prints the first time only, however many calls raise it. The
  warning Pydantic AI raises for a sampling setting on a reasoning model prints as the
  [`W_SAMPLING_IGNORED`](/reference/diagnostics/) warning that `{{CLI_COMMAND}} check` gives for the same
  agent, with the hint and the agent file below it, for example `W_SAMPLING_IGNORED: temperature is
  ignored by openrouter:openai/gpt-5-nano (reasoning model); remove it`. Run `{{CLI_COMMAND}} check` to
  find every agent that sets it before a run does.
- Choose how much you see. Add `-v` (`--verbose`) to also see debug lines: cancelled branches, HTTP
  requests, and the start-up lines of the server and the durable-execution engine. Add `-q` (`--quiet`) to
  see only warnings and errors. The same choice can come from `AQVEN_LOG_LEVEL` — `debug`, `info`,
  `warning` or `error`; a flag on the command line wins over the variable.
- Open the full log when the terminal is not enough. Every line, and the fields behind it, is also written
  to `.aqven/logs/dev.jsonl` in the project: one JSON object per line with `ts`, `level`, `logger`,
  `event`, and `message`, plus fields such as `run_id`, `node`, `code`, `hint`, `agent`, `model`,
  `tokens_in`, `tokens_out`, and `cost_usd`. The file rolls over at 5 MB and keeps three older files.
  `.aqven/logs/` is listed in the project's `.gitignore`.

### Example

A run of the `answer_question` flow whose model answered with plain text on the first attempt:

```text
16:12:44 ▶ run bf3c852f started · flow answer_question · live · http://127.0.0.1:5180/runs/01a0d355-1856-77b8-9d54-a280bf3c852f
16:12:44 ✓ prepare · 2ms
16:12:44 ↻ reply attempt 1 → repair · MODEL_NO_STRUCTURED_OUTPUT
           model openrouter:openai/gpt-5-nano answered with text instead of calling the output tool
           hint: set output.mode: prompted in agents/assistant.yaml
           agent assistant (agents/assistant.yaml)
16:12:45 ✓ reply · assistant · gpt-5-nano · 1.2s · 1,100→21 tok · $0.0004
16:12:45 ■ run bf3c852f completed · 1.3s · 1,100→21 tok · $0.0004
16:12:48 ✎ agents/assistant.yaml modified · reindexed
```

List every retry of the day with its hint:

```bash
jq -c 'select(.event == "step_retry") | {node, code, hint, agent_file}' .aqven/logs/dev.jsonl
```

## What stays hidden at the default level

- Cancelled branches. When a parallel node or a map no longer needs its other branches, a fallback wins,
  or you cancel a run, AQVEN cancels the branches that are still running. The durable-execution engine reports each
  of them as a warning and an error with a long traceback, although nothing went wrong, and warns once more
  when a cancelled branch's model call returns after all. The console drops those lines; with `-v` it
  prints one line per branch instead, such as `branch drafts[branch=gpt] of run bf3c852f cancelled` or
  `branch drafts[branch=gpt] of run bf3c852f finished after it was cancelled; its result was dropped`.
- The raw model-output warning of each attempt. The `↻` and `✗` lines already carry its code, message and
  hint. It stays in `.aqven/logs/dev.jsonl`, and `-v` prints it too. Attempts inside a series are not
  printed one by one: the series prints its progress instead.
- HTTP request lines and the start and stop lines of the web server and the durable-execution engine.
  `-v` shows them.

`{{CLI_COMMAND}} run` prints its run events to standard output in its own format and sends every other
line through the same console. `{{CLI_COMMAND}} check` uses the same filters and prints only warnings and errors next to
its report.

## Under the hood

Durable execution runs on DBOS and the web server on uvicorn. AQVEN routes both of their logs, and
Python's own warnings, through one console with one format, and adds the run, series and file lines on
top. See [What this is built on](/concepts/what-this-is-built-on/).

## See also

- [How to open an existing project in Studio](/studio/open-a-project/) — starting the server whose
  console this page reads.
- [How to investigate a run](/studio/investigate-a-run/) — the Studio page the `▶` line links to.
- [How to set a secret for a provider, tool, or MCP server](/integrations/secrets-and-environment/) — the
  project `.env` file, where `AQVEN_LOG_LEVEL` can live next to the other runtime settings.
