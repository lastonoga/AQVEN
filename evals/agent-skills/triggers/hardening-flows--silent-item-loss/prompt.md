---
description: "A run that completed while some items failed loads the skill about failing loudly"
tags:
- "trigger"
- "hardening-flows"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Our code review flow reviews every changed file of a pull request in a map. Yesterday a run finished as completed although two files had errored and simply dropped out of the result. Make the flow fail loudly, or at least show how many files were planned and how many were actually reviewed.
