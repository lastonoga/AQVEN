---
title: How to connect a model provider
description: Declare a provider in aqven.yaml, point an agent's model field at it, and set the one credential the provider needs.
---

# How to connect a model provider

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
  | `google` | Either `GOOGLE_API_KEY` or `GEMINI_API_KEY`. Whichever is set first wins. |
  | `alibaba` | Either `ALIBABA_API_KEY` or `DASHSCOPE_API_KEY`. Whichever is set first wins. |

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
