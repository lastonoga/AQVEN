# Provider catalog

Generated catalog of model providers in the installed Python package.

These providers come from `aqven_llm.catalog.PROVIDERS`. The key column names the default environment variable; project `api_key` may point to another environment variable. A provider's presence in the catalog does not guarantee that a particular model supports every modality or output mode. Use `aqven models check --project .` and `--live` when a real request is needed.

The `provider_options` column says which keys of an agent's `settings.provider_options` reach the request of that provider; `aqven check` warns with `W_PROVIDER_OPTIONS_IGNORED` about every other key.

| Provider prefix | Pydantic AI model class | Default key variable | Required | Extra | `provider_options` |
| --- | --- | --- | --- | --- | --- |
| `openai` | `pydantic_ai.models.openai.OpenAIResponsesModel` | `OPENAI_API_KEY` | Yes | `—` | every key, merged into the request body |
| `openai-chat` | `pydantic_ai.models.openai.OpenAIChatModel` | `OPENAI_API_KEY` | Yes | `—` | every key, merged into the request body |
| `openai-responses` | `pydantic_ai.models.openai.OpenAIResponsesModel` | `OPENAI_API_KEY` | Yes | `—` | every key, merged into the request body |
| `openrouter` | `pydantic_ai.models.openrouter.OpenRouterModel` | `OPENROUTER_API_KEY` | Yes | `—` | every key, merged into the request body |
| `deepseek` | `pydantic_ai.models.openai.OpenAIChatModel` | `DEEPSEEK_API_KEY` | Yes | `—` | every key, merged into the request body |
| `together` | `pydantic_ai.models.openai.OpenAIChatModel` | `TOGETHER_API_KEY` | Yes | `—` | every key, merged into the request body |
| `fireworks` | `pydantic_ai.models.openai.OpenAIChatModel` | `FIREWORKS_API_KEY` | Yes | `—` | every key, merged into the request body |
| `moonshotai` | `pydantic_ai.models.openai.OpenAIChatModel` | `MOONSHOTAI_API_KEY` | Yes | `—` | every key, merged into the request body |
| `nebius` | `pydantic_ai.models.openai.OpenAIChatModel` | `NEBIUS_API_KEY` | Yes | `—` | every key, merged into the request body |
| `ovhcloud` | `pydantic_ai.models.openai.OpenAIChatModel` | `OVHCLOUD_API_KEY` | Yes | `—` | every key, merged into the request body |
| `alibaba` | `pydantic_ai.models.openai.OpenAIChatModel` | `ALIBABA_API_KEY` | Yes | `—` | every key, merged into the request body |
| `sambanova` | `pydantic_ai.models.openai.OpenAIChatModel` | `SAMBANOVA_API_KEY` | Yes | `—` | every key, merged into the request body |
| `vercel` | `pydantic_ai.models.openai.OpenAIChatModel` | `VERCEL_AI_GATEWAY_API_KEY` | Yes | `—` | every key, merged into the request body |
| `heroku` | `pydantic_ai.models.openai.OpenAIChatModel` | `HEROKU_INFERENCE_KEY` | Yes | `—` | every key, merged into the request body |
| `litellm` | `pydantic_ai.models.openai.OpenAIChatModel` | `—` | No | `—` | every key, merged into the request body |
| `vllm` | `pydantic_ai.models.openai.OpenAIChatModel` | `VLLM_API_KEY` | No | `—` | every key, merged into the request body |
| `ollama` | `pydantic_ai.models.ollama.OllamaModel` | `OLLAMA_API_KEY` | No | `—` | every key, merged into the request body |
| `cerebras` | `pydantic_ai.models.cerebras.CerebrasModel` | `CEREBRAS_API_KEY` | Yes | `—` | every key, merged into the request body |
| `crusoe` | `pydantic_ai.models.crusoe.CrusoeModel` | `CRUSOE_API_KEY` | Yes | `—` | every key, merged into the request body |
| `zai` | `pydantic_ai.models.zai.ZaiModel` | `ZAI_API_KEY` | Yes | `—` | every key, merged into the request body |
| `anthropic` | `pydantic_ai.models.anthropic.AnthropicModel` | `ANTHROPIC_API_KEY` | Yes | `anthropic` | every key, merged into the request body |
| `google` | `pydantic_ai.models.google.GoogleModel` | `GOOGLE_API_KEY` | Yes | `google` | only thinking_config, safety_settings, media_resolution, cached_content, response_logprobs, logprobs (with response_logprobs: true), top_k, presence_penalty, frequency_penalty, stop_sequences |
| `groq` | `pydantic_ai.models.groq.GroqModel` | `GROQ_API_KEY` | Yes | `groq` | every key, merged into the request body |
| `mistral` | `pydantic_ai.models.mistral.MistralModel` | `MISTRAL_API_KEY` | Yes | `mistral` | only reasoning_effort (none or high on a model with adjustable reasoning), prompt_cache_key, presence_penalty, frequency_penalty, stop |
| `cohere` | `pydantic_ai.models.cohere.CohereModel` | `CO_API_KEY` | Yes | `cohere` | no key |
| `bedrock` | `pydantic_ai.models.bedrock.BedrockConverseModel` | `—` | No | `bedrock` | every key, inside additionalModelRequestFields |
| `huggingface` | `pydantic_ai.models.huggingface.HuggingFaceModel` | `HF_TOKEN` | Yes | `huggingface` | every key, merged into the request body |
| `xai` | `pydantic_ai.models.xai.XaiModel` | `XAI_API_KEY` | Yes | `xai` | only reasoning_effort, user, logprobs, top_logprobs, store_messages, previous_response_id, use_encrypted_content, max_turns, agent_count, presence_penalty, frequency_penalty, stop |

Choose a model with `<provider>:<model-name>` in an Agent file. The [provider guide](../integrations/model-providers.md) shows complete project declarations and custom factories.
