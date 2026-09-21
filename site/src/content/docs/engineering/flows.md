---
title: Flows
description: Define a workflow's contract, execution order, return values, limits, and guarantees.
---

A flow answers three questions: **what data enters, which nodes run, and what result leaves?** Put its definition in `flows/<flow_id>/flow.yaml`. The file name identifies the flow. The `input` and `output` fields name types declared in `types/`.

## A complete flow

Suppose a question should be cleaned up before a model answers it. The following is a complete `flow.yaml` for two nodes, `prepare` and `reply`:

```yaml title="flows/<flow_id>/flow.yaml"
apiVersion: "aqven/v1"
kind: "Flow"
description: "Clean a question and answer it in the requested tone"
input: "Question"
output: "Answer"
returns:
  - name: "reply"
    from: "$reply.out.reply"
  - name: "tone"
    from: "$input.tone"
order:
  - "prepare"
  - "reply"
```

`Question` has `text` and `tone`; `Answer` has `reply` and `tone`. The return bindings must supply the fields required by `Answer`. `prepare` and `reply` need matching `.node.yaml` files. [Nodes](/engineering/nodes/) shows their full definitions.

The flow runs `prepare` before `reply`. This makes `$prepare.out.text` available to `reply`. `returns` is evaluated after the ordered nodes finish. Here the reply comes from the model, while the tone passes through from the original input. A return can also use `value` for a fixed literal:

```yaml
returns:
  - name: "reply"
    from: "$reply.out.reply"
  - name: "tone"
    value: "friendly"
```

That change would make every result report `friendly`, regardless of the input. Use a literal only when that is the intended product behavior. Each binding must have **exactly one** of `from` and `value`.

## Add a step

If a deterministic `screen` node must run between preparation and reply, add it to `order` and bind its output into the reply node:

```yaml
order:
  - "prepare"
  - "screen"
  - "reply"
```

Changing `order` changes which earlier outputs can be referenced. A node cannot read `$screen.out.*` if `screen` appears later in the same sequence. `order` contains top-level nodes; child nodes of `switch`, `parallel`, `map`, and `loop` are declared by those control nodes.

## Return several values

The `output` type determines what the caller receives. If you add a `confidence` field to that type, add a matching return binding:

```yaml
returns:
  - name: "reply"
    from: "$reply.out.reply"
  - name: "tone"
    from: "$input.tone"
  - name: "confidence"
    from: "$reply.out.confidence"
```

Changing the output type or a return binding changes the contract of Python callers and of any `call` node that invokes this flow. Check both before merging the change.

## Read a value from the right scope

| Reference | Meaning | Typical use |
| --- | --- | --- |
| `$input` | The entire flow input | Pass a record to a code node |
| `$input.text` | One input field | Bind a field to a node |
| `$prepare.out.text` | Output of an earlier top-level node | Feed a later step |
| `$run.context.<key>` | Declared run context | Locale, tenant, or other run context |
| `$item` | Current list item inside `map` | Process one item |
| `$iter` | Current iteration inside `loop` | Compare or return a revision |
| `$case` | Active case inside `switch` | Branch-local work |
| `$branch.<name>` | Named branch inside `parallel` | Join branch results |

The exact paths available inside a control node depend on its child and output contracts. Use `{{CLI_COMMAND}} check .` to catch a misspelled, unavailable, or incompatible reference. [Fields and bindings](/engineering/reference/fields/) lists the raw YAML shapes.

## Pass run context

Declare context keys when a flow relies on information outside its input record:

```yaml
context:
  - "locale"
```

This makes the dependency explicit. A node can then bind `$run.context.locale`. Keep business data in the input type when it belongs to the request itself. Supported keys are `date`, `time_zone`, `locale`, and `tenant_id`.

## Set a budget

Limits can be set on a flow and on individual nodes:

```yaml
limits:
  requests: 5
  tool_calls: 10
  tokens: 12000
  usd_micros: 500000
  seconds: 120
```

Each field is optional. Lowering a limit can stop runs that previously succeeded; raising it expands the maximum work and cost. `usd_micros` is a whole number of millionths of a US dollar. See the generated [Limits reference](/engineering/reference/common/#limits) for bounds.

## Require a design invariant

`requires` adds a project check that ordinary type checking cannot express. For example, a review panel may require three distinct model families:

```yaml
requires:
  - rule: "families_distinct"
    nodes: ["review_a", "review_b", "review_c"]
    min: 3
```

The other supported rules are `family_disjoint_from_input` (reviewers must differ from the model family that produced an input) and `field_before` (one output field must precede another in the named nodes). Their exact fields are in the generated [Flow reference](/engineering/reference/flows/).

## Check a change

From the project directory:

```bash
uv run {{CLI_COMMAND}} check .
uv run {{CLI_COMMAND}} tree .
```

`check` validates fields, references, types, and execution paths without sending a model request. `tree` confirms that the flow and node files were discovered. Open [Studio Canvas](/studio/canvas/) to inspect the same graph visually, then [Runs](/studio/runs/) to see values from an execution.
