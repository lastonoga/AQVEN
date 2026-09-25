---
description: "Before a holdout series the agent tells the owner in one line what claim it tests, why now and what each verdict would mean"
tags:
- "group-b"
runs: 3
max_turns: 25
timeout_seconds: 540
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
panel_merge_rule looks good on dev. Confirm it on holdout.
