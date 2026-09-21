---
title: Human Review
description: Answer a waiting step and resume its run.
---

Open **Review** to see work that is waiting for a person. The queue contains two kinds of wait: a typed workflow form from a `human` node, and an allow-or-deny request for an agent tool protected by an approval rule. Choose an item to read its request, run/node context, deadline, and expected answer.

## Make a decision

1. Sort the queue by the deadline signal and select the item.
2. Read the evidence columns. They contain the declared input, tool proposal or form context, and any available prior call details.
3. Check the run and node address if the decision depends on work earlier in the flow.
4. Fill the typed form or choose the approval outcome.
5. Submit once. Studio sends the run ID, execution address, wait attempt, and a client operation ID so the backend can reject a stale or duplicate answer safely.

A workflow may have one review step or several independent reviews. Each `human` node has a form derived from its project type. A tool approval only controls the proposed tool action; it does not replace a business decision form.

The waiting state is durable through DBOS, so the run can pause and continue later. An expired, already-resumed, stale-attempt, or cancelled run cannot accept the answer; Studio shows the backend response instead of silently accepting it. [Runs](/studio/runs/) shows the run before and after the decision. [Tool approval and human review](/engineering/tool-approval/) covers the node and agent definitions, timeout policies, and API behavior.
