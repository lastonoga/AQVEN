---
description: "A dev and holdout split can empty the levels of a graded series: count level by split and write enough cases per level before any series"
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
---
datasets/message_length_ladder.yaml has the same strip flicker complaint buried under 0 to 7 paragraphs of unrelated
story, one case per level (the tag `padding`). I want to find the level where the intent starts to break on dev and
then confirm that level on holdout. Write the experiment intent_length_ladder, but do not start a series.
