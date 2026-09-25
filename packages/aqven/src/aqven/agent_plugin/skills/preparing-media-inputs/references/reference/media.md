# Media and dynamic values

Generated field reference from the AQVEN Python package.

## Contents

- [Audio](#audio)
- [Document](#document)
- [DynamicLimits](#dynamiclimits)
- [DynamicValue](#dynamicvalue)
- [FieldSpec](#fieldspec)
- [Image](#image)
- [MapItemError](#mapitemerror)
- [MediaValue](#mediavalue)
- [Video](#video)

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## Audio

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `$media` | `string` | Yes | `—` | maxLength=255, pattern=^audio/[a-z0-9.+-]+$ |
| `blob_id` | `string` | Yes | `—` | pattern=^sha256-[0-9a-f]{64}$ |
| `size_bytes` | `integer` | Yes | `—` | minimum=0 |
| `name` | `string \| null` | Yes | `—` | — |
| `url` | `string \| null` | No | `None` | — |
| `poster_blob_id` | `string \| null` | No | `None` | — |
| `note` | `string \| null` | No | `None` | — |

JSON Schema

## Document

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `$media` | `string` | Yes | `—` | maxLength=255, pattern=^(application\|text)/[a-z0-9.+-]+$ |
| `blob_id` | `string` | Yes | `—` | pattern=^sha256-[0-9a-f]{64}$ |
| `size_bytes` | `integer` | Yes | `—` | minimum=0 |
| `name` | `string \| null` | Yes | `—` | — |
| `url` | `string \| null` | No | `None` | — |
| `poster_blob_id` | `string \| null` | No | `None` | — |
| `note` | `string \| null` | No | `None` | — |

JSON Schema

## DynamicLimits

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `max_fields` | `integer` | Yes | `—` | minimum=1 |
| `max_depth` | `integer` | Yes | `—` | minimum=1, maximum=3 |
| `max_text_length` | `integer` | Yes | `—` | minimum=1 |
| `max_items` | `integer` | Yes | `—` | minimum=1 |

JSON Schema

## DynamicValue

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `value` | `JsonValue` | Yes | `—` | — |
| `fields` | `FieldSpec[]` | Yes | `—` | — |
| `schema_hash` | `string` | Yes | `—` | pattern=^sha256-[0-9a-f]{64}$ |

JSON Schema

## FieldSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |

JSON Schema

## Image

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `$media` | `string` | Yes | `—` | maxLength=255, pattern=^image/[a-z0-9.+-]+$ |
| `blob_id` | `string` | Yes | `—` | pattern=^sha256-[0-9a-f]{64}$ |
| `size_bytes` | `integer` | Yes | `—` | minimum=0 |
| `name` | `string \| null` | Yes | `—` | — |
| `url` | `string \| null` | No | `None` | — |
| `poster_blob_id` | `string \| null` | No | `None` | — |
| `note` | `string \| null` | No | `None` | — |

JSON Schema

## MapItemError

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `index` | `integer` | Yes | `—` | minimum=0 |
| `code` | `string` | Yes | `—` | maxLength=64 |
| `message` | `string` | Yes | `—` | maxLength=400 |

JSON Schema

## MediaValue

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `$media` | `string` | Yes | `—` | minLength=3, maxLength=255, pattern=^[a-z]+/[a-z0-9.+-]+$ |
| `blob_id` | `string` | Yes | `—` | pattern=^sha256-[0-9a-f]{64}$ |
| `size_bytes` | `integer` | Yes | `—` | minimum=0 |
| `name` | `string \| null` | Yes | `—` | — |
| `url` | `string \| null` | No | `None` | — |
| `poster_blob_id` | `string \| null` | No | `None` | — |
| `note` | `string \| null` | No | `None` | — |

JSON Schema

## Video

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `$media` | `string` | Yes | `—` | maxLength=255, pattern=^video/[a-z0-9.+-]+$ |
| `blob_id` | `string` | Yes | `—` | pattern=^sha256-[0-9a-f]{64}$ |
| `size_bytes` | `integer` | Yes | `—` | minimum=0 |
| `name` | `string \| null` | Yes | `—` | — |
| `url` | `string \| null` | No | `None` | — |
| `poster_blob_id` | `string \| null` | No | `None` | — |
| `note` | `string \| null` | No | `None` | — |

JSON Schema
