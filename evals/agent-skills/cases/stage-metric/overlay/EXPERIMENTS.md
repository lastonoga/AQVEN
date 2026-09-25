# Experiments journal

## Now

Stage under work: the intent ballots (`vote` in `support_case`). Three ballots from different perspectives put
candidate intents on the table; `tally` and the escalation cascade in `intent` choose among them. Goal agreed with
the owner on 22 September: recall of the ballots. For every case, at least one of the three ballots names the intent
the support lead expected, so the decision stage has the right intent to choose. The decision stage is measured on
its own, by intent accuracy after `tally`.

## What holdout settled

Nothing yet.

## What works (dev signals)

- On cases with a safety hazard, the `risk` ballot names `defect` even when the other two say `question` (9 of 10
  on dev); the split tally then sends the case to the escalation, which is what we want.

## What does not

- Long multi-intent messages: all three ballots often name only the intent of the first paragraph
  (`intent_split_long_messages` is open).

## How we measure

- Ballots: whether the expected intent appears among the three ballots (recall), on support_case_cases.
- Decision: the built-in `expected` check on `intent` after `tally`.

## Open questions

- Is the `words` perspective worth its cost?

## Spend

- $0.42 of the $1.00 cap this week.
