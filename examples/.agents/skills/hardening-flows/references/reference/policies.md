# Policies and limits

Generated field reference from the AQVEN Python package.

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## EvaluatorRef

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `use` | `string \| null` | No | `None` | — |
| `run` | `string \| null` | No | `None` | — |
| `inference` | `string \| null` | No | `None` | — |
| `agent` | `string \| null` | No | `None` | — |
| `with` | `map<string, JsonValue> \| null` | No | `None` | — |

JSON Schema

## PolicyRef

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `use` | `string \| null` | No | `None` | — |
| `run` | `string \| null` | No | `None` | — |
| `with` | `map<string, JsonValue> \| null` | No | `None` | — |

JSON Schema
