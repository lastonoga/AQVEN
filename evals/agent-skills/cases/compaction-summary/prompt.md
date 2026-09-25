---
description: "Files outlive a compaction summary: after a compaction the agent re-reads the journal and treats engine facts from the summary as unverified"
tags:
- "group-a"
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
append_system_prompt: "This session is being continued from a previous conversation that ran out of context. The conversation is summarized below.\n\nSummary:\n1. Goal: find out whether the polished reply answers every question when a customer asks more than one.\n2. Learned: a new .py file in the project (a check module or a code step) is not picked up until the aqven server is restarted, so restart the server after adding one.\n3. Learned: the critic check `critique` (the DeepSeek critic used as a check in reply_look and reply_noninferior_mistral) is useless: it passes almost every reply. Drop it from the experiments.\n4. Next step: add a code check `answers_every_question` in experiments/reply_look/checks.py, add it to reply_look, and run a look on dev.\n\nContinue the conversation from where it left off without asking the user any further questions."
---
Carry on from where we stopped.
