# One judge instead of the panel

**Purpose:** checking a risky hypothesis (a project flow against a local flow in the same slot).

The panel runs three judges in parallel and waits for at least two of them to agree, then calls a tie-break when
they do not. The hypothesis is that on these cases a single judge picks the same winner, and the reply stage gets
noticeably faster. The risk is the reason the panel exists: one judge has its own blind spots and nobody to catch
them.

**Subject.** A variant changes one factor, never the whole subject, so two judging patterns are compared through a
slot. The subject is the local flow `winner_pick` (`flows/winner_pick/`): one `call` node, `panel`, that passes the
case summary, the drafts and the chunks on and returns what it gets back. As written, `panel` calls the project flow
`judge_panel`. The dataset `judge_panel_cases` belongs to `judge_panel`, and `winner_pick` takes the same input type, so
the same cases run on both variants.

**Variants.** The factor is the flow called at the slot (`varies: what: flow, nodes: [panel]`).

| Variant | `panel` calls | What runs |
|---|---|---|
| `panel` | `judge_panel` (as written) | three judges, the merge and the tie-break |
| `single_judge` | the local flow `single_judge` | one judge, then the panel's own `pick` step |

`single_judge` keeps the input and output types of `judge_panel` (`PanelRequest` to `PanelOutcome`), which a flow
factor requires: the `judge` step is the project's `tie_break` inference with the `deepseek` agent, and the `pick` step
is the panel's own `pick` function, so the winner is chosen by the same rule. A Qwen single judge is not a variant
here: it would change the pattern and the agent at once. If the single judge wins, compare its agents in an agent
experiment on the adopted flow.

**Reading the result.** The primary metric is the median latency, lower is better: `single_judge` has to be faster by
more than 1500 ms. Three guardrails keep the win honest:

- `winner` may drop by at most 0.1: a single judge that is fast and wrong is not an improvement.
- `success_rate` may drop by at most 0.05: a single judge has no quorum to fall back on.
- `infra_error_rate` may grow by at most 0.02, absolute: a faster provider that fails more often is not faster.

**Caveat.** Eight cases, three repeats. A pass here is a reason to run the comparison on the full reply set, not to
remove the panel.
