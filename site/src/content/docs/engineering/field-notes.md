---
title: Field Notes for Models and Content
description: Record practical findings without turning them into framework rules.
---

Model behavior changes. Keep short, dated field notes for tasks such as extraction from invoices, image triage, reply drafting, or evaluation by a judge model. A note should make an experiment repeatable:

```markdown
# Invoice extraction with <model> — YYYY-MM-DD

## Task
Extract order ID, amount, and currency from customer invoices.

## Setup
Model and provider, prompt revision, output type, dataset revision.

## Observation
What improved, what failed, and two representative case IDs.

## Decision
Adopt, keep testing, or reject. Link to the eval run.
```

Put durable rules in the [workflow design guide](/engineering/designing-workflows/). Put provider-specific observations in notes with the model version and date. Review a note after changing a model, prompt, type, or dataset. This keeps tips useful to both engineers and AI coding agents without presenting a one-off result as a guarantee.
