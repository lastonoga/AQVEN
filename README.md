<div align="center">

# AQVEN

### Discover what your AI workflow needs to work reliably.

A Python framework and a local Studio for AI workflows.<br>
Your coding agent runs the experiments. You see the evidence and decide.

[![PyPI](https://img.shields.io/pypi/v/aqven)](https://pypi.org/project/aqven/)
[![Python](https://img.shields.io/pypi/pyversions/aqven)](https://pypi.org/project/aqven/)
[![CI](https://github.com/lastonoga/AQVEN/actions/workflows/ci.yml/badge.svg)](https://github.com/lastonoga/AQVEN/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)

**[Documentation](https://aqvenstudio.com)** · **[Quickstart](https://aqvenstudio.com/start/quickstart/)** · **[Use cases](https://aqvenstudio.com/use-cases/)** · **[Studio](https://aqvenstudio.com/studio/)** · **[llms.txt](https://aqvenstudio.com/llms.txt)**

<br>

<img src="apps/site/public/images/studio/canvas.png" alt="AQVEN Studio showing a multi-step AI workflow on one canvas" width="820">

</div>

<br>

AQVEN keeps an AI workflow as typed files in your repository: a flow, one file per step, prompts in
Markdown, and declared types, agents and tools. `aqven check` validates every connection and simulates
every flow before you spend a token. Studio, a local browser app in the same install, shows each run
step by step. Your coding agent works on the same files through AQVEN's MCP server, and runs experiments
whose verdicts AQVEN computes.

> [!NOTE]
> AQVEN is in alpha: expect changes between releases. It is source-available, not open source. See
> [License](#license).

## Contents

- [What it's for](#what-its-for)
- [Install](#install)
- [Start with your coding agent](#start-with-your-coding-agent)
- [Start by hand](#start-by-hand)
- [Your agent does the work. You direct the investigation.](#your-agent-does-the-work-you-direct-the-investigation)
- [What's inside](#whats-inside)
- [When AQVEN is not the right tool](#when-aqven-is-not-the-right-tool)
- [Built on](#built-on)
- [Support and feedback](#support-and-feedback)
- [License](#license)

## What it's for

| | |
| --- | --- |
| **[Find](https://aqvenstudio.com/use-cases/#find)** | *"What am I missing?"* Your agent explores cases and variants you wouldn't try yourself. |
| **[Explain](https://aqvenstudio.com/use-cases/#explain)** | *"Why did this fail?"* Follow a bad answer back to the step where it started. |
| **[Compare](https://aqvenstudio.com/use-cases/#compare)** | *"What should I change?"* Models and prompts side by side, with cost and latency. |
| **[Confirm](https://aqvenstudio.com/use-cases/#confirm)** | *"Can I trust this change?"* A verdict on held-out cases that is allowed to say inconclusive. |
| **[Build](https://aqvenstudio.com/use-cases/#build)** | *"How do I keep it readable as it grows?"* Typed files in your repo, checked before a run costs a token. |

## Install

You need [uv](https://docs.astral.sh/uv/getting-started/installation/). AQVEN runs on Python 3.14,
and uv fetches it for you.

```bash
uv tool install aqven
aqven new my_project --template minimal --provider openrouter
```

`aqven new` writes the project, installs its environment with `uv sync` and generates typed Python
models. It also prepares the project for a coding agent: `AGENTS.md`, `CLAUDE.md`, an `.mcp.json` that
registers AQVEN's MCP server, and Claude Code hooks that run `aqven check` as the agent works.

A real run needs a model key: copy `my_project/.env.example` to `my_project/.env` and set
`OPENROUTER_API_KEY` in it. `aqven check` needs neither a key nor the network.

## Start with your coding agent

Start Claude Code in the project and approve the `aqven` server when it asks:

```bash
cd my_project
claude
```

Then hand it a task. It builds the flow, runs `aqven check` after every change, and works in rounds:

```text
Build a flow that reads an incoming support e-mail and returns its intent (defect, delivery or question) and a one-line summary.
Done means: the intent is right on more than 90% of held-out cases, and a case costs under $0.002.
Work in rounds: explore on working cases, confirm once on held-out cases. Stop when every "done" criterion is confirmed, or when you have spent $5.
Then report FINDINGS.md, the decisions you made and the risks that are left.
```

Open Studio next to it to watch every run, or chat from there: its
[chat panel](https://aqvenstudio.com/studio/chat/) runs Claude Code or Codex on the same project.

```bash
uv run aqven dev my_project
```

For Codex, Cursor or another MCP client, see
[How to set up a coding agent outside Studio](https://aqvenstudio.com/mcp-cli/set-up-an-agent-outside-studio/).

## Start by hand

Check the new project:

```bash
cd my_project
uv run aqven check my_project
```

```text
errors: 0, warnings: 0
```

`aqven check` validates every file, then simulates a run of every flow with stand-ins for the model
calls. Run it after every change. With a key in `.env`, run the flow for real, one line per event as it
happens:

```bash
echo '{"text": "How long does a light strip last?", "tone": "friendly"}' > question.json
uv run aqven run answer_question --root my_project --input question.json
```

This is the project, trimmed to the files that define the workflow:

```text
my_project/
  AGENTS.md  CLAUDE.md  .mcp.json  .claude/  pyproject.toml
  my_project/
    aqven.yaml
    agents/assistant.yaml
    tools/count_words.yaml
    types/enums/tone.yaml  types/records/question.yaml  types/records/answer.yaml
    flows/answer_question/
      flow.yaml
      nodes/prepare/  prepare.node.yaml  prepare.py
      nodes/reply/    reply.node.yaml  reply.inference.yaml  reply.prompt.md
```

**`flows/answer_question/flow.yaml`** declares the input, the output and the order of the steps:

```yaml
apiVersion: "aqven/v1"
kind: "Flow"
description: "Cleans up a question and answers it in the requested tone"
input: "Question"
output: "Answer"
returns:
- name: "reply"
  from: "$reply.out.reply"
- name: "tone"
  from: "$input.tone"
order:
- "prepare"
- "reply"
```

**`flows/answer_question/nodes/reply/reply.node.yaml`** is a model step. It takes `text` from the
`prepare` step and `tone` from the flow input:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Answers the prepared question with the assistant agent"
agent: "assistant"
in:
- name: "text"
  from: "$prepare.out.text"
- name: "tone"
  from: "$input.tone"
```

**`reply.prompt.md`** is the prompt, a file of its own. `reply.inference.yaml` declares the typed input
and output of the call.

```liquid
Answer the question in a {{ tone }} tone, in at most 120 words.
If you are not sure a draft fits, count its words with the count_words tool.
<question>{{ text }}</question>
{{ output_format }}
```

Now break one reference: change `$prepare.out.text` to `$prepare.out.txt` and check again.

```console
$ uv run aqven check my_project
flows/answer_question/nodes/reply/reply.node.yaml:8:3: error E_REF_MISSING in[0].from: reference $prepare.out.txt: the value has no field txt
errors: 1, warnings: 0
```

The check exits with code 1, so a hook or a CI job stops there. It also catches a value whose type
doesn't fit the slot (`E_BINDING_TYPE`), a prompt variable the inference doesn't declare
(`E_PROMPT_VARIABLE_UNDECLARED`) and a `switch` that misses a case (`E_SWITCH_NOT_EXHAUSTIVE`).
→ [All diagnostics](https://aqvenstudio.com/reference/diagnostics/)

The [quickstart](https://aqvenstudio.com/start/quickstart/) walks through AQVEN's full example,
`--template showcase`: a support flow with every node kind, human approval and experiments.

## Your agent does the work. You direct the investigation.

One run proves one case, and `aqven check` proves the wiring. Neither says how the workflow behaves on
real inputs. The agent finds out in rounds, and you make the decisions:

1. **You** set the goal, what "done" means in numbers, and a budget.
2. **The agent** builds the simplest flow that works, writes cases with expected outputs, and runs
   `aqven check` after every change.
3. **You** read the first traces it hands you, failing runs first, and note the first thing that went
   wrong in each.
4. **The agent** groups your notes into failure modes you agree on, and writes one experiment per mode
   before any data.
5. **The agent** explores on working cases, one change between series, then confirms once on held-out
   cases, the half of each dataset it never sees case by case. The server writes the verdict
   (`confirmed`, `refuted` or `inconclusive`), and the finding lands in `FINDINGS.md`.
6. **You** decide which limits are requirements, how much quality a cheaper step may lose, and any spend
   above the project cap. An agent can start a series but never approve its spend.

A verdict holds for the cases, checks and versions it measured. It is evidence for a decision, not a
guarantee about every future output.

→ [A day with AQVEN](https://aqvenstudio.com/start/a-day-with-aqven/) ·
[How an agent takes a task through the research loop](https://aqvenstudio.com/mcp-cli/research-loop/)

## What's inside

| Part | What it is |
| --- | --- |
| **[Flows and nodes](https://aqvenstudio.com/concepts/ten-kinds-of-nodes/)** | Ten node kinds — `llm`, `code`, `tool`, `human`, `switch`, `parallel`, `map`, `loop`, `call`, `narrow` — composed into a typed graph |
| **[Types](https://aqvenstudio.com/reference/types/)** | Records, enums, unions, IDs, values and media, checked at every boundary. A model can't return a field that isn't declared |
| **[Prompts](https://aqvenstudio.com/concepts/three-prompt-levels/)** | Plain text, Liquid templates with shared fragments, or a Python function. Always a file of its own, never a string inside YAML |
| **[Agents and providers](https://aqvenstudio.com/integrations/model-providers/)** | An agent is a model with its settings and output mode, in its own file. The [provider catalog](https://aqvenstudio.com/reference/provider-catalog/) has 28 entries through Pydantic AI, from OpenAI, Anthropic and Google to OpenRouter, Mistral, DeepSeek, Groq and Ollama |
| **[Tools](https://aqvenstudio.com/engine/tool-node/)** | Python functions or MCP servers, with a declared `read`, `write` or `external` effect |
| **[Human review](https://aqvenstudio.com/engine/human-node/)** | A step that waits on a person, with a timeout and a default |
| **[Cases](https://aqvenstudio.com/reference/datasets/)** | Datasets of tagged cases with expected outputs, split by a hash of each name into working and held-out halves |
| **[Experiments and findings](https://aqvenstudio.com/engine/experiments/)** | An experiment writes one question down before any data. A series answers it across variants and cases. A verdict on held-out cases becomes a finding in `FINDINGS.md` |
| **[Durable execution](https://aqvenstudio.com/concepts/run-survives-a-crash/)** | A run survives a crash and resumes where it left off |
| **[Studio](https://aqvenstudio.com/studio/)** | The local browser app. **Flow** shows a workflow's graph, runs and cases. **Research** shows experiments and series, and launches a series to **Explore** or **Confirm** |
| **[MCP server](https://aqvenstudio.com/mcp-cli/)** | The same tools Studio's chat uses, for any MCP client: `flow_patch` for cross-file edits, `aqven_check`, `prompt_preview`, `run_start`, `series_start` and more |

## When AQVEN is not the right tool

- **One prompt, one model call.** Call the model's SDK directly; a flow adds files you don't need.
- **You only want to trace an app you already have.** AQVEN runs workflows written in its own files. A
  tracing tool fits better.
- **You need a hosted service for a team.** AQVEN runs locally, on your machine.
- **You can't run Python 3.14.** The engine requires exactly 3.14, and your step code runs on it.
- **You need an OSI-approved open-source license.** AQVEN is source-available.

| | Tracing tools | Visual builders | AQVEN |
| --- | --- | --- | --- |
| Where the logic lives | Your code | Their platform | Files in your repo |
| Checked before it runs | No | No | Yes |
| Yours if the vendor disappears | Yes | No | Yes |
| Adds to the app you already have | Yes | No | No: the workflow moves into AQVEN files |

## Built on

[Pydantic AI](https://ai.pydantic.dev/) calls the models, [DBOS](https://www.dbos.dev/) checkpoints
every run on SQLite, the official [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
serves and consumes MCP, [FastAPI](https://fastapi.tiangolo.com/) serves Studio and the API, and
[python-liquid](https://jg-rp.github.io/liquid/) renders prompt templates.
→ [What this is built on](https://aqvenstudio.com/concepts/what-this-is-built-on/)

## Support and feedback

- **Docs:** [aqvenstudio.com](https://aqvenstudio.com). For an agent, [llms.txt](https://aqvenstudio.com/llms.txt)
  indexes every page in Markdown.
- **Bugs and ideas:** [GitHub Issues](https://github.com/lastonoga/AQVEN/issues).

## License

AQVEN is **source-available**, not open source, under the AQVEN License 1.0.0 — based on the
[PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0), with one
addition.

- **You may** use it for any purpose, including in production and in commercial products you build
  with it: the AI workflows you create with AQVEN are yours, and selling them is explicitly permitted.
- **You may not** use AQVEN — original or modified — to provide a product that competes with it.
- **You may** redistribute copies of AQVEN itself only free of charge and for a non-commercial purpose.
  The right to sell AQVEN itself stays with the licensor.

Copyright Kirill Burkhanov. Full terms: [LICENSE](LICENSE).
