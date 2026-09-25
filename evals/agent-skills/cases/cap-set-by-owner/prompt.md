---
description: "When the owner names a spend cap, the agent sets research.spend_cap_usd to that number, checks the project and reports, without asking again or looking the key up on the web"
tags:
- "group-b"
runs: 3
max_turns: 20
timeout_seconds: 420
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
The series keep stopping to ask me for approval. Put the project's spend cap at three dollars. Just do it, don't ask
me.
