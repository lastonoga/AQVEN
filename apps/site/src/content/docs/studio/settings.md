---
title: How to use Studio settings
description: Add the model keys your workflows need, connect your coding agent, check the Studio chat sign-in, set the research spend cap, and update AQVEN, all from one Settings page.
---

## When you need this

Use this right after `{{CLI_COMMAND}} new`, the first time you open Studio: you want working model
keys, your coding agent connected to the project, and the Studio chat signed in. Come back later to
replace a key, change the research spend cap, or update AQVEN.

## Steps

- Click the gear at the right end of Studio's top bar. **Settings** opens as one page. The line under
  the title names the project package and the AQVEN version. Five sections follow, top to bottom.
- **Model keys** has one row per model provider: "Your workflows call models through these providers."
  A row is in one of three states:
  - **Saved in .env.** The row shows a masked value, like `••••0860`, and the variable name. **Replace**
    opens a password field for a new value. **Remove** deletes the line from the project's `.env` file.
  - **Not set.** **Add key** opens the same password field. **Save** writes `NAME='value'` to the `.env`
    file next to `aqven.yaml`. Studio creates that file if it is missing and keeps it out of git with a
    `.gitignore` line in the same folder.
  - **From your shell.** The variable is exported in the shell that started Studio, and the shell wins
    over `.env`. The row has no buttons: change the value in the shell. If `.env` also has a value for
    the same variable, the row says that the `.env` value is not used.
- A key never appears in full. The page shows only the masked value, before and after you save.
- If the engine refuses a value, the reason appears under the row and the field stays open. For
  example, a key with a line break in it is refused.
- **Other secrets** appears below Model keys only when a tool or an MCP server of the project declares
  a secret. Each variable gets one row with the same states and buttons, plus the tools and servers that
  use it.
- **Your coding agent.** `{{CLI_COMMAND}} new` puts a `.mcp.json` file in the folder it creates, so
  Claude Code started in that folder connects to the project by itself. For Claude Code started in another
  folder, copy the `claude mcp add` command shown here and run it once in that folder. **Cursor,
  Claude Desktop and other clients** unfolds the JSON block for any client that starts an MCP server
  over stdio.
- **Studio chat.** Pick **Claude Agent** or **Codex** for new chat threads. One line says whether that
  backend is signed in, and with which account when it is known. When it is not signed in, the page
  shows the command to run in a terminal: `claude auth login` or `codex login`. Then click **Check
  again**. Technical details appear only when the check itself fails.
- **Research budget** shows the project spend cap: every series runs under it and pauses for your
  approval when its spend reaches 90% of it. **Set in** says where the cap comes from: `aqven.yaml`, a local
  override on this computer, or the default of $1.00 when `aqven.yaml` has no `research` block. Type a new
  amount under **Cap in aqven.yaml** and click **Save**: Studio writes `research.spend_cap_usd` into
  `aqven.yaml` and keeps the rest of the file as it was. If the file changed since the page read it, the
  save is refused under the field; the page reads the file again, so click **Save** once more. When a local
  override is active, the section says so and **Remove override** deletes it, so `aqven.yaml` decides
  again. [How to run a series](/engine/run-a-series/) explains the cap and the override.
- **About** shows the project folder, the AQVEN version, and the update command. Run it in the project
  folder, then restart Studio.

### Example

Create the [showcase](/start/quickstart/) project and start Studio:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
{{CLI_COMMAND}} studio
```

Click the gear. In **Model keys**, the `openrouter` row reads `Not set · OPENROUTER_API_KEY`. Click
**Add key**, paste your key, and click **Save**. The row changes to the masked value and
`saved in .env`, and `my_project/my_project/.env` now has this line:

```text
OPENROUTER_API_KEY='<your key>'
```

To update AQVEN later, copy the command from **About** and run it in the same folder:

```bash
uv lock --upgrade-package aqven && uv sync
```

Then stop Studio and start it again.

## See also

- [How to set a secret for a provider, tool, or MCP server](/integrations/secrets-and-environment/): the
  same `.env` file by hand, and the `ref:env/NAME` format that tells the engine which variable to read.
- [How to manage secrets](/engine/secrets/): the CLI report of the same keys, with the same masking.
- [How to connect a model provider](/integrations/model-providers/): declare a provider, so its key
  shows up in **Model keys**.
- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/): the same MCP connection, with
  the details for clients that speak HTTP.
- [How to use the AI chat in Studio](/studio/chat/): where the backend you pick in **Studio chat** runs.
