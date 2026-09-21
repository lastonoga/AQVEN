---
title: How to respond to a human-review request
description: Open the review queue, read what a paused run produced, and submit the answer its human node's form is waiting for.
---

# How to respond to a human-review request

## When you need this

Use this when a run is paused waiting for a person to answer — a [human node](/engine/human-node/)
that needs a decision before the flow can continue. This is the screen where that answer actually gets
typed in and submitted.

## Steps

- Open a flow's review screen by changing the last part of its URL to `review` — for the showcase
  project's `support_case` flow, that's `.../flows/support_case/review`.
- The left column is a queue of every paused run, sorted by deadline, soonest first. Each card names the
  run, the execution address (which node, and which branch or iteration if it's nested inside a loop or
  parallel), the kind of wait, and who it's assigned to. A filter above the queue narrows it to overdue
  entries only.
- Click a card and the right side fills in: the same address, how much time is left or how long it's
  overdue, and what happens if nobody answers in time — the node fails, falls back to a default value,
  or escalates to someone else.
- Below that is the evidence: what the run actually produced before it paused, laid out as one column
  per field the node handed to whoever is deciding. This is read-only context, not something you edit.
- **No Approve or Reject button anywhere on this screen.** Under the evidence is a form built straight
  from the node's own form schema — the same type its [node file](/engine/human-node/) declares as
  `form`. Each field renders by its type: a boolean becomes a Yes/No choice, an enum becomes a row of
  options, a string becomes a text box, a number becomes a number field, and anything without a schema,
  or a shape the form can't render, falls back to a raw JSON box. "Approve" and "reject" aren't features
  of the screen — they're just the value you pick in whichever field the node's own schema defines for
  that, usually a boolean or an enum.
- Fill in the fields and click **Submit and resume**, the one button on the form. If something doesn't
  match the schema, Studio shows why next to the field, or as a banner if the whole answer was rejected;
  fix it and submit again. Once it's accepted, the run picks back up at that node with your answer as
  its output, and the entry drops out of the queue.

### Example

The showcase project's `support_case` flow has `lead`, a [human node](/engine/human-node/) inside
`approvals`, a `parallel` node — waiting on `support_lead` to approve a drafted reply. Open the review
screen and its card reads `approvals__lead · lead`, tagged `form`, assigned to `support_lead`.

Select it. The evidence panel shows four columns, one per field the node's `in` bindings gave to the
lead: `reply` (the drafted text), `resolution` (already decided for the case), `score` (the critic's
score for it), and `iterations` (how many editing rounds the draft went through).

Below that, the form: `ReplyApproval`, the node's `form` type, declares `decision` as an enum with three
values, so it renders as a row of choices — `approve`, `edit`, `reject` — and `edited_text` and `note`
as text boxes, both optional. Pick `edit`, type the corrected reply into `edited_text`, and click
**Submit and resume**. The run continues past `lead` with `{"decision": "edit", "edited_text": "...",
"note": null}` as its output — exactly the shape `ReplyApproval` defines.

## See also

- [How to pause for a person](/engine/human-node/) — what a `human` node is, its `form`, and what
  happens if nobody answers before the deadline.
- [How to investigate a run](/studio/investigate-a-run/) — where a paused run shows up before you come
  here, and where to look once it resumes.
