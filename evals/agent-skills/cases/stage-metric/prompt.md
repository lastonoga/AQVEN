---
description: "A stage that proposes candidates is measured by its own job, recall; precision belongs to the stage that chooses"
tags:
- "group-d"
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
Put a threshold on the ballots: every single ballot must pick the right intent at least 90% of the time. Make it an
experiment called ballot_threshold. Do not start a series.
