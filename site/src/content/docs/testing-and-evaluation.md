---
title: Testing & Evaluation
description: aqven check, cassettes, scenario tests, evals and gates.
---

## The loop

```
edit a file  ->  aqven check  ->  aqven prompt preview <flow>.<node>  ->  pytest
```

`aqven check` is the gate: it checks every file statically — references, types, prompts, code signatures,
provider extras, output modes — then simulates the whole flow with generated values and simulated model answers,
with no network and no tokens spent. A flow `aqven check` accepts wires up and renders correctly; what it can't
tell you is whether a model answers *well*. That's what scenario tests and evals are for.

## Reading `aqven check`

A diagnostic is a code, a file path, a message, and usually a hint that names the fix.

| Code prefix | Meaning |
|---|---|
| `E_` | Error — the project isn't runnable, exit code 1 |
| `W_` | Warning — it runs, but something's unclear and will surprise someone |
| `E_SIM_*` | The simulated run failed; the hint carries the simulated input that triggered it |
| `W_SIM_NODE_UNREACHED` | No simulated input reaches this node — usually a condition that can never be true |

Use `aqven check --static` for the fast loop while editing, and the full `aqven check` before you finish. In a
generated project both are already wired into Claude Code hooks: static after every file edit, full check on
stop.

## Scenario tests

A scenario test runs one path through a flow offline and asserts the outcome. The bundled pytest plugin ships
the fixtures: `aqven_project`, `aqven_engine`, `cassette_config`, and `scripted_human` for human steps.

```python
from aqven.testing import node_output, offline_options


def test_refund_path(aqven_project, aqven_engine, cassette_config):
    flow = aqven_project.flow_typed("support_case", CaseRequest, CaseOutcome)
    options = offline_options(
        cassettes=cassette_config,
        outputs=[node_output("classify", {"category": "refund", "rationale": "asks for money back"})],
    )
    result = asyncio.run(flow.run(CaseRequest(text="the parcel never arrived"), options))
    assert result.status == "completed", result.error
    assert result.output.decision == "refund"
```

- **Force the branch, don't hope for it.** `node_output(node_id, output)` replaces one node's output;
  `node_failure(node_id, message)` forces its failure path; `branch_key`, `iteration` and `item_index` address
  one branch of a `parallel`, one pass of a `loop`, or one element of a `map`. A test that depends on a model
  choosing a category is a test that fails on a bad day, for reasons that have nothing to do with your change.
- **One scenario, one question.** Name the test after the path it pins
  (`test_denied_approval_keeps_the_case_open`), and assert the decision and the shape — not the wording of a
  generated sentence.
- **Cassettes prove the model contract, nothing else.** Record a live run (`AQVEN_LIVE=1`) for the one scenario
  that needs to show real model behavior, replay it everywhere else. A recorded answer is data, not control
  flow — if the branch matters, force it with an override too.
- **Offline means offline.** `ALLOW_MODEL_REQUESTS=False` plus `FunctionModel` or a cassette; no provider key
  needed, and a test that tries to reach the network fails loudly.
- **Assert the failure paths too.** A timeout, a denied approval, a rejected output — these are the paths a live
  run never shows you.

## Before calling a flow done

- [ ] `aqven check` has no errors, and every remaining warning is one you decided to keep.
- [ ] `aqven prompt preview` of every `llm` node you touched shows real data in every placeholder and the output
      mode you expect.
- [ ] Every output field has a bound; the prompt doesn't repeat the schema in prose.
- [ ] `aqven models check` agrees the chosen model supports the chosen output mode.
- [ ] A scenario test pins each branch that matters, with node output overrides rather than model luck.
- [ ] The failure paths — rejected output, denied approval, timeout — have a test.
