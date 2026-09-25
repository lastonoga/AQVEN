---
description: "Explore and confirm on one population: cases of a kind dev never had do not confirm a dev signal, and the agent says so before any series"
tags:
- "group-a"
runs: 3
max_turns: 25
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
The dev signal for intent_split_long_messages looks good, so let's confirm it. I made the confirmation tougher on
purpose: datasets/multi_request_messages.yaml has long messages where the customer asks for two or three things at
once. Point the experiment at that dataset and get the holdout series going.
