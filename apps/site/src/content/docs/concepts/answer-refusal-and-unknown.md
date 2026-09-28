---
title: Answer, refusal and unknown are different states
description: Every field a prompt asks about is required, "cannot tell" is its own value, and a missing answer reads as unknown, never as no. How to model the states of an answer so that code, checks and people downstream read it right.
---

## In short

An answer about one thing has at least three states: the thing is there, it is not there, or the model
cannot tell. A refusal and a question nobody asked are two more. Model them as values, not as missing
fields. Every field the prompt asks about is required in the output type, and "cannot tell" is a value of
its own. Downstream, a missing answer reads as unknown, never as no. Otherwise a flow that saw nothing
looks the same as a flow that saw everything was fine. Ask only for what the input can show, and let an
enum cover what real inputs contain.

## The states of an answer

| State | What it means | How to model it |
|---|---|---|
| present | the model looked and found it | a value, such as `present` in an enum |
| absent | the model looked, could see the part of the input where it would be, and did not find it | a value, such as `absent` |
| cannot tell | the input does not let the model answer: a blurred scan, a missing page, audio cut off, another language | a value, such as `cannot_tell`, with a short reason |
| refused | the provider or the model declined the whole call | not a field: the call ends as a refusal, see below |
| not asked | the question was never put to the model for this input | no reading at all, and nothing downstream counts it as an answer |

Three of these are easy to confuse:

- **Absent and cannot tell.** Without a `cannot_tell` value, a model that could not see the relevant part
  of the input has to pick `absent` or `present`. Either way the output lies.
- **Absent and missing.** An optional field, or a list the model may leave short, lets the model skip
  what it did not want to answer. Code that reads a missing reading as `false` turns every skipped
  question into "no".
- **Unknown and zero.** Two readings that are both empty do not agree at 0.0. They say nothing. A metric
  that returns 0 there, instead of unknown, drags the average down for no reason. A `code` step keeps it
  as `null` in a nullable field. A check always returns a `Verdict`, and a scored check without a score
  is an error, so score such a metric only on the cases where it is defined: select them with
  `cases.tags` in a separate experiment.

## Required fields

A field of a type is required unless its type ends with `?`. Make every field the prompt asks about
required. Keep `?` for fields that only some states fill, such as the reason for `cannot_tell`.

Required fields do not cover lists. When the model returns a list of readings, the schema cannot say
"one finding per clause you were asked about". Check that yourself (see
[a completeness check](#a-completeness-check) below). Or give every asked item its own required field
with a dynamic output schema, one of the [five cases of dynamic shape](/concepts/five-dynamic-shape-cases/).

## Refusal is a call outcome, "cannot tell" is a value

When a provider or a model refuses the whole call, AQVEN records the call's outcome as a refusal before it
parses anything. The agent's `output.on_refusal` decides what happens next: `fail` by default, or `retry`,
or `fallback` to the next model. See
[What happens when a model is called](/concepts/what-happens-when-a-model-is-called/).

"Cannot tell" is not a refusal. It is an ordinary answer, part of your type, and it flows downstream like
`present` and `absent`. Make it visible in the flow's output, so a person reading a run sees how many
questions the model could not answer, not just a clean list of "no".

## Ask about the thing, not about the ability

A question like "can you read this page?" gets "yes" on almost anything, including a blank page or a
photo of a desk. Ask about the content: "does this contract have a termination clause?", "does this
message ask for a refund?". Then `cannot_tell` has a clear meaning: the input does not show enough to
answer that question.

## Only what the input shows

A field belongs in the output only if the input the model receives can decide it. An invoice PDF shows
the amount due, not whether it was paid. A call transcript shows the words that were said, not what the
caller meant beyond them. A video clip shows what happens in the frame, not what happens just outside
it. A product photo shows the colour, not the weight. Asked for such a field, the model guesses, and the
guess looks like any other answer.

For each field, name the part of the input that decides it. If only history, the account or the subject
itself can tell, give the step that information as another input (the payment record, the account's
earlier tickets), or take the field out of the output.

## Enums cover real inputs

An enum that describes the input has to cover what real inputs contain, not what the folder or the spec
is called. An "invoices" folder holds receipts, credit notes and the odd order confirmation. "English
calls" include bilingual ones. A bug-report queue gets feature requests. Two values keep such an enum
honest:

- `other` (or `outside_scope`) for an input that falls outside the listed values;
- `cannot_tell` for an input that does not show enough to choose.

Size the enum to the decision its consumer makes. A router that sends tickets to eight queues needs
about eight intents, not sixty, and only values the input can show. Draft the list short and agree on it
before you write the files. A large enum inside a list can also be too big for the provider to build;
see [How big an output schema can get](/concepts/schema-state-space/).

A field the input may not show stays required and has `cannot_tell` among its values. A runtime check
on the inference that retries (`on_fail: retry`, see [the inference reference](/reference/inference/))
must accept `cannot_tell` as well. A check that rejects it sends the model back until it guesses, and
every honest answer counts as a failure.

## Fields for an intermediate step

When one step's output feeds another step, design it from the next step's mistakes, not from the fewest
fields. List the pairs of answers the next step confuses, and give the intermediate record the fields
that separate them:

| The next step confuses | The intermediate record needs |
|---|---|
| a refund request and a billing error | whether money was already charged |
| the total and the subtotal of an invoice | the printed label next to each amount |
| who agreed to what in a meeting | where the speaker changes |
| what caused what in a video clip | the order of events |

"The fewest fields" applies to final outputs. An intermediate record that is too coarse folds the detail
that decides the next step into a generic word, and the next step cannot get it back.

Before a series, run a new intermediate record on about 10 varied cases and count the values of each
field. A field that takes one value on more than 80% of the cases tells the next step almost nothing. A
field the model keeps failing to fill (`MODEL_SCHEMA_MISMATCH` on that field) usually lacks a value that
real inputs need. When a coarse record hurts the next step, the lesson is about that record, not about
intermediate steps in general.

## An example

A contract review asks about a list of clauses. The finding for one clause has "cannot tell" as a value
and a reason only when it applies:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "enum"
description: "What the model found for one clause it was asked about"
values:
- value: "present"
  description: "The clause is in the document"
- value: "absent"
  description: "The document is readable and the clause is not in it"
- value: "cannot_tell"
  description: "Pages are missing or unreadable, so the answer is not known"
```

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "The answer about one clause the model was asked about"
fields:
- name: "clause"
  type: "Text"
  description: "The key of the asked clause, as given in the input"
  maxLength: 40
- name: "presence"
  type: "ClausePresence"
  description: "Whether the clause is there, or that it cannot be told"
- name: "reason"
  type: "Text?"
  description: "Why the answer is cannot_tell; null for present and absent"
  maxLength: 200
```

Downstream, a `code` step or a check reads the states like this:

| Finding | Counts as |
|---|---|
| `present` | yes |
| `absent` | no |
| `cannot_tell` | unknown, counted apart |
| no finding for an asked clause | unknown, and a completeness failure |

### A completeness check

A check that fails an attempt when the answer skips an asked item. It runs as a runtime check on the
inference, or as an experiment check scored on every attempt:

```python
from aqven.policies import EvalContext, NoParams, Verdict
from my_project.types import ContractReview, ReviewRequest


def answered_every_clause(
    value: ContractReview, context: EvalContext[ReviewRequest, ContractReview], params: NoParams
) -> Verdict:
    asked = {clause.key for clause in context.inputs.clauses}
    answered = {finding.clause for finding in value.findings}
    missing = sorted(asked - answered)
    reason = f"no answer about: {', '.join(missing)}" if missing else None
    return Verdict(passed=not missing, reason=reason)
```

Measured this way, models differ a lot: one answers every asked question in almost every call, another
skips some questions in a large share of calls. Code that reads a missing answer as "no" hides the
difference, because a skipped clause looks exactly like a contract that does not have it.

## How this shapes what you do

- Write every field the prompt asks about as required, and give "cannot tell" its own value.
- For every field, name the part of the input that decides it. Otherwise give the step another input, or
  drop the field.
- Size an enum to its consumer's decision. An enum that describes the input gets `other` and
  `cannot_tell`, and a retry check accepts `cannot_tell`.
- Design an intermediate record from the pairs the next step confuses, and try it on about 10 cases
  before a series.
- Ask the model about the content of the input, not about its own ability.
- In `code` steps, checks and flow outputs, keep unknown apart from no. Show how many answers were
  unknown.
- Add a completeness check whenever the output is a list of answers to a list of questions. Measure it
  per model before you compare models on anything else.
- In cases, write an optional input the case does not have as an explicit `null`.

## See also

- [How big an output schema can get](/concepts/schema-state-space/): keep the answer small enough for the
  model to hold.
- [How to write a custom evaluator](/engine/custom-evaluator/): the check function signature.
- [Five cases of dynamic input and output shape](/concepts/five-dynamic-shape-cases/): one required field
  per asked item.
- [Correctness needs ground truth and a control](/concepts/metrics-and-controls/): measuring answers
  against labels.
