---
title: Studio Reference
description: Find the project sources, backend contracts, and generated references behind each Studio view.
---

Studio is a view of an AQVEN project and its local backend. It does not define a second workflow format. Use this page when a screen needs a source-level answer.

| Studio area | Project contract to inspect | Engineering guide |
| --- | --- | --- |
| Project and flow views | `aqven.yaml`, flow files, type files, loader diagnostics | [Project layout](/engineering/project-layout/) |
| Canvas and Nodes | Flow `order`, node YAML, bindings, agent/inference links | [Flows](/engineering/flows/), [Nodes](/engineering/nodes/) |
| Runs and call sheets | Run snapshot, node execution, event stream, blob values | [Run lifecycle](/engineering/run-lifecycle/), [HTTP API](/engineering/http-api/) |
| Datasets | `Dataset` YAML, case schema, range fixtures | [Datasets](/engineering/datasets/) |
| Evaluations | `Eval` YAML, scorers, gates, recorded results | [Testing and evaluation](/engineering/testing-and-evaluation/) |
| Review queue | Human form or tool-approval wait | [Tool approval and human review](/engineering/tool-approval/) |
| Studio chat | Project MCP and configured coding-agent backend | [Project MCP server](/engineering/project-mcp-server/) |

The Pydantic models that define YAML fields are published as the generated [Engineering reference](/engineering/reference/). The local backend exposes its raw OpenAPI contract at `/api/openapi.json` while the project server is running. Use that endpoint for a client integration; it reflects the package version serving Studio.
