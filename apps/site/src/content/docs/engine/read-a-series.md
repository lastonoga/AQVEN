---
title: How to read a series
description: Read a series in order — its status, the verdict sentence and its reason, the variants × metrics matrix, stability, the failing cases and the spend — and know what to do after each verdict.
---

## When you need this

A series has finished, or is still running, and you have to decide what to do next. The same series
reads the same way in Studio, in `{{CLI_COMMAND}} series` and in `series_get`. Read it top to bottom: the
status, then the verdict, then the numbers behind it, then the cases.

## Steps

- **Wait for the status to settle.**

  | Status | Meaning |
  |---|---|
  | `running` | attempts are running; the numbers and the verdict are provisional |
  | `awaiting_approval` | the spend reached 90% of the series cap (`pause.reason` `spend_near_cap`, with `pause.spent_usd`), or a `cap_usd` above the project cap waits before it starts (`cap_above_project`); a person continues or stops it in Studio |
  | `waiting_human` | an attempt reached a `human` node; the series continues once someone answers it |
  | `done` | finished; every question but a `look` has a verdict |
  | `cancelled` | stopped by a person or an agent; no finding |
  | `failed` | every attempt hit an infrastructure error, such as a missing provider key; `error` names the first one |

- **Read the verdict first, and quote it.** The server writes one sentence from the interval and the
  margin in the file. Repeat it as it is: don't round the numbers or retell them. The sentence follows
  these templates:

  ```text
  {variant}: {metric} is {value} (95% CI {low} to {high}) against above {threshold} with margin {margin}: clears the bound by more than the margin.
  {candidate} vs {baseline} on {metric}: {difference} (95% CI {low} to {high}): not worse by more than the {margin} margin; guardrail cost_of_pass holds.
  Signal on dev, not a finding: {measurement}.
  No finding: {errors} of {done} attempts hit infrastructure errors.
  ```

- **Act on the verdict and its reason.**

  | Verdict (reason) | What it tells you | What to do |
  |---|---|---|
  | `confirmed` | the claim holds on held-out cases, within the margin | change the flow, keep the cases it fixes as regression cases, record the decision |
  | `refuted` | the effect is within ±margin or reversed | drop the change, or form a new hypothesis; never read it as "no risk" |
  | `inconclusive` (`below_mde`) | the interval is wider than the margin: too few cases | write fresh cases and run a new held-out series of the recommended size; never rerun the same one for another answer |
  | `inconclusive` (`uninformative`, `no_discordance`) | every case passes or fails for both variants, or they agree on every case | the cases are too easy or too hard; write cases at the boundary |
  | `signal` (`dev_split`) | a number from working cases | keep exploring; confirm on held-out cases when the change is done |
  | `signal` (`judge_not_validated`) | the deciding check is a judge nobody measured | validate the judge on planted defects, then add `validated_by` |
  | `invalid` (`cancelled`, `budget_cut`) | the series stopped before it finished | run it again, with a cap that fits what its attempts cost |
  | `invalid` (`inputs_changed`) | a file of the subject changed during the series | run it again, and don't edit while it runs |
  | `invalid` (`infra_errors`) | more than 5% of attempts hit an infrastructure error | fix the key, the limit or the code the attempts name |
  | `invalid` (`no_data`) | the primary metric got no values | read the attempts' errors, and open their runs |

- **Read the matrix behind the verdict.** Each row is a variant. Each column is a metric: the primary one
  first, then the guardrails, your other checks, and the metrics every series measures:
  - share of passing runs (`success_rate`);
  - cost per run (`cost_usd`) and per passing run (`cost_of_pass`);
  - typical and slow response time (`latency_p50_ms`, `latency_p95_ms`), without time spent waiting for a
    person;
  - valid output on the first try (`schema_valid_first_try`);
  - share of infrastructure errors (`infra_error_rate`).

  A cell holds the value, its 95% interval and the cell's own verdict: passes, fails, unclear, baseline or
  not tested. A narrow margin with a wide interval is a sign to add cases, not to rerun.
- **Read stability when there are repeats.** Per variant, it counts the cases that passed every time,
  never, or sometimes, and pass^k: the chance that every repeat of a case passes. Cases that always fail
  need a fix in the step. Cases that fail sometimes point to a retry with a check, or a vote.
- **Read the failing cases, not the average.** The case rows give each variant's tally, the failed checks
  and the spend. Each attempt shows its outcome, its error and a link to its run, where the trace names
  the first node that failed. Filter to the failures, or to the cases where the variants disagree. An
  agent sees working cases only: `series_get` with `include_cases: true` returns up to 50 of them, failing
  first, and counts the rest in `hidden_cases`. Held-out cases are never shown one by one.
- **Tell a failure from an infrastructure error.** A failed attempt counts: a check failed, or the model's
  output broke its type even after the retries (`MODEL_RETRIES_EXHAUSTED`, `MODEL_SCHEMA_MISMATCH`), or
  the provider refused the output type as too complex for the model (`OUTPUT_SCHEMA_REJECTED`), or the
  model refused. An infrastructure error doesn't count toward the metrics: a missing key, a provider
  error, a timeout, a model that stopped streaming (`MODEL_STREAM_STALLED`). See
  [a failure or an infrastructure error](/concepts/how-a-series-decides/#a-failure-or-an-infrastructure-error).
- **Check the spend.** `spend.usd` is what the attempts cost, against `spend.cap_usd`. When
  `spend.unpriced_attempts` is above 0, some attempts ran on a model without a known price. The spend is
  then a lower bound, and Studio shows it with ≥.
- **Find the finding.** A held-out series that isn't `invalid` names its file in `finding_path`, and
  `FINDINGS.md` has a new line under its `failure_mode`.

### Example

In one series over the showcase's support cases, an attempt ended `failed` with
`MODEL_RETRIES_EXHAUSTED`. The case row gave the error and the run link. The run stops at `triage`, whose
agent `gemini` runs `gemini-2.5-flash-lite`. The run lists three failed answers for that node: the first
one and two retries (`output.retries: 2`). Each has an observation `value` longer than the 200 characters
the `Observation` type allows. The engine refused the output, as it should, and the series counted a
failure, not an infrastructure error.

That is a failure mode worth an experiment. First check that the triage prompt states the limit: if it
doesn't, fix the prompt, no experiment needed. In the showcase it does: `{{CLI_COMMAND}} prompt preview
support_case.triage` shows `observations[].value: at most 200 characters` in the output contract. So write
the risk down as a `threshold` on `success_rate` for the range `from: triage, to: triage`, with the
current agent as one variant and a candidate agent as another (an `agent` factor on `triage`), and read
`schema_valid_first_try` next to it. Explore it on working cases, then confirm it on held-out cases.

## See also

- [How a series decides](/concepts/how-a-series-decides/): the intervals, margins and outcomes behind
  every number here.
- [How to follow and read a series in Studio](/studio/series/): where each of these blocks sits on the
  screen.
- [How to run experiments and series as an agent](/mcp-cli/experiments-and-series/): the same fields in
  `series_get`.
- [How an agent takes a task to a reliable flow](/mcp-cli/research-loop/): what the next round looks like.
