---
description: "A check that passes on a degenerate input measures nothing; the agent finds the vacuous pass and keeps a Verdict on every attempt"
tags:
- "group-b"
runs: 3
max_turns: 25
timeout_seconds: 540
allowed_tools:
- "Read"
- "Glob"
- "Grep"
- "Skill"
- "TodoWrite"
- "Write"
- "Edit"
---
Before we spend anything on panel_grounding: are you sure the grounded check really tells us the winner is grounded?
Check it.
