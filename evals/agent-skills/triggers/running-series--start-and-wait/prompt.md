---
description: "Starting a series and waiting for its verdict loads the series skill"
tags:
- "trigger"
- "running-series"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Start a series for the experiment reply_tone on dev and let me know when there is a verdict.
