---
title: Structured Output
description: Request a declared response type, select a compatible output mode, and handle invalid model results.
---

An inference declares the output type. An agent decides how to ask the selected model for that structure with `output.mode`: `auto`, `native`, `tool`, or `prompted`. AQVEN validates the response against the declared type after a model call.

Use `auto` first. Test `native` or `tool` when a provider supports a stronger structured-output path. Use `prompted` only when the provider cannot use another route and the validation and retry behavior are acceptable for the task.

`strict`, `retries`, `on_refusal`, and `on_truncated` alter failure behavior. A schema-valid result may still be semantically wrong, so pair structural validation with dataset cases and checks. [Agents and Models](/engineering/agents-and-models/#compare-output-modes) and the generated [Agent Reference](/engineering/reference/agents/) contain exact options.
