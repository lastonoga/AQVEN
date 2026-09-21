---
title: AQVEN
description: Build AI workflows you can trust — understand, reproduce, and fix them before a bad result reaches a customer.
---

## The pain this solves

> A 15-step LLM pipeline gave a bad answer. Today, an engineer spends 30 minutes reading logs to
> find out why. This should take 30 seconds: which step is at fault, what input it got, where that
> input came from, what prompt was built from it, what the model answered, which checks ran, and
> what happens if you change the input or prompt and rerun just that step.

## Three ways to work with AQVEN

- **Writing workflows in code** — define flows and nodes as files and let the engine run them. [Engine](/engine/)
- **Working in Studio** — build, run, and debug flows visually in the browser. [Studio](/studio/)
- **Driving it through an MCP agent** — point a coding agent at your project and have it build and fix flows for you. [MCP & CLI](/mcp-cli/)

## One example for everything

The template that `aqven new` generates — called showcase — is a full working example, not a toy.
It handles a customer support case end to end: it triages the incoming message, routes it based on
the type of case, narrows a general case record down to the exact type for that case, drafts a reply
with three different model providers in parallel, has a panel of judges score the drafts and pick the
best one, and sends the result to a human for approval before it goes out. Most examples in this
documentation build on this same project, so you'll recognize pieces of it as you go. See it for
yourself in the [quickstart](/start/quickstart/).
