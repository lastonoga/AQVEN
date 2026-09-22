---
title: How to write a custom evaluator
description: When a built-in scorer can't express the check you need, write your own — the exact function signature every scorer shares, verified against the real Evaluator protocol, with a real worked example.
---

## When you need this

[Built-in policies](/reference/built-in-policies/) covers ten ready-made scorers — `not_empty`,
`max_words`, `regex`, `cost_usd`, and the rest — and they're the right first reach for a generic check.
Use this once a case needs domain logic no generic scorer can express: not "is the text non-empty" but
"does this reply promise something the resolution doesn't actually grant." That's business logic
specific to your project, and it belongs in a function you write, not a parameter on a built-in one.

## Steps

- In the eval's `scorers:` list, swap `use: "<built-in name>"` for `run: "<module>:<function>"` — the
  same `module:function` reference shape a `code` or `tool` node's `run` already uses. Drop `with:`
  unless your function's own `params` type declares fields for it.
- Write the function with this exact shape — every built-in scorer already has it, generated straight
  from the code at [Built-in policies](/reference/built-in-policies/), so yours has to match it too:

  ```python
  def your_scorer(value: O, context: EvalContext[I, O], params: P) -> Verdict: ...
  ```

  `value` is the actual output being scored — the `out` record of the inference the eval targets.
  `context: EvalContext[I, O]` carries the rest of the case: `inputs` (the case's input, typed `I`),
  `expected_output`, `metadata`, `attempt`, `cost_usd`, `latency_ms`. `params: P` is your own
  `BaseModel` for whatever `with:` values the scorer needs, or the built-in `NoParams` when it needs
  none. All three come from `aqven.policies`.
- Return a `Verdict`: `passed: bool`, and optionally `score: float | None` for a continuous scorer or
  `reason: str | None` naming what failed. A binary scorer only needs `passed`; the eval's `kind:
  "continuous"` scorers are the ones that read `score`.
- Set `kind: "binary"` or `kind: "continuous"` on the scorer entry in the eval YAML to match what your
  function actually populates — this is a declaration next to `run:`, not something inferred from the
  function.

## Example

This is the showcase's `promises` scorer, one of four on `reply_quality`'s eval. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its declaration in `evals/support_case/reply_quality.yaml`:

```yaml
scorers:
- id: "promises"
  kind: "binary"
  run: "@root.code.support_case:promises_match_resolution"
```

The function itself, in `code/support_case.py`:

```python
def promises_match_resolution(
    value: ReviseOut, context: EvalContext[ReviseIn, ReviseOut], params: NoParams
) -> Verdict:
    text = value.reply.text.lower()
    resolution = context.inputs.resolution
    return _verdict(rule(text, resolution) for rule in PROMISE_RULES)


def _verdict(reasons: Iterable[str | None]) -> Verdict:
    reason = next((item for item in reasons if item is not None), None)
    return Verdict(passed=reason is None, reason=reason)
```

`value` is the `revise` inference's real output — the drafted reply. `context.inputs.resolution` is the
case's input record, the decision the support team actually made. `PROMISE_RULES` is a small list of
project-specific checks (`_forbidden_promise`, `_foreign_amount`, and others in the same file), each
returning a reason string when it finds a promise the resolution doesn't back, or `None` when it's
clean — `_verdict` picks the first real reason, or reports a pass with none. Nothing here is a
generic text check; a reply that promises a refund the resolution never granted is wrong in a way only
this project's own rules can name.

## See also

- [Built-in policies and evaluators](/reference/built-in-policies/) — the ten scorers that ship with
  AQVEN, and every custom scorer's real signature, generated from the same `Evaluator` protocol this
  page describes.
- [How to read an eval and its gate](/studio/evals/) — where a custom scorer's result actually shows up
  once the eval runs.
- [How to give an agent a tool](/engine/tool-node/) — the same `module:function` reference shape, and
  where `ctx.blobs` lives if a scorer needs to inspect media instead of text.
- [How to write a step in Python](/engine/code-node/) — the node kind a custom scorer's own logic most
  resembles: synchronous, no context object, just a typed function.
- [The engineering loop](/concepts/engineering-loop/) — what a scorer is actually for, in the Test step.
