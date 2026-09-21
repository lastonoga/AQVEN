---
title: ID Types
description: Give identifiers a project-level name instead of treating every identifier as unconstrained text.
---

Use an ID type for values such as order, customer, ticket, or case identifiers. An explicit ID type records intent in a flow contract and prevents a generic text field from silently crossing an important boundary.

Apply constraints only when the identifier has a stable, enforceable format. Keep lookup behavior in a [Code Node](/engineering/code-nodes/) or [Tool Node](/engineering/tool-nodes/); an ID type validates representation, not existence in an external system. See the generated [Type Reference](/engineering/reference/types/#idtype) for its exact schema.
