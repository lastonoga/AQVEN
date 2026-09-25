---
description: "Deciding what each step does on failure loads the hardening skill"
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
We're about to put the invoice approval flow into production. Right now nothing says what happens when the currency lookup step times out or the approval model returns garbage. Decide what every step should do when it fails.
