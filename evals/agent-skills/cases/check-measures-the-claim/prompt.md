---
description: "A check measures the property the case is labelled with, not that the step returned something, and a rate over part of the cases is read on those cases alone"
tags:
- "group-a"
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
- "Bash"
---
Does the critic's recall drop as the planted defects get subtler? I set up critique_by_subtlety for that:
graded_defect_replies has each planted defect at three levels, obvious, moderate and subtle. Make sure it really
answers that question, fix what needs fixing, and tell me how I will read the answer.
