---
description: "A question about which of two prompts is better loads the experiment design skill"
tags:
- "trigger"
- "designing-experiments"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Is a shorter system prompt for the ticket classifier as accurate as the current long one? Set up the experiment to find out, but don't start it.
