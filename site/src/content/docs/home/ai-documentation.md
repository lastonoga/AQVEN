---
title: Documentation for AI
description: Give a coding agent the system context it needs to inspect, change, validate, and evaluate an AQVEN project safely.
---

Coding agents can edit source files quickly. A reliable AI-system change also needs context about the flow, types, prompts, model settings, tools, datasets, checks, and project rules that give those files meaning.

AQVEN publishes browser documentation and raw Markdown for agents. The machine-readable starting point is [`llms.txt`](/llms.txt).

## Give the agent the right context

1. Start with [`llms.txt`](/llms.txt) to find focused Markdown pages.
2. Read [Getting Started with AI](/engineering/getting-started-with-ai/) when bootstrapping a project or turning a requirement into a workflow proposal.
3. Read [AI Coding Agents](/engineering/ai-coding-agents/) for project instructions, the change protocol, and verification.
4. Use [generated references](/engineering/reference/) for exact fields, accepted values, and Python signatures.
5. Connect the [Project MCP Server](/engineering/project-mcp-server/) when the agent supports MCP so it can inspect, patch, check, preview, and run the selected project.

## Make a change reviewable

Ask the agent to inspect the relevant system contract before editing. It should state the input and output behavior it intends to change, update source YAML, prompts, or Python, run the generated checks and evaluation cases, and report the diff and evidence.

The Markdown mirror is generated from documentation source at build time. Generated reference pages come from package types and registries. Authored guides explain purpose, combinations, and verification so an agent can reason about a change rather than only match a field name.
