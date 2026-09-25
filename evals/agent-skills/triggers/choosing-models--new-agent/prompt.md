---
description: "Adding an agent on a new model loads the model choosing skill"
tags:
- "trigger"
- "choosing-models"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
Add an agent that summarises meeting notes on a Gemini Flash model through OpenRouter, next to the agents we already have.
