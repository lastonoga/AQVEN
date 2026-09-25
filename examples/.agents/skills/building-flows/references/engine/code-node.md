# How to write a step in Python

Add a code node that runs a plain Python function, with typed parameters in and a typed record out.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [See also](#see-also)

## When you need this

Use a `code` node whenever a step is deterministic logic you'd rather write than prompt for: parsing
and normalizing a request, looking up values from a fixed table, shaping data for the next node. It
runs your own synchronous Python function, not a model call. If the step needs to call an external
service or do anything asynchronous, that's a `tool` node instead — a `code` node's function is never
`async`.

## Steps

- Create a folder for the node and give the node file and the Python file the same stem, so AQVEN
  links them by filename alone — write `run: "<function_name>"` in the node YAML and AQVEN looks for
  that function inside the `.py` file next to it. (`run` also accepts an explicit `module:function`
  reference to a function anywhere else in the project, but the filename convention above is what
  you'll use day to day.)
- Write `<stem>.node.yaml`: `node: "code"`, a `description`, `run` (the function name), `in` — the
  fields your function takes, each with a `name`, a `type`, a `description`, and a source (`from` a
  reference, or a literal `value`) — and `out` — the fields your function returns, each with a `name`,
  a `type`, and a `description`. Unlike an `llm` node, a `code` node has no separate inference file:
  the typed contract lives on the node itself.
- Write the function. Its parameters must match the `in` fields one for one, same names, same order.
  Its return value is a single record built from all the `out` fields together — AQVEN generates that
  record type for you from the node's `out` list, so you import it rather than define it. Run
  `aqven generate` (or `aqven check`, which does this too) any time you change
  `in` or `out` to regenerate that type.
- Edit the function while `aqven dev` is running and just run the flow again: the server notices
  that the project's Python files changed and imports them afresh for the next run — the step, the modules
  it imports, and the generated types. There's no server to restart.

### Example

This is the showcase project's `tally` node, the step right after the `vote` map node in its
`support_case` flow — it tallies the votes `vote` produced into a single intent. Create it yourself
with:

```bash
aqven new my_project --template showcase
```

Here's the real example. `tally.node.yaml` declares one input field, taken from the map node right before it, and three
output fields:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Tallies the votes: agreement when a majority votes together with enough confidence, otherwise a split and the most confident vote's intent"
run: "tally"
in:
  - name: "ballots"
    type: "IntentBallot[]"
    description: "The votes for intent"
    maxItems: 3
    from: "$vote.out.ballots"
out:
  - name: "intent"
    type: "CaseIntent"
    description: "The majority's intent, or the most confident vote's intent"
  - name: "agreement"
    type: "Agreement"
    description: "Whether the votes agree with each other"
  - name: "confidence"
    type: "Score"
    description: "Confidence in the intent"
```

`tally.py` defines the function `tally`, matching the file's own stem, the `run` value, and the one
`in` field name and order. It imports `SupportCaseTallyOut` — the record AQVEN generated from the `out`
list above — as its return type:

```python
from collections import Counter
from statistics import mean
from typing import Annotated, Final

from pydantic import Field

from lumen.types import CaseIntent, IntentBallot, SupportCaseTallyOut

MIN_BALLOTS: Final = 2
AGREEMENT_CONFIDENCE: Final = 0.6


def tally(ballots: Annotated[list[IntentBallot], Field(max_length=3)]) -> SupportCaseTallyOut:
    if not ballots:
        return SupportCaseTallyOut(intent="question", agreement="split", confidence=0)
    counts: Counter[CaseIntent] = Counter(ballot.intent for ballot in ballots)
    intent, votes = counts.most_common(1)[0]
    confidence = mean(ballot.confidence for ballot in ballots if ballot.intent == intent)
    majority = votes * 2 > len(ballots) and len(ballots) >= MIN_BALLOTS
    if majority and confidence >= AGREEMENT_CONFIDENCE:
        return SupportCaseTallyOut(intent=intent, agreement="agreed", confidence=confidence)
    strongest = max(ballots, key=lambda ballot: ballot.confidence)
    return SupportCaseTallyOut(intent=strongest.intent, agreement="split", confidence=strongest.confidence)
```

What matters for the node's contract is the signature: one parameter, `ballots`, typed
`list[IntentBallot]`, matching the single `in` field by name; one return value, typed
`SupportCaseTallyOut`, built from all three `out` fields at once. If the node had declared more `in`
fields, `tally` would take more parameters — one per field, same names, same order — instead of one
bundled input; only the output side is bundled into a single typed record.

## See also

- [How to call a model](llm-node.md) — often the next node kind in a flow, once a `code` node
  has shaped the data for it.
- The engineering loop — what to do when a run's output isn't what you
  expected.
- [Node specifications](../reference/nodes.md) — every field on `CodeNodeSpec`, generated from the code.
