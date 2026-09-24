---
title: Start
description: Build AI workflows you can trust — understand, reproduce, and fix them before a bad result reaches a customer.
---

AQVEN is a platform for building multi-step AI workflows as typed, checkable files — flows made of
nodes, each one a model call, a piece of code, a tool, or a pause for a human — that you can run, trace,
and fix step by step instead of treating as one opaque prompt.

## The pain this solves

> A 15-step LLM pipeline gave a bad answer. Today, an engineer spends 30 minutes reading logs to
> find out why. This should take 30 seconds: which step is at fault, what input it got, where that
> input came from, what prompt was built from it, what the model answered, which checks ran, and
> what happens if you change the input or prompt and rerun just that step.

## Three ways to work with AQVEN

- **Writing workflows in code** — define flows and nodes as files and let the engine run them. [Engine](/engine/)
- **Working in Studio** — build, run, and debug flows visually in the browser. [Studio](/studio/)
- **Driving it through an MCP agent** — point a coding agent at your project and have it build and fix flows for you. [MCP & CLI](/mcp-cli/)

## From a task to a flow that holds

You give a coding agent a task and say what "done" means in numbers. The agent builds the simplest flow,
checks it, and runs it over saved cases. It traces every failure to the step that caused it and hands you
the first traces to read. It groups your notes into failure modes you agree, and turns each risk into an
experiment: one question, written in a file before any data. It explores on working cases, then confirms
once on held-out cases the server kept aside. Each verdict on held-out cases becomes a
finding in the project's `FINDINGS.md`. The agent repeats this, round after round, until the findings show the
flow works reliably, or the budget is spent. You watch every run and every series in Studio, and you
approve any spend above the project's cap. [A day with AQVEN](/start/a-day-with-aqven/) follows one
such day on the showcase project, prompt by prompt. See
[How an agent takes a task to a reliable flow](/mcp-cli/research-loop/) and
[Experiments, series and findings](/concepts/experiments-series-and-findings/).

## `aqven new`: a wizard first, a template if you ask for one

On a real terminal, `aqven new my_project` doesn't just drop files on disk — it asks a short series of
questions first: which model provider you have a key for, whether the project will ever see personal
or sensitive data, a budget per run. Your answers land straight in the new project's `aqven.yaml` and
`.env`, so a fresh project is already configured, not just scaffolded.

Pass `--template showcase --provider <id>` instead and you get AQVEN's own full working example, not a
toy, with the wizard's questions already answered. It handles a customer support case end to end: it
triages the incoming message, routes it based on the type of case, narrows a general case record down
to the exact type for that case, drafts a reply with three different model providers in parallel, has
a panel of judges score the drafts and pick the best one, and sends the result to a human for approval
before it goes out. Most examples in this documentation build on this same project, so you'll
recognize pieces of it as you go. See it for yourself in the [quickstart](/start/quickstart/).
