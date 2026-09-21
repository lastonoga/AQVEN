---
title: Model Providers
description: Choose catalog, compatible, or custom Pydantic AI model providers.
---

An [agent](/engineering/agents-and-models/) names a model as `<provider>:<model-name>`. The provider prefix is declared in `aqven.yaml`. AQVEN builds the model through Pydantic AI, while the project controls credentials, data policy, and capabilities. The installed package catalog is [generated from provider code](/engineering/reference/provider-catalog/); check it for all current prefixes and optional extras.

## Pick a provider route

| Route | Use when | Required project fields |
| --- | --- | --- |
| `catalog` | The provider is in the installed catalog | `id`, `data_policy`; usually `api_key` |
| `openai_compatible` | The service exposes an OpenAI-compatible chat endpoint | `id`, `base_url`, `data_policy`; `api_key` if the endpoint needs one |
| `code` | You need a custom Pydantic AI `Model` factory | `id`, `run`, `data_policy`; add credentials and `params` as needed |

The `kind` defaults to `catalog`. A provider declaration needs `data_policy` in every route. Declaring a route does not prove a model accepts tools, media, or a given structured-output mode; validate the actual agent model.

## Catalog providers

This project file supports two agents using different providers:

```yaml
apiVersion: "aqven/v1"
kind: "Project"
description: "Customer support workflows"
package: "my_workflow"
providers:
  - id: "openai"
    api_key: "ref:env/OPENAI_API_KEY"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
  - id: "anthropic"
    api_key: "ref:env/ANTHROPIC_API_KEY"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
```

Then, in separate agent files:

```yaml
# agents/answerer.yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Answer questions"
model: "openai:your-model-id"
```

```yaml
# agents/reviewer.yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Review answers"
model: "anthropic:your-model-id"
```

Replace `your-model-id` with a model actually available to your account. The `openai` prefix uses Pydantic AI's OpenAI Responses model; `openai-chat` chooses its Chat Completions model. The model ID after the colon is provider-specific. Some catalog providers need an optional Python extra; the [generated catalog](/engineering/reference/provider-catalog/) records it.

`api_key` is a secret reference such as `ref:env/OPENAI_API_KEY`. Keep the real value in the environment. `data_policy` is the project's declared handling rule, not a discovery of the vendor's current policy; verify the vendor agreement before setting it. `retention` accepts `zero`, `logged`, or `unknown`.

## OpenAI-compatible endpoint

For an internal or local endpoint that implements the OpenAI chat API:

```yaml
providers:
  - id: "local_model"
    kind: "openai_compatible"
    base_url: "http://127.0.0.1:8000/v1"
    api_key: "ref:env/LOCAL_MODEL_KEY"
    capabilities:
      input: ["text"]
      output: ["text"]
      tools: false
      json_schema_output: false
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "zero"
```

Set an agent's `model` to `local_model:<served-model-name>`. AQVEN uses Pydantic AI's OpenAI Chat model for this route. Change `base_url` to move requests to a different endpoint. Set `capabilities` to what that endpoint actually supports; for example, `tools: false` avoids treating tool calls as available. The endpoint still needs to support streaming responses for AQVEN runs.

An OpenAI-compatible wire format does not imply identical behavior for strict JSON schemas, tool calls, usage reports, or media. Use a live model check and representative workflow cases before relying on those capabilities.

## Custom provider factory

Use `kind: "code"` when a catalog or compatible route cannot construct the Pydantic AI model you need. In `aqven.yaml`:

```yaml
providers:
  - id: "company_gateway"
    kind: "code"
    run: "my_workflow.providers:build_model"
    api_key: "ref:env/COMPANY_GATEWAY_KEY"
    base_url: "https://models.example.com/v1"
    params:
      region: "eu"
    capabilities:
      input: ["text"]
      output: ["text"]
      tools: true
      json_schema_output: false
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
```

The referenced synchronous Python function must accept exactly `(model_name: str, context: ProviderContext)` and return a Pydantic AI `Model` that implements streaming. This example wraps an OpenAI-compatible gateway while retaining room for custom construction:

```python
# my_workflow/providers.py
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from {{LLM_PYTHON_MODULE}} import ProviderContext


def build_model(model_name: str, context: ProviderContext) -> Model:
    if context.base_url is None:
        raise ValueError("company_gateway needs base_url")
    provider = OpenAIProvider(
        base_url=context.base_url,
        api_key=context.key,
        http_client=context.http_client,
    )
    return OpenAIChatModel(model_name, provider=provider, settings=context.settings)
```

`context` also contains the provider ID and declared `params`. If you implement your own Pydantic AI `Model` subclass, it must implement `request_stream`; a request-only model is rejected. The factory is checked for its parameter names and type annotations. Keep provider-specific networking inside the factory; the flow still binds inputs and validates outputs in the usual way. The `run` field is a Python `module:function` reference; it is not one of the `@flow` or `@root` aliases used in flow code references.

Installed packages may also register provider factories through the `aqven.providers` entry-point group. This lets a reusable package expose a provider name while the project still declares its data policy.

## Check a provider before a run

```bash
uv run {{CLI_COMMAND}} check .
uv run {{CLI_COMMAND}} models check --project .
uv run {{CLI_COMMAND}} models check --project . --live
```

The non-live check inspects configured agents and output-mode compatibility. `--live` makes small real requests, so it needs valid credentials, a reachable endpoint, and may incur provider charges. You can target one agent or one `provider:model` instead of the whole project. Add `--json` when a script needs structured results.

If a model fails, inspect the exact provider prefix, credential reference, optional extra, endpoint, declared capabilities, and agent `output.mode`. Then run a dataset case that exercises the relevant tool, output schema, or media input. A green model check does not replace a task-level evaluation.

## Fields that alter behavior

| Field | Effect |
| --- | --- |
| `id` | Prefix used by agent model strings. Renaming it requires updating those agents. |
| `kind` | Selects catalog lookup, compatible endpoint, or custom factory. |
| `api_key` | Resolves a secret at runtime. |
| `base_url` | Redirects calls for compatible or custom routes. |
| `run` | Chooses the custom Python factory for `code`. |
| `params` | Passes provider-specific JSON settings to a custom factory. |
| `capabilities` | Declares accepted input/output modalities, tools, and schema output support. |
| `data_policy` | Constrains which data a route may receive. |
| `routing` | Sets OpenRouter data-collection and zero-data-retention preferences when applicable. |

The [generated ProviderSpec reference](/engineering/reference/project/#providerspec) gives exact types, defaults, and required fields. The [agent chapter](/engineering/agents-and-models/) explains output modes, fallbacks, and tool access.
