# A/A: how much the panel disagrees with itself

**Purpose:** stability, and the noise floor for comparisons.

`run_a` and `run_b` run the same flow: the project flow `judge_panel` as written, on the same cases, with the same
agents. Any difference between them is noise: sampling at temperature 0.2 on llama, provider routing, the tie-break
firing on one run and not on the other.

**Variants.** Both variants leave the flow as written and change nothing, so the experiment declares no `varies`:
an experiment whose variants all keep the subject is an A/A experiment, and `aqven check` neither asks for a factor
nor warns that the variants repeat each other. The pair measures the flow against itself.

**Check.** `matches_expected` is the built-in `expected` check with no `fields`: it compares every field the case lists
in `expected_output`, which for these cases is only the `winner`.

**Reading the result.** The question is a `compare` with margin 0, so it asks whether `run_b` beats `run_a` at all. The
expected outcome is "not confirmed". The useful number is the half-width of the confidence interval on the
difference: it is the smallest effect `judge_panel_agents` and `panel_single_judge` can tell apart from noise on
these eight cases. Five repeats also give the per-case pass^k and the share of cases that flip between repeats. A case
that flips is where a variant comparison should not be read case by case.

**When to re-run.** After a change of any panel agent, a provider pin, or the tie-break prompt.
