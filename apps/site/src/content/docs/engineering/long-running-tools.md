---
title: Long-running Tools
description: Model an asynchronous external job with polling, timeout, and a durable run boundary.
---

Use `wait` on a code-backed tool when the first call starts work and a polling function can later retrieve its terminal result. Declare `poll`, `interval_seconds`, and `timeout_seconds` on the tool.

The tool’s output contract still describes the completed result. Choose an interval that respects the upstream service and a timeout that has a meaningful product outcome. Make the start operation idempotent, because durable execution may retry after interruption.

MCP-backed tools do not declare `wait`; their server owns the tool schema. See the generated [Tool Reference](/engineering/reference/tools/#jobwaitspec) for the exact shape.
