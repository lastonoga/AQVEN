---
title: Settings
description: Configure local project access and integrations.
---

Open **Settings** to inspect the local Studio configuration for a project. The current UI shows provider-key availability, model connections, and coding-agent setup state. Keep credentials in the supported secret or environment configuration; flow YAML should refer to a key, such as `ref:env/OPENROUTER_API_KEY`, rather than contain its value.

## Check configuration in this order

1. Confirm Studio opened the expected project in **Project**.
2. Confirm the selected provider route exists in `aqven.yaml` and its environment secret is available to the backend process.
3. Confirm model compatibility with `uv run {{CLI_COMMAND}} models check --project .`.
4. For a coding-agent panel, confirm its backend and sign-in state before starting a session.
5. For MCP, inspect the project declaration and the backend connection separately. A listed MCP server does not prove its remote URL is reachable.

When a model call fails, first check that the chosen provider is configured and that the key is available to the running backend. Then inspect the failed call in [Runs](/studio/runs/) for the provider response. [Agents and models](/engineering/agents-and-models/) shows how the project selects a model; [MCP connections](/engineering/mcp-connections/) covers model-facing remote tools.
