---
title: Union Types
description: Model a value that may take one of several declared shapes.
---

Use a union when a field can have distinct record variants and downstream logic needs to know which shape arrived. Keep each variant meaningful and narrow. A union is clearer than an object with many unrelated optional fields.

Define the variants as records, name the union, then use a switch or code node to handle every supported case. The compiler checks type compatibility; the generated [Type Reference](/engineering/reference/types/#uniontype) defines the discriminator and variant fields for the installed package.

Use [Dynamic Output](/engineering/dynamic-output/) when the shape is genuinely input-defined and cannot be enumerated. Narrow it back to a declared type before a stable business boundary.
