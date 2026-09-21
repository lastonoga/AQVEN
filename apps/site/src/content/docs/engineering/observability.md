---
title: Observability
description: Use run state, execution addresses, call sheets, and recorded usage to explain what a workflow did.
---

A run records status, source version, output or error, cost, tokens, waits, and a sequence of node executions. An execution address distinguishes a node’s branch, map item, and loop iteration.

Inspect the first failing or unexpected node, then compare its declared binding with actual input, prompt, response, checks, tool activity, and output. Studio provides this as a trace and call sheet; the HTTP and Python APIs expose the same runtime data.

[Debugging a Workflow](/engineering/debugging/) gives the investigation order. [Run Lifecycle](/engineering/run-lifecycle/) defines status and recovery behavior.
