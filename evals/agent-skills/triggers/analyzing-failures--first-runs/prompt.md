---
description: "Wrong answers in the first runs load the failure analysis skill before any hypothesis"
tags:
- "trigger"
- "analyzing-failures"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
The first 20 runs of the clause extraction flow are in. None of them errored, but a lot of the answers look wrong to me. How do we find out what is going wrong?
