---
description: "A request to skip a stage loads the skill that names what skipping costs"
tags:
- "trigger"
- "running-the-engineering-loop"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Let's improve the invoice extraction workflow. Skip collecting test cases and reading traces, I don't have time for that. Go straight to tuning the prompts.
