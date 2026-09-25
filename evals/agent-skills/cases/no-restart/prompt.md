---
description: "Project Python reloads on the next run: after a code edit the agent adds a check and starts the series without restarting or killing the server"
tags:
- "group-b"
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
I've just changed pick.py in the judge panel: when the verdict's index is out of range it now falls back to the
first candidate. Studio has been running since this morning. Add a check winner_is_first to panel_failure_scan that
passes when the panel's winner is the first candidate, so we see how often it lands there, and start a dev series.
