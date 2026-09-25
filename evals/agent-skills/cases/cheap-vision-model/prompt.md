---
description: "A cheap vision model is chosen from the provider's catalogue by input modality, price, reasoning and structured output, with an endpoint order, a fallback and a live probe planned before any series"
tags:
- "core"
- "group-d"
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
Pick a cheap model that reads the totals block of receipt photos like inbox/receipt_photo.jpg. OpenRouter only, no
frontier models. There is no network here, so I saved the OpenRouter catalogue in inbox/openrouter/models.json and
the endpoints of a few models in inbox/openrouter/endpoints/. Write the agent as agents/receipt_reader.yaml and tell
me how you would prove it works before we run anything bigger.
