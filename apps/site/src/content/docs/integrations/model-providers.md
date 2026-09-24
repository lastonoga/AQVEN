---
title: How to connect a model provider
description: Declare a provider in aqven.yaml, point an agent's model field at it, and set the one credential the provider needs.
---

## When you need this

An agent's `model` field names a provider and a model in one string, but that string only works once
the project knows the provider it points at — where its credential comes from, and what data policy
applies to calls made through it. You declare a provider once in `aqven.yaml`, and every agent that
names it shares that declaration.

## Steps

- Add an entry to `providers:` in `aqven.yaml`: an `id`, and a `data_policy` (whether calls through it
  may carry PII or other sensitive data, and its retention). Most providers also take `api_key`, a
  `ref:env/<NAME>` pointing at the environment variable that holds the credential.
- Point an agent's `model` field at `<provider_id>:<model_name>`, for example
  `openrouter:openai/gpt-oss-20b`. `provider_id` matches the `id` you gave the provider;
  `model_name` is passed through to the provider as-is.
- Set the credential. For most of the 28 built-in provider families that's one environment variable,
  `<NAME>_API_KEY`, in the project's `.env` file or exported in the shell — the
  [provider catalog](/reference/provider-catalog/) lists the exact name for every one of them. The one
  naming exception is `cohere`: its variable is `CO_API_KEY`, not `COHERE_API_KEY`.
- Three providers don't follow that pattern:

  | Provider | Credential |
  | --- | --- |
  | `bedrock` | No API key at all. It resolves credentials through the standard AWS chain instead: `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, `~/.aws/credentials`, an IAM role, or AWS SSO — whatever you already use for any other AWS SDK call. |
  | `google` | Either `GOOGLE_API_KEY` or `GEMINI_API_KEY`. If both are set, `GOOGLE_API_KEY` wins. |
  | `alibaba` | Either `ALIBABA_API_KEY` or `DASHSCOPE_API_KEY`. If both are set, `ALIBABA_API_KEY` wins. |

- Eight providers also need a separate install before `aqven check` will accept a model on them:
  `anthropic`, `google`, `groq`, `mistral`, `cohere`, `bedrock`, `huggingface`, `xai`. Add the matching
  extra — `uv add "aqven[google]"`, and so on — before you point an agent at one. The rest of the 28,
  OpenRouter included, come with the base install. Forgetting the extra fails at check time, not at run
  time:

  ```text
  agents/gemini_direct.yaml:4:1: error E_PROVIDER_EXTRA_MISSING model: model google:gemini-2.5-flash needs provider google, which is not installed
    hint: install the extra: uv add "aqven[google]"
  ```

### Example

The [showcase](/start/quickstart/) project routes every agent through one provider, `openrouter`, declared once in its
`aqven.yaml`:

```yaml
providers:
- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: true
    allows_sensitive: false
    retention: "unknown"
  routing:
    data_collection: "deny"
    zdr: false
  limits:
    rpm: 60
```

Each of its nine agents then just sets `model` on that one provider, differing only in the model name
after the colon:

```yaml
model: "openrouter:openai/gpt-oss-20b"
```

Calling a model directly, without OpenRouter in the middle, looks the same shape with a different
provider — here's the `google` case, with its dual credential name. Declare the provider:

```yaml
providers:
- id: "google"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
```

point an agent at it:

```yaml
model: "google:gemini-2.5-flash"
```

and set a credential. Leaving `api_key` out, as above, falls back to the catalog's default variable for
that provider — `GOOGLE_API_KEY` for `google`. Set `api_key: "ref:env/GEMINI_API_KEY"` explicitly if you
already have the credential under that name instead.

## When a provider rate-limits

Two keys on the provider entry keep calls under the provider's limit before it answers `429`.
`limits.rpm` spaces requests to the provider evenly, across all of its models. `limits.concurrency` caps how
many calls of one model run at once, 8 when it is unset. A call first waits for a place among its model's
parallel calls, then for any pause of that model, then for its `rpm` slot.

What happens after a `429` is `on_rate_limit`:

| `on_rate_limit` | After a `429` |
| --- | --- |
| `auto` (default) | Every call of that model pauses, not only the one that failed: for the provider's `retry-after`, or 2 s doubling to at most 60 s when it sends none. The model's parallel calls are halved, never below 1, and grow back by one after 10 successful calls in a row, up to the starting value. A call gives up after 10 attempts or 120 s. |
| `fixed` | The model pauses `retry_wait_seconds` (10 by default) before each retry, `retry_attempts` times (5 by default). Parallel calls stay as they are. |
| `fail` | No retry: the call fails with `provider_error` at once, so an agent's `fallback_models` take over without waiting. |

Other models keep running during a pause, other models of the same provider included. That matters on
OpenRouter: a model can be rate-limited upstream by the provider serving it, and that limit is per model and
shared with everyone else calling it, so your own `rpm` never sees it coming. `retry_wait_seconds` and
`retry_attempts` are read only with `fixed`; with another value `aqven check` rejects them.

```yaml
providers:
- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: true
    allows_sensitive: false
    retention: "unknown"
  limits:
    rpm: 60
    concurrency: 4
  on_rate_limit: "fixed"
  retry_wait_seconds: 15
  retry_attempts: 3
```

`aqven dev` prints one line when a model pauses:

```text
14:02:11 ⏸ openrouter:google/gemma-3-27b-it rate-limited — pausing 30s, parallel 8→4
```

In a series, an attempt that still ends with a rate limit after these retries goes to the end of the queue
once more instead of counting as an infrastructure error; a second rate limit counts as usual.

## Under the hood

Every built-in provider is a thin factory over a [Pydantic AI](/concepts/what-this-is-built-on/) model
class — `GoogleModel`, `AnthropicModel`, `BedrockConverseModel`, and so on. It builds the right client,
passes your credential and settings through, and stops there — Pydantic AI is what actually talks to
the provider.

## See also

- [Provider catalog](/reference/provider-catalog/) — every built-in provider, its model class, default
  environment variable, and whether it needs an extra.
- [What this is built on](/concepts/what-this-is-built-on/) — what AQVEN takes as-is from Pydantic AI
  and what it adds on top of every model call.
- [How to check your model providers are configured](/engine/check-providers/) — whether a configured
  model actually works, with `--live` for a real request.
- [How to manage secrets](/engine/secrets/) — the full report of every secret the project declares,
  across providers, tools, and MCP servers.
