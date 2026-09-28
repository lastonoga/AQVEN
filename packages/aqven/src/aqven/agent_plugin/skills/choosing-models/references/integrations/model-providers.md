# How to connect a model provider

Declare a provider in aqven.yaml, name a model on it, set the credential it needs, find and verify candidate models on any provider, and pass the request options only that provider takes.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [Naming a model on each kind of provider](#naming-a-model-on-each-kind-of-provider)
- [Finding and verifying candidate models](#finding-and-verifying-candidate-models)
- [Options only one provider takes](#options-only-one-provider-takes)
- [When a provider rate-limits](#when-a-provider-rate-limits)
- [Under the hood](#under-the-hood)
- [See also](#see-also)

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
  [provider catalog](../reference/provider-catalog.md) lists the exact name for every one of them. The one
  naming exception is `cohere`: its variable is `CO_API_KEY`, not `COHERE_API_KEY`.
- Three providers don't follow that pattern:

  | Provider | Credential |
  | --- | --- |
  | `bedrock` | No API key at all. It resolves credentials through the standard AWS chain instead: `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, the shared AWS credentials file, an IAM role, or AWS SSO — whatever you already use for any other AWS SDK call. |
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

The showcase project routes every agent through one provider, `openrouter`, declared once in its
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

## Naming a model on each kind of provider

An agent's `model` is always `<provider id>:<model name>`. The provider id is the `id` of an entry in
`providers:`; a model on a provider the project does not declare fails `aqven check` with `E_PROVIDER_UNKNOWN`.
The model name is the provider's own spelling, passed through as is, and it may contain `/`, `.` and `:`.

| Kind of provider | `model` | Where the model name comes from |
| --- | --- | --- |
| A model maker's own API: `openai`, `anthropic`, `google`, `mistral`, `cohere`, `xai`, `deepseek`, … | `anthropic:claude-haiku-4-5` | the provider's model pages, or its models endpoint called with your key |
| A cloud platform: `bedrock` | `bedrock:<model ID or inference profile ID>` | the models enabled for your AWS account in its region |
| An inference host: `groq`, `together`, `fireworks`, `cerebras`, `nebius`, … | `groq:<model ID>` | the host's model list |
| An aggregator or a gateway: `openrouter`, `vercel` | `openrouter:google/gemini-2.5-flash-lite` | its catalogue, where one model can be served by several upstream providers |
| A local or self-hosted server: `ollama`, `vllm`, `litellm` | `ollama:<model tag>` | the models the server serves; set `base_url` on the provider (`ollama` and `vllm` also read `OLLAMA_BASE_URL` and `VLLM_BASE_URL`) |
| Any other server with an OpenAI-compatible API | `local:<model name>` | the server's own list; declare the provider as below |

A server the catalog does not name gets `kind: "openai_compatible"` and its `base_url`. Its `id` must not be a
catalog name: `aqven check` reports `E_PROVIDER_ID_RESERVED` for `vllm` or `ollama` declared this way.

```yaml
providers:
- id: "local"
  kind: "openai_compatible"
  base_url: "http://127.0.0.1:8000/v1"
  api_key: "ref:env/LOCAL_API_KEY"
  data_policy:
    allows_pii: true
    allows_sensitive: true
    retention: "zero"
```

## Finding and verifying candidate models

AQVEN keeps no table of what each model can read, produce or cost. The answer comes from the provider's own data
first, then from a live probe and a real run. The steps are the same for every provider.

1. **Start from the providers you may use.** A provider belongs on the list only when its `data_policy` fits
   your data. Several providers widen the choice across model families; one provider limits it to its own
   line-up.
2. **List candidates from each provider's own data**, not from a model's name or from memory:
   - a model maker's API or an inference host: its model pages and docs, and its models endpoint, which needs
     your key;
   - an aggregator: its public catalogue, which lists many families with their prices and parameters in one
     place; [How to choose models on OpenRouter](openrouter-model-selection.md) shows which fields to
     read and how to pick the upstream providers of a model;
   - a local server: the models it serves.

   Pick several candidates, from more than one model family where your providers offer them.
3. **Check each candidate against what your flow needs**, and note where each answer came from:

   | Check | Why it matters |
   | --- | --- |
   | input kinds: text, image, PDF, audio, video | a model that cannot read an attachment fails the step with `MODEL_FEATURE_UNSUPPORTED` |
   | structured output: a JSON schema or tool calls | an `llm` node's output is typed, and `output.mode` depends on what the model supports |
   | tool calling | an agent with `tools`, `mcp_servers` or `subagents` needs it |
   | context window and the longest answer | the longest input plus the answer must fit; `settings.max_tokens` covers the answer and any reasoning |
   | price per input and output token, and reasoning, image or audio prices | the cost of every call in a series |
   | reasoning: whether it can be switched off, which efforts it takes | latency, price, and answers cut off at `max_tokens` |
   | rate limits of your key or tier | `limits`, `on_rate_limit` and `fallback_models`, below |
   | data retention and use for training | the provider's `data_policy` |

4. **Prove it.** `aqven models check <agent> --live` shows which output modes work against the real
   provider ([How to check your model providers are configured](../engine/check-providers.md)), and
   `aqven models shapes <agent> --live` finds the limits of a nested output. Neither sends your media or
   your node's schema, so one real run of the node on a case of each input kind it reads is the proof. Then
   compare the candidates on your own labelled cases with an experiment that changes the agent.

## Options only one provider takes

`settings.provider_options` in an agent file is merged into the request body as is. It carries what only one
provider takes, reasoning first:

| Provider | Reasoning key under `provider_options` |
| --- | --- |
| `openai-chat`, and other providers that speak OpenAI Chat Completions | `reasoning_effort`, one of the efforts the model lists |
| `openai` (the Responses API) | `reasoning`, with `effort` |
| `anthropic` | `thinking`: `type: "disabled"` switches it off; the forms that switch it on differ by model, see its model page |
| `openrouter` | `reasoning`, next to `provider` for routing; see [How to choose models on OpenRouter](openrouter-model-selection.md) |

Two agents on two providers, each with reasoning set on purpose:

```yaml
model: "openai-chat:gpt-5-mini"
settings:
  max_tokens: 2000
  provider_options:
    reasoning_effort: "minimal"
```

```yaml
model: "anthropic:claude-haiku-4-5"
settings:
  max_tokens: 2000
  provider_options:
    thinking:
      type: "disabled"
```

- The keys reach the request on every provider of the
  [provider catalog](../reference/provider-catalog.md) except `google`, `mistral`, `cohere`, `bedrock` and `xai`, and
  on providers with `kind: "openai_compatible"`. On `openrouter`, `cerebras` and `zai`, a key the model sets
  itself wins over yours: on `openrouter`, the `provider` object that `routing` in `aqven.yaml` produces
  replaces the agent's.
- `google`, `mistral`, `cohere`, `bedrock` and `xai` do not send them: their model classes take no extra request
  body, so the keys are dropped without an error, and `aqven check` does not report them. Reasoning on those
  models stays at the model's default.
- The object belongs to the agent, not to one model: every model in `fallback_models` gets the same keys. A
  provider may reject a key it does not know, so a fallback on another provider needs options both accept.
- `aqven models check --live` does not read the agent's own `provider_options`. Pass the same object with
  `--provider-options '<json object>'` to probe what the agent sends.

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

Other models keep running during a pause, other models of the same provider included: every
`<provider>:<model>` is a lane of its own. That matters most on an aggregator such as OpenRouter: a model can be
rate-limited upstream by the provider serving it, and that limit is per model and shared with everyone else
calling it, so your own `rpm` never sees it coming. `retry_wait_seconds` and
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

A model that only one provider serves is the fragile case: when that provider rate-limits or goes down, there is
no other provider of the same model to try, so give its agent `fallback_models` with another model, on the same
provider or on another one. On an aggregator,
[How to choose models on OpenRouter](openrouter-model-selection.md) shows how to count a model's
upstream providers.

## Under the hood

Every built-in provider is a thin factory over a Pydantic AI model
class — `GoogleModel`, `AnthropicModel`, `BedrockConverseModel`, and so on. It builds the right client,
passes your credential and settings through, and stops there — Pydantic AI is what actually talks to
the provider.

## See also

- [Provider catalog](../reference/provider-catalog.md) — every built-in provider, its model class, default
  environment variable, and whether it needs an extra.
- What this is built on — what AQVEN takes as-is from Pydantic AI
  and what it adds on top of every model call.
- [How to check your model providers are configured](../engine/check-providers.md) — whether a configured
  model actually works, with `--live` for a real request.
- [How to choose models on OpenRouter](openrouter-model-selection.md) — the aggregator case: the
  catalogue, the upstream providers of a model, routing and reasoning on OpenRouter.
- How to manage secrets — the full report of every secret the project declares,
  across providers, tools, and MCP servers.
