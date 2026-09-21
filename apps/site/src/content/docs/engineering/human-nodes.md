---
title: Human Nodes
description: Pause a durable run for a typed business decision and resume it safely.
---

Use a human node when the workflow needs a person to produce a typed answer, such as an approval, escalation choice, or correction. The node names a record type as its form, an assignee, a deadline, and a timeout outcome.

```yaml
node: "human"
description: "Approve the proposed refund"
form: "RefundDecision"
assignee: "support_lead"
timeout_seconds: 3600
on_timeout: {policy: "fail"}
```

DBOS keeps the wait durable. Reviewers use Studio’s queue or a run client to answer the exact waiting attempt. [Tool Approval and Human Review](/engineering/tool-approval/) distinguishes a human form from approval of a model-requested tool.
