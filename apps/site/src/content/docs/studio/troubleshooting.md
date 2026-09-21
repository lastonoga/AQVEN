---
title: Troubleshooting
description: Find the first useful signal when Studio or a run behaves unexpectedly.
---

| Symptom | First check |
| --- | --- |
| A flow is missing | Open **Project** and inspect the project root and index diagnostics. Run `{{CLI_COMMAND}} check`. |
| A run fails at a model call | Open its trace step and read **Input**, **Prompt**, **Output**, and **Checks**. Confirm provider configuration in **Settings**. |
| A run is waiting | Open **Review** and find the pending human step. |
| A dataset case behaves differently | Compare the selected case input and the run's recorded input and node range. |
| A chat agent is unavailable | Check the selected backend and sign-in status in **Settings**. |
| A selected node range cannot start | Read the range preview and provide the listed context or upstream `node_outputs` fixture for that case. |
| A review answer is rejected | Reopen the wait, confirm the run is still suspended, and submit a value that matches the displayed form schema. |
| Studio shows an older definition | Confirm the project root, wait for the backend file watcher to index the change, then run `{{CLI_COMMAND}} check .`. |

## Use the smallest useful diagnostic

Start with the selected Studio screen, then move to the corresponding project command:

```bash
# Project structure, YAML fields, references, and simulated paths.
uv run {{CLI_COMMAND}} check .

# Only structural diagnostics while an edit is in progress.
uv run {{CLI_COMMAND}} check . --static

# Find the source and its references.
uv run {{CLI_COMMAND}} tree .
uv run {{CLI_COMMAND}} refs flow:your_flow_id .

# Validate configured model routes before a live run.
uv run {{CLI_COMMAND}} models check --project .
```

Studio must be opened with an AQVEN project through `uv run {{CLI_COMMAND}} dev .`; it cannot diagnose a folder without `aqven.yaml`. If the server itself will not start, run the command from the directory containing that file and read the first emitted diagnostic. Keep the project root, run ID, node ID, and error code together when reporting a problem.

For source-level errors, [Testing and evaluation](/engineering/testing-and-evaluation/) explains the CLI diagnostics and [Debugging a workflow](/engineering/debugging/) gives the investigation sequence.
