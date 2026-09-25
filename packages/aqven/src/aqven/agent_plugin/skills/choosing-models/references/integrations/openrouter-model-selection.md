# How to choose models on OpenRouter

Pick candidates from OpenRouter's public catalogue by what they read, what they cost and which parameters they take, read a model's endpoints, route it with provider_options, handle rate limits per model, and prove the choice with a live probe.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [Under the hood](#under-the-hood)
- [See also](#see-also)

## When you need this

Read this before you add or change an agent whose `model` starts with `openrouter:`, before an experiment that
compares agents, and when a step fails with `MODEL_FEATURE_UNSUPPORTED`, runs into `429` or is slow. The answer to
"can this model do it" comes from OpenRouter's catalogue and from a live probe, not from a model's name or from
memory: AQVEN keeps no table of what each model can read or produce.

## Steps

1. **List candidates from the catalogue.** `GET https://openrouter.ai/api/v1/models` is public: no key needed. It
   takes filters as query parameters, among them `input_modalities`, `output_modalities` and
   `supported_parameters` (comma-separated). This lists the models that read images and return structured output,
   cheapest input first, with prices in USD per million tokens:

   ```bash
   curl -s 'https://openrouter.ai/api/v1/models?input_modalities=image&supported_parameters=structured_outputs' \
     | jq -r '.data[] | [.id, (.pricing.prompt | tonumber * 1000000), (.pricing.completion | tonumber * 1000000), .context_length] | @tsv' \
     | sort -t$'\t' -k2 -g
   ```

   Pick at least five candidates from at least three model families, so a result does not rest on one family.

   | Field of a model | What it tells you |
   | --- | --- |
   | `id` | the name after `openrouter:` in the agent's `model`, for example `google/gemini-2.5-flash-lite` |
   | `architecture.input_modalities` | what the model reads: `text`, `image`, `file`, `audio`, `video` |
   | `architecture.output_modalities` | what it produces; `image` means it can answer with an image |
   | `pricing.prompt`, `pricing.completion` | USD per input and per output token, as strings |
   | `pricing.image`, `pricing.internal_reasoning`, `pricing.input_cache_read`, … | other prices, only where they apply |
   | `context_length` | the context window in tokens |
   | `top_provider.max_completion_tokens` | the longest answer of the main provider |
   | `supported_parameters` | request parameters some provider of the model accepts: `structured_outputs`, `response_format`, `tools`, `reasoning`, `max_tokens`, `seed`, … |

2. **Read the endpoints of each candidate.** `GET https://openrouter.ai/api/v1/models/<author>/<slug>/endpoints`
   lists every provider that serves the model. The same model can differ between them, so choose the providers
   here, not from the model entry:

   ```bash
   curl -s https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints \
     | jq -r '.data.endpoints[] | [.tag, .provider_name, .quantization, .max_completion_tokens, .uptime_last_30m] | @tsv'
   ```

   | Field of an endpoint | What it tells you |
   | --- | --- |
   | `tag` | the provider slug to write in `order`, `only` or `ignore`, for example `google-vertex` or `google-vertex/eu` |
   | `provider_name` | who serves this endpoint |
   | `quantization` | `fp8`, `bf16` and so on; `unknown` is normal for closed models |
   | `context_length`, `max_prompt_tokens`, `max_completion_tokens` | the limits of this endpoint |
   | `pricing` | the prices of this endpoint |
   | `supported_parameters` | what this endpoint accepts; structured output or tools may be missing on one provider only |
   | `status`, `uptime_last_5m`, `uptime_last_30m`, `uptime_last_1d` | whether it is up |
   | `latency_last_30m`, `throughput_last_30m` | how fast it has been lately |

3. **Route the model in the agent file.** Everything under `settings.provider_options` goes into the request body
   as is, so OpenRouter's `provider` object goes there:

   | Key of `provider` | Effect |
   | --- | --- |
   | `order` | provider slugs to try first, in this order; a slug without a region matches all its regions |
   | `allow_fallbacks` | `true` by default: other providers of the same model may answer when these fail |
   | `require_parameters` | only providers that accept every parameter of the request; set it for structured output and tools |
   | `only`, `ignore` | provider slugs to allow or to skip |
   | `quantizations` | allowed quantizations, for example `["fp8", "bf16"]` |
   | `data_collection` | `"deny"` skips providers that may store your data |
   | `zdr` | `true` keeps to zero-data-retention endpoints |
   | `sort`, `max_price` | sort providers by price, throughput or latency; cap the price |

   A pinned `order` with `allow_fallbacks: false` leaves a rate-limited provider no way out: keep fallbacks on, or
   give the agent `fallback_models`.

   Keep these keys in the agent, not in `aqven.yaml`. When the OpenRouter provider in `aqven.yaml` declares
   `routing` (`data_collection`, `zdr`), AQVEN sends it as the `provider` object of every request, and it replaces
   the agent's own `provider` object: `order`, `require_parameters` and the rest are dropped. Put
   `data_collection` and `zdr` into each agent's `provider` object instead.

4. **Choose how the model's rate limits are handled.** OpenRouter puts no request limit on paid models; the
   providers behind a model do, and that limit is per model and shared with everyone who calls it. Before a `429`
   reaches you, OpenRouter tries other providers of the same model when fallbacks are allowed. Free variants
   (`:free`) have their own small limits per minute and per day. In AQVEN every `openrouter:<model>` is a lane of
   its own: a `429` pauses that model only, and `on_rate_limit` on the provider in `aqven.yaml` says what happens
   next (`auto`, `fixed` or `fail`). [How to connect a model provider](model-providers.md) has the
   table. Do not lower `limits.rpm` against these `429`s: `rpm` spaces your own requests to the whole provider and
   never sees another customer's load.

5. **Prove the choice with a live probe.** `models check --live` sends one small request per output mode and
   shows which modes work, so you can pin `output.mode`. It does not read the agent's `provider_options`: pass the
   same `provider` object with `--provider-options` to probe the routing the agent runs with.

   ```bash
   uv run aqven models check reader --project . --live \
     --provider-options '{"provider": {"order": ["google-vertex", "google-ai-studio"], "allow_fallbacks": true, "require_parameters": true, "data_collection": "deny"}}'
   ```

   For an output with nested objects or long lists, `uv run aqven models shapes reader --project . --live`
   finds the model's structural limits (billed as well). Whether a model reads images is proven by one real run on
   a case with an image: a provider that refuses images fails the step with `MODEL_FEATURE_UNSUPPORTED`. Then
   compare the candidates on your own labelled cases with an experiment that changes the agent.

### Example

The `reader` agent of the tested snippets project reads listing photos. Gemini 2.5 Flash-Lite
takes `image` input and `structured_outputs`; its endpoints are served by `google-vertex` and `google-ai-studio`,
both with `structured_outputs` in their `supported_parameters`. The agent tries Google's endpoints in that order,
lets OpenRouter fall back to other providers, keeps to providers that accept every parameter and do not store
data, and moves to Gemma 3 27B when the request to the model fails:

```yaml title="agents/reader.yaml"
apiVersion: "aqven/v1"
kind: "Agent"
description: "Reads listing photos and text: Gemini Flash-Lite through OpenRouter, Google endpoints first"
model: "openrouter:google/gemini-2.5-flash-lite"
fallback_models:
- "openrouter:google/gemma-3-27b-it"
settings:
  max_tokens: 2000
  provider_options:
    provider:
      order:
      - "google-vertex"
      - "google-ai-studio"
      allow_fallbacks: true
      require_parameters: true
      data_collection: "deny"
output:
  mode: "tool"
  on_error: "retry"
  on_refusal: "fallback"
  on_truncated: "retry"
limits:
  seconds: 90
```

Its provider in `aqven.yaml` declares no `routing`, starts each model at four parallel calls and keeps the default
`on_rate_limit: "auto"`.

## Under the hood

The `openrouter` provider is Pydantic AI's OpenRouter model: `settings.provider_options` becomes the request's
extra body, and a project's `routing` becomes OpenRouter's `provider` object. See
What this is built on.

## See also

- [How to connect a model provider](model-providers.md) — declaring a provider, credentials, rate-limit
  strategies per model.
- [How to check your model providers are configured](../engine/check-providers.md) — everything `models check` reports.
- [How to find a model's real structural limits](../engine/check-shapes.md) — `models shapes` in detail.
- How to prepare images for a flow — what an image model receives.
- OpenRouter's own reference: [list models](https://openrouter.ai/docs/api/api-reference/models/get-models),
  [list a model's endpoints](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints),
  [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection),
  [rate limits](https://openrouter.ai/docs/api/reference/limits).
