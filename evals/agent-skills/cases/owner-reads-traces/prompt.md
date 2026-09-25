---
description: "After a look with many failing rows the owner reads the traces first: the agent lines them up with run links and asks for notes instead of inventing failure modes"
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
The look over the regression cases finished (reply_look, series 01a0d9c6-0d85-7eb1-8f36-2c5b8a1e6f49) and it's a lot
of red. What next?
