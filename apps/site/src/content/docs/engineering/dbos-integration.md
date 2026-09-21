---
title: DBOS Integration
description: Understand how AQVEN uses DBOS to make workflow execution durable.
---

AQVEN runs flow execution through DBOS. DBOS preserves durable workflow state across process interruption, tracks step progress, and supports a run waiting for a human answer without holding an in-memory request open.

AQVEN maps project nodes and control structures to that durable execution model. The project still decides contracts, limits, tool effects, timeout policy, and returned values. Use [Durable Execution](/engineering/durable-execution/) for recovery, cancellation, and wait behavior; use [Run Lifecycle](/engineering/run-lifecycle/) for the client-visible states.
