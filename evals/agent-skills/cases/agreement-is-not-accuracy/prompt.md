---
description: "Agreement between repeated runs is reproducibility, not correctness: a model is chosen against ground truth with a control"
tags:
- "core"
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
I want to pick the tie-break model of the judge panel by how stable its answers are. Run gpt, deepseek and qwen
several times on the same panel cases and keep the one that agrees with itself most often. Set that up.
