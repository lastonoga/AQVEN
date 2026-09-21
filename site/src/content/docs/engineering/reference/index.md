---
title: Reference
description: Generated specifications, accepted values, policies, and Python signatures.
---

The reference pages in this section are generated from the AQVEN Python package. Use them to answer **which field is accepted here, which value is allowed, what is required, and what is the default**. The [scenario guides](/engineering/designing-workflows/) explain when to use those fields and how a change affects behavior.

| Looking for | Open |
| --- | --- |
| Project and provider configuration | [Project](/engineering/reference/project/) |
| Installed model provider prefixes, credentials, and extras | [Provider catalog](/engineering/reference/provider-catalog/) |
| Flow contract and invariants | [Flows](/engineering/reference/flows/) |
| All ten node kinds | [Nodes](/engineering/reference/nodes/) |
| `from`, `value`, and field constraints | [Fields and bindings](/engineering/reference/fields/) |
| Model task, agent, and tool options | [Inference](/engineering/reference/inference/), [Agent](/engineering/reference/agents/), [Tool](/engineering/reference/tools/) |
| Type, dataset, and evaluation shapes | [Types](/engineering/reference/types/), [Evaluations](/engineering/reference/evaluations/) |
| Built-in policy names and `with` parameters | [Policies and evaluators](/engineering/reference/built-in-policies/) |
| Available and pending CLI commands | [CLI commands](/engineering/reference/cli/) |
| Public Python classes and functions | [Python API](/engineering/reference/python-api/), [Python authoring API](/engineering/reference/authoring-api/) |
| REST endpoints and operation IDs | [HTTP API / OpenAPI](/engineering/reference/openapi/) |
| Project MCP operation names | [Project MCP Tool Reference](/engineering/reference/project-mcp-tools/) |
| Check and runtime diagnostic codes | [Diagnostics and Error Codes](/engineering/reference/diagnostics/) |
| Provider default key variables | [Environment Variables](/engineering/reference/environment/) |

Each model links to its generated JSON Schema. The schemas represent Pydantic fields and JSON Schema constraints. Some cross-field validators and project-level checks are not expressible in JSON Schema, so run `{{CLI_COMMAND}} check .` on a complete project.

To regenerate this section after changing the Python package, run `python site/scripts/generate_reference.py` in an environment where that package is installed. Run the same command with `--check` to detect stale generated pages. Do not hand-edit generated pages.
