---
title: Your first workflow in Studio
description: Open a project entirely from the browser — check your agent and provider keys, then land on a real graph.
---

# Your first workflow in Studio

## What you'll have at the end

Studio running against a real project, your coding agent and model provider keys confirmed from its
setup screen, and a workflow's graph open in the canvas — reached without reading a single log line in
a terminal.

## Before you start

You need AQVEN installed and a project to open it on. Both are one command each, covered in full on the
[quickstart](/start/quickstart/):

```bash
uv tool install {{CLI_COMMAND}}
{{CLI_COMMAND}} new my_project --template showcase
```

The showcase template gives you two real flows to look at, `support_case` and `judge_panel`, so there's
something to click through once Studio is open.

## 1. Start Studio

From the project folder `{{CLI_COMMAND}} new` created:

```bash
cd my_project/my_project
uv run {{CLI_COMMAND}} studio
```

This starts a local server for the project, watches its files for changes, and opens your browser
pointed at it. From here on, everything is a click, not a command.

Studio doesn't show you a landing page first — it opens straight on the graph of the flow you're most
likely to want: the one you last ran, or, on a project you haven't run anything in yet, the biggest one.
For the showcase template that's `support_case`, so that's the canvas you land on.

## 2. Check your setup

Before running anything, open Studio's setup screen: add `/setup` to the address bar. It has three tabs.

- **Agent** shows whether the coding agent behind Studio's chat panel is signed in, and how — a
  subscription or an API key — with a button to check again if it looks wrong.
- **Providers** lists every model provider the project's flows can call, each with the environment
  variable it reads, where its value resolved from (your shell environment or the project's `.env`
  file), and a masked preview of the key. A provider your flows actually use but that has no resolved
  key gets a warning here — the same key you'd otherwise only discover was missing when a run failed on
  it.
- **Workflow** lists every flow in the project as a card you can click, `support_case` and `judge_panel`
  for the showcase template. Clicking one opens its canvas — this is how you get to a flow Studio didn't
  land you on automatically.

If a key is missing, open the project's `.env` file and set it there; the Providers tab reflects the
change on its next check.

### Check

The Agent tab reads "SIGNED IN" (or tells you clearly that it isn't), and the Providers tab shows at
least one provider with a resolved key — `OPENROUTER_API_KEY` for the showcase template's default.

## 3. Open a flow's canvas

If you want the flow Studio didn't land you on, go back to the Setup screen's Workflow tab and click it;
otherwise you're already looking at one. Either way, you're now on a canvas: boxes for each step in the
flow, arrows for what feeds what, and a panel that opens beside the graph when you click a node.

That's as deep as this page goes into the canvas itself — the next page is where you actually learn to
read it.

## What's next

[How to read a workflow's graph](/studio/understand-the-graph/) covers the canvas in full: what each
node card shows, how loops and branches are drawn, and what the panel beside the graph tells you about
a step you've clicked on.
