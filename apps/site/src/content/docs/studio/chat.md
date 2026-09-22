---
title: How to use the AI chat in Studio
description: Pick a backend, start a thread, and let an agent run commands, edit files, and call tools on this project without leaving Studio.
---

## When you need this

Use the chat panel when you want an agent to actually work on the project you have open — not just
answer questions about it. It sits docked next to the canvas, and it runs your own local install of
Claude Code or Codex: never a hosted API, and Studio never reads or stores your credentials itself. Use
it to ask for an edit, hand it a bug to chase down, or drive the whole project the way you'd drive it
from a terminal, while watching every command, file edit, and tool call as it happens.

## Steps

- **Pick a backend.** Studio offers exactly two: Claude Code and Codex. You choose one during setup and
  can change it later from Studio's settings; whichever is selected, Studio launches your own local
  install of it and signs in with whatever session that install already has — it doesn't ask you for an
  API key.
- **Start or switch threads** from the dropdown at the top of the panel. **New thread** starts one
  against the flow you currently have open; the dropdown also lists every thread you've already started,
  labeled with its backend and flow, so you can jump back into an earlier conversation instead of losing
  it when you open something else.
- **The model, effort, and approval-mode menu is one popover**, opened from the button next to the
  composer. It lists the models your backend's catalog offers, a reasoning-effort slider for models that
  support more than one level (Low through Max), and four approval modes:
  - **Manual** — the agent asks before it changes anything.
  - **Edit automatically** — the agent edits files without asking.
  - **Plan** — the agent explores and proposes, without editing.
  - **Trust** — the agent runs everything without asking, including commands.
- **Changing this menu on an open thread changes that thread immediately** — it's not a setting saved
  for next time. Switch the model, effort, or approval mode while a thread is open, and Studio applies it
  to that thread right away, mid-conversation. Only when no thread is open yet does your pick become the
  starting point for the next one you create. The menu's button always shows what the open thread is
  actually set to, not a choice you made but haven't applied.
- **What the agent can do inside your project:** run shell commands, showing the command and its exit
  code; edit files, showing a diff of the change; and call tools, including tools from any MCP server
  connected to the project — shown as the server name and tool name together, with its arguments and
  result.
- **An approval gate shows up as an Allow/Deny bar right on the tool call it belongs to.** Whenever the
  current approval mode requires your decision before a command runs or a file gets written, the tool's
  card grows a bar with **Allow** and **Deny** buttons and a short line saying what it's asking
  permission for. Nothing happens until you answer.
- **Interrupt a running turn** by clicking the composer's button while the agent is working — it
  replaces the send button for as long as a turn is in progress, and clicking it stops the agent where it
  is.
- The **Add context** button next to the composer and each message's **more actions** (`⋯`) button don't
  do anything yet — they're placeholders reserved for later.

### Example

Open the showcase project's `support_case` flow and its chat panel. Start a new thread, leave approval
mode on **Manual**, and ask: "Add a `promises` scorer to the `reply_quality` eval." The agent reads the
eval file, then proposes writing the change — because the thread is in Manual mode, an Allow/Deny bar
appears on that edit before anything is written. Click **Allow**, and the diff lands in the file.

Now open the model menu and switch approval mode to **Trust** without starting a new thread. Ask it to
run `{{CLI_COMMAND}} check` to confirm the eval file is still valid. This time no approval bar appears —
the mode change applied to the thread you already had open, so the same thread that just asked
permission now runs the command on its own and shows you the exit code.

## See also

- [How to check Studio's settings](/studio/settings/) — where the chat backend is chosen and switched.
- [How to check a project before committing](/engine/check/) — the command the example asks the agent
  to run.
- [How to read an eval and its gate](/studio/evals/) — where a scorer you asked the agent to add actually
  shows up.
- [How to read a workflow's graph](/studio/understand-the-graph/) — the canvas the chat panel sits next
  to.
