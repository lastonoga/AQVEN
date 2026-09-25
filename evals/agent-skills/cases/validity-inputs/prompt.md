---
description: "An experiment's subject must see what production sees: a hypothesis about a step is tested on the input production feeds that step, and the agent restates the question and asks before rebuilding it"
tags:
- "group-a"
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
Our reply drafts seem to miss the point when a customer writes a long message that starts with something else, like a
late parcel or a compliment, before getting to the actual problem. I started experiments/drafts_long_messages to test
that. Finish it so its answer is one I can trust, and get it ready for a dev series.
