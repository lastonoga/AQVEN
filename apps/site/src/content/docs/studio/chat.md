---
title: How to use the AI chat in Studio
description: Pick a backend, start a thread, and let an agent run commands, edit files, and call tools on this project without leaving Studio.
---

## When you need this

Use the chat panel when you want an agent to actually work on the project you have open — not just
answer questions about it. It stays docked beside every page of the project, in both Flow and Research
mode, and it runs your own local install of
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
- **Keep writing while the agent works.** The text box and **Send** stay available during a turn: press
  Enter or click Send, and the message shows up at the bottom of the thread, marked **Queued — the agent
  reads it at its next step**. The agent picks it up as soon as the command or tool call it's running
  finishes, and from that point the message sits in the conversation like any other you wrote. If the
  agent was already writing its final answer, it reads your message right after that answer ends, as a new
  turn. A message marked **Queued — sent after this turn** waits for the current turn to end and then
  starts the next one: Codex does this when it can't take new input yet, for example in the first moment
  of a turn.
- **Long threads open fast and look exactly as they did live.** Opening a thread, switching back to it, or
  reloading the page shows its newest turns right away: every thinking block, every tool call with its full
  arguments and result, commands with their output, file edits with their diffs, and the answers — nothing is
  summarised or left out. Scroll up and earlier turns load by themselves as you get near the top; there's no
  button to press. New activity keeps streaming in at the bottom as usual.
- **Stop a running turn** with the square button next to Send. It stops the agent where it is. Messages
  you queued aren't dropped — the agent reads them next, in a new turn.
- **If Stop doesn't take, use Reset.** When the thread still shows **Working…** a few seconds after you
  pressed Stop, the square button turns into **Reset**. Reset doesn't wait for the agent: Studio closes the
  agent's process, marks the turn stopped, and unlocks the composer. Your next message starts the agent
  again and it carries on with the same conversation.
- **The agent can carry on by itself.** If it started a command in the background during a turn, it may
  wake up after that turn ended — when the command finishes — and keep working. That work shows up as a new
  turn you didn't write a message for, opened by a line reading **The agent continued on its own**, and
  Stop works on it like on any other turn.
- **A server stop or restart never leaves a thread stuck.** If the Studio server stops while a turn is
  running, the turn shows as stopped as soon as the server is back, instead of **Working…** forever. Send a
  message to go on; the agent resumes the conversation where it left off.
- **The agent can't stop or restart the server it runs in.** A command that would kill the project server,
  or start another `{{CLI_COMMAND}} dev` or `{{CLI_COMMAND}} serve`, is refused and the agent is told why —
  that server is what keeps the chat alive. It never needs a restart to use new code: the next run picks up
  whatever the agent or you changed in the project's Python files — code steps, tools, generated types.
- The **Add context** button next to the composer and each message's **more actions** (`⋯`) button don't
  do anything yet — they're placeholders reserved for later.

### Example

Open the [showcase](/start/quickstart/) project's `support_case` flow and its chat panel. Start a new thread, leave approval
mode on **Manual**, and ask: "Add a `not_empty` check on the reply text to the `reply_look` experiment."
The agent reads `experiments/reply_look/experiment.yaml`, then proposes writing the change. Because the
thread is in Manual mode, an Allow/Deny bar appears on that edit before anything is written. Click
**Allow**, and the diff lands in the file.

Now open the model menu and switch approval mode to **Trust** without starting a new thread. Ask it to
run `{{CLI_COMMAND}} check` to confirm the experiment file is still valid. This time no approval bar appears —
the mode change applied to the thread you already had open, so the same thread that just asked
permission now runs the command on its own and shows you the exit code.

## See also

- [How to set up a coding agent outside Studio](/mcp-cli/set-up-an-agent-outside-studio/) — the same
  setup for Claude Code, Codex, or another agent you start yourself instead of from this panel.
- [How to use Studio settings](/studio/settings/) — where the chat backend is chosen and switched.
- [How to check a project before committing](/engine/check/) — the command the example asks the agent
  to run.
- [How to use Research in Studio](/studio/research/) — where a check you asked the agent to add shows
  up once a series scores it, and where **Suggest hypotheses** hands the chat its next task.
- [How to read a workflow's graph](/studio/understand-the-graph/) — the canvas the chat panel sits next
  to.
