---
title: From a bad answer to a verified fix
description: One example, three moves — see the graph, find the cause, verify the fix.
---

## What you'll have at the end

You will have opened the same project from the quickstart in your browser, looked at its graph, run
a case that exposes a real gap in how it handles a customer's wording, traced that run down to the
exact node responsible, and seen how a case, an experiment and a series prove a fix before you ship it.

## Before you start

The quickstart left you with a working project and a flow you ran from the terminal. From the same
project folder, start Studio:

```bash
uv run {{CLI_COMMAND}} studio .
```

This is the same command the quickstart's `{{CLI_COMMAND}} new` output called `{{CLI_COMMAND}} dev` —
`studio` is just its other name. It starts a local server for this project, watches its files for
changes, and opens Studio in your browser, pointed at the project you already have.

## 1. Understand: the graph in the canvas

Studio opens on the canvas for your flow. It draws every node in `support_case` as a graph: boxes for
each step, arrows for what feeds what. A loop node like the one that fills in and checks the case
record is drawn as a single box that expands to show the steps running inside it. Click any node and a
panel opens beside the graph with its definition — what it does, what feeds it, what reads its output —
and, for a step that calls a model, the exact prompt it sends.

This is where you get your bearings before anything goes wrong: what actually runs, in what order, and
which of these steps call a model versus which just run code.

## 2. Investigate: find the cause

Open `support_case`'s runs and start a manual run. Fill in its message field the way a customer would
actually write it, not the way a category label would:

> The light strip controller gets hot after ten minutes.

The customer never uses the word "overheating" — they say the thing gets hot. Buried in this flow is a
loop that fills out a case record and checks it against business rules before anything is decided: one
of those rules exists specifically to catch this, and says that a record whose symptom is "overheating"
must also be flagged as a safety risk. If the step that reads the customer's message doesn't file this
symptom under that exact label, that rule never fires, and the case can come out the other end without
its safety flag set — a wrong answer that looks perfectly ordinary in the final reply.

This is the situation the runs screen is built for. Open the run, and it lists every node in the order
it executed, colored by whether it succeeded, failed, or is still waiting. Open the loop node: each of
its passes is right there, one row per attempt, so you can see exactly what the record looked like on
every pass and whether the check step raised anything against it. Click into the pass that produced the
final record and you get the input it read, the prompt it was sent, the output it returned, and the
result of the checks that ran against that output — all for that one step, not the whole run.

That's the node at fault: not the checker (it did exactly what its rule says), and not anything
downstream (they all correctly acted on the record they were handed) — it's the step that read the
customer's words and decided what symptom label to file them under. Once you can see that step's input
and output side by side, the gap between "gets hot" and "overheating" stops being a mystery and becomes
one specific field, on one specific node, that you can go fix.

## 3. Test: verify the fix

Fixing that one node's prompt so it recognizes "gets hot" as overheating is easy. Knowing the fix holds on
more than the one case you typed, and didn't quietly break something else, is the harder part. That's
what experiments and series are for.

1. **Keep the case.** On the run, click `To cases`. Studio drafts a dataset case from the run: its input,
   context and the outputs of its top-level nodes. The chat writes it into the flow's dataset with tags,
   after asking you for the expected output: a record with the symptom `overheating` and the safety flag
   set.
2. **Write the question before the data.** Ask the chat for an experiment on the step you fixed. The
   question could be: on the cases tagged for this wording, does the record come out right in more than
   90% of attempts, with a margin of 0.05? The experiment names the range of nodes that runs, the cases by
   their tags, the check against the expected output, and the threshold. See
   [How to write an experiment](/engine/experiments/).
3. **Explore on working cases.** In **Research**, open the experiment and launch it with the purpose
   **Explore · working cases**. The series runs every selected case several times and gives numbers and a
   `signal`, never a finding. Read the cases that failed, change the prompt, and run it again, one change
   at a time.
4. **Confirm once on held-out cases.** When the change is done, launch it once with **Confirm · held-out
   cases**: the half of the cases you didn't tune against. The series gives a verdict. `confirmed`
   means the 95% interval cleared 0.90 by more than the margin, `refuted` means the whole interval fell
   short of that, and `inconclusive` means there aren't enough cases to tell. The verdict is written into
   the project as a finding, and `FINDINGS.md` gains a line.

Series also catch risks you didn't go looking for. On this project, one series showed
`gemini-2.5-flash-lite` on the `triage` step breaking the 200-character limit of an observation three
times in a row, until the run ended `MODEL_RETRIES_EXHAUSTED`. The engine refused the invalid output, as
designed, and the series counted a failure: a risk you now know about, not a surprise in production.

That finding, not the one case you fixed by hand, tells you the fix is safe to ship. Hand the whole loop
to a coding agent and it runs these rounds for you: see
[How an agent takes a task to a reliable flow](/mcp-cli/research-loop/).

## What's next

[Where to go next](/start/where-next/) lays out the paths from here, depending on how you plan to work
with AQVEN day to day.
