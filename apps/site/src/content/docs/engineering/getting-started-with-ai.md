---
title: Getting Started with AI
description: Give a coding agent the context to create or evolve an AQVEN project.
---

You can start with an idea, an existing repository, or a generated AQVEN project. Give your coding agent the [AI documentation index](/llms.txt) and the brief below. The index links to Markdown guides and generated references; the agent can read only the pages it needs.

This page is a **reusable reference**, not an installable agent skill. You can copy the prompt into any coding agent that can read files and run commands in your checkout.

## Choose a route

| Situation | Agent's first action | Result |
| --- | --- | --- |
| No AQVEN project yet | Ask about the workflow, then scaffold the `minimal` template with `{{CLI_COMMAND}} new`. | A project with `aqven.yaml`, a starter flow, types, and an optional offline test. |
| AQVEN project already exists | Find `aqven.yaml`, read the flow and related definitions, and run `{{CLI_COMMAND}} check`. | A change to the existing project, with its contracts preserved. |
| You want to inspect or edit visually | Start `uv run {{CLI_COMMAND}} dev .` **inside an existing project**. | The project backend and Studio together. |
| Your agent supports MCP | Connect it to `uv run {{CLI_COMMAND}} mcp .` in the project. | Project-aware inspection, edits, checks, previews, and runs. |

Studio opens a project; it does not create an empty project independently. The Python and Studio package names are still [placeholders](/engineering/quickstart/) until publication.

## What the agent should learn first

The agent should ask only for information it cannot find in your request or repository. These answers determine the flow design:

1. **Outcome:** What decision or artifact should the workflow produce? Who uses it?
2. **Inputs and examples:** What enters the workflow? Give one normal example and one difficult or invalid example. Are inputs text, files, images, audio, or structured records?
3. **Output contract:** Which fields are required? What should happen when evidence is missing or the model is uncertain?
4. **Steps and effects:** Which steps are deterministic code, model reasoning, external tools, or human decisions? May the workflow write to external systems?
5. **Models and constraints:** Which providers and credentials are available? What are the cost, latency, privacy, and retention limits?
6. **Quality bar:** What examples should become dataset cases? Which errors are unacceptable, and what baseline should a change beat?

If you do not know an answer, the agent should state an assumption in its plan and wait for your direction on decisions that change the product behavior or external effects.

## Copy this bootstrap prompt

Replace the bracketed task description. Keep the rest as a working contract for the agent.

```text
Build or update an AQVEN workflow for [the outcome and users].

Read https://aqvenstudio.com/llms.txt (or site/public/llms.txt in the AQVEN
documentation checkout), then read only the relevant guides and generated
reference pages. Inspect this repository before
creating files. If aqven.yaml already exists, work in that project. Otherwise,
use the minimal project template from the local AQVEN checkout.

Before editing, ask me a short, grouped set of questions for requirements that
are missing: inputs and examples, output contract, external actions and human
approval, model/provider constraints, and success cases. Do not ask for facts
already present in this repository or message.

Then propose the flow: input/output types, nodes and data paths, why each step
uses code, a model, a tool, or a human, failure behavior, and dataset cases.
Show the files you intend to change. Use the generated reference for exact YAML
fields and Python signatures; do not guess them.

Implement the agreed design. Edit source YAML, prompts, and Python code; do not
edit generated types.py. Run {{CLI_COMMAND}} generate . when types change, {{CLI_COMMAND}} check .,
and prompt previews for changed model requests. Add or update dataset cases and
run the relevant evaluation when behavior changes. Report the diff, commands,
results, and any provider or external-action path that was not tested.
```

The CLI name resolves from the central documentation token. If the published index is not available yet, generate the local copy with `corepack pnpm --dir site llms` from this repository's root, or paste this guide and the relevant reference links into your agent.

## Scaffold and inspect a project

For a new project in this checkout, the agent can use the same commands as a developer. From the repository root:

```bash
uv sync
uv run {{CLI_COMMAND}} new my_workflow --template minimal --with-tests \
  --aqven-path packages/aqven
cd my_workflow/my_workflow
uv run {{CLI_COMMAND}} tree .
uv run {{CLI_COMMAND}} check .
```

The generated module directory contains `aqven.yaml`. From that directory, use `uv run {{CLI_COMMAND}} dev .` to open the backend and Studio together. For an existing project, skip `new` and work from its `aqven.yaml` directory. [Project layout](/engineering/project-layout/) explains what each file owns; [the complete starter](/engineering/example-workflow/) shows a working flow.

## Connect an agent to a project

From the directory containing `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} mcp .
```

Configure your coding agent's MCP client to launch that command from the project environment. The project bridge exposes operations such as `flow_list`, `flow_get`, `catalog_get`, `flow_patch`, `aqven_check`, `prompt_preview`, and run tools. The exact MCP client configuration depends on the client. MCP helps the agent inspect project structure and make project-aware edits; it does not replace the [generated YAML and Python reference](/engineering/reference/).

Add a short project-specific `AGENTS.md` so future sessions know the same constraints. [AI coding agents](/engineering/ai-coding-agents/) provides a starting file and the verification routine.

## Manage the project after the first workflow

| Change | Agent action | Evidence to review |
| --- | --- | --- |
| Add or change fields | Update type YAML, regenerate Python models, update bindings, then check. | Generated type diff and a clean `check`. |
| Change a prompt or model | Preview the rendered request, update dataset cases, and evaluate the affected flow. | Prompt preview and evaluation result. |
| Add a tool or external effect | Define the tool contract, decide approval and failure behavior, then test the integration. | Tool trace and explicit note about untested live paths. |
| Investigate a failure | Inspect the run and first differing node in Studio, then reproduce it as a dataset case. | Run trace and a regression case. |

Use [Design a workflow](/engineering/designing-workflows/) for architectural decisions, [Datasets](/engineering/datasets/) for repeatable cases, and the [generated reference](/engineering/reference/) for accepted fields. As the project grows, keep workflow-specific facts in the project and use this documentation as the framework contract.
