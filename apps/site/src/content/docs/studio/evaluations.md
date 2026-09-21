---
title: Evaluations
description: Inspect scorer results, case details, and gate decisions.
---

The **Evals** view lists evaluation definitions for the selected flow and their recorded runs. Choose an evaluation to see the source dataset, scorer results, case outcomes, cost, dropped cases, and any gate decision.

![An evaluation definition with its target, dataset, scorers, and policy.](/images/studio/evaluations.png)

## Read an evaluation result

1. Confirm the dataset and model/agent context used for the recorded run.
2. Read the aggregate score, then open the individual failed or dropped cases.
3. Compare scorer families rather than treating one average as the whole result. A quality score can be acceptable while a safety or cost score fails.
4. If a gate ran, read its baseline, repeats, sample sufficiency, and decision before interpreting a pass as a release approval.

An evaluation can combine a model judge with deterministic checks and cost measures. Read per-case failures before trusting an overall score: one poor class of cases can hide behind a good average. Use the case identity to return to its dataset source and add a regression case when the failure represents an unwanted behavior.

Today, start an evaluation from the CLI, then inspect it in Studio:

```bash
uv run {{CLI_COMMAND}} eval . --eval answer_quality
```

Replace `answer_quality` with an evaluation ID defined in your project. This can make real provider calls. A baseline comparison requires a recorded baseline run. [Engineering evaluation](/engineering/testing-and-evaluation/) explains the code-side definition and check loop.
