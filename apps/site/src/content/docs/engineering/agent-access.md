---
title: Agent Access to AQVEN
description: Give a coding agent focused guides, generated contracts, and project-aware MCP operations.
---

Start an agent with [`llms.txt`](/llms.txt), then let it read only relevant Markdown guides and generated references. The raw reference pages answer exact YAML and Python questions; source files answer project-specific questions.

When the agent supports MCP, start `uv run {{CLI_COMMAND}} mcp .` from the project environment. The [Project MCP Server](/engineering/project-mcp-server/) exposes checked inspection, structural patching, prompt preview, checks, and run operations. It does not replace normal source review.
