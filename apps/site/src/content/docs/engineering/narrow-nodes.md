---
title: Narrow Nodes
description: Validate an opaque dynamic value against a declared type before stable downstream work.
---

Use a narrow node when an earlier step produced `Dynamic` data and a later boundary needs a known type. Set `from` to the dynamic value and `to` to the target type. After narrowing, downstream nodes can bind typed fields safely.

Dynamic values cannot be traversed as if they were records. Narrow them before flow returns, tool inputs, or business decisions. The generated [Node Reference](/engineering/reference/nodes/#narrownodespec) is the exact contract.
