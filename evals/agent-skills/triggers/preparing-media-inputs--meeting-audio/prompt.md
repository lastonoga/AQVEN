---
description: "Long audio going to a model loads the media preparation skill"
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
We want a flow that summarises hour-long meeting recordings in mp3. How should the audio be split and passed to the model?
