---
title: Documentation Home
description: Understand the AI system you are building, make a change with confidence, and find the right AQVEN manual.
---

AQVEN is an engineering environment for AI systems. It helps you define, understand, validate, test, debug, and evolve AI behavior as a system instead of leaving its logic scattered across prompts, model settings, tools, orchestration, tests, and application code.

## What you are here to do

AQVEN is useful when you need to answer questions such as:

- What system do we actually have?
- Which prompt, model, context, tool, or workflow step should change?
- Did that change improve quality for the cases that matter?
- Why did this run produce an almost-right result?
- Can a coding agent understand the system well enough to change it safely?

As systems grow, a successful execution is not enough evidence. A model, prompt, provider, retrieval strategy, schema, or orchestration change can affect quality, cost, latency, and consistency in different ways for different inputs. AQVEN makes those parts and their relationships explicit so you can inspect and improve the system deliberately.

## Who it helps

**AI engineers** use AQVEN to express workflow structure, contracts, model behavior, tools, checks, and evaluation cases in one project.

**Teams operating AI products** use it to reproduce failures, compare changes, manage quality regressions, and keep system behavior understandable as it becomes more complex.

**Engineers using coding agents** use AQVEN's project model, generated references, and AI-readable documentation to give an agent system context before it edits a workflow.

## What you gain

AQVEN gives the AI system a visible contract: typed inputs and outputs, declared nodes and dependencies, prompts and agents, tools, datasets, checks, and recorded runs. That creates a practical engineering loop:

```text
Define → Validate → Test → Run → Evaluate → Learn → Improve
```

You can use the same representation to explain a system to a teammate, inspect it in Studio, run a dataset, or give a coding agent focused context for a safe change.

## Where AQVEN fits

AQVEN works alongside the parts of your stack that already do important jobs. It uses Pydantic AI primitives for model-facing agents, providers, and tools. It uses DBOS primitives for durable execution, recovery, and waits for people. AQVEN adds the system project format, typed workflow contracts, checks, run interfaces, and Studio. [Architecture](/engineering/architecture/) explains the boundary between these layers.

## Choose your path

| If you need to… | Start here |
| --- | --- |
| Define, test, run, or integrate an AI workflow | [AQVEN Engineering](/engineering/) |
| Inspect a project, start a run, review a wait, or investigate a result | [AQVEN Studio](/studio/) |
| Bootstrap or change a project with a coding agent | [Documentation for AI](/home/ai-documentation/) |
| Find an exact field, default, schema, or Python signature | [Generated Reference](/engineering/reference/) |

Studio opens with the selected AQVEN project through `uv run {{CLI_COMMAND}} dev .` and uses the same source files and local backend data as Engineering.
