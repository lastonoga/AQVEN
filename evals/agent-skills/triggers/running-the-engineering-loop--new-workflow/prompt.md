---
description: "A request to build a workflow from nothing loads the skill that orders the stages"
tags:
- "trigger"
- "running-the-engineering-loop"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
I want a workflow that sorts incoming support tickets by urgency and drafts a first reply for whoever is on duty. Nothing is built yet. Where do we start, and in what order should we work until it is reliable?
