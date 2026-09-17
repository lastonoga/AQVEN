---
title: Models & Providers
description: Configuring providers, output modes, and which model class fits which job.
---

## Configuring a provider

`aqven.yaml` lists the providers a project may call. An agent then names a model as `provider:model`.

| Key | Meaning |
|---|---|
| `id` | the provider prefix used in `model:` (`openrouter:openai/gpt-oss-20b`) |
| `kind` | `catalog` (default), `code`, or `openai_compatible` |
| `api_key` | `ref:env/NAME`; optional for a keyless provider |
| `base_url` | required for `openai_compatible` |
| `run` | `module:function` factory, only with `kind: code` |
| `data_policy`, `routing` | PII/retention policy, OpenRouter routing (`data_collection`, `zdr`) |

A `catalog` provider forwards straight to the Pydantic AI provider registry — nothing to write. `openai_compatible`
builds an `OpenAIChatModel` over an OpenAI-compatible `base_url` with no code. `code` is for anything else: a
function `def build(model_name: str, context: ProviderContext) -> Model` returns a plain `pydantic_ai.models.Model`,
so it goes through the same guarantee chain as a catalog model — outcome gate, PII redaction, cassettes, budget,
backoff.

The Lumen example runs every agent on OpenRouter, picked for the cheapest endpoint with the capabilities each node
needs:

| Agent | Model |
|---|---|
| `gpt`, `resolver` | `openrouter:openai/gpt-oss-20b` |
| `gemini` | `openrouter:google/gemini-2.5-flash-lite` |
| `mistral`, `researcher` | `openrouter:mistralai/mistral-nemo` |
| `deepseek` | `openrouter:deepseek/deepseek-v4-flash-0731` |
| `qwen` | `openrouter:qwen/qwen3-30b-a3b-instruct-2507` |
| `llama` | `openrouter:meta-llama/llama-3.1-8b-instruct` |
| `painter` | `openrouter:google/gemini-3.1-flash-lite-image`, fallback `openrouter:openai/gpt-5-image-mini` |

## Output mode

An agent declares `output.mode: auto | tool | native | prompted` (default `auto`).

| Mode | What the model is asked to do |
|---|---|
| `tool` | call an output tool with the declared schema |
| `native` | use the provider's native structured-output support |
| `prompted` | answer with JSON described in the instructions |
| `auto` | resolved once at compile time from a table of known models, then the Pydantic AI model profile; mixed fallback models resolve to `prompted` |

`auto` is deterministic — there is no environment flag and no switch at run time. The resolved mode is visible in
`aqven tree`, in the compiled IR, and over the Studio API. `aqven check` reports `W_OUTPUT_MODE_RESOLVED` when
`auto` differs from the profile default, and `E_OUTPUT_MODE_UNSUPPORTED` when an explicit mode is impossible for
that model.

```
uv run aqven models check --project examples/showcase/src/lumen
```

prints what each agent's mode resolves to; `--live` sends one tiny request per mode to confirm it against the real
provider rather than trusting the static table. Run this before picking a model from memory — a provider can change
its structured-output support without notice.

## Choosing a model class for the job

AQVEN's node kinds map onto a small set of jobs, and the jobs differ in what they need from a model:

| Job | Needs | Example in Lumen |
|---|---|---|
| Extractor | Grounded, schema-constrained, cheap | `record.extract` — pulls structured fields from the case description |
| Classifier / router | Fast, closed-set, cheap | `intent` (`switch`), `route` (`switch`) |
| Generator | Fluent, open-ended, can be a stronger model | `drafts` (`parallel` across `gpt`, `mistral`, `gemini`) |
| Judge / critic | Reasoning-capable, ideally a different model family than the generator it's judging | `judge_panel.judges` (`deepseek`, `qwen`, `llama` — three different families voting), `polish.critique` (`mistral`, judging `gpt`'s draft) |
| Aggregator | Deterministic code, not a model call, wherever possible | `tally`, `judge_panel.aggregate` |

The `polish.critique` → `polish.revise` pair is deliberate: the critic (`mistral`) is never the same model family as
what it's grading (`gpt`'s `revise` output). A model judging its own output is a documented failure mode — critic
and generator sharing a model and context makes the critique uninformative. Pick the critic's model before you pick
its prompt.

Cheap, fast models (small OpenRouter endpoints, Haiku-class, Flash-class) are the right default for extractors and
classifiers, where the job is narrow and schema-constrained. Reserve a stronger, more expensive model for the
generator step and for judges that need to catch subtle problems — not for every node in the graph.
