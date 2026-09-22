---
title: How to pause for a person
description: Add a human node that suspends a run and waits for a person to submit a typed answer, with a deadline and a policy for what happens if nobody answers in time.
---

## When you need this

Use a `human` node whenever a step needs a person's judgment before the flow can continue — approving
a reply before it goes out, signing off on a refund, picking between options a model surfaced. Unlike
every other node kind, it doesn't run code or call a model: it suspends the run and waits for someone
to submit an answer, or for the deadline to pass first.

## Steps

- Write `<stem>.node.yaml`: `node: "human"`, a `description`, `form` (the id of a record type already
  declared in the project), `assignee`, `timeout_seconds`, `on_timeout`, and `in` — context fields shown
  to whoever answers, the same shape as any other node's `in` bindings.
- `form` is what the assignee's answer must match — the node has no separate `out` list, because `form`
  is also the node's own output type once someone submits it.
- `assignee` is a plain string. AQVEN doesn't resolve it against a user directory or send a
  notification on your behalf; how it maps to an actual person — an email, a Slack handle, a queue — is
  up to whatever's watching for open waits in your own tooling.
- `timeout_seconds` sets how long the node waits before `on_timeout` takes over. Pick the policy by its
  `policy` field:
  - `fail` — the node fails once the deadline passes.
  - `default` — give a `value` shaped like `form`; it's used automatically, and the node still succeeds,
    marked degraded. If `value` doesn't actually match `form`, the node fails instead.
  - `escalate` — a new `assignee` and a fresh `timeout_seconds` for one more attempt. If that person
    doesn't answer either, the node fails — escalation happens once, not indefinitely.
- `in` fields are read-only context for the person deciding — the bindings pull from the flow's input or
  earlier nodes, same as any other node kind, but none of them feed back into the answer. Only the
  fields `form` declares do.

### Example

This is the showcase project's `lead` node, one of two `human` nodes inside `approvals`, a `parallel`
node in its `support_case` flow. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its file lives at `flows/support_case/nodes/approvals/lead.node.yaml`. The showcase is written for a
Russian-market storefront, so its descriptions are in Russian; the file below is translated to English
for this page:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "human"
description: "The support lead approves, edits, or rejects the reply"
form: "ReplyApproval"
assignee: "support_lead"
timeout_seconds: 14400
on_timeout:
  policy: "escalate"
  assignee: "support_manager"
  timeout_seconds: 7200
in:
  - name: "resolution"
    type: "Resolution"
    description: "The resolution decided for the case"
    from: "$route.out.resolution"
```

That `in` field is context shown to the lead while they decide — the resolution already picked for the
case (the real node has three more `in` fields, the same shape as this one, pulling in the drafted
reply, its score, and how many editing rounds it went through). None of it is part of what the lead
submits back: only `ReplyApproval`, the type `form` names, defines that shape — declared like any other
record type, in its own file. Here are its two most illustrative fields (the real file also has a
third, `note`, for an optional comment):

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "The support lead's decision on the reply"
fields:
- name: "decision"
  type: "ApprovalDecision"
  description: "The decision on the reply"
- name: "edited_text"
  type: "Text?"
  description: "The corrected text when edited; null otherwise"
  maxLength: 1500
```

`decision` is an enum with three values — `approve`, `edit`, `reject` — so the lead's answer is that
decision plus, when they edit, the corrected text.

If `support_lead` doesn't answer within 14400 seconds (four hours), the wait escalates to
`support_manager` with a fresh two-hour deadline. If the manager doesn't answer either, the node fails.

The other policy from the list above, `default`, looks like this inline: `on_timeout: {policy:
"default", value: <a value shaped like form>}`. With it, the node succeeds automatically on that value
once the deadline passes — marked degraded, instead of failing or escalating to another assignee.

## Under the hood

A `human` node's wait runs on [DBOS](/concepts/what-this-is-built-on/), the same durable layer that
checkpoints every other step. Suspending here doesn't hold a server thread or process open while it
waits — the run picks back up only when someone submits an answer or the deadline passes, whether
that's minutes away or days.

## See also

- [How to branch into parallel steps](/engine/parallel-node/) — running `lead` and `brand` side by
  side, the way the showcase's `approvals` node does.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `HumanNodeSpec`, generated from the code.
- [Type specifications](/reference/types/) — every field on a record type, including the one a `form`
  points at.
