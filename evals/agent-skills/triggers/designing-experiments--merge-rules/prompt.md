---
description: "Comparing two ways of combining votes loads the experiment design skill"
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
The code review flow asks three reviewer models and then takes a majority vote. I'd like to compare that with simply taking the most confident reviewer and see which one is more accurate. Set it up.
