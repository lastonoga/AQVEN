# Fields and bindings

Generated field reference from the AQVEN Python package.

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## BoundField

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `type` | `string` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `maxLength` | `integer \| null` | No | `None` | — |
| `maxItems` | `integer \| null` | No | `None` | — |
| `minimum` | `integer \| number \| null` | No | `None` | — |
| `maximum` | `integer \| number \| null` | No | `None` | — |
| `pattern` | `string \| null` | No | `None` | — |
| `enum` | `string[] \| null` | No | `None` | — |
| `from` | `string` | Yes | `—` | — |
| `value_type` | `string \| null` | No | `None` | — |

JSON Schema

## FieldBinding

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `from` | `string \| null` | No | `None` | — |
| `value` | `JsonValue` | No | `None` | — |

JSON Schema

## FieldDecl

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `type` | `string` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `maxLength` | `integer \| null` | No | `None` | — |
| `maxItems` | `integer \| null` | No | `None` | — |
| `minimum` | `integer \| number \| null` | No | `None` | — |
| `maximum` | `integer \| number \| null` | No | `None` | — |
| `pattern` | `string \| null` | No | `None` | — |
| `enum` | `string[] \| null` | No | `None` | — |

JSON Schema

## FieldHead

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `type` | `string` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |

JSON Schema

## InputField

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `type` | `string` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `maxLength` | `integer \| null` | No | `None` | — |
| `maxItems` | `integer \| null` | No | `None` | — |
| `minimum` | `integer \| number \| null` | No | `None` | — |
| `maximum` | `integer \| number \| null` | No | `None` | — |
| `pattern` | `string \| null` | No | `None` | — |
| `enum` | `string[] \| null` | No | `None` | — |
| `from` | `string \| null` | No | `None` | — |
| `value` | `JsonValue` | No | `None` | — |

JSON Schema

## OutputField

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | `—` | — |
| `type` | `string` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `maxLength` | `integer \| null` | No | `None` | — |
| `maxItems` | `integer \| null` | No | `None` | — |
| `minimum` | `integer \| number \| null` | No | `None` | — |
| `maximum` | `integer \| number \| null` | No | `None` | — |
| `pattern` | `string \| null` | No | `None` | — |
| `enum` | `string[] \| null` | No | `None` | — |
| `schema_from` | `string \| null` | No | `None` | — |
| `limits` | `DynamicLimits \| null` | No | `None` | — |
| `value_type` | `string \| null` | No | `None` | — |

JSON Schema
