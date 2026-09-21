---
title: Generate a Dynamic Form Result
description: Produce an input-defined dynamic result, then narrow it before stable downstream work.
---

Use dynamic output when the input defines fields that cannot be known in a static record. Keep the dynamic value opaque and limit access to the supported dynamic operations. Use a narrow node to validate the value against a declared type before a flow return, tool call, or other stable boundary.

Read [Dynamic Output](/engineering/dynamic-output/) and [Calls and Narrowing](/engineering/calls-and-narrowing/).
