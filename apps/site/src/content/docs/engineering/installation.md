---
title: Installation
description: Install AQVEN from one package, create a project, and open Studio.
---

AQVEN installs as a single Python package. Studio ships inside it as a built bundle, so running it needs no
Node.js toolchain and no separate front-end install.

The published package name remains a central placeholder until release:

```bash
uv tool install {{PYTHON_PACKAGE}}
{{CLI_COMMAND}} new my_project
cd my_project
uv run {{CLI_COMMAND}} dev
```

`{{CLI_COMMAND}} new` creates the project from a template, installs its environment with `uv sync`, and
generates its models. `{{CLI_COMMAND}} dev` starts the project server and opens Studio from the installed
package. Use [Secrets and Environment](/engineering/secrets-and-environment/) before a live provider run.

## From a checkout

The Python workspace requires `uv` 0.12.15 or newer and Python 3.14.

```bash
uv sync
uv run {{CLI_COMMAND}} --help
```

A checkout has no packaged bundle until you build one, so Studio is served from `apps/studio/dist`. Build it
once with `pnpm --filter @aqven/studio build`, or point the server at any build with `--studio-dist`.

Run `uv run {{CLI_COMMAND}} check .` from a project root to verify a project, not merely the CLI installation.
