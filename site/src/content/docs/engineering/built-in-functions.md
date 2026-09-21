---
title: Built-in Functions
description: Use named join, loop, map, and evaluation policies without Python code.
---

AQVEN has built-in policies for control flow and evaluation. Write `use: <name>` in the relevant policy slot. Write `run: <python-reference>` only when you need a custom implementation. A name is valid only in its own slot: `best` is a loop selector, not a join policy.

## Join branches of a parallel node

| `join.use` | Effect | `with` fields |
| --- | --- | --- |
| `all` | Wait for all branches. | None |
| `any` | Finish when any branch reaches the join decision. | None |
| `first_success` | Take the first successful branch. | None |
| `quorum` | Require a minimum number of successful branches. | `min_ok` (required), `on_error` (`fail` by default, or `skip`) |

```yaml
join:
  use: "quorum"
  with:
    min_ok: 2
    on_error: "skip"
```

If a task needs every branch's result, use `all`. If it can proceed after one valid result, consider `first_success`. A quorum expresses an explicit reliability requirement; if you change `min_ok` from two to three, a two-success result stops qualifying. See [Parallel and map](/engineering/parallel-and-map/) for full node examples.

## Stop and select in a loop

`stop` is a list of stopping rules. `select` picks the iteration returned by the loop.

| Slot and name | Effect | `with` fields |
| --- | --- | --- |
| `stop: threshold` | Stop when a numeric path reaches a bound. | `path`; `gte` or `lte` |
| `stop: stagnation` | Stop when improvement over recent iterations is too small. | `path`, `window` (1–5), `min_delta` |
| `select: last` | Return the last iteration. | None |
| `select: best` | Return the iteration with the best value at a path. | `path` |

```yaml
stop:
  - use: "threshold"
    with:
      path: "$iteration.out.score"
      gte: 0.9
  - use: "stagnation"
    with:
      path: "$iteration.out.score"
      window: 3
      min_delta: 0.01
select:
  use: "best"
  with:
    path: "$iteration.out.score"
```

The paths must exist in your iteration output. A threshold stops when quality is high enough; stagnation prevents paying for repeated calls without material improvement. `last` is appropriate if later iterations always supersede earlier ones; `best` preserves a better earlier result. Also set an iteration or request limit so the loop has a hard bound. See [Loops](/engineering/loops/) for the surrounding node.

## Handle one failed map item

| `on_item_error.use` | Effect | `with` fields |
| --- | --- | --- |
| `fail` | Fail the map when an item fails. | None |
| `skip` | Omit the failed item. | None |
| `default` | Put a replacement value in its place. | `value` (required) |

```yaml
on_item_error:
  use: "default"
  with:
    value:
      status: "unavailable"
```

Choose `skip` only if a shorter output list is acceptable. Choose `default` only if downstream fields can accept the replacement shape. A failure policy changes observable output and should have a dataset case that exercises it.

## Evaluate an output

The same `use` form works in inference checks and evaluation scorers. Each evaluator reads an output field or run context path.

| `use` name | What it checks | Required `with` fields |
| --- | --- | --- |
| `not_empty` | A field has content. | `field` |
| `max_words` | Word count stays within a limit. | `field`, `max` |
| `language` | A field matches a locale. | `field`, `locale` |
| `no_pii` | Selected fields contain no configured PII patterns. | `fields`; optional `detectors` |
| `regex` | A field matches a regular expression. | `field`, `pattern` |
| `unique_items` | Items are unique by a key. | `field`, `key` |
| `ids_in_allowed_set` | IDs belong to an allowed set. | `field`, `allowed` |
| `citations_in_sources` | Citations correspond to supplied sources. | `citations`, `sources`, `id`, `quote`, `text` |
| `cost_usd` | Records cost as a metric. | None |
| `latency_ms` | Records latency as a metric. | None |

For example, inside an `Eval` file's `scorers`:

```yaml
scorers:
  - id: "length"
    kind: "binary"
    use: "max_words"
    with:
      field: "$out.answer"
      max: 120
  - id: "cost"
    kind: "continuous"
    use: "cost_usd"
```

These checks measure specific properties; they do not establish that an answer is factually correct. Pair them with representative [datasets](/engineering/datasets/) and, where needed, custom or judge scorers. The [generated built-in reference](/engineering/reference/built-in-policies/) lists exact Python signatures, parameter types, constraints, and JSON Schemas. Run `{{CLI_COMMAND}} check .` to validate the chosen name and parameters in a complete project.
