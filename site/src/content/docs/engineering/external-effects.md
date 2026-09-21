---
title: External Effects
description: Make writes, external actions, idempotency, retries, and human approval explicit.
---

An external effect can be repeated after a transient interruption unless the integration has an idempotency boundary. Declare `effect` accurately and use `idempotency_key` fields that identify the same business operation.

For a model-requested write, keep the tool list narrow and gate the tool with agent approval. For a business decision, use a typed human node before the write. Record the safe timeout outcome before enabling the action.

[Tool Approval and Human Review](/engineering/tool-approval/) explains the two review boundaries. Test duplicate and timeout cases, not just the happy path.
