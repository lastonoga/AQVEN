# How to write a custom evaluator

When a built-in check can't express what you need, write your own evaluator. This page shows the one function signature every check shares and a worked example from the showcase project.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
- [Example](#example)
- [See also](#see-also)

## When you need this

Built-in policies has eleven ready-made evaluators, among them
`not_empty`, `max_words`, `regex`, `expected` and `cost_usd`. Reach for one of them first when the check
is generic. Write your own when a check needs domain logic no generic evaluator can express: not "is the
text non-empty" but "does this reply promise something the resolution doesn't actually grant." That's
business logic specific to your project, and it belongs in a function you write, not in a parameter of a
built-in.

The same evaluator reference works in two places. An inference's `checks:` in
`<inference>.inference.yaml` runs it on every call and retries the model when it fails. An experiment's
`checks:` in `experiments/<experiment_id>/experiment.yaml` scores it on every attempt of a series.

## Steps

- In the `checks:` list, swap `use: "<built-in name>"` for `run: "<module>:<function>"`. This is the
  same `module:function` reference shape a `code` or `tool` node's `run` already uses. Drop `with:`
  unless your function's own `params` type declares fields for it.
- Write the function with this exact shape. Every built-in evaluator already has it, generated straight
  from the code at Built-in policies, so yours has to match it too:

  ```python
  def your_check(value: O, context: EvalContext[I, O], params: P) -> Verdict: ...
  ```

  `value` is the output being checked. `context: EvalContext[I, O]` carries the rest: `inputs`,
  `expected_output`, `metadata`, `attempt`, `cost_usd` and `latency_ms`. `params: P` is your own
  `BaseModel` for the `with:` values the check needs, or the built-in `NoParams` when it needs none. All
  three come from `aqven.policies`.
- **What `value` and `context` hold depends on where the check runs.** On an inference, `value` is the
  inference's `out` record and `context.inputs` its `in` record. In an experiment, `value` is the output
  of the experiment's subject and `context.inputs` is the flow input. For a range of nodes (`from`/`to`),
  that means the `out` of the `to` node, and the flow input may be partial. The outputs of the other
  top-level nodes are in `context.metadata["node_outputs"]`, and `context.expected_output` is the case's
  `expected_output`. `aqven check` compares your function's type hints with the subject's types and warns
  with `W_CHECK_CONTEXT_MISMATCH` when they don't fit.
- Return a `Verdict`: `passed: bool`, plus optionally `score: float | None` and `reason: str | None`
  naming what failed. A binary check only needs `passed`. A continuous or ordinal check must return a
  `score`: an evaluator that returns none makes that attempt's check an error, not a failure.
- Set `kind: "binary"`, `kind: "continuous"` or `kind: "ordinal"` on the check entry to match what your
  function actually returns. This is a declaration next to `run:`, not something inferred from the
  function. An experiment check also needs an `id`: the question refers to the check by it.
- **Raising an exception is a bug, not a verdict.** A series closes such an attempt as an
  infrastructure error, and more than 5% of those make the whole series `invalid`. So a broken evaluator
  never makes a model look bad.

## Example

The showcase project checks one rule at two levels: a reply must not promise a refund, a replacement or
an amount that the decision doesn't give. Create the project yourself with:

```bash
aqven new my_project --template showcase
```

On the `revise` inference the check is `promises_match_resolution`. There, `value` is the inference's own
`ReviseOut` and the decision is in its input:

```python
def promises_match_resolution(
    value: ReviseOut, context: EvalContext[ReviseIn, ReviseOut], params: NoParams
) -> Verdict:
    text = value.reply.text.lower()
    resolution = context.inputs.resolution
    return _verdict(rule(text, resolution) for rule in PROMISE_RULES)
```

The experiment `reply_overpromise_risk` runs only the `polish` range of `support_case`, so its subject's
input is the flow's `CaseRequest`, which has no `resolution`. Its check reads the decision from the
`route` node's output instead, supplied by the case:

```yaml
checks:
- id: "promises"
  kind: "binary"
  run: "@root.code.support_case:reply_keeps_resolution"
question:
  kind: "threshold"
  metric: "promises"
  above: 0.97
  margin: 0.01
```

```python
def reply_keeps_resolution(
    value: BaseModel, context: EvalContext[BaseModel, BaseModel], params: NoParams
) -> Verdict:
    text = PolishedReply.model_validate(value.model_dump(mode="json")).reply.text.lower()
    resolution = CaseDecision.model_validate(context.metadata.get(NODE_OUTPUTS)).route.resolution
    return _verdict(rule(text, resolution) for rule in PROMISE_RULES)


def _verdict(reasons: Iterable[str | None]) -> Verdict:
    reason = next((item for item in reasons if item is not None), None)
    return Verdict(passed=reason is None, reason=reason)
```

`PROMISE_RULES` is a small list of project-specific checks (`_forbidden_promise`, `_foreign_amount` and
others in the same file). Each returns a reason string when it finds a promise the resolution doesn't
back, or `None` when the reply is clean. `_verdict` picks the first reason, or reports a pass. A series of
`reply_overpromise_risk` turns the pass rate of this check into an interval and compares it with 0.97
plus the 0.01 margin.

## See also

- Built-in policies and evaluators: the eleven evaluators that ship
  with AQVEN, and the signature every custom one shares.
- [How to write an experiment](experiments.md): the other kinds of checks, and the question a
  check's metric answers.
- How to run experiments and series as an agent: where an
  experiment's checks are scored, attempt by attempt.
- How to follow and read a series in Studio: the matrix where a check's pass rate
  shows up with its interval.
- How to give an agent a tool: the same `module:function` reference shape, and
  where `ctx.blobs` lives if a check needs to inspect media instead of text.
- How to write a step in Python: the node kind a custom evaluator's own logic
  most resembles, a typed synchronous function.
