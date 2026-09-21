---
title: Trust Boundaries
description: Validate untrusted inputs, model output, and external-tool output before a later step relies on them.
---

User input, model output, remote tool output, retrieved data, and dynamic values can be untrusted. A type contract validates shape and constraints, but it does not prove factual correctness or authorize an external action.

Create a boundary before a sensitive decision: normalize or validate input in code, narrow a dynamic value, check structured model output, verify tool results, and require approval before a write. Keep external effects behind a typed tool contract and an idempotency boundary.

[Schema Design](/engineering/schema-design/) and [External Effects](/engineering/external-effects/) provide the practical patterns.
