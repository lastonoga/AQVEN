# Tie-break agent of the judge panel

**Purpose:** choosing an agent (a paired comparison).

When the three panel judges disagree, `decide__tie_break` settles the dispute. It runs on gpt, which is outside the
panel. The hypothesis is that DeepSeek, the strongest family on the panel, settles disputes better. The risk is that
a tie-breaker from a family that has already voted sides with its own vote, so this is worth measuring before the
flow changes.

**Cases.** `judge_panel_cases` holds eight panel inputs built from real Lumen cases. Each has three reply candidates
and a winner that a support lead picked by hand (`expected_output.winner`). The tags are:

- `contest`: `close` when two candidates are both acceptable and one is better on a detail, `clear` when one
  candidate is plainly right and the others are unsafe or ungrounded. Only close contests tend to reach the tie-break.
- `winner_position`: where the expected winner sits in the list. A panel that keeps picking the first or the middle
  candidate shows an order bias.
- `category`: the product category.

**Check.** `winner` is the built-in `expected` check on the `winner` field. The panel copies the chosen candidate
verbatim, so exact equality is the right comparison.

**Reading the result.** The candidate has to beat the baseline by more than 0.05 on `winner`. It may cost at most
30% more per correct pick and be at most 50% slower at p95. Look at the `close` slice first: the `clear` cases rarely
reach the tie-break and mostly confirm that nothing else changed.
