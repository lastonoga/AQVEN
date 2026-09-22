---
title: How to check Studio's settings
description: What each of Studio's five settings sections shows, and the one control among them that actually changes anything.
---

## When you need this

Use this when you want to confirm which project Studio is serving, whether your chat agent is signed
in, which model keys and secrets actually resolve, how to connect another MCP client to this project,
or how to update. Almost everything on this screen is a status display or a copy-paste command — only
one control on it changes anything.

## Steps

- Open the dropdown at the top of the [chat panel](/studio/chat/) — the same one you use to switch
  flows and threads — and click **Studio settings**. A dialog opens with five sections listed down the
  left: Project, Chat agent, Model keys, MCP connections, Updates.
- **Project** shows the folder Studio was launched in, the package name, the engine version, the paths
  to the project's `aqven.yaml` and lock file, the index status (`ready`, `building`, or `degraded`),
  and a problem count of errors, warnings, and info. Below that, a command to open a different project
  by running Studio again in its own folder. All of it is read-only.
- **Chat agent** is the one section with something to click: a switch between **Claude Agent** and
  **Codex**. Changing it only decides which backend the next new thread starts against — any thread
  you already have open keeps running on the backend it started with. Below the switch, a status
  readout for whichever backend is selected: sign-in state, sign-in method (subscription or API key),
  account, and any extra detail, with a **Check again** button that re-runs the check rather than
  changing anything.
- **Model keys** holds two panels. The first, also called Model keys, lists one row per model provider
  a node in this project can call. The second, Project secrets, lists one row per secret a tool or MCP
  server in this project declares. Both show a masked value (or "not set") and whether it resolved
  from the process environment or the project's `.env` file — the same rows, in the same shape, as the
  CLI's [`secrets`](/engine/secrets/) report. There's no field here to type a key into.
- **MCP connections** shows this project's own AQVEN MCP server address and how it authenticates,
  plus two copy-paste snippets for connecting an external agent to that same server: one command for
  Claude Code, one JSON block for stdio clients like Cursor or Claude Desktop.
- **Updates** shows the installed engine version and two copy-paste commands for upgrading it, one for
  `uv`, one for `pip`.
- Nothing on Project, Model keys, MCP connections, or Updates has a form to fill in. If a key or secret
  shows as not set, setting it isn't something you do on this screen — see
  [How to manage secrets](/engine/secrets/) below.

### Example

Open the [showcase](/start/quickstart/) project in Studio:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
{{CLI_COMMAND}} studio
```

Click the dropdown at the top of the chat panel and choose **Studio settings**. The dialog opens on
**Project**, showing the folder, the `showcase` package, and `no problems` if the tree is clean.

Click **MCP connections** and copy the Claude Code command straight out of the panel:

```bash
claude mcp add --scope project aqven -- uv run aqven mcp
```

Run that in the project's folder from an ordinary terminal, and a Claude Code session outside Studio
gets the same tools the Studio chat already calls — nothing in the panel itself ran that command for
you.

## See also

- [How to manage secrets](/engine/secrets/) — the CLI's own read-only report on the same provider keys
  and secrets, down to the same masking rule. Neither this screen nor that command lets you set a key;
  that's done by exporting it or adding it to the project's `.env` file.
- [How to set a secret for a provider, tool, or MCP server](/integrations/secrets-and-environment/) —
  actually setting the value this screen only reports on.
- [How to connect a model provider](/integrations/model-providers/) — declaring a provider in the
  first place, before it can show up in this screen's Model keys panel.
- [How to use the AI chat in Studio](/studio/chat/) — the panel whose dropdown opens this dialog, and
  where the backend you pick in Chat agent actually gets used.
- [How to check a project before committing](/engine/check/) — the errors, warnings, and info counts
  behind the Project section's problem count.
