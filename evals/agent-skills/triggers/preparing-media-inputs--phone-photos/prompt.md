---
description: "Photos from phones going into a vision step load the media preparation skill"
tags:
- "trigger"
- "preparing-media-inputs"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Our product catalogue flow gets supplier photos straight from phones: often sideways and around 4000 pixels wide. How should the flow prepare these photos before the vision step reads the label on the package?
