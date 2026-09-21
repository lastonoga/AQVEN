---
title: Constrained Value Types
description: Define reusable primitive values with bounds, patterns, or controlled allowed values.
---

Use a value type when the same primitive constraint recurs across a project: a bounded score, a pattern-bound code, or a controlled string. Put the constraint in the type so flow inputs, model outputs, datasets, and human forms share it.

Do not use a constraint as a substitute for a business rule that depends on other fields. Put cross-field rules in code, checks, or a control policy. The generated [Type Reference](/engineering/reference/types/#valuetype) lists supported constraints.
