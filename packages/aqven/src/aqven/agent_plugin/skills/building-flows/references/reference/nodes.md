# Node specifications

Generated field reference from the AQVEN Python package.

## Contents

- [LlmNodeSpec](#llmnodespec)
- [CodeNodeSpec](#codenodespec)
- [ToolNodeSpec](#toolnodespec)
- [HumanNodeSpec](#humannodespec)
- [ParallelNodeSpec](#parallelnodespec)
- [MapNodeSpec](#mapnodespec)
- [SwitchNodeSpec](#switchnodespec)
- [SwitchCase](#switchcase)
- [LoopNodeSpec](#loopnodespec)
- [CallNodeSpec](#callnodespec)
- [NarrowNodeSpec](#narrownodespec)

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## LlmNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'llm'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `inference` | `string \| null` | No | `None` | — |
| `agent` | `string` | Yes | `—` | — |
| `in` | `FieldBinding[]` | No | `[]` | — |

JSON Schema

## CodeNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'code'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `run` | `string` | Yes | `—` | — |
| `in` | `InputField[]` | No | `[]` | — |
| `out` | `OutputField[]` | Yes | `—` | minItems=1 |

JSON Schema

## ToolNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'tool'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `tool` | `string` | Yes | `—` | — |
| `in` | `FieldBinding[]` | No | `[]` | — |

JSON Schema

## HumanNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'human'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `form` | `string` | Yes | `—` | — |
| `assignee` | `string` | Yes | `—` | minLength=1 |
| `timeout_seconds` | `integer` | Yes | `—` | minimum=1 |
| `on_timeout` | `TimeoutPolicy` | Yes | `—` | — |
| `in` | `InputField[]` | No | `[]` | — |

JSON Schema

## ParallelNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'parallel'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `body` | `map<string, string>` | Yes | `—` | — |
| `join` | `PolicyRef` | Yes | `—` | — |
| `out` | `BoundField[]` | Yes | `—` | minItems=1 |

JSON Schema

## MapNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'map'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `over` | `string` | Yes | `—` | — |
| `body` | `string` | Yes | `—` | — |
| `concurrency` | `integer \| null` | No | `None` | — |
| `on_item_error` | `PolicyRef` | Yes | `—` | — |
| `out` | `BoundField[]` | Yes | `—` | minItems=1 |

JSON Schema

## SwitchNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'switch'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `on` | `string` | Yes | `—` | — |
| `cases` | `map<string, SwitchCase>` | Yes | `—` | — |
| `out` | `FieldDecl[]` | Yes | `—` | minItems=1 |

JSON Schema

## SwitchCase

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `node` | `string \| null` | No | `None` | — |
| `bind` | `FieldBinding[] \| null` | No | `None` | — |

JSON Schema

## LoopNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'loop'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `body` | `string[]` | Yes | `—` | minItems=1 |
| `init` | `map<string, FieldBinding[]> \| null` | No | `None` | — |
| `max_iter` | `integer` | Yes | `—` | minimum=1, maximum=50 |
| `stop` | `PolicyRef[] \| null` | No | `None` | — |
| `select` | `PolicyRef` | Yes | `—` | — |
| `out` | `BoundField[]` | Yes | `—` | minItems=1 |

JSON Schema

## CallNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'call'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `flow` | `string` | Yes | `—` | — |
| `in` | `FieldBinding[]` | No | `[]` | — |

JSON Schema

## NarrowNodeSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Node'` | Yes | `—` | — |
| `node` | `'narrow'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `limits` | `Limits \| null` | No | `None` | — |
| `from` | `string` | Yes | `—` | — |
| `to` | `string` | Yes | `—` | — |

JSON Schema
