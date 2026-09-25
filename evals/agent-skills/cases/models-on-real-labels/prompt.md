---
description: "Models are compared on the project's real labelled cases with a negative control from the same population; synthetic cases are only a sanity check"
tags:
- "group-d"
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
---
The three cheap critics, deepseek, qwen and llama, all block more than 80% of the planted defects in
critique_recall_by_agent, so that does not tell me which one to keep. Which one is really better? Write the
experiment critic_choice for it, but do not start a series.
