---
title: Nodes
description: Choose a step, bind its inputs, and understand its output contract.
---

A node performs one step of a flow. Each file has `apiVersion: "aqven/v1"`, `kind: "Node"`, a `node` kind, and a nonempty `description`. The file lives at `flows/<flow_id>/nodes/<node_id>/<node_id>.node.yaml`. A flow's `order` lists its top-level node IDs.

## Choose the kind by the job

| Need | Kind | Guide |
| --- | --- | --- |
| Normalize, calculate, or apply an exact rule | `code` | Below |
| Interpret or generate with a model | `llm` | [Agents and models](/engineering/agents-and-models/) |
| Call a declared external capability | `tool` | [Tools and human steps](/engineering/tools-and-human-steps/) |
| Wait for a person's typed answer | `human` | [Tools and human steps](/engineering/tools-and-human-steps/) |
| Run one path selected by data | `switch` | [Switch](/engineering/switch/) |
| Run a fixed set of independent branches | `parallel` | [Parallel and map](/engineering/parallel-and-map/) |
| Run one child for each list item | `map` | [Parallel and map](/engineering/parallel-and-map/) |
| Repeat bounded work | `loop` | [Loops](/engineering/loops/) |
| Reuse a separately defined flow | `call` | [Calls and narrowing](/engineering/calls-and-narrowing/) |
| Validate dynamic data as a known type | `narrow` | [Calls and narrowing](/engineering/calls-and-narrowing/) |

The package currently accepts exactly these ten kinds. `seq`, `race`, `gate`, `try`, and `const` are not node kinds. The generated [Node reference](/engineering/reference/nodes/) gives every field for every kind.

## A complete code node

This node accepts question text and returns the same text with repeated spaces removed:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Collapse repeated whitespace in a question"
run: "prepare"
in:
  - name: "text"
    type: "Text"
    description: "Question text as received"
    maxLength: 2000
    from: "$input.text"
out:
  - name: "text"
    type: "Text"
    description: "Question text with single spaces"
    maxLength: 2000
```

The neighboring `prepare.py` exports a `prepare` function. The function receives the declared input and returns a value matching `out`. Changing the input name from `text` changes the Python parameter the runtime expects; changing `out.text` breaks later bindings such as `$prepare.out.text` until they are updated.

## A complete LLM node

The next node uses the prepared text and the original tone:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Answer the prepared question"
agent: "assistant"
in:
  - name: "text"
    from: "$prepare.out.text"
  - name: "tone"
    from: "$input.tone"
```

The node's neighboring inference declares the input and output fields. The `agent` identifies the model configuration. Adding `inference: "reply"` selects a named inference when the node does not use the neighboring default. The model's response is available as `$reply.out.<field>`. See [Inference](/engineering/reference/inference/) and [Agents](/engineering/reference/agents/) for their complete contracts.

## Bind a literal or a reference

`llm`, `tool`, and `call` nodes use `FieldBinding`: a `name` and exactly one of `from` or `value`. For example, a fixed language:

```yaml
in:
  - name: "text"
    from: "$prepare.out.text"
  - name: "language"
    value: "en"
```

`code` and `human` nodes use `InputField`, which also requires `type` and `description` and can carry constraints. Output fields on a `code` node require `name`, `type`, and `description`. A `map`, `parallel`, or `loop` output additionally needs `from`. These are different field shapes; see the generated [Fields reference](/engineering/reference/fields/).

## Add limits where work happens

Every node accepts optional `limits`. If a model node can spend at most two requests, declare:

```yaml
limits:
  requests: 2
  seconds: 30
```

Reducing a node limit narrows what that step can do even when the flow budget is larger. Put a budget close to expensive work, then verify the limit with a run that reaches it.
