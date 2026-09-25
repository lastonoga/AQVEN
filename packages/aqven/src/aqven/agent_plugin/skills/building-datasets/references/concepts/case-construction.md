# Cases that can answer the question

A dataset answers a question only when it has ground truth, negative controls from the same population, enough cases per compared group in each half, and inputs that look like production. Where cases come from, how to label them, and how the split shapes the count.

## Contents

- [In short](#in-short)
- [Start from the question](#start-from-the-question)
- [Where cases come from, in order](#where-cases-come-from-in-order)
- [Answer first, input second](#answer-first-input-second)
- [A synthetic case must have the property it is labelled with](#a-synthetic-case-must-have-the-property-it-is-labelled-with)
- [Negative controls from the same population](#negative-controls-from-the-same-population)
- [Tags, the split and the count](#tags-the-split-and-the-count)
- [Keep the sources and the builder in the project](#keep-the-sources-and-the-builder-in-the-project)
- [An example](#an-example)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

A dataset can answer a question only if four things hold. Every case has a truth to measure against.
Negative controls come from the same population as the positives. Each group you compare has enough
cases in each half of the split. And the inputs look like what production sends. Start from labelled real
data. Use synthetic cases only when the answer is known by construction and the input really shows what
the prompt defines.

## Start from the question

Before you write a case, write two things:

- **The question** the dataset has to answer, in one sentence: "does the extractor read the right total from
  real invoice scans", "does the detector flag refund requests and leave complaints alone".
- **The unit**: what one case is. One message, one invoice, one page of a contract, one region of a catalogue
  image. A metric is computed per case, so the unit of the case must be the unit of the claim.

## Where cases come from, in order

1. **Labelled data of the project.** Real inputs with labels someone already trusts.
2. **Public labelled datasets.** Record the license next to the source. Labels from the source, such as the
   category a support team actually closed a ticket under, beat any label you derive yourself.
3. **Failed runs.** A run that went wrong becomes a case: its input, and the outputs of the nodes above
   the step you test, go into the case's `node_outputs`. In Studio, "To cases" does this.
4. **Synthetic cases**, built answer first (below). They test whether the flow can do the task at all.
   They never replace real labels when you compare models or claim correctness.

Labels come from the source, from a table you agreed on, or from a documented mapping, such as "this
contract clause type carries this risk level". Mark a mapping from a field that needs an expert as "needs
expert sign-off". Never label cases with a rule the flow's own builder made up: then the dataset measures
agreement with that rule, not correctness.

## Answer first, input second

For synthetic cases, build the answer and then the input from it: a record, then an invoice written from
it; a class label, then a message of that class. Store the answer as `expected_output`. Before any series,
check that the answer can be recovered from the input, and that no second answer is plausible.

Spread the cases over **dimensions**. Pick about three that aim at the failures you saw: length, the topic
a message opens with, channel, language, a rare enum value. Write about 20 combinations by hand, generate
the rest without duplicates, then turn each combination into an input in a separate step. One prompt that
says "generate 50 examples" returns near-identical easy inputs.

## A synthetic case must have the property it is labelled with

A label on a synthetic case is a claim about its input, and the input has to make it true in the way the
prompt defines the property. A "blurry receipt" image must be blurry where the text is: an image that is only
darker overall still has sharp text, and a model that answers "sharp" is right. A reply labelled "cites the
wrong article" must cite an article that exists and is wrong for this question, not a malformed id the
format check catches first. Before you trust a synthetic set:

- the base at level zero does not have the property;
- the change does what the prompt's definition says, where it says;
- the area or context the definition compares against is part of the input;
- the levels of a graded series are evenly spaced, and edits leave no seams or other traces that give the
  synthetic cases away;
- a person looked at every synthetic input before the first series.

## Negative controls from the same population

A negative control is a case where the failure must not happen: a reply with no planted defect, a
complaint that does not ask for a refund. Without controls, a `refuted` verdict can't be told from "the cases never provoke
the failure", and a check that fires on everything goes unnoticed.

Controls come from the **same population** as the positives: the same source, device, authors, channel and
length. Negatives taken from one internal mailbox against positives from the public support form let a
model separate the two sources without reading the request at all. The best control mirrors a positive and
differs only in the thing asked about: the Lumen example's `planted_defect_replies` pairs every clean reply
with a twin that carries one planted defect.

## Tags, the split and the count

Tags are the case's dimensions, as a map of names to string values. An experiment selects cases by tags
with `cases.tags`, and every tag listed there must match.

The server splits every dataset 50/50 into working (`dev`) and held-out (`holdout`) cases by a hash of
each case's `name`. You don't choose which case goes where. That shapes the count:

- Write about twice as many cases as a held-out series needs.
- For every tag value a question compares, count the cases in each half before a series. Studio's
  experiment page shows how many selected cases fall in each half. A group with one or two cases in a half
  proves nothing about that group.
- A graded series (several levels of one property) loses levels to the split. Write each level twice as
  often as you need, so both halves keep every level.
- A series never runs more cases than its half holds, and one asked for N cases takes the first N of its
  half, in file order. `W_PLAN_EXCEEDS_CASES` warns when `plan.cases` is larger than the selection.
- Never rename a case. A renamed case is a new case, and it may switch halves.

Both halves come from one dataset, so they share a population, as long as you don't change the dataset
between Explore and Confirm. Adding a new kind of case, such as long multi-intent messages, only before the
held-out series makes the two halves measure different things. Add it, then explore again on working cases.

## Keep the sources and the builder in the project

Keep source files at their native resolution in the project, for example under
`<package>/samples/<dataset_id>/`. Build the dataset file with a script in the project, so one command
rebuilds it. Nothing goes in `/tmp`. The script writes canonical YAML: block style, double-quoted strings,
no anchors and no comments, or `aqven check` reports `E_YAML_ANCHOR`, `E_YAML_FLOW_STYLE` or
`E_YAML_COMMENT`. An input the case doesn't have is an explicit `null`.

## An example

A detector flags messages that ask for a refund. The negative control tells the same story and asks for
something else. The two cases differ only in what is being tested:

```yaml
apiVersion: "aqven/v1"
kind: "Dataset"
flow: "refund_request"
cases:
- name: "late_parcel_asks_refund"
  inputs:
    message: "The parcel came a week late and the lamp inside is cracked. I want my money back."
    order_id: "LUM-20260821"
  tags:
    asks_refund: "yes"
    length: "short"
  expected_output:
    asks_refund: true
- name: "late_parcel_asks_replacement"
  inputs:
    message: "The parcel came a week late and the lamp inside is cracked. Please send a new one."
    order_id: null
  tags:
    asks_refund: "no"
    length: "short"
  expected_output:
    asks_refund: false
```

## How this shapes what you do

- Write the question and the unit before the first case.
- Take labels from the source. Mark derived labels, and ask an expert to sign off where the field needs
  one.
- Put a negative control next to every group of positives, from the same population.
- Check that every synthetic case has the property its label names, as the prompt defines it, before a
  series.
- Count cases per compared tag value and half, and tell the person who owns the question what the dataset
  can and can't confirm.

## See also

- Correctness needs ground truth and a control: how the checks use these
  cases.
- The validity gate: the checklist before a series.
- Experiments, series and findings: working and held-out
  cases.
- Media has real limits on both sides: inputs the
  model really sees.
- [Datasets reference](../reference/datasets.md): every key of a dataset file.
