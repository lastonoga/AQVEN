---
description: "Media comes first: look at the source, apply its orientation, send a native-resolution crop of the region the model must read, and keep the flow shape simple"
tags:
- "core"
- "group-d"
runs: 3
max_turns: 25
timeout_seconds: 480
allowed_tools:
- "Read"
- "Glob"
- "Grep"
- "Skill"
- "TodoWrite"
- "Bash"
---
Customers attach phone photos of their receipts to warranty cases, like inbox/receipt_photo.jpg. I want a step that
reads the totals block from such a photo: subtotal, tax, total and currency. Do not write any files yet. Look at the
photo and propose what the llm step takes as input and how the photo is prepared before it gets there.
