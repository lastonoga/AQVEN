---
description: "Writing an output type whose answers can be missing loads the output contract skill"
tags:
- "trigger"
- "designing-output-contracts"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Write the output type for a step that reads a supplier contract and answers three questions: does it renew automatically, what is the notice period for termination, and is liability capped. Many contracts say nothing about one or more of these.
