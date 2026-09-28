---
name: choosing-models
description: "Picks models for AQVEN agents from provider data and probes: endpoints, provider_options, rate limits, fallbacks. Use first when an agent costs too much or needs a cheaper or fallback model, before editing agents/ or providers, on 429 or MODEL_FEATURE_UNSUPPORTED."
---

## MUST

- The owner picks models, providers and the panel ("Owner's rules" in `AGENTS.md`). Change that set, or one
  setting across many agents, only after the owner says yes.
- When a check contradicts what runs showed, report it to the owner as a likely engine bug, with numbers (runs
  that passed, the code the check gave). Never swap models to satisfy the check.
- An agent file has no key for what a model can do: the catalogue suggests, the real node proves. A new model
  gets `models check --live`, then one call on the real node with its output type and the input kind it will
  read (image, audio, video, PDF, long text). `--live` sends one small text request per output mode: it proves
  the mode, not the media, the length or the schema.
- Set reasoning on purpose in every agent file when you write it: off or the lowest effort for reading,
  extraction and classification where the model allows it, the lowest effort where reasoning is mandatory.
- Facts in an agent's `description` name their source: a probe, a series id, or "from another project,
  unverified here".
- An upstream 429 is not fixed with `limits.rpm`: the model's rate-limit lane and the provider's `on_rate_limit`
  handle it.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Read "Owner's rules": providers, price ceiling, what is banned, any judge panel | the frame is known |
| 2 | Candidates from the provider's catalogue, not by name: the input kinds the flow sends, price, reasoning, structured output, `tools` when the agent calls tools, across families. OpenRouter: `curl -s 'https://openrouter.ai/api/v1/models?input_modalities=<kind>&supported_parameters=structured_outputs'`, fields `architecture.input_modalities` (`text`, `image`, `file`, `audio`, `video`), `context_length`, `pricing`, `supported_parameters` (`structured_outputs`, `response_format`, `tools`, `reasoning`), `reasoning` (`mandatory`, `supported_efforts`, `default_enabled`). Many candidates: screen, then confirm (`designing-experiments`) | a table of 5 or more candidates from 3 or more families, with prices and reasoning |
| 3 | Endpoints of a candidate: `curl -s https://openrouter.ai/api/v1/models/<author>/<slug>/endpoints`, fields `tag` (the slug `provider.order` takes), `provider_name`, `quantization`, `max_completion_tokens`, `supported_parameters`, `supports_tool_choice`, `status`, `uptime_last_30m`. A candidate with one endpoint has nowhere to send a 429: flag it | a provider order chosen; single-provider candidates flagged |
| 4 | The agent file: `model`; `description` with the source of every claim; `settings.provider_options` (merged into the request body; for OpenRouter `provider` with `order`, `allow_fallbacks`, `require_parameters: true`, `quantizations`, and `reasoning` per model: `effort` down to `"none"` or `"minimal"`, or `enabled: false`; a model whose catalogue `reasoning.mandatory` is true takes the lowest of its `supported_efforts`); `settings.max_tokens` above the expected output plus any reasoning; `output.mode` from `models check`; `output.on_error`, `output.on_refusal`, `output.on_truncated`. A pinned `provider.order` with `allow_fallbacks: false` leaves an upstream 429 nowhere to go: allow provider fallbacks or set `fallback_models` | `aqven_check` clean |
| 5 | The provider in `aqven.yaml`: `on_rate_limit` `auto` (default: the model pauses for `retry-after`, else 2 s doubling to 60 s, parallel calls halve and grow back, a call gives up after 10 attempts or 120 s), `fixed` with `retry_wait_seconds` and `retry_attempts`, or `fail` to hand over to `fallback_models` at once; `limits.concurrency` is the starting parallelism per model (8 when unset), `limits.rpm` only the provider's own limit | the strategy fits the latency contract |
| 6 | `fallback_models` that read the same input kinds, inside "Owner's rules"; `E_OUTPUT_MODE_UNSUPPORTED` checks the output modes of every model of the agent | the fallback stays inside the frame |
| 7 | Does the model take the input kind and its size (image, PDF, audio, video, a long document against `context_length`): the engine keeps no table. Read the catalogue, then one run on a real case of that kind and size; a provider refusal comes back as `MODEL_FEATURE_UNSUPPORTED` naming the attachment | every input kind proven by a run |
| 8 | Prove it on the real node: `uv run aqven models check <agent> --project <package> --live` (the modes); `uv run aqven models shapes <agent> --project <package> --live` for a nested output; then `run_start` live on a real case through each agent's node, or a one-case smoke when an experiment compares agents (`running-series`). Read latency, `tokens_out` and error codes; a model three times slower than the rest goes to the owner before he finds it | every agent `ok`, the real-node run finished, latency within the contract, outliers reported |
| 9 | Compare models on the project's labelled data with a negative control, as an `agent` factor (`designing-experiments`); synthetic data is only a sanity check | the model decision rests on real labels |
| 10 | One change at a time. A setting rolled out to many models (reasoning, `max_tokens`, routing) waits for the owner's yes, then each model is measured before and after on the same few cases; one case of latency is noise | a before-and-after table per model |

The CLI probes read keys from the environment and `<package>/.env`. Keys saved in Studio settings are visible only
to the project server: when your shell has no key, do not search for it; ask the owner to run the probe.

```yaml
description: "Sorts support tickets into queues; prompted mode and PDF input proven by run <run_id>"
settings:
  max_tokens: 4000
  provider_options:
    provider:
      order:
      - "google-vertex"
      - "google-ai-studio"
      allow_fallbacks: true
      require_parameters: true
    reasoning:
      enabled: false
output:
  mode: "prompted"
  on_refusal: "retry"
```

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| A weaker model picked because its profile was unknown | the catalogue suggests, the real node decides |
| Reasoning and `output.mode: tool` set without a live probe: every attempt `MODEL_FEATURE_UNSUPPORTED` | `models check --live` first |
| The profile said `tool` works, live it gave `MODEL_NO_STRUCTURED_OUTPUT`; a big series ran without `--live` | probe live before a series |
| Every model passed `models check --live`, then the real node failed in four ways: the schema too large, no endpoint for the request's parameters, `tool_choice` unsupported, no structured output | one call on the real node, with its output type and input kind |
| One variant failed every attempt with `MODEL_FEATURE_UNSUPPORTED` and nobody looked until the series ended | read the first snapshot per variant (`running-series`) |
| Reasoning left at each model's default: two models took 80 s per call against 5 s for the rest, and the owner noticed first | decide reasoning when the agent is written; report latency outliers from the first run |
| A "low" reasoning effort switched reasoning on for a model that had it off, and latency and price jumped | set reasoning explicitly per model and measure |
| Truncation at `max_tokens` misread as a model or prompt failure | `finish_reason: length`, `truncated`: on a model without reasoning raise `settings.max_tokens`; on a reasoning model the hidden reasoning used the budget (`tokens_out` near the limit, little visible answer), so cap reasoning or switch it off |
| A block of settings rolled out to every model at once and judged on one case's latency | only when the owner asks; before and after per model on several cases |
| A candidate served by one provider answered 429 to every probe | flag it at step 3; `fallback_models` |
| A claim from another project written into an agent's `description` as a fact | cite a probe or a series, or mark it unverified |
| `OUTPUT_SCHEMA_REJECTED` on a large enum list, answered with a model swap | a contract problem: `designing-output-contracts` |
| Frontier models picked without looking at price, or left as fallbacks after the owner banned them | "Owner's rules" bound fallbacks too |
| Two models tied on synthetic cases; on real labelled cases they split, and one also flagged a refund request on tickets that only asked for an invoice copy | compare on real labelled data with a negative control |
| A check rejected a model that real runs had shown working, and the owner's model set was changed without asking | report a likely engine bug with the numbers, keep the owner's set |
| `allow_fallbacks: false` on an agent pinned to two backends, inside a `parallel` whose join needs every branch: upstream 429s turned a holdout series `invalid` | allow fallbacks or add `fallback_models` |
| `rpm` lowered to fight 429 from the upstream of a paid model | the lane handles it; `rpm` is the provider's own limit only |
| The key searched for in the shell environment | the server holds Studio keys; ask the owner |
| Quantization `unknown` on closed models read as missing data | it is normal for closed models |

## Tools and commands

- `uv run aqven models check <agent> --project <package> --live`, with `--provider-options '<json>'` to try a
  provider setting before writing it; the probe does not read the agent's own `provider_options`.
- `uv run aqven models shapes <agent> --project <package> --live`.
- The public OpenRouter catalogue with `curl`, as above, until AQVEN has a catalogue command.
- macOS has no GNU `timeout`: run a long probe in the background instead of wrapping it.
- Agent files for many models come from a builder in `scripts/` (`building-flows`).
- `aqven` MCP `aqven_check`, `run_start` (`mode: "live"`), `run_get_node`.

## References

- `references/integrations/openrouter-model-selection.md`: which catalogue endpoints and fields to read, how
  reasoning support is marked and how they become `provider_options`. Read at steps 2 to 4.
- `references/integrations/model-providers.md`: providers, keys, `limits`, `on_rate_limit` and lanes. Read at
  step 5.
- `references/engine/check-providers.md`, `references/engine/check-shapes.md`: the two probes and what they do
  not prove. Read at step 8.
- `references/reference/agents.md`, `references/reference/project.md`: every key of an agent and of
  `aqven.yaml`. Read before editing either file.
- `references/reference/provider-catalog.md`: built-in providers and their key variables.
- `references/concepts/what-happens-when-a-model-is-called.md`: outcomes and their policies, truncation on
  reasoning models. Read at step 4.
