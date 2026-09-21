---
title: Create a Project
description: Scaffold a minimal or showcase AQVEN project and choose the right starting point.
---

Use the `minimal` template to learn the smallest working contract. Use `showcase` to inspect supported node kinds, providers, media, human waits, and control flow in one project.

```bash
uv run {{CLI_COMMAND}} new my_workflow --template minimal --with-tests \
  --aqven-path packages/aqven
cd my_workflow/my_workflow
uv run {{CLI_COMMAND}} check .
```

The directory containing `aqven.yaml` is the project root. The template creates source definitions and generated Python types. Edit source YAML and Python code; regenerate the derived types with `uv run {{CLI_COMMAND}} generate .`.

To add AQVEN to an existing repository, place the project module under the repository package, create `aqven.yaml`, then begin with [Project Layout](/engineering/project-layout/) and [Your First Workflow](/engineering/first-workflow/).
