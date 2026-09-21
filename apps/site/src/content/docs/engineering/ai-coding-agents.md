---
title: AI Coding Agents
description: Give an agent enough project context to make safe, verifiable edits.
---

An AI coding agent needs the same map as a developer: where source files live, which commands work, and what counts as a valid change. Put project-specific facts in `AGENTS.md` and point the agent to this manual.

To create a project from an idea, start with [Getting started with AI](/engineering/getting-started-with-ai/) and the machine-readable [`llms.txt`](/llms.txt). This page covers ongoing work in a project.

## Give the agent a project contract

```markdown
# AQVEN project rules

- Read `aqven.yaml` and `flow.yaml` before changing a flow.
- Edit YAML and prompt source files, not generated `types.py`.
- Run `{{CLI_COMMAND}} check .` after each workflow change.
- Run `{{CLI_COMMAND}} prompt preview FLOW.NODE --project .` after a prompt change.
- Add or update dataset cases for behavior changes.
- Report the commands run and any remaining uncertainty.
```

Add local rules for credentials, model budget, live-provider tests, and ownership of evaluation datasets. Keep these rules short enough that an agent can use them during an edit.

## Give it a design brief, not only a task name

A useful workflow request supplies:

- The intended input and output, with examples.
- The business decision and what “correct” means.
- External systems and which effects are allowed.
- What must be approved by a person.
- Latency, cost, token, and retention constraints.
- Dataset cases, known failures, and the baseline to compare against.

Ask the agent to propose the input and output types, then justify each `code`, `llm`, `tool`, and control node. It should say what changes when a branch fails or a model returns invalid output. [Design a workflow](/engineering/designing-workflows/) gives the decision order and scenario map; [Production patterns](/engineering/production-patterns/) connects common failures to controls; [Design structured output](/engineering/schema-design/) explains field-level correctness.

## Let the agent inspect the project

The project can expose an MCP server with `uv run {{CLI_COMMAND}} mcp .`. It gives an agent project-aware ways to inspect and change definitions. Structural edits should use project-aware operations when available so references stay consistent. The generated [specification reference](/engineering/reference/flows/) gives exact YAML fields, [accepted values](/engineering/reference/accepted-values/) gives enums, and the generated [Python API](/engineering/reference/python-api/) gives callable signatures. These pages are generated from the package, so the agent should prefer them over remembered syntax.

## Require evidence for a change

After editing, the agent should show the source diff, run `generate` when types changed, run `check`, preview affected prompts, and update dataset cases for behavior changes. A clean check is necessary for wiring but does not establish model quality. Evaluate a representative dataset before accepting a model, prompt, or policy change.

For a review, have the agent report the first node where observed behavior differs from intended behavior, using [Studio Runs](/studio/runs/) for the trace. Ask it to state any untested provider or external-tool path plainly.

This guide describes the context and checks an agent needs. Keep model- or content-specific techniques in dated [field notes](/engineering/field-notes/) so advice can change without changing the framework contract.
