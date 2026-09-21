---
title: Troubleshooting
description: Find the first useful diagnostic for project loading, generated types, bindings, providers, waits, and Studio.
---

Start with the smallest command that can locate the failure:

```bash
uv run {{CLI_COMMAND}} check . --static
uv run {{CLI_COMMAND}} check .
uv run {{CLI_COMMAND}} tree .
uv run {{CLI_COMMAND}} models check --project .
```

If the project cannot load, confirm the directory contains `aqven.yaml`. If generated types are stale, run `generate`. If a binding fails, inspect both type and reference path. If a run is suspended, inspect its waits and answer the current attempt through Studio Review. If Studio cannot connect, start it from the project root with `dev`.

Use the generated [Diagnostics Reference](/engineering/reference/diagnostics/) for codes and rules. Keep the run ID, node address, source path, and diagnostic code when reporting an issue.
