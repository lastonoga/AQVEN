---
description: "Writing a check for a claim loads the failure analysis skill"
tags:
- "trigger"
- "analyzing-failures"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Write a check that tells whether a drafted support reply actually answers the customer's question, so we can see how often it doesn't.
