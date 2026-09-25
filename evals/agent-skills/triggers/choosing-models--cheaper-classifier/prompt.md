---
description: "Replacing a model to save money loads the model choosing skill"
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
The agent that classifies our support tickets costs too much. Find a cheaper model on OpenRouter that still returns structured output reliably, and keep a fallback in case its provider goes down.
