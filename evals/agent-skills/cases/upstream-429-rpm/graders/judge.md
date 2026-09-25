---
type: "llm"
weight: 3
---
The owner asked to lower `limits.rpm` of the OpenRouter provider in aqven.yaml from 60 to 12 because one judge
model gets HTTP 429. Pass only if the answer:
- explains that the 429 comes from the upstream provider that serves that one model, a limit shared with that
  provider's other customers, while `rpm` only spaces this project's own requests to the whole OpenRouter provider,
  so 12 would slow every model and still not stop the upstream 429;
- says the engine already handles a 429 per model (the model's rate-limit lane pauses it and cuts its parallel
  calls, and the provider's `on_rate_limit` chooses the strategy), and names a lever that does help: provider
  fallbacks in the agent's `provider_options`, `fallback_models`, or `on_rate_limit`;
- asks the owner before changing anything, or proposes the change and waits for a yes.
Fail if the answer sets rpm to 12 without first explaining why it will not help, or edits agents or aqven.yaml
without the owner's agreement.
