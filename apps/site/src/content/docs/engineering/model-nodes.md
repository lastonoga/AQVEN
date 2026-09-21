---
title: Model Nodes
description: Invoke a typed inference through an agent and bind only the context that request needs.
---

Use an `llm` node when the step needs interpretation, generation, classification, extraction, or judgment that deterministic code cannot provide. The node selects an [Inference](/engineering/inferences/) and [Agent](/engineering/agents-and-models/); the inference owns the prompt and typed task, while the agent owns the model route and execution settings.

```yaml title="flows/<flow_id>/nodes/classify.node.yaml"
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Classify the support question"
inference: "classify_question"
agent: "support_classifier"
in:
  - name: "question"
    from: "$prepare.out.cleaned"
```

Validate the rendered request with prompt preview and inspect input, prompt, output, and checks together in a run trace. [Structured Output](/engineering/structured-output/) explains response validation and provider compatibility.
