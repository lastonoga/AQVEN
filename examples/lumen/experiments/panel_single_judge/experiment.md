# One judge instead of the panel

**Purpose:** checking a risky hypothesis (a project flow against an arm).

The panel runs three judges in parallel and waits for at least two of them to agree, then calls a tie-break when
they do not. The hypothesis is that on these cases a single judge picks the same winner, and the reply stage gets
noticeably faster. The risk is the reason the panel exists: one judge has its own blind spots and nobody to catch
them.

**Subject and variants.** The subject is the project flow `judge_panel` as written (`panel`). The arm
`single_judge` keeps the panel's input and output: the `judge` step is the project's `tie_break` inference with the
`deepseek` agent, and the `pick` step is the panel's own `pick` function, so the winner is chosen by the same rule.
`single_judge_qwen` is the same arm with the Qwen agent on `judge`. It is measured on the same cases for the Pareto
view; the verdict compares only `panel` and `single_judge`.

**Reading the result.** The primary metric is the median latency, lower is better: `single_judge` has to be faster by
more than 1500 ms. Three guardrails keep the win honest:

- `winner` may drop by at most 0.1: a single judge that is fast and wrong is not an improvement.
- `success_rate` may drop by at most 0.05: the arm has no quorum to fall back on.
- `infra_error_rate` may grow by at most 0.02, absolute: a faster provider that fails more often is not faster.

**Caveat.** Eight cases, three repeats. A pass here is a reason to run the comparison on the full reply set, not to
remove the panel.
