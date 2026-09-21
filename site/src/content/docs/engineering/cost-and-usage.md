---
title: Cost and Usage
description: Bound model and tool work, inspect recorded usage, and use cassettes for repeatable offline runs.
---

Apply limits at the project, flow, node, or agent boundary. Limits can bound requests, tool calls, tokens, cost in microdollars, and elapsed seconds. The narrowest boundary that expresses the product requirement is usually easiest to reason about.

Runs record token usage, cost, attempts, and timing. Inspect them in Studio before optimizing. Use cassettes to replay model interactions in development or tests without a live provider call. [Automated Tests](/engineering/automated-tests/) explains the test path; [Limits](/engineering/limits/) explains the fields.
