---
title: How to repeat a step with a limit
description: Add a loop node that runs the same sequence of steps pass after pass, stopping on a policy or a hard cap, then picks which pass's output the node returns.
---

# How to repeat a step with a limit

## When you need this

Use a `loop` node whenever a step needs another look at its own result — filling in a record and
checking it against rules, redrafting something until it clears a check, refining an answer pass by
pass. A `loop` node runs the same short sequence of steps more than once, until a policy says to stop
or a hard cap is reached, then hands back whichever pass's results a second policy picks.

## Steps

- Write `<stem>.node.yaml`: `node: "loop"`, a `description`, `body`, `max_iter`, `select`, and `out`.
  `init` and `stop` are both optional.
- `body` is an ordered list of sibling node ids — files that live in the same directory as the loop
  node itself, the same way a `map` node's single body node does. Every pass runs all of them, in that
  order, once each.
- `max_iter` is the hard cap on passes, from 1 to 50. Whatever else is set, the loop never runs more
  passes than this.
- `stop` is a list of policies, checked once every pass finishes. Each entry is `use` (a built-in name)
  or `run` (your own `module:function`), plus `with` for whatever parameters it takes — the same policy
  shape used everywhere else in AQVEN. Two built-ins ship: `threshold` stops once a numeric path crosses
  a `gte` or `lte` bound, and `stagnation` stops once a numeric path stops improving by at least
  `min_delta` over a `window` of passes. The first policy in the list that says stop, stops the loop.
  Leave `stop` unset and the loop always runs to `max_iter`.
- `select` picks which pass's results the node actually returns, once the loop has stopped for any
  reason. Same shape as `stop`. Two built-ins ship: `last` always picks the most recent pass, and
  `best`, given a `path`, picks the pass with the highest value there.
- `init` binds values into a body node's input, but only before the very first pass — for seeding
  something a later pass will read back that doesn't exist yet on pass one. Its keys are the same
  sibling ids `body` uses.
- Inside a body node, `$acc.<sibling id>.out.<field>` reads that sibling's own output from the pass
  before this one — `null` on the first pass, since there's no pass before it yet. A body node never
  sees the pass it's currently running, only the one before it.
- `out` binds what the loop node returns. `$iter.<sibling id>.out.<field>` reads from the pass `select`
  picked, which isn't necessarily the last one that ran. `$loop.iterations` is how many passes ran in
  total, and `$loop.stop_reason` is `"policy"`, `"max_iter"`, or `"budget"` — which of the three actually
  ended the loop.

### Example

This is the showcase project's `record` node in its `support_case` flow: it fills in a case record from
the customer's message and attachments, checks the record against business rules, and — if anything's
wrong — repairs it on the next pass, up to three passes total. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Unlike the node kinds covered so far, `record`'s two body nodes live in its own directory rather than
one of their own, alongside the loop node's own files:

```
flows/support_case/nodes/record/
├── record.node.yaml       the loop itself
├── record.py              its stop policy, no_issues
├── extract.node.yaml      body: fills in the record
├── extract.inference.yaml
├── extract.prompt.md
├── validate.node.yaml     body: checks it
└── validate.py            the business rules
```

AQVEN qualifies each body node's own id with the loop's — `record__extract`, `record__validate` — so
they stay distinct from any other `extract` or `validate` elsewhere in the project, the same way any
nested node's id is qualified by its container.

The showcase is written for a Russian-market storefront, so its descriptions are in Russian; the files
below are translated to English for this page. `record.node.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "loop"
description: "Fills in the case record from the form, checks it against business rules, and repairs it based on the notes"
body:
- "extract"
- "validate"
max_iter: 3
stop:
- run: "no_issues"
  with:
    path: "$iter.validate.out.issues"
select:
  use: "last"
out:
- name: "record"
  type: "Dynamic"
  description: "The record from the pass that was selected"
  from: "$iter.extract.out.record"
  value_type: "CaseRecord"
```

`body` runs `extract` then `validate`, in that order, every pass. `stop` names a policy of its own —
`no_issues`, in `record.py` next to this file, following the same filename convention a `code` node's
`run` uses: a bare name resolves to the function with that name in the `.py` file that shares this
node's stem.

```python
from pydantic import BaseModel

from aqven.policies import POLICY_CONFIG, Continue, LoopState, RefPath, Stop, StopDecision


class EmptyListParams(BaseModel):
    model_config = POLICY_CONFIG

    path: RefPath


def no_issues(state: LoopState, params: EmptyListParams) -> StopDecision:
    found = state.read(params.path)
    return Stop(f"{params.path} is empty") if isinstance(found, list) and not found else Continue()
```

`with: {path: "$iter.validate.out.issues"}` tells `no_issues` where to look: `validate`'s `issues`
output from the pass that just finished. Once that list comes back empty, `no_issues` returns `Stop`,
and the loop doesn't run a fourth pass even though `max_iter` would allow three.

`extract.node.yaml`, the first body node, is an ordinary `llm` node:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Fills in the record from the text, photo, and invoice; on a repeat, takes the check's notes into account"
agent: "gemini"
in:
- name: "message"
  from: "$prepare.out.message"
- name: "summary"
  from: "$triage.out.summary"
- name: "form_fields"
  from: "$case_form.out.fields"
- name: "feedback"
  from: "$acc.validate.out.issues"
- name: "photo"
  from: "$input.photo"
- name: "invoice"
  from: "$input.invoice"
```

`feedback` is where `$acc` earns its place: on the first pass it's `null`, since `validate` hasn't run
yet, so the model fills in the record cold. On the second and third passes, `$acc.validate.out.issues`
is whatever `validate` found wrong with the *previous* pass's record, so the model can fix exactly that.

`validate.node.yaml`, the second body node, is a `code` node:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Checks the record against business rules and returns notes for repair"
run: "validate_record"
in:
- name: "record"
  type: "Dynamic"
  description: "The record filled in by the model"
  from: "$extract.out.record"
- name: "fields"
  type: "FieldSpec[]"
  description: "The form the record was filled in against"
  maxItems: 30
  from: "$case_form.out.fields"
- name: "today"
  type: "Date"
  description: "The date of this run"
  from: "$run.context.date"
out:
- name: "issues"
  type: "Issue[]"
  description: "The rules that were broken; empty if the record is correct"
  maxItems: 10
```

`validate_record`, in `validate.py`, runs four rules and collects whatever they return. Here's one of
them — the rule [a wrong answer traces back to](/start/engineering-loop-walkthrough/) when a customer's
overheating device gets filed under the wrong symptom:

```python
def _overheating_is_risk(values: RecordValues, fields: Sequence[FieldSpec], today: date) -> tuple[Issue, ...]:
    if values.get("symptom") != "overheating" or values.get("safety_risk") is True:
        return ()
    issue = _issue(
        "safety_risk",
        "overheating_without_risk",
        "Overheating always means a safety risk",
        "true",
        json.dumps(values.get("safety_risk")),
        "Set safety_risk to true",
    )
    return (issue,)
```

Back in the loop's own `out`, `select: use: "last"` means `record` always comes from whichever pass ran
last — even the third one, if `validate` still found something wrong with it. Hitting `max_iter` isn't a
failure: the node still succeeds, `record` still gets a value, and `$loop.stop_reason` reads
`"max_iter"` instead of `"policy"`, so whatever reads `record` afterward can tell an unresolved record
from a clean one.

## See also

- [How to call a model](/engine/llm-node/) — what `extract`, the first body node, actually is.
- [How to write a step in Python](/engine/code-node/) — what `validate`, the second body node, actually
  is.
- [How to run a step over a collection](/engine/map-node/) — the other node kind whose body has its own
  reference form, `$item` and `$index` instead of `$acc`.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [From a bad answer to a verified fix](/start/engineering-loop-walkthrough/) — tracing a real wrong
  answer to one pass of this same loop.
- [Node specifications](/reference/nodes/) — every field on `LoopNodeSpec`, generated from the code.
- [Built-in policies and evaluators](/reference/built-in-policies/) — every `stop` and `select` policy's
  Python signature.
