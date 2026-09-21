---
title: How to open an existing project in Studio
description: Reopen Studio on a project you already have, or point it at a different project without hunting for a project picker.
---

# How to open an existing project in Studio

## When you need this

Use this once you already have an AQVEN project on disk and want Studio open on it again — after
closing your terminal, restarting your machine, or switching away to work on something else.

## Steps

- From inside the project's folder, run `{{CLI_COMMAND}} studio` (its alias `{{CLI_COMMAND}} dev` does
  the same thing). This is the same command whether the project is brand new or you've had it open a
  dozen times before.
- Studio doesn't show a landing page first. It opens straight on a flow's canvas: the flow you most
  recently ran, or, if you haven't run anything in this project yet, the one with the most nodes.
- There's no in-app project picker or "recent projects" list — which project Studio serves is decided
  entirely by which folder you ran the command in.
- To point Studio at a different project, open its settings (the dropdown at the top of the chat panel
  → **Studio settings**) and look at the **Project** section. It shows the exact command to open another
  project — run it in that other project's own folder, the same way you started this one.

### Example

Reopen a project you set up earlier:

```bash
cd my_project/my_project
{{CLI_COMMAND}} studio
```

This starts a local server for that project, watches its files for changes, opens your browser, and
lands you on the canvas of the flow you last ran — or, on a project you haven't run anything in yet,
its biggest flow.

## See also

- [Your first workflow in Studio](/studio/first-workflow/) — the from-scratch path: creating a project
  and opening Studio on it for the very first time.
- [How to check Studio's settings](/studio/settings/) — the Project section's exact command for opening
  another project, and everything else that screen shows.
