---
title: Editor Support
description: Generate source-derived JSON Schemas and Python types for YAML and code tooling.
---

Run the following from the project root after definition changes:

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} schema .
```

`generate` writes derived Pydantic types for Python code. `schema` writes editor JSON Schemas under `.aqven/schema/`. Treat both outputs as generated artifacts. Configure your YAML editor to use the generated schemas and your Python editor to use the project environment.

Run `check` after generation; it catches stale outputs, invalid YAML fields, and invalid bindings.
