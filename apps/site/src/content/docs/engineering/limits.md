---
title: Limits
description: Bound requests, tools, tokens, cost, and elapsed time at the project boundary that owns the risk.
---

AQVEN accepts limits on projects, flows, nodes, and agents. A limit can cap requests, tool calls, tokens, microdollar cost, or seconds. Use an agent limit for one model call policy, a node limit for a local operation, and a flow or project limit for an end-to-end budget.

Changing a limit changes whether a run can continue; it is not a reporting-only field. Choose a bound from the task’s real latency and cost tolerance, then include a case that reaches the boundary. The generated [Common Reference](/engineering/reference/common/#limits) lists exact fields and minimum values.
