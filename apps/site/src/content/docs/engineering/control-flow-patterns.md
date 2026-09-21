---
title: Control Flow Patterns
description: Choose the smallest control structure that makes a workflow’s decision and failure behavior explicit.
---

Use a [Switch](/engineering/switch/) to route one declared decision, [Parallel and Map](/engineering/parallel-and-map/) to fan out independent work, [Loops](/engineering/loops/) for bounded improvement, [Call Nodes](/engineering/calls-and-narrowing/) to reuse a typed flow, and [Narrow Nodes](/engineering/calls-and-narrowing/) to validate dynamic data.

Common patterns are route-then-process, fan-out-then-join, bounded draft-and-review, validate at a boundary, and compose small flows. Do not add control flow merely to mimic an agent loop; name the stopping condition, failure policy, and typed value that crosses the boundary.
