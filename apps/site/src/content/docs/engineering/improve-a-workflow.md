---
title: Improve a Workflow
description: Turn observed failures into evidence, compare a change, and keep durable engineering notes.
---

When production behavior fails, save the input, context, expected property, and relevant upstream outputs as a named dataset case. Identify the first node that differs from expected behavior, then change one explanation at a time: input, prompt, model, schema, node, or policy.

Compare the same cases before and after the change. Read per-case evaluation results rather than trusting an aggregate alone. Keep a [Field Note](/engineering/field-notes/) when a provider or content observation affects a future decision.

Do not replace a regression case merely because a model now returns different text. Decide first whether product behavior changed intentionally.
