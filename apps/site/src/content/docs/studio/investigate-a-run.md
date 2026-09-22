---
title: How to investigate a run
description: Open a run, trace a result back to the exact node execution that produced it, and read its input, prompt, output, and checks.
---

## When you need this

Use this when a run gave you a result you didn't expect and you need the real cause, not a guess.
The runs screen is built to answer, in order: which step is at fault, what input it got, where that
input came from, what prompt was built from it, what the model answered, which checks ran against
that answer, and what happens if you change the input or the prompt and rerun just that one step.

## Steps

- Open a flow's runs screen and pick a run from the picker at the top — search by run reference,
  status, or the dataset case it used. If nothing is selected yet, Studio shows the most recent run.
  Two buttons next to the picker start a new one: `Start a run` sends you to
  [datasets](/studio/datasets/) to pick a saved case, `Enter input manually` opens a form on this same
  screen instead.
- The header above the timeline shows the run's status and mode, when it started, and the spec hash it
  ran against. If this run was forked from another one, a `forked from` link takes you there; if the
  flow's definition changed since this run happened, a warning says so. Four metric cards give you
  cost, duration, tokens, and a nodes count with how many failed. If the run is waiting on a person, a
  panel lists which node, who it's assigned to, and the deadline — that's what
  [responding to a review](/studio/respond-to-a-review/) resolves. If the run ended in an error, a red
  panel shows the error code, message, which node it happened at, and a hint.
- Below that is the stage timeline: one card per top-level node, in the order the flow defines them,
  plus grey "not started" cards for anything that hasn't run yet. A `loop`, `parallel`, `map`, or
  `switch` node's card holds a matrix instead of a single result — one column per call: one pass of a
  loop, one branch of a parallel, one item of a map.
- Click any cell in a matrix — input, prompt, output, whichever row you want — and a side panel opens
  to that exact cell. This is what makes "which execution" a real, clickable thing instead of a guess:
  the panel's title is the node's id, and right under it are the branch, iteration, or item number that
  identify this one execution among however many times that node ran. That's the same address the
  engine itself records for every execution — see
  [the engineering loop](/concepts/engineering-loop/) for why every run of a step needs one.
- If a column belongs to a nested `loop`, `parallel`, `map`, `switch`, or a called sub-flow, its matrix
  opens right below as its own panel, labeled `Inside <name>` — click into that one the same way, and it
  can open another level under it. That's how you get from a top-level container all the way down to
  one specific model call inside a loop inside a parallel branch.
- If a node retried after a failure, a list of its failed attempts appears under its matrix: one row per
  attempt, with what caused it, what the engine did about it, the error message, and a raw excerpt of
  what the model actually returned. A loop's card also ends with a line saying why it exited and which
  pass it kept.
- The side panel itself has five tabs: `model` (which agent, which inference, which actual model
  answered), `input` (what this call read, and from which upstream node), `prompt` (the prompt as it was
  actually sent — a numbered list of messages — with the original template on disk collapsed underneath
  it), `output` (what came back), and `checks` (every check that ran, pass or fail, and for a human step,
  who it waited on and what they answered). A formatted/raw switch above the panel's body — same
  mechanism as the [node inspector](/studio/understand-the-graph/) — flips every section between a
  readable view and the raw JSON.
- To start a manual run, drag the start and end handles on the node range picker to choose which stages
  to run, or click a single node to run only that one stage — the same node you just found to be at
  fault, with a changed prompt or a changed input, is a valid range of one. Studio checks live whether
  the range you picked has everything it needs. Fill in only the input fields that range actually reads;
  if you're starting in the middle of the flow, you also get a JSON field for each earlier node's output
  the range depends on, with a shortcut to copy it straight from a previous run. Add run context (date,
  time zone, locale, tenant) if the flow reads any of it, review the summary, and submit — a manual run
  always executes live, calling real models and tools.

### Example

Open a run of the `support_case` flow and find `drafts`, a parallel node: its matrix has one column per
model provider drafting a reply side by side. Click the `output` cell of one column and the side panel
opens on that provider's draft text; switch to the `prompt` tab in the same panel and you see the exact
prompt only that provider received, not the other two.

Now open `record`, a loop that fills in the case record and checks it against business rules pass by
pass. Its matrix has one column per pass — `record__extract` reads the case, `record__validate` checks
the result. Click `record__validate`'s output on the first pass and compare it with a later pass: if a
rule failed the first time and passed the next, the checks tab shows exactly which rule and why, and the
loop's footer names which pass it kept.

## See also

- [The engineering loop](/concepts/engineering-loop/) — why every execution needs its own address, and
  how investigating fits between understanding a flow and testing a fix.
- [Finding the node where a workflow went wrong](/concepts/finding-the-node-that-went-wrong/) — the
  four-field address behind every cell in this screen's matrix, spelled out.
- [From a bad answer to a verified fix](/start/engineering-loop-walkthrough/) — the same screen, walked
  through by hand on one real case.
- [How to read a workflow's graph](/studio/understand-the-graph/) — the node inspector this screen's
  side panel borrows its formatted/raw switch from.
- [How to work with datasets in Studio](/studio/datasets/) — where `Start a run` sends you to pick a
  case.
- [How to respond to a human-review request](/studio/respond-to-a-review/) — what to do with a run
  that's waiting on a person.
- [How to pause for a person](/engine/human-node/) — what a human node actually is.
