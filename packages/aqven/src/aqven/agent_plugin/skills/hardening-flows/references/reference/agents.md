# Agent specification

Generated field reference from the AQVEN Python package.

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## AgentOutputSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `mode` | `'auto' \| 'tool' \| 'native' \| 'prompted'` | No | `'auto'` | — |
| `strict` | `boolean` | No | `True` | — |
| `retries` | `integer` | No | `1` | minimum=0, maximum=5 |
| `on_error` | `'fail' \| 'retry' \| 'fallback'` | No | `'retry'` | — |
| `on_refusal` | `'fail' \| 'retry' \| 'fallback'` | No | `'fail'` | — |
| `on_truncated` | `'fail' \| 'retry' \| 'fallback'` | No | `'fail'` | — |

JSON Schema

## AgentSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Agent'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `model` | `ModelField` | Yes | `—` | — |
| `fallback_models` | `ModelField[] \| null` | No | `None` | — |
| `settings` | `ModelSettingsSpec \| null` | No | `None` | — |
| `output` | `AgentOutputSpec` | No | `not set` | — |
| `instructions` | `string \| null` | No | `None` | — |
| `tools` | `string[] \| null` | No | `None` | — |
| `mcp_servers` | `string[] \| null` | No | `None` | — |
| `subagents` | `SubagentSpec[] \| null` | No | `None` | — |
| `approval` | `ToolApprovalSpec \| null` | No | `None` | — |
| `limits` | `Limits \| null` | No | `None` | — |

JSON Schema

## DefaultOnTimeout

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `policy` | `'default'` | Yes | `—` | — |
| `value` | `JsonValue` | Yes | `—` | — |

JSON Schema

## EscalateOnTimeout

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `policy` | `'escalate'` | Yes | `—` | — |
| `assignee` | `string` | Yes | `—` | minLength=1 |
| `timeout_seconds` | `integer` | Yes | `—` | minimum=1 |

JSON Schema

## FailOnTimeout

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `policy` | `'fail'` | Yes | `—` | — |

JSON Schema

## ModelSettingsSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `temperature` | `number \| null` | No | `None` | — |
| `top_p` | `number \| null` | No | `None` | — |
| `max_tokens` | `integer \| null` | No | `None` | — |
| `seed` | `integer \| null` | No | `None` | — |
| `provider_options` | `map<string, JsonValue> \| null` | No | `None` | — |

JSON Schema

## SubagentSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `agent` | `string` | Yes | `—` | — |
| `inference` | `string` | Yes | `—` | — |

JSON Schema

## ToolApprovalSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `tools` | `string[]` | Yes | `—` | minItems=1 |
| `assignee` | `string` | Yes | `—` | minLength=1 |
| `timeout_seconds` | `integer` | Yes | `—` | minimum=1 |
| `on_timeout` | `TimeoutPolicy` | Yes | `—` | — |

JSON Schema
