# Correctness needs ground truth and a control

Agreement is not correctness, a check measures one claim, a rate belongs to its own cases, and the main metric is the job of the stage you test. How to pick checks and controls that can tell a working flow from one that only looks consistent.

## Contents

- [In short](#in-short)
- [Agreement is not correctness](#agreement-is-not-correctness)
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
main metric is the job of the stage you test: recall for a step that must find everything, precision for
a judge.

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
apart on real scans.

A synthetic case must actually have the property it is labelled with. A "blurry receipt" must be blurry
where the text is, not just darker overall; a "long message" must bury the key fact, not just repeat the
greeting. Look at a sample of the built inputs before a series, or the series measures the label, not
the property.

## Negative controls

A negative control is a case where the failure must not happen, from the same population as the positives.
It catches three things:

- **A check that fires on everything.** A detector that flags every message scores full recall. Only
  messages that don't ask show that it flags them too.
- **A model that answers from context.** A model that reports a defect on every clean product photo it is
  asked about reads the question, not the image.
- **A `refuted` that means nothing.** Without controls, "the risk didn't show" can't be told from "the
  cases never provoke it".

A control must be false by construction and must not leak. A decoy that the model can recognise by some
other feature, such as a different camera or a watermark, tests that feature. A multi-call variant needs a
control of equal budget, a variant that calls the model as often, or its gain may come from calling more.

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

A flow often grows in stages. First a layer that must find every candidate, then a judge that decides
between them. Each stage has its own job and its own metric:

| Stage | Its job | Main metric | Guardrail |
|---|---|---|---|
| a divergent layer: extractors, candidate generators | miss nothing | recall on labelled positives, completeness of answers | false alarms on controls, cost |
| a judge or filter | keep only what is right | precision, or agreement with labels on both sides | cost, latency |
| the whole flow | the decision the product makes | the "done" criterion of the contract | cost per case, latency |

A threshold meant for the whole flow, put on the divergent layer alone, fails a layer that did its job. A
judge measured on recall rewards a judge that lets everything through. Name the stage before you pick
the metric.

## Trivial baselines

Before you set a threshold, compute what a trivial answer scores: always the same answer, always the
majority class, "flag everything". A threshold below that bar confirms a flow that is no better than a
constant. On a support queue where most tickets need a person, "escalate every ticket" can outscore every
model tested when the threshold was set without looking.

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
- Put negative controls from the same population next to every group of positives.
- Write one check per claim, and give a rate on part of the cases its own experiment with `cases.tags`.
- Pick the main metric from the job of the stage you test.
- Compute trivial baselines before you set a threshold.
- Read an A/A experiment to know how much of a difference is noise.

## See also

- Cases that can answer the question: where the truth and the controls come
  from.
- [The validity gate](validity-gate.md): the checklist before a series.
- [How a series decides](how-a-series-decides.md): intervals, margins, judges and the noise floor.
- [How to write a custom evaluator](../engine/custom-evaluator.md): a check of your own.
