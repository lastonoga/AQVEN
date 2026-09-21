---
title: Installation
description: Prepare Python, install AQVEN, and verify the command-line environment.
---

AQVEN is currently used from a local checkout. The Python workspace requires `uv` 0.12.15 or newer and Python 3.14.

```bash
cd aqven-py
uv sync
uv run {{CLI_COMMAND}} --help
```

Published package names remain central placeholders until release:

```bash
pip install {{PYTHON_PACKAGE}}
# Studio package: {{STUDIO_PACKAGE}}
```

Use [Secrets and Environment](/engineering/secrets-and-environment/) before a live provider run. Run `uv run {{CLI_COMMAND}} check .` from a project root to verify a project, not merely the CLI installation.
