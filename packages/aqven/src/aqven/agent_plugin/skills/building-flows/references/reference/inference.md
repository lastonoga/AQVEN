# Inference specification

Generated field reference from the AQVEN Python package.

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## AllowedSetSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `type` | `string` | Yes | `—` | — |
| `from` | `string` | Yes | `—` | — |
| `labels_from` | `string \| null` | No | `None` | — |

JSON Schema

## CheckSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `use` | `string \| null` | No | `None` | — |
| `run` | `string \| null` | No | `None` | — |
| `inference` | `string \| null` | No | `None` | — |
| `agent` | `string \| null` | No | `None` | — |
| `with` | `map<string, JsonValue> \| null` | No | `None` | — |
| `on_fail` | `'retry' \| 'fail' \| 'flag'` | Yes | `—` | — |
| `threshold` | `number \| null` | No | `None` | — |

JSON Schema

## DisplayFormatterSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `run` | `string \| null` | No | `None` | — |
| `template` | `string \| null` | No | `None` | — |
| `variables` | `map<string, DisplayVariableRef>` | No | `{}` | — |

JSON Schema

## ExampleSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `in` | `map<string, JsonValue>` | Yes | `—` | — |
| `out` | `map<string, JsonValue>` | Yes | `—` | — |

JSON Schema

## InferenceDisplaySpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `input` | `DisplayFormatterSpec \| null` | No | `None` | — |
| `output` | `DisplayFormatterSpec \| null` | No | `None` | — |

JSON Schema

## InferenceSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Inference'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `in` | `FieldDecl[]` | No | `[]` | — |
| `out` | `OutputField[]` | Yes | `—` | minItems=1 |
| `prompt` | `string \| null` | No | `None` | — |
| `variants` | `map<string, VariantSlot> \| null` | No | `None` | — |
| `allowed_sets` | `AllowedSetSpec[] \| null` | No | `None` | — |
| `examples` | `ExampleSpec[] \| null` | No | `None` | — |
| `checks` | `CheckSpec[] \| null` | No | `None` | — |
| `display` | `InferenceDisplaySpec \| null` | No | `None` | — |

JSON Schema

## VariantSlot

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `on` | `string` | Yes | `—` | — |
| `cases` | `map<string, VariantRef>` | Yes | `—` | — |
| `default` | `VariantRef \| null` | No | `None` | — |

JSON Schema
