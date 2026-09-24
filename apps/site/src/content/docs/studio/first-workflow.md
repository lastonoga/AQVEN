---
title: Your first workflow in Studio
description: Open a project entirely from the browser — check your agent and provider keys, then land on a real graph.
---

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

The [showcase](/start/quickstart/) template gives you two real flows to look at, `support_case` and `judge_panel`, so there's
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

Before running anything, open Studio's setup screen: add `/setup` to the address bar. It has three steps.

- **Chat agent** says in one line whether the coding agent behind Studio's chat panel is signed in. If
  it isn't, the line comes with the command to run in a terminal, and **Check again** looks once more.
- **Model keys** lists every model provider the project can call, each with the environment variable it
  reads and a masked preview of the key: saved in the project's `.env` file, set in your shell, or not
  set. A key that is not set has an **Add key** button: paste the key, click **Save**, and Studio writes
  it to `.env`. If no key is set at all, a warning says so.
- **Workflows** lists every flow in the project as a card you can click, `support_case` and `judge_panel`
  for the showcase template. Clicking one opens its canvas — this is how you get to a flow Studio didn't
  land you on automatically.

The same key rows are on the [Settings](/studio/settings/) page, behind the gear in Studio's top bar.

### Check

The Chat agent step says "Signed in" (or tells you clearly that it isn't), and the Model keys step shows
at least one key with a masked value — `OPENROUTER_API_KEY` for the showcase template's default.

## 3. Open a flow's canvas

If you want the flow Studio didn't land you on, go back to the Setup screen's Workflows step and click it;
otherwise you're already looking at one. Either way, you now have a flow's canvas open in your browser,
with nothing left to install or type to get there.

## What's next

[How to read a workflow's graph](/studio/understand-the-graph/) covers the canvas in full: what each
node card shows, how loops and branches are drawn, and what the panel beside the graph tells you about
a step you've clicked on.
