---
title: Input and Output Contracts
description: Define what enters and leaves flows, nodes, tools, and model requests before choosing their implementation.
---

AQVEN uses declared types at every boundary. Start a workflow design by naming the input record, output record, and the uncertainty or failure state each consumer must handle.

## Flow contract

A flow declares one input type, one output type, ordered nodes, and return bindings:

```yaml
apiVersion: "aqven/v1"
kind: "Flow"
description: "Answer a customer question"
input: "Question"
output: "Answer"
order: ["prepare", "reply"]
returns:
  - name: "text"
    from: "$reply.out.text"
```

The return field must exist on the declared `Answer` type and the referenced node value must be compatible with it. This makes the public result independent of the internal node layout.

## Node contract

Each node declares or inherits its input and output shape. A code node declares both. A model and tool node bind declared inputs into an inference or tool contract. A control node defines how child outputs become its output. Read [Nodes](/engineering/nodes/) before choosing a node kind.

## Do not model uncertainty as missing structure

If a model can be unsure, make uncertainty part of the output contract. A typical result includes a decision, a reason, and optional evidence:

```yaml
fields:
  - name: "decision"
    type: "ResolutionAction"
    description: "Action the workflow recommends"
  - name: "reason"
    type: "Text"
    description: "Short explanation grounded in the input"
    maxLength: 1000
  - name: "evidence"
    type: "Citation[]"
    description: "Supporting records, if available"
    maxItems: 10
```

This gives a downstream switch, evaluator, and human reviewer a stable value to inspect. [Schema Design](/engineering/schema-design/) explains how to choose fields and [Types](/engineering/types/) defines the type forms.

## Check every boundary

The compiler checks declared shape compatibility. A full check also simulates the flow without model calls:

```bash
uv run {{CLI_COMMAND}} check .
```

Use datasets and evaluations to test whether a model obeys the useful parts of the contract, such as correct decisions and evidence quality.
