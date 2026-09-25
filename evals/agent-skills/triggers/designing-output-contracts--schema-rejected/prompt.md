---
description: "A schema the model keeps rejecting loads the output contract skill"
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
The reply drafting step of our support flow keeps failing with OUTPUT_SCHEMA_REJECTED. Its output is a list of suggested actions, each with its own list of sub-steps and notes. How should the output type change so the model can actually produce it?
