---
title: Quickstart
description: Start a project yourself or with an AI coding agent.
---

## Choose how to start

| Your starting point | Do this |
| --- | --- |
| An idea and an AI coding agent | Give the agent [Getting started with AI](/engineering/getting-started-with-ai/) and [`llms.txt`](/llms.txt). It will ask for the missing workflow requirements, create a project, and check its work. |
| A terminal and a new project | Follow [Create a project from this checkout](#create-a-project-from-this-checkout) below. |
| An existing AQVEN project | Open the directory containing `aqven.yaml`, run `uv run {{CLI_COMMAND}} check .`, and use [AI coding agents](/engineering/ai-coding-agents/) for project-aware changes. |
| A visual view of a project | Start [Studio](#open-this-project-in-studio) with `uv run {{CLI_COMMAND}} dev .` from the project root. |

An agent can read the [machine-readable documentation index](/llms.txt). It links to Markdown copies of the guides and the generated API reference. The [AI bootstrap guide](/engineering/getting-started-with-ai/) is a reusable prompt and process; it is not a packaged agent skill.

The packages are not published yet. The future install names are placeholders configured once in `site/docs.tokens.mjs`:

```bash
pip install {{PYTHON_PACKAGE}}
# Studio package: {{STUDIO_PACKAGE}}
```

## Create a project from this checkout

The Python workspace currently needs `uv` 0.12.15 or newer. From `aqven-py/`:

```bash
uv sync
uv run {{CLI_COMMAND}} new my_workflow --template minimal --with-tests \
  --aqven-path packages/aqven
cd my_workflow/my_workflow
uv run {{CLI_COMMAND}} check .
uv run {{CLI_COMMAND}} tree .
```

The generated module directory contains `aqven.yaml`; that is the project root for `check`, `dev`, and other project commands. `check` validates the definitions and simulates the flow without a model call. `tree` shows discovered files and IDs.

`new` also generates Python models from type YAML. Edit the YAML source, then run `uv run {{CLI_COMMAND}} generate .` rather than editing generated `types.py`.

## Open this project in Studio

From the same directory containing `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} dev .
```

This one command starts the project backend, watches project files, and serves Studio. Studio needs an AQVEN project; it does not start as an empty, independent workspace. The command prints the local address. [Studio quickstart](/studio/quickstart/) explains the first screen.

## Build the first workflow

Read [the complete starter workflow](/engineering/example-workflow/) to see the type files, flow, nodes, inference, prompt, agent, and Python function together. Then use [Flows](/engineering/flows/) for variations and the generated [Reference](/engineering/reference/flows/) for exact fields.
