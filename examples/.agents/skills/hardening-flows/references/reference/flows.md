# Flow specification

Generated field reference from the AQVEN Python package.

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## FamiliesDistinct

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `rule` | `'families_distinct'` | Yes | `—` | — |
| `nodes` | `string[]` | Yes | `—` | minItems=1 |
| `min` | `integer` | Yes | `—` | minimum=1 |

JSON Schema

## FamilyDisjointFromInput

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `rule` | `'family_disjoint_from_input'` | Yes | `—` | — |
| `nodes` | `string[]` | Yes | `—` | minItems=1 |
| `input` | `string` | Yes | `—` | — |

JSON Schema

## FieldBefore

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `rule` | `'field_before'` | Yes | `—` | — |
| `nodes` | `string[]` | Yes | `—` | minItems=1 |
| `first` | `string` | Yes | `—` | — |
| `second` | `string` | Yes | `—` | — |

JSON Schema

## FlowSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Flow'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `input` | `string` | Yes | `—` | — |
| `output` | `string` | Yes | `—` | — |
| `returns` | `FieldBinding[]` | Yes | `—` | — |
| `context` | `('date' \| 'time_zone' \| 'locale' \| 'tenant_id')[] \| null` | No | `None` | — |
| `limits` | `Limits \| null` | No | `None` | — |
| `order` | `string[]` | Yes | `—` | minItems=1 |
| `requires` | `ContractPredicate[] \| null` | No | `None` | — |

JSON Schema
