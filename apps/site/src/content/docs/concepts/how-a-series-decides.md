---
title: How a series decides
description: The statistics behind a verdict in plain words — intervals against a margin, repeats grouped by case, how many cases a margin needs, the noise floor, judges and what counts as a failure.
---

## In short

A model answers differently each time. A step that passed 27 of 30 cases may be solid, or it may break
once in five cases, and 30 cases can't tell those apart. So a series never reads a raw average. The server
computes a 95% interval for every number, puts it next to the margin you declared before the data, and
writes the verdict as a sentence. The agent and the person both quote that sentence. Nobody reruns the
math by hand.

## The case is the unit

Every repeat of a case is an attempt, but five repeats of one hard case aren't five pieces of evidence. A
model that trips on that input trips on it almost every time. So the server first averages the repeats of
each case into one number, then builds the interval over the cases. Treating repeats as independent would
make the interval too narrow and confirm effects that aren't there.

Repeats still pay off in two ways:

- **Stability.** With more than one repeat, a series counts per variant the cases that passed every time,
  never, or sometimes, and reports pass^k: the chance that all k repeats of a case pass. A mean of 0.8 can
  mean "a fifth of the cases always fail", where the step needs a fix. It can also mean "every case fails a
  fifth of the time", where a retry with a check, or a vote, helps. Stability tells the two apart.
- **Noise.** Repeats narrow the part of the interval that comes from the model's own randomness, not the
  part that comes from how different the cases are. Only more cases narrow that part.

## Which interval

The server picks the method from the question, the kind of metric and the size of the series. The methods
come from scipy.

| Metric | One variant against a bound | Two variants on the same cases |
|---|---|---|
| pass or fail, one attempt per case | Wilson interval over the cases | an exact sign test when fewer than 10 cases differ; otherwise paired t on the case differences below 50 cases, paired BCa from 50 |
| pass or fail, repeated | Wilson over the effective number of cases (Kish), or beta-binomial when failures are rare | as above |
| score | t on the case means below 50 cases, BCa bootstrap from 50 | paired t below 50 cases, paired BCa from 50 |
| `cost_of_pass` (a ratio) | bootstrap over cases | paired bootstrap over cases |
| `latency_p50_ms`, `latency_p95_ms` | bootstrap over cases; p95 needs 20 attempts | paired bootstrap over cases |

Two variants always run the same cases, so the series compares them case by case. That cancels out how
hard each case is and leaves the effect of the change.

Some data can't produce an interval, and the server says so instead of printing a misleading one:

- **Uninformative:** every case passes for both variants, or every case fails for both.
- **No discordance:** the variants agree on every case.
- **Too few cases** or **too few attempts** (p95 below 20).

## The verdict: the interval against the margin

The margin is how close to the bound still counts as the same. It sits in `experiment.yaml`, and it is
written before any data, because a margin picked after the data bends toward the answer you wanted.

| Question | Confirmed | Refuted | Inconclusive |
|---|---|---|---|
| `threshold`, `above` X | the low end is above X + margin | the high end is below X + margin | otherwise |
| `threshold`, `below` X | the high end is below X − margin | the low end is above X − margin | otherwise |
| `compare` | the low end of the difference is above +margin | the high end is below +margin | otherwise |
| `noninferior` | the low end of the difference is above −margin | the high end is below −margin | otherwise |

A difference is signed so that positive means the candidate is better. For cost and latency, lower is
better. A guardrail holds when the candidate isn't worse than the baseline by more than its margin, and a
broken guardrail refutes the whole question. With `relative: true`, the margin is a share of the baseline:
0.2 allows 20% worse.

Here is how a threshold of 0.80 with a margin of 0.02 reads:

| Result | 95% interval | Verdict |
|---|---|---|
| 27 of 30 | 0.744 to 0.965 | inconclusive: the interval crosses 0.82 |
| 90 of 100 | 0.826 to 0.945 | confirmed: the low end clears 0.82 |
| 18 of 30 | 0.423 to 0.754 | refuted: the high end stays below 0.82 |

"Not significant" is not "refuted". An interval of −0.15 to +0.25 fits a large harm and a large gain alike:
the data says nothing yet. A refutation needs the whole interval to rule the claimed effect out. Even then
it reads "the effect is within ±margin", never "no risk".

When a `threshold` question tests every variant, each variant is a cell. The server corrects the cells
together (Benjamini–Hochberg), so testing more variants doesn't buy more lucky confirmations. A comparison
has a single cell.

## How many cases

Before a series starts, its launch plan gives the expected half-width of the interval at the chosen size, and
a recommended number of cases: the smallest N whose interval fits inside the margin. The spread behind
that number comes from earlier series of the experiment when there are some. A narrow margin is
expensive. `reply_overpromise_risk` in AQVEN's example project asks for a margin of 0.01. At two repeats
its launch plan recommended about 1187 cases, and six working cases were available. You can run below the
recommended size, but expect `inconclusive`.

The answer to `inconclusive` for lack of cases (`below_mde`) is never to run the same held-out cases again
until the verdict flips. Every extra look at the same data is another ticket in the lottery of false
confirmations. Write fresh cases and run a new held-out series of the size the launch plan recommends. If that
size is out of reach, the answer stays unclear, and a structural guard, such as a code check, a `switch` or
a runtime check, is the fix, not more data.

## The noise floor

Two identical variants still disagree, because of sampling and provider routing. An A/A experiment
measures how much: the showcase's `panel_aa_noise` runs the judge panel twice as written, compares the
two with a margin of 0, and expects no confirmation. The half-width of that difference is the smallest
effect any comparison of panel variants can tell from noise on those cases.

## Judges

A model as judge is a check with its own errors, and those errors go straight into the metric. A judge
that catches 40% of real failures makes a step with 20% failures look like one with 10%. So a judge counts
as evidence only once an experiment has measured it on planted defects: clean answers, and copies of
them with one known defect each. The check that uses the judge names that experiment in `validated_by`.
Without it, a series on held-out cases gives a `signal`, not a verdict. In the showcase,
`critique_planted_defects` measures the DeepSeek critic, and `reply_noninferior_mistral` uses that critic
with `validated_by: critique_planted_defects`. Planted defects are easier to spot than real ones, so the
measured catch rate is an upper bound.

## A failure or an infrastructure error

Every attempt ends in one of these outcomes, and only some of them count:

| Outcome | Examples | Counts toward the metrics |
|---|---|---|
| passed | the run completed and every check passed | yes |
| failed | a check failed; the model's output broke the output type even after its retries (`MODEL_RETRIES_EXHAUSTED`, `MODEL_SCHEMA_MISMATCH`, invalid JSON); the provider refused the output type as too complex for the model (`OUTPUT_SCHEMA_REJECTED`); a refusal; a truncated answer | yes, as a failure |
| infrastructure error | a missing provider key, a provider error, a timeout, a model that stopped streaming its answer (`MODEL_STREAM_STALLED`), an unsupported model feature, broken code | no |

An output the engine refuses is the model's failure, not bad luck. In one series on the showcase,
`gemini-2.5-flash-lite` on the `triage` step broke the 200-character limit of an observation's `value`
three times in a row. That was the first answer and both retries (`output.retries: 2`), so the run ended
with `MODEL_RETRIES_EXHAUSTED`. The engine refused the invalid output, as designed, and the series counted
a failure. That is the risk the experiment exists to surface. The fix is the agent, the prompt that states
the limit, or a `code` step that trims, not a quieter engine.

An infrastructure error says nothing about the model, so it is kept out of the metrics. When more than 5%
of the attempts hit one, the series is `invalid`. When every attempt does, the series ends `failed` and
names the first error. An attempt that ends on a provider rate limit (`provider_error` with HTTP 429) is
queued once more at the end of the series; only a second rate limit counts as an infrastructure error.

## See also

- [Experiments, series and findings](/concepts/experiments-series-and-findings/): working and held-out
  cases, findings and spend.
- [How to read a series](/engine/read-a-series/): what to do after each verdict.
- [How to write an experiment](/engine/experiments/): where the margin, the guardrails and `validated_by`
  are written.
