---
description: "Turning past records into labelled cases with a split loads the dataset skill"
tags:
- "trigger"
- "building-datasets"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Build a dataset for the ticket triage flow from our 300 past support tickets, with the category each one finally ended up in, and split it into dev and holdout.
