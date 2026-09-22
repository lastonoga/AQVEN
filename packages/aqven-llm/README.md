# aqven-llm

**Provider isolation for [AQVEN](https://pypi.org/project/aqven/).** Every import of a model provider SDK
lives in this one package, behind a single factory. The rest of the engine receives a ready `Model` and never
imports `openai`, `anthropic`, `google.genai` or the provider modules of Pydantic AI.

📖 **[Documentation](https://aqvenstudio.com)** · 🔌 **[Models and providers](https://aqvenstudio.com/engineering/providers/)** · 📚 **[API reference](https://aqvenstudio.com/engineering/reference/)**

---

## Why a separate package

Provider SDKs are the least stable part of an LLM stack: they change shape, they bring their own HTTP clients,
and they each retry differently. Letting them leak across a codebase makes every one of those changes a
cross-cutting one.

`aqven-llm` draws a hard boundary. The engine asks for a model by reference and gets one back; the guarantee
chain — retries, budgets, cassettes, instrumentation — is layered on top of it uniformly, whichever provider
answered. The boundary is enforced, not just documented: a lint rule fails the build if a provider import
appears anywhere else.

## Install a provider

Providers are extras, so you only install the SDKs you actually call:

```bash
uv add "aqven-llm[anthropic]"
```

Available extras: `anthropic`, `bedrock`, `cohere`, `google`, `groq`, `huggingface`, `mistral`, `xai`.
OpenAI is included by default, and OpenAI-compatible gateways such as OpenRouter and Together go through it.

Custom providers can register themselves through an entry point, without changing this package.

## Usually you do not install this directly

`aqven-llm` is a dependency of `aqven` and is pinned to the same version. Install
[`aqven`](https://pypi.org/project/aqven/) instead — it brings this package with it, along with Studio.

```bash
uv tool install aqven
```

## Keywords

LLM provider abstraction · model factory · OpenAI · Anthropic · Google Gemini · Bedrock · Mistral · Cohere ·
Groq · xAI · OpenRouter · Pydantic AI · structured output · streaming

## License

AQVEN License 1.0.0, based on [PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) —
source-available. Use it for any purpose, including in production and in commercial products you build with it.
You may not use it to provide a product that competes with AQVEN, and you may redistribute AQVEN itself
only free of charge and for a non-commercial purpose.

Copyright Kirill Burkhanov.
