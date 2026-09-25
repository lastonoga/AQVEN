---
description: "An instruction that differs by kind of input loads the flow-writing skill that covers prompt variants"
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
The classify step of our ticket routing flow uses one long prompt for every channel. I want a separate instruction for email, chat and web form tickets, picked by the ticket's channel. Set that up in the flow.
