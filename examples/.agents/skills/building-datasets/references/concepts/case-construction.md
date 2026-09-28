# Cases that can answer the question

A dataset answers a question only when it has ground truth, negative controls from the same population, enough cases per compared group in each half, and inputs that look like production. Where cases come from, how to vet a source and label cases, and how the split shapes the count.

## Contents

- [In short](#in-short)
- [Start from the question](#start-from-the-question)
- [Where cases come from, in order](#where-cases-come-from-in-order)
- [Vet a source before you plan on it](#vet-a-source-before-you-plan-on-it)
- [Labels and how far they reach](#labels-and-how-far-they-reach)
- [Answer first, input second](#answer-first-input-second)
- [A synthetic case must have the property it is labelled with](#a-synthetic-case-must-have-the-property-it-is-labelled-with)
- [Negative controls from the same population](#negative-controls-from-the-same-population)
- [Positives and true negatives for every property](#positives-and-true-negatives-for-every-property)
- [Tags, the split and the count](#tags-the-split-and-the-count)
- [A tag is not what the input shows](#a-tag-is-not-what-the-input-shows)
- [Raw downloads, curated samples and the builder](#raw-downloads-curated-samples-and-the-builder)
- [An example](#an-example)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

A dataset can answer a question only if four things hold. Every case has a truth to measure against.
Negative controls come from the same population as the positives. Each group you compare has enough
cases in each half of the split. And the inputs look like what production sends. Start from labelled real
data, and profile a public source before you plan on it. Use synthetic cases only when the answer is known
by construction and the input really shows what the prompt defines.

## Start from the question

Before you write a case, write three things:

- **The question** the dataset has to answer, in one sentence: "does the extractor read the right total from
  real invoice scans", "does the detector flag refund requests and leave complaints alone", "does the router
  send a recorded call to the right queue".
- **The unit**: what one case is. One message, one invoice, one page of a contract, one call, a ten-second
  window of a clip, one row of a table. A metric is computed per case, so the unit of the case must be the
  unit of the claim.
- **The input contract**: the fields and kinds of input the flow receives in production, with their typical
  size and length. A column only the dataset has, such as the team a ticket was finally routed to, is never
  an input, however well it predicts the answer. Keep it in the case's `metadata`.

## Where cases come from, in order

1. **Labelled data of the project.** Real inputs with labels someone already trusts.
2. **Public labelled datasets.** Fetch the label and metadata tables first, and count the cases you can
   actually use. Tell the person who owns the question how much media the download is, and download only
   after they agree. Read the license text itself: its name, whether your use is allowed, and the
   attribution it asks for. Record it next to the source. Labels from the source, such as the category a
   support team actually closed a ticket under, beat any label you derive yourself.
3. **Failed runs.** A run that went wrong becomes a case: its input, and the outputs of the nodes above
   the step you test, go into the case's `node_outputs`. In Studio, "To cases" does this.
4. **Synthetic cases**, built answer first (below). They test whether the flow can do the task at all.
   They never replace real labels when you compare models or claim correctness.

## Vet a source before you plan on it

Profile a source before you plan cases around it, and show the profile to the person who owns the question.
One table answers these:

- **Fill rate.** How often each field you need is filled, per group you will compare. A field filled on
  90% of the rows can be empty for the one group that matters.
- **Where the labels come from.** A verified outcome, such as a refund actually paid; a person's reading of
  the same input the model gets; the author's own report; or another model. Each measures something
  different, so name it.
- **Raters and agreement.** How many people labelled a case, and how often they agreed. Where the raters
  disagree, no model can match them all, so low agreement caps the score.
- **Granularity.** Whether the source's categories fit your unit and your question. A label on a whole call
  doesn't say which minute the complaint came in.
- **Embedded content.** The license of what the inputs contain, such as logos, watermarks and quoted text,
  apart from the license of the dataset.
- **Duplicates.** Exact copies and near-duplicates: a ticket exported twice, a resized image, a re-encoded
  clip. Drop them before any case is written, or one input lands in both halves under two names.
- **Population.** Whether the inputs look like production: staged catalogue shots against the photos users
  upload, studio recordings against phone calls, clean articles against scraped pages full of boilerplate,
  generated rows against real transactions.
- **Processing traces.** Transcoding, resizing, resampling or re-encoding the source applied and production
  inputs don't have.

## Labels and how far they reach

Labels come from the source, from a table you agreed on, or from a documented mapping, such as "this
contract clause type carries this risk level". Mark a mapping from a field that needs an expert as "needs
expert sign-off". Never label cases with a rule the flow's own builder made up: then the dataset measures
agreement with that rule, not correctness.

- **Labels in your own types.** A source names its categories its own way. Map them into the values of the
  flow's output type when you build the dataset, and validate every `expected_output` with the classes
  `aqven generate` writes. Keep the raw label in the case's `metadata`, so the mapping stays
  visible.
- **A model's label is a prediction.** Tags another model produced are guesses about the input, not its
  truth. Use the source's labels. Keep model tags as extra, marked tags, never as `expected_output`.
- **A derived table names its origin.** Give every entry of a table that derives labels an origin: the
  source, the owner, or the agent. List the entries the agent made or tuned for sign-off. When two categories
  can't be told apart in the input, report it. Don't tune the table until they separate.
- **Proxy truth is named.** Sometimes truth for one property is taken from a label of another, such as a
  ticket's final resolution code used as truth for the intent of its first message. Call it proxy truth and
  mark it for sign-off. Split its error in two: answers that contradict the label, and answers about
  something the label doesn't cover. See
  Correctness needs ground truth and a control.

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
darker overall still has sharp text, and a model that answers "sharp" is right. A call labelled "noisy line"
needs the noise over the speech, not only in the pauses. A reply labelled "cites the wrong article" must cite
an article that exists and is wrong for this question, not a malformed id the format check catches first.
Before you trust a synthetic set:

- the base at level zero does not have the property;
- the change does what the prompt's definition says, where it says;
- the area or context the definition compares against is part of the input;
- the levels of a graded series are evenly spaced, and edits leave no seams, clicks or other traces that
  give the synthetic cases away;
- a person looked at, listened to or read every synthetic input before the first series.

## Negative controls from the same population

A negative control is a case where the failure must not happen: a reply with no planted defect, a
complaint that does not ask for a refund. Without controls, a `refuted` verdict can't be told from "the cases never provoke
the failure", and a check that fires on everything goes unnoticed.

Controls come from the **same population** as the positives: the same source, device, authors, channel and
length. Negatives taken from one internal mailbox against positives from the public support form let a
model separate the two sources without reading the request at all. The best control mirrors a positive and
differs only in the thing asked about: the Lumen example's `planted_defect_replies` pairs every clean reply
with a twin that carries one planted defect.

## Positives and true negatives for every property

A dataset measures false positives for a property only when some cases are known not to have it. List every
property the flow reports, with the cases labelled as having it and the cases labelled as not having it:

| Property | Labelled present | Labelled absent |
|---|---|---|
| `asks_refund` | 24 | 26 |
| `mentions_competitor` | 9 | 0 |

Meeting recordings labelled only with the topics that came up show when a model misses a topic, not when it
invents one: a topic absent from the label may still have come up. Report a false-positive rate only for a
property labelled both ways.

## Tags, the split and the count

Tags are the case's dimensions, as a map of names to string values. An experiment selects cases by tags
with `cases.tags`, and every tag listed there must match.

The server splits every dataset 50/50 into working (`dev`) and held-out (`holdout`) cases by a hash of the
package name, the dataset id and each case's `name`. You don't choose which case goes where. That shapes
the count:

- Write about twice as many cases as a held-out series needs.
- For every tag value a question compares, count the cases in each half before a series. Studio's
  experiment page shows how many selected cases fall in each half. A group with one or two cases in a half
  proves nothing about that group.
- A graded series (several levels of one property) loses levels to the split. Write each level twice as
  often as you need, so both halves keep every level.
- A series never runs more cases than its half holds, and one asked for N cases takes the first N of its
  half, in file order. `W_PLAN_EXCEEDS_CASES` warns when `plan.cases` is larger than the selection.
- Never rename a case, and never move it to another dataset. Either makes it a new case, and it may switch
  halves.

Both halves come from one dataset, so they share a population, as long as you don't change the dataset
between Explore and Confirm. Adding a new kind of case, such as long multi-intent messages, only before the
held-out series makes the two halves measure different things. Add it, then explore again on working cases.

Keep one dataset per set of inputs. Two datasets built from the same inputs split them independently,
because the dataset id is part of the hash, so an input can be working in one and held-out in the other. An
input that was on `dev` in any dataset has been seen: it no longer counts as held-out anywhere. Before you
compare results across experiments, check that they ran on the same cases and the same halves.

## A tag is not what the input shows

A source's tag describes the item, not always what the input shows. A thread tagged "billing" can open about
a late delivery. A clip tagged with an event can end before the event, or show it off-screen. Before a
series, open a few inputs of every group, read, listen or watch, and check that each one shows what its tag
says.

## Raw downloads, curated samples and the builder

Keep raw bulk downloads outside the package, for example in `data/raw/` at the project root, listed in
`.gitignore`. The project server re-reads the package folder on every file change in it, so a large archive
unpacked there during a series can stall it. Only the vetted subset, at native quality, goes into the
package, for example under `<package>/samples/<dataset_id>/`. Even one file you only want to look at goes
where its source will live, never to a temporary folder.

Build the dataset file with a script in the project, such as `scripts/build_<dataset_id>.py` next to
`pyproject.toml`, so one command rebuilds it. Write the script there from its first line: nothing goes in
`/tmp`. The script:

- drops exact copies by content hash, and the near-duplicates the profile found, before it writes a case;
- skips the files it already has, so a rerun after a failure continues instead of starting over;
- writes its progress to a log file. Run a long build in the background and read the log. Piped through
  `head`, it stops after a few lines; piped through `tail`, it shows nothing until it ends;
- writes canonical YAML: block style, double-quoted strings, no anchors and no comments, or
  `aqven check` reports `E_YAML_ANCHOR`, `E_YAML_FLOW_STYLE` or `E_YAML_COMMENT`. The
  [snippets page](../engine/snippets.md#a-dataset-with-tags) has a tested builder with such a writer.

An input the case doesn't have is an explicit `null`.

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

- Write the question, the unit and the production input contract before the first case.
- Read a public source's label tables and license text, and profile it, before any bulk download.
- Take labels from the source and map them into your own types. Mark derived and proxy labels, and ask an
  expert to sign off where the field needs one.
- Put a negative control next to every group of positives, from the same population.
- Check that every synthetic case has the property its label names, as the prompt defines it, before a
  series.
- Count cases per compared tag value and half, list positives and true negatives per property, and tell the
  person who owns the question what the dataset can and can't confirm.
- Keep raw downloads outside the package, and one dataset per set of inputs.

## See also

- Correctness needs ground truth and a control: how the checks use these
  cases.
- The validity gate: the checklist before a series.
- Experiments, series and findings: working and held-out
  cases.
- Media has real limits on both sides: inputs the
  model really sees.
- [Tested snippets](../engine/snippets.md): a dataset builder that writes canonical YAML.
- [Datasets reference](../reference/datasets.md): every key of a dataset file.
