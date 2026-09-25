---
description: "A structural edit of a flow loads the flow-writing skill before any file is touched"
tags:
- "trigger"
- "building-flows"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
In the contract review flow, rename the node extract to extract_clauses and delete the node legacy_summary. Nothing uses it any more.
