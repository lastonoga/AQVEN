# Correctness needs ground truth and a control

Agreement is not correctness, a proxy is not a label, a check measures one claim, a rate belongs to its own cases, and the main metric is the job of the stage you test. How to pick checks and controls that can tell a working flow from one that only looks consistent.

## Contents

- [In short](#in-short)
- [Agreement is not correctness](#agreement-is-not-correctness)
- [Proxy truth](#proxy-truth)
- [Negative controls](#negative-controls)
- [One check, one claim](#one-check-one-claim)
- [The stage and its metric](#the-stage-and-its-metric)
- [Trivial baselines](#trivial-baselines)
- [An example](#an-example)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

A metric says the flow is right only when it compares the output with a truth that doesn't come from the
model: an answer you built into the input, or a label from the source. It also needs negative controls from
the same population, cases where the right answer is "no". Two model readings that agree prove
reproducibility, not correctness. Each check measures one claim, on the cases that claim is about. The
main metric is the job of the part you test, taken from the goal: what its output feeds, and which error
costs more there.

## Agreement is not correctness

Asking two models, or one model twice, and scoring how often they agree measures reproducibility. A model
that guesses a document's type from its file name instead of reading it agrees with itself every time. A
panel that shares a blind spot agrees on the wrong answer. Series after series can rank variants by agreement while
none of them sees the thing you care about.

Agreement is useful for one question only: how noisy a step is. For "is it right", use a truth:

| Truth | Where it comes from | Good for |
|---|---|---|
| truth by construction | you build the answer first and the input from it: a known total written into a generated invoice, a record turned into text | whether the step can do the task at all; how accuracy changes as one property grows |
| labels from the source | a resolution code, a total from the ledger, a class assigned by the people who own the data | correctness on real inputs; comparing models |
| derived labels | a documented mapping from a source label, marked "needs expert sign-off" | real inputs where only an upstream label exists |

Compare models on real labels. Synthetic cases can show that a model can't do the task at all. They
can't show which model is better on production inputs: a model that reads clean generated invoices can fall
apart on real scans, and one that handles clean synthetic transcripts can fail on real phone calls.

A synthetic case must actually have the property it is labelled with. A "blurry receipt" must be blurry
where the text is, not just darker overall; a "long message" must bury the key fact, not just repeat the
greeting; a "noisy call" must be hard to hear while someone speaks, not only in the pauses. Look at, listen
to or read a sample of the built inputs before a series, or the series measures the label, not the property.

## Proxy truth

Sometimes the label you have is about a different property than the one you measure. A ticket's resolution
code says "refund issued", and the experiment asks whether the model found the refund request in the
message. Truth for one property inferred from a label of another is a proxy, and it needs three things:

- **Name it a proxy.** The experiment's notes say so, and the mapping from the label to the truth sits in a
  table marked for sign-off by the owner of the data. See
  Cases that can answer the question for how such a table is kept.
- **Split the error metric.** A model answer can contradict the label, or it can be about something the
  label never covered: a message that asks for a refund and a replacement, labelled only with the refund. The
  first is an error. The second is outside the label's scope, and counting it as a false positive punishes a
  correct answer. Score the two as separate checks.
- **Beat the constant.** A proxy often has one value on most cases. See
  [Trivial baselines](#trivial-baselines).

## Negative controls

A negative control is a case where the failure must not happen, from the same population as the positives.
It catches three things:

- **A check that fires on everything.** A detector that flags every message scores full recall. Only
  messages that don't ask show that it flags them too.
- **A model that answers from context.** A model that finds a cancellation request in every call
  transcript it is asked about, or a defect on every clean product photo, reads the question, not the input.
- **A `refuted` that means nothing.** Without controls, "the risk didn't show" can't be told from "the
  cases never provoke it".

A control must be false by construction and must not leak. A decoy that the model can recognise by some
other feature, such as a different document template, sender address, camera or watermark, tests that
feature. A multi-call variant needs a control of equal budget, a variant that calls the model as often, or
its gain may come from calling more.

## One check, one claim

Each check answers one yes-or-no question that could refute one claim:

- **The claim's subject comes from the case.** "Finds the labelled clause" checks the clause named in the
  case's tag or `expected_output`, not "found any clause". A check for "found anything" passes on a
  contract where the model quoted the wrong clause.
- **The unit of the metric is the unit of the claim.** A claim about readings is counted per reading, not
  per pair of readings.
- **Unknown is not no.** A missing answer must never pass a claim. On a control case, "no answer" is not
  "no false alarm". Count missing answers with a completeness check of their own. See
  Answer, refusal and unknown.
- **A model failure counts against every binary check.** When a run produces no output (a schema failure,
  a refusal, a truncation), every binary check of that attempt fails, and continuous checks are skipped.

A check scores every attempt of the series, so it can't skip a case. A rate that belongs to some of the
cases, such as recall on positives or false alarms on controls, gets its own experiment with
`cases.tags` selecting those cases. Scoring recall over all cases dilutes it with cases where there was
nothing to find.

## The stage and its metric

A stage is the part of the flow an experiment tests: one step, a range of steps, or the whole flow. Its
job comes from the goal of the flow, not from its node kind: what its output feeds, and which error costs
more there. The same step can sit in any row below, depending on what comes after it:

| What the output feeds | The costlier error | Main metric | Guardrail |
|---|---|---|---|
| a later step that can drop a wrong item but never recover a missed one | a miss | recall on labelled positives, completeness of answers | false alarms on controls, cost |
| a person or a product decision that acts on every item it gets | a false alarm | precision, or agreement with labels on both sides | recall, cost, latency |
| a user who waits, or a budget per case | a slow or dear answer | `latency_p95_ms`, `cost_of_pass` | the quality metric, with a non-inferiority margin |
| the decision the product makes: the whole flow | the one the contract names | the "done" criterion of the contract | cost per case, latency |

A threshold meant for the whole flow, put on one part alone, can fail a part that did its job. A part
measured on the wrong error rewards the wrong behaviour: a filter scored on recall is best when it lets
everything through. Name the part and what its output feeds before you pick the metric. An experiment can
score one stage with ordinary checks: see [Measure one stage](../engine/experiments.md#measure-one-stage).

A comparison of two ways to run a stage is read against the configuration production runs now, in the same
series: see [The current best in every comparison](validity-gate.md#the-current-best-in-every-comparison).

## Trivial baselines

Before you set a threshold, compute what a trivial answer scores: always the same answer, always the
majority class, "flag everything". A threshold below that bar confirms a flow that is no better than a
constant. On a support queue where most tickets need a person, "escalate every ticket" can outscore every
model tested when the threshold was set without looking.

The same holds for the metric of one stage and for truth derived from another label. A derived truth that
has the same value on most cases makes a constant answer look good: the metric tells models apart only
when the best constant answer scores well below 1.

A trivial baseline can be a variant of its own: an alternative `code` node that returns the constant
answer, compared with a `use` factor on the step. Then the table shows it as a row next to the models. Lumen's
`panel_merge_rule` has such a reference row: `always_tie_break`, an alternative of the `aggregate` node,
sits next to the merge as written.

## An example

A detector flags messages that ask for a refund. Recall and false alarms are separate claims on separate
cases, so they are two experiments on one dataset. This one measures recall on the messages that ask:

```yaml
apiVersion: "aqven/v1"
kind: "Experiment"
description: "The refund detector flags a refund request in more than 90% of the messages that ask for one"
failure_mode: "refund_missed"
subject:
  flow: "refund_request"
cases:
  dataset: "refund_messages"
  tags:
    asks_refund: "yes"
variants:
- id: "as_written"
checks:
- id: "flag_matches_label"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "asks_refund"
question:
  kind: "threshold"
  metric: "flag_matches_label"
  above: 0.9
  margin: 0.03
plan:
  repeats: 3
```

Its twin selects `asks_refund: "no"`, the negative controls, with the same check and its own bound. The
same `expected` check there means "left a complaint alone".

## How this shapes what you do

- Measure correctness only against a truth: an answer you built into the input, or labels from the source.
- Call truth inferred from another property's label a proxy, get its table signed off, and score
  "contradicts the label" apart from "outside the label's scope".
- Put negative controls from the same population next to every group of positives.
- Write one check per claim, and give a rate on part of the cases its own experiment with `cases.tags`.
- Pick the main metric from the job of the part you test: what its output feeds and which error costs more.
- Compute trivial baselines before you set a threshold, for a stage metric too.
- Compare a candidate with the configuration production runs now, in the same series.
- Read an A/A experiment to know how much of a difference is noise.

## See also

- Cases that can answer the question: where the truth and the controls come
  from.
- [The validity gate](validity-gate.md): the checklist before a series.
- [How a series decides](how-a-series-decides.md): intervals, margins, judges and the noise floor.
- [How to write a custom evaluator](../engine/custom-evaluator.md): a check of your own.
