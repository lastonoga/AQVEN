---
title: Extend Studio Presentation
description: Make typed inference inputs and outputs easier to inspect without changing workflow semantics.
---

An inference can declare display behavior so Studio presents an input or output in a useful form. Presentation changes readability in the trace; it does not change the stored value, model request, type validation, or flow behavior.

Keep a display helper deterministic and resilient to partial or failed execution data. Use it for concise summaries, structured cards, or media-friendly rendering. Validate the raw value as well as the formatted view when debugging.

See [Inferences](/engineering/inferences/) for the authored guide and the generated [Inference Reference](/engineering/reference/inference/) for display fields.
