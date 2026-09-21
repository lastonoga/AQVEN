---
title: Open an Existing Project
description: Locate an AQVEN project, inspect its entities, and verify its current state before editing.
---

Find the directory containing `aqven.yaml`. That directory is the project root, even if it lives within a larger Python repository.

```bash
uv run {{CLI_COMMAND}} tree .
uv run {{CLI_COMMAND}} check . --static
uv run {{CLI_COMMAND}} check .
```

`tree` gives the discovered entity IDs and source paths. `check --static` catches definition and reference errors. The full check also simulates flow paths without provider credentials. Run `generate` after a type source change; do not modify generated `types.py` manually.

Use `refs KIND:ID .` before a rename or contract change. [Project Model](/engineering/project-model/) explains the source and generated boundaries.
