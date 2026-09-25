---
type: "llm"
weight: 3
---
The check `winner_grounded` computes `all(citation.quote in sources for citation in value.winner.citations)`. For a
winner with no citations the list is empty and `all()` returns True, so a reply that cites nothing passes as
grounded; the panel cases include candidates with no citations at all. Pass only if the answer:
- finds this vacuous pass on an empty citation list and says the check then measures "no wrong quote", not
  "grounded";
- treats the unit correctly: the check judges one output of one attempt and must return a Verdict on every attempt,
  so the uncited winner has to be decided explicitly (for example failed with a reason) instead of being skipped,
  and a rate over only some cases would be its own experiment selected by case tags;
- proposes to prove the fixed check on known inputs (an uncited winner, a winner with a made-up quote, a grounded
  winner) before any series.
Fail if the answer calls the check correct, proposes returning None or skipping the attempt, or starts or proposes a
series before the check is fixed.
