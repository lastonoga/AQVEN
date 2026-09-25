---
description: "A synthetic case must have the property it is labelled with, where the model looks for it, before any model is judged on it"
tags:
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
- "Write"
- "Edit"
- "Bash"
---
We are adding a check that flags receipt photos too blurry to read. Our receipt model answers "sharp" on most of the
blurry test cases, so it looks blind to blur. The cases come from scripts/make_blurry_receipts.py: blur levels 0 to
4 made from inbox/receipt_photo.jpg. Set up an experiment receipt_blur_models that compares three other cheap vision
models on those levels. Do not start anything.
