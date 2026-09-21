---
title: AI Assistance
description: Work with a coding agent in the context of the selected flow.
---

Studio's chat panel can connect to a configured coding-agent backend. It keeps sessions for the project and selected flow, shows tool activity, and asks for approval when the agent backend requests it. The backend and sign-in status are visible in Studio's setup and settings views.

<img src="/images/studio/chat.png" alt="A new Studio chat thread ready to help orient an engineer in a workflow." width="360" height="240" style="height: 240px; object-fit: cover; object-position: top;" />

## Give the agent an engineering task

Give the agent a concrete task and a way to verify it. For example:

```text
Inspect support_case.triage and two failed dataset cases.
Explain which binding or prompt instruction caused the error.
Propose the smallest source change, run {{CLI_COMMAND}} check, and report the result.
```

Start with the flow ID, a target behavior, concrete evidence, and a verification request. Ask it to inspect before editing. For a behavior change, name the dataset case or failed run that should prove the result.

The chat is a project-aware assistant interface, not a second workflow editor. Read the diff and the check result before accepting a change. The agent has project context, but the workflow's contracts and dataset cases remain the evidence. [AI coding agents](/engineering/ai-coding-agents/) gives a reusable `AGENTS.md` starting point; [Project MCP server](/engineering/project-mcp-server/) explains the project operations an MCP-capable agent can use.
