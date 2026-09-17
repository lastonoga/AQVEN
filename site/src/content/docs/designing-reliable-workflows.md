---
title: Designing Reliable Workflows
description: Decomposition heuristics, divergence and self-consistency, critic-loop rules, compounding error, gates.
---

A flow is a graph of decisions about where a single model call isn't enough. This page is the judgment behind
those decisions — when to split a step in two, when to run several attempts in parallel, when a critic loop earns
its cost, and when to stop adding nodes and add error recovery instead.

## Start with one call

The default shape is a single LLM node with good context and a clear schema. Split it only when you hit a concrete
reason to: the step needs a different *kind* of judgment partway through, the cost of a wrong answer justifies a
checkpoint, there's a deterministically checkable artifact you can gate on, or one part of the job is cheap and
narrow while another is expensive and open-ended. "It might need this later" is not a reason — added nodes are
added chances to fail, not just added capability.

## Compounding error is a budget, not a detail

Every LLM node's accuracy multiplies with every other node downstream of it: five nodes at 95% each compound to
roughly 77% end to end; ten nodes at 95% drop to roughly 59%. Past about five to seven LLM nodes without a gate
between them, the fix is not "add more nodes carefully" — it's adding error recovery: a `try` around the risky
step, a retry at the subtask level, or a `gate` that stops a bad intermediate result from ever reaching node six.
Lumen's `support_case` flow has around fifteen top-level nodes precisely because several of them are `code` steps
and gates, not LLM calls — the LLM-node count on any single path through the graph stays well inside the budget.

## Divergence: when running N attempts actually helps

Running the same step multiple times and combining the results (`map` + an aggregator, or `parallel` + a vote)
only pays off when the errors between attempts are independent. If the task has one correct, checkable answer and
variance comes from temperature or sampling, divergence works — that's exactly what Lumen's `vote` (`map` over
perspectives) feeding `tally` does for intent classification. If the answer is open-ended, or the variance comes
from the prompt or context rather than the sampling, running it three more times just produces three more similar
mistakes for the price of three more calls.

Diverse *prompts or models* separate attempts far better than temperature alone on the same prompt and model — a
homogeneous ensemble is a more expensive single attempt in disguise. `judge_panel.judges` runs `deepseek`, `qwen`
and `llama` — three different model families — in parallel for exactly this reason, not three temperature-varied
calls to one model.

## Critic loops: only with an external signal

A model reviewing its own output, in its own context, with no outside signal, is not a reliable way to catch
errors — self-review without an external check has a well-documented tendency to leave correct answers alone at
best and talk the model out of correct answers at worst. A critic loop earns its cost only when there's something
outside the generator to check against: a schema, a test, a retrieval-grounded fact, or — as in Lumen's `polish`
loop — a critic that is a genuinely different model than the generator it's reviewing.

```yaml
node: "loop"
body:
  - "revise"
  - "critique"
max_iter: 3
stop:
  - use: "threshold"
    with:
      path: "$iter.critique.out.score"
      gte: 0.85
  - use: "stagnation"
    with:
      path: "$iter.critique.out.score"
      window: 1
      min_delta: 0.02
select:
  use: "best"
  with:
    path: "$iter.critique.out.score"
```

`revise` runs on `gpt`; `critique` runs on `mistral` — a different family, so the critique isn't the generator
grading its own homework. Two `stop` policies bound the loop from two directions: `threshold` ends it as soon as
the score is good enough, `stagnation` ends it when another iteration stopped helping, so the loop doesn't grind on
past the point of diminishing returns. `select: best` means even if the loop runs out its `max_iter` without
crossing the threshold, the best iteration seen wins rather than whatever happened to run last. Most of a critic
loop's benefit shows up in its first one or two iterations — `max_iter: 3` is a sensible default ceiling, not a
number to raise reflexively when quality still isn't good enough (that's usually a sign the prompt or the model
needs to change, not that the loop needs another round).

## Gates between steps

Anywhere a step produces something checkable — a schema, a range, a reference that must resolve — check it in code
immediately after the step, before the result feeds the next node. `aqven check`'s simulated run does this for an
entire flow before any real model is ever called: it generates values from the schemas, runs every node with
simulated answers, and reports `E_SIM_NODE_FAILED`, `E_SIM_OUTPUT_INVALID` and `W_SIM_NODE_UNREACHED` for anything
that doesn't hold together. Catching a broken contract there costs nothing; catching it three nodes downstream
after a real model call costs tokens, latency, and a harder-to-read failure.

## What not to do

| Pattern | Symptom | Instead |
|---|---|---|
| One node doing everything | Silent partial failure, no single piece is testable | Split where the kind of judgment changes |
| More than 5-7 LLM nodes with no gate between them | Errors compound invisibly until the output is unusable | Add gates and per-step retry, not more nodes |
| Divergence on an open-ended or prompt-sensitive task | N calls, N similar mistakes, no accuracy gain | Fix the prompt/context, or diverge on model/prompt instead of temperature |
| A critic loop with no external signal, same model as the generator | Loop can degrade a correct answer as easily as fix a wrong one | Use a different model as critic, or add a real verifier |
| A loop with only `max_iter`, no `stop` condition | Runs to the cap even after it stopped helping | Add `threshold`/`stagnation` stop policies |
| No gate after a step with a checkable output | Bad data flows downstream before anyone notices | `aqven check`'s simulated run, or an explicit `gate` node |
