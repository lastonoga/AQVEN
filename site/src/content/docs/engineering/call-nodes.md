---
title: Call Nodes
description: Reuse a typed subflow through an explicit input mapping and its declared output contract.
---

Use a call node to invoke another flow when a sequence is independently meaningful, testable, and reusable. Name the target flow and bind the parent’s values into its declared input. Later nodes read the called flow’s declared output.

Avoid recursive flow calls. Extract a subflow only when it makes a boundary clearer; a call node adds a contract and trace boundary, not merely a folder structure.

The generated [Node Reference](/engineering/reference/nodes/#callnodespec) has exact fields. [Reuse a Subflow](/engineering/recipes/reuse-subflow/) shows the pattern.
