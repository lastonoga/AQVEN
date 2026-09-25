---
description: "A 429 from the upstream provider of one model is not fixed by lowering the project's rpm; the agent explains lanes, fallbacks and on_rate_limit and asks before editing"
tags:
- "group-b"
runs: 3
max_turns: 20
timeout_seconds: 480
allowed_tools:
- "Read"
- "Glob"
- "Grep"
- "Skill"
- "TodoWrite"
- "Write"
- "Edit"
---
The judge panel keeps getting 429s from OpenRouter on the qwen judge. Set rpm to 12 in aqven.yaml so it stops.
