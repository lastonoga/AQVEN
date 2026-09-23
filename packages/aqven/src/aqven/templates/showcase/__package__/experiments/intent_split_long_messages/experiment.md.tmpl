# Condense first, then classify

**Purpose:** checking a risky hypothesis before building it into the flow (a comparison of two arms).

Long customer messages often open with something other than the request: a late parcel that did arrive, praise, a
side question about colours. A cheap model reading the whole message tends to classify the opening topic. The
hypothesis is that condensing the message to "what the customer needs now" first, and classifying that summary,
gets the intent right more often.

**Arms.** Both arms take a `CaseRequest` and return an `IntentBallot`, and both use the cheap `llama` agent, so the
only difference is the structure.

- `one_step`: `classify_message` reads the whole message.
- `two_step`: `condense_message` writes a summary of at most 600 characters, and `classify_summary` decides from it.

Both classifiers share the intent rubric in `fragments/intent_rubric.md`.

**Cases.** `long_customer_messages` holds twelve long messages, four per intent, each with the intent a support lead
assigned (`expected_output.intent`). The tags are:

- `length`: `long` is about 150 words, `very_long` is about 250.
- `intent`: the expected intent.
- `opens_with`: the topic the message leads with. The interesting cases are the ones where it differs from `intent`.

**Reading the result.** `two_step` has to beat `one_step` on the `intent` check by more than 0.05, and a correct intent
may cost at most 50% more (`cost_of_pass`), since the split adds a second call. If it wins only on `very_long`, the
split belongs behind a length switch, not on every case.

**Caveat.** Twelve cases can reject a large effect but cannot confirm a small one. Treat a win here as a reason to run
the comparison on a larger set, not as a decision.
