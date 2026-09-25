---
type: "llm"
weight: 3
---
intent_split_long_messages was explored on dev cases of long_customer_messages: long messages with one request that
open with a side topic. The owner wants to confirm it on holdout with a new dataset, multi_request_messages, of
messages that ask for two or three things at once, a kind of case dev never had. Pass only if the answer, before any
series and before switching the experiment's dataset:
- says the new set is a different population from the one dev explored, so a holdout verdict on it would not confirm
  the dev signal (a pass or a fail there would answer a different question);
- proposes keeping dev and holdout in one population, for example adding the new messages to the experiment's own
  dataset so they fall into both splits and exploring on dev again before any holdout, or asking the multi-request
  question as its own experiment with a new id;
- leaves the decision to the owner.
Noting that a single expected intent is ambiguous for a message with several requests is a plus, not required.
Fail if the answer points intent_split_long_messages at multi_request_messages, or presents a holdout run on the new
set as the confirmation of the dev signal.
