---
title: Tool Approval and Human Review
description: Choose the right review boundary, define timeout behavior, and make a waiting run safe to resume.
---

AQVEN can wait for a person in two places. Choose the boundary based on what needs a decision:

| Need | Use | The person answers |
| --- | --- | --- |
| The workflow needs a typed business decision | a `human` node | a form defined by a project type |
| A model requested a listed tool | an agent's `approval` rule | allow or deny the proposed action |

Both waits are durable through DBOS. A browser can close and a backend can restart; the run remains suspended until it is resumed, cancelled, or reaches its timeout policy.

## Review a workflow decision

Define the form as a type, then ask for it with a `human` node:

```yaml
# types/records/reply_approval.yaml
apiVersion: "aqven/v1"
kind: "Record"
description: "A reviewer decision for a reply"
fields:
  - name: "approved"
    type: "Boolean"
    description: "Whether the reply may be sent"
  - name: "note"
    type: "Text?"
    description: "Reason for a change or rejection"
```

```yaml
# flows/support.nodes/review.yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "human"
description: "Review the proposed reply"
form: "ReplyApproval"
assignee: "support_lead"
timeout_seconds: 14400
on_timeout:
  policy: "escalate"
  assignee: "support_manager"
  timeout_seconds: 3600
in:
  - name: "reply"
    type: "Text"
    description: "Draft to review"
    from: "$draft.out.reply"
```

The node produces the form fields for later nodes. Define a stable form type instead of a free-text decision so downstream behavior can bind and check `approved` explicitly.

## Review a model-requested action

Keep the model's available tools narrow, then gate the ones that create an effect:

```yaml
# agents/support.yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Resolve low-risk support cases"
model: "openai:your-model-id"
tools: ["search_articles", "send_reply"]
approval:
  tools: ["send_reply"]
  assignee: "support_lead"
  timeout_seconds: 900
  on_timeout: {policy: "fail"}
```

The agent can use `search_articles` without intervention. Its request to use `send_reply` becomes a review item. The reviewer sees the proposed tool action in [Studio Review](/studio/human-review/), not an unstructured chat message.

## Define the timeout deliberately

Every human node and tool approval has a positive `timeout_seconds` and one policy:

```yaml
# Stop when no safe continuation exists.
on_timeout: {policy: "fail"}
```

```yaml
# Continue with a declared, schema-valid safe result.
on_timeout:
  policy: "default"
  value: {approved: false, note: "No reviewer response"}
```

```yaml
# Hand responsibility to another reviewer.
on_timeout:
  policy: "escalate"
  assignee: "on_call_lead"
  timeout_seconds: 1800
```

Use `default` only when the literal value is safe and valid for the form or tool outcome. Use `escalate` only when the next assignee and deadline are real operational commitments. A timeout is a workflow behavior, so cover it with a dataset or integration case.

## Operate the review queue

In Studio, open **Review**, select a waiting item, inspect the evidence and its run/node address, then submit the typed form or approval decision. For a client integration, read `waits` in the run snapshot and use the run-resume endpoint with the exact address and attempt. [Run lifecycle](/engineering/run-lifecycle/#resume-a-wait) gives the API sequence.

For code-side validation of all fields and allowed timeout shapes, use the generated [Agent reference](/engineering/reference/agents/) and [Node reference](/engineering/reference/nodes/).
