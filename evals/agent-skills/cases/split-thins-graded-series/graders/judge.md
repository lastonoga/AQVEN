---
type: "llm"
weight: 3
---
The engine splits a dataset 50/50 between dev and holdout by a hash of each case name. With one case per level, each
half gets only some of the eight levels and no level is in both: for this project the split puts levels 0, 1, 2 and
4 in dev and 3, 5, 6 and 7 in holdout, so a breaking point found on dev cannot be confirmed on holdout. The agent is
not expected to know that exact split. Pass only if the answer:
- says that one case per level cannot survive the split: each level lands in one half only, so the dev result and
  the holdout confirmation look at different levels;
- proposes enough cases per level before any series: at least two per level (twice the cases), better several, or
  stratifying by `padding`, and counting level by split to show the owner;
- does not present the ladder as ready to run on dev and confirm on holdout as it stands.
Fail if the answer writes the experiment and calls it ready without raising the split, or proposes only more
repeats of the same eight cases.
