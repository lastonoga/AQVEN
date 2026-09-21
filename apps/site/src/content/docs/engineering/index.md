---
title: AQVEN Engineering
description: The developer manual for building and running AQVEN workflows.
---

AQVEN is a Python framework for typed AI workflows. A project stores its flow, node, agent, tool, prompt, and type definitions beside the Python code that implements them. The CLI checks the whole project before a model call runs.

## Start here

1. [Install AQVEN](/engineering/installation/), then [create a project](/engineering/create-a-project/) or [open an existing project](/engineering/open-an-existing-project/).
2. [Understand the project layout](/engineering/project-layout/).
3. [Read a complete starter workflow](/engineering/example-workflow/).
4. [Inspect a workflow in Studio](/studio/workflow-tour/).

## Find a topic

| If you need to… | Read |
| --- | --- |
| Connect steps and pass values | [Flows](/engineering/flows/), [Nodes](/engineering/nodes/), and [Field Bindings](/engineering/field-bindings/) |
| Choose a model and shape its output | [Agents and models](/engineering/agents-and-models/) and [Types](/engineering/types/) |
| See the exact model request | [Prompts](/engineering/prompts/) |
| Call external code, an MCP server, or ask a person | [Tools Overview](/engineering/tools-and-human-steps/), [MCP Connections](/engineering/mcp-connections/), and [Human Nodes](/engineering/human-nodes/) |
| Compare a workflow change | [Testing and evaluation](/engineering/testing-and-evaluation/) |
| Build a repeatable case or partial run | [Datasets](/engineering/datasets/) |
| Choose a model provider or write a custom factory | [Providers](/engineering/providers/) |
| Find built-in functions and authoring methods | [Built-in functions](/engineering/built-in-functions/) and [Python authoring](/engineering/python-authoring/) |
| Bootstrap a project with an AI coding agent | [Getting started with AI](/engineering/getting-started-with-ai/), [Documentation for AI](/home/ai-documentation/), and [`llms.txt`](/llms.txt) |
| Give an existing project to an AI coding agent | [AI coding agents](/engineering/ai-coding-agents/) |
| Look up accepted YAML fields and Python signatures | [Generated specification reference](/engineering/reference/flows/) and [Python API](/engineering/reference/python-api/) |

AQVEN builds on **Pydantic AI** and **DBOS**. [Architecture](/engineering/architecture/) explains which layer owns which job.
