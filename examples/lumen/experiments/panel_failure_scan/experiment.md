# Where the judge panel goes wrong

**Purpose:** exploring failure modes before naming them.

The panel has no failure mode on record yet besides "wrong winner". This experiment runs every panel case once for two
tie-break agents and puts the detectors side by side, so the failures can be grouped and named before any of them
becomes a hypothesis. `failure_mode` stays unset until they are.

**Variants.** `gpt_tie_break` is the flow as written. `mistral_tie_break` puts the Mistral agent on
`decide__tie_break`. Mistral also writes one of the drafts upstream, so this variant shows whether a tie-break from an
author family favours its own style.

**Detectors.** None of them is a verdict; each points at a kind of failure.

| Check | What a failure means |
|---|---|
| `quotes_in_chunks` | The panel picked a candidate that quotes text the chunks do not contain. |
| `cites_known_chunks` | The winner cites a chunk id that is not among the case chunks. |
| `winner_within_length` | The panel rewarded length: the winner is over the 220-word reply limit. |
| `winner_without_contacts` | The winner carries an email, a phone or a card number. |
| `rationale_written` | The verdict has no reasoning to audit. |
| `rationale_names_criteria` | The reasoning ignores the rubric: grounding, helpfulness, tone. |
| `one_score_per_criterion` | A criterion is scored twice, so the merged scores are skewed. |
| `weakest_criterion` | The winner's lowest rubric score, 1 to 5; below 3 the panel settled for a weak reply. |
| `panel_cost`, `panel_latency` | Cost and time of the attempt, to spot cases that loop through the tie-break. |

**Reading the result.** Sort by the first failing detector and read the traces. Two or three cases failing the same
way are a named `failure_mode` and the start of a threshold experiment. Eight cases say nothing about rates.
