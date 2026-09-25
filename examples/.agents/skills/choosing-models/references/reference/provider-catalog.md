# Provider catalog

Generated catalog of model providers in the installed Python package.

These providers come from `aqven_llm.catalog.PROVIDERS`. The key column names the default environment variable; project `api_key` may point to another environment variable. A provider's presence in the catalog does not guarantee that a particular model supports every modality or output mode. Use `aqven models check --project .` and `--live` when a real request is needed.

| Provider prefix | Pydantic AI model class | Default key variable | Required | Extra |
| --- | --- | --- | --- | --- |
| `openai` | `pydantic_ai.models.openai.OpenAIResponsesModel` | `OPENAI_API_KEY` | Yes | `—` |
| `openai-chat` | `pydantic_ai.models.openai.OpenAIChatModel` | `OPENAI_API_KEY` | Yes | `—` |
| `openai-responses` | `pydantic_ai.models.openai.OpenAIResponsesModel` | `OPENAI_API_KEY` | Yes | `—` |
| `openrouter` | `pydantic_ai.models.openrouter.OpenRouterModel` | `OPENROUTER_API_KEY` | Yes | `—` |
| `deepseek` | `pydantic_ai.models.openai.OpenAIChatModel` | `DEEPSEEK_API_KEY` | Yes | `—` |
| `together` | `pydantic_ai.models.openai.OpenAIChatModel` | `TOGETHER_API_KEY` | Yes | `—` |
| `fireworks` | `pydantic_ai.models.openai.OpenAIChatModel` | `FIREWORKS_API_KEY` | Yes | `—` |
| `moonshotai` | `pydantic_ai.models.openai.OpenAIChatModel` | `MOONSHOTAI_API_KEY` | Yes | `—` |
| `nebius` | `pydantic_ai.models.openai.OpenAIChatModel` | `NEBIUS_API_KEY` | Yes | `—` |
| `ovhcloud` | `pydantic_ai.models.openai.OpenAIChatModel` | `OVHCLOUD_API_KEY` | Yes | `—` |
| `alibaba` | `pydantic_ai.models.openai.OpenAIChatModel` | `ALIBABA_API_KEY` | Yes | `—` |
| `sambanova` | `pydantic_ai.models.openai.OpenAIChatModel` | `SAMBANOVA_API_KEY` | Yes | `—` |
| `vercel` | `pydantic_ai.models.openai.OpenAIChatModel` | `VERCEL_AI_GATEWAY_API_KEY` | Yes | `—` |
| `heroku` | `pydantic_ai.models.openai.OpenAIChatModel` | `HEROKU_INFERENCE_KEY` | Yes | `—` |
| `litellm` | `pydantic_ai.models.openai.OpenAIChatModel` | `—` | No | `—` |
| `vllm` | `pydantic_ai.models.openai.OpenAIChatModel` | `VLLM_API_KEY` | No | `—` |
| `ollama` | `pydantic_ai.models.ollama.OllamaModel` | `OLLAMA_API_KEY` | No | `—` |
| `cerebras` | `pydantic_ai.models.cerebras.CerebrasModel` | `CEREBRAS_API_KEY` | Yes | `—` |
| `crusoe` | `pydantic_ai.models.crusoe.CrusoeModel` | `CRUSOE_API_KEY` | Yes | `—` |
| `zai` | `pydantic_ai.models.zai.ZaiModel` | `ZAI_API_KEY` | Yes | `—` |
| `anthropic` | `pydantic_ai.models.anthropic.AnthropicModel` | `ANTHROPIC_API_KEY` | Yes | `anthropic` |
| `google` | `pydantic_ai.models.google.GoogleModel` | `GOOGLE_API_KEY` | Yes | `google` |
| `groq` | `pydantic_ai.models.groq.GroqModel` | `GROQ_API_KEY` | Yes | `groq` |
| `mistral` | `pydantic_ai.models.mistral.MistralModel` | `MISTRAL_API_KEY` | Yes | `mistral` |
| `cohere` | `pydantic_ai.models.cohere.CohereModel` | `CO_API_KEY` | Yes | `cohere` |
| `bedrock` | `pydantic_ai.models.bedrock.BedrockConverseModel` | `—` | No | `bedrock` |
| `huggingface` | `pydantic_ai.models.huggingface.HuggingFaceModel` | `HF_TOKEN` | Yes | `huggingface` |
| `xai` | `pydantic_ai.models.xai.XaiModel` | `XAI_API_KEY` | Yes | `xai` |

Choose a model with `<provider>:<model-name>` in an Agent file. The [provider guide](../integrations/model-providers.md) shows complete project declarations and custom factories.
