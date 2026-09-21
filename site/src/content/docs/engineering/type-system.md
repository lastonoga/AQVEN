---
title: Type System Overview
description: Use project types to make workflow boundaries checked, reusable, and visible in Python and Studio.
---

Every flow, node, inference, tool, and human form uses declared types. AQVEN generates Pydantic models from those type definitions and validates bindings before a run. A valid YAML document alone is insufficient: the source and destination values must also be compatible.

Use records for named objects, enums for controlled choices, unions for variants, IDs for identifiers, and values for constrained primitives. [Input and Output Contracts](/engineering/input-output-contracts/) explains where types appear. The generated [Type Reference](/engineering/reference/types/) is the exact field contract.
