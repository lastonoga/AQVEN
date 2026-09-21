---
title: AI Assistance
description: Work with a coding agent in the context of the selected flow.
---

Studio's chat panel can connect to a configured coding-agent backend. It keeps sessions for the project and selected flow, shows tool activity, and asks for approval when the agent backend requests it. The backend and sign-in status are visible in Studio's setup and settings views.

<img src="/images/studio/chat.png" alt="A new Studio chat thread ready to help orient an engineer in a workflow." width="360" height="240" style="height: 240px; object-fit: cover; object-position: top;" />

## Why the agent asks before running a command

The chat agent starts with no settings files loaded at all: not your global Claude configuration, not the
project's `.claude/settings.json`. Nothing in the project can grant the agent permissions, so every tool call
it cannot already run arrives in Studio as an approval.

Shell commands stay behind that approval on purpose. A shell command is one opaque string, so the permission
layer cannot tell reading a flow file from reading `.env`, where your provider keys live.

If the prompts get in the way, auto-approve specific tools when you start the server:

```bash
{{CLI_COMMAND}} dev --chat-allow-tool Read --chat-allow-tool Grep --chat-allow-tool 'Bash(rg:*)'
```

The flag is repeatable and is read only at launch, so the agent cannot widen its own permissions by editing a
file. Keep the rules narrow. `Bash(*)` would auto-approve every command, and shell quoting makes command
prefixes a weak boundary; reading and searching tools take a real path instead of a shell string, so they are
the safe ones to allow. Rules that would reach an `.env` file are refused whatever you allow.

To stop the questions entirely, run the server with `--chat-trust-project`:

```bash
{{CLI_COMMAND}} dev --chat-trust-project
```

The agent then runs every tool call without asking, and the server prints a warning on startup so the mode
cannot begin quietly. The refusal to touch `.env` still stands, but it rests on a text check of the command,
and code that builds the path instead of writing it down can walk past that check. Turn it on for a project
whose `.env` you would not mind the agent reading, or when the keys come from the process environment rather
than a file.

## Give the agent an engineering task

Give the agent a concrete task and a way to verify it. For example:

```text
Inspect support_case.triage and two failed dataset cases.
Explain which binding or prompt instruction caused the error.
Propose the smallest source change, run {{CLI_COMMAND}} check, and report the result.
```

Start with the flow ID, a target behavior, concrete evidence, and a verification request. Ask it to inspect before editing. For a behavior change, name the dataset case or failed run that should prove the result.

The chat is a project-aware assistant interface, not a second workflow editor. Read the diff and the check result before accepting a change. The agent has project context, but the workflow's contracts and dataset cases remain the evidence. [AI coding agents](/engineering/ai-coding-agents/) gives a reusable `AGENTS.md` starting point; [Project MCP server](/engineering/project-mcp-server/) explains the project operations an MCP-capable agent can use.
