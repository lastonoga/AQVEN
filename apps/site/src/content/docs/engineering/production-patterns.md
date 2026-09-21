---
title: Production Patterns
description: Connect common LLM failures to workflow controls and measurable tradeoffs.
---

This guide maps production problems to AQVEN design choices. It preserves the problem → pattern → tradeoff structure of the engineering research notes while avoiding a static list of model releases. Model capabilities, prices, and provider behavior change; use the [generated provider catalog](/engineering/reference/provider-catalog/) and a live check for the installed package and chosen account.

## Problems, patterns, and tradeoffs

| Problem | Pattern in AQVEN | Cost or limitation |
| --- | --- | --- |
| Invented facts or IDs | Ground answers in retrieved sources; use a dynamic allowed set for selected IDs; validate citations | Retrieval adds latency and can surface irrelevant evidence. A valid ID can still be the wrong ID. |
| Invalid structured output | Typed inference output, agent output mode, Pydantic validation, bounded retry | Strict formatting can still produce incorrect values and retries add calls. |
| Repeated judge bias | Calibrate against human labels; compare answer order both ways for pairwise review | More judges and reversals cost time and money. |
| Lost or diluted context | Bind only needed fields; retrieve focused material; preview prompts | Compression can omit a crucial fact; test sufficiency on cases. |
| Prompt injection in documents or web results | Treat external text as untrusted data; keep tool effects and approvals outside that text | Isolation and review add workflow steps. |
| Model behavior changes | Record model route and prompt revision; keep regression datasets and baseline eval runs | Pinning a model ID cannot prevent input distribution changes. |
| Errors cascade across steps | Validate after a risky step; retry or route the failing subtask | More checks increase latency; a check only catches the property it measures. |
| Loop never converges | Set hard iteration and request budgets plus threshold or stagnation stop | A strict cap may stop a useful attempt. |
| Parallel candidates are expensive | Start with one candidate; add fan-out only when selection has evidence | N candidates can approach N times the model cost. |
| Sensitive data reaches the wrong route | Declare provider data policy, minimize/redact inputs, require approval for effects | Redaction can remove useful context; assess the actual provider agreement. |
| Temperature zero still changes output | Use assertions and regression tests rather than byte-for-byte assumptions | Exact reproducibility may require infrastructure control. |
| Scorer can be gamed | Keep held-out cases, review failures, and separate release gates from optimization | A metric remains a proxy for product quality. |

The detailed workflow choices are in [Design a workflow](/engineering/designing-workflows/). [Safety and reliability](/engineering/safety-and-reliability/) covers trust and effects; [Datasets](/engineering/datasets/) shows how to encode a failing case.

## The five common orchestration shapes

1. **Prompt chaining:** sequential `llm` or `code` nodes when each stage consumes the last stage's output. Add an intermediate check where it can catch a known failure.
2. **Routing:** a classifier or code rule feeds a `switch`, sending distinct classes to distinct nodes or called flows. Measure both label accuracy and the final route outcome.
3. **Parallelization:** independent branches run together, then a `join` policy handles success and failure. Use sectioning for different work, voting for independent attempts.
4. **Orchestrator and workers:** the input determines what work is needed. Use bounded `map` or agent tool work, with explicit budgets. Prefer a fixed topology when the paths are known at design time.
5. **Evaluator and optimizer:** a generator produces an answer, a check or judge gives actionable feedback, and a bounded `loop` revises it. Confirm on cases that the extra round improves quality.

These shapes follow [Anthropic's workflow taxonomy](https://www.anthropic.com/engineering/building-effective-agents). AQVEN adds typed bindings, declared effects, checks, durable runs, and datasets around them. Pydantic AI handles model interaction; DBOS provides durable execution for workflow runs. [Architecture](/engineering/architecture/) explains the ownership of each layer.

## Choose a model by task, then verify the route

The useful question is “Which model and route satisfy this task's quality, cost, latency, data, and output requirements on our cases?” Family reputation is a starting hypothesis, not a configuration guarantee.

| Role | Minimum capability to test | Useful evaluation |
| --- | --- | --- |
| Extractor | Source reading and typed output | Field accuracy; unsupported-value rate |
| Classifier/router | Stable closed labels at the target latency | Per-class error and downstream route success |
| Generator | Task quality, context use, and output validation | Human rubric, factual support, cost |
| Judge | Agreement on borderline cases and low bias | Human agreement; order reversal where pairwise |
| Tool agent | Tool calling, error handling, permission boundary | Correct tool choice, side effects, recovery |
| Aggregator | Exact selection or merge when possible | Deterministic code first; model only if semantic merge is needed |

The installed catalog includes OpenAI, Anthropic, Google, OpenRouter, Together, several other hosted routes, and local or self-hosted routes. Some require optional extras. Use [Providers](/engineering/providers/) for three complete configurations and a custom Pydantic AI model factory. Do not assume that an aggregator preserves the same schema or tool guarantees across all inference endpoints for a model ID; verify the actual route with `models check --live` and a representative schema.

## Structured output: syntax versus truth

JSON syntax, schema adherence, and field correctness are different outcomes. A strict output mode can prevent invalid syntax while still allowing a fabricated value. After parsing, AQVEN validates output through its type contract; add scorers for the values that matter. [Design structured output](/engineering/schema-design/) covers field order, nullable values, unions, limits, and the tests to run.

For self-hosted models, structured decoding depends on the serving engine as well as the model. Engines such as vLLM or SGLang can expose OpenAI-compatible endpoints with different grammar backends and supported JSON Schema subsets. Declare the endpoint as `openai_compatible`, check streaming and output behavior, then run the same cases used for a hosted candidate. Benchmark schema compilation delay and throughput if your workload uses many distinct schemas; these costs are deployment-specific.

## Evaluate a model or provider change

1. Keep the task's input/output types and dataset fixed.
2. Record the existing model ID, provider route, output mode, prompt revision, and baseline eval run.
3. Check the candidate's credentials, capabilities, data policy, and output mode.
4. Run the same cases and inspect invalid outputs, field accuracy, per-case regressions, cost, and latency.
5. Test the fallback route and any tool or media case separately.
6. Keep the candidate only if the change meets the product's acceptance criteria.

```bash
uv run {{CLI_COMMAND}} models check --project .
uv run {{CLI_COMMAND}} models check --project . --live
uv run {{CLI_COMMAND}} eval . --eval answer_quality --baseline <eval-run-id>
```

The baseline gate is meaningful only when the evaluation has a defined `gate` and enough cases for its criteria. [Testing and evaluation](/engineering/testing-and-evaluation/) explains the comparison. Pin a provider/model revision where available, but keep regression cases because a fixed ID does not control all upstream changes.

## Where the evidence is still task-dependent

- Self-critique without independent feedback can fail to improve reasoning. Use a verifier, grounded rubric, or human examples, and test whether revision actually helps.
- Strict decoding improves structural compliance but may alter reasoning quality. Measure both compliance and answer accuracy on the same cases.
- Panels and best-of-N can reduce some individual mistakes but may share biases. Their useful size and value depend on error correlation and selection quality.
- Long advertised context windows do not guarantee reliable use of every token. Measure answer quality as inputs grow and reduce irrelevant context.
- Savings reported for cascades, routing, or self-hosted serving are workload-specific. Use your own request distribution, not a benchmark headline, to set budgets.

Keep dated, task-specific observations in [Field notes](/engineering/field-notes/) so an AI coding agent can see which claim is measured locally and which remains a hypothesis.
