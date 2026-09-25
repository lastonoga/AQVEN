---
name: choosing-models
description: "Picks models for AQVEN agents from provider data and probes: endpoints, provider_options, rate limits, fallbacks. Use first when an agent costs too much or needs a cheaper or fallback model, before editing agents/ or providers, on 429 or MODEL_FEATURE_UNSUPPORTED."
---

## MUST

- The owner picks models, providers and the panel ("Owner's rules" in `AGENTS.md`). Change that set only after
  the owner says yes.
- When a check contradicts what runs showed, report it to the owner as a likely engine bug, with numbers (runs
  that passed, the code the check gave). Never swap models to satisfy the check.
- A new model in an agent or in an `agent` factor gets a live probe before any series.
- An upstream 429 is not fixed with `limits.rpm`: the model's rate-limit lane and the provider's `on_rate_limit`
  handle it.
- An agent file has no key for what a model can do: the catalogue suggests, a live probe proves.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Read "Owner's rules": providers, price ceiling, what is banned, any judge panel | the frame is known |
| 2 | Candidates from the provider's catalogue, not by name: input modalities, price, reasoning, structured output, tools, across families. OpenRouter: `curl -s https://openrouter.ai/api/v1/models`, fields `architecture.input_modalities`, `pricing`, `supported_parameters` (`structured_outputs`, `response_format`, `tools`, `reasoning`) | a table of 5 or more candidates from 3 or more families, with prices |
| 3 | Endpoints of a candidate: `curl -s https://openrouter.ai/api/v1/models/<author>/<slug>/endpoints`, fields `tag` (the slug `provider.order` takes), `provider_name`, `quantization`, `max_completion_tokens`, `supported_parameters`, `status`, `uptime_last_30m` | a provider order chosen |
| 4 | The agent file: `model`; `settings.provider_options` (merged into the request body; for OpenRouter `provider` with `order`, `allow_fallbacks`, `require_parameters: true`, `quantizations`, and `reasoning` set on purpose per model); `settings.max_tokens` above the expected output; `output.mode` from `models check`; `output.on_error`, `output.on_refusal`, `output.on_truncated`. A pinned `provider.order` with `allow_fallbacks: false` leaves an upstream 429 nowhere to go: allow provider fallbacks or set `fallback_models` | `aqven_check` clean |
| 5 | The provider in `aqven.yaml`: `on_rate_limit` `auto` (default: the model pauses for `retry-after`, else 2 s doubling to 60 s, parallel calls halve and grow back, a call gives up after 10 attempts or 120 s), `fixed` with `retry_wait_seconds` and `retry_attempts`, or `fail` to hand over to `fallback_models` at once; `limits.concurrency` is the starting parallelism per model (8 when unset), `limits.rpm` only the provider's own limit | the strategy fits the latency contract |
| 6 | `fallback_models` with the same input modality, inside "Owner's rules"; `E_OUTPUT_MODE_UNSUPPORTED` checks the output modes of every model of the agent | the fallback stays inside the frame |
| 7 | Does the model take the media (image, PDF, audio, video): the engine keeps no table. Read `input_modalities`, then one run on a real case with that media; a provider refusal comes back as `MODEL_FEATURE_UNSUPPORTED` naming the attachment | a media input proven by a run |
| 8 | Prove it: `uv run aqven models check <agent> --project <package> --live`; `uv run aqven models shapes <agent> --project <package> --live` for a nested output; one live run on a real case per agent | every agent `ok`, the run finished, latency within the contract |
| 9 | Compare models on the project's labelled data with a negative control, as an `agent` factor (`designing-experiments`); synthetic data is only a sanity check | the model decision rests on real labels |
| 10 | One change at a time: a block of settings is never rolled out to three models at once | each setting proven on its own model |

The CLI probes read keys from the environment and `<package>/.env`. Keys saved in Studio settings are visible only
to the project server: when your shell has no key, do not search for it; ask the owner to run the probe.

```yaml
settings:
  max_tokens: 4000
  provider_options:
    provider:
      order:
      - "google-vertex"
      - "google-ai-studio"
      allow_fallbacks: true
      require_parameters: true
output:
  mode: "prompted"
  on_refusal: "retry"
```

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| A weaker model picked because its profile was unknown | the catalogue and a live probe decide |
| Reasoning and `output.mode: tool` set without a live probe: every attempt `MODEL_FEATURE_UNSUPPORTED` | `models check --live` first |
| The profile said `tool` works, live it gave `MODEL_NO_STRUCTURED_OUTPUT`; a big series ran without `--live` | probe live before a series |
| One variant failed every attempt with `MODEL_FEATURE_UNSUPPORTED` and nobody looked until the series ended | read the first snapshot per variant (`running-series`) |
| A model in `prompted` mode reasoned far past the latency contract on every call | check latency in the first run; set reasoning on purpose |
| Frontier models picked without looking at price, or left as fallbacks after the owner banned them | "Owner's rules" bound fallbacks too |
| A "low" reasoning effort switched reasoning on for a model that had it off, and latency and price jumped | set reasoning explicitly per model and measure |
| Truncation at `max_tokens` misread as a model or prompt failure | `finish_reason: length`, `truncated` mean raise `settings.max_tokens` |
| Two models tied on synthetic cases; on real labelled cases they split, and one also reported the defect on clean controls ("torn packaging" on intact product photos) | compare on real labelled data with a negative control |
| A check rejected a model that real runs had shown working, and the owner's model set was changed without asking | report a likely engine bug with the numbers, keep the owner's set |
| `allow_fallbacks: false` on an agent pinned to two backends, inside a `parallel` whose join needs every branch: upstream 429s turned a holdout series `invalid` | allow fallbacks or add `fallback_models` |
| `rpm` lowered to fight 429 from the upstream of a paid model | the lane handles it; `rpm` is the provider's own limit only |
| The key searched for in the shell environment | the server holds Studio keys; ask the owner |
| Quantization `unknown` on closed models read as missing data | it is normal for closed models |

## Tools and commands

- `uv run aqven models check <agent> --project <package> --live`, with `--provider-options '<json>'` to try a
  provider setting before writing it.
- `uv run aqven models shapes <agent> --project <package> --live`.
- The public OpenRouter catalogue with `curl`, as above.
- `aqven` MCP `aqven_check`, `run_start` (`mode: "live"`), `run_get_node`.

## References

- `references/integrations/openrouter-model-selection.md`: which catalogue endpoints and fields to read and how
  they become `provider_options`. Read at steps 2 to 4.
- `references/integrations/model-providers.md`: providers, keys, `limits`, `on_rate_limit` and lanes. Read at
  step 5.
- `references/engine/check-providers.md`, `references/engine/check-shapes.md`: the two probes. Read at step 8.
- `references/reference/agents.md`, `references/reference/project.md`: every key of an agent and of
  `aqven.yaml`. Read before editing either file.
- `references/reference/provider-catalog.md`: built-in providers and their key variables.
- `references/concepts/what-happens-when-a-model-is-called.md`: outcomes and their policies. Read at step 4.
