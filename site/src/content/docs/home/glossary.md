---
title: Glossary
description: Shared terms used across Engineering, Studio, runtime, and generated-reference documentation.
---

Shared terms let engineers and coding agents describe the same system boundary without reconstructing the repository from source files. Use these definitions when reviewing a workflow design, a run, or a proposed change.

| Term | Meaning |
| --- | --- |
| Agent | A model configuration: model route, settings, tools, instructions, limits, and output behavior. |
| Inference | A typed model task with input, output, prompt, checks, and examples. |
| Flow | A typed workflow contract with ordered nodes and return bindings. |
| Node | One execution step in a flow, such as code, model, tool, human, map, or switch. |
| Tool | A code-backed or MCP-backed capability that a node or model agent can invoke. |
| Dataset case | A named input and optional expected output, context, metadata, and boundary fixture. |
| Run | One execution of a flow, identified by a run ID and recorded with its source version. |
| Execution address | A node plus optional branch, map item, or loop iteration inside a run. |
| Wait | A durable paused state waiting for a human form or a tool-approval answer. |
| Project MCP server | AQVEN’s interface for a coding agent to inspect, edit, check, preview, and run a project. |
| Model-facing MCP server | A remote server that provides tools to an AQVEN model agent. |
| Generated reference | Documentation emitted from source types, command registries, schemas, or API contracts. |
