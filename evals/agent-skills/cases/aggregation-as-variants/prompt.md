---
description: "Ways of merging the outputs of one step are variants of a use factor, not extra checks of a single variant"
tags:
- "core"
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
---
In support_case the tally step merges the three intent ballots. I want to compare three ways of merging them: the
rule as it is now, a plain majority with no confidence floor, and simply taking the most confident ballot. Show me
the intent accuracy of each rule side by side on the support cases. Call the experiment tally_merge_rule. Write it,
but do not start a series.
