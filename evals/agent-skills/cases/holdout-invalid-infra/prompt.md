---
description: "A holdout series made invalid by infrastructure errors is fixed at their cause, provider routing without fallbacks and a join that needs several judges, and rerun with the same margin"
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
---
The holdout series of panel_merge_rule (series 01a0d4e1-7c20-7b3e-8f41-2d6c9a0b7e53) came back invalid, so we
still don't know whether the majority-only merge is good enough. Find out why and fix it so the next holdout series
gives us an answer. Don't start the series yet, tell me when it's ready.
