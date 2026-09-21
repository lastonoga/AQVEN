---
title: How to pause for a person
description: Add a human node that suspends a run and waits for a person to submit a typed answer, with a deadline and a policy for what happens if nobody answers in time.
---

# How to pause for a person

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
  - name: "reply"
    type: "ReplyDraft"
    description: "The reply after polishing"
    from: "$polish.out.reply"
  - name: "resolution"
    type: "Resolution"
    description: "The resolution decided for the case"
    from: "$route.out.resolution"
  - name: "score"
    type: "Score"
    description: "The critic's score for the reply"
    from: "$polish.out.score"
  - name: "iterations"
    type: "Int"
    description: "How many editing rounds the reply went through"
    from: "$polish.out.iterations"
```

The four `in` fields are shown to the lead while they decide — the drafted reply, the resolution
already picked for the case, a critic's score, and how many rounds of editing the draft went through.
None of that is part of what the lead submits back: only `ReplyApproval`, the type `form` names,
defines that shape — declared like any other record type, in its own file:

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
- name: "note"
  type: "Text?"
  description: "The lead's note; null if there isn't one"
  maxLength: 400
```

`decision` is an enum with three values — `approve`, `edit`, `reject` — so the lead's answer is that
decision plus, when they edit, the corrected text.

If `support_lead` doesn't answer within 14400 seconds (four hours), the wait escalates to
`support_manager` with a fresh two-hour deadline. If the manager doesn't answer either, the node fails.

The `approvals` node's other branch, `brand`, waits on a brand editor to pick which media to send with
the reply, and picks a different `on_timeout` policy — a fallback instead of an escalation, since a
missing media choice isn't worth blocking the case on:

```yaml
on_timeout:
  policy: "default"
  value:
    use_image: false
    use_voice: true
    use_clip: false
```

That `value` matches `MediaApproval`, `brand`'s own `form`, field for field — if it didn't, the node
would fail instead of falling back to it.

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
