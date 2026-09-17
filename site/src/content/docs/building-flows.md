---
title: Building Flows
description: How nodes wire together, shapes, tools, and which node kind fits which job.
---

A flow is nodes wired together by references. This page is the mechanics: how a node reads another node's
output, how to shape data so it stays type-checked end to end, and which node kind fits which job.

## Bindings: how nodes read each other

A node declares what it needs in `in:`; each entry is a `name` plus exactly one source — `from` (a reference) or
`value` (a literal):

```yaml
in:
- name: "text"
  from: "$prepare.out.text"
- name: "tone"
  from: "$input.tone"
- name: "language"
  value: "en"
```

Every reference starts with `$`:

| Reference | Reads |
|---|---|
| `$input` | the flow input; `$input.customer.email` walks into it |
| `$<node>.out` | another node's output in the same flow: `$classify.out.category` |
| `$item`, `$index` | the current element and its position inside `map` |
| `$case` | the value a `switch` matched |
| `$acc`, `$iter` | the accumulator and iteration counter inside `loop` |
| `$branch.<key>` | one branch's output inside `parallel` |
| `$ok`, `$failed` | the successful and failed elements after `map` |
| `$run.context.date`, `.time_zone`, `.locale`, `.tenant_id` | the run context |

`.field` and `[0]` step into a value; `[*]` lifts a field out of every element of a list at once. The compiler
checks every reference before anything runs: it must exist (`E_REF_MISSING`), must be visible from that node
(`E_REF_SCOPE` — a node can't read a sibling inside another branch), must fit the declared type
(`E_BINDING_TYPE`), and every declared input must actually be bound (`E_INPUT_UNBOUND`). The graph itself must be
acyclic (`E_CYCLE`).

## Shapes stay declared once

A node's contract is its `in`/`out`; declare the shape once in `types/` and let `aqven generate` write the
Python models. Keep outputs bounded — `maxLength`, `maxItems`, `minimum`, `maximum` on output fields are what the
engine turns into the output-limits block the model sees, and what it rejects the answer by. An unbounded text
output is `E_OUTPUT_UNBOUNDED`.

An optional field ends with `?` (`Image?`). An optional input with no binding arrives as `null` — a prompt that
mentions it needs to guard it with `{% if %}` (see [Writing Prompts](/writing-prompts/)).

## Tools

A tool is a contract plus a function: `tools/<tool>.yaml` declares `run`, `effect` (`read`, `write`, `external`),
and `in`/`out`; the function lives in `tools/functions.py`. Agents list the tools they may call — nodes never
configure tools directly.

`effect: read` tools run inside the model step. A `write` or `external` tool is a side effect: it runs as a
separate durable step and needs approval — an agent without an `approval` block for that tool gets every such
call denied at run time. The model sees a tool by its id and description, so the description is prompt text:
say what the tool does and when to call it, not how it's implemented.

## Choosing a node kind

| Job | Node kind | Why |
|---|---|---|
| Anything deterministic — normalizing text, arithmetic, validation, picking a winner among several answers | `code` | Don't ask a model to do what a function can do exactly |
| Routing on a value that already exists | `switch` | Make the branch value an enum type so exhaustiveness is checked (`E_SWITCH_NOT_EXHAUSTIVE`) |
| Independent branches that all need to run | `parallel` | Fans out to a fixed set of branches |
| The same step over a list | `map` | Fans out over however many elements the list has |
| Repeating with an accumulator until a stop condition | `loop` | See [Designing Reliable Workflows](/designing-reliable-workflows/) for `stop`/`select` policy design |
| Reusing another flow as a subgraph | `call` | How a shared subgraph gets shared, not copied |
| A model call | `llm` | Input, prompt and output are one signature — see [Writing Prompts](/writing-prompts/) |

An `llm` node should receive exactly the data its prompt renders. Binding a whole record and rendering one field
of it is fine; binding data the prompt never mentions is `E_PROMPT_INPUT_UNUSED`.
