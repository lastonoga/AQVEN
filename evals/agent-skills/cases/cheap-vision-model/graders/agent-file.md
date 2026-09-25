---
type: "llm"
focus:
  source: "file"
  path: "agents/receipt_reader.yaml"
weight: 2
---
This is an AQVEN agent file; the saved OpenRouter catalogue lists which models take images, their prices and
parameters. Pass only if all of these hold:
- `model` is an `openrouter:` model whose catalogue entry has `image` in `architecture.input_modalities`, is priced
  at or below a few tenths of a dollar per million input tokens, and supports structured output
  (`structured_outputs` or `response_format`). Good picks: google/gemini-2.5-flash-lite, openai/gpt-4.1-nano,
  qwen/qwen2.5-vl-72b-instruct, mistralai/pixtral-12b.
- `settings.provider_options` sets an OpenRouter `provider` block built from the endpoint files (an `order` of
  endpoint tags, and `allow_fallbacks` or `require_parameters` set on purpose), or the answer explains why the model
  has a single endpoint.
- `fallback_models`, if present, lists a model that also takes images, is not a frontier model and is not the same
  model again.
- There is no key claiming what the model can do (such as `capabilities:`).
Fail if the model is text-only (deepseek/deepseek-v4-flash-0731, mistralai/mistral-nemo), a frontier model
(openai/gpt-5, anthropic/claude-sonnet-4.5, google/gemini-2.5-pro, x-ai/grok-4), a model that always reasons
(qwen/qwen3-vl-30b-a3b-thinking) without a reason given, or a model without structured output support
(meta-llama/llama-3.2-11b-vision-instruct) as the primary.
