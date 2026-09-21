---
title: Studio Quickstart
description: Start Studio together with a project and its backend.
---

Studio opens an **AQVEN project**. It reads that project's definitions, runs, datasets, and evaluations. Start it from the directory containing `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} dev .
```

This one command starts the project backend, watches its files, serves Studio, and opens it in the browser. Use the URL printed by the command. Studio does not start as an independent workspace outside a project.

If you are at the parent directory of a generated Python package, pass the module directory instead:

```bash
uv run {{CLI_COMMAND}} dev my_workflow
```

`{{CLI_COMMAND}} studio` is an alias of `dev`. `{{CLI_COMMAND}} serve` starts the same project server without opening a browser. Studio itself needs no separate install: its built bundle ships inside `{{PYTHON_PACKAGE}}`.

On the **Project** page, confirm the opened root and choose a flow. Then use [Canvas](/studio/canvas/) to read its structure and [Runs](/studio/runs/) to inspect an execution. [Walk through a workflow](/studio/workflow-tour/) gives a short route through the UI.
