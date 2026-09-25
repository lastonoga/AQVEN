# The engineering loop: from incident to verified fix

From an unexpected result to a verified fix — understand, investigate, test the change — and the same loop run in rounds until a flow holds.

## In short

When an AI workflow gives you a result you didn't expect — wrong, unsafe, too expensive, or just
inconsistent with what it gave before — this is how you get from "something's wrong" to something you
can trust again: reproduce the case, find what actually caused it, make a change, and verify that the
change is a real improvement, all before that same mistake reaches the next customer.

## Understand: what's going on

Before you can investigate anything, you need the shape of the workflow in your head: which steps
exist, which of them call a model and which just run code, and what feeds into what. That's the map
you keep, or open and look at, before you go chasing a specific problem — not something you rebuild
for every incident.

## Investigate: where it diverged

A real workflow is rarely one straight line of steps. It can branch into parallel paths, and it can
loop — running the same step more than once, once per item in a collection, or repeating a group of
steps until a condition is met. Once a workflow looks like that, "which step produced the bad output"
stops being a complete question, because that same step may have run several times in the same run,
with different inputs each time.

That's why every run of a step has its own address, not just the step's name. Alongside which step it
is, AQVEN records which parallel branch it ran on, which pass of a loop it was, and which item of a
collection it was processing when it ran. For example, AQVEN's example project drafts a reply with
three model providers running side by side, and separately loops over a case record, checking it
against business rules pass by pass until it's complete. In a run like that, the same step name can
execute many times over — once per provider, once per pass — and each of those runs gets its own
address. That's what lets you open "the second provider's draft" or "pass three of the record loop" as
one specific execution, with its own input, its own output, and its own check results, instead of a
step name that could mean any of several different runs inside the same execution.

## Test: make sure you didn't break anything else

Once you know what to change, the harder question is whether the change is actually safe. Fixing the
one example you happened to see doesn't answer that. It only proves you fixed that one case.

That's what a saved, representative set of cases is for, and an experiment that states the question
before you look at any result. It says which flow or range of nodes runs, on which cases, with which
checks, and what counts as good. For example: "better than the current agent by at least 0.05", or "not
worse by more than 0.05, and no more than 20% dearer per passing answer". A series then runs every case
for every variant, several times, and reports a verdict from a 95% interval against the margin you wrote
down. The verdict is confirmed, refuted, or inconclusive when there isn't enough data to tell. Nothing is
eyeballed, and the margin can't be moved after you've seen the numbers.

The cases are split in half. The working half is for exploring: run it as often as you like, and it
gives you signals, not answers. The held-out half is for confirming: one series when the change is done.
That series writes a finding into the project, and the project's `FINDINGS.md` collects every finding so
far. That's the difference between "I fixed the one case I saw" and "I tested this against everything I
said mattered". It's what tells you the fix is safe to ship.

## The loop runs in rounds

One incident is one pass through the loop. Building a flow that holds takes several passes, and a coding
agent can run them for you. You give it the task and what "done" means in numbers. The agent builds the
simplest flow, runs a look over the cases, and traces every failure to its first failing node. Then you
read the first traces and note the first thing that went wrong in each; the agent groups your notes into
failure modes and writes them down once you agree. It fixes what the prompt never asked for, and turns
each remaining failure mode into an experiment. It explores on working cases, confirms once on held-out
cases, and applies the finding. Then it starts the next round on fresh cases, maps new failures to the
known modes itself, and brings you only the ones that fit none. It stops when every "done" criterion is
confirmed, or the budget is spent, and reports `FINDINGS.md` and the risks left. [How an agent takes a
task to a reliable flow](../mcp-cli/research-loop.md) is that loop, stage by stage.

## How this shapes what you do

This loop isn't abstract. From a bad answer to a verified fix
walks through it by hand, on AQVEN's own example project. It opens the graph to understand it, traces a
wrong answer to the one step responsible even though it's buried inside a loop, and checks the fix with
a series before shipping it.

The saved cases and the series that make the Test step real have their own pages:
cases in Studio, Research in Studio,
how to write an experiment, and
experiments and series as an agent.

## See also

- From a bad answer to a verified fix — the same loop, done by
  hand, on a real example.
- Experiments, series and findings — the pieces behind the
  Test step.
- What this is built on — what AQVEN takes as-is versus adds on
  top, including the guarantees every model call gets.
