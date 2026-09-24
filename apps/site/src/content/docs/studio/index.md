---
title: Studio
description: Build, run, and debug workflows visually — the same project, from the browser.
---

Studio is the GUI side of the same project the [Engine](/engine/) pages cover. It doesn't have its own
copy of your workflow — it's the file-based project on disk, opened in a browser instead of a text
editor and a terminal. Open it from your project with `{{CLI_COMMAND}} studio` (already covered on the
[quickstart](/start/quickstart/) and the [engineering-loop walkthrough](/start/engineering-loop-walkthrough/)
— this area goes deeper on each screen than those two pages do, and
[the engineering loop](/concepts/engineering-loop/) explains why the screens are shaped the way they are).

**Get started** with [your first workflow in Studio](/studio/first-workflow/) if you haven't opened
Studio before, or [how to open an existing project](/studio/open-a-project/) if you're coming back to
one.

**Read & respond** covers the screens for understanding and reacting to what a run produced:
[how to read a workflow's graph](/studio/understand-the-graph/) (the canvas and the node list),
[how to investigate a run](/studio/investigate-a-run/) (the run debugger — the single most useful
screen when a result isn't what you expected), and
[how to respond to a human-review request](/studio/respond-to-a-review/) (the one screen here where you
submit something, not just read).

**Cases & research** covers proving a fix actually helped: [how to work with cases](/studio/cases/),
[how to use Research](/studio/research/) (the experiments, and launching a series to explore or
confirm), and [how to follow and read a series](/studio/series/).

**Chat & settings** covers the rest of the app: [how to use the AI chat in Studio](/studio/chat/) and
[how to use Studio settings](/studio/settings/).

## Server status

The right end of Studio's top bar, next to the gear, shows whether the project server answers: a dot
and a short label. **Connected** (green) means every check passed. **Needs attention** means a check
found a problem: amber for a warning, red for an error. **Disconnected** (red) means the server did
not answer two checks in a row.

Click the label to see the AQVEN version, how long the server has been running, its process ID, the
project folder, and one line for each of the four checks:

- whether the project database answers;
- whether the run engine, the part that runs and resumes workflows, answers. If it does not, the line
  tells you to restart Studio;
- errors and warnings in the project files, files Studio could not read, and whether the index has
  caught up with your last edits;
- providers in `aqven.yaml` that have no key, with a link to [Settings](/studio/settings/) where you
  add the key.

Studio asks the server every 5 seconds, and at once when you come back to the browser tab or the
network comes back. It runs the four checks every 30 seconds. None of them calls a model.

When the server stops answering, a red banner across the top of Studio says so. It shows the command
that starts the server again for this project, for example `uv run {{CLI_COMMAND}} dev /path/to/project`,
with a copy button. Studio keeps retrying every 5 seconds, and **Check now** retries at once. When the
server answers again, the banner goes away, Studio reloads the data on the open page, and
"Reconnected" appears for a few seconds. When the answer comes from a new server process, for example
after you restarted it, the message is "The server restarted" instead.
