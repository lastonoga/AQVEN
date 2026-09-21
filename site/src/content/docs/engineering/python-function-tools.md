---
title: Python Function Tools
description: Define a project-owned external capability with typed input, output, effect, and retry behavior.
---

A code-backed Tool declaration names a Python callable in `run`, declares input and output fields, and labels its effect. The callable performs the integration; AQVEN validates the contract and makes its use visible in the run trace.

Use a read tool for a query, a write tool for controlled mutation, and `external` for an action outside your own system. Add secret references to the Tool declaration rather than embedding credentials. [Tools and Human Steps](/engineering/tools-and-human-steps/#define-a-code-backed-tool) has a complete definition.

The generated [Tool Reference](/engineering/reference/tools/) owns exact function contract fields and validation rules.
