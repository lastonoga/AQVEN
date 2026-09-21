---
title: Durable Execution
description: Understand how AQVEN uses DBOS to recover runs, coordinate control flow, and wait for people safely.
---

AQVEN runs each flow as a DBOS workflow and each node as durable work inside that run. AQVEN still owns the project contract, the interpreter, control-flow rules, values, and Studio-facing trace. DBOS owns durable workflow execution, persisted steps, events, waits, recovery, and cancellation primitives.

## What survives an interruption

Completed node work, the current run state, events, and a human or approval wait are recorded for the run. When the process starts again, AQVEN can continue or inspect that recorded run instead of treating it as a fresh request.

## Control flow remains an AQVEN concern

A `switch`, `map`, `parallel`, `loop`, `call`, or `narrow` node is authored in AQVEN YAML and evaluated by AQVEN’s interpreter. DBOS supplies durable child workflows, steps, and cancellation where that control flow needs them. The split is intentional: the flow stays a portable AQVEN project contract while execution is recoverable.

## Human and approval waits

A human node stores its form, assignee, timeout policy, and execution address. A deferred model-tool approval does the same for a tool call. A later answer resumes the recorded run at that address. It does not replay arbitrary earlier external effects.

## Design implications

- Make external write tools idempotent.
- Keep node inputs and outputs typed and bounded so a resumed run has a clear state boundary.
- Put a human approval before an irreversible external effect.
- Use `fork` when you want to explore a changed input, agent, or prompt from a known point.
- Use datasets to recreate an input before making a flow source change.

Read [Run Lifecycle](/engineering/run-lifecycle/) for the user-facing operations and [Tools and Human Steps](/engineering/tools-and-human-steps/) for the authoring contracts.
