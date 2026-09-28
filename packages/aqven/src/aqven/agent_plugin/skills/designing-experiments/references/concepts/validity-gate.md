# The validity gate

The questions an experiment has to pass before its first series — one factor, compared things as variants, ground truth and a negative control, the same population in both halves, synthetic cases that have their property, the current best in the comparison, a reachable margin — and which of them the engine checks for you.

## Contents

- [In short](#in-short)
- [The gate](#the-gate)
- [One factor, variants as rows](#one-factor-variants-as-rows)
- [Ground truth and a negative control](#ground-truth-and-a-negative-control)
- [The same population in both halves](#the-same-population-in-both-halves)
- [A synthetic case that has its property](#a-synthetic-case-that-has-its-property)
- [The current best in every comparison](#the-current-best-in-every-comparison)
- [An intermediate output that carries enough](#an-intermediate-output-that-carries-enough)
- [What the engine checks, and what it leaves to you](#what-the-engine-checks-and-what-it-leaves-to-you)
- [An example](#an-example)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

A series answers exactly the question its experiment asks, whether or not that is the question you meant.
The validity gate is the checklist between writing `experiment.yaml` and spending money on it. Before the
first series, the experiment must change one factor, with the compared things as variants and the measures
as checks. It must have ground truth and a negative control from the same population. The subject must
follow the production path, and a synthetic case must have the property it is labelled with. The margin must be
within reach. `aqven check` catches the structural mistakes. The rest is on you. Write the
answers into the experiment's `experiment.md`, and don't start the series while one of them is "no".

## The gate

| # | Question | Passes when |
|---|---|---|
| 1 | Does the experiment answer the question the owner of the flow asked? | the question is restated in their words: "this experiment answers …; metric M means …", and they said yes |
| 2 | Which part of the flow does it measure, and what is "good" for that part? | the main check measures that part's job: what its output feeds and which error costs more there (a miss, a false alarm, cost, latency) |
| 3 | Is there exactly one factor? | `varies` names one kind (`agent`, `prompt`, `use` or `flow`) and its nodes; the compared things are variants and the measures are checks; `aqven check` reports no factor error |
| 4 | Does anything else differ between the variants? | nothing: not the data, not the set of questions put to the model, not the preprocessing, not the population; a variant that adds or removes an input differs only by the block that renders it; a changed instruction in a prompt that reads another step's output is part of the factor and is listed |
| 5 | Does the subject follow the production path? | the preprocessing is the production one (crops and resolution, audio segments, text chunks, OCR or transcription), the inputs are the ones production has, and the prompt asks for the measured behavior; the prompt preview of the subject matches production in everything but the factor, and for variants and local flows, which have no preview yet, a one-case smoke shows what each sent |
| 6 | What is the truth, and where is the negative control? | truth known by construction, such as a planted defect, or labels from the source; negative controls from the same population as the positives; truth derived from a label of another property is named as a proxy, marked for sign-off, and scored with a split error metric |
| 7 | Does a synthetic case have the property it is labelled with? | it shows what the prompt defines, where the definition says; a person looked at, listened to or read every synthetic case |
| 8 | Is there one check per claim? | the property a claim is about comes from the case's tag; the unit of the metric is the unit of the claim; a missing field reads as unknown, not as absent |
| 9 | What do trivial baselines score? | a constant answer, the majority class and "flag everything" are computed, for the metric of a stage or an intermediate output too, and the threshold is above them |
| 10 | Is the margin within reach? | the launch plan's `mde` and `recommended` cases fit the cases you have, or the owner accepted a run below the recommendation |
| 11 | Are the controls false by construction? | a control can't pass by a shortcut; a multi-call variant is compared with a variant of equal budget |
| 12 | Were the new checks tried on outputs you already have? | run over the working-case outputs of an earlier series (`series_outputs` with `split: "dev"`, or `aqven series export`), their numbers look plausible; an exact 0.000 or an interval of zero width is treated as a bug first |
| 13 | Do both halves come from one population, with the threshold fixed? | working and held-out cases come from the same dataset and tag filter, and nothing was added between Explore and Confirm; the threshold was set before the data and doesn't move; numbers of two experiments are compared only when both select the same cases of one dataset |
| 14 | Are the expected outcomes written? | Purpose, Falsifier and If confirmed are in `experiment.md` before the first number |
| 15 | Is this the same question as before? | nothing changed after a series; a change to the question, metric, factor, variants, cases, plan or checks gets a new experiment id |
| 16 | Is the current best in the comparison? | the configuration production runs now is a variant of the same series; no number comes from another series |
| 17 | Does an intermediate output carry what the next step needs? | in a pilot on about 10 varied cases, each of its fields varies across the classes the next step has to tell apart |

## One factor, variants as rows

Picture an experiment as a table: variants are rows, checks are columns, and a series fills the cells.
Only the rows get ranked. When three implementations of a step are written as three checks on one
variant, the table has one row and nothing to compare. Write them as three variants of a `use` factor on
that step, and measure all three with the same checks.

One factor also means one cause. A variant that swaps the model and the prompt together can win for
either reason. When the change really is a pair, such as a cheaper model with a prompt tuned for it, put
both into one alternative node and compare it with `use`: then the claim is about the pair.

## Ground truth and a negative control

Two readings that agree are reproducible, not correct. A model that classifies a document from its file
name agrees with itself perfectly and never reads the document. Correctness needs a truth that doesn't come
from the model: a defect you planted, a value you generated, or a label from the source. It also needs
negative controls from the same population, cases where the answer must be "no". Without them, a check that
fires on everything scores well. See
[Correctness needs ground truth and a control](metrics-and-controls.md).

A check scores every case the experiment runs on: it returns a verdict, and anything else is an error
attempt, not a skipped case. So a rate over part of the cases, such as recall on the positives or false
alarms on the controls, is an experiment of its own that selects those cases with `cases.tags`.

## The same population in both halves

The server splits one dataset into working and held-out halves by a hash of the package name, the dataset
id and the case name, so both halves share a population, as long as nobody changes the dataset in between.
Adding harder cases only before the held-out series makes the two halves measure different things. The
held-out half then scores several points below the working half, and the gap says nothing about the flow.
Add new kinds of cases, explore on them, and only then confirm.

The dataset id is part of the hash. A second dataset built from the same inputs, under another id, splits
them anew: an input that sat in the working half of the first can land in the held-out half of the second.
An input you have already explored on is spent for confirmation in every dataset that holds it. So compare
the numbers of two experiments only when both select the same cases of one dataset, and build a derived
dataset only when you have to.

## A synthetic case that has its property

A synthetic case is valid only if it really has the property it is labelled with, in the form the prompt
defines. A "blurry receipt" made by darkening the whole image is still sharp where the text is, and a
model that answers "the text is readable" is right. A "contract with a missing clause" whose clause was only
renamed still has the clause. A "noisy call" whose noise was added only in the pauses is as clear as the
original wherever someone speaks. Before you blame the model, look at, listen to or read the unchanged
original, the place of the change, what it is judged against, and any seams the edit left. See
Cases that can answer the question.

## The current best in every comparison

Two series of the same variant on the same cases still differ, because of sampling and provider routing;
an A/A experiment measures by how much. A candidate compared with a number from an older series can look
better or worse by that much alone. So every comparison carries the configuration production runs now as
one of its variants, and the candidate is read against it in the same series, case by case: on which cases
did it win, and on which did it lose. In the case rows of `series_get` with `include_cases: true`,
`divergent: true` marks a case where the variants' pass rates differ, such as 3 of 3 repeats against 1 of
3; with one variant it is always false. See How to read a series.

## An intermediate output that carries enough

When the step under test reads the output of an earlier step, that output has to carry what separates the
answers the later step confuses. A call summary without speaker turns can't say who agreed to what. An
invoice reading that gives amounts without the printed label next to them can't tell a total from a
subtotal. Before a series, run the earlier step on about 10 varied cases and look at each field: a field
with the same value on more than 8 of them carries almost nothing for the next step. See
Answer, refusal and unknown for how to design those fields.

## What the engine checks, and what it leaves to you

`aqven check` refuses these before any series:

| Mistake | Code |
|---|---|
| a variant sets values under `nodes`, and the experiment has no `varies` | `E_FACTOR_MISSING` |
| `varies.nodes` names a node the subject doesn't have | `E_FACTOR_NODE_UNKNOWN` |
| `agent` or `prompt` on a node that isn't `llm`, `flow` on a node that isn't `call` | `E_FACTOR_KIND` |
| a variant sets a node outside `varies.nodes` | `E_VARIANT_OUTSIDE_FACTOR` |
| a `use` value with no alternative in `nodes/`, or an alternative with the id of a subject node | `E_ALTERNATIVE_UNKNOWN`, `E_ALTERNATIVE_ID_TAKEN` |
| a `flow` value whose input or output type differs from the slot's flow | `E_FACTOR_FLOW_CONTRACT` |
| a metric that is neither a check id nor a series metric | `E_METRIC_UNKNOWN` |
| the built-in `expected` check on a case without `expected_output` | `E_EXPECTED_MISSING` |
| `cases.tags` selects no case | `E_CASES_EMPTY` |
| two variants with the same values; an alternative, prompt or local flow no variant uses | `W_VARIANT_DUPLICATE`, `W_ALTERNATIVE_UNUSED` |
| `plan.cases` larger than the selection | `W_PLAN_EXCEEDS_CASES` |

An A/A experiment, which measures noise with identical runs, keeps every variant as written. It needs no
`varies`, and it gets no duplicate warning.

Everything else in the gate is judgment: whether the question is the owner's, whether the truth is true,
whether the control comes from the same population, whether a synthetic case has its property. No
checker sees that. The gate exists because these mistakes pass every check and still make a series
measure the wrong thing.

## An example

A Validity section for the showcase's `critique_recall_by_agent`, an `agent` factor on the critic that
stops bad support replies, as it reads when written before the first series:

```markdown
## Validity

1. Question: "Each candidate critic agent stops more than 80% of replies that carry a
   planted defect." Owner: yes.
2. Stage: the critic of the polish loop. Its job here is recall on defects; letting clean
   replies through is measured on the clean copies.
3. Factor: agent on critique; variants deepseek (as written), qwen, llama.
4. Nothing else differs: same prompt, schema, cases and approval threshold.
5. Production path: the subject runs the project's critique inference; the blocked check
   reads it with the loop's threshold of 0.85; the prompt preview was read.
6. Truth: one defect planted by hand in each reply, its kind in the defect tag. Controls:
   the clean copy of each reply, selected with planted: "no" in a companion experiment.
7. Every planted reply was read by a person and carries exactly the defect its tag names.
   Planted defects are easier than natural ones, so recall here is an upper bound.
8. One check per claim: blocked on planted: "yes" cases only; rationale_brief is its own claim.
9. Baselines: "block everything" scores 1.0 here and 0.0 on the clean copies.
10. Launch plan on a dev smoke: mde and recommended cases read from the answer; not below
    the recommendation.
11. Controls are false by construction: a clean copy differs from its twin only by the defect.
12. blocked was run on critiques from earlier runs of the loop: plausible numbers.
13. Both halves from planted_defect_replies, unchanged since the last Explore; 0.8 and the
    margin of 0.05 fixed.
14. Purpose, Falsifier and If confirmed written below.
15. New question, new id: critique_recall_by_agent.
16. Current best: deepseek, the critic production runs now, is a variant of this series.
17. No intermediate output: the critic reads the reply itself.
```

## How this shapes what you do

- Run the gate after `experiment.yaml` is written and `aqven check` is clean, and before the
  first series.
- Write every answer into the Validity section of `experiment.md`. A "no" stops the series.
- Restate the question to the owner of the flow and get a yes. It is the cheapest line of the gate.
- Once the experiment has a series, change nothing in it: a new question, metric, factor, variant list,
  case selection, plan or check gets a new id, and its `experiment.md` names the old id and its series.
- Once the question is answered, set `archived: true` in `experiment.yaml`, the one edit allowed after a
  series. The experiment moves to Archived in Studio and keeps working as before.

## See also

- [Experiments, series and findings](experiments-series-and-findings.md): the factor, variants and
  the experiment folder.
- [How a series decides](how-a-series-decides.md): margins, the launch plan's recommendation, and
  the noise floor.
- Hypotheses by category: where the claim comes from.
- [How to write an experiment](../engine/experiments.md): every key and every error message.
