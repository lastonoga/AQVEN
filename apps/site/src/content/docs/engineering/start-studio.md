---
title: Start Studio
description: Start the AQVEN project backend and Studio together from one project root.
---

From the directory containing `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} dev .
```

This one command starts the project backend, watches the project files, serves Studio, and opens the local URL. `{{CLI_COMMAND}} studio` is an alias. Use `{{CLI_COMMAND}} serve .` when a browser should not open.

Studio requires an AQVEN project and runs with that project’s backend. It does not launch as a standalone workspace. [Studio Quickstart](/studio/quickstart/) covers the first screens.
