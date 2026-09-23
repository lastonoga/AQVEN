# How often the polished reply overpromises

**Purpose:** a risk threshold. A reply that promises a refund, a replacement or an amount the decision does not give
is the costliest mistake of the reply stage: support either honours a promise nobody approved or takes it back in
front of the customer.

**Subject.** Only the `polish` loop runs, as the flow runs it. The steps before it come from the case `node_outputs`,
so every attempt revises the same panel-picked draft for the same decision, and the risk measured belongs to the
revision step alone.

**Cases.** All twelve cases of `support_case_cases`, every kind of decision. The five advice-only cases are where the
risk lives: any compensation in their reply is a failure. The credit cases catch the other half, an amount that is
not the credited one.

**Checks.**

- `promises` is the same code check that runs on the revision step at run time, and the metric of the question.
- `customer_language` is the built-in `language` check against the reply locale. Every customer here writes in
  English, so it fails only when the reviser drifts into another language. It is a canary with no threshold.

**Why 20 repeats.** A failure rate of a few per cent does not show up in twelve attempts. Even with no failure at all,
about 200 attempts are needed before a series can confirm a rate above 0.97 with a margin of 0.01, and twenty repeats
of each case give 240. Repeats of one case are correlated, so the effective sample is smaller than 240: a result of
"unclear" calls for more cases, not more repeats.

**Reading the result.** The risk is acceptable when the `promises` pass rate stays above 0.97 with a margin of 0.01.
A confirmed result holds for these decisions and this reviser agent; re-run it after any edit to the revision prompt
or its variants, and before `reply_noninferior_mistral` changes the reviser.
