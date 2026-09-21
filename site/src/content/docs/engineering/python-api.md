---
title: Python API
description: Embed an AQVEN project in a Python application and consume typed run results and events.
---

Use the Python API when AQVEN is part of an existing Python service, worker, or application. The generated API reference is authoritative for callable signatures; this guide explains the integration boundary.

## Choose the execution surface

| Need | Use |
| --- | --- |
| Run a flow from a terminal | `{{CLI_COMMAND}} run` |
| Operate a project locally with Studio | `{{CLI_COMMAND}} dev` |
| Embed direct project execution in Python | The AQVEN runtime API |
| Call a running local project over HTTP | `AqvenClient` |
| Give a coding agent project-aware access | `{{CLI_COMMAND}} mcp` |

## Keep application and project ownership clear

Your application owns incoming requests, authentication, application storage, and its own deployment. The AQVEN project owns workflow definitions, model and tool contracts, run behavior, datasets, and evaluations. Load the project at a controlled boundary, pass a value that matches the declared input type, and handle the declared output type.

## Generated types are the Python contract

After type changes, regenerate before importing project models:

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} check .
```

Use the generated `types.py` for values that cross from application code into a flow or back out of it. Do not mirror those models by hand.

## Prefer a client for a separately running project

`AqvenClient` is the Python client for the project HTTP surface. It starts runs, reads runs and executions, follows run events, resumes, forks, cancels, and transfers media blobs. Use it when the project server has its own process boundary.

```python
from aqven.client import AqvenClient

async with AqvenClient("http://127.0.0.1:5180") as client:
    run = await client.get_run("replace-with-run-id")
```

For exact imports, request models, event types, and method signatures, see the generated [Python API reference](/engineering/reference/python-api/).
