---
title: Runs and Integration
description: Execute a flow from the CLI, Python, or the local server.
---

After `check` passes, run a flow with a JSON input file:

```bash
uv run {{CLI_COMMAND}} run answer_question \
  --root . \
  --input samples/question.json
```

This may call a configured model provider. A flow with a `human` node can wait for an answer. For offline tests, use model replacements or recorded cases instead of live providers.

In Python, load the project and use its generated input and output models:

```python
from pathlib import Path
from {{PYTHON_MODULE}} import Project
from my_workflow.types import Question

async def handle_question(request: Question):
    root = Path("my_workflow")
    flow = Project.load(root).flow("answer_question")
    return await flow.run(request)
```

`create_local_app()` can mount the project server in an application. `serve` starts that server without opening a browser; `dev` starts it and opens Studio from the project directory. The generated [Python API](/engineering/reference/python-api/) has current signatures. [Studio Runs](/studio/runs/) explains what to inspect after a run.
