---
description: "Cases with answers known by construction and negatives load the dataset skill"
tags:
- "trigger"
- "building-datasets"
runs: 3
max_turns: 4
timeout_seconds: 180
allowed_tools:
- "Skill"
- "Read"
- "Glob"
- "Grep"
---
I need test cases for the invoice total extractor where we know the right answer for certain. Can we generate plain-text invoices with known totals, plus a few documents that are not invoices at all?
