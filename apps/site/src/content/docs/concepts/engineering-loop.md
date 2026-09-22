---
title: "The engineering loop: from incident to verified fix"
description: From an unexpected result to a verified fix — understand, investigate, test the change.
---

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
one example you happened to see doesn't answer that — it only proves you fixed that one case.

That's what a saved, representative set of cases is for. Instead of testing a fix against a single
anecdote, you run it against every case you've already decided matters, and compare the whole batch to
a baseline you've already shipped. A green result means every metric you care about — accuracy,
whether the answer stays grounded in real sources, cost, whatever you've set as a gate — held up or
improved against that baseline, checked with a real statistical test rather than eyeballed. That's the
difference between "I fixed the one case I saw" and "I tested this against everything I said mattered,"
and it's what tells you the fix is safe to ship, not just that it fixed one specific case.

## How this shapes what you do

This loop isn't abstract. [From a bad answer to a verified fix](/start/engineering-loop-walkthrough/)
walks through it by hand, on AQVEN's own example project: opening the graph to understand it, tracing a
wrong answer to the one step responsible even though it's buried inside a loop, and checking a green
gate before shipping the fix.

Building and running the saved cases and comparisons that make the Test step real — datasets and
evals — has its own how-to content, coming with [Studio](/studio/).

## See also

- [From a bad answer to a verified fix](/start/engineering-loop-walkthrough/) — the same loop, done by
  hand, on a real example.
- [What this is built on](/concepts/what-this-is-built-on/) — what AQVEN takes as-is versus adds on
  top, including the guarantees every model call gets.
