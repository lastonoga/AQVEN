---
description: "After starting a series the agent reads the first snapshot per variant, acts on a variant that fails every attempt, reports a very slow one, and waits in the background instead of polling"
tags:
- "core"
- "group-b"
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools:
- "Read"
- "Glob"
- "Grep"
- "Skill"
- "TodoWrite"
- "Write"
- "Edit"
- "Bash"
---
Start the dev series of critique_recall_by_agent. I'm off to a meeting, take it from there.
