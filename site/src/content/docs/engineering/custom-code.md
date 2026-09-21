---
title: Custom Code
description: Add project Python functions, policies, evaluators, and display formatters without losing typed boundaries.
---

Use project Python code for deterministic transformations, code-backed tools, provider factories, custom policies, checks, evaluators, and presentation helpers. Reference a callable through a supported code reference and keep its input/output contract declared at the YAML boundary.

Use a built-in policy with `use:` when it already expresses the behavior. Use `run:` for a project function only when the project owns a distinct rule. [Code References and Aliases](/engineering/code-references-and-aliases/) explains resolution; [Built-in Functions](/engineering/built-in-functions/) lists built-ins.
