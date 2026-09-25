# How the panel merges its verdicts

**Purpose:** choosing an algorithm for a code step.

The `aggregate` step of `judge_panel` turns three verdicts into one. As written, the panel agrees when two judges pick
the same candidate and their scores on every criterion are at most 2 apart; otherwise the `decide` switch calls the
tie-break judge. The spread rule sends close contests to the tie-break, which costs a call and time. The hypothesis is
that a majority alone picks the right winner just as often.

**Variants.** The ways of merging are the variants, not checks: each is an alternative node in `nodes/` that takes the
place of `aggregate` (`varies: what: use, nodes: [aggregate]`). An alternative runs under the id of its slot, so
`decide` and `pick` still read `$aggregate.out`, and the compiler checks the alternative against those bindings.

| Variant | `aggregate` runs | When the tie-break runs |
|---|---|---|
| `majority_and_spread` | the node as written | no majority, or scores more than 2 apart |
| `majority_only` | `nodes/majority_only/` | only when the three judges pick three different candidates |
| `always_tie_break` | `nodes/always_tie_break/` | on every case, with the three verdicts in view |

`always_tie_break` is the upper bound on cost and a reference for accuracy: if it does not pick the winner more often
than the panel, the merge is not where the panel loses. Both alternatives share the helpers in `merge.py`.

**Checks.** The columns of every row:

- `winner`: the built-in `expected` check on the winner a support lead picked.
- `settled_by_panel`: a code check in `checks.py`, passes when the winner came from the merged verdict and not from the
  tie-break. It is the share of cases the merge saves a call on.

Cost and latency come with every series; read them next to `settled_by_panel`.

**Reading the result.** `majority_only` passes when its `winner` rate is at most 0.05 below `majority_and_spread`. A pass
with a higher `settled_by_panel` means the spread rule costs more than it catches. Look at the `contest: close` cases
first: they are the ones the spread rule sends to the tie-break.
