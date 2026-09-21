---
title: Project Configuration
description: Configure providers, data policy, secrets, and project-wide limits.
---

The directory containing `aqven.yaml` is the project root. Studio, the CLI, and Python `Project.load()` all use this project. The project file declares which Python package owns the workflows and how model providers may handle data.

## A complete project file

```yaml
apiVersion: "aqven/v1"
kind: "Project"
description: "Question answering workflows"
package: "my_workflow"
providers:
  - id: "openrouter"
    api_key: "ref:env/OPENROUTER_API_KEY"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
policies:
  pii:
    mask_in_traces: true
    redact: ["email", "phone"]
  trust:
    default_in: "untrusted"
limits:
  requests: 20
  usd_micros: 2000000
```

The `package` must name the Python module that contains the project. A provider ID is the prefix of an agent's `model`, such as `openrouter:openai/gpt-oss-20b`. The key reference reads the credential from the environment. Do not put a real key in YAML.

## Choose a provider source

`kind` defaults to `catalog`, for a provider supported by AQVEN's installed model layer. A custom provider can be declared with `kind: "code"` and a `run` factory. An OpenAI-compatible endpoint uses `kind: "openai_compatible"` and needs `base_url`:

```yaml
providers:
  - id: "internal_api"
    kind: "openai_compatible"
    base_url: "http://127.0.0.1:8000/v1"
    api_key: "ref:env/INTERNAL_MODEL_KEY"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "zero"
```

Changing a provider ID changes every agent model string that uses it. Changing the endpoint or data policy changes where data may go. Check provider readiness and the model's output capabilities before a live run:

```bash
uv run {{CLI_COMMAND}} check .
uv run {{CLI_COMMAND}} models check --project .
```

## Declare data handling

Every provider needs `data_policy`: `allows_pii`, `allows_sensitive`, and `retention` (`zero`, `logged`, or `unknown`). Project `policies.pii` controls trace masking and detectors; `policies.trust.default_in` marks default incoming data as `trusted` or `untrusted`. These settings are part of the workflow's data contract. Tightening a policy can block a previously allowed model route; loosening one may permit new data exposure. Review the actual provider's policy before changing it.

## Set project limits

`limits` is an overall budget using the same fields as flow and node limits: `requests`, `tool_calls`, `tokens`, `usd_micros`, and `seconds`. A lower project limit can stop any flow in the project. Use flow or node limits for tighter local budgets. [Flows](/engineering/flows/#set-a-budget) shows how those limits affect a workflow.

## Track renames

`renames` records a moved or renamed flow, node, type, prompt, dataset, evaluation, field, inference, agent, tool, or MCP server. Each entry has `kind`, `from`, `to`, and an `at` timestamp. Keep this history when changing identifiers used by stored runs or external callers. The generated [Project reference](/engineering/reference/project/) lists every accepted field and nested provider/policy shape.
