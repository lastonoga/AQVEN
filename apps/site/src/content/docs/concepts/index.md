---
title: Concepts
description: The facts and decisions behind AQVEN, written once and linked from everywhere else.
---

Every how-to page teaches one task. This area is where the facts and judgment calls behind those tasks
live — written once, so a how-to page can link here instead of re-explaining them each time.

**Foundations** covers what AQVEN is actually built on, what surviving a process crash really means, and
how a project's files sit on disk. **How a step runs** goes one level deeper into the mechanics of a
model call: the three real files behind one `llm` node, the ten node kinds as a map, when to reach for
which of the three prompt levels, the five cases of a dynamic input or output shape, and what happens —
outcomes, retries, redaction — every time a model is called. **Debugging and changing a project** covers
the engineering loop from an unexpected result to a verified fix, how to address the exact step that went
wrong inside a parallel branch or a loop, the two ways to change a project's files, and how to decide
whether a step should be split, diverge, or get a critic loop in the first place.

- [What this is built on](/concepts/what-this-is-built-on/)
- [A run survives a process crash](/concepts/run-survives-a-crash/)
- [Files as source of truth](/concepts/files-as-source-of-truth/)
- [Agent, Inference, and the llm node](/concepts/agent-inference-and-the-llm-node/)
- [Ten kinds of nodes](/concepts/ten-kinds-of-nodes/)
- [Three prompt levels](/concepts/three-prompt-levels/)
- [Five cases of dynamic input and output shape](/concepts/five-dynamic-shape-cases/)
- [What happens when a model is called](/concepts/what-happens-when-a-model-is-called/)
- [The engineering loop: from incident to verified fix](/concepts/engineering-loop/)
- [How to find the node where a workflow went wrong](/concepts/finding-the-node-that-went-wrong/)
- [Two ways to change a project](/concepts/two-ways-to-change-a-project/)
- [Designing reliable workflows](/concepts/designing-reliable-workflows/)
