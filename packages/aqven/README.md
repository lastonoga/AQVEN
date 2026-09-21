# AQVEN

**An engineering environment for AI systems.** Define, validate, test, run, evaluate and debug LLM workflows
as a system — instead of leaving their logic scattered across prompts, model settings, tools, orchestration
code and tests.

📖 **[Documentation](https://aqvenstudio.com)** · 🚀 **[Quickstart](https://aqvenstudio.com/engineering/quickstart/)** · 🧭 **[Studio guide](https://aqvenstudio.com/studio/)** · 📚 **[API reference](https://aqvenstudio.com/engineering/reference/)**

---

## The problem it solves

A prototype is `input → model → output`. Production is not. A real AI system combines several models, context
sources, tools, retries, judges and verification steps — and once it does, a successful run stops being
evidence that anything works.

Changing a prompt, a model, a provider or a schema affects quality, cost and latency differently for different
inputs. AQVEN makes those parts and their relationships explicit, so you can answer:

- What system do we actually have?
- Which prompt, model, context, tool or step should change?
- Did that change improve quality for the cases that matter?
- Why did this run produce an almost-right result?
- Can a coding agent understand the system well enough to change it safely?

## Install and open it

AQVEN installs as a single package. **Studio, the local browser interface, ships inside it** — no Node.js
toolchain, no separate front-end install, nothing to build.

```bash
uv tool install aqven
aqven new my_project
cd my_project
uv run aqven dev
```

`aqven new` creates the project from a template, installs its environment and generates typed models.
`aqven dev` starts the local server and opens Studio in your browser.

## How a project looks

Workflows are **files in your repository**, not rows in a database. A node is a YAML file, a prompt is a
Markdown file, a code step is a Python function referenced as `module:function`. Identity is the path on
disk, history is git.

```
my_project/
  aqven.yaml                 providers, data policies, trust defaults
  types/                     types declared once, Python models generated from them
  agents/                    model, settings, output contract, limits
  flows/support_case/
    flow.yaml
    nodes/triage/
      triage.node.yaml
      triage.prompt.md
      triage.py
  evals/                     datasets and scored cases
```

That layout is the reason a coding agent — Claude Code, Codex, Cursor — can read the system before editing it,
and the reason `aqven check` can validate the whole project before anything runs.

## The engineering loop

```text
Define → Validate → Test → Run → Evaluate → Learn → Improve
```

| Command | What it does |
| --- | --- |
| `aqven check` | validates the project and simulates every flow **without network access or tokens** |
| `aqven run` | runs a flow locally and streams run events as they happen |
| `aqven dev` | project server plus Studio: canvas, runs, datasets, human review |
| `aqven eval` | runs an eval over its dataset, scores every case, compares against a baseline |
| `aqven optimize` | optimizes a prompt with GEPA |
| `aqven serve` | HTTP API and MCP server, without a browser |
| `aqven mcp` | MCP over stdio, so a coding agent can inspect and edit the project |

## What it is built on

AQVEN does not reimplement the parts of the stack that already work well. Model-facing agents, providers and
tools use [Pydantic AI](https://ai.pydantic.dev/); durable execution, recovery and waits for people use
[DBOS](https://www.dbos.dev/). AQVEN adds the project format, typed workflow contracts, the compiler, checks,
run interfaces and Studio. See [Architecture](https://aqvenstudio.com/engineering/architecture/).

Runs locally on SQLite. Python 3.14.

## Keywords

AI workflow orchestration · LLM pipelines · prompt engineering · agent evaluation · LLM observability ·
structured output · human-in-the-loop · MCP server · durable execution · Pydantic AI · DBOS

## License

[PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) — source-available.
Use it for any purpose, including in production and in commercial products you build with it.
You may not use it to provide a product that competes with AQVEN.

Copyright Kirill Burkhanov.
